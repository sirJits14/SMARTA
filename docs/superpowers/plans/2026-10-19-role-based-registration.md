# Role-based Registration and Advisory Slips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New Parent App accounts pick Family Member, Class Adviser and/or Subject Teacher before linking anything; DepEd advisers become advisers instantly with a single-use advisory slip that SIMS staff print from the Sections page; Subject Teachers become grade-level.

**Architecture:** Shared rules (`shared/schoolAccess.js`) gain the Adviser/Subject Teacher exclusion and wider Curriculum Adviser approval. A new `advisory_slips` collection with its own callables (`functions/src/handlers/advisorySlips.js`) reuses the grant and lock helpers of `functions/src/handlers/schoolAccess.js`. SIMS adds an Adviser status line and slip actions to `SectionsPage`. The Parent App replaces `Activate.jsx` with a `/join` flow whose rules are pure functions in `parent/src/lib/join.js`.

**Tech Stack:** React 19 + Vite 8 (SIMS at repo root, Parent App in `parent/`), Firebase Functions v2 (Node 22), Firestore, Vitest 4, Firebase emulators, `qrcode` (SIMS), `jsqr` (Parent App).

**Spec:** `docs/superpowers/specs/2026-10-19-role-based-registration-design.md`

## Global Constraints

- School year format `YYYY-YYYY`; grades are integers 7–12.
- DepEd email test is `isDepedEmail` from `shared/schoolAccess.js` (`/@deped\.gov\.ph$/i`), never a new regex.
- Advisory slip codes: 8-character Crockford base32 from `functions/src/lib/activationCode.js`; only `hashCode(code)` is stored; QR payload `${PORTAL_URL}/activate?a=CODE`.
- Generic advisory-slip failure message: `That advisory slip could not be used. Ask the school to issue a new one.`
- DepEd refusal message: `Advisory slips need a DepEd email. Request the role instead.`
- `LIMITS.advisorySlip = { windowMs: 60 * 60 * 1000, max: 10 }`, shared by preview and redeem.
- Adviser and Subject Teacher exclude each other within one school year (active assignments and pending requests). Family links are unaffected.
- Curriculum Advisers approve `adviser` and `subject_teacher` requests from any verified email in their own grades; nobody approves their own.
- Parent App copy lives only in `parent/src/strings.js`; no value may contain `location`, `tracking` or `live` (enforced by `parent/src/lib/strings.test.js`). Watch for words like "deliver".
- `.jsx` files under `src/` and `parent/src/` must not contain hex colours or white rgba (enforced by `shared/theme/literals.test.js`); print colours live in `.js` layout files.
- Firestore rules deny all client access to `advisory_slips`.
- Never commit `.env` files; never `npm install` inside the worktree.

---

## File map

| File | Responsibility |
| --- | --- |
| `shared/schoolAccess.js` (modify) | `GRADE_ROLES`, `isGradeRole`, `conflictingRole`, `canHold`; wider `canApproveRoleRequest` |
| `shared/announcementAudience.js` (modify) | Grade-level Subject Teachers match section-limited notices |
| `functions/src/handlers/schoolAccess.js` (modify) | Grade-level Subject Teacher, auto-grant, exclusion checks, exported helpers |
| `functions/src/handlers/advisorySlips.js` (create) | Issue, revoke, list status, preview, redeem |
| `functions/src/lib/subjectTeacherMigration.js` (create) | Pure conversion of section-based Subject Teacher assignments |
| `functions/src/handlers/schoolMigration.js` (create) | `migrateSubjectTeachers` admin callable |
| `functions/src/handlers/schoolYear.js` (modify) | End of year revokes advisory slips |
| `functions/src/callable.js` (modify) | `LIMITS.advisorySlip` |
| `functions/index.js` (modify) | Exports the new callables |
| `firestore.rules` (modify) | Deny `advisory_slips` |
| `src/lib/access.js` (modify) | `canIssueAdvisorySlip` |
| `src/lib/advisoryStatus.js` (create) | Status text, candidates, confirm copy |
| `src/lib/advisorySlipLayout.js` (create) | Advisory slip URL, copy, print CSS |
| `src/components/AdvisorySlipsPrintable.jsx` (create) | Printable advisory slip sheets |
| `src/pages/sections/AdvisorySlipsPanel.jsx` (create) | Print controls and sheets after issuing |
| `src/data/advisorySlips.js` (create) | Callable wrappers |
| `src/hooks/useAdvisoryStatus.js` (create) | Loads status per section |
| `src/pages/SectionsPage.jsx` (modify) | Adviser status line, slip actions |
| `src/lib/schoolAssignments.js`, `src/pages/guardians/school/*` (modify) | Grade-level Subject Teachers in Coverage, Assign, Pending, History |
| `parent/src/lib/qrScan.js` (modify) | `readSlip` |
| `parent/src/components/ScanSheet.jsx` (modify) | Reports slip kind |
| `parent/src/hooks/useScanSheet.js` (create) | Lazy scanner loading |
| `parent/src/lib/join.js` (create) | Chooser rules, steps, landing mode, code input helpers |
| `parent/src/lib/school.js` (modify) | `scopeLabel`, new request statuses |
| `parent/src/strings.js` (modify) | Join copy |
| `parent/src/screens/Join.jsx` + `parent/src/screens/join/*` (create) | The flow |
| `parent/src/App.jsx`, `parent/src/lib/router.js` (modify) | `/join` routing and gate |
| `parent/src/screens/Activate.jsx` (delete) | Replaced by Join |
| `parent/src/screens/Settings.jsx`, `settings/SchoolAccessPage.jsx`, `settings/SchoolRequestsPage.jsx`, `Home.jsx`, `settings/LearnersPage.jsx` (modify) | Entry points and labels |

---

### Task 0: Prepare the worktree for tests

**Files:** none tracked (all three paths are gitignored).

- [ ] **Step 1: Junction the dependency folders to the main checkout**

Run in PowerShell from the worktree root:

```powershell
$main = (Resolve-Path ..\..\..).Path
foreach ($p in @('node_modules','functions\node_modules','parent\node_modules')) {
  if (Test-Path $p) { Remove-Item $p -Recurse -Force -Confirm:$false }
  New-Item -ItemType Junction -Path $p -Target (Join-Path $main $p) | Out-Null
}
```

- [ ] **Step 2: Confirm the three suites start**

Run: `npx vitest run shared/schoolAccess.test.js` then `npm --prefix parent test -- lib/router.test.js` then `npm --prefix functions test -- src/lib/activationCode.test.js`
Expected: all PASS.

---

### Task 1: Shared role rules

**Files:**
- Modify: `shared/schoolAccess.js`
- Test: `shared/schoolAccess.test.js`

**Interfaces:**
- Produces: `GRADE_ROLES: string[]`, `isGradeRole(role): boolean`, `conflictingRole(roles: string[], role: string): string|null`, `canHold(roles, role): boolean`; `canApproveRoleRequest` with wider Curriculum Adviser rights.

- [ ] **Step 1: Write the failing tests**

In `shared/schoolAccess.test.js`, change the import line to:

```js
import { canReviewSection, canCorrectSession, canApproveRoleRequest, isFamilyLink, assignmentKey, isDepedEmail, REQUESTABLE_ROLES, GRADE_ROLES, isGradeRole, conflictingRole, canHold } from './schoolAccess.js';
```

Replace the test `allows only administrators to approve role requests, never self approval` with:

```js
  it('lets administrators approve anything and Curriculum Advisers approve teacher requests in their grades', () => {
    const request = { uid: 'teacher', email: 'teacher@deped.gov.ph', emailVerified: true, role: 'adviser', gradeLevel: 7, schoolYear: year, status: 'pending' };
    const admin = { uid: 'actor', schoolYear: year, isAdmin: true, assignments: [] };
    expect(canApproveRoleRequest(admin, request)).toBe(true);
    expect(canApproveRoleRequest(admin, { ...request, email: 'teacher@gmail.com' })).toBe(true);
    for (const patch of [{ uid: 'actor' }, { schoolYear: '2025-2026' }, { status: 'approved' }]) {
      expect(canApproveRoleRequest(admin, { ...request, ...patch })).toBe(false);
    }
    const curriculum = actor('curriculum_adviser');
    for (const patch of [{}, { email: 'teacher@gmail.com' }, { role: 'subject_teacher' }, { role: 'subject_teacher', email: 'teacher@gmail.com' }]) {
      expect(canApproveRoleRequest(curriculum, { ...request, ...patch })).toBe(true);
    }
    for (const patch of [{ emailVerified: false }, { gradeLevel: 8 }, { role: 'curriculum_adviser' }, { uid: 'actor' }]) {
      expect(canApproveRoleRequest(curriculum, { ...request, ...patch })).toBe(false);
    }
    for (const role of ['adviser', 'subject_teacher']) expect(canApproveRoleRequest(actor(role), request)).toBe(false);
    expect(canApproveRoleRequest(actor('curriculum_adviser', { schoolYear: '2027-2028' }), request)).toBe(false);
  });
  it('keeps Adviser and Subject Teacher apart and leaves other roles free', () => {
    expect(GRADE_ROLES).toEqual(['curriculum_adviser', 'subject_teacher']);
    expect(isGradeRole('subject_teacher')).toBe(true);
    expect(isGradeRole('adviser')).toBe(false);
    expect(conflictingRole(['adviser'], 'subject_teacher')).toBe('adviser');
    expect(conflictingRole(['subject_teacher'], 'adviser')).toBe('subject_teacher');
    expect(conflictingRole(['adviser'], 'adviser')).toBeNull();
    expect(conflictingRole(['curriculum_adviser', 'family'], 'adviser')).toBeNull();
    expect(canHold(['subject_teacher'], 'curriculum_adviser')).toBe(true);
    expect(canHold(['subject_teacher'], 'adviser')).toBe(false);
    expect(canHold([], 'family')).toBe(true);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run shared/schoolAccess.test.js`
Expected: FAIL — `GRADE_ROLES` is undefined and the Curriculum Adviser personal-email case returns false.

- [ ] **Step 3: Implement**

In `shared/schoolAccess.js`, after the `REQUESTABLE_ROLES` line add:

```js
// Curriculum Adviser and Subject Teacher are held per grade; Class Adviser per section.
export const GRADE_ROLES = ['curriculum_adviser', 'subject_teacher'];
export const isGradeRole = role => GRADE_ROLES.includes(role);
// Within one school year a teacher is a Class Adviser or a Subject Teacher, never both.
const EXCLUSIVE = { adviser: 'subject_teacher', subject_teacher: 'adviser' };
export const conflictingRole = (roles, role) => (EXCLUSIVE[role] && (roles || []).includes(EXCLUSIVE[role]) ? EXCLUSIVE[role] : null);
export const canHold = (roles, role) => !conflictingRole(roles, role);
```

Replace `canApproveRoleRequest` and its comment with:

```js
// Administrators approve any request. A Curriculum Adviser approves adviser and
// subject-teacher requests from verified accounts in a grade they are assigned to.
export function canApproveRoleRequest(actor, request) {
  if (!actor || request?.status !== 'pending' || actor.uid === request.uid || request.schoolYear !== actor.schoolYear) return false;
  if (actor.isAdmin === true) return true;
  return REQUESTABLE_ROLES.includes(request.role) && request.emailVerified === true
    && currentAssignments(actor).some(a => a.role === 'curriculum_adviser' && a.gradeLevel === request.gradeLevel);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run shared/schoolAccess.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/schoolAccess.js shared/schoolAccess.test.js
git commit -m "Keep Adviser and Subject Teacher apart and widen Curriculum Adviser approval"
```

---

### Task 2: Grade-level Subject Teachers receive notices

**Files:**
- Modify: `shared/announcementAudience.js`
- Test: `shared/announcementAudience.test.js`

**Interfaces:**
- Consumes: `isGradeRole` from Task 1.

- [ ] **Step 1: Write the failing test**

Append inside the `describe` block of `shared/announcementAudience.test.js`:

```js
  it('reaches grade-level subject teachers for their grade and for sections in it', () => {
    const teacher = { ...person, assignments: [{ role: 'subject_teacher', schoolYear: year, gradeLevel: 7 }] };
    expect(matchesAnnouncementAudience({ roles: ['subject_teacher'], grades: [7] }, teacher, 'school')).toBe(true);
    expect(matchesAnnouncementAudience({ roles: ['subject_teacher'], grades: [8] }, teacher, 'school')).toBe(false);
    expect(matchesAnnouncementAudience({ roles: ['subject_teacher'], all: true, sectionIds: ['s7'] }, teacher, 'school')).toBe(true);
    expect(matchesAnnouncementAudience({ roles: ['subject_teacher'], all: true, sectionIds: ['s8'] }, teacher, 'school')).toBe(false);
    expect(matchesAnnouncementAudience({ roles: ['adviser'], grades: [7] }, teacher, 'school')).toBe(false);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run shared/announcementAudience.test.js`
Expected: FAIL on the `sectionIds: ['s7']` case (returns false).

- [ ] **Step 3: Implement**

At the top of `shared/announcementAudience.js` add:

```js
import { isGradeRole } from './schoolAccess.js';
```

In `sectionMatches`, replace `: entitlement.role === 'curriculum_adviser' && (person.sections || [])` with:

```js
    : isGradeRole(entitlement.role) && (person.sections || [])
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run shared/announcementAudience.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/announcementAudience.js shared/announcementAudience.test.js
git commit -m "Send section-limited notices to grade-level Subject Teachers"
```

---

### Task 3: Grade-level Subject Teacher, auto-grant and the exclusion rule on the server

**Files:**
- Modify: `functions/src/handlers/schoolAccess.js`
- Test: `functions/test/emulator/schoolAccess.test.js`

**Interfaces:**
- Consumes: `isGradeRole`, `conflictingRole`, `SCHOOL_ROLE_LABELS`, `isDepedEmail` from `shared/schoolAccess.js`.
- Produces (exported for Tasks 5 and 6): `liveUser(auth, uid)`, `prepareGrant(db, tx, uid, assignment)`, `writeGrant(tx, prepared, actor, user, assignment, source) → assignments[]`, `inboxRef(db, uid, key)`, `auditRow(actor, action, targetId, details)`, `teacherOf(person)`, `requestKey(uid, assignment)`, `rolesHeld(assignments, pendingDocs, schoolYear) → string[]`, `assertCanHold(roles, role)`.
- `requestSchoolRole(deps, { role: 'subject_teacher', gradeLevels: number[] })` returns `{ status: 'granted', count }` for DepEd accounts, else `{ status: 'pending', id, ids }`. Adviser requests keep `{ role: 'adviser', sectionId }` → `{ status: 'pending', id, ids }`.

- [ ] **Step 1: Update the existing tests that the exclusion rule changes, and add new ones**

In `functions/test/emulator/schoolAccess.test.js`:

1. Add a user to `users`:

```js
  other: { uid: 'other', email: 'other@gmail.com', emailVerified: true, displayName: 'Other' },
```

2. Replace the test `keeps subject-teacher requests with administrators` with:

```js
  it('lets a Curriculum Adviser approve an in-grade subject-teacher request from a personal email', async () => {
    const r = await seedRequest('personal', 'subject_teacher', 'SEC1');
    await db().doc(`school_role_requests/${r.id}`).update({ sectionId: FieldValue.delete() });
    await resolveSchoolRole(deps('curriculum'), { requestId: r.id, approve: true });
    expect((await loadSchoolActor(deps('personal'))).assignments).toMatchObject([{ role: 'subject_teacher', gradeLevel: 7, source: 'request' }]);
  });
```

and add `import { FieldValue } from 'firebase-admin/firestore';` to the imports.

3. Replace the test `requires an administrator for personal-email requests` with:

```js
  it('lets a Curriculum Adviser approve a personal-email adviser request in their grade', async () => {
    const r = await seedRequest('personal', 'adviser', 'SEC1');
    await resolveSchoolRole(deps('curriculum'), { requestId: r.id, approve: true });
    expect((await loadSchoolActor(deps('personal'))).assignments).toMatchObject([{ role: 'adviser', sectionId: 'SEC1' }]);
  });
```

4. In `stamps direct and legacy assignments with who and how`, replace the second `assignSchoolRole` call with:

```js
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'curriculum_adviser', gradeLevel: 8 });
```

5. In `lets a teacher withdraw only their own pending request`, replace `{ role: 'subject_teacher', sectionId: 'SEC1' }` with `{ role: 'adviser', sectionId: 'SEC1' }`.

6. In `bulk approval reports each request and never stops at a failure`, replace the `clean` line with:

```js
    const clean = await requestSchoolRole(deps('other'), { role: 'subject_teacher', gradeLevels: [7] });
```

7. Replace the body of `gives each audience its own queue, with conflicts named` with:

```js
    await assignSchoolRole(deps('admin'), { email: users.personal.email, role: 'adviser', sectionId: 'SEC1' });
    const inGrade = await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC1' });
    await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC8' });
    const subject = await requestSchoolRole(deps('other'), { role: 'subject_teacher', gradeLevels: [7] });
    const admin = await getSchoolContext(deps('admin'));
    expect(admin.pendingRequests).toHaveLength(3);
    expect(admin.pendingRequests.find(r => r.id === inGrade.id).conflict).toEqual({ uid: 'personal', email: 'teacher@gmail.com', displayName: 'teacher@gmail.com' });
    const curriculum = await getSchoolContext(deps('curriculum'));
    expect(curriculum.reviewQueue.map(r => r.id).sort()).toEqual([inGrade.id, subject.id].sort());
    expect(curriculum).not.toHaveProperty('pendingRequests');
    const teacher = await getSchoolContext(deps('teacher'));
    expect(teacher.myRequests.map(r => r.status)).toEqual(['pending', 'pending']);
    expect(teacher).not.toHaveProperty('reviewQueue');
    expect(teacher).not.toHaveProperty('pendingRequests');
```

8. Add a new `describe` block at the end of the file:

```js
describe('grade-level subject teachers and the exclusion rule', () => {
  it('grants DepEd subject teachers their grades at once', async () => {
    const result = await requestSchoolRole(deps('teacher'), { role: 'subject_teacher', gradeLevels: [8, 7, 7] });
    expect(result).toEqual({ status: 'granted', count: 2 });
    const assignments = (await loadSchoolActor(deps('teacher'))).assignments;
    expect(assignments).toHaveLength(2);
    expect(assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'subject_teacher', gradeLevel: 8, source: 'self', assignedBy: 'teacher@deped.gov.ph' }),
      expect.objectContaining({ role: 'subject_teacher', gradeLevel: 7, source: 'self' })]));
    expect(assignments.every(a => a.sectionId === undefined)).toBe(true);
    expect((await db().collection('school_role_requests').get()).size).toBe(0);
    await expect(requestSchoolRole(deps('teacher'), { role: 'subject_teacher', gradeLevels: [7] })).rejects.toMatchObject({ code: 'already-exists' });
  });
  it('sends one request per grade for personal emails', async () => {
    const result = await requestSchoolRole(deps('personal'), { role: 'subject_teacher', gradeLevels: [7, 8] });
    expect(result.status).toBe('pending');
    expect(result.ids).toHaveLength(2);
    const rows = (await db().collection('school_role_requests').get()).docs.map(d => d.data());
    expect(rows.map(r => r.gradeLevel).sort()).toEqual([7, 8]);
    expect(rows.every(r => r.sectionId === undefined && r.role === 'subject_teacher')).toBe(true);
    expect((await loadSchoolActor(deps('personal'))).assignments).toEqual([]);
  });
  it('stores a section-based subject-teacher call as that section\'s grade', async () => {
    await requestSchoolRole(deps('teacher'), { role: 'subject_teacher', sectionId: 'SEC8' });
    expect((await loadSchoolActor(deps('teacher'))).assignments).toMatchObject([{ role: 'subject_teacher', gradeLevel: 8 }]);
  });
  it('rejects bad grade lists', async () => {
    for (const gradeLevels of [[], [6], [13], ['7'], [7, 8, 9, 10, 11, 12, 7.5]]) {
      await expect(requestSchoolRole(deps('teacher'), { role: 'subject_teacher', gradeLevels })).rejects.toMatchObject({ code: 'invalid-argument' });
    }
  });
  it('never lets one account be Adviser and Subject Teacher in the same year', async () => {
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1' });
    await expect(requestSchoolRole(deps('teacher'), { role: 'subject_teacher', gradeLevels: [7] })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'subject_teacher', gradeLevel: 8 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await requestSchoolRole(deps('personal'), { role: 'subject_teacher', gradeLevels: [8] });
    await expect(requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC8' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('refuses to approve a request that would combine the two roles', async () => {
    const r = await seedRequest('teacher', 'adviser', 'SEC8');
    await db().doc('school_accounts/teacher').set({ assignments: [{ role: 'subject_teacher', schoolYear: year, gradeLevel: 7 }] }, { merge: true });
    await expect(resolveSchoolRole(deps('admin'), { requestId: r.id, approve: true })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('revokes a grade-level subject teacher by grade', async () => {
    await requestSchoolRole(deps('teacher'), { role: 'subject_teacher', gradeLevels: [7, 8] });
    await revokeSchoolRole(deps('admin'), { uid: 'teacher', role: 'subject_teacher', gradeLevel: 7, reason: 'Moved' });
    expect((await loadSchoolActor(deps('teacher'))).assignments).toMatchObject([{ role: 'subject_teacher', gradeLevel: 8 }]);
  });
});
```

- [ ] **Step 2: Run the file to verify the new tests fail**

Run: `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/schoolAccess.test.js"`
Expected: FAIL — `gradeLevels` is ignored, there is no exclusion check and no auto-grant.

- [ ] **Step 3: Implement**

In `functions/src/handlers/schoolAccess.js`:

1. Replace the shared import line with:

```js
import { SCHOOL_ROLES, SCHOOL_ROLE_LABELS, REQUESTABLE_ROLES, assignmentKey, canApproveRoleRequest, conflictingRole, isDepedEmail, isGradeRole } from '../../shared/schoolAccess.js';
```

2. Export the helpers by adding `export` in front of: `const requestKey`, `const teacherOf`, `const inboxRef`, `const auditRow`, `async function liveUser`, `async function prepareGrant`, `function writeGrant`. (Change `const x = ...` to `export const x = ...` and `function` to `export function`.)

3. After the `auditRow` definition add:

```js
// Roles an account holds or has asked for in this school year; the
// Adviser/Subject Teacher exclusion counts both.
export const rolesHeld = (assignments, pendingDocs, schoolYear) => [
  ...assignments.filter(a => a.schoolYear === schoolYear).map(a => a.role),
  ...pendingDocs.map(d => d.data()).filter(r => r.schoolYear === schoolYear).map(r => r.role),
];
export function assertCanHold(roles, role) {
  const other = conflictingRole(roles, role);
  if (other) fail('failed-precondition', `This account already has the ${SCHOOL_ROLE_LABELS[other]} role this school year. Class Adviser and Subject Teacher can't be combined.`);
}
const gradeValue = value => Number.isInteger(value) && value >= 7 && value <= 12;
```

4. Replace `assignmentFrom` with:

```js
async function assignmentFrom(deps, reader, actor, input) {
  if (actor.ended) fail('failed-precondition', 'This school year has ended.');
  if (!SCHOOL_ROLES.includes(input.role)) fail('invalid-argument', 'Choose a school role.');
  if (isGradeRole(input.role) && input.sectionId === undefined) {
    if (!gradeValue(input.gradeLevel)) fail('invalid-argument', 'Choose a grade from 7 to 12.');
    return { role: input.role, schoolYear: actor.schoolYear, gradeLevel: input.gradeLevel };
  }
  if (input.role === 'curriculum_adviser') fail('invalid-argument', 'Choose a grade from 7 to 12.');
  if (!id(input.sectionId)) fail('invalid-argument', 'Choose a section.');
  const section = (await read(deps.db, reader, deps.db.doc(`sections/${input.sectionId}`))).data();
  if (!section || section.schoolYear !== actor.schoolYear || !gradeValue(section.gradeLevel)) fail('failed-precondition', 'This section is unavailable for the current school year.');
  // Older clients name a section for Subject Teacher; the role is held for that section's grade.
  if (input.role === 'subject_teacher') return { role: input.role, schoolYear: actor.schoolYear, gradeLevel: section.gradeLevel };
  return { role: input.role, schoolYear: actor.schoolYear, sectionId: input.sectionId, gradeLevel: section.gradeLevel };
}
```

5. Replace `requestSchoolRole` with:

```js
// Teachers ask from the Parent App. A DepEd Subject Teacher is granted at once;
// every other request confers nothing until approved.
export async function requestSchoolRole(deps, input) {
  if (!REQUESTABLE_ROLES.includes(input.role)) fail('permission-denied', 'An administrator assigns Curriculum Adviser access.');
  const byGrade = input.role === 'subject_teacher' && input.gradeLevels !== undefined;
  if (byGrade && (!Array.isArray(input.gradeLevels) || !input.gradeLevels.length || !input.gradeLevels.every(gradeValue))) fail('invalid-argument', 'Choose one or more grades from 7 to 12.');
  const inputs = byGrade ? [...new Set(input.gradeLevels)].map(gradeLevel => ({ role: 'subject_teacher', gradeLevel })) : [input];
  const user = await liveUser(deps.auth, deps.uid);
  await enforceRateLimit(deps.db, deps.uid, 'schoolRoleRequest', { windowMs: 3600000, max: 30 }, (deps.now || (() => new Date()))().getTime());
  const instant = input.role === 'subject_teacher' && isDepedEmail(user.email);
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    const wanted = [];
    for (const one of inputs) wanted.push(await assignmentFrom(deps, tx, actor, one));
    const requests = deps.db.collection('school_role_requests');
    const pending = await tx.get(requests.where('uid', '==', deps.uid).where('status', '==', 'pending'));
    assertCanHold(rolesHeld(actor.assignments, pending.docs, actor.schoolYear), input.role);
    const fresh = wanted.filter(a => !actor.assignments.some(h => assignmentKey(h) === assignmentKey(a)));
    if (!fresh.length) fail('already-exists', 'This assignment is already active.');
    if (instant) {
      const prepared = await prepareGrant(deps.db, tx, deps.uid, fresh[0]);
      let assignments = prepared.assignments;
      for (const assignment of fresh) {
        assignments = writeGrant(tx, { ...prepared, assignments, exists: assignments.some(a => assignmentKey(a) === assignmentKey(assignment)) }, actor, user, assignment, 'self');
      }
      return { status: 'granted', count: fresh.length };
    }
    const refs = fresh.map(a => requests.doc(requestKey(deps.uid, a)));
    const existing = await Promise.all(refs.map(ref => tx.get(ref)));
    const toCreate = fresh.filter((_, i) => existing[i].data()?.status !== 'pending');
    if (pending.size + toCreate.length > 20) fail('resource-exhausted', 'Wait for your pending requests to be reviewed.');
    for (const assignment of toCreate) {
      tx.set(requests.doc(requestKey(deps.uid, assignment)), { ...assignment, uid: deps.uid, email: user.email.toLowerCase(), emailVerified: true,
        displayName: user.displayName || actor.displayName, status: 'pending', createdAt: FieldValue.serverTimestamp() });
      tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'school.requested', deps.uid, { ...assignment, ...teacherOf(user) }));
    }
    return { status: 'pending', id: refs[0].id, ids: refs.map(ref => ref.id) };
  });
}
```

6. Replace `writeGrant` with (now returns the new array, and audits self-grants):

```js
// serverTimestamp cannot sit inside an array, so assignedAt uses the function's clock.
// Returns the account's assignments after the grant, so callers can grant several in one transaction.
export function writeGrant(tx, prepared, actor, user, assignment, source) {
  if (prepared.exists) return prepared.assignments;
  const db = prepared.accountRef.firestore;
  const assignments = [...prepared.assignments, { ...assignment, assignedAt: Timestamp.now(), assignedBy: actor.email, source }];
  tx.set(prepared.accountRef, { uid: user.uid, email: user.email.toLowerCase(), displayName: user.displayName || user.email,
    assignments, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (prepared.lock) tx.set(prepared.lock, { uid: user.uid, ...assignment });
  // Approvals, replacements and slips write their own audit row.
  if (['direct', 'legacy', 'self'].includes(source)) tx.set(db.collection('audit_log').doc(), auditRow(actor, 'school.assigned', user.uid, { ...assignment, source, ...teacherOf(user) }));
  tx.set(inboxRef(db, user.uid, assignmentKey(assignment)), {
    type: 'school_access', title: 'School access approved',
    body: 'You can now use the app for school work. Switch to School in Settings.', createdAt: FieldValue.serverTimestamp() });
  return assignments;
}
```

7. In `resolveSchoolRole`, replace

```js
      writeGrant(tx, await prepareGrant(deps.db, tx, user.uid, assignment), actor, user, assignment, 'request');
```

with

```js
      const prepared = await prepareGrant(deps.db, tx, user.uid, assignment);
      assertCanHold(rolesHeld(prepared.assignments, [], actor.schoolYear), assignment.role);
      writeGrant(tx, prepared, actor, user, assignment, 'request');
```

8. In `replaceAdviser`, after `const assignments = account.data()?.assignments || [];` add:

```js
    assertCanHold(rolesHeld(assignments, [], actor.schoolYear), 'adviser');
```

9. In `assignSchoolRole`, replace

```js
    const prepared = await prepareGrant(deps.db, tx, user.uid, assignment);
```

with

```js
    const prepared = await prepareGrant(deps.db, tx, user.uid, assignment);
    assertCanHold(rolesHeld(prepared.assignments, [], current.schoolYear), assignment.role);
```

10. In `revokeSchoolRole`, replace the `target` lookup with:

```js
    const target = assignments.find(a => a.role === input.role && a.schoolYear === actor.schoolYear
      && (a.sectionId ? a.sectionId === input.sectionId : a.gradeLevel === input.gradeLevel));
```

11. In `getSchoolContext`, replace the Curriculum Adviser branch body with:

```js
      if (grades.length) {
        const pending = await pendingOf(requests.where('status', '==', 'pending').where('schoolYear', '==', actor.schoolYear));
        result.reviewQueue = await requestRows(tx, deps.db, pending.docs.filter(s => REQUESTABLE_ROLES.includes(s.data().role)
          && grades.includes(s.data().gradeLevel) && s.data().uid !== deps.uid && s.data().emailVerified === true));
      }
```

Keep `isDepedEmail` imported: `requestSchoolRole` still uses it.

- [ ] **Step 4: Run the file to verify it passes**

Run: `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/schoolAccess.test.js"`
Expected: PASS.

- [ ] **Step 5: Run the other emulator files that call these handlers**

Run: `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/portalAnnouncements.test.js test/emulator/sessionAttendance.test.js"`
Expected: PASS. If a test seeds `subject_teacher` with a `sectionId` and asserts per-section behaviour, change the seed to `{ role: 'subject_teacher', schoolYear, gradeLevel: <that section's grade> }`.

- [ ] **Step 6: Commit**

```bash
git add functions/src/handlers/schoolAccess.js functions/test/emulator/schoolAccess.test.js
git commit -m "Make Subject Teacher grade-level with DepEd auto-grant and enforce the role exclusion"
```

---

### Task 4: Issue, revoke and list advisory slips

**Files:**
- Create: `functions/src/handlers/advisorySlips.js`
- Modify: `functions/src/callable.js`, `functions/src/handlers/schoolYear.js`, `functions/index.js`, `firestore.rules`, `tests/rules/schoolPortal.test.js`
- Test: `functions/test/emulator/advisorySlips.test.js`

**Interfaces:**
- Consumes: `generateCode`, `hashCode` (`functions/src/lib/activationCode.js`), `sectionLabel` (`functions/src/lib/format.js`), `scopedGrades` (`shared/staffRoles.js`), `auditRow` shape (`{ action, actorType, actorUid, targetType, targetId, details, at }`).
- Produces: `issueAdvisorySlips(deps, { sectionIds }) → { issued: [{ sectionId, sectionLabel, gradeLevel, schoolYear, code }], skipped: [{ sectionId, reason: 'not-found'|'out-of-scope'|'has-adviser' }] }`; `revokeAdvisorySlip(deps, { sectionId }) → { revoked: number }`; `listAdvisoryStatus(deps) → { schoolYear, ended, sections: [{ sectionId, adviser: { name, email }|null, slip: { issuedAt: ms|null, issuedBy }|null }] }`. `deps` is the staffCall context `{ db, now, uid, email, profile }`.
- Callables: `issueAdvisorySlipsFn`, `revokeAdvisorySlipFn`, `listAdvisoryStatusFn`.

- [ ] **Step 1: Write the failing tests**

Create `functions/test/emulator/advisorySlips.test.js`:

```js
import { beforeEach, describe, expect, it } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { issueAdvisorySlips, revokeAdvisorySlip, listAdvisoryStatus } from '../../src/handlers/advisorySlips.js';
import { endSchoolYear } from '../../src/handlers/schoolYear.js';
import { hashCode, isValidCode } from '../../src/lib/activationCode.js';

const year = '2026-2027';
const now = () => new Date('2026-10-19T08:00:00+08:00');
const staff = {
  admin: { uid: 'admin', email: 'admin@school.test', profile: { uid: 'admin', role: 'admin' } },
  glc8: { uid: 'glc8', email: 'glc8@school.test', profile: { uid: 'glc8', role: 'glc', gradeLevel: 8 } },
};
const deps = who => ({ db: db(), now, ...staff[who] });
const slips = async () => (await db().collection('advisory_slips').get()).docs.map(d => ({ id: d.id, ...d.data() }));

beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('sections/SEC8').set({ name: 'Eight', gradeLevel: 8, schoolYear: year });
});

describe('issuing advisory slips', () => {
  it('issues one hashed slip per section and returns each raw code once', async () => {
    const { issued, skipped } = await issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC1', 'SEC8'] });
    expect(skipped).toEqual([]);
    expect(issued.map(s => s.sectionId)).toEqual(['SEC1', 'SEC8']);
    expect(issued[0]).toMatchObject({ sectionLabel: 'Grade 7 – Rizal', gradeLevel: 7, schoolYear: year });
    expect(issued.every(s => isValidCode(s.code))).toBe(true);
    const stored = await slips();
    expect(stored.map(s => s.id).sort()).toEqual(issued.map(s => hashCode(s.code)).sort());
    expect(stored[0]).toMatchObject({ status: 'issued', schoolYear: year, issuedBy: 'admin@school.test' });
    expect(JSON.stringify(stored)).not.toContain(issued[0].code);
  });
  it('limits coordinators to their grades', async () => {
    const { issued, skipped } = await issueAdvisorySlips(deps('glc8'), { sectionIds: ['SEC1', 'SEC8'] });
    expect(issued.map(s => s.sectionId)).toEqual(['SEC8']);
    expect(skipped).toEqual([{ sectionId: 'SEC1', reason: 'out-of-scope' }]);
  });
  it('skips sections that already have an adviser and unknown sections', async () => {
    await db().doc(`school_adviser_locks/${year}_SEC1`).set({ uid: 'teacher', role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 });
    const { issued, skipped } = await issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC1', 'NOPE'] });
    expect(issued).toEqual([]);
    expect(skipped).toEqual([{ sectionId: 'SEC1', reason: 'has-adviser' }, { sectionId: 'NOPE', reason: 'not-found' }]);
  });
  it('reissuing revokes the earlier unused slip', async () => {
    const first = (await issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC1'] })).issued[0];
    const second = (await issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC1'] })).issued[0];
    expect((await db().doc(`advisory_slips/${hashCode(first.code)}`).get()).data()).toMatchObject({ status: 'revoked', revokedReason: 'reissued' });
    expect((await db().doc(`advisory_slips/${hashCode(second.code)}`).get()).data().status).toBe('issued');
  });
  it('refuses bad input and an ended year', async () => {
    await expect(issueAdvisorySlips(deps('admin'), { sectionIds: [] })).rejects.toMatchObject({ code: 'invalid-argument' });
    await db().doc(`school_years/${year}`).set({ endedAt: new Date() });
    await expect(issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC1'] })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('revoking and listing', () => {
  it('revokes the outstanding slip within scope only', async () => {
    await issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC1', 'SEC8'] });
    await expect(revokeAdvisorySlip(deps('glc8'), { sectionId: 'SEC1' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await revokeAdvisorySlip(deps('glc8'), { sectionId: 'SEC8' })).toEqual({ revoked: 1 });
    expect((await slips()).filter(s => s.status === 'issued').map(s => s.sectionId)).toEqual(['SEC1']);
  });
  it('lists adviser and slip status per section in scope', async () => {
    await issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC8'] });
    await db().doc(`school_adviser_locks/${year}_SEC1`).set({ uid: 'teacher', role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 });
    await db().doc('school_accounts/teacher').set({ displayName: 'Ana Cruz', email: 'ana@deped.gov.ph' });
    const admin = await listAdvisoryStatus(deps('admin'));
    expect(admin.schoolYear).toBe(year);
    const byId = Object.fromEntries(admin.sections.map(s => [s.sectionId, s]));
    expect(byId.SEC1).toEqual({ sectionId: 'SEC1', adviser: { name: 'Ana Cruz', email: 'ana@deped.gov.ph' }, slip: null });
    expect(byId.SEC8.adviser).toBeNull();
    expect(byId.SEC8.slip).toMatchObject({ issuedBy: 'admin@school.test' });
    expect(typeof byId.SEC8.slip.issuedAt).toBe('number');
    expect((await listAdvisoryStatus(deps('glc8'))).sections.map(s => s.sectionId)).toEqual(['SEC8']);
  });
  it('ending the school year revokes outstanding advisory slips', async () => {
    await issueAdvisorySlips(deps('admin'), { sectionIds: ['SEC1'] });
    const result = await endSchoolYear({ db: db(), email: 'admin@school.test' }, { schoolYear: year, confirmText: year });
    expect(result.advisorySlipsRevoked).toBe(1);
    expect((await slips())[0]).toMatchObject({ status: 'revoked', revokedReason: 'school-year-ended' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/advisorySlips.test.js"`
Expected: FAIL — `../../src/handlers/advisorySlips.js` does not exist.

- [ ] **Step 3: Implement the handler**

Create `functions/src/handlers/advisorySlips.js`:

```js
import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { generateCode, hashCode } from '../lib/activationCode.js';
import { sectionLabel } from '../lib/format.js';
import { scopedGrades } from '../../shared/staffRoles.js';

// Advisory slips (spec 2026-10-19): one single-use code per section that makes
// a verified DepEd account the section's Class Adviser without review.
const fail = (code, message) => { throw new CallableError(code, message); };
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const lockPath = (schoolYear, sectionId) => `school_adviser_locks/${schoolYear}_${sectionId}`;
const covers = (profile, grade) => { const grades = scopedGrades(profile); return grades === null || grades.includes(Number(grade)); };
const audit = (email, action, sectionId, details) => ({ action, actorType: 'staff', actorUid: email,
  targetType: 'school_assignment', targetId: sectionId, details: { sectionId, ...details }, at: FieldValue.serverTimestamp() });

export async function currentYear(db) {
  const schoolYear = (await db.doc('settings/app').get()).data()?.currentSchoolYear;
  if (!/^\d{4}-\d{4}$/.test(schoolYear || '')) fail('failed-precondition', 'The school must configure the current school year.');
  const ended = Boolean((await db.doc(`school_years/${schoolYear}`).get()).data()?.endedAt);
  return { schoolYear, ended };
}

// Each section runs in its own transaction so one section's state never blocks another's.
export async function issueAdvisorySlips(deps, input) {
  const { db, uid, email, profile, now } = deps;
  const ids = Array.isArray(input.sectionIds) ? [...new Set(input.sectionIds)] : [];
  if (!ids.length || ids.length > 200 || !ids.every(id)) fail('invalid-argument', 'Choose 1–200 sections.');
  await enforceRateLimit(db, uid, 'issueAdvisorySlips', LIMITS.issueCodes, now().getTime());
  const { schoolYear, ended } = await currentYear(db);
  if (ended) fail('failed-precondition', `The ${schoolYear} school year has ended.`);
  const issued = []; const skipped = [];
  for (const sectionId of ids) {
    const result = await db.runTransaction(async tx => {
      const section = (await tx.get(db.doc(`sections/${sectionId}`))).data();
      if (!section || section.schoolYear !== schoolYear) return { skip: 'not-found' };
      if (!covers(profile, section.gradeLevel)) return { skip: 'out-of-scope' };
      const [lock, open] = await Promise.all([
        tx.get(db.doc(lockPath(schoolYear, sectionId))),
        tx.get(db.collection('advisory_slips').where('sectionId', '==', sectionId).where('status', '==', 'issued')),
      ]);
      if (lock.exists) return { skip: 'has-adviser' };
      for (const d of open.docs) tx.update(d.ref, { status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: email, revokedReason: 'reissued' });
      const code = generateCode(randomBytes(8));
      const label = sectionLabel(section);
      tx.set(db.doc(`advisory_slips/${hashCode(code)}`), { sectionId, gradeLevel: section.gradeLevel, sectionLabel: label, schoolYear,
        status: 'issued', issuedBy: email, issuedAt: FieldValue.serverTimestamp() });
      tx.set(db.collection('audit_log').doc(), audit(email, 'school.slipIssued', sectionId, { gradeLevel: section.gradeLevel, replaced: open.size }));
      return { slip: { sectionId, sectionLabel: label, gradeLevel: section.gradeLevel, schoolYear, code } };
    });
    if (result.slip) issued.push(result.slip); else skipped.push({ sectionId, reason: result.skip });
  }
  return { issued, skipped };
}

export async function revokeAdvisorySlip(deps, input) {
  const { db, email, profile } = deps;
  if (!id(input.sectionId)) fail('invalid-argument', 'Choose a section.');
  const { schoolYear } = await currentYear(db);
  return db.runTransaction(async tx => {
    const section = (await tx.get(db.doc(`sections/${input.sectionId}`))).data();
    if (!section || section.schoolYear !== schoolYear) fail('not-found', 'Section not found.');
    if (!covers(profile, section.gradeLevel)) fail('permission-denied', 'This section is outside your grades.');
    const open = await tx.get(db.collection('advisory_slips').where('sectionId', '==', input.sectionId).where('status', '==', 'issued'));
    for (const d of open.docs) tx.update(d.ref, { status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: email, revokedReason: 'revoked' });
    if (open.size) tx.set(db.collection('audit_log').doc(), audit(email, 'school.slipRevoked', input.sectionId, { gradeLevel: section.gradeLevel }));
    return { revoked: open.size };
  });
}

export async function listAdvisoryStatus(deps) {
  const { db, profile } = deps;
  const { schoolYear, ended } = await currentYear(db);
  const [sections, locks, slips] = await Promise.all([
    db.collection('sections').where('schoolYear', '==', schoolYear).get(),
    db.collection('school_adviser_locks').where('schoolYear', '==', schoolYear).get(),
    db.collection('advisory_slips').where('schoolYear', '==', schoolYear).where('status', '==', 'issued').get(),
  ]);
  const lockBySection = new Map(locks.docs.map(d => [d.data().sectionId, d.data().uid]));
  const accounts = new Map(await Promise.all([...new Set(lockBySection.values())]
    .map(async uid => [uid, (await db.doc(`school_accounts/${uid}`).get()).data() || {}])));
  const slipBySection = new Map(slips.docs.map(d => [d.data().sectionId, d.data()]));
  return { schoolYear, ended, sections: sections.docs.filter(d => covers(profile, d.data().gradeLevel)).map(d => {
    const uid = lockBySection.get(d.id);
    const account = uid ? accounts.get(uid) : null;
    const slip = slipBySection.get(d.id);
    return { sectionId: d.id,
      adviser: account ? { name: account.displayName || account.email || '', email: account.email || '' } : null,
      slip: slip ? { issuedAt: slip.issuedAt?.toMillis?.() ?? null, issuedBy: slip.issuedBy || '' } : null };
  }) };
}
```

- [ ] **Step 4: End of year revokes advisory slips**

In `functions/src/handlers/schoolYear.js`, after the `codesRevoked` drain add:

```js
  const advisorySlipsRevoked = await drain(db,
    db.collection('advisory_slips').where('schoolYear', '==', schoolYear).where('status', '==', 'issued'),
    (docs, b) => docs.forEach((d) => b.update(d.ref, { status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: email, revokedReason: 'school-year-ended' })));
```

and change the result line to:

```js
  const result = { codesRevoked, advisorySlipsRevoked, linksExpired, accountsNotified: notified.size };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/advisorySlips.test.js test/emulator/schoolYear.test.js"`
Expected: PASS. If `schoolYear.test.js` asserts the exact result object with `toEqual`, add `advisorySlipsRevoked: 0` to that expectation.

- [ ] **Step 6: Wire the callables, the limiter and the rules**

In `functions/src/callable.js`, add to `LIMITS`:

```js
  // Preview and redeem of advisory slips share one budget per account.
  advisorySlip: { windowMs: 60 * 60 * 1000, max: 10 },
```

In `functions/index.js`:

1. Change `staffCall` to accept options:

```js
const staffCall = (fn, options = {}) => onCall({ enforceAppCheck: true, ...options }, async (req) => {
```

2. Add the import:

```js
import { issueAdvisorySlips, revokeAdvisorySlip, listAdvisoryStatus } from './src/handlers/advisorySlips.js';
```

3. After `export const updateCoordinatorSectionFn = staffCall(updateCoordinatorSection);` add:

```js
// Administrators for every grade, coordinators for their own (spec 2026-10-19).
export const issueAdvisorySlipsFn = staffCall(issueAdvisorySlips, { timeoutSeconds: 300 });
export const revokeAdvisorySlipFn = staffCall(revokeAdvisorySlip);
export const listAdvisoryStatusFn = staffCall(listAdvisoryStatus);
```

In `firestore.rules`, after `match /school_adviser_locks/{id} { allow read, write: if false; }` add:

```
    match /advisory_slips/{id} { allow read, write: if false; }
```

In `tests/rules/schoolPortal.test.js`, add `'advisory_slips/x'` to the path list in the first test, and add a read check after the loop:

```js
  for (const who of [STAFF, GUARDIAN_A]) await denied(as(env, who).doc('advisory_slips/x').get());
```

- [ ] **Step 7: Run the rules test**

Run: `npm run test:rules -- tests/rules/schoolPortal.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add functions/src/handlers/advisorySlips.js functions/src/handlers/schoolYear.js functions/src/callable.js functions/index.js firestore.rules tests/rules/schoolPortal.test.js functions/test/emulator/advisorySlips.test.js functions/test/emulator/schoolYear.test.js
git commit -m "Issue, revoke and list single-use advisory slips"
```

---

### Task 5: Preview and redeem an advisory slip

**Files:**
- Modify: `functions/src/handlers/advisorySlips.js`, `functions/index.js`
- Test: `functions/test/emulator/advisorySlips.test.js`

**Interfaces:**
- Consumes (from Task 3): `loadSchoolActor`, `liveUser`, `prepareGrant`, `writeGrant`, `inboxRef`, `auditRow`, `teacherOf`, `rolesHeld`, `assertCanHold`.
- Produces: `previewAdvisorySlip(deps, { code }) → { sectionLabel, gradeLevel }`; `redeemAdvisorySlip(deps, { code }) → { sectionId, sectionLabel, gradeLevel }`. `deps` is the schoolCall context `{ db, auth, now, uid, email, displayName }`. Callables `previewAdvisorySlipFn`, `redeemAdvisorySlipFn` (schoolCall).

- [ ] **Step 1: Write the failing tests**

Append to `functions/test/emulator/advisorySlips.test.js` (and add `previewAdvisorySlip, redeemAdvisorySlip` to the handler import, plus `import { requestSchoolRole, assignSchoolRole, loadSchoolActor } from '../../src/handlers/schoolAccess.js';`):

```js
const teachers = {
  t1: { uid: 't1', email: 't1@deped.gov.ph', emailVerified: true, displayName: 'Ana Cruz' },
  t2: { uid: 't2', email: 't2@deped.gov.ph', emailVerified: true, displayName: 'Ben Dy' },
  personal: { uid: 'personal', email: 'teacher@gmail.com', emailVerified: true },
  admin: { uid: 'admin', email: 'admin@school.test', emailVerified: true },
};
const teacherAuth = { getUser: async uid => teachers[uid], getUserByEmail: async email => Object.values(teachers).find(u => u.email === email) };
const tdeps = uid => ({ db: db(), auth: teacherAuth, now, uid, email: teachers[uid].email, displayName: teachers[uid].displayName || uid });
const issue = async (sectionId = 'SEC1') => (await issueAdvisorySlips(deps('admin'), { sectionIds: [sectionId] })).issued[0].code;

describe('redeeming advisory slips', () => {
  beforeEach(async () => { await db().doc('users/admin@school.test').set({ uid: 'admin', role: 'admin' }); });
  it('previews without consuming, then makes a DepEd teacher the adviser', async () => {
    const code = await issue();
    expect(await previewAdvisorySlip(tdeps('t1'), { code: code.toLowerCase() })).toEqual({ sectionLabel: 'Grade 7 – Rizal', gradeLevel: 7 });
    expect(await redeemAdvisorySlip(tdeps('t1'), { code })).toEqual({ sectionId: 'SEC1', sectionLabel: 'Grade 7 – Rizal', gradeLevel: 7 });
    expect((await loadSchoolActor(tdeps('t1'))).assignments).toMatchObject([{ role: 'adviser', sectionId: 'SEC1', source: 'slip', assignedBy: 'admin@school.test' }]);
    expect((await db().doc(`school_adviser_locks/${year}_SEC1`).get()).data().uid).toBe('t1');
    expect((await db().doc(`advisory_slips/${hashCode(code)}`).get()).data()).toMatchObject({ status: 'redeemed', redeemedBy: 't1' });
    const audit = (await db().collection('audit_log').where('action', '==', 'school.slipRedeemed').get()).docs.map(d => d.data().details);
    expect(audit).toEqual([expect.objectContaining({ sectionId: 'SEC1', issuedBy: 'admin@school.test', teacherEmail: 't1@deped.gov.ph' })]);
  });
  it('refuses personal emails with a message they can act on', async () => {
    const code = await issue();
    for (const fn of [previewAdvisorySlip, redeemAdvisorySlip]) {
      await expect(fn(tdeps('personal'), { code })).rejects.toMatchObject({ code: 'permission-denied', message: 'Advisory slips need a DepEd email. Request the role instead.' });
    }
  });
  it('works once, and never for revoked, other-year or ended-year slips', async () => {
    const generic = { code: 'not-found', message: 'That advisory slip could not be used. Ask the school to issue a new one.' };
    const used = await issue();
    await redeemAdvisorySlip(tdeps('t1'), { code: used });
    await expect(redeemAdvisorySlip(tdeps('t2'), { code: used })).rejects.toMatchObject(generic);
    const revoked = await issue('SEC8');
    await revokeAdvisorySlip(deps('admin'), { sectionId: 'SEC8' });
    await expect(previewAdvisorySlip(tdeps('t2'), { code: revoked })).rejects.toMatchObject(generic);
    const old = await issue('SEC8');
    await db().doc(`advisory_slips/${hashCode(old)}`).update({ schoolYear: '2025-2026' });
    await expect(redeemAdvisorySlip(tdeps('t2'), { code: old })).rejects.toMatchObject(generic);
    await expect(redeemAdvisorySlip(tdeps('t2'), { code: 'BAD' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('lets only one of two simultaneous redeemers win', async () => {
    const code = await issue();
    const results = await Promise.allSettled(['t1', 't2'].map(uid => redeemAdvisorySlip(tdeps(uid), { code })));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db().collection('school_adviser_locks').get()).size).toBe(1);
  });
  it('refuses a section that gained an adviser after the slip was printed', async () => {
    const code = await issue();
    await assignSchoolRole({ db: db(), auth: teacherAuth, now, uid: 'admin', email: 'admin@school.test' }, { email: 't2@deped.gov.ph', role: 'adviser', sectionId: 'SEC1' });
    await expect(redeemAdvisorySlip(tdeps('t1'), { code })).rejects.toMatchObject({ code: 'already-exists' });
  });
  it('refuses a teacher who is already a Subject Teacher this year', async () => {
    await requestSchoolRole(tdeps('t1'), { role: 'subject_teacher', gradeLevels: [8] });
    const code = await issue();
    await expect(redeemAdvisorySlip(tdeps('t1'), { code })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('closes pending adviser requests for the section', async () => {
    const mine = await requestSchoolRole(tdeps('t1'), { role: 'adviser', sectionId: 'SEC1' });
    const theirs = await requestSchoolRole(tdeps('personal'), { role: 'adviser', sectionId: 'SEC1' });
    await redeemAdvisorySlip(tdeps('t1'), { code: await issue() });
    expect((await db().doc(`school_role_requests/${mine.id}`).get()).data().status).toBe('fulfilled');
    expect((await db().doc(`school_role_requests/${theirs.id}`).get()).data()).toMatchObject({ status: 'superseded', reason: 'Section adviser assigned by slip' });
    const inbox = (await db().collection('guardians/personal/inbox').get()).docs.map(d => d.data());
    expect(inbox).toEqual([expect.objectContaining({ type: 'school_access', rejected: true, title: 'School access request closed' })]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/advisorySlips.test.js"`
Expected: FAIL — `previewAdvisorySlip` is not exported.

- [ ] **Step 3: Implement**

In `functions/src/handlers/advisorySlips.js`, extend the imports:

```js
import { generateCode, hashCode, normalizeCode, isValidCode } from '../lib/activationCode.js';
import { isDepedEmail } from '../../shared/schoolAccess.js';
import { loadSchoolActor, liveUser, prepareGrant, writeGrant, inboxRef, auditRow, teacherOf, rolesHeld, assertCanHold } from './schoolAccess.js';
```

and append:

```js
const GENERIC = 'That advisory slip could not be used. Ask the school to issue a new one.';
const DEPED = 'Advisory slips need a DepEd email. Request the role instead.';

// Only verified DepEd accounts may use a slip; this refusal describes the
// caller's own account, so it is safe to say. Everything else is generic.
async function slipCaller(deps, input) {
  const code = normalizeCode(input.code);
  if (!isValidCode(code)) fail('invalid-argument', GENERIC);
  const user = await liveUser(deps.auth, deps.uid);
  if (!isDepedEmail(user.email)) fail('permission-denied', DEPED);
  await enforceRateLimit(deps.db, deps.uid, 'advisorySlip', LIMITS.advisorySlip, (deps.now || (() => new Date()))().getTime());
  return { user, ref: deps.db.doc(`advisory_slips/${hashCode(code)}`) };
}
const usable = (slip, schoolYear, ended) => !ended && slip?.status === 'issued' && slip.schoolYear === schoolYear;

export async function previewAdvisorySlip(deps, input) {
  const { ref } = await slipCaller(deps, input);
  const { schoolYear, ended } = await currentYear(deps.db);
  const slip = (await ref.get()).data();
  if (!usable(slip, schoolYear, ended)) fail('not-found', GENERIC);
  return { sectionLabel: slip.sectionLabel, gradeLevel: slip.gradeLevel };
}

export async function redeemAdvisorySlip(deps, input) {
  const { user, ref } = await slipCaller(deps, input);
  const { db } = deps;
  return db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    const slip = (await tx.get(ref)).data();
    if (!usable(slip, actor.schoolYear, actor.ended)) fail('not-found', GENERIC);
    const section = (await tx.get(db.doc(`sections/${slip.sectionId}`))).data();
    if (!section || section.schoolYear !== actor.schoolYear || section.gradeLevel !== slip.gradeLevel) fail('not-found', GENERIC);
    const assignment = { role: 'adviser', schoolYear: actor.schoolYear, sectionId: slip.sectionId, gradeLevel: slip.gradeLevel };
    const requests = db.collection('school_role_requests');
    const [mine, forSection] = await Promise.all([
      tx.get(requests.where('uid', '==', deps.uid).where('status', '==', 'pending')),
      tx.get(requests.where('sectionId', '==', slip.sectionId).where('status', '==', 'pending')),
    ]);
    assertCanHold(rolesHeld(actor.assignments, mine.docs, actor.schoolYear), 'adviser');
    const prepared = await prepareGrant(db, tx, deps.uid, assignment);
    // Reads end here. The slip's issuer is recorded as who assigned the role.
    writeGrant(tx, prepared, { ...actor, email: slip.issuedBy }, user, assignment, 'slip');
    tx.update(ref, { status: 'redeemed', redeemedBy: deps.uid, redeemedAt: FieldValue.serverTimestamp() });
    for (const request of forSection.docs) {
      const r = request.data();
      if (r.role !== 'adviser' || r.schoolYear !== actor.schoolYear) continue;
      const own = r.uid === deps.uid;
      tx.update(request.ref, { status: own ? 'fulfilled' : 'superseded', reason: own ? 'Assigned by advisory slip' : 'Section adviser assigned by slip',
        reviewedAt: FieldValue.serverTimestamp() });
      if (!own) tx.set(inboxRef(db, r.uid, `superseded:${request.id}`), { type: 'school_access', rejected: true,
        title: 'School access request closed', body: `Another teacher became the adviser of ${slip.sectionLabel} with an advisory slip.`,
        createdAt: FieldValue.serverTimestamp() });
    }
    tx.set(db.collection('audit_log').doc(), auditRow(actor, 'school.slipRedeemed', deps.uid, { ...assignment, issuedBy: slip.issuedBy, ...teacherOf(user) }));
    return { sectionId: slip.sectionId, sectionLabel: slip.sectionLabel, gradeLevel: slip.gradeLevel };
  });
}
```

In `functions/index.js`, add `previewAdvisorySlip, redeemAdvisorySlip` to the `advisorySlips.js` import and, after `export const getSchoolPendingCountFn = ...`, add:

```js
export const previewAdvisorySlipFn = schoolCall(previewAdvisorySlip);
export const redeemAdvisorySlipFn = schoolCall(redeemAdvisorySlip);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/advisorySlips.test.js"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/advisorySlips.js functions/index.js functions/test/emulator/advisorySlips.test.js
git commit -m "Let DepEd teachers become advisers with an advisory slip"
```

---

### Task 6: Migrate section-based Subject Teachers

**Files:**
- Create: `functions/src/lib/subjectTeacherMigration.js`, `functions/src/lib/subjectTeacherMigration.test.js`, `functions/src/handlers/schoolMigration.js`
- Modify: `functions/index.js`
- Test: `functions/test/emulator/schoolMigration.test.js`

**Interfaces:**
- Produces: `migrateAssignments(assignments, sectionGrade: (sectionId) => number|undefined) → { assignments, changed }`; `migrateSubjectTeachers(deps) → { accountsChanged, requestsChanged, conflicts: [{ uid, email, displayName }] }`; callable `migrateSubjectTeachersFn` (schoolCall, admin-only inside).

- [ ] **Step 1: Write the failing unit test**

Create `functions/src/lib/subjectTeacherMigration.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { migrateAssignments } from './subjectTeacherMigration.js';

const at = ms => ({ toMillis: () => ms });
const grades = { A: 7, B: 7, C: 8 };
const grade = id => grades[id];
describe('migrateAssignments', () => {
  it('turns section subject-teacher rows into one row per grade, keeping the earliest', () => {
    const { assignments, changed } = migrateAssignments([
      { role: 'subject_teacher', schoolYear: 'Y', sectionId: 'B', gradeLevel: 7, assignedAt: at(20), assignedBy: 'b', source: 'direct' },
      { role: 'subject_teacher', schoolYear: 'Y', sectionId: 'A', gradeLevel: 7, assignedAt: at(10), assignedBy: 'a', source: 'request' },
      { role: 'subject_teacher', schoolYear: 'Y', sectionId: 'C', gradeLevel: 8, assignedAt: at(30), assignedBy: 'c', source: 'direct' },
      { role: 'adviser', schoolYear: 'Y', sectionId: 'A', gradeLevel: 7, assignedAt: at(5), assignedBy: 'x', source: 'direct' },
    ], grade);
    expect(changed).toBe(true);
    expect(assignments).toEqual([
      { role: 'subject_teacher', schoolYear: 'Y', gradeLevel: 7, assignedAt: expect.anything(), assignedBy: 'a', source: 'request' },
      { role: 'subject_teacher', schoolYear: 'Y', gradeLevel: 8, assignedAt: expect.anything(), assignedBy: 'c', source: 'direct' },
      { role: 'adviser', schoolYear: 'Y', sectionId: 'A', gradeLevel: 7, assignedAt: expect.anything(), assignedBy: 'x', source: 'direct' },
    ]);
    expect(assignments[0].assignedAt.toMillis()).toBe(10);
  });
  it('falls back to the stored grade for a deleted section and reports no change when nothing is section-based', () => {
    expect(migrateAssignments([{ role: 'subject_teacher', schoolYear: 'Y', sectionId: 'GONE', gradeLevel: 9 }], grade).assignments)
      .toEqual([{ role: 'subject_teacher', schoolYear: 'Y', gradeLevel: 9 }]);
    const already = [{ role: 'subject_teacher', schoolYear: 'Y', gradeLevel: 9 }];
    expect(migrateAssignments(already, grade)).toEqual({ assignments: already, changed: false });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix functions test -- src/lib/subjectTeacherMigration.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure conversion**

Create `functions/src/lib/subjectTeacherMigration.js`:

```js
import { assignmentKey } from '../../shared/schoolAccess.js';

const millis = value => value?.toMillis?.() ?? Number.POSITIVE_INFINITY;

// Subject Teacher became grade-level (spec 2026-10-19). Section rows become one
// row per grade; when several collapse, the earliest assignment is kept.
export function migrateAssignments(assignments = [], sectionGrade) {
  if (!assignments.some(a => a.role === 'subject_teacher' && a.sectionId)) return { assignments, changed: false };
  const out = [];
  for (const a of assignments) {
    if (a.role !== 'subject_teacher' || !a.sectionId) { out.push(a); continue; }
    const { sectionId, ...rest } = a;
    const row = { ...rest, gradeLevel: sectionGrade(sectionId) ?? a.gradeLevel };
    const at = out.findIndex(b => assignmentKey(b) === assignmentKey(row));
    if (at === -1) out.push(row);
    else if (millis(row.assignedAt) < millis(out[at].assignedAt)) out[at] = row;
  }
  return { assignments: out, changed: true };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm --prefix functions test -- src/lib/subjectTeacherMigration.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing emulator test**

Create `functions/test/emulator/schoolMigration.test.js`:

```js
import { beforeEach, describe, expect, it } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { migrateSubjectTeachers } from '../../src/handlers/schoolMigration.js';

const year = '2026-2027';
const deps = (uid, email) => ({ db: db(), auth: {}, now: () => new Date(), uid, email, authTime: 1792195200 });
beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('users/admin@school.test').set({ uid: 'admin', role: 'admin' });
  await db().doc('sections/SEC8').set({ name: 'Eight', gradeLevel: 8, schoolYear: year });
  await db().doc('school_accounts/t1').set({ email: 't1@deped.gov.ph', displayName: 'Ana', assignments: [
    { role: 'subject_teacher', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 },
    { role: 'subject_teacher', schoolYear: year, sectionId: 'SEC8', gradeLevel: 8 }] });
  await db().doc('school_accounts/t2').set({ email: 't2@deped.gov.ph', displayName: 'Ben', assignments: [
    { role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 },
    { role: 'subject_teacher', schoolYear: year, sectionId: 'SEC8', gradeLevel: 8 }] });
  await db().doc('school_role_requests/r1').set({ uid: 't3', email: 't3@gmail.com', emailVerified: true, role: 'subject_teacher',
    schoolYear: year, sectionId: 'SEC8', gradeLevel: 8, status: 'pending', createdAt: new Date() });
});
describe('migrateSubjectTeachers', () => {
  it('converts accounts and pending requests, reports conflicts, and is safe to re-run', async () => {
    await expect(migrateSubjectTeachers(deps('t1', 't1@deped.gov.ph'))).rejects.toMatchObject({ code: 'permission-denied' });
    const first = await migrateSubjectTeachers(deps('admin', 'admin@school.test'));
    expect(first).toEqual({ accountsChanged: 2, requestsChanged: 1, conflicts: [{ uid: 't2', email: 't2@deped.gov.ph', displayName: 'Ben' }] });
    expect((await db().doc('school_accounts/t1').get()).data().assignments.map(a => [a.role, a.gradeLevel, a.sectionId])).toEqual([
      ['subject_teacher', 7, undefined], ['subject_teacher', 8, undefined]]);
    expect((await db().doc('school_role_requests/r1').get()).data()).toMatchObject({ status: 'withdrawn', reason: 'Converted to a grade-level request' });
    const converted = (await db().collection('school_role_requests').where('status', '==', 'pending').get()).docs.map(d => d.data());
    expect(converted).toEqual([expect.objectContaining({ uid: 't3', role: 'subject_teacher', gradeLevel: 8 })]);
    expect(converted[0].sectionId).toBeUndefined();
    const again = await migrateSubjectTeachers(deps('admin', 'admin@school.test'));
    expect(again).toMatchObject({ accountsChanged: 0, requestsChanged: 0 });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/schoolMigration.test.js"`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the callable**

Create `functions/src/handlers/schoolMigration.js`:

```js
import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { conflictingRole } from '../../shared/schoolAccess.js';
import { migrateAssignments } from '../lib/subjectTeacherMigration.js';
import { loadSchoolActor, requestKey, auditRow } from './schoolAccess.js';

// One-off, safe to re-run: Subject Teacher assignments and pending requests
// move from sections to grades. Accounts holding both Adviser and Subject
// Teacher are reported, never changed automatically.
export async function migrateSubjectTeachers(deps) {
  const { db } = deps;
  const actor = await loadSchoolActor(deps);
  if (!actor.isAdmin) throw new CallableError('permission-denied', 'Administrators only.');
  const grades = new Map((await db.collection('sections').get()).docs.map(d => [d.id, d.data().gradeLevel]));
  const sectionGrade = id => grades.get(id);
  let accountsChanged = 0; let requestsChanged = 0; const conflicts = [];
  for (const snap of (await db.collection('school_accounts').get()).docs) {
    const after = await db.runTransaction(async tx => {
      const data = (await tx.get(snap.ref)).data() || {};
      const { assignments, changed } = migrateAssignments(data.assignments || [], sectionGrade);
      if (changed) tx.update(snap.ref, { assignments, updatedAt: FieldValue.serverTimestamp() });
      return { data, assignments, changed };
    });
    if (after.changed) accountsChanged++;
    const roles = after.assignments.filter(a => a.schoolYear === actor.schoolYear).map(a => a.role);
    if (conflictingRole(roles, 'adviser')) conflicts.push({ uid: snap.id, email: after.data.email || '', displayName: after.data.displayName || '' });
  }
  const pending = await db.collection('school_role_requests').where('role', '==', 'subject_teacher').where('status', '==', 'pending').get();
  for (const snap of pending.docs.filter(d => d.data().sectionId)) {
    await db.runTransaction(async tx => {
      const r = (await tx.get(snap.ref)).data();
      if (r?.status !== 'pending' || !r.sectionId) return;
      const { sectionId, ...rest } = r;
      const assignment = { role: 'subject_teacher', schoolYear: r.schoolYear, gradeLevel: sectionGrade(sectionId) ?? r.gradeLevel };
      const target = db.doc(`school_role_requests/${requestKey(r.uid, assignment)}`);
      const existing = (await tx.get(target)).data();
      if (existing?.status !== 'pending') tx.set(target, { ...rest, gradeLevel: assignment.gradeLevel });
      tx.update(snap.ref, { status: 'withdrawn', reason: 'Converted to a grade-level request', reviewedAt: FieldValue.serverTimestamp() });
    });
    requestsChanged++;
  }
  const result = { accountsChanged, requestsChanged, conflicts };
  await db.collection('audit_log').add(auditRow(actor, 'school.subjectTeachersMigrated', actor.uid, { accountsChanged, requestsChanged, conflicts: conflicts.length }));
  return result;
}
```

In `functions/index.js` add the import and export:

```js
import { migrateSubjectTeachers } from './src/handlers/schoolMigration.js';
```

```js
export const migrateSubjectTeachersFn = onCall({ enforceAppCheck: true, timeoutSeconds: 540 }, async req => {
  try { return await migrateSubjectTeachers({ ...callDeps(), ...(await schoolIdentity(db, auth, req)) }); }
  catch (e) { throw toHttpsError(e); }
});
```

- [ ] **Step 8: Run both tests to verify they pass**

Run: `npm --prefix functions test -- src/lib/subjectTeacherMigration.test.js`
Run: `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/schoolMigration.test.js"`
Expected: both PASS.

- [ ] **Step 9: Commit**

```bash
git add functions/src/lib/subjectTeacherMigration.js functions/src/lib/subjectTeacherMigration.test.js functions/src/handlers/schoolMigration.js functions/index.js functions/test/emulator/schoolMigration.test.js
git commit -m "Add a re-runnable migration to grade-level Subject Teachers"
```

---

### Task 7: SIMS School access shows grade-level Subject Teachers and slip history

**Files:**
- Modify: `src/lib/schoolAssignments.js`, `src/pages/guardians/school/CoverageView.jsx`, `src/pages/guardians/school/AssignRoleForm.jsx`, `src/pages/guardians/school/PendingView.jsx`, `parent/src/lib/school.js`, `parent/src/screens/settings/SchoolRequestsPage.jsx`
- Test: `src/pages/guardians/school/CoverageView.test.js`, `src/lib/schoolAssignments.test.js` (create if absent), `parent/src/lib/school.test.js`

**Interfaces:**
- Produces: `scopeLabel(item, sections) → string` in `parent/src/lib/school.js` (section label, or `Grade N` when `item.sectionId` is empty); `coverageByGrade` groups gain `subjectTeachers: assignment[]` and rows lose `subjectTeachers`.

- [ ] **Step 1: Write the failing tests**

Append to `parent/src/lib/school.test.js` (add `scopeLabel` to the `./school.js` import):

```js
describe('scopeLabel', () => {
  it('names a section, or the grade for grade-level roles', () => {
    const sections = [{ id: 'a', gradeLevel: 7, name: 'Rizal' }];
    expect(scopeLabel({ sectionId: 'a', gradeLevel: 7 }, sections)).toBe('Grade 7 · Rizal');
    expect(scopeLabel({ sectionId: '', gradeLevel: 8 }, sections)).toBe('Grade 8');
    expect(REQUEST_STATUS.fulfilled).toBeTruthy();
    expect(REQUEST_STATUS.superseded).toBeTruthy();
  });
});
```

In `src/pages/guardians/school/CoverageView.test.js`, add to `context.managedAssignments`:

```js
    { uid: 'u2', displayName: 'Eve Tan', email: 'eve@deped.gov.ph', role: 'subject_teacher', gradeLevel: 7, assignedAt: 1, lastSchoolOpenAt: null },
```

and in the test add:

```js
    expect(html).toContain('Subject Teachers: 1');
```

Create or extend `src/lib/schoolAssignments.test.js` with:

```js
import { describe, expect, it } from 'vitest';
import { historyLine } from './schoolAssignments.js';

describe('historyLine for advisory slips', () => {
  const sections = [{ id: 'A', gradeLevel: 7, name: 'Rizal' }];
  const at = { toDate: () => new Date('2026-10-19T00:00:00Z') };
  it('describes issue, revoke and redeem', () => {
    expect(historyLine({ action: 'school.slipIssued', actorUid: 'admin@x', at, details: { sectionId: 'A', gradeLevel: 7 } }, sections).text)
      .toBe('admin@x issued an advisory slip · Grade 7 · Rizal');
    expect(historyLine({ action: 'school.slipRevoked', actorUid: 'admin@x', at, details: { sectionId: 'A', gradeLevel: 7 } }, sections).text)
      .toBe('admin@x revoked the advisory slip · Grade 7 · Rizal');
    expect(historyLine({ action: 'school.slipRedeemed', actorUid: 'ana@deped.gov.ph', at,
      details: { role: 'adviser', sectionId: 'A', gradeLevel: 7, issuedBy: 'admin@x', teacherName: 'Ana' } }, sections).text)
      .toBe('Ana became Class Adviser with a slip from admin@x · Adviser · Grade 7 · Rizal');
  });
});
```

(If the file already exists, add only the `describe` block and merge the imports.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/pages/guardians/school/CoverageView.test.js src/lib/schoolAssignments.test.js` and `npm --prefix parent test -- lib/school.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

`parent/src/lib/school.js` (leave `ROLE_LABELS` unchanged; SIMS and existing tests depend on `'Adviser'`):
- Change `REQUEST_STATUS` to:

```js
export const REQUEST_STATUS = { pending: S.requestPending, approved: S.requestApproved, rejected: S.requestRejected, withdrawn: S.requestWithdrawn,
  fulfilled: S.requestFulfilled, superseded: S.requestSuperseded };
```

- After `sectionLabel` add:

```js
// Requests and assignments name a section, or only a grade for grade-level roles.
export const scopeLabel = (item, sections = []) => (item?.sectionId ? sectionLabel(sections.find((s) => s.id === item.sectionId)) : `Grade ${item?.gradeLevel}`);
```

In `parent/src/strings.js` add next to the other `request*` strings:

```js
  requestFulfilled: 'Assigned by advisory slip',
  requestSuperseded: 'Closed: the section has an adviser',
```

`parent/src/screens/settings/SchoolRequestsPage.jsx`: import `scopeLabel` instead of `sectionLabel` and change line 37 to:

```jsx
              <div style={{ fontSize: 14, margin: '4px 0 8px' }}>{ROLE_LABELS[r.role]} · {scopeLabel(r, sections)}</div>
```

`src/pages/guardians/school/PendingView.jsx`: import `scopeLabel` alongside `sectionLabel` and change line 63 to:

```jsx
              <div style={{ marginTop: 4 }}>{ROLE_LABELS[r.role]} · {scopeLabel(r, context.sections || [])}</div>
```

(keep line 69 as is; it only renders for adviser conflicts.)

`src/lib/schoolAssignments.js`, in `coverageByGrade` remove the `subjectTeachers` row field and add to the returned group:

```js
      subjectTeachers: assignments.filter(a => a.role === 'subject_teacher' && Number(a.gradeLevel) === grade),
```

In `coverageCsvRows` replace the header `'Subject teachers'` with `'Grade subject teachers'` and `r.subjectTeachers` with `g.subjectTeachers.length`.

In `historyLine`, before `const text =` add the slip cases by changing the `text` expression to:

```js
  const text = row.action === 'school.requested' ? `${teacher} requested ${what}`
    : row.action === 'school.requestWithdrawn' ? `${teacher} withdrew a request for ${what}`
    : row.action === 'school.replaced' ? `${row.actorUid} replaced ${d.previousEmail || 'the adviser'} with ${teacher} · ${what}`
    : row.action === 'school.slipIssued' ? `${row.actorUid} issued an advisory slip · ${scope}`
    : row.action === 'school.slipRevoked' ? `${row.actorUid} revoked the advisory slip · ${scope}`
    : row.action === 'school.slipRedeemed' ? `${teacher} became Class Adviser with a slip from ${d.issuedBy} · ${what}`
    : `${row.actorUid} ${VERBS[row.action] || row.action} ${teacher} · ${what}`;
```

`src/pages/guardians/school/CoverageView.jsx`: delete the per-row `<span>…subject teacher…</span>` and add after the Curriculum Adviser span:

```jsx
          <span style={{ fontSize: 13, color: T.inkMuted }}>{`Subject Teachers: ${g.subjectTeachers.length}`}</span>
```

`src/pages/guardians/school/AssignRoleForm.jsx`: add `import { isGradeRole } from '../../../../shared/schoolAccess.js';`, then replace both `assignment.role === 'curriculum_adviser'` checks (payload and the Field choice) with `isGradeRole(assignment.role)`.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/pages/guardians/school src/lib/schoolAssignments.test.js` and `npm --prefix parent test -- lib/school.test.js lib/strings.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schoolAssignments.js src/lib/schoolAssignments.test.js src/pages/guardians/school parent/src/lib/school.js parent/src/lib/school.test.js parent/src/strings.js parent/src/screens/settings/SchoolRequestsPage.jsx
git commit -m "Show grade-level Subject Teachers and advisory slip history in School access"
```

---

### Task 8: Printable advisory slips

**Files:**
- Create: `src/lib/advisorySlipLayout.js`, `src/lib/advisorySlipLayout.test.js`, `src/components/AdvisorySlipsPrintable.jsx`

**Interfaces:**
- Consumes: `slipPrintStyles`, `chunkSlips`, `formatCodeForPrint` from `src/lib/slipLayout.js`.
- Produces: `advisoryUrl(base, code)`, `advisoryInstructions(schoolYear)`, `advisoryPrintStyles(paperKey)`, default component `AdvisorySlipsPrintable({ slips: [{ sectionId, sectionLabel, schoolYear, code }], portalUrl, paper })`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/advisorySlipLayout.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { advisoryUrl, advisoryInstructions, advisoryPrintStyles } from './advisorySlipLayout.js';

describe('advisory slip layout', () => {
  it('points the QR at the adviser link', () => {
    expect(advisoryUrl('https://bnhs-parent.web.app/', 'ABCD2345')).toBe('https://bnhs-parent.web.app/activate?a=ABCD2345');
  });
  it('says who may use it and for how long', () => {
    expect(advisoryInstructions('2026-2027')).toBe('For the class adviser only. Sign in with your DepEd email. Single use. Valid SY 2026-2027. Keep private.');
  });
  it('hides the Sections page chrome when printing and keeps the band colour', () => {
    const css = advisoryPrintStyles('folio');
    expect(css).toContain('.sections-page-chrome');
    expect(css).toContain('.advisory-controls');
    expect(css).toContain('print-color-adjust: exact');
    expect(css).toContain('@page { size: 8.5in 13in');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/advisorySlipLayout.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/advisorySlipLayout.js`:

```js
import { slipPrintStyles } from './slipLayout.js';

// Advisory slips share the learner slip grid and paper sizes but carry a solid
// header band so the two can't be confused (spec 2026-10-19).
export const advisoryUrl = (base, code) => `${base.replace(/\/+$/, '')}/activate?a=${code}`;
export const advisoryInstructions = (schoolYear) =>
  `For the class adviser only. Sign in with your DepEd email. Single use. Valid SY ${schoolYear}. Keep private.`;

export function advisoryPrintStyles(paperKey) {
  return `${slipPrintStyles(paperKey)}
  .advisory-slip { grid-template-rows: auto 1fr; padding-top: 0; }
  .advisory-band { grid-column: 1 / -1; margin: 0 -3mm; padding: 1mm 3mm; background: #12313A; color: #FFFFFF; font: 700 8px/1.2 Inter, system-ui, sans-serif; letter-spacing: 0.14em; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .advisory-section { font-weight: 800; font-size: 13px; line-height: 1.15; }
  @media print { .sections-page-chrome, .advisory-controls { display: none !important; } }
`;
}
```

Create `src/components/AdvisorySlipsPrintable.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { chunkSlips, formatCodeForPrint } from '../lib/slipLayout.js';
import { advisoryUrl, advisoryInstructions, advisoryPrintStyles } from '../lib/advisorySlipLayout.js';

function AdvisorySlip({ slip, portalUrl }) {
  const [qr, setQr] = useState(null);
  const url = advisoryUrl(portalUrl, slip.code);
  useEffect(() => { let on = true; QRCode.toDataURL(url, { margin: 0, width: 200 }).then((u) => on && setQr(u)).catch(() => {}); return () => { on = false; }; }, [url]);
  return (
    <div className="slip advisory-slip">
      <div className="advisory-band">ADVISORY SLIP · CLASS ADVISER</div>
      {qr ? <img className="slip-qr" src={qr} alt="" /> : <div className="slip-qr" />}
      <div className="slip-text">
        <div className="advisory-section">{slip.sectionLabel}</div>
        <div className="slip-meta">SY {slip.schoolYear}</div>
        <div className="slip-code">{formatCodeForPrint(slip.code)}</div>
        <div className="slip-note">{advisoryInstructions(slip.schoolYear)}</div>
      </div>
    </div>
  );
}

export default function AdvisorySlipsPrintable({ slips, portalUrl, paper }) {
  const sheets = useMemo(() => chunkSlips(slips, paper), [slips, paper]);
  return (
    <div className="slips-print-root paper">
      <style>{advisoryPrintStyles(paper)}</style>
      {sheets.map((sheet, i) => <div className="slips-sheet" key={i}>{sheet.map((s) => <AdvisorySlip key={s.sectionId} slip={s} portalUrl={portalUrl} />)}</div>)}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/advisorySlipLayout.test.js shared/theme/literals.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/advisorySlipLayout.js src/lib/advisorySlipLayout.test.js src/components/AdvisorySlipsPrintable.jsx
git commit -m "Add the printable advisory slip"
```

---

### Task 9: Issue advisory slips from the Sections page

**Files:**
- Create: `src/data/advisorySlips.js`, `src/hooks/useAdvisoryStatus.js`, `src/lib/advisoryStatus.js`, `src/lib/advisoryStatus.test.js`, `src/pages/sections/AdvisorySlipsPanel.jsx`
- Modify: `src/lib/access.js`, `src/lib/access.test.js`, `src/pages/SectionsPage.jsx`, `src/pages/SectionsPage.test.js`

**Interfaces:**
- Consumes: `issueAdvisorySlipsFn`, `revokeAdvisorySlipFn`, `listAdvisoryStatusFn` (Task 4); `AdvisorySlipsPrintable` (Task 8); `shortDate` from `src/lib/schoolAssignments.js`.
- Produces: `canIssueAdvisorySlip(me, section)`; `adviserStatusText(status)`; `slipCandidates(sections, bySection, me)`; `slipConfirmMessage(kind, sections, bySection)`; `issuedText(result)`; `useAdvisoryStatus(enabled) → { bySection: Map, loading, error, reload }`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/advisoryStatus.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { adviserStatusText, slipCandidates, slipConfirmMessage, issuedText } from './advisoryStatus.js';

const s7 = { id: 'A', gradeLevel: 7, name: 'Rizal' };
const s8 = { id: 'B', gradeLevel: 8, name: 'Mabini' };
const bySection = new Map([
  ['A', { sectionId: 'A', adviser: { name: 'Ana Cruz', email: 'ana@deped.gov.ph' }, slip: null }],
  ['B', { sectionId: 'B', adviser: null, slip: { issuedAt: Date.parse('2026-10-19T02:00:00Z'), issuedBy: 'admin@x' } }],
]);
describe('advisory status', () => {
  it('describes each section', () => {
    expect(adviserStatusText(bySection.get('A'))).toBe('In app: Ana Cruz');
    expect(adviserStatusText(bySection.get('B'))).toBe('Slip issued · Oct 19, 2026');
    expect(adviserStatusText({ adviser: null, slip: null })).toBe('No adviser in app');
    expect(adviserStatusText(undefined)).toBe('');
  });
  it('offers slips only for sections in scope without an adviser', () => {
    expect(slipCandidates([s7, s8], bySection, { role: 'admin' }).map(s => s.id)).toEqual(['B']);
    expect(slipCandidates([s7, s8], bySection, { role: 'glc', gradeLevel: 7 })).toEqual([]);
  });
  it('warns before replacing an outstanding slip', () => {
    expect(slipConfirmMessage('issue', [s8], bySection)).toBe('Print a new advisory slip for Grade 8 · Mabini? A new code will be printed. The old slip stops working.');
    expect(slipConfirmMessage('issue', [s7], new Map())).toBe('Issue an advisory slip for Grade 7 · Rizal? Print it right away: the code is shown only once.');
    expect(slipConfirmMessage('issue', [s7, s8], new Map())).toBe('Issue advisory slips for 2 sections without an adviser? Print them right away: the codes are shown only once. Any older unused slips for these sections stop working.');
    expect(slipConfirmMessage('revoke', [s8], bySection)).toBe('Revoke the advisory slip for Grade 8 · Mabini? The printed slip stops working.');
  });
  it('summarises an issue run', () => {
    expect(issuedText({ issued: [{}, {}], skipped: [{ sectionId: 'A', reason: 'has-adviser' }] })).toBe('2 slips ready. 1 section skipped because it already has an adviser.');
    expect(issuedText({ issued: [{}], skipped: [] })).toBe('1 slip ready.');
  });
});
```

Append to `src/lib/access.test.js` (and import `canIssueAdvisorySlip`):

```js
describe('canIssueAdvisorySlip', () => {
  it('lets administrators issue for any grade and coordinators for their own', () => {
    expect(canIssueAdvisorySlip({ role: 'admin' }, { gradeLevel: 12 })).toBe(true);
    expect(canIssueAdvisorySlip({ role: 'glc', gradeLevel: 8 }, { gradeLevel: 8 })).toBe(true);
    expect(canIssueAdvisorySlip({ role: 'glc', gradeLevel: 8 }, { gradeLevel: 7 })).toBe(false);
    expect(canIssueAdvisorySlip({ role: 'jhs_coord' }, { gradeLevel: 10 })).toBe(true);
    expect(canIssueAdvisorySlip({ role: 'shs_coord' }, { gradeLevel: 10 })).toBe(false);
    expect(canIssueAdvisorySlip({ role: 'bogus' }, { gradeLevel: 7 })).toBe(false);
  });
});
```

In `src/pages/SectionsPage.test.js`:
1. Extend the hoisted fixture: `const fixture = vi.hoisted(() => ({ sections: [], advisory: new Map() }));`
2. Add mocks:

```js
vi.mock('../hooks/useAdvisoryStatus.js', () => ({ useAdvisoryStatus: () => ({ bySection: fixture.advisory, loading: false, error: '', reload: vi.fn() }) }));
vi.mock('../data/advisorySlips.js', () => ({ issueAdvisorySlips: vi.fn(), revokeAdvisorySlip: vi.fn(), listAdvisoryStatus: vi.fn() }));
```

3. In `beforeEach` add `fixture.advisory = new Map();`
4. Add tests:

```js
describe('advisory slips on the Sections page', () => {
  it('offers a slip to administrators and in-grade coordinators for a section without an adviser', () => {
    fixture.advisory = new Map([['s8', { sectionId: 's8', adviser: null, slip: null }]]);
    for (const me of [{ role: 'admin' }, glc, { role: 'jhs_coord' }]) {
      const html = render(me);
      expect(html).toContain('>Advisory slip<');
      expect(html).toContain('No adviser in app');
      expect(html).toContain('Print slips for sections without an adviser');
    }
    expect(render({ role: 'glc', gradeLevel: 7 })).not.toContain('>Advisory slip<');
  });
  it('shows the app adviser and hides the slip action once a section has one', () => {
    fixture.advisory = new Map([['s8', { sectionId: 's8', adviser: { name: 'Ana Cruz', email: 'a@deped.gov.ph' }, slip: null }]]);
    const html = render({ role: 'admin' });
    expect(html).toContain('In app: Ana Cruz');
    expect(html).not.toContain('>Advisory slip<');
  });
  it('offers Revoke while a slip is outstanding', () => {
    fixture.advisory = new Map([['s8', { sectionId: 's8', adviser: null, slip: { issuedAt: Date.parse('2026-10-19T02:00:00Z'), issuedBy: 'x' } }]]);
    const html = render(glc);
    expect(html).toContain('>Revoke slip<');
    expect(html).toContain('Slip issued · Oct 19, 2026');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/advisoryStatus.test.js src/lib/access.test.js src/pages/SectionsPage.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the helpers, data and hook**

In `src/lib/access.js` add:

```js
// Advisory slips: administrators for every grade, coordinators for their own (spec 2026-10-19).
export function canIssueAdvisorySlip(me, section) {
  if (!roleOf(me) || !section) return false;
  const g = grades(me);
  return g === null || g.includes(Number(section.gradeLevel));
}
```

Create `src/lib/advisoryStatus.js`:

```js
import { shortDate } from './schoolAssignments.js';
import { sectionLabel } from '../../parent/src/lib/school.js';
import { canIssueAdvisorySlip } from './access.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const SKIPPED = {
  'has-adviser': ['it already has an adviser', 'they already have an adviser'],
  'out-of-scope': ['it is outside your grades', 'they are outside your grades'],
  'not-found': ['it was not found', 'they were not found'],
};

export function adviserStatusText(status) {
  if (!status) return '';
  if (status.adviser) return `In app: ${status.adviser.name || status.adviser.email}`;
  if (status.slip) return `Slip issued · ${shortDate(status.slip.issuedAt)}`;
  return 'No adviser in app';
}

export const slipCandidates = (sections, bySection, me) =>
  sections.filter((s) => canIssueAdvisorySlip(me, s) && bySection.has(s.id) && !bySection.get(s.id).adviser);

export function slipConfirmMessage(kind, sections, bySection) {
  if (kind === 'revoke') return `Revoke the advisory slip for ${sectionLabel(sections[0])}? The printed slip stops working.`;
  if (sections.length > 1) return `Issue advisory slips for ${sections.length} sections without an adviser? Print them right away: the codes are shown only once. Any older unused slips for these sections stop working.`;
  const [section] = sections;
  return bySection.get(section.id)?.slip
    ? `Print a new advisory slip for ${sectionLabel(section)}? A new code will be printed. The old slip stops working.`
    : `Issue an advisory slip for ${sectionLabel(section)}? Print it right away: the code is shown only once.`;
}

export function issuedText({ issued = [], skipped = [] }) {
  const parts = [`${plural(issued.length, 'slip', 'slips')} ready.`];
  const reasons = [...new Set(skipped.map((s) => s.reason))];
  for (const reason of reasons) {
    const n = skipped.filter((s) => s.reason === reason).length;
    parts.push(`${plural(n, 'section', 'sections')} skipped because ${SKIPPED[reason][n === 1 ? 0 : 1]}.`);
  }
  return parts.join(' ');
}
```

Create `src/data/advisorySlips.js`:

```js
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

const fn = (name) => async (data = {}) => (await httpsCallable(functions, name)(data)).data;

// Advisory slips (spec 2026-10-19). Names match functions/index.js.
export const listAdvisoryStatus = fn('listAdvisoryStatusFn');
export const issueAdvisorySlips = fn('issueAdvisorySlipsFn');
export const revokeAdvisorySlip = fn('revokeAdvisorySlipFn');
```

Create `src/hooks/useAdvisoryStatus.js`:

```js
import { useCallback, useEffect, useState } from 'react';
import { listAdvisoryStatus } from '../data/advisorySlips.js';

// Adviser and outstanding slip per section, current school year only.
export function useAdvisoryStatus(enabled) {
  const [state, setState] = useState({ bySection: new Map(), loading: enabled, error: '' });
  const reload = useCallback(async () => {
    if (!enabled) return;
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const { sections } = await listAdvisoryStatus();
      setState({ bySection: new Map(sections.map((s) => [s.sectionId, s])), loading: false, error: '' });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message || 'Could not load advisers.' }));
    }
  }, [enabled]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}
```

Create `src/pages/sections/AdvisorySlipsPanel.jsx`:

```jsx
import { useRef } from 'react';
import { T, S } from '../../styles.js';
import { Btn, Card } from '../../components/ui.jsx';
import SlipPrintControls, { useSlipPaper, PORTAL_URL } from '../../components/SlipPrintControls.jsx';
import AdvisorySlipsPrintable from '../../components/AdvisorySlipsPrintable.jsx';
import { usePrintReadiness } from '../../hooks/usePrintReadiness.js';
import { issuedText } from '../../lib/advisoryStatus.js';

// Raw codes live only here after issuing; closing the panel loses them.
export default function AdvisorySlipsPanel({ result, onClose }) {
  const [paper, setPaper] = useSlipPaper();
  const printRoot = useRef(null);
  const printReady = usePrintReadiness(printRoot, result, result.issued.length);
  return (
    <>
      <Card className="advisory-controls" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={S.h2}>Advisory slips</h2>
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
        </div>
        <p role="status" style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>
          {issuedText(result)} Print them now: the codes are shown only once. Each slip works once, for a teacher signed in with a DepEd email.
        </p>
        {result.issued.length > 0 && <SlipPrintControls paper={paper} onPaperChange={setPaper} printReady={printReady} />}
      </Card>
      {result.issued.length > 0 && <div ref={printRoot}><AdvisorySlipsPrintable slips={result.issued} portalUrl={PORTAL_URL} paper={paper} /></div>}
    </>
  );
}
```

- [ ] **Step 4: Wire the Sections page**

In `src/pages/SectionsPage.jsx`:

1. Imports — add:

```js
import { canIssueAdvisorySlip } from '../lib/access.js';
import { useAdvisoryStatus } from '../hooks/useAdvisoryStatus.js';
import { issueAdvisorySlips, revokeAdvisorySlip } from '../data/advisorySlips.js';
import { adviserStatusText, slipCandidates, slipConfirmMessage } from '../lib/advisoryStatus.js';
import AdvisorySlipsPanel from './sections/AdvisorySlipsPanel.jsx';
```

(merge `canIssueAdvisorySlip` into the existing `../lib/access.js` import line instead of a second import.)

2. After `const [sectionQuery, setSectionQuery] = useState('');` add:

```js
  // Advisory slips belong to the current school year only.
  const advisory = useAdvisoryStatus(canViewRoster);
  const [advisorySlips, setAdvisorySlips] = useState(null);
  const [slipConfirm, setSlipConfirm] = useState(null);
  const [slipError, setSlipError] = useState('');
  const runSlips = async ({ kind, sections: targets }) => {
    setSlipError('');
    try {
      if (kind === 'revoke') await revokeAdvisorySlip({ sectionId: targets[0].id });
      else setAdvisorySlips(await issueAdvisorySlips({ sectionIds: targets.map((s) => s.id) }));
    } catch (e) { setSlipError(e.message || 'Could not update advisory slips.'); }
    finally { setSlipConfirm(null); advisory.reload(); }
  };
```

3. After `const rows = useMemo(...)` add:

```js
  const slipTargets = useMemo(() => (canViewRoster ? slipCandidates(rows, advisory.bySection, me) : []), [canViewRoster, rows, advisory.bySection, me]);
```

4. Directly inside `<ResourceState resources={resources}>`, before `<div className="sections-page-chrome">`, add:

```jsx
      {advisorySlips && <AdvisorySlipsPanel result={advisorySlips} onClose={() => setAdvisorySlips(null)} />}
```

5. In the heading plate, after the `Add section` button, add:

```jsx
          {slipTargets.length > 0 && <Btn variant="ghost" onClick={() => setSlipConfirm({ kind: 'issue', sections: slipTargets })}>Print slips for sections without an adviser</Btn>}
```

and under the plate (before the year chooser) add:

```jsx
        {slipError && <p role="alert" className="sims-feedback">{slipError}</p>}
        {advisory.error && <p role="alert" className="sims-feedback">{advisory.error}</p>}
```

6. Replace the Adviser cell `<td style={S.td}>{s.adviserName || '—'}</td>` with:

```jsx
                    <td style={S.td}>
                      <div>{s.adviserName || '—'}</div>
                      {canViewRoster && <div style={{ fontSize: 12, color: T.inkMuted }}>{adviserStatusText(advisory.bySection.get(s.id))}</div>}
                    </td>
```

7. In the actions cell, before the Edit button, add:

```jsx
                      {canViewRoster && canIssueAdvisorySlip(me, s) && advisory.bySection.has(s.id) && !advisory.bySection.get(s.id).adviser &&
                        <Btn variant="ghost" onClick={(e) => { e.stopPropagation(); setSlipConfirm({ kind: 'issue', sections: [s] }); }} style={{ marginRight: 6 }}>Advisory slip</Btn>}
                      {canViewRoster && canIssueAdvisorySlip(me, s) && advisory.bySection.get(s.id)?.slip &&
                        <Btn variant="ghost" onClick={(e) => { e.stopPropagation(); setSlipConfirm({ kind: 'revoke', sections: [s] }); }} style={{ marginRight: 6 }}>Revoke slip</Btn>}
```

8. Next to the existing delete `Confirm`, add:

```jsx
      {slipConfirm && <Confirm title="Advisory slip" label={slipConfirm.kind === 'revoke' ? 'Revoke' : 'Issue'} danger={slipConfirm.kind === 'revoke'}
        message={slipConfirmMessage(slipConfirm.kind, slipConfirm.sections, advisory.bySection)}
        onYes={() => runSlips(slipConfirm)} onNo={() => setSlipConfirm(null)} />}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/advisoryStatus.test.js src/lib/access.test.js src/pages/SectionsPage.test.js shared/theme/literals.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/access.js src/lib/access.test.js src/lib/advisoryStatus.js src/lib/advisoryStatus.test.js src/data/advisorySlips.js src/hooks/useAdvisoryStatus.js src/pages/sections/AdvisorySlipsPanel.jsx src/pages/SectionsPage.jsx src/pages/SectionsPage.test.js
git commit -m "Issue and revoke advisory slips from the Sections page"
```

---

### Task 10: Parent App reads the kind of slip it scanned

**Files:**
- Modify: `parent/src/lib/qrScan.js`, `parent/src/lib/qrScan.test.js`, `parent/src/components/ScanSheet.jsx`
- Create: `parent/src/hooks/useScanSheet.js`

**Interfaces:**
- Produces: `readSlip(text, fallbackKind: 'learner'|'advisory') → { kind, code } | null`; `ScanSheet` props `{ onCode(code, kind), onClose, kind = 'learner', title = S.scanTitle }`; `useScanSheet() → { Sheet, open, close, loading, error }`.

- [ ] **Step 1: Write the failing test**

Append to `parent/src/lib/qrScan.test.js` (import `readSlip`):

```js
describe('readSlip', () => {
  it('tells learner and advisory slip links apart', () => {
    expect(readSlip('https://bnhs-parent.web.app/activate?c=ABCD2345', 'advisory')).toEqual({ kind: 'learner', code: 'ABCD2345' });
    expect(readSlip('https://bnhs-parent.web.app/activate?a=abcd2345', 'learner')).toEqual({ kind: 'advisory', code: 'ABCD2345' });
  });
  it('uses the step\'s kind for a bare code and rejects anything else', () => {
    expect(readSlip('ABCD-2345', 'advisory')).toEqual({ kind: 'advisory', code: 'ABCD2345' });
    expect(readSlip('https://example.com/pay?a=ABCD2345', 'learner')).toBeNull();
    expect(readSlip('', 'learner')).toBeNull();
  });
  it('keeps extractCode learner-only', () => {
    expect(extractCode('https://x/activate?a=ABCD2345')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix parent test -- lib/qrScan.test.js`
Expected: FAIL — `readSlip` is not exported.

- [ ] **Step 3: Implement**

In `parent/src/lib/qrScan.js`, replace `extractCode` with:

```js
// Learner slips link to /activate?c=CODE and advisory slips to /activate?a=CODE.
// A bare code takes the kind of slip the screen asked for.
export function readSlip(text, fallbackKind = 'learner') {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  let candidate = raw; let kind = fallbackKind;
  if (/^https?:\/\//i.test(raw)) {
    let url;
    try { url = new URL(raw); } catch { return null; }
    if (!/\/activate\/?$/.test(url.pathname)) return null;
    kind = url.searchParams.has('a') ? 'advisory' : 'learner';
    candidate = url.searchParams.get(kind === 'advisory' ? 'a' : 'c') || '';
  } else if (raw.length > MAX_BARE) {
    return null;
  }
  const code = normalizeCode(candidate);
  return CODE_RE.test(code) ? { kind, code } : null;
}

export function extractCode(text) {
  const slip = readSlip(text, 'learner');
  return slip?.kind === 'learner' ? slip.code : null;
}
```

In `parent/src/components/ScanSheet.jsx`:
- Change the import to `import { createDetector, readSlip } from '../lib/qrScan.js';`
- Change the signature to `export default function ScanSheet({ onCode, onClose, kind = 'learner', title = S.scanTitle }) {`
- In `found`, replace the body's first three lines with:

```js
      const slip = readSlip(text, kind);
      if (!slip) { setNotSlip(true); return false; }
      navigator.vibrate?.(60);
      stop();
      onCodeRef.current(slip.code, slip.kind);
      return true;
```

- In `onPhoto`, replace the two `code` lines with:

```js
      const slip = readSlip(await detector.current.detect(bitmap), kind);
      bitmap.close?.();
      if (slip) { onCodeRef.current(slip.code, slip.kind); return; }
```

- Add `kind` to the effect's dependency array: `}, [onClose, kind]);`
- Replace `aria-label={S.scanTitle}` and any visible `S.scanTitle` heading with `title`.
- Update the component comment: it fills in the code from a learner or advisory slip's QR and never submits anything itself.

Create `parent/src/hooks/useScanSheet.js`:

```js
import { useCallback, useState } from 'react';
import S from '../strings.js';

// The camera code and jsQR fallback load only when someone taps Scan. A failed
// download is reported inline; typing the code still works.
export function useScanSheet() {
  const [Sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const open = () => {
    if (loading) return;
    setLoading(true); setError('');
    import('../components/ScanSheet.jsx')
      .then((m) => setSheet(() => m.default))
      .catch(() => setError(S.scanLoadFailed))
      .finally(() => setLoading(false));
  };
  const close = useCallback(() => setSheet(null), []);
  return { Sheet, open, close, loading, error };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix parent test -- lib/qrScan.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add parent/src/lib/qrScan.js parent/src/lib/qrScan.test.js parent/src/components/ScanSheet.jsx parent/src/hooks/useScanSheet.js
git commit -m "Let the scanner tell learner and advisory slips apart"
```

---

### Task 11: Join rules and copy

**Files:**
- Create: `parent/src/lib/join.js`, `parent/src/lib/join.test.js`
- Modify: `parent/src/strings.js`, `parent/src/lib/strings.test.js`

**Interfaces:**
- Consumes: `isDepedEmail`, `conflictingRole` (`shared/schoolAccess.js`); `normalizeCode` (`parent/src/lib/qrScan.js`).
- Produces:
  - `JOIN_ROLES = ['family', 'adviser', 'subject_teacher']`
  - `heldRoles(context, familyLinks) → string[]`, `pendingRoles(context) → string[]`
  - `roleOptions({ held, pending, selected, email }) → [{ key, state: 'available'|'selected'|'held'|'blocked', active: boolean, needsApproval: boolean }]`
  - `toggleRole(selected, key, options) → string[]`
  - `joinSteps(options) → string[]` (keys whose state is `selected`, in `JOIN_ROLES` order)
  - `initialSelection(query) → string[]`, `initialCode(query, role) → string`
  - `landingMode(results, familyLinks) → { view, hasClass }` where `results[role] = { outcome: 'active'|'pending'|'failed', detail }`
  - `codeDraft(value) → string` (≤ 8 normalised chars), `prettyCode(value) → 'XXXX-XXXX'`

- [ ] **Step 1: Write the failing tests**

Create `parent/src/lib/join.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { JOIN_ROLES, heldRoles, pendingRoles, roleOptions, toggleRole, joinSteps, initialSelection, initialCode, landingMode, codeDraft, prettyCode } from './join.js';

const state = (options, key) => options.find((o) => o.key === key);
describe('join rules', () => {
  it('lists the three roles, family first', () => {
    expect(JOIN_ROLES).toEqual(['family', 'adviser', 'subject_teacher']);
  });
  it('reads held and pending roles from the school context and family links', () => {
    const context = { assignments: [{ role: 'adviser' }, { role: 'curriculum_adviser' }], myRequests: [{ role: 'subject_teacher', status: 'pending' }, { role: 'adviser', status: 'rejected' }] };
    expect(heldRoles(context, [{}])).toEqual(['adviser', 'family']);
    expect(heldRoles(null, [])).toEqual([]);
    expect(pendingRoles(context)).toEqual(['subject_teacher']);
  });
  it('blocks the other teacher role once one is chosen, held or pending', () => {
    let options = roleOptions({ held: [], pending: [], selected: ['adviser'], email: 'a@deped.gov.ph' });
    expect(state(options, 'adviser').state).toBe('selected');
    expect(state(options, 'subject_teacher').state).toBe('blocked');
    expect(state(options, 'family').state).toBe('available');
    options = roleOptions({ held: ['subject_teacher'], pending: [], selected: [], email: 'a@deped.gov.ph' });
    expect(state(options, 'subject_teacher').state).toBe('held');
    expect(state(options, 'adviser').state).toBe('blocked');
    options = roleOptions({ held: [], pending: ['adviser'], selected: [], email: 'a@deped.gov.ph' });
    expect(state(options, 'subject_teacher').state).toBe('blocked');
  });
  it('keeps Family addable for parents who already linked a learner', () => {
    const options = roleOptions({ held: ['family'], pending: [], selected: ['family'], email: 'p@gmail.com' });
    expect(state(options, 'family')).toMatchObject({ state: 'selected', active: true, needsApproval: false });
  });
  it('tags teacher roles as needing approval for personal emails only', () => {
    expect(state(roleOptions({ held: [], pending: [], selected: [], email: 'p@gmail.com' }), 'adviser').needsApproval).toBe(true);
    expect(state(roleOptions({ held: [], pending: [], selected: [], email: 'p@deped.gov.ph' }), 'adviser').needsApproval).toBe(false);
  });
  it('toggles only roles that can change, and steps follow role order', () => {
    const options = roleOptions({ held: [], pending: [], selected: ['subject_teacher'], email: '' });
    expect(toggleRole(['subject_teacher'], 'adviser', options)).toEqual(['subject_teacher']);
    expect(toggleRole(['subject_teacher'], 'family', options)).toEqual(['subject_teacher', 'family']);
    expect(toggleRole(['subject_teacher'], 'subject_teacher', options)).toEqual([]);
    expect(joinSteps(roleOptions({ held: [], pending: [], selected: ['subject_teacher', 'family'], email: '' }))).toEqual(['family', 'subject_teacher']);
    expect(joinSteps(roleOptions({ held: ['adviser'], pending: [], selected: ['adviser'], email: '' }))).toEqual([]);
  });
  it('preselects from a slip link and hands the code to its step', () => {
    expect(initialSelection({ a: 'ABCD2345' })).toEqual(['adviser']);
    expect(initialSelection({ c: 'ABCD2345' })).toEqual(['family']);
    expect(initialSelection({ role: 'family' })).toEqual(['family']);
    expect(initialSelection({})).toEqual([]);
    expect(initialCode({ a: 'abcd2345' }, 'adviser')).toBe('ABCD2345');
    expect(initialCode({ a: 'abcd2345' }, 'family')).toBe('');
  });
  it('lands teacher-only accounts in School and everyone else in Family', () => {
    expect(landingMode({ adviser: { outcome: 'active' } }, [])).toEqual({ view: 'school', hasClass: true });
    expect(landingMode({ subject_teacher: { outcome: 'active' } }, [])).toEqual({ view: 'school', hasClass: false });
    expect(landingMode({ adviser: { outcome: 'active' }, family: { outcome: 'active' } }, [])).toEqual({ view: 'family', hasClass: false });
    expect(landingMode({ adviser: { outcome: 'pending' } }, [])).toEqual({ view: 'family', hasClass: false });
    expect(landingMode({ subject_teacher: { outcome: 'active' } }, [{}])).toEqual({ view: 'family', hasClass: false });
  });
  it('formats typed codes like the server reads them', () => {
    expect(codeDraft('abcd-o1il-xyz')).toBe('ABCD0111');
    expect(prettyCode('ABCD0111')).toBe('ABCD-0111');
    expect(prettyCode('ABC')).toBe('ABC');
  });
});
```

Append to `parent/src/lib/strings.test.js` inside the main `describe`:

```js
  it('has the join strings', () => {
    for (const k of ['joinTitle', 'joinIntro', 'joinNameLabel', 'joinNameHint', 'joinRolesLabel', 'joinFamily', 'joinFamilyHint', 'joinAdviser', 'joinAdviserHint',
      'joinSubject', 'joinSubjectHint', 'joinNeedsApproval', 'joinNeedsApprovalNote', 'joinActive', 'joinChooseOne', 'joinContinue', 'joinStep', 'joinSteps',
      'joinStepOf', 'joinOf', 'joinPreparing', 'joinPrepareFailed', 'joinSkipStep', 'adviserSlipTitle', 'adviserSlipBody', 'adviserScan', 'adviserScanTitle',
      'adviserCodeLabel', 'adviserCheck', 'adviserConfirmTitle', 'adviserConfirm', 'adviserNotMine', 'adviserNoSlip', 'adviserUseSlip', 'adviserRequestTitle',
      'adviserRequestBody', 'adviserWrongKind', 'familyWrongKind', 'adviserRequestInstead', 'subjectTitle', 'subjectBody', 'subjectBodyApproval', 'subjectSubmit',
      'summaryTitle', 'summaryLinked', 'summaryAdviser', 'summarySubject', 'summaryPending', 'summaryRetry', 'summaryContinue', 'summarySkipped',
      'addRoleRow', 'addRoleRowHint', 'schoolRequestsRow', 'requestFulfilled', 'requestSuperseded'])
      expect(typeof S[k], k).toBe('string');
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm --prefix parent test -- lib/join.test.js lib/strings.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `parent/src/lib/join.js`:

```js
import { isDepedEmail, conflictingRole } from '../../../shared/schoolAccess.js';
import { normalizeCode } from './qrScan.js';

// "Who are you?" (spec 2026-10-19). Family can pair with one school role;
// Class Adviser and Subject Teacher never go together.
export const JOIN_ROLES = ['family', 'adviser', 'subject_teacher'];

export function heldRoles(context, familyLinks = []) {
  const roles = (context?.assignments || []).map((a) => a.role).filter((r) => r !== 'family' && JOIN_ROLES.includes(r));
  return [...new Set([...roles, ...(familyLinks.length ? ['family'] : [])])];
}
export const pendingRoles = (context) => (context?.myRequests || []).filter((r) => r.status === 'pending').map((r) => r.role);

export function roleOptions({ held = [], pending = [], selected = [], email = '' }) {
  const deped = isDepedEmail(email);
  return JOIN_ROLES.map((key) => {
    // A parent may always link another learner, so Family is never locked.
    if (key === 'family') return { key, state: selected.includes(key) ? 'selected' : 'available', active: held.includes(key), needsApproval: false };
    if (held.includes(key)) return { key, state: 'held', active: true, needsApproval: false };
    const blocked = conflictingRole([...held, ...pending, ...selected], key);
    return { key, state: blocked ? 'blocked' : selected.includes(key) ? 'selected' : 'available', active: false, needsApproval: !deped };
  });
}

export function toggleRole(selected, key, options) {
  const option = options.find((o) => o.key === key);
  if (!option || option.state === 'held' || option.state === 'blocked') return selected;
  return selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
}

export const joinSteps = (options) => options.filter((o) => o.state === 'selected').map((o) => o.key);

export function initialSelection(query = {}) {
  if (query.a) return ['adviser'];
  if (query.c || query.role === 'family') return ['family'];
  if (query.role === 'adviser' || query.role === 'subject_teacher') return [query.role];
  return [];
}
export const codeDraft = (value) => normalizeCode(value).slice(0, 8);
export const initialCode = (query = {}, role) => codeDraft((role === 'adviser' ? query.a : role === 'family' ? query.c : '') || '');
export const prettyCode = (value) => (value.length > 4 ? `${value.slice(0, 4)}-${value.slice(4)}` : value);

export function landingMode(results = {}, familyLinks = []) {
  const active = (role) => results[role]?.outcome === 'active';
  const school = active('adviser') || active('subject_teacher');
  const family = active('family') || familyLinks.length > 0;
  return school && !family ? { view: 'school', hasClass: active('adviser') } : { view: 'family', hasClass: false };
}
```

In `parent/src/strings.js`, add after the `schoolAccess*` block (check every new value against `location`, `tracking`, `live`):

```js
  joinTitle: 'Who are you?',
  joinIntro: 'Choose how you use the app. You can add a role later in Settings.',
  joinNameLabel: 'Your name',
  joinNameHint: 'The school sees this name on your links and requests.',
  joinRolesLabel: 'I am a…',
  joinFamily: 'Family Member',
  joinFamilyHint: "I'm a parent or guardian of a BNHS learner.",
  joinAdviser: 'Class Adviser',
  joinAdviserHint: 'I have an advisory slip for my section.',
  joinSubject: 'Subject Teacher',
  joinSubjectHint: 'I teach a grade level and need school notices.',
  joinNeedsApproval: 'Needs approval',
  joinNeedsApprovalNote: "Your account isn't a DepEd email, so an Administrator or Curriculum Adviser approves school roles.",
  joinActive: 'Active',
  joinChooseOne: 'Choose Adviser or Subject Teacher, not both.',
  joinContinue: 'Continue',
  joinStep: 'step',
  joinSteps: 'steps',
  joinStepOf: 'Step',
  joinOf: 'of',
  joinPreparing: 'Getting your account ready…',
  joinPrepareFailed: 'Could not set up your account. Check your connection and try again.',
  joinSkipStep: 'Skip this step',
  adviserSlipTitle: 'Your advisory slip',
  adviserSlipBody: 'The Administrator or your Academic Coordinator gives each class adviser one slip. It works once.',
  adviserScan: 'Scan the advisory slip',
  adviserScanTitle: 'Scan advisory slip',
  adviserCodeLabel: 'Advisory slip code',
  adviserCheck: 'Check slip',
  adviserConfirmTitle: 'Is this your advisory class?',
  adviserConfirm: 'Yes, make me the adviser',
  adviserNotMine: 'Not my section',
  adviserNoSlip: 'No slip? Request your section instead',
  adviserUseSlip: 'I have an advisory slip',
  adviserRequestTitle: 'Request your advisory section',
  adviserRequestBody: 'An Administrator or the Curriculum Adviser for the grade reviews this. A request gives no access until it is approved.',
  adviserRequestInstead: 'Request the section instead',
  adviserWrongKind: 'This is a learner activation slip. Scan the advisory slip for your section.',
  familyWrongKind: 'This is an advisory slip for a class adviser. Scan the learner activation slip.',
  subjectTitle: 'Which grades do you teach?',
  subjectBody: 'You will see school notices for these grades.',
  subjectBodyApproval: 'An Administrator or the Curriculum Adviser for each grade approves this.',
  subjectSubmit: 'Save grades',
  summaryTitle: "You're set",
  summaryLinked: 'Linked to',
  summaryAdviser: 'Class Adviser of',
  summarySubject: 'Subject Teacher · Grades',
  summaryPending: 'Waiting for approval',
  summarySkipped: 'Skipped',
  summaryRetry: 'Try again',
  summaryContinue: 'Open the app',
  addRoleRow: 'Add a role',
  addRoleRowHint: 'Family Member, Class Adviser or Subject Teacher',
  schoolRequestsRow: 'My school requests',
```

(`requestFulfilled` and `requestSuperseded` were added in Task 7.)

- [ ] **Step 4: Run them to verify they pass**

Run: `npm --prefix parent test -- lib/join.test.js lib/strings.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add parent/src/lib/join.js parent/src/lib/join.test.js parent/src/strings.js parent/src/lib/strings.test.js
git commit -m "Add the role chooser rules and copy"
```

---

### Task 12: The Join flow screens

**Files:**
- Create: `parent/src/screens/Join.jsx`, `parent/src/screens/join/RoleChooser.jsx`, `parent/src/screens/join/FamilyStep.jsx`, `parent/src/screens/join/AdviserStep.jsx`, `parent/src/screens/join/SubjectTeacherStep.jsx`, `parent/src/screens/join/JoinSummary.jsx`, `parent/src/screens/join/StepHeader.jsx`

**Interfaces:**
- Consumes: everything from Task 11; `useScanSheet` (Task 10); `useSchoolContext`, `useLinks`, `useDoc`; `callable` from `parent/src/firebase.js`; `schoolError`, `sectionsByGrade`, `ROLE_LABELS` from `parent/src/lib/school.js`; `schoolHome` from `parent/src/lib/portalMode.js`; `RELATIONSHIPS`; `nameCase`.
- Step component contract: props `{ user, name, school, query, navigate, label, onDone(result), onSkip() }` where `label` is the "Step 1 of 2 · Family" text and `result = { outcome: 'active'|'pending', detail: string }`.
- Produces: default `Join({ user, profile, route, navigate, setMode })`.

No unit tests here: the project tests Parent App logic in `lib/` (done in Task 11) and verifies screens in the browser (Task 14).

- [ ] **Step 1: Shared step header**

Create `parent/src/screens/join/StepHeader.jsx`:

```jsx
import S from '../../strings.js';
import { T } from '../../styles.js';

// "Step 1 of 2 · Family Member" above each role step, then the step title.
export default function StepHeader({ label, title, children }) {
  return (
    <>
      <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: T.inkMuted }}>{label}</p>
      <h1 style={{ fontSize: 20, margin: '0 0 6px' }}>{title}</h1>
      {children && <p style={{ marginTop: 0 }}>{children}</p>}
    </>
  );
}
export const stepLabel = (index, total, roleLabel) => `${S.joinStepOf} ${index + 1} ${S.joinOf} ${total} · ${roleLabel}`;
```

- [ ] **Step 2: Role chooser**

Create `parent/src/screens/join/RoleChooser.jsx`:

```jsx
import S from '../../strings.js';
import { T } from '../../styles.js';
import { Banner, Btn, Card, Field, Inp } from '../../components/ui.jsx';
import { toggleRole, joinSteps } from '../../lib/join.js';

export const ROLE_TEXT = {
  family: [S.joinFamily, S.joinFamilyHint],
  adviser: [S.joinAdviser, S.joinAdviserHint],
  subject_teacher: [S.joinSubject, S.joinSubjectHint],
};
const tag = { fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 999, border: `1px solid ${T.border}`, color: T.inkMuted };

function RoleCard({ option, onToggle }) {
  const checked = option.state === 'selected' || option.state === 'held';
  const locked = option.state === 'held' || option.state === 'blocked';
  const [title, hint] = ROLE_TEXT[option.key];
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-disabled={locked} onClick={locked ? undefined : onToggle}
      style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, alignItems: 'start', width: '100%', minHeight: 64, textAlign: 'left',
        padding: '12px 14px', borderRadius: T.radius, font: 'inherit', color: T.ink, cursor: locked ? 'default' : 'pointer',
        background: checked ? 'rgba(var(--t-primary-rgb),0.10)' : T.surface,
        border: `1.5px solid ${checked ? T.primary : T.border}`, opacity: option.state === 'blocked' ? 0.62 : 1 }}>
      <span aria-hidden="true" style={{ width: 24, height: 24, marginTop: 2, borderRadius: 7, display: 'grid', placeItems: 'center', fontWeight: 800,
        border: `2px solid ${checked ? T.primary : T.border}`, background: checked ? T.primary : 'transparent', color: T.onPrimary }}>{checked ? '✓' : ''}</span>
      <span>
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 16 }}>{title}</strong>
          {option.active && <span style={tag}>{S.joinActive}</span>}
          {!option.active && option.needsApproval && <span style={tag}>{S.joinNeedsApproval}</span>}
        </span>
        <span style={{ display: 'block', fontSize: 14, color: T.inkMuted, marginTop: 2 }}>{option.state === 'blocked' ? S.joinChooseOne : hint}</span>
      </span>
    </button>
  );
}

export default function RoleChooser({ name, setName, options, selected, setSelected, onContinue, error }) {
  const steps = joinSteps(options);
  const anyApproval = options.some((o) => o.state === 'selected' && o.needsApproval);
  const ready = name.trim().length >= 2 && steps.length > 0;
  return (
    <Card>
      <h1 style={{ fontSize: 20, marginTop: 0 }}>{S.joinTitle}</h1>
      <p>{S.joinIntro}</p>
      {error && <Banner tone="danger">{error}</Banner>}
      <Field label={S.joinNameLabel} hint={S.joinNameHint}>
        <Inp autoComplete="name" autoCapitalize="words" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div role="group" aria-label={S.joinRolesLabel} style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        {options.map((o) => <RoleCard key={o.key} option={o} onToggle={() => setSelected(toggleRole(selected, o.key, options))} />)}
      </div>
      {anyApproval && <p style={{ fontSize: 13, color: T.inkMuted }}>{S.joinNeedsApprovalNote}</p>}
      <Btn onClick={onContinue} disabled={!ready} style={{ width: '100%' }}>
        {ready ? `${S.joinContinue} · ${steps.length} ${steps.length === 1 ? S.joinStep : S.joinSteps}` : S.joinContinue}
      </Btn>
    </Card>
  );
}
```

- [ ] **Step 3: Family step (moved from `Activate.jsx`)**

Create `parent/src/screens/join/FamilyStep.jsx`:

```jsx
import { useState } from 'react';
import { callable } from '../../firebase.js';
import S from '../../strings.js';
import { Banner, Btn, Card, Field, Inp, Sel } from '../../components/ui.jsx';
import { useDoc } from '../../hooks/useDoc.js';
import { useScanSheet } from '../../hooks/useScanSheet.js';
import { RELATIONSHIPS } from '../../lib/relationships.js';
import { codeDraft, initialCode, prettyCode } from '../../lib/join.js';
import StepHeader from './StepHeader.jsx';

export default function FamilyStep({ name, query, navigate, label, onDone, onSkip }) {
  const portal = useDoc('settings/parent_portal').data;
  const [code, setCode] = useState(() => initialCode(query, 'family'));
  const [relationship, setRelationship] = useState('Mother');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const scan = useScanSheet();
  const scanned = (value, kind) => { scan.close(); if (kind !== 'learner') { setErr(S.familyWrongKind); return; } setCode(value); setErr(''); };
  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    let consentVersion = portal?.consentVersion ?? 1;
    try { const stored = localStorage.getItem('bnhs-parent-consent'); if (stored) consentVersion = Number(stored); } catch {}
    try {
      const r = await callable('activateCodeFn')({ code, relationship, consentVersion, guardianName: name.trim() });
      onDone({ outcome: 'active', detail: r.data.displayName });
    } catch { setErr(S.activateFailed); }
    finally { setBusy(false); }
  };
  return (
    <Card>
      <StepHeader label={label} title={S.activateTitle}>{S.activateBody}</StepHeader>
      {(err || scan.error) && <Banner tone="danger">{err || scan.error}</Banner>}
      <Btn variant="ghost" onClick={scan.open} disabled={scan.loading || busy} style={{ width: '100%', marginBottom: 14 }}>{S.scanButton}</Btn>
      <Field label={S.activateCodeLabel}><Inp inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" value={prettyCode(code)}
        onChange={(e) => setCode(codeDraft(e.target.value))} style={{ letterSpacing: '0.12em', fontSize: 20, textAlign: 'center' }} /></Field>
      <Field label={S.activateRelationship}>
        <Sel value={relationship} onChange={(e) => setRelationship(e.target.value)}>{RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}</Sel>
      </Field>
      <Btn onClick={submit} disabled={busy || code.length !== 8} style={{ width: '100%' }}>{S.activateButton}</Btn>
      <p style={{ textAlign: 'center' }}><a href="/request-access" onClick={(e) => { e.preventDefault(); navigate('/request-access'); }}>{S.activateNoSlip}</a></p>
      <Btn variant="ghost" onClick={onSkip} disabled={busy} style={{ width: '100%' }}>{S.joinSkipStep}</Btn>
      {scan.Sheet && <scan.Sheet kind="learner" onCode={scanned} onClose={scan.close} />}
    </Card>
  );
}
```

- [ ] **Step 4: Adviser step**

Create `parent/src/screens/join/AdviserStep.jsx`:

```jsx
import { useState } from 'react';
import { callable } from '../../firebase.js';
import S from '../../strings.js';
import { Banner, Btn, Card, Field, Inp, Sel } from '../../components/ui.jsx';
import { useScanSheet } from '../../hooks/useScanSheet.js';
import { isDepedEmail } from '../../../../shared/schoolAccess.js';
import { codeDraft, initialCode, prettyCode } from '../../lib/join.js';
import { schoolError, sectionLabel, sectionsByGrade } from '../../lib/school.js';
import StepHeader from './StepHeader.jsx';

export default function AdviserStep({ user, school, query, label, onDone, onSkip }) {
  const deped = isDepedEmail(user.email);
  const [mode, setMode] = useState(deped ? 'slip' : 'request');
  const [code, setCode] = useState(() => initialCode(query, 'adviser'));
  const [preview, setPreview] = useState(null);
  const [sectionId, setSectionId] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const scan = useScanSheet();
  const sections = school.data?.sections || [];
  const run = async (fn) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr({ text: schoolError(e), deped: String(e?.code || '').endsWith('permission-denied') }); }
    finally { setBusy(false); }
  };
  const check = () => run(async () => setPreview((await callable('previewAdvisorySlipFn')({ code })).data));
  const redeem = () => run(async () => { const r = (await callable('redeemAdvisorySlipFn')({ code })).data; onDone({ outcome: 'active', detail: r.sectionLabel }); });
  const request = () => run(async () => {
    await callable('requestSchoolRoleFn')({ role: 'adviser', sectionId });
    onDone({ outcome: 'pending', detail: sectionLabel(sections.find((s) => s.id === sectionId)) });
  });
  const scanned = (value, kind) => { scan.close(); if (kind !== 'advisory') { setErr({ text: S.adviserWrongKind }); return; } setCode(value); setPreview(null); setErr(null); };
  const toRequest = () => { setMode('request'); setErr(null); setPreview(null); };

  if (school.data?.ended) return <Card><StepHeader label={label} title={S.adviserRequestTitle}>{S.schoolAccessEnded}</StepHeader>
    <Btn variant="ghost" onClick={onSkip} style={{ width: '100%' }}>{S.joinSkipStep}</Btn></Card>;

  if (mode === 'slip' && preview) return (
    <Card>
      <StepHeader label={label} title={S.adviserConfirmTitle} />
      {err && <Banner tone="danger">{err.text}</Banner>}
      <p style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 16px' }}>{preview.sectionLabel}</p>
      <div style={{ display: 'grid', gap: 10 }}>
        <Btn onClick={redeem} disabled={busy}>{S.adviserConfirm}</Btn>
        <Btn variant="ghost" onClick={() => { setPreview(null); setCode(''); }} disabled={busy}>{S.adviserNotMine}</Btn>
      </div>
    </Card>
  );

  if (mode === 'slip') return (
    <Card>
      <StepHeader label={label} title={S.adviserSlipTitle}>{S.adviserSlipBody}</StepHeader>
      {(err || scan.error) && <Banner tone="danger" action={err?.deped ? <Btn variant="ghost" onClick={toRequest}>{S.adviserRequestInstead}</Btn> : undefined}>{err?.text || scan.error}</Banner>}
      <Btn variant="ghost" onClick={scan.open} disabled={scan.loading || busy} style={{ width: '100%', marginBottom: 14 }}>{S.adviserScan}</Btn>
      <Field label={S.adviserCodeLabel}><Inp inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" value={prettyCode(code)}
        onChange={(e) => { setCode(codeDraft(e.target.value)); setPreview(null); }} style={{ letterSpacing: '0.12em', fontSize: 20, textAlign: 'center' }} /></Field>
      <Btn onClick={check} disabled={busy || code.length !== 8} style={{ width: '100%' }}>{S.adviserCheck}</Btn>
      <p style={{ textAlign: 'center' }}><a href="#request" onClick={(e) => { e.preventDefault(); toRequest(); }}>{S.adviserNoSlip}</a></p>
      <Btn variant="ghost" onClick={onSkip} disabled={busy} style={{ width: '100%' }}>{S.joinSkipStep}</Btn>
      {scan.Sheet && <scan.Sheet kind="advisory" title={S.adviserScanTitle} onCode={scanned} onClose={scan.close} />}
    </Card>
  );

  return (
    <Card>
      <StepHeader label={label} title={S.adviserRequestTitle}>{deped ? S.adviserRequestBody : `${S.joinNeedsApprovalNote} ${S.adviserRequestBody}`}</StepHeader>
      {err && <Banner tone="danger">{err.text}</Banner>}
      <Field label={S.schoolAccessSection}><Sel required value={sectionId} disabled={busy} onChange={(e) => setSectionId(e.target.value)}>
        <option value="">{S.schoolAccessChooseSection}</option>
        {sectionsByGrade(sections).map((g) => <optgroup key={g.grade} label={`${S.schoolAccessGrade} ${g.grade}`}>
          {g.sections.map((s) => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}</optgroup>)}</Sel></Field>
      <Btn onClick={request} disabled={busy || !sectionId} style={{ width: '100%' }}>{S.schoolAccessSubmit}</Btn>
      {deped && <p style={{ textAlign: 'center' }}><a href="#slip" onClick={(e) => { e.preventDefault(); setMode('slip'); setErr(null); }}>{S.adviserUseSlip}</a></p>}
      <Btn variant="ghost" onClick={onSkip} disabled={busy} style={{ width: '100%' }}>{S.joinSkipStep}</Btn>
    </Card>
  );
}
```

- [ ] **Step 5: Subject Teacher step**

Create `parent/src/screens/join/SubjectTeacherStep.jsx`:

```jsx
import { useState } from 'react';
import { callable } from '../../firebase.js';
import S from '../../strings.js';
import { T } from '../../styles.js';
import { Banner, Btn, Card } from '../../components/ui.jsx';
import { isDepedEmail } from '../../../../shared/schoolAccess.js';
import { schoolError } from '../../lib/school.js';
import StepHeader from './StepHeader.jsx';

const GRADES = [7, 8, 9, 10, 11, 12];

export default function SubjectTeacherStep({ user, school, label, onDone, onSkip }) {
  const deped = isDepedEmail(user.email);
  const [grades, setGrades] = useState([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const toggle = (g) => setGrades((list) => (list.includes(g) ? list.filter((x) => x !== g) : [...list, g].sort((a, b) => a - b)));
  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const r = (await callable('requestSchoolRoleFn')({ role: 'subject_teacher', gradeLevels: grades })).data;
      onDone({ outcome: r.status === 'granted' ? 'active' : 'pending', detail: grades.join(', ') });
    } catch (e) { setErr(schoolError(e)); }
    finally { setBusy(false); }
  };
  if (school.data?.ended) return <Card><StepHeader label={label} title={S.subjectTitle}>{S.schoolAccessEnded}</StepHeader>
    <Btn variant="ghost" onClick={onSkip} style={{ width: '100%' }}>{S.joinSkipStep}</Btn></Card>;
  return (
    <Card>
      <StepHeader label={label} title={S.subjectTitle}>{deped ? S.subjectBody : `${S.subjectBody} ${S.subjectBodyApproval}`}</StepHeader>
      {err && <Banner tone="danger">{err}</Banner>}
      <div role="group" aria-label={S.subjectTitle} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {GRADES.map((g) => {
          const on = grades.includes(g);
          return <button key={g} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(g)} disabled={busy}
            style={{ minHeight: T.tap, borderRadius: T.pill, font: 'inherit', fontWeight: 600, cursor: 'pointer',
              border: `1.5px solid ${on ? T.primary : T.border}`, background: on ? T.primary : T.surface, color: on ? T.onPrimary : T.ink }}>
            {on ? '✓ ' : ''}{`${S.schoolAccessGrade} ${g}`}</button>;
        })}
      </div>
      <Btn onClick={submit} disabled={busy || !grades.length} style={{ width: '100%' }}>{S.subjectSubmit}</Btn>
      <Btn variant="ghost" onClick={onSkip} disabled={busy} style={{ width: '100%', marginTop: 10 }}>{S.joinSkipStep}</Btn>
    </Card>
  );
}
```

- [ ] **Step 6: Summary**

Create `parent/src/screens/join/JoinSummary.jsx`:

```jsx
import S from '../../strings.js';
import { T } from '../../styles.js';
import { Btn, Card } from '../../components/ui.jsx';
import { nameCase } from '../../lib/format.js';
import { ROLE_TEXT } from './RoleChooser.jsx';

const line = (role, result) => {
  const title = ROLE_TEXT[role][0];
  if (!result) return `${title} · ${S.summarySkipped}`;
  if (result.outcome === 'pending') return `${title} · ${S.summaryPending}`;
  if (role === 'family') return `${S.summaryLinked} ${nameCase(result.detail)}`;
  if (role === 'adviser') return `${S.summaryAdviser} ${result.detail}`;
  return `${S.summarySubject} ${result.detail}`;
};

export default function JoinSummary({ steps, results, onRetry, onOpen }) {
  return (
    <Card>
      <h1 style={{ fontSize: 20, marginTop: 0 }}>{S.summaryTitle}</h1>
      <ul style={{ listStyle: 'none', margin: '0 0 16px', padding: 0 }}>
        {steps.map((role) => {
          const result = results[role];
          const done = result?.outcome === 'active';
          return (
            <li key={role} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: `1px solid ${T.border}` }}>
              <span><span aria-hidden="true" style={{ marginRight: 8, color: done ? T.ok : T.inkMuted }}>{done ? '✓' : '•'}</span>{line(role, result)}</span>
              {!result && <Btn variant="ghost" onClick={() => onRetry(role)}>{S.summaryRetry}</Btn>}
            </li>
          );
        })}
      </ul>
      <Btn onClick={onOpen} style={{ width: '100%' }}>{S.summaryContinue}</Btn>
    </Card>
  );
}
```

- [ ] **Step 7: Orchestrator**

Create `parent/src/screens/Join.jsx`:

```jsx
import { useMemo, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { callable } from '../firebase.js';
import S from '../strings.js';
import { Spinner } from '../components/ui.jsx';
import { useSchoolContext } from '../hooks/useSchoolContext.js';
import { useLinks } from '../hooks/useLinks.js';
import { heldRoles, pendingRoles, roleOptions, joinSteps, initialSelection, landingMode } from '../lib/join.js';
import { schoolHome } from '../lib/portalMode.js';
import RoleChooser, { ROLE_TEXT } from './join/RoleChooser.jsx';
import FamilyStep from './join/FamilyStep.jsx';
import AdviserStep from './join/AdviserStep.jsx';
import SubjectTeacherStep from './join/SubjectTeacherStep.jsx';
import JoinSummary from './join/JoinSummary.jsx';
import { stepLabel } from './join/StepHeader.jsx';

const CONSENT_KEY = 'bnhs-parent-consent';
const STEPS = { family: FamilyStep, adviser: AdviserStep, subject_teacher: SubjectTeacherStep };

// "Who are you?" then one step per chosen role (spec 2026-10-19). Each step
// saves on its own; a skipped or failed step can be retried from the summary.
export default function Join({ user, profile, route, navigate, setMode }) {
  const school = useSchoolContext(user.uid);
  const { links } = useLinks(user.uid);
  const [name, setName] = useState(profile?.displayName || user.displayName || '');
  const [selected, setSelected] = useState(() => initialSelection(route.query));
  const [phase, setPhase] = useState('choose');
  const [steps, setSteps] = useState([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState({});
  const [error, setError] = useState('');
  const options = useMemo(() => roleOptions({ held: heldRoles(school.data, links || []), pending: pendingRoles(school.data), selected, email: user.email }),
    [school.data, links, selected, user.email]);

  const start = async () => {
    setError(''); setPhase('preparing');
    try {
      const trimmed = name.trim();
      if (user.displayName !== trimmed) {
        await updateProfile(user, { displayName: trimmed }).catch(() => {});
        await user.getIdToken(true).catch(() => {});
      }
      // Same as Skip used to do: the profile exists before any role step runs.
      if (!profile) {
        let accepted; try { accepted = Number(localStorage.getItem(CONSENT_KEY)); } catch {}
        await callable('acceptConsentFn')({ acceptedConsentVersion: accepted });
      }
      setSteps(joinSteps(options)); setIndex(0); setPhase('step');
    } catch (e) {
      if (String(e?.code || '').endsWith('failed-precondition')) { navigate('/consent'); return; }
      setError(S.joinPrepareFailed); setPhase('choose');
    }
  };
  // After a step (or a retry from the summary), go to the next step that has no
  // answer yet; a skipped step is recorded as null so it is not revisited.
  const next = (role, result) => {
    const merged = { ...results, [role]: result };
    setResults(merged);
    const after = steps.findIndex((r, i) => i > steps.indexOf(role) && !(r in merged));
    if (after !== -1) setIndex(after); else setPhase('summary');
  };
  const retry = (role) => { setIndex(steps.indexOf(role)); setPhase('step'); };
  const open = () => {
    const mode = landingMode(results, links || []);
    setMode(mode);
    school.refresh();
    navigate(mode.view === 'school' ? schoolHome(mode) : '/', { replace: true });
  };

  if (phase === 'preparing') return <Spinner label={S.joinPreparing} />;
  if (phase === 'summary') return <JoinSummary steps={steps} results={results} onRetry={retry} onOpen={open} />;
  if (phase === 'step') {
    const role = steps[index];
    const Step = STEPS[role];
    return <Step key={`${role}:${index}`} user={user} name={name} school={school} query={route.query} navigate={navigate}
      label={stepLabel(index, steps.length, ROLE_TEXT[role][0])}
      onDone={(result) => next(role, result)} onSkip={() => next(role, results[role] || null)} />;
  }
  if (school.loading && !school.data) return <Spinner label={S.loading} />;
  return <RoleChooser name={name} setName={setName} options={options} selected={selected} setSelected={setSelected} onContinue={start} error={error || school.error} />;
}
```

- [ ] **Step 8: Run the Parent App tests and the colour literal test**

Run: `npm --prefix parent test` and `npx vitest run shared/theme/literals.test.js`
Expected: PASS (no hex colours in the new `.jsx` files).

- [ ] **Step 9: Commit**

```bash
git add parent/src/screens/Join.jsx parent/src/screens/join
git commit -m "Add the Join flow: role chooser, role steps and summary"
```

---

### Task 13: Route new and existing users through Join

**Files:**
- Modify: `parent/src/lib/router.js`, `parent/src/lib/router.test.js`, `parent/src/App.jsx`, `parent/src/screens/Settings.jsx`, `parent/src/screens/settings/SchoolAccessPage.jsx`, `parent/src/screens/Home.jsx`, `parent/src/screens/settings/LearnersPage.jsx`
- Delete: `parent/src/screens/Activate.jsx`

**Interfaces:**
- Consumes: `Join` (Task 12).
- Produces: route `join` at `/join`; `/activate` renders Join too.

- [ ] **Step 1: Write the failing router test**

In `parent/src/lib/router.test.js`, inside `matches static and param routes with query`, add:

```js
    expect(matchRoute('/join', '?a=ABCD2345')).toEqual({ name: 'join', params: {}, query: { a: 'ABCD2345' } });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix parent test -- lib/router.test.js`
Expected: FAIL — `notFound`.

- [ ] **Step 3: Implement the route**

In `parent/src/lib/router.js`, after `['activate', /^\/activate$/],` add:

```js
  ['join', /^\/join$/],
```

Run: `npm --prefix parent test -- lib/router.test.js` — Expected: PASS.

- [ ] **Step 4: Rewire `App.jsx`**

1. Replace `const Activate = routeScreen(() => import('./screens/Activate.jsx'));` with:

```js
const Join = routeScreen(() => import('./screens/Join.jsx'));
```

2. After `const CONSENT_KEY = 'bnhs-parent-consent';` add:

```js
const hasLocalConsent = () => { try { return localStorage.getItem(CONSENT_KEY) !== null; } catch { return false; } };
// App routes an account without a profile cannot open yet; it registers through /join first.
const GATED = ['home', 'school', 'learner', 'inbox', 'settings', 'report', 'announcements', 'announcement'];
```

3. Replace

```js
  const portal = useDoc(profile ? 'settings/parent_portal' : null).data;
```

with

```js
  // Read for every signed-in account (rules allow it), so the profile created
  // during /join never flashes a loading screen that would reset the flow.
  const portal = useDoc(user ? 'settings/parent_portal' : null).data;
```

and update the two comment lines above it to say the same.

4. Before `if (user === undefined) return <Spinner label={S.loading} />;` add:

```js
  // Registration happens on /join, so the profile appearing mid-flow never swaps the screen underneath it.
  const mustJoin = profile === null && GATED.includes(route.name) && hasLocalConsent();
  useEffect(() => { if (mustJoin) navigate('/join', { replace: true }); }, [mustJoin, navigate]);
```

5. Replace the `consented` block:

```js
  const consented = Boolean(profile) || hasLocalConsent();
```

6. Replace the Consent gate line and the following `else if` with:

```js
  const toJoin = (v) => { try { localStorage.setItem(CONSENT_KEY, String(v)); } catch {} navigate(['activate', 'join'].includes(route.name) ? `/join${window.location.search}` : '/join', { replace: true }); };
  if (!profile && !consented && route.name !== 'requestAccess') { gate = true; screen = <Consent {...props} onAccepted={toJoin} />; }
  else if (!profile && GATED.includes(route.name)) { gate = true; screen = <Spinner label={S.loading} />; }
```

7. In the `switch`, replace the `consent` and `activate` cases with:

```js
    case 'consent': screen = <Consent {...props} onAccepted={toJoin} />; break;
    case 'join': case 'activate': screen = <Join {...props} />; break;
```

8. Update the comment above the first-time flow: `First-time flow: consent → /join (who are you?) → role steps. Deep links to /activate?c= and ?a= survive.`

9. Delete `parent/src/screens/Activate.jsx`.

- [ ] **Step 5: Point the entry points at Join**

- `parent/src/screens/Home.jsx` line 71: `navigate('/activate')` → `navigate('/join?role=family')`.
- `parent/src/screens/settings/LearnersPage.jsx` line 17: `navigate('/activate')` → `navigate('/join?role=family')`.
- `parent/src/screens/Settings.jsx`, replace the `schoolAccessRow` row (lines 95–96) with:

```jsx
        <SettingsRow tile="teal" icon="class" label={S.addRoleRow} subtitle={S.addRoleRowHint} onClick={() => navigate('/join')} />
        {schoolContext?.myRequests?.length > 0 && <SettingsRow tile="teal" icon="class" label={S.schoolRequestsRow}
          value={schoolContext.myRequests.some((r) => r.status === 'pending') ? S.requestPending : undefined} onClick={() => navigate('/settings/school-access')} />}
```

- `parent/src/screens/settings/SchoolAccessPage.jsx`: remove the `form` state, `submit`, the request `<form>` and the `Field`/`Sel` imports; keep the "My requests" card. Replace the first card's body with:

```jsx
        <Card>
          <p style={{ marginTop: 0, fontSize: 14 }}>{S.schoolAccessIntro}</p>
          {context.ended ? <p style={{ fontSize: 14 }}>{S.schoolAccessEnded}</p>
            : <Btn onClick={() => ctx.navigate('/join')}>{S.addRoleRow}</Btn>}
        </Card>
```

and in the list item replace `sectionLabel(sections.find((s) => s.id === r.sectionId))` with `scopeLabel(r, sections)` (update the import from `../../lib/school.js` to `ROLE_LABELS, REQUEST_STATUS, scopeLabel`).

- [ ] **Step 6: Run the Parent App suite and size check**

Run: `npm --prefix parent test` then `npm --prefix parent run build` (load `VITE_*` from the main checkout's `parent/.env` into this process only, per Task 0 notes) then `npm --prefix parent run size`.
Expected: tests PASS; build succeeds; size stays under the 260 KB limit. `grep -rn "Activate.jsx\|'/activate'" parent/src` returns nothing except router entries.

- [ ] **Step 7: Commit**

```bash
git add -A parent/src
git commit -m "Route registration through Join and replace Activate"
```

---

### Task 14: End-to-end verification and docs

**Files:**
- Modify: `docs/parent-portal-adviser-guide.md`, `docs/school-family-access-rollout.md`

- [ ] **Step 1: Run every suite**

Run, in order:
- `npm test`
- `npm --prefix functions test`
- `npm --prefix parent test`
- `npm run test:rules`
- `npm run test:functions` (about 15 minutes; run in the background)

Expected: all PASS. Fix failures before continuing; do not mark this step done with a failing suite.

- [ ] **Step 2: Browser pass against the emulators**

Start the emulators with seed data and both dev servers (SIMS on its default port, Parent App on 5174) using the project's launch configuration. Then check, taking screenshots at 375 px and desktop width, light and dark:

1. SIMS as admin → Sections: Adviser column shows *No adviser in app*; **Print slips for sections without an adviser** → confirm → panel shows slips; print preview shows only the slips with the dark band, on Folio.
2. SIMS as a Grade 8 GLC: only Grade 8 sections offer **Advisory slip**.
3. Parent App, new DepEd account: Verify → Consent → **Who are you?** → tick Family + Class Adviser (Subject Teacher shows "Choose Adviser or Subject Teacher, not both.") → Continue · 2 steps → link a learner → type the advisory code → **Check slip** shows the section → confirm → Summary shows both → **Open the app** lands in Family.
4. Same advisory code again from another DepEd account → generic failure.
5. Personal-email account: teacher cards show **Needs approval**; Adviser step opens on the section request; Subject Teacher with Grades 7 and 8 → Summary shows *Waiting for approval*; a Grade 7 Curriculum Adviser sees both in Settings → School requests.
6. Open `http://localhost:5174/activate?a=<code>` signed out → sign in → Consent → chooser opens with Class Adviser ticked and the code filled in.
7. Settings → **Add a role** with an existing adviser: Class Adviser shows *Active*; Subject Teacher is blocked.

Record anything that fails as a fix in the relevant task's files, re-run that task's tests, and commit.

- [ ] **Step 3: Update the guides**

In `docs/parent-portal-adviser-guide.md`, add a section "Becoming a class adviser" that says: sign in with your `@deped.gov.ph` account, choose **Class Adviser** on *Who are you?*, scan the advisory slip from the Administrator or your Academic Coordinator, check the section name, confirm; the slip works once; without a DepEd email or without a slip, request the section and wait for an Administrator or the grade's Curriculum Adviser.

In `docs/school-family-access-rollout.md`, add a rollout section with the order: deploy functions and rules → call `migrateSubjectTeachersFn` once as an administrator and resolve every reported conflict → deploy SIMS (respecting the release-tree hold) → deploy the Parent App.

- [ ] **Step 4: Commit**

```bash
git add docs/parent-portal-adviser-guide.md docs/school-family-access-rollout.md
git commit -m "Document advisory slips and the registration rollout"
```
