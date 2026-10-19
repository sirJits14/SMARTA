# School Access Review Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers request school roles in the Parent App. Administrators (in SIMS) and Curriculum Advisers (in the app) approve them. SIMS gets Pending, Coverage, Assignments and History views, plus a pending badge, bulk approve, "Not opened yet" tracking and CSV export.

**Architecture:** All school data stays behind App Check callables in `functions/src/handlers/schoolAccess.js`. The approval rule lives in `shared/schoolAccess.js`, which is synced into functions. SIMS splits the old `SchoolAccessTab.jsx` into a `school/` folder of small views over one `useSchoolAccess` hook. Pure logic sits in `src/lib/schoolAssignments.js`. The Parent App adds two Settings sub-pages and a once-a-day "opened" ping.

**Tech Stack:** React 19 + Vite, Firebase Functions v2 (Node 22, firebase-admin 13), Firestore, Vitest 4 (node env), Firebase emulators.

**Spec:** `docs/superpowers/specs/2026-10-18-school-access-review-queue-design.md`

## Global Constraints

- Requestable roles are `adviser` and `subject_teacher` only. `curriculum_adviser` stays administrator-assigned.
- An approval reason is optional: an empty one is stored as `'Approved'`. A rejection or replace reason is required, 1–500 characters.
- A Curriculum Adviser may approve or reject only `adviser` requests from verified `@deped.gov.ph` accounts in a grade where they hold a current `curriculum_adviser` assignment. They never use Replace or bulk approve, and nobody approves their own request.
- One adviser per section per year (`school_adviser_locks`) stays the rule. Replace moves the lock in the same transaction.
- No Firestore rules changes. `school_role_requests`, `school_accounts` and `school_adviser_locks` stay closed to clients. `audit_log` is already admin-readable.
- **Spec deviation (deliberate):** History reads `audit_log` directly from SIMS, the same way the existing Audit log tab does, instead of through a new `getSchoolHistoryFn`.
- SIMS role labels come from `ROLE_LABELS` in `parent/src/lib/school.js` (Adviser / Subject Teacher / Curriculum Adviser). Every Parent App user-visible string goes in `parent/src/strings.js`, and the words "location", "tracking" and "live" are banned there.
- Match the surrounding code: compact lines, single quotes, two-space indent, and few short comments that explain *why*.
- Implement locally only: no deploy and no live data changes.
- Environment notes (Windows worktree): for a Parent App build in this worktree, temporarily junction the main checkout's `parent/node_modules/jsqr`. If the emulators fail to resolve `localhost`, set `NODE_OPTIONS=--dns-result-order=ipv4first`. Never kill `node` by name; stop only the PID or task you started.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Test commands used throughout

```bash
npx vitest run shared/schoolAccess.test.js
npx vitest run src/lib/schoolAssignments.test.js
npx firebase emulators:exec --only firestore,auth "npm --prefix functions run test:emulator -- schoolAccess"
npm --prefix parent test -- src/lib/school.test.js src/lib/strings.test.js
```

The emulator command runs `scripts/syncShared.mjs` first (via `pretest:emulator`), so shared edits reach `functions/shared/`.

---

### Task 1: Curriculum Adviser approval rule

**Files:**
- Modify: `shared/schoolAccess.js`
- Test: `shared/schoolAccess.test.js`

**Interfaces:**
- Produces: `REQUESTABLE_ROLES: string[]`, `isDepedEmail(email): boolean`, and an updated `canApproveRoleRequest(actor, request): boolean`. `request` carries `{ uid, email, emailVerified, role, gradeLevel, schoolYear, status }`.

- [ ] **Step 1: Write the failing test**

In `shared/schoolAccess.test.js`, change the import line to:

```js
import { canReviewSection, canCorrectSession, canApproveRoleRequest, isFamilyLink, assignmentKey, isDepedEmail, REQUESTABLE_ROLES } from './schoolAccess.js';
```

Replace the block that starts `// A DepEd requester inside the Curriculum Adviser's grade still needs an administrator.` (the `for (const role of [...])` loop and its comment) with:

```js
    // Curriculum Advisers approve adviser requests from verified DepEd accounts in their own grades only.
    expect(canApproveRoleRequest(actor('curriculum_adviser'), request)).toBe(true);
    for (const patch of [{ email: 'teacher@gmail.com' }, { emailVerified: false }, { gradeLevel: 8 }, { role: 'subject_teacher' }, { uid: 'actor' }]) {
      expect(canApproveRoleRequest(actor('curriculum_adviser'), { ...request, ...patch })).toBe(false);
    }
    for (const role of ['adviser', 'subject_teacher']) expect(canApproveRoleRequest(actor(role), request)).toBe(false);
    expect(canApproveRoleRequest(actor('curriculum_adviser', { schoolYear: '2027-2028' }), request)).toBe(false);
  });
  it('recognises DepEd accounts and requestable roles', () => {
    expect(isDepedEmail(' Ana@DepEd.gov.ph ')).toBe(true);
    expect(isDepedEmail('ana@deped.gov.ph.evil.com')).toBe(false);
    expect(isDepedEmail(undefined)).toBe(false);
    expect(REQUESTABLE_ROLES).toEqual(['adviser', 'subject_teacher']);
```

The `actor()` helper gives a `curriculum_adviser` assignment `gradeLevel: 7`, and the request's `gradeLevel` is 7.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/schoolAccess.test.js`
Expected: FAIL, because `isDepedEmail is not a function` and the curriculum approval expectation is `false`.

- [ ] **Step 3: Write minimal implementation**

In `shared/schoolAccess.js`, add these lines below `SCHOOL_ROLE_LABELS`:

```js
// Teachers may ask for these; Curriculum Adviser stays administrator-assigned.
export const REQUESTABLE_ROLES = ['adviser', 'subject_teacher'];
export const isDepedEmail = email => typeof email === 'string' && /@deped\.gov\.ph$/i.test(email.trim());
```

Replace `canApproveRoleRequest` and its comment with:

```js
// Administrators approve any request. A Curriculum Adviser approves only adviser
// requests from verified DepEd accounts in a grade they are assigned to.
export function canApproveRoleRequest(actor, request) {
  if (!actor || request?.status !== 'pending' || actor.uid === request.uid || request.schoolYear !== actor.schoolYear) return false;
  if (actor.isAdmin === true) return true;
  return request.role === 'adviser' && request.emailVerified === true && isDepedEmail(request.email)
    && currentAssignments(actor).some(a => a.role === 'curriculum_adviser' && a.gradeLevel === request.gradeLevel);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared/schoolAccess.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/schoolAccess.js shared/schoolAccess.test.js
git commit -m "Let Curriculum Advisers approve in-grade DepEd adviser requests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Teacher requests and withdrawal (backend)

**Files:**
- Modify: `functions/src/handlers/schoolAccess.js`
- Test: `functions/test/emulator/schoolAccess.test.js`

**Interfaces:**
- Consumes: `REQUESTABLE_ROLES` (Task 1).
- Produces: `requestSchoolRole(deps, { role, sectionId }) → { id, status: 'pending' }`, `withdrawSchoolRequest(deps, { requestId }) → { ok: true }`, and helpers inside the module: `requestKey(uid, assignment)`, `teacherOf(person) → { teacherEmail, teacherName }`, `millis(ts) → number|null`.

- [ ] **Step 1: Write the failing tests**

In `functions/test/emulator/schoolAccess.test.js`, change the import to:

```js
import { requestSchoolRole, withdrawSchoolRequest, resolveSchoolRole, assignSchoolRole, revokeSchoolRole, getSchoolContext, loadSchoolActor, deleteSchoolAccess } from '../../src/handlers/schoolAccess.js';
```

In the test `removes old-year access and refuses ended-year changes`, change its last line to:

```js
    await expect(requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC1' })).rejects.toMatchObject({ code: 'failed-precondition' });
```

Delete the whole test `retires in-app role requests`. At the end of the file, add:

```js
describe('teacher requests', () => {
  it('records a pending request that grants nothing, and dedupes repeats', async () => {
    const first = await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC1' });
    const again = await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC1' });
    expect(again.id).toBe(first.id);
    expect((await db().doc(`school_role_requests/${first.id}`).get()).data()).toMatchObject({ uid: 'teacher', email: 'teacher@deped.gov.ph',
      emailVerified: true, role: 'adviser', sectionId: 'SEC1', gradeLevel: 7, schoolYear: year, status: 'pending' });
    expect((await loadSchoolActor(deps('teacher'))).assignments).toEqual([]);
    const audit = (await db().collection('audit_log').get()).docs.map(d => d.data());
    expect(audit).toEqual([expect.objectContaining({ action: 'school.requested', details: expect.objectContaining({ teacherEmail: 'teacher@deped.gov.ph' }) })]);
  });
  it('never takes Curriculum Adviser requests', async () => {
    await expect(requestSchoolRole(deps('teacher'), { role: 'curriculum_adviser', gradeLevel: 7 }))
      .rejects.toMatchObject({ code: 'permission-denied', message: 'An administrator assigns Curriculum Adviser access.' });
  });
  it('lets a teacher withdraw only their own pending request', async () => {
    const { id } = await requestSchoolRole(deps('teacher'), { role: 'subject_teacher', sectionId: 'SEC1' });
    await expect(withdrawSchoolRequest(deps('personal'), { requestId: id })).rejects.toMatchObject({ code: 'not-found' });
    await withdrawSchoolRequest(deps('teacher'), { requestId: id });
    expect((await db().doc(`school_role_requests/${id}`).get()).data().status).toBe('withdrawn');
    await expect(withdrawSchoolRequest(deps('teacher'), { requestId: id })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx firebase emulators:exec --only firestore,auth "npm --prefix functions run test:emulator -- schoolAccess"`
Expected: FAIL, because `withdrawSchoolRequest is not a function` and `requestSchoolRole` rejects with `permission-denied`.

- [ ] **Step 3: Write minimal implementation**

In `functions/src/handlers/schoolAccess.js`:

Replace the shared import line and add the rate limiter import:

```js
import { SCHOOL_ROLES, REQUESTABLE_ROLES, assignmentKey, canApproveRoleRequest } from '../../shared/schoolAccess.js';
import { enforceRateLimit } from '../callable.js';
```

Below `const fingerprint = ...`, add:

```js
const requestKey = (uid, assignment) => fingerprint(JSON.stringify([uid, assignmentKey(assignment)]));
// Audit rows carry the teacher's name so History reads without another lookup.
const teacherOf = person => ({ teacherEmail: (person?.email || '').toLowerCase(), teacherName: person?.displayName || person?.email || '' });
const millis = value => (value?.toMillis ? value.toMillis() : null);
```

Replace the retired `requestSchoolRole` stub and its comment with:

```js
// Teachers ask from the Parent App; a request confers nothing until approved.
export async function requestSchoolRole(deps, input) {
  if (!REQUESTABLE_ROLES.includes(input.role)) fail('permission-denied', 'An administrator assigns Curriculum Adviser access.');
  const user = await liveUser(deps.auth, deps.uid);
  await enforceRateLimit(deps.db, deps.uid, 'schoolRoleRequest', { windowMs: 3600000, max: 30 }, (deps.now || (() => new Date()))().getTime());
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    const assignment = await assignmentFrom(deps, tx, actor, input);
    if (actor.assignments.some(a => assignmentKey(a) === assignmentKey(assignment))) fail('already-exists', 'This assignment is already active.');
    const key = requestKey(deps.uid, assignment);
    const ref = deps.db.doc(`school_role_requests/${key}`);
    const existing = await tx.get(ref);
    const pending = await tx.get(deps.db.collection('school_role_requests').where('uid', '==', deps.uid).where('status', '==', 'pending'));
    if (existing.data()?.status === 'pending') return { id: key, status: 'pending' };
    if (pending.size >= 20) fail('resource-exhausted', 'Wait for your pending requests to be reviewed.');
    tx.set(ref, { ...assignment, uid: deps.uid, email: user.email.toLowerCase(), emailVerified: true,
      displayName: user.displayName || actor.displayName, status: 'pending', createdAt: FieldValue.serverTimestamp() });
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'school.requested', deps.uid, { ...assignment, ...teacherOf(user) }));
    return { id: key, status: 'pending' };
  });
}

export async function withdrawSchoolRequest(deps, input) {
  if (!id(input.requestId)) fail('invalid-argument', 'Choose a request.');
  const ref = deps.db.doc(`school_role_requests/${input.requestId}`);
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    const request = (await tx.get(ref)).data();
    if (!request || request.uid !== deps.uid) fail('not-found', 'Request not found.');
    if (request.status !== 'pending') fail('failed-precondition', 'This request was already reviewed.');
    tx.update(ref, { status: 'withdrawn', reason: 'Withdrawn by the teacher', reviewedAt: FieldValue.serverTimestamp() });
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'school.requestWithdrawn', deps.uid, { requestId: ref.id,
      role: request.role, sectionId: request.sectionId || '', gradeLevel: request.gradeLevel, ...teacherOf(request) }));
    return { ok: true };
  });
}
```

`teacherOf(request)` works because a request stores `email` and `displayName`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx firebase emulators:exec --only firestore,auth "npm --prefix functions run test:emulator -- schoolAccess"`
Expected: PASS (the whole `schoolAccess` file)

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/schoolAccess.js functions/test/emulator/schoolAccess.test.js
git commit -m "Restore teacher school role requests with withdrawal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Approvals record who, when and why

**Files:**
- Modify: `functions/src/handlers/schoolAccess.js`
- Test: `functions/test/emulator/schoolAccess.test.js`

**Interfaces:**
- Consumes: `canApproveRoleRequest` (Task 1), `teacherOf` (Task 2).
- Produces:
  - Assignment entries gain `assignedAt: Timestamp`, `assignedBy: string` (the actor's email) and `source: 'direct'|'legacy'|'request'|'replace'`.
  - `writeGrant(tx, prepared, actor, user, assignment, source)` writes a `school.assigned` audit row only for `direct` and `legacy`. Requests and replacements audit themselves.
  - `inboxRef(db, uid, key)`.
  - `assignSchoolRole` accepts `input.source === 'legacy'`.
  - `resolveSchoolRole` makes the approval reason optional, sends a rejection inbox note `{ type: 'school_access', rejected: true }`, and lets a rejection skip section validation.

- [ ] **Step 1: Write the failing tests**

Replace the test `a request gives no access; a Curriculum Adviser cannot approve a DepEd request in their grade, an administrator can` with:

```js
  it('a request gives no access; a Curriculum Adviser approves an in-grade DepEd adviser request without a reason', async () => {
    const r = await seedRequest('teacher', 'adviser', 'SEC1');
    expect((await loadSchoolActor(deps('teacher'))).assignments).toEqual([]);
    await resolveSchoolRole(deps('curriculum'), { requestId: r.id, approve: true });
    const [entry] = (await loadSchoolActor(deps('teacher'))).assignments;
    expect(entry).toMatchObject({ role: 'adviser', sectionId: 'SEC1', schoolYear: year, source: 'request', assignedBy: 'ca@deped.gov.ph' });
    expect(entry.assignedAt.toMillis()).toBeGreaterThan(0);
    expect((await db().doc(`school_role_requests/${r.id}`).get()).data()).toMatchObject({ status: 'approved', reason: 'Approved', reviewedBy: 'curriculum' });
  });
  it('keeps subject-teacher requests with administrators', async () => {
    const r = await seedRequest('teacher', 'subject_teacher', 'SEC1');
    await expect(resolveSchoolRole(deps('curriculum'), { requestId: r.id, approve: true })).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('a rejection needs a reason and tells the teacher why', async () => {
    const r = await seedRequest('teacher', 'adviser', 'SEC1');
    await expect(resolveSchoolRole(deps('admin'), { requestId: r.id, approve: false })).rejects.toMatchObject({ code: 'invalid-argument' });
    await db().doc('sections/SEC1').delete();
    await resolveSchoolRole(deps('admin'), { requestId: r.id, approve: false, reason: 'Not your section this year' });
    const inbox = (await db().collection('guardians/teacher/inbox').get()).docs.map(d => d.data());
    expect(inbox).toEqual([expect.objectContaining({ type: 'school_access', rejected: true, body: 'Reason: Not your section this year' })]);
    expect((await db().doc(`school_role_requests/${r.id}`).get()).data().status).toBe('rejected');
  });
  it('stamps direct and legacy assignments with who and how', async () => {
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1', source: 'legacy' });
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'subject_teacher', sectionId: 'SEC8' });
    expect((await loadSchoolActor(deps('teacher'))).assignments).toMatchObject([
      { source: 'legacy', assignedBy: 'admin@school.test' }, { source: 'direct', assignedBy: 'admin@school.test' }]);
  });
```

The rejection test deletes `SEC1` before rejecting, which proves a rejection does not need a valid section.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx firebase emulators:exec --only firestore,auth "npm --prefix functions run test:emulator -- schoolAccess"`
Expected: FAIL, because a reason-less approval throws `invalid-argument`, there is no `source` on assignments, and there is no rejection inbox note.

- [ ] **Step 3: Write minimal implementation**

In `functions/src/handlers/schoolAccess.js`, change the Firestore import to:

```js
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
```

Below `millis`, add:

```js
// Approvals may omit a reason; rejections must tell the teacher why.
const decisionReason = (approve, value) => (approve && !(typeof value === 'string' && value.trim()) ? 'Approved' : reasonValue(value));
const inboxRef = (db, uid, key) => db.doc(`guardians/${uid}/inbox/school_${fingerprint(key).slice(0, 32)}`);
```

Replace `writeGrant` with:

```js
// serverTimestamp cannot sit inside an array, so assignedAt uses the function's clock.
function writeGrant(tx, prepared, actor, user, assignment, source) {
  if (prepared.exists) return;
  const db = prepared.accountRef.firestore;
  tx.set(prepared.accountRef, { uid: user.uid, email: user.email.toLowerCase(), displayName: user.displayName || user.email,
    assignments: [...prepared.assignments, { ...assignment, assignedAt: Timestamp.now(), assignedBy: actor.email, source }],
    updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (prepared.lock) tx.set(prepared.lock, { uid: user.uid, ...assignment });
  // Approvals and replacements write their own audit row.
  if (source === 'direct' || source === 'legacy') tx.set(db.collection('audit_log').doc(), auditRow(actor, 'school.assigned', user.uid, { ...assignment, source, ...teacherOf(user) }));
  tx.set(inboxRef(db, user.uid, assignmentKey(assignment)), {
    type: 'school_access', title: 'School access approved',
    body: 'You can now use the app for school work. Switch to School in Settings.', createdAt: FieldValue.serverTimestamp() });
}
```

Replace `resolveSchoolRole` with:

```js
export async function resolveSchoolRole(deps, input) {
  if (!id(input.requestId) || typeof input.approve !== 'boolean') fail('invalid-argument', 'Choose a request and a decision.');
  const reason = decisionReason(input.approve, input.reason);
  const ref = deps.db.doc(`school_role_requests/${input.requestId}`);
  const first = (await ref.get()).data();
  if (!first) fail('not-found', 'Request not found.');
  const user = await liveUser(deps.auth, first.uid);
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    if (actor.ended) fail('failed-precondition', 'This school year has ended.');
    const request = (await tx.get(ref)).data();
    if (!request || request.uid !== user.uid || request.email !== user.email.toLowerCase()) fail('failed-precondition', 'The requesting account changed. Ask the teacher to submit a new request.');
    // Live Auth verification is authoritative, never a caller-supplied field.
    if (!canApproveRoleRequest(actor, { ...request, email: user.email, emailVerified: user.emailVerified })) fail('permission-denied', 'You cannot review this request.');
    let scope = { role: request.role, sectionId: request.sectionId || '', gradeLevel: request.gradeLevel };
    if (input.approve) {
      const assignment = await assignmentFrom(deps, tx, actor, request);
      if (assignment.gradeLevel !== request.gradeLevel) fail('failed-precondition', 'The section changed grades. Ask for a new request.');
      writeGrant(tx, await prepareGrant(deps.db, tx, user.uid, assignment), actor, user, assignment, 'request');
      scope = assignment;
    } else {
      tx.set(inboxRef(deps.db, user.uid, `rejected:${ref.id}`), { type: 'school_access', rejected: true,
        title: 'School access request not approved', body: `Reason: ${reason}`, createdAt: FieldValue.serverTimestamp() });
    }
    tx.update(ref, { status: input.approve ? 'approved' : 'rejected', reviewedBy: actor.uid, reviewedAt: FieldValue.serverTimestamp(), reason });
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, input.approve ? 'school.requestApproved' : 'school.requestRejected', user.uid,
      { requestId: ref.id, reason, ...scope, ...teacherOf(user) }));
    return { ok: true };
  });
}
```

`prepareGrant` does its reads before `writeGrant`'s writes, so the transaction's read-before-write order holds.

In `assignSchoolRole`, replace `writeGrant(tx, prepared, current, user, assignment);` with:

```js
    writeGrant(tx, prepared, current, user, assignment, input.source === 'legacy' ? 'legacy' : 'direct');
```

In `revokeSchoolRole`, replace the audit line with:

```js
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'school.revoked', input.uid, { ...target, reason, ...teacherOf(account) }));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx firebase emulators:exec --only firestore,auth "npm --prefix functions run test:emulator -- schoolAccess"`
Expected: PASS. The existing test `serializes two adviser assignments...` still sees 3 audit rows: direct assign, revoke, direct assign.

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/schoolAccess.js functions/test/emulator/schoolAccess.test.js
git commit -m "Record who assigned each school role and tell rejected teachers why" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Replace adviser and bulk approve

**Files:**
- Modify: `functions/src/handlers/schoolAccess.js`
- Test: `functions/test/emulator/schoolAccess.test.js`

**Interfaces:**
- Consumes: `writeGrant(..., source)`, `resolveSchoolRole` (Task 3).
- Produces:
  - `replaceAdviser(deps, { requestId, reason }) → { ok: true }` (admin only).
  - `resolveSchoolRoles(deps, { requestIds: string[≤25], reason? }) → { results: [{ id, ok: true } | { id, ok: false, error: string }] }` (admin only).

- [ ] **Step 1: Write the failing tests**

Change the import to add `replaceAdviser, resolveSchoolRoles`:

```js
import { requestSchoolRole, withdrawSchoolRequest, resolveSchoolRole, resolveSchoolRoles, replaceAdviser, assignSchoolRole, revokeSchoolRole, getSchoolContext, loadSchoolActor, deleteSchoolAccess } from '../../src/handlers/schoolAccess.js';
```

Append:

```js
describe('replacing and bulk approval', () => {
  it('replaces the current adviser in one audited step, administrators only', async () => {
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1' });
    const { id } = await requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC1' });
    await expect(resolveSchoolRole(deps('admin'), { requestId: id, approve: true })).rejects.toMatchObject({ code: 'already-exists' });
    await expect(replaceAdviser(deps('curriculum'), { requestId: id, reason: 'Moved' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(replaceAdviser(deps('admin'), { requestId: id })).rejects.toMatchObject({ code: 'invalid-argument' });
    await replaceAdviser(deps('admin'), { requestId: id, reason: 'Teacher moved to Grade 8' });
    expect((await loadSchoolActor(deps('teacher'))).assignments).toEqual([]);
    expect((await loadSchoolActor(deps('personal'))).assignments).toMatchObject([{ role: 'adviser', sectionId: 'SEC1', source: 'replace' }]);
    expect((await db().doc('school_adviser_locks/2026-2027_SEC1').get()).data().uid).toBe('personal');
    expect((await db().doc(`school_role_requests/${id}`).get()).data()).toMatchObject({ status: 'approved', reason: 'Teacher moved to Grade 8' });
    const replaced = (await db().collection('audit_log').where('action', '==', 'school.replaced').get()).docs.map(d => d.data().details);
    expect(replaced).toEqual([expect.objectContaining({ previousUid: 'teacher', previousEmail: 'teacher@deped.gov.ph', teacherEmail: 'teacher@gmail.com' })]);
  });
  it('refuses Replace when nobody else holds the section', async () => {
    const { id } = await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC1' });
    await expect(replaceAdviser(deps('admin'), { requestId: id, reason: 'Moved' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('bulk approval reports each request and never stops at a failure', async () => {
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC8' });
    const clean = await requestSchoolRole(deps('teacher'), { role: 'subject_teacher', sectionId: 'SEC1' });
    const taken = await requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC8' });
    const { results } = await resolveSchoolRoles(deps('admin'), { requestIds: [taken.id, clean.id, 'missing'] });
    expect(results).toEqual([
      { id: taken.id, ok: false, error: 'This section already has an adviser. An administrator must revoke that assignment first.' },
      { id: clean.id, ok: true },
      { id: 'missing', ok: false, error: 'Request not found.' },
    ]);
    await expect(resolveSchoolRoles(deps('curriculum'), { requestIds: [clean.id] })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(resolveSchoolRoles(deps('admin'), { requestIds: [] })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx firebase emulators:exec --only firestore,auth "npm --prefix functions run test:emulator -- schoolAccess"`
Expected: FAIL, because `replaceAdviser is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add these lines after `resolveSchoolRole`:

```js
// One transaction moves the section from the current adviser to the requester,
// so the section is never without an adviser and never has two.
export async function replaceAdviser(deps, input) {
  if (!id(input.requestId)) fail('invalid-argument', 'Choose a request.');
  const reason = reasonValue(input.reason);
  const ref = deps.db.doc(`school_role_requests/${input.requestId}`);
  const first = (await ref.get()).data();
  if (!first) fail('not-found', 'Request not found.');
  const user = await liveUser(deps.auth, first.uid);
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    if (!actor.isAdmin) fail('permission-denied', 'Administrators only.');
    const request = (await tx.get(ref)).data();
    if (!request || request.uid !== user.uid || request.email !== user.email.toLowerCase()) fail('failed-precondition', 'The requesting account changed. Ask the teacher to submit a new request.');
    if (!canApproveRoleRequest(actor, { ...request, email: user.email, emailVerified: user.emailVerified })) fail('permission-denied', 'You cannot review this request.');
    if (request.role !== 'adviser') fail('failed-precondition', 'Only adviser requests can replace an adviser.');
    const assignment = await assignmentFrom(deps, tx, actor, request);
    if (assignment.gradeLevel !== request.gradeLevel) fail('failed-precondition', 'The section changed grades. Ask for a new request.');
    const lock = lockRef(deps.db, assignment);
    const holder = (await tx.get(lock)).data();
    if (!holder || holder.uid === user.uid) fail('failed-precondition', 'This section has no other adviser. Approve the request instead.');
    const previousRef = deps.db.doc(`school_accounts/${holder.uid}`);
    const accountRef = deps.db.doc(`school_accounts/${user.uid}`);
    const [previous, account] = await Promise.all([tx.get(previousRef), tx.get(accountRef)]);
    const key = assignmentKey(assignment);
    if (previous.exists) tx.update(previousRef, { assignments: (previous.data().assignments || []).filter(a => assignmentKey(a) !== key), updatedAt: FieldValue.serverTimestamp() });
    const assignments = account.data()?.assignments || [];
    writeGrant(tx, { accountRef, lock, assignments, exists: assignments.some(a => assignmentKey(a) === key) }, actor, user, assignment, 'replace');
    tx.update(ref, { status: 'approved', reviewedBy: actor.uid, reviewedAt: FieldValue.serverTimestamp(), reason });
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'school.replaced', user.uid, { requestId: ref.id, reason, ...assignment,
      previousUid: holder.uid, previousEmail: previous.data()?.email || '', ...teacherOf(user) }));
    return { ok: true };
  });
}

// Requests run one by one so a section conflict fails only its own request.
export async function resolveSchoolRoles(deps, input) {
  const ids = Array.isArray(input.requestIds) ? [...new Set(input.requestIds)] : [];
  if (!ids.length || ids.length > 25 || !ids.every(value => id(value))) fail('invalid-argument', 'Choose 1–25 requests.');
  if (!(await loadSchoolActor(deps)).isAdmin) fail('permission-denied', 'Administrators only.');
  const results = [];
  for (const requestId of ids) {
    try { await resolveSchoolRole(deps, { requestId, approve: true, reason: input.reason }); results.push({ id: requestId, ok: true }); }
    catch (e) { results.push({ id: requestId, ok: false, error: e instanceof CallableError ? e.message : 'Could not approve this request. Try again.' }); }
  }
  return { results };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx firebase emulators:exec --only firestore,auth "npm --prefix functions run test:emulator -- schoolAccess"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/schoolAccess.js functions/test/emulator/schoolAccess.test.js
git commit -m "Add audited adviser replacement and bulk approval" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Opened tracking, pending count, context queues, callables

**Files:**
- Modify: `functions/src/handlers/schoolAccess.js`
- Modify: `functions/index.js:22` (import) and `functions/index.js:100-104` (exports)
- Test: `functions/test/emulator/schoolAccess.test.js`

**Interfaces:**
- Consumes: `millis`, `isDepedEmail` (Task 1).
- Produces:
  - `markSchoolOpened(deps) → { ok: boolean }`.
  - `getSchoolPendingCount(deps) → { count: number }` (admin only).
  - `getSchoolContext` adds:
    - for everyone: `myRequests: [{ id, role, sectionId, gradeLevel, status, reason, createdAt }]`;
    - for admins: `pendingRequests: RequestRow[]`, and each `managedAssignments` item gains numeric `assignedAt`, `assignedBy`, `source` and `lastSchoolOpenAt`;
    - for Curriculum Advisers: `reviewQueue: RequestRow[]`;
    - every `assignments` entry now carries a numeric `assignedAt`.
  - `RequestRow = { id, uid, email, displayName, emailVerified, role, sectionId, gradeLevel, createdAt: number|null, conflict: { uid, email, displayName } | null }`.
  - Callables: `withdrawSchoolRequestFn`, `resolveSchoolRolesFn`, `replaceAdviserFn`, `markSchoolOpenedFn`, `getSchoolPendingCountFn`.

- [ ] **Step 1: Write the failing tests**

Add `markSchoolOpened, getSchoolPendingCount` to the import. Rename the test `omits request queues and groups legacy advisers for administrators` to `groups legacy advisers for administrators only`, leaving its body unchanged. Append:

```js
describe('tracking and queues', () => {
  it('records when an assigned teacher opens School and shows it to administrators', async () => {
    expect(await markSchoolOpened(deps('teacher'))).toEqual({ ok: false });
    expect((await db().doc('school_accounts/teacher').get()).exists).toBe(false);
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1' });
    expect(await markSchoolOpened(deps('teacher'))).toEqual({ ok: true });
    const [item] = (await getSchoolContext(deps('admin'))).managedAssignments.filter(a => a.uid === 'teacher');
    expect(item).toMatchObject({ role: 'adviser', source: 'direct', assignedBy: 'admin@school.test' });
    expect(typeof item.assignedAt).toBe('number');
    expect(item.lastSchoolOpenAt).toBeGreaterThanOrEqual(item.assignedAt);
  });
  it('counts pending requests for administrators only', async () => {
    await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC1' });
    await requestSchoolRole(deps('personal'), { role: 'subject_teacher', sectionId: 'SEC8' });
    expect(await getSchoolPendingCount(deps('admin'))).toEqual({ count: 2 });
    await expect(getSchoolPendingCount(deps('teacher'))).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('gives each audience its own queue, with conflicts named', async () => {
    await assignSchoolRole(deps('admin'), { email: users.personal.email, role: 'adviser', sectionId: 'SEC1' });
    const inGrade = await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC1' });
    await requestSchoolRole(deps('teacher'), { role: 'subject_teacher', sectionId: 'SEC1' });
    await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC8' });
    const admin = await getSchoolContext(deps('admin'));
    expect(admin.pendingRequests).toHaveLength(3);
    expect(admin.pendingRequests.find(r => r.id === inGrade.id).conflict).toEqual({ uid: 'personal', email: 'teacher@gmail.com', displayName: 'teacher@gmail.com' });
    const curriculum = await getSchoolContext(deps('curriculum'));
    expect(curriculum.reviewQueue.map(r => r.id)).toEqual([inGrade.id]);
    expect(curriculum).not.toHaveProperty('pendingRequests');
    const teacher = await getSchoolContext(deps('teacher'));
    expect(teacher.myRequests.map(r => r.status)).toEqual(['pending', 'pending', 'pending']);
    expect(teacher).not.toHaveProperty('reviewQueue');
    expect(teacher).not.toHaveProperty('pendingRequests');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx firebase emulators:exec --only firestore,auth "npm --prefix functions run test:emulator -- schoolAccess"`
Expected: FAIL, because `markSchoolOpened is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `functions/src/handlers/schoolAccess.js`, change the shared import to include `isDepedEmail`:

```js
import { SCHOOL_ROLES, REQUESTABLE_ROLES, assignmentKey, canApproveRoleRequest, isDepedEmail } from '../../shared/schoolAccess.js';
```

Above `getSchoolContext`, add:

```js
const REQUEST_LIMIT = 200;
const plainAssignment = a => ({ ...a, assignedAt: millis(a.assignedAt) });

// Each adviser request names whoever already holds its section, so reviewers see conflicts first.
async function requestRows(tx, db, snaps) {
  const requests = snaps.map(row).sort((a, b) => (millis(a.createdAt) ?? 0) - (millis(b.createdAt) ?? 0));
  const locks = {};
  for (const r of requests) if (r.role === 'adviser') locks[r.sectionId] ??= tx.get(lockRef(db, r)).then(s => s.data() || null);
  const holders = {};
  for (const r of requests) {
    const lock = r.role === 'adviser' ? await locks[r.sectionId] : null;
    if (lock && lock.uid !== r.uid) holders[lock.uid] ??= tx.get(db.doc(`school_accounts/${lock.uid}`)).then(s => s.data() || {});
  }
  return Promise.all(requests.map(async r => {
    const lock = r.role === 'adviser' ? await locks[r.sectionId] : null;
    const holder = lock && lock.uid !== r.uid ? await holders[lock.uid] : null;
    return { id: r.id, uid: r.uid, email: r.email || '', displayName: r.displayName || '', emailVerified: r.emailVerified === true,
      role: r.role, sectionId: r.sectionId || '', gradeLevel: r.gradeLevel, createdAt: millis(r.createdAt),
      conflict: holder ? { uid: lock.uid, email: holder.email || '', displayName: holder.displayName || holder.email || '' } : null };
  }));
}

export async function markSchoolOpened(deps) {
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    if (!actor.assignments.length) return { ok: false };
    tx.set(deps.db.doc(`school_accounts/${deps.uid}`), { lastSchoolOpenAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true };
  });
}

export async function getSchoolPendingCount(deps) {
  const actor = await loadSchoolActor(deps);
  if (!actor.isAdmin) fail('permission-denied', 'Administrators only.');
  const snap = await deps.db.collection('school_role_requests').where('status', '==', 'pending').where('schoolYear', '==', actor.schoolYear).count().get();
  return { count: snap.data().count };
}
```

`row` is already defined in this module (`const row = snap => ({ id: snap.id, ...snap.data() });`). It is declared above `deleteSchoolAccess`, so make sure the new block sits below that line.

Replace `getSchoolContext` with:

```js
export async function getSchoolContext(deps) {
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    const requests = deps.db.collection('school_role_requests');
    const [sections, mine] = await Promise.all([
      tx.get(deps.db.collection('sections').where('schoolYear', '==', actor.schoolYear)),
      tx.get(requests.where('uid', '==', deps.uid)),
    ]);
    const result = { schoolYear: actor.schoolYear, ended: actor.ended, isAdmin: actor.isAdmin, assignments: actor.assignments.map(plainAssignment),
      sections: sections.docs.map(s => ({ id: s.id, name: s.data().name || '', gradeLevel: s.data().gradeLevel, schoolYear: s.data().schoolYear }))
        .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)),
      myRequests: mine.docs.map(row).filter(r => r.schoolYear === actor.schoolYear)
        .map(r => ({ id: r.id, role: r.role, sectionId: r.sectionId || '', gradeLevel: r.gradeLevel, status: r.status,
          reason: r.status === 'rejected' ? r.reason || '' : '', createdAt: millis(r.createdAt) }))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 20) };
    const pendingOf = query => tx.get(query.limit(REQUEST_LIMIT));
    if (actor.isAdmin) {
      const [accounts, legacy, pending] = await Promise.all([
        tx.get(deps.db.collection('school_accounts')),
        tx.get(deps.db.collection('guardian_links').where('status', '==', 'active')),
        pendingOf(requests.where('status', '==', 'pending').where('schoolYear', '==', actor.schoolYear)),
      ]);
      result.managedAssignments = accounts.docs.flatMap(s => (s.data().assignments || []).filter(a => a.schoolYear === actor.schoolYear)
        .map(a => ({ uid: s.id, email: s.data().email || '', displayName: s.data().displayName || '', ...plainAssignment(a), lastSchoolOpenAt: millis(s.data().lastSchoolOpenAt) })));
      result.pendingRequests = await requestRows(tx, deps.db, pending.docs);
      const candidates = legacy.docs.map(row).filter(l => l.schoolYear === actor.schoolYear && (l.slot === 'adviser' || l.relationship === 'Adviser'));
      result.migrationCandidates = candidates;
      const enrollments = await Promise.all(sampleStudentIds(candidates).filter(id).map(studentId => tx.get(deps.db.doc(`enrollments/${studentId}_${actor.schoolYear}`))));
      const sectionByStudent = Object.fromEntries(enrollments.filter(s => s.data()?.status === 'enrolled').map(s => [s.data().studentId, s.data().sectionId]));
      result.legacyAdvisers = groupLegacyAdvisers(candidates, sectionByStudent);
    } else {
      const grades = actor.assignments.filter(a => a.role === 'curriculum_adviser').map(a => a.gradeLevel);
      if (grades.length) {
        const pending = await pendingOf(requests.where('status', '==', 'pending').where('schoolYear', '==', actor.schoolYear).where('role', '==', 'adviser'));
        result.reviewQueue = await requestRows(tx, deps.db, pending.docs.filter(s => grades.includes(s.data().gradeLevel)
          && s.data().uid !== deps.uid && s.data().emailVerified === true && isDepedEmail(s.data().email)));
      }
    }
    return result;
  });
}
```

In `functions/index.js`, replace line 22's import with:

```js
import { getSchoolContext, requestSchoolRole, withdrawSchoolRequest, resolveSchoolRole, resolveSchoolRoles, replaceAdviser, assignSchoolRole, revokeSchoolRole, markSchoolOpened, getSchoolPendingCount } from './src/handlers/schoolAccess.js';
```

Below `export const revokeSchoolRoleFn = schoolCall(revokeSchoolRole);`, add:

```js
export const withdrawSchoolRequestFn = schoolCall(withdrawSchoolRequest);
export const resolveSchoolRolesFn = schoolCall(resolveSchoolRoles);
export const replaceAdviserFn = schoolCall(replaceAdviser);
export const markSchoolOpenedFn = schoolCall(markSchoolOpened);
export const getSchoolPendingCountFn = schoolCall(getSchoolPendingCount);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx firebase emulators:exec --only firestore,auth "npm --prefix functions run test:emulator -- schoolAccess"`
Expected: PASS

Run: `npm --prefix functions test`
Expected: PASS (this proves `index.js` still imports cleanly through any unit tests that load it)

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/schoolAccess.js functions/index.js functions/test/emulator/schoolAccess.test.js
git commit -m "Return school request queues and opened status, and register new callables" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Success, flag and badge styling

**Files:**
- Modify: `shared/theme/theme.css` (light block near line 36, dark block near line 112)
- Modify: `shared/theme/contrast.test.js:27`
- Modify: `src/registrar.css` (after line 57, the `.sims-feedback` rule)
- Modify: `src/components/ui.jsx` (add `CountBadge`)
- Test: `src/components/CountBadge.test.js`

**Interfaces:**
- Produces:
  - CSS classes `.sims-feedback.is-success`, `.sims-flag` with modifiers `--conflict`, `--personal`, `--stale` and `--ok`, plus `.sims-count-badge`, `.sims-sr-only`, `.school-bulk-bar`, `.school-coverage-row` and `.school-gap`.
  - Component `CountBadge({ count, label })`.

- [ ] **Step 1: Write the failing tests**

In `shared/theme/contrast.test.js`, change the line containing `['feedback-ink', 'feedback-bg'],` to:

```js
  ['feedback-ink', 'feedback-bg'], ['success-ink', 'success-bg'], ['primary-deep', 'tint'], ['primary-deep', 'tint-strong'], ['nav-ink', 'tint'],
```

Create `src/components/CountBadge.test.js`:

```js
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CountBadge } from './ui.jsx';

describe('CountBadge', () => {
  it('shows the number and reads it out with its meaning', () => {
    const html = renderToStaticMarkup(React.createElement(CountBadge, { count: 3, label: 'pending school access requests' }));
    expect(html).toContain('<span aria-hidden="true">3</span>');
    expect(html).toContain('<span class="sims-sr-only">3 pending school access requests</span>');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run shared/theme/contrast.test.js src/components/CountBadge.test.js`
Expected: FAIL. `--t-success-ink` does not match the hex pattern, and `CountBadge` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `shared/theme/theme.css`, in the light block directly below `--t-feedback-ink: #982525;`, add:

```css
  --t-success-bg: #ebf7ef;
  --t-success-ink: #14532d;
```

In the dark block (`:root[data-theme="dark"]`), directly below `--t-feedback-ink: #f5a3a3;`, add:

```css
    --t-success-bg: #13301f;
    --t-success-ink: #9fe0b8;
```

In `src/registrar.css`, directly below the `.sims-ui .sims-feedback { ... }` line, add:

```css
  .sims-ui .sims-feedback.is-success { background:var(--t-success-bg); color:var(--t-success-ink); }
  .sims-ui .sims-sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
  .sims-ui .sims-count-badge { display:inline-grid; place-items:center; min-width:20px; height:20px; padding:0 6px; margin-left:8px; border-radius:999px; background:var(--t-absent); color:var(--t-on-primary); font-size:11px; font-weight:700; line-height:1; font-variant-numeric:tabular-nums; }
  .sims-ui .sims-nav-item .sims-count-badge { margin-left:auto; }
  .sims-ui.is-collapsed .sims-nav-item .sims-count-badge { position:absolute; top:4px; right:4px; min-width:16px; height:16px; padding:0 4px; font-size:10px; }
  .sims-ui .sims-flag { display:inline-flex; align-items:center; border-radius:999px; padding:3px 10px; font-size:12px; font-weight:600; background:var(--t-tint); color:var(--t-primary-deep); }
  .sims-ui .sims-flag--conflict, .sims-ui .sims-flag--stale { background:var(--t-feedback-bg); color:var(--t-feedback-ink); }
  .sims-ui .sims-flag--ok { background:var(--t-success-bg); color:var(--t-success-ink); }
  .sims-ui .school-bulk-bar { position:sticky; bottom:12px; z-index:2; display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:18px; padding:12px 16px; border-radius:14px; background:var(--t-surface); border:1px solid var(--t-border); box-shadow:0 8px 24px rgba(var(--t-ink-rgb),.16); }
  .sims-ui .school-coverage-row { display:grid; grid-template-columns:minmax(120px,1fr) minmax(180px,2fr) auto auto; gap:8px 16px; align-items:center; padding:10px 0; border-top:1px solid var(--t-border); }
  .sims-ui .school-gap { font-weight:700; color:var(--t-danger-text); }
  @media (max-width:720px) { .sims-ui .school-coverage-row { grid-template-columns:1fr; } }
```

In `src/components/ui.jsx`, after the `EmptyState` export, add:

```jsx
// A count that reads as a number on screen and as a phrase to screen readers.
export const CountBadge = ({ count, label }) => (
  <span className="sims-count-badge"><span aria-hidden="true">{count}</span><span className="sims-sr-only">{`${count} ${label}`}</span></span>
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run shared/theme/contrast.test.js src/components/CountBadge.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/theme/theme.css shared/theme/contrast.test.js src/registrar.css src/components/ui.jsx src/components/CountBadge.test.js
git commit -m "Add success feedback, status flags and count badges to SIMS" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: SIMS school access helpers

**Files:**
- Modify: `src/lib/schoolAssignments.js`
- Test: `src/lib/schoolAssignments.test.js`

**Interfaces:**
- Consumes: the `RequestRow` and `managedAssignments` shapes from Task 5.
- Produces:
  - `DAY_MS`, `openedStatus(item) → { opened: boolean, at: number|null }`, `requestFlags(request, now?) → [{ key, label }]`, `relativeAge(ms, now?) → string` and `shortDate(ms) → string`.
  - `coverageByGrade(sections, assignments, pending) → [{ grade, rows: [{ section, adviser|null, subjectTeachers: number, pending|null }], covered, curriculumAdvisers }]`.
  - `filterAssignments(items, { text, grade, role, status }, sections) → items`.
  - `toCsv(rows) → string`, `assignmentCsvRows(items, sections) → rows`, `coverageCsvRows(groups) → rows`.
  - `historyLine(auditRow, sections) → { when, text, reason }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/schoolAssignments.test.js`, and change its import to:

```js
import { legacyAdviserRows, assignmentFromLegacy, DAY_MS, openedStatus, requestFlags, relativeAge, shortDate, coverageByGrade, filterAssignments, toCsv, assignmentCsvRows, coverageCsvRows, historyLine } from './schoolAssignments.js';
```

```js
const now = Date.parse('2026-10-19T08:00:00+08:00');
const sections = [{ id: 'A', name: 'Rizal', gradeLevel: 7 }, { id: 'B', name: 'Bonifacio', gradeLevel: 7 }, { id: 'C', name: 'Mabini', gradeLevel: 8 }];
const ana = { uid: 'u1', displayName: 'Ana Cruz', email: 'ana@deped.gov.ph', role: 'adviser', sectionId: 'A', gradeLevel: 7, assignedAt: now - DAY_MS, assignedBy: 'admin@school.test', source: 'direct', lastSchoolOpenAt: now };
const ben = { uid: 'u2', displayName: 'Ben Dy', email: 'ben@gmail.com', role: 'subject_teacher', sectionId: 'A', gradeLevel: 7, assignedAt: now, lastSchoolOpenAt: now - DAY_MS };
const cara = { uid: 'u3', displayName: 'Cara Uy', email: 'cara@deped.gov.ph', role: 'curriculum_adviser', gradeLevel: 8, assignedAt: null, lastSchoolOpenAt: null };
const dan = { id: 'r1', role: 'adviser', sectionId: 'B', displayName: 'Dan' };

describe('school access tracking', () => {
  it('counts a teacher as opened only after their assignment', () => {
    expect(openedStatus(ana)).toEqual({ opened: true, at: now });
    expect(openedStatus(ben)).toEqual({ opened: false, at: null });
    expect(openedStatus(cara)).toEqual({ opened: false, at: null });
    expect(openedStatus({ assignedAt: null, lastSchoolOpenAt: now })).toEqual({ opened: true, at: now });
  });
  it('flags conflicts, personal emails and stale requests', () => {
    const request = { email: 'x@gmail.com', createdAt: now - 3 * DAY_MS, conflict: { displayName: 'Ana Cruz' } };
    expect(requestFlags(request, now).map(f => f.label)).toEqual(['Section has an adviser (Ana Cruz)', 'Non-DepEd email', 'Waiting 3+ days']);
    expect(requestFlags({ email: 'y@deped.gov.ph', createdAt: now }, now)).toEqual([]);
  });
  it('describes ages briefly', () => {
    expect(relativeAge(now - 20000, now)).toBe('just now');
    expect(relativeAge(now - 5 * 60000, now)).toBe('5m ago');
    expect(relativeAge(now - 2 * 3600000, now)).toBe('2h ago');
    expect(relativeAge(now - 3 * DAY_MS, now)).toBe('3d ago');
    expect(relativeAge(null, now)).toBe('');
  });
  it('groups coverage by grade with gaps, subject teachers and pending adviser requests', () => {
    const [g7, g8] = coverageByGrade(sections, [ana, ben, cara], [dan]);
    expect(g7).toMatchObject({ grade: 7, covered: 1, curriculumAdvisers: [] });
    expect(g7.rows.map(r => [r.section.id, r.adviser?.uid ?? null, r.subjectTeachers, r.pending?.id ?? null])).toEqual([['A', 'u1', 1, null], ['B', null, 0, 'r1']]);
    expect(g8).toMatchObject({ grade: 8, covered: 0, curriculumAdvisers: [cara] });
  });
  it('filters and sorts assignments', () => {
    const all = [cara, ben, ana];
    expect(filterAssignments(all, {}, sections).map(a => a.uid)).toEqual(['u1', 'u2', 'u3']);
    expect(filterAssignments(all, { text: 'rizal' }, sections).map(a => a.uid)).toEqual(['u1', 'u2']);
    expect(filterAssignments(all, { grade: '8' }, sections).map(a => a.uid)).toEqual(['u3']);
    expect(filterAssignments(all, { role: 'subject_teacher' }, sections).map(a => a.uid)).toEqual(['u2']);
    expect(filterAssignments(all, { status: 'not_opened' }, sections).map(a => a.uid)).toEqual(['u2', 'u3']);
  });
  it('writes Excel-safe CSV', () => {
    expect(toCsv([['Name', 'Note'], ['Ana "A" Cruz', '=SUM(A1)']])).toBe('﻿"Name","Note"\r\n"Ana ""A"" Cruz","\'=SUM(A1)"');
  });
  it('exports assignments and coverage rows', () => {
    const rows = assignmentCsvRows([ana], sections);
    expect(rows[0]).toEqual(['Name', 'Email', 'Responsibility', 'Grade', 'Section', 'Assigned on', 'Assigned by', 'Source', 'Status']);
    expect(rows[1]).toEqual(['Ana Cruz', 'ana@deped.gov.ph', 'Adviser', 7, 'Rizal', shortDate(now - DAY_MS), 'admin@school.test', 'direct', 'Opened']);
    const coverage = coverageCsvRows(coverageByGrade(sections, [ana, ben], [dan]));
    expect(coverage[0]).toEqual(['Grade', 'Section', 'Adviser', 'Adviser email', 'Opened', 'Subject teachers', 'Pending request']);
    expect(coverage.slice(1, 3)).toEqual([[7, 'Rizal', 'Ana Cruz', 'ana@deped.gov.ph', 'Yes', 1, ''], [7, 'Bonifacio', '', '', '', 0, 'Dan']]);
  });
  it('turns audit rows into readable history', () => {
    const at = { toDate: () => new Date(now) };
    expect(historyLine({ action: 'school.requestApproved', actorUid: 'admin@school.test', targetId: 'u1', at,
      details: { role: 'adviser', sectionId: 'A', teacherName: 'Ana Cruz', reason: 'Approved' } }, sections))
      .toMatchObject({ text: 'admin@school.test approved Ana Cruz · Adviser · Grade 7 · Rizal', reason: '' });
    expect(historyLine({ action: 'school.revoked', actorUid: 'admin@school.test', targetId: 'u2', at,
      details: { role: 'subject_teacher', sectionId: 'Z', reason: 'Left school' } }, sections))
      .toMatchObject({ text: 'admin@school.test revoked u2 · Subject Teacher · Section Z', reason: 'Left school' });
    expect(historyLine({ action: 'school.requested', actorUid: 'ana@deped.gov.ph', targetId: 'u1', at: null,
      details: { role: 'adviser', sectionId: 'A', teacherName: 'Ana Cruz' } }, sections))
      .toEqual({ when: '—', text: 'Ana Cruz requested Adviser · Grade 7 · Rizal', reason: '' });
    expect(historyLine({ action: 'school.replaced', actorUid: 'admin@school.test', targetId: 'u9', at: null,
      details: { role: 'adviser', sectionId: 'A', teacherName: 'Eve Tan', previousEmail: 'ana@deped.gov.ph', reason: 'Moved' } }, sections).text)
      .toBe('admin@school.test replaced ana@deped.gov.ph with Eve Tan · Adviser · Grade 7 · Rizal');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/schoolAssignments.test.js`
Expected: FAIL, because `openedStatus is not a function` and the other new helpers are missing.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/schoolAssignments.js` and add the import at the top:

```js
import { ROLE_LABELS, sectionLabel } from '../../parent/src/lib/school.js';
```

```js
export const DAY_MS = 86400000;
const who = person => person?.displayName || person?.email || '';

// Opened means School mode was used after this particular assignment was made.
export function openedStatus(item) {
  const at = item?.lastSchoolOpenAt || null;
  return at && (!item.assignedAt || at >= item.assignedAt) ? { opened: true, at } : { opened: false, at: null };
}

export function requestFlags(request, now = Date.now()) {
  const flags = [];
  if (request.conflict) flags.push({ key: 'conflict', label: `Section has an adviser (${who(request.conflict)})` });
  if (!/@deped\.gov\.ph$/i.test(request.email || '')) flags.push({ key: 'personal', label: 'Non-DepEd email' });
  if (request.createdAt && now - request.createdAt >= 3 * DAY_MS) flags.push({ key: 'stale', label: 'Waiting 3+ days' });
  return flags;
}

export function relativeAge(ms, now = Date.now()) {
  if (!ms) return '';
  const minutes = Math.floor(Math.max(0, now - ms) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export const shortDate = ms => (ms ? new Date(ms).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }) : '');

export function coverageByGrade(sections = [], assignments = [], pending = []) {
  const grades = [...new Set(sections.map(s => Number(s.gradeLevel)))].sort((a, b) => a - b);
  return grades.map(grade => {
    const rows = sections.filter(s => Number(s.gradeLevel) === grade).map(section => ({
      section,
      adviser: assignments.find(a => a.role === 'adviser' && a.sectionId === section.id) || null,
      subjectTeachers: assignments.filter(a => a.role === 'subject_teacher' && a.sectionId === section.id).length,
      pending: pending.find(r => r.role === 'adviser' && r.sectionId === section.id) || null,
    }));
    return { grade, rows, covered: rows.filter(r => r.adviser).length,
      curriculumAdvisers: assignments.filter(a => a.role === 'curriculum_adviser' && Number(a.gradeLevel) === grade) };
  });
}

export function filterAssignments(items = [], { text = '', grade = '', role = '', status = '' } = {}, sections = []) {
  const byId = Object.fromEntries(sections.map(s => [s.id, s]));
  const needle = text.trim().toLowerCase();
  const name = item => byId[item.sectionId]?.name || '';
  return items.filter(item => {
    if (grade && Number(item.gradeLevel) !== Number(grade)) return false;
    if (role && item.role !== role) return false;
    if (status && (openedStatus(item).opened ? 'opened' : 'not_opened') !== status) return false;
    return !needle || [item.displayName, item.email, name(item)].some(v => String(v || '').toLowerCase().includes(needle));
  }).sort((a, b) => Number(a.gradeLevel) - Number(b.gradeLevel) || name(a).localeCompare(name(b)) || who(a).localeCompare(who(b)));
}

// A UTF-8 BOM lets Excel read names correctly; a leading quote stops formula injection.
const cell = value => {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
export const toCsv = rows => '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');

export function assignmentCsvRows(items, sections = []) {
  const byId = Object.fromEntries(sections.map(s => [s.id, s]));
  return [['Name', 'Email', 'Responsibility', 'Grade', 'Section', 'Assigned on', 'Assigned by', 'Source', 'Status'],
    ...items.map(item => [who(item), item.email || '', ROLE_LABELS[item.role] || item.role, Number(item.gradeLevel), byId[item.sectionId]?.name || '',
      shortDate(item.assignedAt), item.assignedBy || '', item.source || '', openedStatus(item).opened ? 'Opened' : 'Not opened yet'])];
}

export function coverageCsvRows(groups) {
  return [['Grade', 'Section', 'Adviser', 'Adviser email', 'Opened', 'Subject teachers', 'Pending request'],
    ...groups.flatMap(g => g.rows.map(r => [g.grade, r.section.name || r.section.id, who(r.adviser), r.adviser?.email || '',
      r.adviser ? (openedStatus(r.adviser).opened ? 'Yes' : 'No') : '', r.subjectTeachers, who(r.pending)]))];
}

const VERBS = { 'school.requestApproved': 'approved', 'school.requestRejected': 'rejected the request from', 'school.assigned': 'assigned', 'school.revoked': 'revoked' };
export function historyLine(row, sections = []) {
  const d = row.details || {};
  const teacher = d.teacherName || d.teacherEmail || row.targetId;
  const section = sections.find(s => s.id === d.sectionId);
  const scope = d.sectionId ? (section ? sectionLabel(section) : `Section ${d.sectionId}`) : d.gradeLevel ? `Grade ${d.gradeLevel}` : '';
  const what = [ROLE_LABELS[d.role], scope].filter(Boolean).join(' · ');
  const when = row.at?.toDate ? row.at.toDate().toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  const text = row.action === 'school.requested' ? `${teacher} requested ${what}`
    : row.action === 'school.requestWithdrawn' ? `${teacher} withdrew a request for ${what}`
    : row.action === 'school.replaced' ? `${row.actorUid} replaced ${d.previousEmail || 'the adviser'} with ${teacher} · ${what}`
    : `${row.actorUid} ${VERBS[row.action] || row.action} ${teacher} · ${what}`;
  return { when, text, reason: d.reason && d.reason !== 'Approved' ? d.reason : '' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/schoolAssignments.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/schoolAssignments.js src/lib/schoolAssignments.test.js
git commit -m "Add coverage, filter, CSV and history helpers for School access" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Pending count store and badges

**Files:**
- Create: `src/hooks/useSchoolPendingCount.js`
- Modify: `src/components/Shell.jsx` (imports, nav item render)
- Modify: `src/pages/GuardiansPage.jsx` (tab label)

**Interfaces:**
- Consumes: `getSchoolPendingCountFn` (Task 5), `CountBadge` (Task 6).
- Produces: `useSchoolPendingCount(enabled: boolean) → number` and `refreshSchoolPendingCount() → Promise<void>`. All mounted users share one value, and concurrent refreshes share one call.

- [ ] **Step 1: Create the shared store**

`src/hooks/useSchoolPendingCount.js`:

```js
import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

// One shared count for the sidebar and the Guardians tab; concurrent refreshes share a call.
let count = 0;
let inflight = null;
const listeners = new Set();
export function refreshSchoolPendingCount() {
  inflight ??= httpsCallable(functions, 'getSchoolPendingCountFn')({})
    .then(result => { count = Number(result.data?.count) || 0; listeners.forEach(listener => listener(count)); })
    .catch(() => { /* the badge simply keeps its last value */ })
    .finally(() => { inflight = null; });
  return inflight;
}
export function useSchoolPendingCount(enabled) {
  const [value, setValue] = useState(count);
  useEffect(() => {
    if (!enabled) return undefined;
    listeners.add(setValue);
    refreshSchoolPendingCount();
    const onFocus = () => refreshSchoolPendingCount();
    window.addEventListener('focus', onFocus);
    return () => { listeners.delete(setValue); window.removeEventListener('focus', onFocus); };
  }, [enabled]);
  return enabled ? value : 0;
}
```

- [ ] **Step 2: Badge the Guardians nav item**

In `src/components/Shell.jsx`, change the imports:

```js
import { Btn, Card, CountBadge, Modal } from './ui.jsx';
import { canOpen, isAdmin } from '../lib/access.js';
import { useSchoolPendingCount } from '../hooks/useSchoolPendingCount.js';
```

Inside `Shell`, after `const items = ...`, add:

```js
  const pendingSchool = useSchoolPendingCount(isAdmin(me));
  const badgeLabel = 'pending school access requests';
  const navLabel = item => (item.key === 'guardians' && pendingSchool ? `${item.label}, ${pendingSchool} ${badgeLabel}` : item.label);
```

In the nav item button, change `aria-label={collapsed ? item.label : undefined}` to `aria-label={collapsed ? navLabel(item) : undefined}`. Directly after `<span className={collapsed ? 'sims-nav-tooltip' : ''}>{item.label}</span>`, add:

```jsx
        {item.key === 'guardians' && pendingSchool > 0 && <CountBadge count={pendingSchool} label={badgeLabel} />}
```

- [ ] **Step 3: Badge the School access tab**

In `src/pages/GuardiansPage.jsx`, add the imports:

```js
import { CountBadge } from '../components/ui.jsx';
import { useSchoolPendingCount } from '../hooks/useSchoolPendingCount.js';
```

Inside `GuardiansPage`, after `const [tab, setTab] = useState('codes');`, add:

```js
  const pendingSchool = useSchoolPendingCount(true);
```

Change `}}>{label}</button>;` in the tab map to:

```jsx
            }}>{label}{k === 'school' && pendingSchool > 0 && <CountBadge count={pendingSchool} label="pending school access requests" />}</button>;
```

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: PASS (no regressions; this wiring has no new unit test of its own)

Run: `npm run build`
Expected: the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSchoolPendingCount.js src/components/Shell.jsx src/pages/GuardiansPage.jsx
git commit -m "Show the pending school access count in the sidebar and Guardians tabs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: School access shell, Assign panel and Pending view

**Files:**
- Create: `src/pages/guardians/school/useSchoolAccess.js`
- Create: `src/pages/guardians/school/SubTabs.jsx`
- Create: `src/pages/guardians/school/AssignRoleForm.jsx`
- Create: `src/pages/guardians/school/PendingView.jsx`
- Create: `src/pages/guardians/school/SchoolAccessTab.jsx`
- Create: `src/pages/guardians/school/CoverageView.jsx`, `AssignmentsView.jsx`, `HistoryView.jsx` (placeholders, replaced in Tasks 10–11)
- Delete: `src/pages/guardians/SchoolAccessTab.jsx`
- Modify: `src/pages/GuardiansPage.jsx` (lazy import path)
- Modify: `parent/src/lib/school.js` (`schoolError` also passes `resource-exhausted` through)
- Test: `src/pages/guardians/school/PendingView.test.js`

**Interfaces:**
- Consumes: `refreshSchoolPendingCount` (Task 8) and the helpers from Task 7.
- Produces:
  - `useSchoolAccess() → { context, loading, loadedAt, error, notice, pending, refresh, run }`, where `run(name, payload, message: string | (data) => string, after?: (data) => void) → Promise<data|undefined>`.
  - Views take `school` (that object). `PendingView({ school, onUseLegacy(prefill), focusId })` and `AssignRoleForm({ school, prefill, onClose })`. A prefill is `{ email?, role?, sectionId?, gradeLevel?, source?, name? }`.

- [ ] **Step 1: Write the failing test**

`src/pages/guardians/school/PendingView.test.js`:

```js
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PendingView from './PendingView.jsx';

const h = React.createElement;
const base = { schoolYear: '2026-2027', ended: false, sections: [{ id: 'A', name: 'Rizal', gradeLevel: 7 }], legacyAdvisers: [], managedAssignments: [] };
const requests = [
  { id: 'r1', uid: 'u1', displayName: 'Dan Lee', email: 'dan@deped.gov.ph', role: 'adviser', sectionId: 'A', gradeLevel: 7, createdAt: Date.now(),
    conflict: { uid: 'u0', displayName: 'Ana Cruz', email: 'ana@deped.gov.ph' } },
  { id: 'r2', uid: 'u2', displayName: 'Eve Tan', email: 'eve@gmail.com', role: 'subject_teacher', sectionId: 'A', gradeLevel: 7, createdAt: Date.now(), conflict: null },
];
const render = context => renderToStaticMarkup(h(PendingView, { school: { context, run: async () => undefined, pending: false }, onUseLegacy: () => {} }));

describe('PendingView', () => {
  it('offers Replace for a conflict and checkboxes only for clean requests', () => {
    const html = render({ ...base, pendingRequests: requests });
    expect(html).toContain('Replace Ana Cruz');
    expect(html).toContain('Section has an adviser (Ana Cruz)');
    expect(html).toContain('Non-DepEd email');
    expect(html.match(/type="checkbox"/g)).toHaveLength(2); // select-all + Eve
    expect(html).toContain('Select all without conflicts (1)');
  });
  it('explains where requests come from when the queue is empty', () => {
    expect(render({ ...base, pendingRequests: [] })).toContain('Teachers request access from the app');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/guardians/school/PendingView.test.js`
Expected: FAIL, because `./PendingView.jsx` cannot be resolved.

- [ ] **Step 3: Write the implementation**

In `parent/src/lib/school.js`, change `schoolError`'s regex to include `resource-exhausted`:

```js
export const schoolError = (error) => /(?:permission-denied|failed-precondition|already-exists|aborted|invalid-argument|not-found|resource-exhausted)$/.test(error?.code || '') && error.message
  ? error.message : 'Could not complete this action. Check your connection and try again.';
```

`src/pages/guardians/school/useSchoolAccess.js`:

```js
import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase.js';
import { schoolError } from '../../../../parent/src/lib/school.js';
import { refreshSchoolPendingCount } from '../../../hooks/useSchoolPendingCount.js';

const invoke = async (name, data = {}) => (await httpsCallable(functions, name)(data)).data;

// One loader and one mutation lock shared by every School access view.
export function useSchoolAccess() {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError('');
    try { const data = await invoke('getSchoolContextFn'); if (request === sequence.current) { setContext(data); setLoadedAt(Date.now()); } }
    catch (e) { if (request === sequence.current) setError(schoolError(e)); }
    finally { if (request === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { refresh(); return () => { ++sequence.current; }; }, [refresh]);
  const run = useCallback(async (name, payload, message, after = () => {}) => {
    if (lock.current) return undefined;
    lock.current = true; setPending(true); setError(''); setNotice('');
    try {
      const data = await invoke(name, payload);
      after(data);
      await refresh();
      refreshSchoolPendingCount();
      setNotice(typeof message === 'function' ? message(data) : message);
      return data;
    } catch (e) { setError(schoolError(e)); return undefined; }
    finally { lock.current = false; setPending(false); }
  }, [refresh]);
  return { context, loading, loadedAt, error, notice, pending, refresh, run };
}
```

`src/pages/guardians/school/SubTabs.jsx`:

```jsx
// Arrow keys, Home and End move between tabs, matching the Guardians tabs.
export default function SubTabs({ id, label, tabs, value, onChange }) {
  return <div className="sims-tabs" role="tablist" aria-label={label}>
    {tabs.map(([key, text]) => {
      const active = value === key;
      return <button key={key} type="button" role="tab" className="sims-tab" id={`${id}-tab-${key}`} aria-selected={active}
        aria-controls={`${id}-panel`} tabIndex={active ? 0 : -1} onClick={() => onChange(key)} onKeyDown={event => {
          const index = tabs.findIndex(([k]) => k === key);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
            event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : null;
          if (next === null) return;
          event.preventDefault(); onChange(tabs[next][0]);
          document.getElementById(`${id}-tab-${tabs[next][0]}`)?.focus();
        }}>{text}</button>;
    })}
  </div>;
}
```

`src/pages/guardians/school/AssignRoleForm.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import { Btn, Card, Field, Inp, Sel } from '../../../components/ui.jsx';
import { T, S } from '../../../styles.js';
import { ROLE_LABELS, sectionLabel } from '../../../../parent/src/lib/school.js';

const EMPTY = { email: '', role: 'adviser', sectionId: '', gradeLevel: '', source: 'direct', name: '' };

// Direct assignment. Coverage ("Assign") and old adviser slips ("Use in form") open it prefilled.
export default function AssignRoleForm({ school, prefill, onClose }) {
  const { context, run, pending } = school;
  const [assignment, setAssignment] = useState({ ...EMPTY, ...prefill });
  const rootRef = useRef(null);
  const emailRef = useRef(null);
  const sectionRef = useRef(null);
  useEffect(() => {
    setAssignment({ ...EMPTY, ...prefill });
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    rootRef.current?.scrollIntoView?.({ block: 'start', ...(calm ? {} : { behavior: 'smooth' }) });
    (prefill.email ? sectionRef : emailRef).current?.focus({ preventScroll: true });
  }, [prefill]);
  const set = (key, value) => setAssignment(a => ({ ...a, [key]: value }));
  const grades = [...new Set((context.sections || []).map(s => Number(s.gradeLevel)))].sort((a, b) => a - b);
  const submit = event => {
    event.preventDefault();
    const payload = { email: assignment.email.trim(), role: assignment.role, source: assignment.source,
      ...(assignment.role === 'curriculum_adviser' ? { gradeLevel: Number(assignment.gradeLevel) } : { sectionId: assignment.sectionId }) };
    run('assignSchoolRoleFn', payload, 'School role assigned. The teacher gets an inbox note in the app.', onClose);
  };
  return <Card style={{ padding: 20, marginBottom: 18 }}>
    <div ref={rootRef} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
      <h3 style={S.h2}>Assign a school role</h3>
      <Btn variant="ghost" type="button" onClick={onClose}>Close</Btn>
    </div>
    <p style={{ fontSize: 13, color: T.inkMuted, marginTop: 0 }}>
      {assignment.name ? `Confirm ${assignment.name}'s class, then assign. ` : ''}Use the teacher's verified app account email. They switch to School in the app's Settings.</p>
    <form onSubmit={submit}><fieldset disabled={pending || context.ended} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '0 18px' }}>
        <Field label="Account email"><Inp ref={emailRef} type="email" autoComplete="email" required value={assignment.email} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="Responsibility"><Sel value={assignment.role} onChange={e => set('role', e.target.value)}>
          {Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</Sel></Field>
        {assignment.role === 'curriculum_adviser'
          ? <Field label="Grade"><Sel required value={assignment.gradeLevel} onChange={e => set('gradeLevel', e.target.value)}>
            <option value="">Choose grade</option>{grades.map(g => <option key={g} value={g}>Grade {g}</option>)}</Sel></Field>
          : <Field label="Section"><Sel ref={sectionRef} required value={assignment.sectionId} onChange={e => set('sectionId', e.target.value)}>
            <option value="">Choose section</option>{(context.sections || []).map(s => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}</Sel></Field>}
      </div>
      <Btn type="submit">{pending ? 'Working…' : 'Assign role'}</Btn>
    </fieldset></form>
  </Card>;
}
```

`src/pages/guardians/school/PendingView.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { Btn, Card, EmptyState, Field, Inp } from '../../../components/ui.jsx';
import { T, S } from '../../../styles.js';
import { ROLE_LABELS, sectionLabel } from '../../../../parent/src/lib/school.js';
import { assignmentFromLegacy, legacyAdviserRows, relativeAge, requestFlags } from '../../../lib/schoolAssignments.js';
import LegacyAdvisers from '../LegacyAdvisers.jsx';

const muted = { fontSize: 13, color: T.inkMuted };
const who = person => person.displayName || person.email;

// Oldest first. Conflicting requests offer Replace instead of Approve and cannot be bulk-selected.
export default function PendingView({ school, onUseLegacy, focusId }) {
  const { context, run, pending } = school;
  const requests = context.pendingRequests || [];
  const sections = context.sections || [];
  const disabled = pending || context.ended;
  const clean = requests.filter(r => !r.conflict).map(r => r.id);
  const cleanKey = clean.join('|');
  const [selected, setSelected] = useState(() => new Set());
  const [open, setOpen] = useState(null);
  const [reason, setReason] = useState('');
  const [failures, setFailures] = useState({});
  useEffect(() => { const ids = cleanKey.split('|'); setSelected(prev => new Set([...prev].filter(id => ids.includes(id)))); }, [cleanKey]);
  useEffect(() => { if (focusId) document.getElementById(`school-request-${focusId}`)?.focus(); }, [focusId]);
  const toggle = id => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allSelected = clean.length > 0 && clean.every(id => selected.has(id));
  const startReason = (id, kind) => { setOpen({ id, kind }); setReason(''); };
  const approve = r => run('resolveSchoolRoleFn', { requestId: r.id, approve: true }, `Approved ${who(r)}. They get an inbox note in the app.`);
  const approveSelected = () => run('resolveSchoolRolesFn', { requestIds: [...selected] },
    data => { const failed = data.results.filter(x => !x.ok).length; return `${data.results.length - failed} approved${failed ? `, ${failed} need attention below` : ''}.`; },
    data => { setFailures(Object.fromEntries(data.results.filter(x => !x.ok).map(x => [x.id, x.error]))); setSelected(new Set()); });
  const submitReason = (event, r) => {
    event.preventDefault();
    const text = reason.trim();
    if (!text) return;
    const done = () => { setOpen(null); setReason(''); };
    if (open.kind === 'reject') run('resolveSchoolRoleFn', { requestId: r.id, approve: false, reason: text }, `Rejected ${who(r)}'s request. They see your reason in the app.`, done);
    else run('replaceAdviserFn', { requestId: r.id, reason: text }, `${who(r)} replaced ${who(r.conflict)} as adviser.`, done);
  };
  const legacy = legacyAdviserRows(context.legacyAdvisers, context.managedAssignments);
  const legacyOpen = legacy.filter(row => !row.assigned).length;
  return <>
    <Card style={{ padding: 20, marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ ...S.h2, margin: 0 }}>Requests waiting for review</h3>
        {clean.length > 0 && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={allSelected} disabled={disabled} style={{ width: 18, height: 18 }}
            onChange={() => setSelected(allSelected ? new Set() : new Set(clean))} />{`Select all without conflicts (${clean.length})`}</label>}
      </div>
      {requests.length === 0
        ? <EmptyState title="No requests waiting" hint="Teachers request access from the app's Settings." />
        : <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>{requests.map(r => {
          const flags = requestFlags(r);
          const section = sections.find(s => s.id === r.sectionId);
          return <li key={r.id} id={`school-request-${r.id}`} tabIndex={-1}
            style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr)', gap: '0 8px', padding: '16px 0', borderTop: `1px solid ${T.border}` }}>
            <span>{!r.conflict && <input type="checkbox" aria-label={`Select ${who(r)}`} checked={selected.has(r.id)} disabled={disabled}
              onChange={() => toggle(r.id)} style={{ width: 18, height: 18, marginTop: 2 }} />}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px' }}>
                <strong>{who(r)}</strong><span style={{ ...muted, overflowWrap: 'anywhere' }}>{r.email}</span><span style={muted}>{relativeAge(r.createdAt)}</span>
              </div>
              <div style={{ marginTop: 4 }}>{ROLE_LABELS[r.role]} · {sectionLabel(section)}</div>
              {flags.length > 0 && <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 6, listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                {flags.map(f => <li key={f.key} className={`sims-flag sims-flag--${f.key}`}>{f.label}</li>)}</ul>}
              {failures[r.id] && <p role="alert" className="sims-feedback" style={{ marginTop: 10 }}>{failures[r.id]}</p>}
              {open?.id === r.id ? <form onSubmit={e => submitReason(e, r)} style={{ marginTop: 12 }}>
                <p style={{ fontSize: 13, margin: '0 0 8px' }}>{open.kind === 'reject' ? 'Tell the teacher why. They see this in the app.'
                  : `${who(r.conflict)} loses access to ${sectionLabel(section)} right away, and ${who(r)} becomes the adviser.`}</p>
                <Field label="Reason"><Inp autoFocus required maxLength={500} value={reason} disabled={pending} onChange={e => setReason(e.target.value)} /></Field>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Btn type="submit" disabled={pending || !reason.trim()} style={open.kind === 'replace' ? { background: T.absent } : undefined}>
                    {pending ? 'Working…' : open.kind === 'reject' ? 'Reject request' : 'Replace adviser'}</Btn>
                  <Btn variant="ghost" type="button" disabled={pending} onClick={() => setOpen(null)}>Cancel</Btn>
                </div>
              </form> : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {r.conflict
                  ? <Btn disabled={disabled} style={{ background: T.absent }} onClick={() => startReason(r.id, 'replace')}>{`Replace ${who(r.conflict)}`}</Btn>
                  : <Btn disabled={disabled} onClick={() => approve(r)}>Approve</Btn>}
                <Btn variant="ghost" disabled={disabled} onClick={() => startReason(r.id, 'reject')}>Reject</Btn>
              </div>}
            </div>
          </li>;
        })}</ul>}
    </Card>
    {selected.size > 0 && <div className="school-bulk-bar" role="region" aria-label="Bulk approval">
      <span style={{ fontWeight: 600 }}>{selected.size} selected</span>
      <Btn variant="ghost" disabled={pending} onClick={() => setSelected(new Set())}>Clear</Btn>
      <Btn disabled={disabled} onClick={approveSelected}>{pending ? 'Working…' : `Approve ${selected.size} selected`}</Btn>
    </div>}
    <Card style={{ padding: 20 }}>
      <h3 style={S.h2}>Old adviser slips to confirm{legacyOpen ? ` (${legacyOpen})` : ''}</h3>
      <p style={muted}>Old adviser links grant no school access. Confirm each teacher's class, then assign.</p>
      <LegacyAdvisers rows={legacy} sections={sections} disabled={disabled}
        onUse={row => onUseLegacy({ ...assignmentFromLegacy(row), source: 'legacy', name: row.name || row.email })} />
    </Card>
  </>;
}
```

Temporary placeholders so the shell builds. They are replaced in Tasks 10–11:

`src/pages/guardians/school/CoverageView.jsx`:

```jsx
export default function CoverageView() { return null; }
```

`src/pages/guardians/school/AssignmentsView.jsx`:

```jsx
export default function AssignmentsView() { return null; }
```

`src/pages/guardians/school/HistoryView.jsx`:

```jsx
export default function HistoryView() { return null; }
```

`src/pages/guardians/school/SchoolAccessTab.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { Btn } from '../../../components/ui.jsx';
import { T, S } from '../../../styles.js';
import { relativeAge } from '../../../lib/schoolAssignments.js';
import { useSchoolAccess } from './useSchoolAccess.js';
import SubTabs from './SubTabs.jsx';
import AssignRoleForm from './AssignRoleForm.jsx';
import PendingView from './PendingView.jsx';
import CoverageView from './CoverageView.jsx';
import AssignmentsView from './AssignmentsView.jsx';
import HistoryView from './HistoryView.jsx';

// School roles are requested in the app and reviewed here. The page opens on
// Pending when something waits, otherwise on Coverage.
export default function SchoolAccessTab() {
  const school = useSchoolAccess();
  const { context, loading, loadedAt, error, notice, refresh } = school;
  const [view, setView] = useState(null);
  const [draft, setDraft] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  const [, tick] = useState(0);
  const waiting = context?.pendingRequests?.length || 0;
  useEffect(() => { if (context?.isAdmin && !view) setView(waiting ? 'pending' : 'coverage'); }, [context, view, waiting]);
  useEffect(() => { const timer = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(timer); }, []);
  const tabs = [['pending', `Pending${waiting ? ` (${waiting})` : ''}`], ['coverage', 'Coverage'],
    ['assignments', `Assignments (${context?.managedAssignments?.length || 0})`], ['history', 'History']];
  return <div style={{ fontFamily: T.body }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
      <div>
        <h2 style={{ ...S.h2, margin: 0 }}>School access</h2>
        {context && <p style={{ margin: '4px 0 0', fontSize: 13, color: T.inkMuted }}>SY {context.schoolYear}{context.ended ? ' · ended, read only' : ''}</p>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <span role="status" style={{ fontSize: 12, color: T.inkMuted }}>{loading ? 'Updating…' : loadedAt ? `Updated ${relativeAge(loadedAt)}` : ''}</span>
        <Btn variant="ghost" disabled={loading || school.pending} onClick={refresh}>Refresh</Btn>
        {context?.isAdmin && <Btn disabled={context.ended} onClick={() => setDraft({})}>Assign role</Btn>}
      </div>
    </div>
    {error && <p role="alert" className="sims-feedback">{error}</p>}
    {notice && <p role="status" className="sims-feedback is-success">{notice}</p>}
    {!context && loading && <p role="status">Loading school access…</p>}
    {context && !context.isAdmin && <p role="status">An administrator assigns school roles here in SIMS.</p>}
    {context?.isAdmin && view && <>
      {draft && <AssignRoleForm school={school} prefill={draft} onClose={() => setDraft(null)} />}
      <SubTabs id="school" label="School access views" tabs={tabs} value={view} onChange={setView} />
      <div role="tabpanel" id="school-panel" aria-labelledby={`school-tab-${view}`}>
        {view === 'pending' && <PendingView school={school} onUseLegacy={setDraft} focusId={focusRequest} />}
        {view === 'coverage' && <CoverageView context={context} onAssign={setDraft}
          onOpenRequest={requestId => { setFocusRequest(requestId); setView('pending'); }} />}
        {view === 'assignments' && <AssignmentsView school={school} />}
        {view === 'history' && <HistoryView sections={context.sections || []} />}
      </div>
    </>}
  </div>;
}
```

In `src/pages/GuardiansPage.jsx`, change the lazy import:

```js
const SchoolAccessTab = lazy(() => import('./guardians/school/SchoolAccessTab.jsx'));
```

Delete the old file:

```bash
git rm src/pages/guardians/SchoolAccessTab.jsx
```

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run src/pages/guardians/school/PendingView.test.js src/pages/guardians/LegacyAdvisers.test.js`
Expected: PASS

Run: `npm run build`
Expected: the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/guardians/school src/pages/GuardiansPage.jsx parent/src/lib/school.js
git commit -m "Split School access into sub-tabs with a Pending review queue" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Coverage and Assignments views with CSV export

**Files:**
- Create: `src/pages/guardians/school/downloadCsv.js`
- Create: `src/pages/guardians/school/OpenedTag.jsx`
- Replace: `src/pages/guardians/school/CoverageView.jsx`
- Replace: `src/pages/guardians/school/AssignmentsView.jsx`
- Test: `src/pages/guardians/school/CoverageView.test.js`

**Interfaces:**
- Consumes: `coverageByGrade`, `coverageCsvRows`, `filterAssignments`, `assignmentCsvRows`, `openedStatus`, `shortDate` and `toCsv` (Task 7), plus `Table` from `src/pages/guardians/RequestsTab.jsx`.
- Produces: `CoverageView({ context, onAssign(prefill), onOpenRequest(requestId) })`, `AssignmentsView({ school })`, `downloadCsv(filename, rows)` and `OpenedTag({ item })`.

- [ ] **Step 1: Write the failing test**

`src/pages/guardians/school/CoverageView.test.js`:

```js
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CoverageView from './CoverageView.jsx';

const context = {
  schoolYear: '2026-2027', ended: false,
  sections: [{ id: 'A', name: 'Rizal', gradeLevel: 7 }, { id: 'B', name: 'Bonifacio', gradeLevel: 7 }],
  managedAssignments: [{ uid: 'u1', displayName: 'Ana Cruz', email: 'ana@deped.gov.ph', role: 'adviser', sectionId: 'A', gradeLevel: 7, assignedAt: 1, lastSchoolOpenAt: null }],
  pendingRequests: [{ id: 'r1', role: 'adviser', sectionId: 'B', displayName: 'Dan' }],
};

describe('CoverageView', () => {
  it('shows coverage per grade, gaps, opened status and the pending request', () => {
    const html = renderToStaticMarkup(React.createElement(CoverageView, { context, onAssign: () => {}, onOpenRequest: () => {} }));
    expect(html).toContain('1 of 2 sections have an adviser');
    expect(html).toContain('Curriculum Adviser: None');
    expect(html).toContain('Not opened yet');
    expect(html).toContain('No adviser');
    expect(html).toContain('Review Dan');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/guardians/school/CoverageView.test.js`
Expected: FAIL, because the placeholder renders nothing.

- [ ] **Step 3: Write the implementation**

`src/pages/guardians/school/downloadCsv.js`:

```js
import { toCsv } from '../../../lib/schoolAssignments.js';

export function downloadCsv(filename, rows) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

`src/pages/guardians/school/OpenedTag.jsx`:

```jsx
import { openedStatus, shortDate } from '../../../lib/schoolAssignments.js';

export default function OpenedTag({ item }) {
  const status = openedStatus(item);
  return <span className={`sims-flag ${status.opened ? 'sims-flag--ok' : 'sims-flag--stale'}`}>
    {status.opened ? `Opened ${shortDate(status.at)}` : 'Not opened yet'}</span>;
}
```

`src/pages/guardians/school/CoverageView.jsx`:

```jsx
import { useState } from 'react';
import { Btn, Card, EmptyState } from '../../../components/ui.jsx';
import { T, S } from '../../../styles.js';
import { coverageByGrade, coverageCsvRows } from '../../../lib/schoolAssignments.js';
import { downloadCsv } from './downloadCsv.js';
import OpenedTag from './OpenedTag.jsx';

const who = person => person.displayName || person.email;

// Which sections still need an adviser, grade by grade.
export default function CoverageView({ context, onAssign, onOpenRequest }) {
  const [gapsOnly, setGapsOnly] = useState(false);
  const groups = coverageByGrade(context.sections, context.managedAssignments, context.pendingRequests);
  return <>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={gapsOnly} onChange={e => setGapsOnly(e.target.checked)} style={{ width: 18, height: 18 }} />Only sections without an adviser</label>
      <Btn variant="ghost" disabled={!groups.length} onClick={() => downloadCsv(`school-coverage-${context.schoolYear}.csv`, coverageCsvRows(groups))}>Export CSV</Btn>
    </div>
    {groups.length === 0 && <Card style={{ padding: 20 }}><EmptyState title="No sections this school year" hint="Add sections on the Sections page first." /></Card>}
    {groups.map(g => {
      const rows = gapsOnly ? g.rows.filter(r => !r.adviser) : g.rows;
      return <Card key={g.grade} style={{ padding: 20, marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 16px' }}>
          <h3 style={{ ...S.h2, margin: 0 }}>Grade {g.grade}</h3>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{`${g.covered} of ${g.rows.length} sections have an adviser`}</span>
          <span style={{ fontSize: 13, color: T.inkMuted }}>{`Curriculum Adviser: ${g.curriculumAdvisers.map(who).join(', ') || 'None'}`}</span>
        </div>
        {rows.length === 0
          ? <p style={{ fontSize: 13, color: T.inkMuted, margin: '12px 0 0' }}>Every Grade {g.grade} section has an adviser.</p>
          : <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>{rows.map(row => <li key={row.section.id} className="school-coverage-row">
            <strong>{row.section.name || row.section.id}</strong>
            {row.adviser
              ? <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>{who(row.adviser)}<OpenedTag item={row.adviser} /></span>
              : <span className="school-gap">No adviser</span>}
            <span style={{ fontSize: 13, color: T.inkMuted }}>{row.subjectTeachers} subject teacher{row.subjectTeachers === 1 ? '' : 's'}</span>
            <span>{!row.adviser && (row.pending
              ? <Btn variant="ghost" onClick={() => onOpenRequest(row.pending.id)}>{`Review ${who(row.pending)}'s request`}</Btn>
              : <Btn variant="ghost" disabled={context.ended} onClick={() => onAssign({ role: 'adviser', sectionId: row.section.id })}>Assign</Btn>)}</span>
          </li>)}</ul>}
      </Card>;
    })}
  </>;
}
```

`src/pages/guardians/school/AssignmentsView.jsx`:

```jsx
import { Fragment, useState } from 'react';
import { Btn, Card, EmptyState, Field, Inp, Sel } from '../../../components/ui.jsx';
import { T, S } from '../../../styles.js';
import { ROLE_LABELS, sectionLabel } from '../../../../parent/src/lib/school.js';
import { assignmentCsvRows, filterAssignments, shortDate } from '../../../lib/schoolAssignments.js';
import { Table } from '../RequestsTab.jsx';
import { downloadCsv } from './downloadCsv.js';
import OpenedTag from './OpenedTag.jsx';

const keyOf = item => `${item.uid}-${item.role}-${item.sectionId || item.gradeLevel}`;

export default function AssignmentsView({ school }) {
  const { context, run, pending } = school;
  const sections = context.sections || [];
  const all = context.managedAssignments || [];
  const [filters, setFilters] = useState({ text: '', grade: '', role: '', status: '' });
  const [revoking, setRevoking] = useState(null);
  const [reason, setReason] = useState('');
  const items = filterAssignments(all, filters, sections);
  const grades = [...new Set(sections.map(s => Number(s.gradeLevel)))].sort((a, b) => a - b);
  const set = (key, value) => setFilters(f => ({ ...f, [key]: value }));
  const scope = item => (item.sectionId ? sectionLabel(sections.find(s => s.id === item.sectionId)) : `Grade ${item.gradeLevel}`);
  const revoke = (event, item) => {
    event.preventDefault();
    if (!reason.trim()) return;
    run('revokeSchoolRoleFn', { uid: item.uid, role: item.role, ...(item.sectionId ? { sectionId: item.sectionId } : { gradeLevel: item.gradeLevel }), reason: reason.trim() },
      'Assignment revoked.', () => { setRevoking(null); setReason(''); });
  };
  return <Card style={{ padding: 20 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '0 14px', alignItems: 'end' }}>
      <Field label="Search"><Inp type="search" placeholder="Name, email or section" value={filters.text} onChange={e => set('text', e.target.value)} /></Field>
      <Field label="Grade"><Sel value={filters.grade} onChange={e => set('grade', e.target.value)}>
        <option value="">All grades</option>{grades.map(g => <option key={g} value={g}>Grade {g}</option>)}</Sel></Field>
      <Field label="Responsibility"><Sel value={filters.role} onChange={e => set('role', e.target.value)}>
        <option value="">All</option>{Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</Sel></Field>
      <Field label="Status"><Sel value={filters.status} onChange={e => set('status', e.target.value)}>
        <option value="">All</option><option value="opened">Opened</option><option value="not_opened">Not opened yet</option></Sel></Field>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
      <span role="status" style={{ fontSize: 13, color: T.inkMuted }}>{items.length} of {all.length} assignments</span>
      <Btn variant="ghost" disabled={!items.length} onClick={() => downloadCsv(`school-assignments-${context.schoolYear}.csv`, assignmentCsvRows(items, sections))}>Export CSV</Btn>
    </div>
    {items.length === 0
      ? <EmptyState title={all.length ? 'No assignments match' : 'No assignments yet'} hint={all.length ? 'Clear a filter to see more.' : 'Approve a request or assign a role to start.'} />
      : <Table head={['Teacher', 'Responsibility', 'Scope', 'Since', 'Status', 'Action']} rows={items.map(item => {
        const key = keyOf(item);
        return <Fragment key={key}>
          <tr>
            <td style={S.td}><strong>{item.displayName || item.email || item.uid}</strong><br />
              <span style={{ fontSize: 12, color: T.inkMuted, overflowWrap: 'anywhere' }}>{item.email}</span></td>
            <td style={S.td}>{ROLE_LABELS[item.role]}</td>
            <td style={S.td}>{scope(item)}</td>
            <td style={S.td}>{shortDate(item.assignedAt) || '—'}{item.assignedBy && <><br /><span style={{ fontSize: 12, color: T.inkMuted }}>by {item.assignedBy}</span></>}</td>
            <td style={S.td}><OpenedTag item={item} /></td>
            <td style={S.td}><Btn variant="ghost" disabled={pending || context.ended} style={{ padding: '6px 14px' }} aria-expanded={revoking === key}
              onClick={() => { setRevoking(revoking === key ? null : key); setReason(''); }}>Revoke</Btn></td>
          </tr>
          {revoking === key && <tr><td colSpan={6} style={S.td}><form onSubmit={e => revoke(e, item)}>
            <p style={{ fontSize: 13, margin: '0 0 8px' }}>Revoke {item.displayName || item.email}'s {ROLE_LABELS[item.role]} role for {scope(item)}? Access ends immediately.</p>
            <Field label="Reason"><Inp autoFocus required maxLength={500} value={reason} disabled={pending} onChange={e => setReason(e.target.value)} /></Field>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn type="submit" disabled={pending || !reason.trim()} style={{ background: T.absent }}>{pending ? 'Working…' : 'Revoke assignment'}</Btn>
              <Btn variant="ghost" type="button" disabled={pending} onClick={() => setRevoking(null)}>Cancel</Btn>
            </div>
          </form></td></tr>}
        </Fragment>;
      })} />}
  </Card>;
}
```

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run src/pages/guardians/school`
Expected: PASS

Run: `npm run build`
Expected: the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/guardians/school
git commit -m "Add School access Coverage and Assignments views with CSV export" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: History view and its index

**Files:**
- Replace: `src/pages/guardians/school/HistoryView.jsx`
- Modify: `firestore.indexes.json` (add one index to `indexes`)
- Test: `src/pages/guardians/school/HistoryView.test.js`

**Interfaces:**
- Consumes: `historyLine` (Task 7) and `useQueryResource` (`src/hooks/useCollection.js`).
- Produces: `HistoryView({ sections })`.

- [ ] **Step 1: Write the failing test**

The view reads Firestore, so test the index entry (the part a reviewer can break):

`src/pages/guardians/school/HistoryView.test.js`:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('School access history', () => {
  it('has the audit_log index its query needs', () => {
    const { indexes } = JSON.parse(readFileSync(new URL('../../../../firestore.indexes.json', import.meta.url), 'utf8'));
    expect(indexes).toContainEqual({ collectionGroup: 'audit_log', queryScope: 'COLLECTION', fields: [
      { fieldPath: 'targetType', order: 'ASCENDING' }, { fieldPath: 'at', order: 'DESCENDING' }] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/guardians/school/HistoryView.test.js`
Expected: FAIL, because the index is missing.

- [ ] **Step 3: Write the implementation**

In `firestore.indexes.json`, add this as the first entry of `"indexes"`:

```json
    { "collectionGroup": "audit_log", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "targetType", "order": "ASCENDING" }, { "fieldPath": "at", "order": "DESCENDING" } ] },
```

`src/pages/guardians/school/HistoryView.jsx`:

```jsx
import { useState } from 'react';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../../firebase.js';
import { useQueryResource } from '../../../hooks/useCollection.js';
import { Btn, Card, EmptyState, ResourceState } from '../../../components/ui.jsx';
import { T } from '../../../styles.js';
import { historyLine } from '../../../lib/schoolAssignments.js';

const PAGE = 50;

// Reads audit_log directly, like the Audit log tab; rules already limit it to administrators.
export default function HistoryView({ sections }) {
  const [count, setCount] = useState(PAGE);
  const resource = useQueryResource(() => query(collection(db, 'audit_log'), where('targetType', '==', 'school_assignment'),
    orderBy('at', 'desc'), limit(count)), [count]);
  const rows = resource.data;
  return <ResourceState resources={[resource]} label="history"><Card style={{ padding: 20 }}>
    {rows.length === 0
      ? <EmptyState title="No school access changes yet" hint="Requests, approvals and revocations appear here." />
      : <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>{rows.map(row => {
        const line = historyLine(row, sections);
        return <li key={row.id} style={{ padding: '12px 0', borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 12, color: T.inkMuted }}>{line.when}</div>
          <div>{line.text}</div>
          {line.reason && <div style={{ fontSize: 13, color: T.inkMuted }}>Reason: {line.reason}</div>}
        </li>;
      })}</ol>}
    {rows.length === count && <Btn variant="ghost" style={{ marginTop: 12 }} onClick={() => setCount(c => c + PAGE)}>Load more</Btn>}
  </Card></ResourceState>;
}
```

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run src/pages/guardians/school`
Expected: PASS

Run: `npm run build`
Expected: the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/guardians/school firestore.indexes.json
git commit -m "Add School access History from the audit log" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Parent App helpers and strings

**Files:**
- Modify: `parent/src/lib/school.js`
- Modify: `parent/src/strings.js` (after `modeSavedHere`, around line 235)
- Test: `parent/src/lib/school.test.js`, `parent/src/lib/strings.test.js`

**Interfaces:**
- Produces:
  - `REQUESTABLE_ROLES`, `REQUEST_STATUS: { pending, approved, rejected, withdrawn } → string`.
  - `sectionsByGrade(sections) → [{ grade, sections }]`, `manilaDay(date?) → 'YYYY-MM-DD'`, `claimOpenedToday(uid, day?, storage?) → boolean`.
  - `inboxDestination` sends rejection notes to `/settings/school-access`.
  - The new `S.*` keys listed in Step 3.

- [ ] **Step 1: Write the failing tests**

In `parent/src/lib/school.test.js`, change the import to:

```js
import { attendanceSections, correctionError, inboxDestination, sessionAction, correctionTime, REQUESTABLE_ROLES, REQUEST_STATUS, sectionsByGrade, manilaDay, claimOpenedToday } from './school.js';
```

Change the test `sends a school access note to Settings` to:

```js
  it('sends a school access note to Settings, and a rejection to the request page', () => {
    expect(inboxDestination({ type: 'school_access' })).toBe('/settings');
    expect(inboxDestination({ type: 'school_access', rejected: true })).toBe('/settings/school-access');
  });
  it('offers requestable roles and sections grouped by grade', () => {
    expect(REQUESTABLE_ROLES).toEqual(['adviser', 'subject_teacher']);
    expect(REQUEST_STATUS.rejected).toBe('Not approved');
    expect(sectionsByGrade([{ id: 'b', gradeLevel: 8 }, { id: 'a', gradeLevel: 7 }, { id: 'c', gradeLevel: 8 }]))
      .toEqual([{ grade: 7, sections: [{ id: 'a', gradeLevel: 7 }] }, { grade: 8, sections: [{ id: 'b', gradeLevel: 8 }, { id: 'c', gradeLevel: 8 }] }]);
  });
  it('reports School opened at most once a Manila day per account', () => {
    const store = new Map();
    const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    expect(manilaDay(new Date('2026-10-18T17:30:00Z'))).toBe('2026-10-19');
    expect(claimOpenedToday('u1', '2026-10-19', storage)).toBe(true);
    expect(claimOpenedToday('u1', '2026-10-19', storage)).toBe(false);
    expect(claimOpenedToday('u2', '2026-10-19', storage)).toBe(true);
    expect(claimOpenedToday('u2', '2026-10-20', storage)).toBe(true);
    expect(claimOpenedToday('u3', '2026-10-20', { getItem: () => { throw new Error('blocked'); } })).toBe(true);
  });
```

In `parent/src/lib/strings.test.js`, add inside the `describe`:

```js
  it('has the school access request strings', () => {
    for (const k of ['schoolAccessTitle', 'schoolAccessRow', 'schoolAccessRowHint', 'schoolAccessIntro', 'schoolAccessRole', 'schoolAccessSection',
      'schoolAccessChooseSection', 'schoolAccessSubmit', 'schoolAccessSent', 'schoolAccessMine', 'schoolAccessNone', 'schoolAccessWithdraw',
      'schoolAccessWithdrawn', 'schoolAccessEnded', 'requestPending', 'requestApproved', 'requestRejected', 'requestWithdrawn',
      'schoolRequestsTitle', 'schoolRequestsIntro', 'schoolRequestsEmpty', 'schoolRequestsApprove', 'schoolRequestsReject',
      'schoolRequestsReason', 'schoolRequestsConfirmReject', 'schoolRequestsCancel', 'schoolRequestsNeedsAdmin',
      'schoolRequestsApproved', 'schoolRequestsRejected'])
      expect(typeof S[k], k).toBe('string');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix parent test -- src/lib/school.test.js src/lib/strings.test.js`
Expected: FAIL, because `sectionsByGrade is not a function` and the strings are missing.

- [ ] **Step 3: Write minimal implementation**

In `parent/src/strings.js`, directly after `modeSavedHere: 'Saved on this device.',`, add:

```js
  schoolAccessTitle: 'School access',
  schoolAccessRow: 'Request school access',
  schoolAccessRowHint: 'For BNHS teachers',
  schoolAccessIntro: 'Ask for your advisory class or a subject class. An administrator or your Curriculum Adviser reviews it. A request gives no access until it is approved.',
  schoolAccessRole: 'Responsibility',
  schoolAccessSection: 'Section',
  schoolAccessChooseSection: 'Choose section',
  schoolAccessSubmit: 'Send request',
  schoolAccessSent: 'Request sent. You get an inbox note when it is reviewed.',
  schoolAccessMine: 'My requests',
  schoolAccessNone: 'No requests yet.',
  schoolAccessWithdraw: 'Withdraw',
  schoolAccessWithdrawn: 'Request withdrawn.',
  schoolAccessEnded: 'This school year has ended. Requests open again next school year.',
  requestPending: 'Waiting for review',
  requestApproved: 'Approved',
  requestRejected: 'Not approved',
  requestWithdrawn: 'Withdrawn',
  schoolRequestsTitle: 'Teacher requests',
  schoolRequestsIntro: 'Adviser requests from DepEd accounts in your grades. Approving gives the teacher their class right away.',
  schoolRequestsEmpty: 'No requests waiting.',
  schoolRequestsApprove: 'Approve',
  schoolRequestsReject: 'Reject',
  schoolRequestsReason: 'Reason the teacher will see',
  schoolRequestsConfirmReject: 'Reject request',
  schoolRequestsCancel: 'Cancel',
  schoolRequestsNeedsAdmin: 'This section already has an adviser, so an administrator reviews this request in SIMS.',
  schoolRequestsApproved: 'Approved. The teacher gets an inbox note.',
  schoolRequestsRejected: 'Rejected. The teacher sees your reason.',
```

In `parent/src/lib/school.js`, add at the top:

```js
import S from '../strings.js';
```

Below `ROLE_LABELS`, add:

```js
export const REQUESTABLE_ROLES = ['adviser', 'subject_teacher'];
export const REQUEST_STATUS = { pending: S.requestPending, approved: S.requestApproved, rejected: S.requestRejected, withdrawn: S.requestWithdrawn };
export function sectionsByGrade(sections = []) {
  const grades = [...new Set(sections.map((s) => Number(s.gradeLevel)))].sort((a, b) => a - b);
  return grades.map((grade) => ({ grade, sections: sections.filter((s) => Number(s.gradeLevel) === grade) }));
}
export const manilaDay = (date = new Date()) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const OPENED_KEY = 'bnhs-school-opened';
const localStore = () => { try { return localStorage; } catch { return null; } };
// School mode tells SIMS it was opened at most once a day per account.
export function claimOpenedToday(uid, day = manilaDay(), storage = localStore()) {
  try {
    const saved = JSON.parse(storage?.getItem(OPENED_KEY) || 'null');
    if (saved?.uid === uid && saved.day === day) return false;
    storage?.setItem(OPENED_KEY, JSON.stringify({ uid, day }));
  } catch { /* storage unavailable: report anyway */ }
  return true;
}
```

In `inboxDestination`, change the first line to:

```js
  if (item.type === 'school_access') return item.rejected ? '/settings/school-access' : '/settings';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix parent test`
Expected: PASS (the whole parent suite, which includes the forbidden-word check)

- [ ] **Step 5: Commit**

```bash
git add parent/src/lib/school.js parent/src/lib/school.test.js parent/src/strings.js parent/src/lib/strings.test.js
git commit -m "Add Parent App school request helpers and strings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Parent App request page, Curriculum Adviser queue, opened ping

**Files:**
- Create: `parent/src/hooks/useSchoolAction.js`
- Create: `parent/src/screens/settings/SchoolAccessPage.jsx`
- Create: `parent/src/screens/settings/SchoolRequestsPage.jsx`
- Modify: `parent/src/screens/Settings.jsx` (imports, `PAGES`, gate, `ctx`, `SettingsHome` group)
- Modify: `parent/src/App.jsx` (imports, opened effect after the reconcile effect near line 71)

**Interfaces:**
- Consumes: `myRequests` and `reviewQueue` (Task 5), and the helpers and strings from Task 12.
- Produces: `useSchoolAction(refresh) → { busy, message: { tone, text } | null, act(name, payload, text, after?) → Promise<boolean> }`, plus the routes `/settings/school-access` and `/settings/school-requests`.

- [ ] **Step 1: Write the shared action hook**

`parent/src/hooks/useSchoolAction.js`:

```js
import { useState } from 'react';
import { callable } from '../firebase.js';
import { schoolError } from '../lib/school.js';

// One School action at a time; the screen's context refreshes after each success.
export function useSchoolAction(refresh) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const act = async (name, payload, text, after = () => {}) => {
    if (busy) return false;
    setBusy(true); setMessage(null);
    try { await callable(name)(payload); after(); await refresh(); setMessage({ tone: 'info', text }); return true; }
    catch (e) { setMessage({ tone: 'danger', text: schoolError(e) }); return false; }
    finally { setBusy(false); }
  };
  return { busy, message, act };
}
```

- [ ] **Step 2: Write the two pages**

`parent/src/screens/settings/SchoolAccessPage.jsx`:

```jsx
import { useState } from 'react';
import S from '../../strings.js';
import { T } from '../../styles.js';
import PageHeader from '../../components/PageHeader.jsx';
import { Banner, Btn, Card, Field, Sel, Spinner } from '../../components/ui.jsx';
import { useSchoolContext } from '../../hooks/useSchoolContext.js';
import { useSchoolAction } from '../../hooks/useSchoolAction.js';
import { ROLE_LABELS, REQUESTABLE_ROLES, REQUEST_STATUS, sectionLabel, sectionsByGrade } from '../../lib/school.js';

// Any verified account can ask; nothing changes until an approver says yes.
export default function SchoolAccessPage({ ctx, back }) {
  const school = useSchoolContext(ctx.user.uid);
  const { busy, message, act } = useSchoolAction(school.refresh);
  const [form, setForm] = useState({ role: 'adviser', sectionId: '' });
  const context = school.data;
  const sections = context?.sections || [];
  const mine = context?.myRequests || [];
  const submit = (event) => {
    event.preventDefault();
    if (form.sectionId) act('requestSchoolRoleFn', form, S.schoolAccessSent, () => setForm({ ...form, sectionId: '' }));
  };
  return (
    <>
      <PageHeader title={S.schoolAccessTitle} onBack={back} />
      {school.loading && !context && <Spinner label={S.loading} />}
      {school.error && <Banner tone="danger">{school.error}</Banner>}
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      {context && <>
        <Card>
          <p style={{ marginTop: 0, fontSize: 14 }}>{S.schoolAccessIntro}</p>
          {context.ended ? <p style={{ fontSize: 14 }}>{S.schoolAccessEnded}</p> : (
            <form onSubmit={submit}>
              <Field label={S.schoolAccessRole}><Sel value={form.role} disabled={busy} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {REQUESTABLE_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</Sel></Field>
              <Field label={S.schoolAccessSection}><Sel required value={form.sectionId} disabled={busy} onChange={(e) => setForm({ ...form, sectionId: e.target.value })}>
                <option value="">{S.schoolAccessChooseSection}</option>
                {sectionsByGrade(sections).map((g) => <optgroup key={g.grade} label={`Grade ${g.grade}`}>
                  {g.sections.map((s) => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}</optgroup>)}</Sel></Field>
              <Btn type="submit" disabled={busy || !form.sectionId}>{S.schoolAccessSubmit}</Btn>
            </form>
          )}
        </Card>
        <Card>
          <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>{S.schoolAccessMine}</h2>
          {mine.length === 0 ? <p style={{ fontSize: 14, margin: 0 }}>{S.schoolAccessNone}</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{mine.map((r) => (
              <li key={r.id} style={{ padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
                <div style={{ fontWeight: 600 }}>{ROLE_LABELS[r.role]} · {sectionLabel(sections.find((s) => s.id === r.sectionId))}</div>
                <div style={{ fontSize: 13, color: T.inkMuted }}>{REQUEST_STATUS[r.status] || r.status}{r.reason ? ` · ${r.reason}` : ''}</div>
                {r.status === 'pending' && <Btn variant="ghost" disabled={busy} style={{ marginTop: 8 }}
                  onClick={() => act('withdrawSchoolRequestFn', { requestId: r.id }, S.schoolAccessWithdrawn)}>{S.schoolAccessWithdraw}</Btn>}
              </li>))}</ul>
          )}
        </Card>
      </>}
    </>
  );
}
```

`parent/src/screens/settings/SchoolRequestsPage.jsx`:

```jsx
import { useState } from 'react';
import S from '../../strings.js';
import { T } from '../../styles.js';
import PageHeader from '../../components/PageHeader.jsx';
import { Banner, Btn, Card, EmptyState, Field, Inp, Spinner } from '../../components/ui.jsx';
import { useSchoolContext } from '../../hooks/useSchoolContext.js';
import { useSchoolAction } from '../../hooks/useSchoolAction.js';
import { ROLE_LABELS, sectionLabel } from '../../lib/school.js';

// Curriculum Advisers review adviser requests from DepEd accounts in their grades.
export default function SchoolRequestsPage({ ctx, back }) {
  const school = useSchoolContext(ctx.user.uid);
  const { busy, message, act } = useSchoolAction(school.refresh);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const context = school.data;
  const queue = context?.reviewQueue || [];
  const sections = context?.sections || [];
  const locked = busy || Boolean(context?.ended);
  const reject = (event, request) => {
    event.preventDefault();
    if (reason.trim()) act('resolveSchoolRoleFn', { requestId: request.id, approve: false, reason: reason.trim() }, S.schoolRequestsRejected, () => { setRejecting(null); setReason(''); });
  };
  return (
    <>
      <PageHeader title={S.schoolRequestsTitle} onBack={back} />
      {school.loading && !context && <Spinner label={S.loading} />}
      {school.error && <Banner tone="danger">{school.error}</Banner>}
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      {context && <Card>
        <p style={{ marginTop: 0, fontSize: 14 }}>{S.schoolRequestsIntro}</p>
        {queue.length === 0 ? <EmptyState title={S.schoolRequestsEmpty} /> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{queue.map((r) => (
            <li key={r.id} style={{ padding: '12px 0', borderTop: `1px solid ${T.border}` }}>
              <div style={{ fontWeight: 600 }}>{r.displayName || r.email}</div>
              <div style={{ fontSize: 13, color: T.inkMuted, overflowWrap: 'anywhere' }}>{r.email}</div>
              <div style={{ fontSize: 14, margin: '4px 0 8px' }}>{ROLE_LABELS[r.role]} · {sectionLabel(sections.find((s) => s.id === r.sectionId))}</div>
              {r.conflict ? <Banner tone="warn">{S.schoolRequestsNeedsAdmin}</Banner>
                : rejecting === r.id ? (
                  <form onSubmit={(e) => reject(e, r)}>
                    <Field label={S.schoolRequestsReason}><Inp autoFocus required maxLength={500} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} /></Field>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Btn type="submit" disabled={busy || !reason.trim()}>{S.schoolRequestsConfirmReject}</Btn>
                      <Btn type="button" variant="ghost" disabled={busy} onClick={() => setRejecting(null)}>{S.schoolRequestsCancel}</Btn>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Btn disabled={locked} onClick={() => act('resolveSchoolRoleFn', { requestId: r.id, approve: true }, S.schoolRequestsApproved)}>{S.schoolRequestsApprove}</Btn>
                    <Btn variant="ghost" disabled={locked} onClick={() => { setRejecting(r.id); setReason(''); }}>{S.schoolRequestsReject}</Btn>
                  </div>
                )}
            </li>))}</ul>
        )}
      </Card>}
    </>
  );
}
```

Check before saving: `parent/src/styles.js` must export `T` with `border` and `inkMuted`, because `parent/src/components/ui.jsx` already uses `T.border` and `T.inkMuted`. If the export name differs, match `ui.jsx`'s import line exactly.

- [ ] **Step 3: Wire Settings**

In `parent/src/screens/Settings.jsx`:

Add the imports below `import SchoolModePage ...`:

```js
import SchoolAccessPage from './settings/SchoolAccessPage.jsx';
import SchoolRequestsPage from './settings/SchoolRequestsPage.jsx';
```

Replace `PAGES` with:

```js
const PAGES = {
  profile: ProfilePage, notifications: NotificationsPage, appearance: AppearancePage, install: InstallPage,
  learners: LearnersPage, reports: ReportsPage, help: HelpPage, privacy: PrivacyPage, about: AboutPage,
  developers: DevelopersPage, mode: SchoolModePage, 'school-access': SchoolAccessPage, 'school-requests': SchoolRequestsPage,
};
```

In `ctx`, change `mode, chooseMode, schoolAllowed: allowed,` to:

```js
    mode, chooseMode, schoolAllowed: allowed, schoolContext: school.data,
```

Replace the two lines starting `const Page = section && ...` and `useEffect(() => { if (section && !Page ...` with:

```js
  // School-only pages wait for the school answer before deciding.
  const gated = { mode: allowed, 'school-requests': Array.isArray(school.data?.reviewQueue) };
  const Page = section && gated[section] !== false ? PAGES[section] : null;
  useEffect(() => { if (section && !Page && !(section in gated && school.loading)) navigate('/settings', { replace: true }); }, [section, Page, school.loading, navigate]);
```

In `SettingsHome`, change the destructuring to add `schoolContext`:

```js
  const { user, navigate, links, reports, state, savedName, mode, schoolAllowed, schoolContext } = ctx;
```

Replace the `{schoolAllowed && ( <SettingsGroup> ... </SettingsGroup> )}` block with:

```jsx
      <SettingsGroup>
        {schoolAllowed && <SettingsRow tile="teal" icon="class" label={S.modeTitle} value={mode.view === 'school' ? S.modeSchool : S.modeFamily} onClick={() => navigate('/settings/mode')} />}
        {Array.isArray(schoolContext?.reviewQueue) && <SettingsRow tile="teal" icon="class" label={S.schoolRequestsTitle}
          value={schoolContext.reviewQueue.length ? String(schoolContext.reviewQueue.length) : ''} onClick={() => navigate('/settings/school-requests')} />}
        <SettingsRow tile="teal" icon="class" label={S.schoolAccessRow} subtitle={S.schoolAccessRowHint}
          value={schoolContext?.myRequests?.some((r) => r.status === 'pending') ? S.requestPending : undefined} onClick={() => navigate('/settings/school-access')} />
      </SettingsGroup>
```

- [ ] **Step 4: Report School opened from App.jsx**

In `parent/src/App.jsx`, change the portal mode import to add `canUseSchool`, and add the helper import:

```js
import { readMode, writeMode, reconcileMode, schoolHome, canUseSchool } from './lib/portalMode.js';
import { claimOpenedToday } from './lib/school.js';
```

`callable` is already imported in `App.jsx` (it is used for `acceptConsentFn`). If it is not, add `callable` to the existing `./firebase.js` import. Directly after the reconcile `useEffect` (the one ending `}, [school.data, mode, view, setMode, navigate]);`), add:

```js
  // Lets SIMS show which assigned teachers have opened School mode (once a day at most).
  useEffect(() => {
    if (!uid || mode.view !== 'school' || !canUseSchool(school.data) || !claimOpenedToday(uid)) return;
    callable('markSchoolOpenedFn')({}).catch(() => {});
  }, [uid, mode.view, school.data]);
```

- [ ] **Step 5: Verify and commit**

Run: `npm --prefix parent test`
Expected: PASS

Run: `npm --prefix parent run build && npm --prefix parent run size`
Expected: the build succeeds and the size check passes. In this worktree, junction the main checkout's `parent/node_modules/jsqr` first, then remove the junction afterwards.

```bash
git add parent/src/hooks/useSchoolAction.js parent/src/screens/settings/SchoolAccessPage.jsx parent/src/screens/settings/SchoolRequestsPage.jsx parent/src/screens/Settings.jsx parent/src/App.jsx
git commit -m "Let teachers request school roles and Curriculum Advisers review them in the app" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Full verification

**Files:** none changed unless a check fails.

- [ ] **Step 1: Unit suites**

```bash
npm test
npm --prefix functions test
npm --prefix parent test
```

Expected: all PASS.

- [ ] **Step 2: Emulator and rules suites**

```bash
npm run test:functions
npm run test:rules
```

Expected: all PASS. `test:rules` still passes because no rules changed.

- [ ] **Step 3: Builds**

```bash
npm run build
npm --prefix parent run build
npm --prefix parent run size
```

Expected: all succeed, and the parent bundle stays within budget.

- [ ] **Step 4: Manual check against the emulators**

Start the emulators and the SIMS and Parent dev servers, each as its own background task, and record their PIDs. Then walk through this flow:

1. A teacher account in the app opens Settings → Request school access, requests Adviser for a Grade 7 section, sees "Waiting for review", and then withdraws and requests again.
2. A Curriculum Adviser for Grade 7 sees Settings → Teacher requests (1) and approves the request. A conflicting request shows "an administrator reviews this request in SIMS".
3. In SIMS, an admin sees the sidebar badge and the Pending tab. They approve one request, bulk approve two, reject one with a reason, and replace a conflicting adviser.
4. The success banner is green, not red. Coverage shows the gaps and "Review …'s request". Assignments filters by "Not opened yet". Both CSV exports open in Excel. History lists every action.
5. The teacher switches to School. After a SIMS refresh, Assignments shows "Opened {date}".
6. Check dark mode (Appearance → Dark) for the flags, badge and success banner.

Stop only the PIDs you started.

- [ ] **Step 5: Wrap up**

Use superpowers:finishing-a-development-branch. Do **not** deploy. When this ships later, deploy in this order: functions and `firestore.indexes.json` first, then SIMS from the release tree (per the SIMS deploy hold), then the Parent App with `hosting:parent`.
