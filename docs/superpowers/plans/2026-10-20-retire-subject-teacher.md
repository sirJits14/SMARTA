# Retire Subject Teacher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Subject Teacher role everywhere, leaving the Parent App with only **Parent/Guardian** and **Class Adviser**, and add a one-off admin callable that cleans up the accounts holding Subject Teacher today.

**Architecture:**
- The shared role lists (`shared/schoolAccess.js`, `shared/announcementAudience.js`) drop `subject_teacher`. Every reader already filters by those lists, so leftover rows become invisible.
- The Adviser/Subject Teacher exclusion code is deleted.
- A new callable, `retireSubjectTeachersFn`, deletes leftover rows in production, with an audit row and an inbox note for each account. It replaces `migrateSubjectTeachersFn`.
- The Parent App chooser shows two cards. The "Family" labels become "Parent/Guardian"; the internal role id stays `family`.

**Tech Stack:** React 19 + Vite 8 (SIMS at the repo root, Parent App in `parent/`), Firebase Cloud Functions v2 on Node 22 (`functions/`), Firestore, Vitest 4, Firebase emulators.

**Spec:** `docs/superpowers/specs/2026-10-20-retire-subject-teacher-design.md`

## Global Constraints

- **Role ids:**
  - `family` stays the internal id for Parent/Guardian. No stored data is renamed.
  - SIMS keeps the "Families" wording.
- **Shared lists after this plan:**
  - `SCHOOL_ROLES = ['adviser', 'curriculum_adviser']`
  - `REQUESTABLE_ROLES = ['adviser']`
  - `GRADE_ROLES = ['curriculum_adviser']`
  - `ANNOUNCEMENT_ROLES = ['family', 'adviser', 'curriculum_adviser']`
- **Exact copy:**
  - Refusal: "Subject Teacher is no longer offered. Choose Class Adviser, or Parent/Guardian to link a learner."
  - Retired-role note title: "Subject Teacher access has ended"
  - Note body: "BNHS no longer uses the Subject Teacher role, so these notices stop. If you are a class adviser or a learner's parent or guardian, add that role in Settings → Add a role."
  - Request rejection reason: "The Subject Teacher role was retired."
- **Transactions:** every Firestore transaction reads everything before its first write.
- **Callables:** the cleanup uses school identity, like the migration it replaces. Admin is checked with `loadSchoolActor(deps).isAdmin`.
- **Deletion:** delete Subject Teacher code and tests outright. Do not skip them.
- **Shared code in functions:** `functions/shared/` is a generated copy, refreshed by `node scripts/syncShared.mjs`, which runs in the `pretest` scripts. Never edit `functions/shared/` by hand.
- **Worktrees:** these checkouts need `node_modules` junctions to the main checkout (root, `functions/`, `parent/`). Check with `Test-Path node_modules\vitest, functions\node_modules\vitest, parent\node_modules\vitest` before running tests.
- **One emulator test file:**
  `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/<file>.test.js"`
  If another session holds ports 8080/9099, copy the alternate-port config described in the emulator-browser-check notes. Never kill `node` by name.
- **Commits:** end each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. In PowerShell, write the message to a file and use `git commit -F <file>`.

## Spec adjustments made while planning

- **Identity:** the spec says the cleanup runs "through `staffCall`". The migration it replaces used school identity with `loadSchoolActor(...).isAdmin`, and the audit rows need the actor's email in the same shape, so this plan follows the migration's pattern.
- **Refusals:** the spec says roles outside `REQUESTABLE_ROLES` fail with `invalid-argument`. A Curriculum Adviser request keeps its existing `permission-denied` "An administrator assigns Curriculum Adviser access." message, which an existing test covers. Only `subject_teacher` gets the new `invalid-argument` message.

Task 1 updates the spec to match.

---

### Task 1: The cleanup callable `retireSubjectTeachersFn`

**Files:**
- Create: `functions/src/handlers/retireSubjectTeachers.js`
- Create: `functions/test/emulator/retireSubjectTeachers.test.js`
- Modify: `functions/index.js` (import line 24; export at lines 154–157)
- Delete: `functions/src/handlers/schoolMigration.js`, `functions/src/lib/subjectTeacherMigration.js`, `functions/src/lib/subjectTeacherMigration.test.js`, `functions/test/emulator/schoolMigration.test.js`
- Modify: `docs/superpowers/specs/2026-10-20-retire-subject-teacher-design.md` (the two adjustments above)

**Interfaces:**
- Consumes (from `functions/src/handlers/schoolAccess.js`, unchanged):
  - `loadSchoolActor(deps, reader?) → { uid, email, isAdmin, schoolYear, ... }`
  - `inboxRef(db, uid, key) → DocumentReference`
  - `auditRow(actor, action, targetId, details) → object`
  - `teacherOf(person) → { teacherEmail, teacherName }`
- Produces:
  - `retireSubjectTeachers(deps, input) → Promise<{ dryRun: boolean, accounts: number, rows: number, requests: number }>`
  - `RETIRED_NOTE` (object: `type`, `title`, `body`)
  - The callable export `retireSubjectTeachersFn`

- [ ] **Step 1: Write the failing emulator test**

Create `functions/test/emulator/retireSubjectTeachers.test.js`:

```js
import { beforeEach, describe, expect, it } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { retireSubjectTeachers, RETIRED_NOTE } from '../../src/handlers/retireSubjectTeachers.js';

const year = '2026-2027';
const deps = (uid, email) => ({ db: db(), auth: {}, now: () => new Date(), uid, email, authTime: 1792195200 });
const admin = () => deps('admin', 'admin@school.test');
const inbox = async uid => (await db().collection(`guardians/${uid}/inbox`).get()).docs.map(d => d.data());
const audit = async action => (await db().collection('audit_log').where('action', '==', action).get()).docs.map(d => d.data());

beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('users/admin@school.test').set({ uid: 'admin', role: 'admin' });
  await db().doc('users/glc7@school.test').set({ uid: 'glc7', role: 'glc', gradeLevel: 7 });
  await db().doc('school_accounts/t1').set({ email: 't1@deped.gov.ph', displayName: 'Ana', assignments: [
    { role: 'subject_teacher', schoolYear: year, gradeLevel: 7 }, { role: 'subject_teacher', schoolYear: year, gradeLevel: 8 }] });
  await db().doc('school_accounts/t2').set({ email: 't2@deped.gov.ph', displayName: 'Ben', assignments: [
    { role: 'curriculum_adviser', schoolYear: year, gradeLevel: 9 }, { role: 'subject_teacher', schoolYear: year, gradeLevel: 7 }] });
  await db().doc('school_accounts/old').set({ email: 'old@deped.gov.ph', assignments: [{ role: 'subject_teacher', schoolYear: '2025-2026', gradeLevel: 7 }] });
  await db().doc('school_accounts/adv').set({ email: 'adv@deped.gov.ph', assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 }] });
  await db().doc('school_role_requests/r1').set({ uid: 't3', email: 't3@gmail.com', emailVerified: true, displayName: 'Cy', role: 'subject_teacher',
    schoolYear: year, gradeLevel: 8, status: 'pending', createdAt: new Date() });
  await db().doc('school_role_requests/r2').set({ uid: 't4', email: 't4@gmail.com', emailVerified: true, role: 'adviser',
    schoolYear: year, sectionId: 'SEC1', gradeLevel: 7, status: 'pending', createdAt: new Date() });
});

describe('retireSubjectTeachers', () => {
  it('refuses anyone but an administrator', async () => {
    await expect(retireSubjectTeachers(deps('t1', 't1@deped.gov.ph'), { apply: true })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(retireSubjectTeachers(deps('glc7', 'glc7@school.test'), { apply: true })).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('only counts on a dry run', async () => {
    expect(await retireSubjectTeachers(admin(), {})).toEqual({ dryRun: true, accounts: 3, rows: 4, requests: 1 });
    expect((await db().doc('school_accounts/t1').get()).data().assignments).toHaveLength(2);
    expect((await db().doc('school_role_requests/r1').get()).data().status).toBe('pending');
    expect(await inbox('t1')).toEqual([]);
  });
  it('removes every Subject Teacher row, keeps other roles, and tells current-year holders', async () => {
    expect(await retireSubjectTeachers(admin(), { apply: true })).toEqual({ dryRun: false, accounts: 3, rows: 4, requests: 1 });
    expect((await db().doc('school_accounts/t1').get()).data().assignments).toEqual([]);
    expect((await db().doc('school_accounts/t2').get()).data().assignments).toEqual([{ role: 'curriculum_adviser', schoolYear: year, gradeLevel: 9 }]);
    expect((await db().doc('school_accounts/old').get()).data().assignments).toEqual([]);
    expect((await db().doc('school_accounts/adv').get()).data().assignments).toHaveLength(1);
    expect(await inbox('t1')).toEqual([expect.objectContaining(RETIRED_NOTE)]);
    expect(await inbox('t2')).toEqual([expect.objectContaining(RETIRED_NOTE)]);
    expect(await inbox('old')).toEqual([]);
    const rows = await audit('school.roleRetired');
    expect(rows.map(r => r.targetId).sort()).toEqual(['old', 't1', 't2']);
    expect(rows.find(r => r.targetId === 't1')).toMatchObject({ actorUid: 'admin@school.test', details: {
      role: 'subject_teacher', teacherEmail: 't1@deped.gov.ph', teacherName: 'Ana',
      removed: [expect.objectContaining({ gradeLevel: 7 }), expect.objectContaining({ gradeLevel: 8 })] } });
  });
  it('rejects pending Subject Teacher requests with a reason and leaves adviser requests alone', async () => {
    await retireSubjectTeachers(admin(), { apply: true });
    expect((await db().doc('school_role_requests/r1').get()).data()).toMatchObject({ status: 'rejected', reason: 'The Subject Teacher role was retired.', reviewedBy: 'admin' });
    expect((await db().doc('school_role_requests/r2').get()).data().status).toBe('pending');
    expect(await inbox('t3')).toEqual([expect.objectContaining({ type: 'school_access', rejected: true, body: 'Reason: The Subject Teacher role was retired.' })]);
    expect(await audit('school.requestRejected')).toEqual([expect.objectContaining({ targetId: 't3' })]);
  });
  it('changes nothing on a second run', async () => {
    await retireSubjectTeachers(admin(), { apply: true });
    expect(await retireSubjectTeachers(admin(), { apply: true })).toEqual({ dryRun: false, accounts: 0, rows: 0, requests: 0 });
    expect(await retireSubjectTeachers(admin(), {})).toEqual({ dryRun: true, accounts: 0, rows: 0, requests: 0 });
    expect(await inbox('t1')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/retireSubjectTeachers.test.js"`

Expected: FAIL, because the module `../../src/handlers/retireSubjectTeachers.js` does not exist.

- [ ] **Step 3: Write the handler**

Create `functions/src/handlers/retireSubjectTeachers.js`:

```js
import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { loadSchoolActor, inboxRef, auditRow, teacherOf } from './schoolAccess.js';

const ROLE = 'subject_teacher';
const REASON = 'The Subject Teacher role was retired.';
export const RETIRED_NOTE = { type: 'school_access', title: 'Subject Teacher access has ended',
  body: "BNHS no longer uses the Subject Teacher role, so these notices stop. If you are a class adviser or a learner's parent or guardian, add that role in Settings → Add a role." };

// Subject Teacher was retired on 2026-10-20 (spec 2026-10-20). One-off and safe
// to re-run: {} only counts; { apply: true } removes every Subject Teacher row,
// rejects pending requests, and tells current-year holders why notices stopped.
export async function retireSubjectTeachers(deps, input = {}) {
  const { db } = deps;
  const actor = await loadSchoolActor(deps);
  if (!actor.isAdmin) throw new CallableError('permission-denied', 'Administrators only.');
  const subjectRows = data => (data?.assignments || []).filter(a => a.role === ROLE);
  const holders = (await db.collection('school_accounts').get()).docs.filter(snap => subjectRows(snap.data()).length);
  const requests = (await db.collection('school_role_requests').where('role', '==', ROLE).where('status', '==', 'pending').get()).docs;
  if (input.apply !== true) {
    return { dryRun: true, accounts: holders.length, rows: holders.reduce((n, snap) => n + subjectRows(snap.data()).length, 0), requests: requests.length };
  }
  let accounts = 0; let rows = 0; let closed = 0;
  for (const snap of holders) {
    const removed = await db.runTransaction(async tx => {
      const data = (await tx.get(snap.ref)).data() || {};
      const gone = subjectRows(data);
      if (!gone.length) return 0;
      tx.update(snap.ref, { assignments: (data.assignments || []).filter(a => a.role !== ROLE), updatedAt: FieldValue.serverTimestamp() });
      tx.set(db.collection('audit_log').doc(), auditRow(actor, 'school.roleRetired', snap.id, { role: ROLE, removed: gone, ...teacherOf(data) }));
      if (gone.some(a => a.schoolYear === actor.schoolYear)) {
        tx.set(inboxRef(db, snap.id, `retired:${ROLE}`), { ...RETIRED_NOTE, createdAt: FieldValue.serverTimestamp() });
      }
      return gone.length;
    });
    if (removed) { accounts++; rows += removed; }
  }
  for (const snap of requests) {
    const done = await db.runTransaction(async tx => {
      const request = (await tx.get(snap.ref)).data();
      if (request?.status !== 'pending' || request.role !== ROLE) return false;
      tx.update(snap.ref, { status: 'rejected', reason: REASON, reviewedBy: actor.uid, reviewedAt: FieldValue.serverTimestamp() });
      tx.set(inboxRef(db, request.uid, `rejected:${snap.id}`), { type: 'school_access', rejected: true,
        title: 'School access request not approved', body: `Reason: ${REASON}`, createdAt: FieldValue.serverTimestamp() });
      tx.set(db.collection('audit_log').doc(), auditRow(actor, 'school.requestRejected', request.uid,
        { requestId: snap.id, reason: REASON, role: ROLE, sectionId: request.sectionId || '', gradeLevel: request.gradeLevel ?? null, ...teacherOf(request) }));
      return true;
    });
    if (done) closed++;
  }
  return { dryRun: false, accounts, rows, requests: closed };
}
```

- [ ] **Step 4: Run the test to make sure it passes**

Run the Step 2 command.

Expected: PASS, 5 tests.

- [ ] **Step 5: Swap the callable export and delete the migration**

In `functions/index.js`, replace line 24:

```js
import { migrateSubjectTeachers } from './src/handlers/schoolMigration.js';
```

with:

```js
import { retireSubjectTeachers } from './src/handlers/retireSubjectTeachers.js';
```

Replace lines 154–157:

```js
export const migrateSubjectTeachersFn = onCall({ enforceAppCheck: true, timeoutSeconds: 540 }, async req => {
  try { return await migrateSubjectTeachers({ ...callDeps(), ...(await schoolIdentity(db, auth, req)) }); }
  catch (e) { throw toHttpsError(e); }
});
```

with:

```js
// One-off cleanup after Subject Teacher was retired (spec 2026-10-20). {} counts; { apply: true } changes.
export const retireSubjectTeachersFn = onCall({ enforceAppCheck: true, timeoutSeconds: 540 }, async req => {
  try { return await retireSubjectTeachers({ ...callDeps(), ...(await schoolIdentity(db, auth, req)) }, req.data || {}); }
  catch (e) { throw toHttpsError(e); }
});
```

Delete the migration files:

```bash
git rm functions/src/handlers/schoolMigration.js functions/src/lib/subjectTeacherMigration.js functions/src/lib/subjectTeacherMigration.test.js functions/test/emulator/schoolMigration.test.js
```

- [ ] **Step 6: Record the planning adjustments in the spec**

In `docs/superpowers/specs/2026-10-20-retire-subject-teacher-design.md`, replace:

`- **Who can call it:** administrators only, through `staffCall`, with `scopedGrades(profile) === null`. It runs with a 540-second timeout and is safe to re-run.`

with:

`- **Who can call it:** administrators only. It uses school identity, like the migration it replaces, and checks `loadSchoolActor(deps).isAdmin`. It runs with a 540-second timeout and is safe to re-run.`

Then replace:

`  - Any role outside `REQUESTABLE_ROLES` fails with `invalid-argument`: "Subject Teacher is no longer offered. Choose Class Adviser, or Parent/Guardian to link a learner." The message names Subject Teacher only when that was the requested role; otherwise it uses the existing "Choose a school role." message.`

with:

`  - A `subject_teacher` request fails with `invalid-argument`: "Subject Teacher is no longer offered. Choose Class Adviser, or Parent/Guardian to link a learner." A Curriculum Adviser request keeps its existing `permission-denied` message.`

- [ ] **Step 7: Run the functions unit tests and the new emulator file**

Run: `npm --prefix functions test`

Expected: PASS. `subjectTeacherMigration.test.js` is gone, and nothing imports the deleted files.

Run: `node -e "import('./functions/index.js').then(m => console.log(Object.keys(m).filter(k => /Subject/.test(k))))"` from the repo root after `node scripts/syncShared.mjs`.

Expected: `[ 'retireSubjectTeachersFn' ]`. If importing `index.js` needs Firebase config, skip this check and instead run:

`git grep -n "schoolMigration\|subjectTeacherMigration\|migrateSubjectTeachers" -- functions src parent/src shared`

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add functions/src/handlers/retireSubjectTeachers.js functions/test/emulator/retireSubjectTeachers.test.js functions/index.js docs/superpowers/specs/2026-10-20-retire-subject-teacher-design.md
git commit -F <message file>   # "Add the Subject Teacher cleanup callable"
```

---

### Task 2: Parent App: two-card chooser and Parent/Guardian labels

**Files:**
- Modify: `parent/src/lib/join.js` (whole file below)
- Modify: `parent/src/screens/join/RoleChooser.jsx`
- Modify: `parent/src/screens/Join.jsx` (imports, `STEPS`, `roleOptions` call)
- Modify: `parent/src/screens/join/JoinSummary.jsx:11-13`
- Modify: `parent/src/screens/join/StepHeader.jsx:4` (comment)
- Modify: `parent/src/screens/School.jsx:16` (comment)
- Modify: `parent/src/strings.js`
- Delete: `parent/src/screens/join/SubjectTeacherStep.jsx`
- Test: `parent/src/lib/join.test.js`, `parent/src/screens/join/screens.test.js`, `parent/src/lib/strings.test.js`, `parent/src/lib/portalMode.test.js`

**Interfaces:**
- Produces:
  - `JOIN_ROLES = ['family', 'adviser']`
  - `roleOptions({ held, selected, email }) → [{ key, state: 'available'|'selected'|'held', active, needsApproval }]`. The `pending` argument and the `'blocked'` state are gone.
  - `pendingRoles` is removed.
- Leaves `parent/src/lib/school.js` unchanged; Task 3 owns it.

- [ ] **Step 1: Rewrite the join rule tests**

Replace `parent/src/lib/join.test.js` with:

```js
import { describe, it, expect } from 'vitest';
import { JOIN_ROLES, heldRoles, roleOptions, toggleRole, joinSteps, initialSelection, initialCode, landingModeFor, codeDraft, prettyCode } from './join.js';

const state = (options, key) => options.find((o) => o.key === key);
describe('join rules', () => {
  it('lists Parent/Guardian then Class Adviser', () => {
    expect(JOIN_ROLES).toEqual(['family', 'adviser']);
  });
  it('reads held roles from the school context and family links', () => {
    const context = { assignments: [{ role: 'adviser' }, { role: 'curriculum_adviser' }, { role: 'subject_teacher' }] };
    expect(heldRoles(context, [{}])).toEqual(['adviser', 'family']);
    expect(heldRoles(null, [])).toEqual([]);
  });
  it('lets both roles be ticked together', () => {
    const options = roleOptions({ held: [], selected: ['adviser', 'family'], email: 'a@deped.gov.ph' });
    expect(options.map((o) => [o.key, o.state])).toEqual([['family', 'selected'], ['adviser', 'selected']]);
    expect(options.some((o) => o.state === 'blocked')).toBe(false);
  });
  it('keeps Parent/Guardian addable for parents who already linked a learner', () => {
    const options = roleOptions({ held: ['family'], selected: ['family'], email: 'p@gmail.com' });
    expect(state(options, 'family')).toMatchObject({ state: 'selected', active: true, needsApproval: false });
  });
  it('locks a held Class Adviser card and tags approval for personal emails only', () => {
    expect(state(roleOptions({ held: ['adviser'], selected: [], email: 'a@deped.gov.ph' }), 'adviser')).toMatchObject({ state: 'held', active: true });
    expect(state(roleOptions({ held: [], selected: [], email: 'p@gmail.com' }), 'adviser').needsApproval).toBe(true);
    expect(state(roleOptions({ held: [], selected: [], email: 'p@deped.gov.ph' }), 'adviser').needsApproval).toBe(false);
  });
  it('toggles only roles that can change, and steps follow role order', () => {
    const options = roleOptions({ held: [], selected: ['adviser'], email: '' });
    expect(toggleRole(['adviser'], 'family', options)).toEqual(['adviser', 'family']);
    expect(toggleRole(['adviser'], 'adviser', options)).toEqual([]);
    expect(toggleRole(['adviser'], 'subject_teacher', options)).toEqual(['adviser']);
    expect(joinSteps(roleOptions({ held: [], selected: ['adviser', 'family'], email: '' }))).toEqual(['family', 'adviser']);
    const held = roleOptions({ held: ['adviser'], selected: ['adviser'], email: '' });
    expect(toggleRole(['adviser'], 'adviser', held)).toEqual(['adviser']);
    expect(joinSteps(held)).toEqual([]);
  });
  it('preselects from a slip link, ignores old Subject Teacher links, and hands the code to its step', () => {
    expect(initialSelection({ a: 'ABCD2345' })).toEqual(['adviser']);
    expect(initialSelection({ c: 'ABCD2345' })).toEqual(['family']);
    expect(initialSelection({ role: 'family' })).toEqual(['family']);
    expect(initialSelection({ role: 'adviser' })).toEqual(['adviser']);
    expect(initialSelection({ role: 'subject_teacher' })).toEqual([]);
    expect(initialSelection({})).toEqual([]);
    expect(initialCode({ a: 'abcd2345' }, 'adviser')).toBe('ABCD2345');
    expect(initialCode({ a: 'abcd2345' }, 'family')).toBe('');
  });
  it('lands adviser-only accounts in School and everyone else in Parent/Guardian', () => {
    expect(landingModeFor({ adviser: { outcome: 'active' } }, [])).toEqual({ view: 'school', hasClass: true });
    expect(landingModeFor({ adviser: { outcome: 'active' }, family: { outcome: 'active' } }, [])).toEqual({ view: 'family', hasClass: false });
    expect(landingModeFor({ adviser: { outcome: 'pending' } }, [])).toEqual({ view: 'family', hasClass: false });
    expect(landingModeFor({ subject_teacher: { outcome: 'active' } }, [])).toEqual({ view: 'family', hasClass: false });
    expect(landingModeFor({}, [])).toEqual({ view: 'family', hasClass: false });
  });
  it('counts roles the account already holds, so a skip lands in School', () => {
    expect(landingModeFor({}, [], [{ role: 'curriculum_adviser', gradeLevel: 7 }])).toEqual({ view: 'school', hasClass: false });
    expect(landingModeFor({}, [], [{ role: 'adviser', sectionId: 'a' }])).toEqual({ view: 'school', hasClass: true });
    expect(landingModeFor({}, [{}], [{ role: 'adviser', sectionId: 'a' }])).toEqual({ view: 'family', hasClass: false });
    expect(landingModeFor({ family: { outcome: 'active' } }, [], [{ role: 'curriculum_adviser' }])).toEqual({ view: 'family', hasClass: false });
    expect(landingModeFor({}, [], [{ role: 'family' }])).toEqual({ view: 'family', hasClass: false });
  });
  it('formats typed codes like the server reads them', () => {
    expect(codeDraft('abcd-o1il-xyz')).toBe('ABCD0111');
    expect(prettyCode('ABCD0111')).toBe('ABCD-0111');
    expect(prettyCode('ABC')).toBe('ABC');
  });
});
```

- [ ] **Step 2: Update the screen smoke tests**

In `parent/src/screens/join/screens.test.js`:
- delete the line `  SubjectTeacherStep: () => import('./SubjectTeacherStep.jsx'),`;
- change `expect(stepLabel(0, 2, 'Family Member')).toContain('1');` to `expect(stepLabel(0, 2, 'Parent/Guardian')).toContain('1');`;
- change `expect(Object.keys(ROLE_TEXT)).toEqual(['family', 'adviser', 'subject_teacher']);` to `expect(Object.keys(ROLE_TEXT)).toEqual(['family', 'adviser']);`;
- replace the test `'shows the three role titles and no approval tag for a DepEd email'` with:

```js
  it('shows the two role titles and no approval tag for a DepEd email', async () => {
    const options = roleOptions({ email: 'ana@deped.gov.ph' });
    const html = await render({ options });
    for (const title of [S.joinFamily, S.joinAdviser]) expect(html).toContain(title);
    expect(html).toContain('Parent/Guardian');
    expect(html).not.toContain('Subject Teacher');
    expect(html).not.toContain(S.joinNeedsApproval);
  });
```

- replace the test `'explains a blocked card'` with:

```js
  it('lets a teacher who is also a parent tick both cards', async () => {
    const options = roleOptions({ email: 'ana@deped.gov.ph', selected: ['family', 'adviser'] });
    const html = await render({ options, selected: ['family', 'adviser'] });
    expect(html.match(/aria-checked="true"/g)).toHaveLength(2);
    expect(html).not.toContain('not both');
  });
```

In `parent/src/lib/strings.test.js`, in the `'has the join strings'` list, remove the keys:
- `'joinSubject'`, `'joinSubjectHint'`, `'joinChooseOne'`;
- `'subjectTitle'`, `'subjectBody'`, `'subjectBodyApproval'`, `'subjectSubmit'`;
- `'summarySubjectOne'`, `'summarySubject'`.

Then add this test after it:

```js
  it('calls the family role Parent/Guardian and drops Subject Teacher copy', () => {
    expect(S.joinFamily).toBe('Parent/Guardian');
    expect(S.modeFamily).toBe('Parent/Guardian');
    expect(S.addRoleRowHint).toBe('Parent/Guardian or Class Adviser');
    expect(S.schoolRequestsIntro).toBe('Class Adviser requests for your grades, from any verified email. Approving gives the teacher that role right away.');
    for (const k of ['joinSubject', 'joinSubjectHint', 'joinChooseOne', 'subjectTitle', 'subjectBody', 'subjectBodyApproval', 'subjectSubmit', 'summarySubject', 'summarySubjectOne']) {
      expect(S[k], k).toBeUndefined();
    }
    expect(Object.values(S).filter((v) => typeof v === 'string' && /Subject Teacher|Family Member/.test(v))).toEqual([]);
  });
```

In `parent/src/lib/portalMode.test.js`, replace every `{ role: 'subject_teacher', sectionId: 'A' }` (lines 11, 44 and 53) with `{ role: 'curriculum_adviser', gradeLevel: 7 }`. These tests only need a school role without a class, and Curriculum Adviser is that role now.

- [ ] **Step 3: Run the Parent App tests and watch them fail**

Run: `npm --prefix parent test`

Expected: FAIL in `join.test.js` (`JOIN_ROLES` still has three roles), `screens.test.js` and `strings.test.js`.

- [ ] **Step 4: Rewrite `parent/src/lib/join.js`**

Replace the whole file with:

```js
import { isDepedEmail } from '../../../shared/schoolAccess.js';
import { normalizeCode } from './qrScan.js';

// "Who are you?" (spec 2026-10-20): Parent/Guardian, Class Adviser, or both.
export const JOIN_ROLES = ['family', 'adviser'];

export function heldRoles(context, familyLinks = []) {
  const roles = (context?.assignments || []).map((a) => a.role).filter((r) => r !== 'family' && JOIN_ROLES.includes(r));
  return [...new Set([...roles, ...(familyLinks.length ? ['family'] : [])])];
}

export function roleOptions({ held = [], selected = [], email = '' }) {
  const deped = isDepedEmail(email);
  return JOIN_ROLES.map((key) => {
    // A parent may always link another learner, so Parent/Guardian is never locked.
    if (key === 'family') return { key, state: selected.includes(key) ? 'selected' : 'available', active: held.includes(key), needsApproval: false };
    if (held.includes(key)) return { key, state: 'held', active: true, needsApproval: false };
    return { key, state: selected.includes(key) ? 'selected' : 'available', active: false, needsApproval: !deped };
  });
}

export function toggleRole(selected, key, options) {
  const option = options.find((o) => o.key === key);
  if (!option || option.state === 'held') return selected;
  return selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
}

export const joinSteps = (options) => options.filter((o) => o.state === 'selected').map((o) => o.key);

export function initialSelection(query = {}) {
  if (query.a) return ['adviser'];
  if (query.c || query.role === 'family') return ['family'];
  if (query.role === 'adviser') return ['adviser'];
  return [];
}
export const codeDraft = (value) => normalizeCode(value).slice(0, 8);
export const initialCode = (query = {}, role) => codeDraft((role === 'adviser' ? query.a : role === 'family' ? query.c : '') || '');
export const prettyCode = (value) => (value.length > 4 ? `${value.slice(0, 4)}-${value.slice(4)}` : value);

// Where "Open the app" lands. Roles just claimed (results) and roles the account
// already holds (assignments, e.g. a Curriculum Adviser assigned by the school)
// both count; a family link or Parent/Guardian result keeps the account in Family.
export function landingModeFor(results = {}, familyLinks = [], assignments = []) {
  const active = (role) => results[role]?.outcome === 'active';
  const assigned = (role) => assignments.some((a) => a.role === role);
  const school = active('adviser') || assignments.some((a) => a.role && a.role !== 'family');
  const family = active('family') || familyLinks.length > 0;
  return school && !family ? { view: 'school', hasClass: active('adviser') || assigned('adviser') } : { view: 'family', hasClass: false };
}
```

- [ ] **Step 5: Update the chooser, the join screen and the summary**

In `parent/src/screens/join/RoleChooser.jsx`:
- replace the `ROLE_TEXT` object with:

```js
export const ROLE_TEXT = {
  family: [S.joinFamily, S.joinFamilyHint],
  adviser: [S.joinAdviser, S.joinAdviserHint],
};
```

- in `RoleCard`, replace these four lines:

```js
  const locked = option.state === 'held' || option.state === 'blocked';
  const [title, hint] = ROLE_TEXT[option.key];
  // Only the box and title fade on a blocked card; the explanation keeps full contrast.
  const dim = option.state === 'blocked' ? 0.62 : 1;
```

  with:

```js
  const locked = option.state === 'held';
  const [title, hint] = ROLE_TEXT[option.key];
```

- remove `, opacity: dim` from the check-box `span` style;
- change `<strong style={{ fontSize: 16, opacity: dim }}>` to `<strong style={{ fontSize: 16 }}>`;
- change `{option.state === 'blocked' ? S.joinChooseOne : hint}` to `{hint}`.

In `parent/src/screens/Join.jsx`:
- change the import from `'../lib/join.js'` to `import { heldRoles, roleOptions, joinSteps, initialSelection, landingModeFor } from '../lib/join.js';`;
- delete `import SubjectTeacherStep from './join/SubjectTeacherStep.jsx';`;
- change `const STEPS = { family: FamilyStep, adviser: AdviserStep, subject_teacher: SubjectTeacherStep };` to `const STEPS = { family: FamilyStep, adviser: AdviserStep };`;
- in the `useMemo`, change `roleOptions({ held: heldRoles(school.data, links || []), pending: pendingRoles(school.data), selected, email: user.email })` to `roleOptions({ held: heldRoles(school.data, links || []), selected, email: user.email })`;
- change the comment `// "Who are you?" then one step per chosen role (spec 2026-10-19).` to `// "Who are you?" then one step per chosen role (specs 2026-10-19, 2026-10-20).`.

In `parent/src/screens/join/JoinSummary.jsx`, replace lines 11–13:

```js
  if (role === 'family') return `${S.summaryLinked} ${nameCase(result.detail)}`;
  if (role === 'adviser') return `${S.summaryAdviser} ${result.detail}`;
  return `${result.detail.includes(',') ? S.summarySubject : S.summarySubjectOne} ${result.detail}`;
```

with:

```js
  if (role === 'family') return `${S.summaryLinked} ${nameCase(result.detail)}`;
  return `${S.summaryAdviser} ${result.detail}`;
```

In `parent/src/screens/join/StepHeader.jsx`, change the comment `// "Step 1 of 2 · Family Member" above each role step, then the step title.` to `// "Step 1 of 2 · Parent/Guardian" above each role step, then the step title.`.

In `parent/src/screens/School.jsx`, change the comment `// No school access goes Home; subject teachers have no Class tab. App.jsx owns the saved mode.` to `// No school access goes Home; Curriculum Advisers have no Class tab. App.jsx owns the saved mode.`.

Delete the step: `git rm parent/src/screens/join/SubjectTeacherStep.jsx`.

- [ ] **Step 6: Update `parent/src/strings.js`**

- Change `modeFamily: 'Family',` to `modeFamily: 'Parent/Guardian',`.
- Change `joinFamily: 'Family Member',` to `joinFamily: 'Parent/Guardian',`.
- Delete the lines with these keys: `joinSubject`, `joinSubjectHint`, `joinChooseOne`, `subjectTitle`, `subjectBody`, `subjectBodyApproval`, `subjectSubmit`, `summarySubject`, `summarySubjectOne`.
- Change `addRoleRowHint: 'Family Member, Class Adviser or Subject Teacher',` to `addRoleRowHint: 'Parent/Guardian or Class Adviser',`.
- Change `schoolRequestsIntro` to `'Class Adviser requests for your grades, from any verified email. Approving gives the teacher that role right away.'`.

Then run `git grep -n "Subject Teacher\|Family Member\|subject_teacher" -- parent/src ':!*.test.js'`.

Expected: one match only, `parent/src/lib/school.js`. Task 3 changes it.

- [ ] **Step 7: Run the Parent App tests**

Run: `npm --prefix parent test`

Expected: PASS.

Run: `npm --prefix parent run build` with the main checkout's `parent/.env` loaded into the process only, then `npm --prefix parent run size`.

Expected: the build succeeds and the initial load stays under 260 KB.

- [ ] **Step 8: Commit**

```bash
git add -A parent/src
git commit -F <message file>   # "Offer Parent/Guardian and Class Adviser in the Parent App"
```

---

### Task 3: SIMS School Access and shared role labels

**Files:**
- Modify: `parent/src/lib/school.js:2-3` (`ROLE_LABELS`, `REQUESTABLE_ROLES`; SIMS imports these)
- Modify: `src/lib/schoolAssignments.js` (coverage, coverage CSV, history labels)
- Modify: `src/pages/guardians/school/CoverageView.jsx:28`
- Test: `parent/src/lib/school.test.js`, `src/lib/schoolAssignments.test.js`, `src/pages/guardians/school/CoverageView.test.js`, `src/pages/guardians/school/PendingView.test.js`

**Interfaces:**
- Produces:
  - `ROLE_LABELS = { adviser: 'Adviser', curriculum_adviser: 'Curriculum Adviser' }` and `REQUESTABLE_ROLES = ['adviser']`, from `parent/src/lib/school.js`.
  - `coverageByGrade(...)` groups no longer have a `subjectTeachers` field.
  - `coverageCsvRows` has 6 columns.
  - `historyLine` labels the retired role "Subject Teacher" and reads `school.roleRetired` rows.
- The Assign form, the assignment filter and the pending view read `ROLE_LABELS`, so they drop Subject Teacher without code changes.

- [ ] **Step 1: Update the tests**

In `parent/src/lib/school.test.js`:
- rename the test `'subject teachers have no learner roster; advisers and curriculum advisers have scoped rosters'` to `'a leftover Subject Teacher row has no learner roster; advisers and curriculum advisers have scoped rosters'`, keeping its body;
- change `expect(REQUESTABLE_ROLES).toEqual(['adviser', 'subject_teacher']);` to `expect(REQUESTABLE_ROLES).toEqual(['adviser']);`;
- add to that same test: `expect(ROLE_LABELS).toEqual({ adviser: 'Adviser', curriculum_adviser: 'Curriculum Adviser' });`, and add `ROLE_LABELS` to the file's import from `./school.js`.

In `src/lib/schoolAssignments.test.js`:
- line 8: change `{ uid: 't2', role: 'subject_teacher' }` to `{ uid: 't2', role: 'curriculum_adviser' }`;
- line 23: change ben's `role: 'subject_teacher'` to `role: 'curriculum_adviser'`, keeping his other fields;
- replace the coverage test with:

```js
  it('groups coverage by grade with gaps, curriculum advisers and pending adviser requests', () => {
    const [g7, g8] = coverageByGrade(sections, [ana, ben, cara], [dan]);
    expect(g7).toMatchObject({ grade: 7, covered: 1, curriculumAdvisers: [ben] });
    expect(g7).not.toHaveProperty('subjectTeachers');
    expect(g7.rows.map(r => [r.section.id, r.adviser?.uid ?? null, r.pending?.id ?? null])).toEqual([['A', 'u1', null], ['B', null, 'r1']]);
    expect(g8).toMatchObject({ grade: 8, covered: 0, curriculumAdvisers: [cara] });
  });
```

- in `'filters and sorts assignments'`, change `{ role: 'subject_teacher' }` to `{ role: 'curriculum_adviser' }`, and its expectation `['u2']` to `['u2', 'u3']`;
- in `'exports assignments and coverage rows'`, replace the last two `expect` lines with:

```js
    expect(coverage[0]).toEqual(['Grade', 'Section', 'Adviser', 'Adviser email', 'Opened', 'Pending request']);
    expect(coverage.slice(1, 3)).toEqual([[7, 'Rizal', 'Ana Cruz', 'ana@deped.gov.ph', 'Yes', ''], [7, 'Bonifacio', '', '', '', 'Dan']]);
```

- in `'turns audit rows into readable history'`, keep the `school.revoked` Subject Teacher expectation, which old audit rows still need, and add:

```js
    expect(historyLine({ action: 'school.roleRetired', actorUid: 'admin@school.test', targetId: 'u2', at,
      details: { role: 'subject_teacher', teacherName: 'Ben Dy', removed: [{ gradeLevel: 7 }, { gradeLevel: 8 }] } }, sections))
      .toMatchObject({ text: 'admin@school.test ended Ben Dy\'s Subject Teacher access (role retired) · Grades 7, 8' });
```

In `src/pages/guardians/school/CoverageView.test.js`:
- change Eve's `role: 'subject_teacher'` to `role: 'curriculum_adviser'`;
- change `expect(html).toContain('Curriculum Adviser: None');` to `expect(html).toContain('Curriculum Adviser: Eve Tan');`;
- replace `expect(html).toContain('Subject Teachers: 1');` with `expect(html).not.toContain('Subject Teacher');`.

In `src/pages/guardians/school/PendingView.test.js` line 11, change r2's `role: 'subject_teacher'` to `role: 'adviser'`. It stays a clean request because `conflict: null`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/schoolAssignments.test.js src/pages/guardians/school parent/src/lib/school.test.js`

Expected: FAIL. `REQUESTABLE_ROLES` still lists Subject Teacher, `subjectTeachers` is still present, the CSV still has 7 columns, and the `roleRetired` line is not rendered.

Note: `parent/src/lib/school.test.js` runs under the Parent App's Vitest. If the root run skips it, run `npm --prefix parent test -- src/lib/school.test.js`.

- [ ] **Step 3: Implement**

In `parent/src/lib/school.js`, replace lines 2–3 with:

```js
export const ROLE_LABELS = { adviser: 'Adviser', curriculum_adviser: 'Curriculum Adviser' };
export const REQUESTABLE_ROLES = ['adviser'];
```

In `src/lib/schoolAssignments.js`:
- after the import on line 1, add:

```js
// Audit history still names roles that were retired (Subject Teacher, spec 2026-10-20).
const HISTORY_ROLE_LABELS = { ...ROLE_LABELS, subject_teacher: 'Subject Teacher' };
```

- in `coverageByGrade`, replace:

```js
      curriculumAdvisers: assignments.filter(a => a.role === 'curriculum_adviser' && Number(a.gradeLevel) === grade),
      subjectTeachers: assignments.filter(a => a.role === 'subject_teacher' && Number(a.gradeLevel) === grade) };
```

  with:

```js
      curriculumAdvisers: assignments.filter(a => a.role === 'curriculum_adviser' && Number(a.gradeLevel) === grade) };
```

- replace `coverageCsvRows` with:

```js
export function coverageCsvRows(groups) {
  return [['Grade', 'Section', 'Adviser', 'Adviser email', 'Opened', 'Pending request'],
    ...groups.flatMap(g => g.rows.map(r => [g.grade, r.section.name || r.section.id, who(r.adviser), r.adviser?.email || '',
      r.adviser ? (openedStatus(r.adviser).opened ? 'Yes' : 'No') : '', who(r.pending)]))];
}
```

- in `assignmentCsvRows`, change `ROLE_LABELS[item.role] || item.role` to `HISTORY_ROLE_LABELS[item.role] || item.role`;
- in `historyLine`, change `const what = [ROLE_LABELS[d.role], scope].filter(Boolean).join(' · ');` to `const what = [HISTORY_ROLE_LABELS[d.role], scope].filter(Boolean).join(' · ');`;
- in the same function, insert this branch before the final `: \`${row.actorUid} ${VERBS[row.action] ...` line:

```js
    : row.action === 'school.roleRetired' ? `${row.actorUid} ended ${teacher}'s ${HISTORY_ROLE_LABELS[d.role] || d.role} access (role retired) · Grades ${(d.removed || []).map(a => a.gradeLevel).join(', ')}`
```

In `src/pages/guardians/school/CoverageView.jsx`, delete line 28:

```jsx
          <span style={{ fontSize: 13, color: T.inkMuted }}>{`Subject Teachers: ${g.subjectTeachers.length}`}</span>
```

- [ ] **Step 4: Run the tests**

Run: `npm test` (SIMS, root) and `npm --prefix parent test`.

Expected: PASS.

Then run `git grep -n "subject_teacher\|Subject Teacher\|subjectTeachers" -- src ':!*.test.js'`.

Expected: only the `HISTORY_ROLE_LABELS` line in `src/lib/schoolAssignments.js`.

- [ ] **Step 5: Commit**

```bash
git add parent/src/lib/school.js parent/src/lib/school.test.js src/lib/schoolAssignments.js src/lib/schoolAssignments.test.js src/pages/guardians/school
git commit -F <message file>   # "Drop Subject Teacher from SIMS School Access"
```

---

### Task 4: Shared role lists, server handlers and the announcement editor

**Files:**
- Modify: `shared/schoolAccess.js:1-12, 34-35`
- Modify: `shared/announcementAudience.js:5-6`
- Modify: `functions/src/handlers/schoolAccess.js` (import line 5, lines 30–39, 82–83, 96–134, 224, 264, 303, 401–407, 415–416)
- Modify: `functions/src/handlers/advisorySlips.js` (import line 9, `redeemAdvisorySlip`)
- Modify: `functions/src/handlers/portalAnnouncements.js:44-45`
- Modify: `src/lib/announcements.js` (`audienceLabel`, `formFromPost`)
- Modify: `parent/src/lib/announcements.js:25` (`audienceText`)
- Test: `parent/src/lib/announcements.test.js`
- Test:
  - `shared/schoolAccess.test.js`, `shared/announcementAudience.test.js`, `src/lib/announcements.test.js`;
  - `functions/test/emulator/schoolAccess.test.js`, `functions/test/emulator/advisorySlips.test.js`, `functions/test/emulator/announcements.test.js`, `functions/test/emulator/portalAnnouncements.test.js`;
  - `tests/rules/schoolPortal.test.js:31`, `tests/browser/school-review-fixture.js:88`.

**Interfaces:**
- Consumes: Task 2's `join.js`, which no longer imports `conflictingRole`, and Task 3's labels.
- Produces:
  - The shared lists from Global Constraints.
  - `conflictingRole`, `canHold`, `rolesHeld` and `assertCanHold` no longer exist.
  - `getSchoolContext` returns only `SCHOOL_ROLES` rows in `assignments`, `managedAssignments` and `myRequests`.

- [ ] **Step 1: Update the shared tests**

In `shared/schoolAccess.test.js`:
- change the import to `import { canReviewSection, canCorrectSession, canApproveRoleRequest, isFamilyLink, assignmentKey, isDepedEmail, REQUESTABLE_ROLES, GRADE_ROLES, SCHOOL_ROLES, isGradeRole } from './schoolAccess.js';`;
- rename the first test to `'a leftover Subject Teacher row permits no tracking, while advisory and curriculum scopes are enforced'`, keeping its body;
- in the approval test, replace the curriculum `for` loop over patches `[{}, { email: 'teacher@gmail.com' }, { role: 'subject_teacher' }, { role: 'subject_teacher', email: 'teacher@gmail.com' }]` with a loop over `[{}, { email: 'teacher@gmail.com' }]`;
- in the next loop's patch list, change `{ role: 'curriculum_adviser' }` to two entries: `{ role: 'curriculum_adviser' }, { role: 'subject_teacher' }`;
- change `for (const role of ['adviser', 'subject_teacher'])` to `for (const role of ['adviser'])`;
- replace the test `'keeps Adviser and Subject Teacher apart and leaves other roles free'` with:

```js
  it('keeps only Class Adviser and Curriculum Adviser as school roles', () => {
    expect(SCHOOL_ROLES).toEqual(['adviser', 'curriculum_adviser']);
    expect(GRADE_ROLES).toEqual(['curriculum_adviser']);
    expect(isGradeRole('curriculum_adviser')).toBe(true);
    expect(isGradeRole('subject_teacher')).toBe(false);
    expect(isGradeRole('adviser')).toBe(false);
  });
```

- in `'recognises DepEd accounts and requestable roles'`, change `expect(REQUESTABLE_ROLES).toEqual(['adviser', 'subject_teacher']);` to `expect(REQUESTABLE_ROLES).toEqual(['adviser']);`;
- in `'has collision-free scope keys'`, change `role: 'subject_teacher'` to `role: 'curriculum_adviser'`.

In `shared/announcementAudience.test.js`:
- replace the test `'reaches grade-level subject teachers for their grade and for sections in it'` (lines 28–34) with:

```js
  it('reaches Curriculum Advisers for their grade and for sections in it', () => {
    const teacher = { ...person, assignments: [{ role: 'curriculum_adviser', schoolYear: year, gradeLevel: 7 }] };
    expect(matchesAnnouncementAudience({ roles: ['curriculum_adviser'], grades: [7] }, teacher, 'school')).toBe(true);
    expect(matchesAnnouncementAudience({ roles: ['curriculum_adviser'], grades: [8] }, teacher, 'school')).toBe(false);
    expect(matchesAnnouncementAudience({ roles: ['curriculum_adviser'], all: true, sectionIds: ['s7'] }, teacher, 'school')).toBe(true);
    expect(matchesAnnouncementAudience({ roles: ['curriculum_adviser'], all: true, sectionIds: ['s8'] }, teacher, 'school')).toBe(false);
  });
  it('lists three recipient roles and no Subject Teachers', () => {
    expect(ANNOUNCEMENT_ROLES).toEqual(['family', 'adviser', 'curriculum_adviser']);
    expect(Object.keys(ANNOUNCEMENT_ROLE_LABELS)).toEqual(['family', 'adviser', 'curriculum_adviser']);
  });
```

  Keep any closing lines of the old test that are not shown above, and add `ANNOUNCEMENT_ROLES, ANNOUNCEMENT_ROLE_LABELS` to the file's import.

In `src/lib/announcements.test.js` line 56, change both `'subject_teacher'` to `'curriculum_adviser'`. Then add this test to the same `describe`:

```js
  it('drops the retired Subject Teacher role from saved announcements', () => {
    const post = { title: 'T', body: 'B', status: 'scheduled', audience: { grades: [7], roles: ['subject_teacher', 'adviser'] } };
    expect(formFromPost(post).roles).toEqual(['adviser']);
    expect(formFromPost({ ...post, audience: { grades: [7], roles: ['subject_teacher'] } }).roles).toEqual([]);
    expect(audienceLabel(['g7'], post.audience)).toBe('Advisers · Grade 7');
  });
```

Make sure `formFromPost` and `audienceLabel` are imported in that file.

In `parent/src/lib/announcements.test.js`, add:

```js
describe('audienceText after Subject Teacher was retired', () => {
  it('skips the retired role on old notices', () => {
    expect(audienceText(['g7'], { grades: [7], roles: ['subject_teacher', 'adviser'] })).toBe('Advisers · Grade 7');
  });
});
```

- [ ] **Step 2: Run the shared and SIMS tests and watch them fail**

Run: `npx vitest run shared src/lib/announcements.test.js` and `npm --prefix parent test -- src/lib/announcements.test.js`

Expected: FAIL. The lists still include `subject_teacher`, `formFromPost` keeps it, and `audienceText` prints "Subject Teachers".

- [ ] **Step 3: Shrink the shared lists**

In `shared/schoolAccess.js`, replace lines 1–12:

```js
// School responsibilities are independent of family relationships and SIMS roles.
export const SCHOOL_ROLES = ['adviser', 'subject_teacher', 'curriculum_adviser'];
export const SCHOOL_ROLE_LABELS = { adviser: 'Class Adviser', subject_teacher: 'Subject Teacher', curriculum_adviser: 'Curriculum Adviser' };
// Teachers may ask for these; Curriculum Adviser stays administrator-assigned.
export const REQUESTABLE_ROLES = ['adviser', 'subject_teacher'];
// Curriculum Adviser and Subject Teacher are held per grade; Class Adviser per section.
export const GRADE_ROLES = ['curriculum_adviser', 'subject_teacher'];
export const isGradeRole = role => GRADE_ROLES.includes(role);
// Within one school year a teacher is a Class Adviser or a Subject Teacher, never both.
const EXCLUSIVE = { adviser: 'subject_teacher', subject_teacher: 'adviser' };
export const conflictingRole = (roles, role) => (EXCLUSIVE[role] && (roles || []).includes(EXCLUSIVE[role]) ? EXCLUSIVE[role] : null);
export const canHold = (roles, role) => !conflictingRole(roles, role);
```

with:

```js
// School responsibilities are independent of family relationships and SIMS roles.
// Subject Teacher was retired on 2026-10-20; leftover rows are ignored everywhere.
export const SCHOOL_ROLES = ['adviser', 'curriculum_adviser'];
export const SCHOOL_ROLE_LABELS = { adviser: 'Class Adviser', curriculum_adviser: 'Curriculum Adviser' };
// Teachers may ask for this; Curriculum Adviser stays administrator-assigned.
export const REQUESTABLE_ROLES = ['adviser'];
// Curriculum Adviser is held per grade; Class Adviser per section.
export const GRADE_ROLES = ['curriculum_adviser'];
export const isGradeRole = role => GRADE_ROLES.includes(role);
```

Change the comment above `canApproveRoleRequest` from:

```js
// Administrators approve any request. A Curriculum Adviser approves adviser and
// subject-teacher requests from verified accounts in a grade they are assigned to.
```

to:

```js
// Administrators approve any request. A Curriculum Adviser approves Class Adviser
// requests from verified accounts in a grade they are assigned to.
```

In `shared/announcementAudience.js`, replace lines 5–6 with:

```js
export const ANNOUNCEMENT_ROLES = ['family', 'adviser', 'curriculum_adviser'];
export const ANNOUNCEMENT_ROLE_LABELS = { family: 'Families', adviser: 'Advisers', curriculum_adviser: 'Curriculum Advisers' };
```

In `src/lib/announcements.js`:
- in `audienceLabel`, change `audience.roles.map(role => ANNOUNCEMENT_ROLE_LABELS[role]).join(', ')` to `audience.roles.filter(role => ANNOUNCEMENT_ROLE_LABELS[role]).map(role => ANNOUNCEMENT_ROLE_LABELS[role]).join(', ')`;
- in `formFromPost`, change `roles: [...(p.audience?.roles || ['family'])],` to `roles: (p.audience?.roles || ['family']).filter(role => ANNOUNCEMENT_ROLES.includes(role)),`.

In `parent/src/lib/announcements.js` line 25, change `audience.roles.map(role => ANNOUNCEMENT_ROLE_LABELS[role]).join(', ')` to `audience.roles.filter(role => ANNOUNCEMENT_ROLE_LABELS[role]).map(role => ANNOUNCEMENT_ROLE_LABELS[role]).join(', ')`.

- [ ] **Step 4: Run the shared and SIMS tests**

Run: `npx vitest run shared src/lib/announcements.test.js` and then `npm test` and `npm --prefix parent test`.

Expected: PASS. If the Parent App fails with "conflictingRole is not exported", Task 2 was not completed. Finish it first.

- [ ] **Step 5: Update the server emulator tests**

In `functions/test/emulator/schoolAccess.test.js`:
- in the first test, replace the comment `// Adviser and Subject Teacher can't be combined, so another grade role triggers the refresh.` with `// A Curriculum Adviser grant triggers the refresh.`;
- rename `'does not overwrite the class adviser for subject or curriculum assignments'` to `'does not overwrite the class adviser for curriculum assignments'`, and delete its line `await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'subject_teacher', sectionId: 'SEC1' });`;
- in `'account deletion releases adviser locks and withdraws pending requests'`, change `seedRequest('teacher', 'subject_teacher', 'SEC8')` to `seedRequest('teacher', 'adviser', 'SEC8')`;
- delete the whole test `'lets a Curriculum Adviser approve an in-grade subject-teacher request from a personal email'`;
- rename `'rejects curriculum approvals outside their grades and subject-teacher elevation'` to `'rejects curriculum approvals outside their grades and curriculum elevation'`;
- in `'bulk approval reports each request and never stops at a failure'`, change `const clean = await requestSchoolRole(deps('other'), { role: 'subject_teacher', gradeLevels: [7] });` to `const clean = await requestSchoolRole(deps('other'), { role: 'adviser', sectionId: 'SEC1' });`;
- in `'counts pending requests for administrators only'`, change `await requestSchoolRole(deps('personal'), { role: 'subject_teacher', sectionId: 'SEC8' });` to `await requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC8' });` (count stays 2);
- in `'gives each audience its own queue, with conflicts named'`, change `const subject = await requestSchoolRole(deps('other'), { role: 'subject_teacher', gradeLevels: [7] });` to `const otherInGrade = await requestSchoolRole(deps('other'), { role: 'adviser', sectionId: 'SEC1' });`, and change `[inGrade.id, subject.id]` to `[inGrade.id, otherInGrade.id]`;
- delete the whole `describe('grade-level subject teachers and the exclusion rule', ...)` block, from line 268 to the end of that block, and put this in its place:

```js
describe('the retired Subject Teacher role', () => {
  const retired = 'Subject Teacher is no longer offered. Choose Class Adviser, or Parent/Guardian to link a learner.';
  it('refuses Subject Teacher requests, with or without grades, and direct assignments', async () => {
    for (const input of [{ role: 'subject_teacher', gradeLevels: [7] }, { role: 'subject_teacher', sectionId: 'SEC1' }]) {
      await expect(requestSchoolRole(deps('teacher'), input)).rejects.toMatchObject({ code: 'invalid-argument', message: retired });
    }
    await expect(assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'subject_teacher', gradeLevel: 7 })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await db().collection('school_role_requests').get()).size).toBe(0);
  });
  it('hides leftover Subject Teacher rows and requests from every context', async () => {
    await db().doc('school_accounts/teacher').set({ email: users.teacher.email, assignments: [{ role: 'subject_teacher', schoolYear: year, gradeLevel: 7 }] });
    await db().doc('school_role_requests/old').set({ uid: 'teacher', email: users.teacher.email, emailVerified: true, role: 'subject_teacher',
      schoolYear: year, gradeLevel: 8, status: 'rejected', reason: 'The Subject Teacher role was retired.', createdAt: new Date() });
    const teacher = await getSchoolContext(deps('teacher'));
    expect(teacher.assignments).toEqual([]);
    expect(teacher.myRequests).toEqual([]);
    const admin = await getSchoolContext(deps('admin'));
    expect(admin.managedAssignments.filter(a => a.uid === 'teacher')).toEqual([]);
  });
  it('lets a former Subject Teacher become a Class Adviser', async () => {
    await db().doc('school_accounts/teacher').set({ email: users.teacher.email, assignments: [{ role: 'subject_teacher', schoolYear: year, gradeLevel: 7 }] });
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1' });
    expect((await loadSchoolActor(deps('teacher'))).assignments).toMatchObject([{ role: 'adviser', sectionId: 'SEC1' }]);
  });
});
```

In `functions/test/emulator/advisorySlips.test.js`, replace the test `'refuses a teacher who is already a Subject Teacher this year'` with:

```js
  it('lets a teacher with a leftover Subject Teacher row redeem a slip', async () => {
    await db().doc('school_accounts/t1').set({ email: 't1@deped.gov.ph', assignments: [{ role: 'subject_teacher', schoolYear: year, gradeLevel: 8 }] });
    const code = await issue();
    await expect(redeemAdvisorySlip(tdeps('t1'), { code })).resolves.toMatchObject({ sectionId: 'SEC1' });
  });
```

In `functions/test/emulator/announcements.test.js`:
- rename `describe('sendAnnouncementPush to grade-level Subject Teachers'` to `describe('sendAnnouncementPush to Curriculum Advisers'`;
- in it, rename `'pushes a Subject Teacher notice to the grade-level teacher only'` to `'pushes a Curriculum Adviser notice to the grade-level adviser only'`;
- in that test, change every `role: 'subject_teacher'` and `roles: ['subject_teacher']` to `'curriculum_adviser'`;
- add, in the same `describe`:

```js
  it('never pushes to a leftover Subject Teacher row', async () => {
    await db().doc('guardians/gT').set({ email: 't@x', notificationsEnabled: true });
    await db().doc('guardians/gT/devices/tT1').set({ token: 'tokT1', enabled: true, failureCount: 0 });
    await db().doc('school_accounts/gT').set({ assignments: [{ role: 'subject_teacher', schoolYear: '2026-2027', gradeLevel: 7 }] });
    await write('st3', post({ audience: { roles: ['adviser', 'curriculum_adviser'], grades: [7] }, audienceKeys: ['g7'] }));
    const m = fakeMessaging();
    await sendAnnouncementPush(deps(m), 'st3');
    expect(m.sent.flatMap((x) => x.tokens)).toEqual([]);
  });
```

- rename `'counts a grade-level Subject Teacher in a role-targeted audience'` to `'counts a Curriculum Adviser in a role-targeted audience, never a leftover Subject Teacher row'`, and change its role strings to `'curriculum_adviser'`. Then append these lines to it:

```js
    await db().doc('school_accounts/gT').set({ assignments: [{ role: 'subject_teacher', schoolYear: '2026-2027', gradeLevel: 7 }] });
    expect(await announcementAudienceCount({ db: db(), profile: admin }, { audience: { roles: ['curriculum_adviser'], grades: [7] } })).toEqual({ count: 0 });
```

In `functions/test/emulator/portalAnnouncements.test.js`:
- rename `'shows a grade-level Subject Teacher the notices for their grade, not other grades'` to `'shows a Curriculum Adviser the notices for their grade, not other grades'`;
- change every `'subject_teacher'` in that test to `'curriculum_adviser'`;
- add:

```js
  it('shows a leftover Subject Teacher row nothing, even on an old Subject Teacher notice', async () => {
    await db().doc('school_accounts/gA').set({ assignments: [{ role: 'subject_teacher', schoolYear: '2026-2027', gradeLevel: 7 }] });
    await db().doc('announcements/old').set(post({ audience: { roles: ['subject_teacher'], grades: [7] } }));
    expect((await getPortalAnnouncements(deps(), { view: 'school' })).rows).toEqual([]);
  });
```

In `tests/rules/schoolPortal.test.js` line 31, change `roles: ['subject_teacher']` to `roles: ['curriculum_adviser']`.

In `tests/browser/school-review-fixture.js` line 88, change `role: 'subject_teacher'` to `role: 'curriculum_adviser'`.

- [ ] **Step 6: Run the changed emulator files and watch the new tests fail**

Run, one file at a time: `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/schoolAccess.test.js"`. Repeat for `advisorySlips`, `announcements` and `portalAnnouncements`.

Expected:
- `schoolAccess` FAILS: "refuses Subject Teacher requests" (the role is still accepted) and "hides leftover ... requests" (`myRequests` is unfiltered).
- `advisorySlips` FAILS: the redeem still calls `assertCanHold`, which no longer exists, so the module may not even import. Either failure is acceptable here.

- [ ] **Step 7: Update the server handlers**

In `functions/src/handlers/schoolAccess.js`:
- change line 5 to `import { SCHOOL_ROLES, REQUESTABLE_ROLES, assignmentKey, canApproveRoleRequest, isGradeRole } from '../../shared/schoolAccess.js';`;
- delete lines 30–39 (the `rolesHeld` comment and function, and `assertCanHold`);
- delete lines 82–83 (the "Older clients name a section for Subject Teacher" comment and its `if`);
- replace `requestSchoolRole` (lines 96–134) with:

```js
// Teachers ask from the Parent App; a request confers nothing until approved.
export async function requestSchoolRole(deps, input) {
  if (input.role === 'subject_teacher') fail('invalid-argument', 'Subject Teacher is no longer offered. Choose Class Adviser, or Parent/Guardian to link a learner.');
  if (!REQUESTABLE_ROLES.includes(input.role)) fail('permission-denied', 'An administrator assigns Curriculum Adviser access.');
  const user = await liveUser(deps.auth, deps.uid);
  await enforceRateLimit(deps.db, deps.uid, 'schoolRoleRequest', { windowMs: 3600000, max: 30 }, (deps.now || (() => new Date()))().getTime());
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    const assignment = await assignmentFrom(deps, tx, actor, input);
    const requests = deps.db.collection('school_role_requests');
    const pending = await tx.get(requests.where('uid', '==', deps.uid).where('status', '==', 'pending'));
    if (actor.assignments.some(h => assignmentKey(h) === assignmentKey(assignment))) fail('already-exists', 'This assignment is already active.');
    const ref = requests.doc(requestKey(deps.uid, assignment));
    if ((await tx.get(ref)).data()?.status !== 'pending') {
      if (pending.size >= 20) fail('resource-exhausted', 'Wait for your pending requests to be reviewed.');
      tx.set(ref, { ...assignment, uid: deps.uid, email: user.email.toLowerCase(), emailVerified: true,
        displayName: user.displayName || actor.displayName, status: 'pending', createdAt: FieldValue.serverTimestamp() });
      tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'school.requested', deps.uid, { ...assignment, ...teacherOf(user) }));
    }
    return { status: 'pending', id: ref.id, ids: [ref.id] };
  });
}
```

- delete the line `assertCanHold(rolesHeld(prepared.assignments, [], actor.schoolYear), assignment.role);` in `resolveSchoolRole`;
- delete `assertCanHold(rolesHeld(assignments, [], actor.schoolYear), 'adviser');` in `replaceAdviser`;
- delete `assertCanHold(rolesHeld(prepared.assignments, [], current.schoolYear), assignment.role);` in `assignSchoolRole`;
- in `getSchoolContext`, change `myRequests: mine.docs.map(row).filter(r => r.schoolYear === actor.schoolYear)` to `myRequests: mine.docs.map(row).filter(r => r.schoolYear === actor.schoolYear && SCHOOL_ROLES.includes(r.role))`;
- in the same function, change `(s.data().assignments || []).filter(a => a.schoolYear === actor.schoolYear)` (the `managedAssignments` line) to `(s.data().assignments || []).filter(a => a.schoolYear === actor.schoolYear && SCHOOL_ROLES.includes(a.role))`.

Then run `git grep -n "isDepedEmail\|SCHOOL_ROLE_LABELS\|rolesHeld\|assertCanHold\|conflictingRole\|canHold" -- functions/src shared parent/src src`.

Expected: only `isDepedEmail` matches, in `advisorySlips.js`, `shared/schoolAccess.js` and `parent/src/lib/join.js`.

In `functions/src/handlers/advisorySlips.js`:
- change line 9 to `import { loadSchoolActor, liveUser, prepareGrant, writeGrant, inboxRef, auditRow, teacherOf } from './schoolAccess.js';`;
- in `redeemAdvisorySlip`, replace:

```js
    const [mine, forSection] = await Promise.all([
      tx.get(requests.where('uid', '==', deps.uid).where('status', '==', 'pending')),
      tx.get(requests.where('sectionId', '==', slip.sectionId).where('status', '==', 'pending')),
    ]);
    assertCanHold(rolesHeld(actor.assignments, mine.docs, actor.schoolYear), 'adviser');
```

  with:

```js
    const forSection = await tx.get(requests.where('sectionId', '==', slip.sectionId).where('status', '==', 'pending'));
```

In `functions/src/handlers/portalAnnouncements.js`, replace lines 44–45:

```js
      // Grade roles (Curriculum Adviser, grade-level Subject Teacher) carry no section; a section-bound legacy row still needs its section check.
      if (assignment.role === 'curriculum_adviser' || (isGradeRole(assignment.role) && !assignment.sectionId)) return Number.isInteger(assignment.gradeLevel) && assignment.gradeLevel >= 7 && assignment.gradeLevel <= 12;
```

with:

```js
      // Curriculum Adviser is held per grade and carries no section.
      if (isGradeRole(assignment.role)) return Number.isInteger(assignment.gradeLevel) && assignment.gradeLevel >= 7 && assignment.gradeLevel <= 12;
```

- [ ] **Step 8: Run all the tests**

Run:
- `npm --prefix functions test`;
- each of the four emulator files from Step 6;
- `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/retireSubjectTeachers.test.js test/emulator/sessionAttendance.test.js"`;
- `npm test`, `npm --prefix parent test`, `npm run test:rules`.

Expected: PASS everywhere. `sessionAttendance` still shows that the leftover `subject` account gets no roster.

Then run the full functions emulator suite once, in the background (about 15 minutes): `npm run test:functions`.

Expected: all pass. A one-off 5-second timeout in `sectionEditing` has passed on re-run before; re-run that file once if it appears.

- [ ] **Step 9: Commit**

```bash
git add shared functions/src functions/test tests src/lib/announcements.js src/lib/announcements.test.js parent/src/lib/announcements.js parent/src/lib/announcements.test.js
git commit -F <message file>   # "Retire Subject Teacher from the shared roles and server"
```

---

### Task 5: Documentation

**Files:**
- Modify: `docs/parent-portal-adviser-guide.md`
- Modify: `docs/school-family-access-rollout.md` (including line 65, the `migrateSubjectTeachersFn` step)
- Modify: `docs/superpowers/specs/2026-10-19-role-based-registration-design.md` (top note)

- [ ] **Step 1: Find every mention**

Run: `git grep -n -i "subject teacher\|subject_teacher\|family member\|migrateSubjectTeachers" -- docs/parent-portal-adviser-guide.md docs/school-family-access-rollout.md`

- [ ] **Step 2: Edit**

- **Both guides:** remove every Subject Teacher paragraph, bullet and table row. Where the text lists Parent App roles, it reads "Parent/Guardian" and "Class Adviser". Where it says "Family Member", it says "Parent/Guardian".
- **`docs/school-family-access-rollout.md`:** replace the `migrateSubjectTeachersFn` step (line 65) with: "Call `retireSubjectTeachersFn` once as an administrator: first with `{}` to count, then with `{ apply: true }`. It removes Subject Teacher rows, rejects pending Subject Teacher requests, and leaves each current holder an inbox note. A second run returns zeros."
- **`docs/superpowers/specs/2026-10-19-role-based-registration-design.md`:** directly under the title, add:

```markdown
> **Update 2026-10-20:** Subject Teacher was retired and "Family Member" became "Parent/Guardian". See `2026-10-20-retire-subject-teacher-design.md`.
```

- [ ] **Step 3: Check**

Run the Step 1 grep again.

Expected: no matches, apart from historical sentences in the rollout doc that describe the retirement itself ("Subject Teacher was retired…").

- [ ] **Step 4: Commit**

```bash
git add docs/parent-portal-adviser-guide.md docs/school-family-access-rollout.md docs/superpowers/specs/2026-10-19-role-based-registration-design.md
git commit -F <message file>   # "Document the Subject Teacher retirement"
```

---

### Task 6: Browser check against local emulators

This task changes no app code. It verifies the whole flow in the browser pane, using the harness from the emulator-browser-check notes:
- demo project `demo-bnhs`;
- alternate ports 8180/9199/5101;
- the global firebase-tools CLI;
- a Vite wrapper config that injects the App Check placeholder token;
- `functions/.env.local` with `PORTAL_URL=http://localhost:5174`.

Keep all harness files in the session scratchpad. Delete `firebase.emu-check.json` and `functions/.env.local` afterwards. Stop only the background tasks you started.

- [ ] **Step 1: Seed**

Seed with:
- an admin;
- a DepEd teacher holding `subject_teacher` for grade 7 (written straight to `school_accounts`);
- a personal-email parent;
- sections SEC7A and SEC8A;
- a learner slip for SEC7A.

- [ ] **Step 2: Parent App chooser**

Sign in as a new DepEd account.
- **Expect:** the chooser shows exactly "Parent/Guardian" and "Class Adviser", ticking both works, and "Continue · 2 steps" appears.
- **Then:** open `/join?role=subject_teacher`. **Expect:** nothing is ticked.
- **Then:** finish the Parent/Guardian step with the learner slip. **Expect:** the Settings mode row shows "Parent/Guardian", and Add a role shows the hint "Parent/Guardian or Class Adviser".

- [ ] **Step 3: SIMS**

Sign in as admin.
- **School Access:**
  - the Assign "Responsibility" options are Class Adviser and Curriculum Adviser only;
  - Coverage has no "Subject Teachers" line;
  - the coverage CSV header has 6 columns.
- **Announcements:** the new-announcement form offers Families, Advisers and Curriculum Advisers.

- [ ] **Step 4: Cleanup callable**

From the admin session, call `retireSubjectTeachersFn` with `{}` in the browser console, through the app's `callable` helper.
- **Expect:** `{ dryRun: true, accounts: 1, rows: 1, requests: 0 }`.

Call it with `{ apply: true }`. Then sign in to the Parent App as the seeded teacher.
- **Expect:** the inbox shows "Subject Teacher access has ended", and with no other role the app opens `/join`.

Back in SIMS → School Access → History.
- **Expect:** the line "admin@… ended …'s Subject Teacher access (role retired) · Grades 7".

- [ ] **Step 5: Record**

Note the results, including any copy problems, in the PR description. Fix any defect in the task that owns the file, re-run that task's tests, and commit.

---

## Release (after the PR is merged; each production write needs the user's go-ahead in the releasing session)

Follow the 2026-10-19 registration release for the mechanics (`docs/audits/deployments/2026-10-19-registration/README.md`).

1. **Baseline.**
   - Run a read-only production count of `subject_teacher` rows and requests.
   - Byte-check live SIMS against the newest release tree (`docs/releases/2026-10-20-ui-modules/prepare.mjs`).
   - Byte-check the live Parent App against its last record.
2. **Functions, by name, from the backend preparer** (`docs/releases/2026-10-18-school-family/prepareBackend.mjs`, wrapped as in the registration release). The set:
   - `getSchoolContextFn`, `requestSchoolRoleFn`, `withdrawSchoolRequestFn`, `resolveSchoolRoleFn`, `resolveSchoolRolesFn`, `replaceAdviserFn`, `assignSchoolRoleFn`, `revokeSchoolRoleFn`, `markSchoolOpenedFn`, `getSchoolPendingCountFn`;
   - `issueAdvisorySlipsFn`, `revokeAdvisorySlipFn`, `listAdvisoryStatusFn`, `previewAdvisorySlipFn`, `redeemAdvisorySlipFn`;
   - `getPortalAnnouncementsFn`, `getPortalAnnouncementFn`, `savePortalAnnouncementFn`;
   - `announcementAudienceCountFn`, `onAnnouncementWritten`, `publishAnnouncementsJob`;
   - `retireSubjectTeachersFn`.
   Before deploying, confirm with `git grep -l "shared/schoolAccess.js\|shared/announcementAudience.js" functions/src` that no other handler's behaviour changed.
3. **Delete `migrateSubjectTeachersFn`** by name: `firebase functions:delete migrateSubjectTeachersFn --region asia-southeast1`.
4. **Cleanup in production.**
   - Run `retireSubjectTeachersFn` with `{}`. Expect 5 accounts and 9 rows, or the newer count from step 1.
   - Run it with `{ apply: true }`.
   - Run it with `{}` again and expect zeros.
   Save each JSON result in the deployment record.
5. **SIMS.**
   - Create a new overlay `docs/releases/2026-10-2x-retire-subject-teacher/prepare.mjs` that wraps the ui-modules preparer.
   - Carry the files changed under `src/`, `shared/` and `parent/src/lib/school.js`. Hand-port any file whose copy in the tree differs from master, and list the differences in the README.
   - Test the tree, build, byte-verify the deploy (`hosting:sims`), and deploy.
6. **Parent App.** Build from master with the main checkout's `parent/.env`, deploy `hosting:parent`, and byte-verify.
7. **Record.** Open a deployment record PR with the counts, logs, verifications and rollback notes.
