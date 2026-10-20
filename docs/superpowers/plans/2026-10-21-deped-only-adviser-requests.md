# Class Adviser Requests Need a DepEd Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A non-DepEd account can no longer ask to become a Class Adviser: the Parent App hides the card and the server refuses the request.

**Architecture:**
- `requestSchoolRole` refuses a non-DepEd account, using the verified email on the Auth record and the existing `isDepedEmail` from `shared/schoolAccess.js`.
- `roleOptions` in the Parent App leaves the Class Adviser card out for a non-DepEd account that does not already hold the role. The "Needs approval" tag and note are deleted because every remaining Class Adviser card belongs to a DepEd account.
- The Administrator route (Assign role, approving a waiting request) and every other handler are unchanged.

**Tech Stack:** React 19 + Vite 8 (Parent App in `parent/`), Firebase Cloud Functions v2 on Node 22 (`functions/`), Firestore, Vitest 4, Firebase emulators.

**Spec:** `docs/superpowers/specs/2026-10-21-deped-only-adviser-requests-design.md`

## Global Constraints

- **Exact copy:**
  - Request refusal (`permission-denied`): "Class Adviser requests need a @deped.gov.ph account."
  - Slip refusal (`permission-denied`, `previewAdvisorySlip` and `redeemAdvisorySlip`): "Advisory slips need a DepEd email."
- **Who counts as DepEd:** `isDepedEmail` from `shared/schoolAccess.js`. Do not write a new check.
- **Hide rule:** a non-DepEd account that does not hold Class Adviser gets no `adviser` option. A non-DepEd account that holds it keeps the locked "Active" card. Parent/Guardian is never affected.
- **No hint:** nothing replaces the hidden card.
- **Unchanged:** SIMS (no SIMS deploy), `canApproveRoleRequest`, `assignSchoolRole`, `resolveSchoolRole(s)`, `AdviserStep.jsx`, the SIMS "Non-DepEd email" flag, waiting requests, existing advisers.
- **Shared code in functions:** `functions/shared/` is a generated copy, refreshed by `node scripts/syncShared.mjs`, which runs in the `pretest` scripts. Never edit `functions/shared/` by hand. This plan changes nothing under `shared/`.
- **Worktrees:** these checkouts need `node_modules` junctions to the main checkout (root, `functions/`, `parent/`). Check with `Test-Path node_modules\vitest, functions\node_modules\vitest, parent\node_modules\vitest` before running tests.
- **One emulator test file** (run the files one at a time; they share one emulator):
  `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/<file>.test.js"`
  If another session holds ports 8080/9099, copy the alternate-port config described in the emulator-browser-check notes. Never kill `node` by name. Set `NODE_OPTIONS=--dns-result-order=ipv4first` and `FUNCTIONS_DISCOVERY_TIMEOUT=120`.
- **Commits:** end each message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. In PowerShell, write the message to a file and use `git commit -F <file>`; from Bash, `printf` the message into a file first.

## Spec adjustments made while planning

- The spec's release section listed `requestSchoolRoleFn` only. The shortened slip message also changes `previewAdvisorySlipFn` and `redeemAdvisorySlipFn`, so the spec now lists all three. This plan's release set is those three functions.

---

### Task 1: Server refuses non-DepEd Class Adviser requests

**Files:**
- Modify: `functions/src/handlers/schoolAccess.js` (import line 5, new constant near line 9, `requestSchoolRole` at line 85)
- Modify: `functions/src/handlers/advisorySlips.js:100`
- Test: `functions/test/emulator/schoolAccess.test.js`
- Test: `functions/test/emulator/advisorySlips.test.js`

**Interfaces:**
- Consumes: `isDepedEmail(email)` from `functions/shared/schoolAccess.js` (already used by `advisorySlips.js`).
- Produces: `requestSchoolRole(deps, input)` rejects with `CallableError('permission-denied', 'Class Adviser requests need a @deped.gov.ph account.')` for a non-DepEd account, before the rate limit and the transaction. Later tasks only rely on this message.

Several existing tests make a waiting request by calling `requestSchoolRole` as the Gmail fixtures `personal` and `other`. After this task those calls are refused, so those tests seed the request row directly. `schoolAccess.test.js` already has `seedRequest(uid, role, sectionId)` for this; `advisorySlips.test.js` gets the same helper.

- [ ] **Step 1: Seed waiting requests directly in `schoolAccess.test.js`**

In `functions/test/emulator/schoolAccess.test.js`, make these five edits. Each replaces a call that goes through `requestSchoolRole` as a Gmail account (or, in the first, a request that must reach the ended-year check).

1. In `removes old-year access and refuses ended-year changes`, change the last line:

```js
    await expect(requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC1' })).rejects.toMatchObject({ code: 'failed-precondition' });
```
to:
```js
    await expect(requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC1' })).rejects.toMatchObject({ code: 'failed-precondition' });
```

2. In `replaces the current adviser in one audited step, administrators only`:

```js
    const { id } = await requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC1' });
```
to:
```js
    const { id } = await seedRequest('personal', 'adviser', 'SEC1');
```

3. In `bulk approval reports each request and never stops at a failure`:

```js
    const clean = await requestSchoolRole(deps('other'), { role: 'adviser', sectionId: 'SEC1' });
    const taken = await requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC8' });
```
to:
```js
    const clean = await seedRequest('other', 'adviser', 'SEC1');
    const taken = await seedRequest('personal', 'adviser', 'SEC8');
```

4. In `counts pending requests for administrators only`:

```js
    await requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC8' });
```
to:
```js
    await seedRequest('personal', 'adviser', 'SEC8');
```

5. In `gives each audience its own queue, with conflicts named`:

```js
    const otherInGrade = await requestSchoolRole(deps('other'), { role: 'adviser', sectionId: 'SEC1' });
```
to:
```js
    const otherInGrade = await seedRequest('other', 'adviser', 'SEC1');
```

- [ ] **Step 2: Seed the waiting request directly in `advisorySlips.test.js`**

In `functions/test/emulator/advisorySlips.test.js`, add this helper right after the `issue` helper (the line `const issue = async (sectionId = 'SEC1') => ...`):

```js
// A request left over from before non-DepEd accounts were refused.
const seedRequest = async (uid, sectionId) => {
  const id = `${uid}_adviser_${sectionId}`;
  await db().doc(`school_role_requests/${id}`).set({ uid, email: teachers[uid].email, emailVerified: true, displayName: uid,
    role: 'adviser', schoolYear: year, sectionId, gradeLevel: 7, status: 'pending', createdAt: new Date() });
  return { id };
};
```

In `closes pending adviser requests for the section`, change:

```js
    const theirs = await requestSchoolRole(tdeps('personal'), { role: 'adviser', sectionId: 'SEC1' });
```
to:
```js
    const theirs = await seedRequest('personal', 'SEC1');
```

- [ ] **Step 3: Run both files; they still pass**

This step changes how the tests set up data, not what the code does, so both files must pass before the code changes.

Run each separately:
```
npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/schoolAccess.test.js"
npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/advisorySlips.test.js"
```
Expected: both PASS.

- [ ] **Step 4: Write the failing tests**

In `functions/test/emulator/schoolAccess.test.js`, inside `describe('teacher requests', ...)`, add these two tests right after `never takes Curriculum Adviser requests`:

```js
  it('refuses a non-DepEd account and writes nothing', async () => {
    await expect(requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC1' }))
      .rejects.toMatchObject({ code: 'permission-denied', message: 'Class Adviser requests need a @deped.gov.ph account.' });
    expect((await db().collection('school_role_requests').get()).size).toBe(0);
    expect((await db().collection('audit_log').get()).size).toBe(0);
    expect((await db().doc('rate_limits/personal').get()).exists).toBe(false);
  });
  it('still lets an Administrator assign a non-DepEd account and approve its waiting request', async () => {
    await assignSchoolRole(deps('admin'), { email: users.personal.email, role: 'adviser', sectionId: 'SEC1' });
    const waiting = await seedRequest('other', 'adviser', 'SEC8');
    await resolveSchoolRole(deps('admin'), { requestId: waiting.id, approve: true });
    expect((await loadSchoolActor(deps('personal'))).assignments).toMatchObject([{ role: 'adviser', sectionId: 'SEC1' }]);
    expect((await loadSchoolActor(deps('other'))).assignments).toMatchObject([{ role: 'adviser', sectionId: 'SEC8' }]);
  });
```

In `functions/test/emulator/advisorySlips.test.js`, replace:

```js
  it('refuses personal emails with a message they can act on', async () => {
    const code = await issue();
    for (const fn of [previewAdvisorySlip, redeemAdvisorySlip]) {
      await expect(fn(tdeps('personal'), { code })).rejects.toMatchObject({ code: 'permission-denied', message: 'Advisory slips need a DepEd email. Request the role instead.' });
    }
  });
```
with:
```js
  it('refuses personal emails', async () => {
    const code = await issue();
    for (const fn of [previewAdvisorySlip, redeemAdvisorySlip]) {
      await expect(fn(tdeps('personal'), { code })).rejects.toMatchObject({ code: 'permission-denied', message: 'Advisory slips need a DepEd email.' });
    }
  });
```

- [ ] **Step 5: Run both files to verify the new tests fail**

Run the two commands from Step 3.
Expected:
- `schoolAccess.test.js`: `refuses a non-DepEd account and writes nothing` FAILS (the request is accepted, so the promise resolves instead of rejecting). The Administrator test passes already.
- `advisorySlips.test.js`: `refuses personal emails` FAILS on the message text.

- [ ] **Step 6: Implement the refusal and the shorter slip message**

In `functions/src/handlers/schoolAccess.js`, change the import on line 5:

```js
import { SCHOOL_ROLES, REQUESTABLE_ROLES, assignmentKey, canApproveRoleRequest, isGradeRole } from '../../shared/schoolAccess.js';
```
to:
```js
import { SCHOOL_ROLES, REQUESTABLE_ROLES, assignmentKey, canApproveRoleRequest, isGradeRole, isDepedEmail } from '../../shared/schoolAccess.js';
```

Add this constant right after the `fail` helper (line 9, `const fail = ...`):

```js
const DEPED_ONLY = 'Class Adviser requests need a @deped.gov.ph account.';
```

In `requestSchoolRole`, add the check right after `liveUser` and before the rate limit:

```js
  const user = await liveUser(deps.auth, deps.uid);
  if (!isDepedEmail(user.email)) fail('permission-denied', DEPED_ONLY);
  await enforceRateLimit(deps.db, deps.uid, 'schoolRoleRequest', { windowMs: 3600000, max: 30 }, (deps.now || (() => new Date()))().getTime());
```

In `functions/src/handlers/advisorySlips.js:100`, change:

```js
const DEPED = 'Advisory slips need a DepEd email. Request the role instead.';
```
to:
```js
const DEPED = 'Advisory slips need a DepEd email.';
```

- [ ] **Step 7: Run both files and the unit tests**

Run the two commands from Step 3. Expected: both PASS.

Then, from `functions/`: `npm test`. Expected: PASS (no unit test touches these handlers; this confirms the `shared/` sync still works).

- [ ] **Step 8: Commit**

```bash
git add functions/src/handlers/schoolAccess.js functions/src/handlers/advisorySlips.js functions/test/emulator/schoolAccess.test.js functions/test/emulator/advisorySlips.test.js
git commit -F <message file>
```
Message: `Refuse Class Adviser requests from non-DepEd accounts`, with a body saying requests now need a verified @deped.gov.ph account, Administrator assignment is unchanged, and the slip refusal no longer tells people to request instead.

---

### Task 2: Parent App hides Class Adviser for non-DepEd accounts

**Files:**
- Modify: `parent/src/lib/join.js:12-21`
- Modify: `parent/src/screens/join/RoleChooser.jsx:28,38,51`
- Modify: `parent/src/strings.js:261-262`
- Test: `parent/src/lib/join.test.js`
- Test: `parent/src/screens/join/screens.test.js`
- Test: `parent/src/lib/strings.test.js:52`

**Interfaces:**
- Consumes: `isDepedEmail` (already imported in `join.js`).
- Produces: `roleOptions({ held, selected, email })` returns `{ key, state, active }` objects, with no `needsApproval` field. For a non-DepEd email with no held adviser role the array has one entry, `family`. `joinSteps`, `toggleRole`, `initialSelection` keep their signatures. `S.joinNeedsApproval` and `S.joinNeedsApprovalNote` no longer exist.

- [ ] **Step 1: Write the failing tests in `join.test.js`**

In `parent/src/lib/join.test.js`, make these changes.

Replace the Parent/Guardian test:

```js
  it('keeps Parent/Guardian addable for parents who already linked a learner', () => {
    const options = roleOptions({ held: ['family'], selected: ['family'], email: 'p@gmail.com' });
    expect(state(options, 'family')).toMatchObject({ state: 'selected', active: true, needsApproval: false });
  });
```
with:
```js
  it('keeps Parent/Guardian addable for parents who already linked a learner', () => {
    const options = roleOptions({ held: ['family'], selected: ['family'], email: 'p@gmail.com' });
    expect(state(options, 'family')).toMatchObject({ state: 'selected', active: true });
  });
```

Replace the held-card test:

```js
  it('locks a held Class Adviser card and tags approval for personal emails only', () => {
    expect(state(roleOptions({ held: ['adviser'], selected: [], email: 'a@deped.gov.ph' }), 'adviser')).toMatchObject({ state: 'held', active: true });
    expect(state(roleOptions({ held: [], selected: [], email: 'p@gmail.com' }), 'adviser').needsApproval).toBe(true);
    expect(state(roleOptions({ held: [], selected: [], email: 'p@deped.gov.ph' }), 'adviser').needsApproval).toBe(false);
  });
```
with:
```js
  it('offers Class Adviser to DepEd accounts only, and keeps a held card locked', () => {
    expect(state(roleOptions({ held: [], selected: [], email: 'p@deped.gov.ph' }), 'adviser')).toMatchObject({ state: 'available', active: false });
    expect(roleOptions({ held: [], selected: [], email: 'p@gmail.com' }).map((o) => o.key)).toEqual(['family']);
    expect(roleOptions({ held: [], selected: [], email: '' }).map((o) => o.key)).toEqual(['family']);
    expect(state(roleOptions({ held: ['adviser'], selected: [], email: 'a@deped.gov.ph' }), 'adviser')).toMatchObject({ state: 'held', active: true });
    expect(state(roleOptions({ held: ['adviser'], selected: [], email: 'p@gmail.com' }), 'adviser')).toMatchObject({ state: 'held', active: true });
  });
  it('ignores a slip-link preselection for an account that cannot be an adviser', () => {
    const selected = initialSelection({ a: 'ABCD2345' });
    expect(joinSteps(roleOptions({ held: [], selected, email: 'p@gmail.com' }))).toEqual([]);
    expect(joinSteps(roleOptions({ held: [], selected, email: 'a@deped.gov.ph' }))).toEqual(['adviser']);
  });
```

In `toggles only roles that can change, and steps follow role order`, use a DepEd email so the Class Adviser card exists. Replace the whole test with:
```js
  it('toggles only roles that can change, and steps follow role order', () => {
    const email = 'a@deped.gov.ph';
    const options = roleOptions({ held: [], selected: ['adviser'], email });
    expect(toggleRole(['adviser'], 'family', options)).toEqual(['adviser', 'family']);
    expect(toggleRole(['adviser'], 'adviser', options)).toEqual([]);
    expect(toggleRole(['adviser'], 'subject_teacher', options)).toEqual(['adviser']);
    expect(joinSteps(roleOptions({ held: [], selected: ['adviser', 'family'], email }))).toEqual(['family', 'adviser']);
    const held = roleOptions({ held: ['adviser'], selected: ['adviser'], email });
    expect(toggleRole(['adviser'], 'adviser', held)).toEqual(['adviser']);
    expect(joinSteps(held)).toEqual([]);
  });
```

- [ ] **Step 2: Write the failing tests in `screens.test.js`**

In `parent/src/screens/join/screens.test.js`, replace the first chooser test:

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
with:
```js
  it('shows the two role titles for a DepEd email', async () => {
    const options = roleOptions({ email: 'ana@deped.gov.ph' });
    const html = await render({ options });
    for (const title of [S.joinFamily, S.joinAdviser]) expect(html).toContain(title);
    expect(html).toContain('Parent/Guardian');
    expect(html).not.toContain('Subject Teacher');
    expect(html).not.toContain('Needs approval');
  });
```

Replace the personal-email test:

```js
  it('tags school roles as needing approval for a personal email', async () => {
    const options = roleOptions({ email: 'ana@gmail.com', selected: ['adviser'] });
    const html = await render({ options, selected: ['adviser'] });
    expect(html).toContain(S.joinNeedsApproval);
    // The note itself contains an apostrophe, which renderToStaticMarkup escapes.
    expect(html).toContain('approves school roles');
  });
```
with:
```js
  it('shows only Parent/Guardian for a personal email, even if a slip link preselected Class Adviser', async () => {
    const options = roleOptions({ email: 'ana@gmail.com', selected: ['adviser'] });
    const html = await render({ options, selected: ['adviser'] });
    expect(html).toContain(S.joinFamily);
    expect(html).not.toContain(S.joinAdviser);
    expect(html).not.toContain('Needs approval');
    expect(html.match(/role="checkbox"/g)).toHaveLength(1);
  });

  it('keeps a held Class Adviser card visible for a personal email', async () => {
    const options = roleOptions({ email: 'ana@gmail.com', held: ['adviser'] });
    const html = await render({ options });
    expect(html).toContain(S.joinAdviser);
    expect(html).toContain(S.joinActive);
  });
```

In `parent/src/lib/strings.test.js`, line 52, delete the two keys `'joinNeedsApproval', 'joinNeedsApprovalNote', ` from the `has the join strings` list so the line reads:

```js
      'joinActive', 'joinContinue', 'joinStep', 'joinSteps',
```

- [ ] **Step 3: Run the tests to verify they fail**

From `parent/`: `npx vitest run src/lib/join.test.js src/screens/join/screens.test.js`
Expected: FAIL. The new `join.test.js` tests fail because the adviser option still exists for Gmail, and the `screens.test.js` Gmail tests fail because the Class Adviser title is still rendered.

- [ ] **Step 4: Implement the hide rule in `join.js`**

In `parent/src/lib/join.js`, replace `roleOptions`:

```js
export function roleOptions({ held = [], selected = [], email = '' }) {
  const deped = isDepedEmail(email);
  return JOIN_ROLES.map((key) => {
    // A parent may always link another learner, so Parent/Guardian is never locked.
    if (key === 'family') return { key, state: selected.includes(key) ? 'selected' : 'available', active: held.includes(key), needsApproval: false };
    if (held.includes(key)) return { key, state: 'held', active: true, needsApproval: false };
    return { key, state: selected.includes(key) ? 'selected' : 'available', active: false, needsApproval: !deped };
  });
}
```
with:
```js
export function roleOptions({ held = [], selected = [], email = '' }) {
  const deped = isDepedEmail(email);
  return JOIN_ROLES.flatMap((key) => {
    // A parent may always link another learner, so Parent/Guardian is never locked.
    if (key === 'family') return [{ key, state: selected.includes(key) ? 'selected' : 'available', active: held.includes(key) }];
    if (held.includes(key)) return [{ key, state: 'held', active: true }];
    // Only DepEd accounts can become a Class Adviser by themselves (spec 2026-10-21).
    if (!deped) return [];
    return [{ key, state: selected.includes(key) ? 'selected' : 'available', active: false }];
  });
}
```

- [ ] **Step 5: Remove the approval tag and note from `RoleChooser.jsx`**

In `parent/src/screens/join/RoleChooser.jsx`:

1. Delete this line (line 28) from `RoleCard`:
```jsx
          {!option.active && option.needsApproval && <span style={tag}>{S.joinNeedsApproval}</span>}
```
2. Delete this line (line 38) from `RoleChooser`:
```jsx
  const anyApproval = options.some((o) => o.state === 'selected' && o.needsApproval);
```
3. Delete this line (line 51):
```jsx
      {anyApproval && <p style={{ fontSize: 13, color: T.inkMuted }}>{S.joinNeedsApprovalNote}</p>}
```
`tag` is still used by the "Active" tag, and `T` by other styles, so no import changes.

In `parent/src/strings.js`, delete lines 261-262:
```js
  joinNeedsApproval: 'Needs approval',
  joinNeedsApprovalNote: "Your account isn't a DepEd email, so an Administrator or Curriculum Adviser approves school roles.",
```

- [ ] **Step 6: Run the Parent App suite**

From `parent/`: `npx vitest run`
Expected: PASS. Then `git grep -n "needsApproval\|joinNeedsApproval" -- parent/src` returns nothing.

- [ ] **Step 7: Commit**

```bash
git add parent/src/lib/join.js parent/src/lib/join.test.js parent/src/screens/join/RoleChooser.jsx parent/src/screens/join/screens.test.js parent/src/strings.js parent/src/lib/strings.test.js
git commit -F <message file>
```
Message: `Hide Class Adviser from non-DepEd accounts in the Parent App`, with a body saying a non-DepEd account that does not hold the role sees only Parent/Guardian, a held card stays visible, and the Needs approval tag and note are removed.

---

### Task 3: Adviser guide and full verification

**Files:**
- Modify: `docs/parent-portal-adviser-guide.md:33-36`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: nothing code-facing.

- [ ] **Step 1: Update the adviser guide**

In `docs/parent-portal-adviser-guide.md`, replace step 5:

```
5. **No DepEd email, or no slip yet?** Request your section instead, with your
   grade and section. An Administrator or your grade's Curriculum Adviser
   approves it, and the request shows as *Waiting for approval* until then.
6. Already using the app? Open **Settings → Add a role**.
```
with:
```
5. **No slip yet?** Request your section instead, with your grade and
   section. An Administrator or your grade's Curriculum Adviser approves it,
   and the request shows as *Waiting for approval* until then.
6. Already using the app? Open **Settings → Add a role**.

**No DepEd email?** The Class Adviser option appears only for
**@deped.gov.ph** accounts. An Administrator can still make any account a
class adviser under **School access** in SIMS.
```

- [ ] **Step 2: Run every affected suite**

- From `parent/`: `npx vitest run`. Expected: PASS.
- From `parent/`: `npm run build`, then `npm run size`. Expected: build succeeds and the size check passes (the change only removes code).
- From `functions/`: `npm test`. Expected: PASS.
- Emulator, one file at a time, with the command from Global Constraints: `schoolAccess`, `advisorySlips`, `retireSubjectTeachers`, `portalAnnouncements`. Expected: PASS each.

- [ ] **Step 3: Commit**

```bash
git add docs/parent-portal-adviser-guide.md
git commit -F <message file>
```
Message: `Update the adviser guide for DepEd-only Class Adviser requests`.

---

### Task 4: Browser check against local emulators

This task changes no app code. It verifies the chooser and the server refusal in the browser pane, using the harness from the emulator-browser-check notes:
- demo project `demo-bnhs`;
- alternate ports 8180/9199/5101;
- the global firebase-tools CLI;
- a Vite wrapper config that injects the App Check placeholder token;
- `functions/.env.local` with `PORTAL_URL=http://localhost:5174`.

Keep all harness files in the session scratchpad. Delete `firebase.emu-check.json` and `functions/.env.local` afterwards. Stop only the background tasks you started.

- [ ] **Step 1: Seed**

Seed with:
- an admin;
- a verified DepEd account (`teacher@deped.gov.ph`);
- a verified personal account (`parent@gmail.com`);
- a verified personal account that already holds Class Adviser (a row written straight to `school_accounts`);
- sections SEC7A and SEC8A.

- [ ] **Step 2: Parent App chooser**

Sign in as the DepEd account.
- **Expect:** the chooser shows "Parent/Guardian" and "Class Adviser", with no "Needs approval" tag and no note under the cards.

Sign in as the personal account.
- **Expect:** only "Parent/Guardian" shows, and Continue stays disabled until it is ticked.
- **Then:** open `/join?a=ABCD2345` and `/join?role=adviser`. **Expect:** still only Parent/Guardian, nothing ticked.

Sign in as the personal account that holds Class Adviser.
- **Expect:** "Class Adviser" shows as "Active" and cannot be unticked, next to Parent/Guardian.

- [ ] **Step 3: Server refusal**

As the personal account, in the browser console, call `requestSchoolRoleFn` with `{ role: 'adviser', sectionId: 'SEC7A' }` through the app's `callable` helper.
- **Expect:** it fails with "Class Adviser requests need a @deped.gov.ph account." and `school_role_requests` stays empty in the emulator UI.

As the DepEd account, call it with the same input.
- **Expect:** it succeeds and the request shows under Settings → School access as waiting.

- [ ] **Step 4: Administrator route**

In SIMS as admin, open School access and assign Class Adviser for SEC8A to the first personal account's email.
- **Expect:** the assignment succeeds and the account sees the school inbox note.

- [ ] **Step 5: Record**

Note the results, including any copy problems, in the PR description. Fix any defect in the task that owns the file, re-run that task's tests, and commit.

---

## Release (after the PR is merged; each production write needs the user's go-ahead in the releasing session)

Follow the Subject Teacher release for the mechanics (`docs/audits/deployments/2026-10-20-retire-subject-teacher/README.md`). This release has no SIMS deploy and no data cleanup.

1. **Baseline.**
   - Byte-check the live Parent App against its last record (`docs/audits/deployments/2026-10-20-retire-subject-teacher/parent-hosting-verification.json`). Expect 50/50 before anything is deployed.
   - Read-only count in production of `school_role_requests` with `status == 'pending'` whose `email` is not `@deped.gov.ph`, and of `school_accounts` adviser rows held by non-DepEd emails. Save the counts (numbers only, no emails) in the record. They are expected to stay as they are.
2. **Functions, by name, from the backend preparer.** Run `node docs/releases/2026-10-18-school-family/prepareBackend.mjs .superpowers/releases/deped-adviser/backend`. Run the backend's unit tests (`npm test`) and the emulator tests for `schoolAccess` and `advisorySlips`, one file at a time. Deploy only:
   - `requestSchoolRoleFn`, `previewAdvisorySlipFn`, `redeemAdvisorySlipFn`.
   Use a `firebase.deped-adviser-release.json` copied from `firebase.retire-subject-teacher-release.json`: functions source `.superpowers/releases/deped-adviser/backend/functions`, predeploy that backend's `syncShared.mjs`, and only the `parent` hosting target pointing at the new Parent App build. Run with `NODE_OPTIONS=--dns-result-order=ipv4first`. Afterwards list the live functions: all must be ACTIVE and the count unchanged.
3. **Parent App.** Build from master with the main checkout's `parent/.env` loaded into the build process only, from a `git archive` export with `index.html` and `manifest.webmanifest` normalized to LF. Deploy `hosting:parent` and byte-verify the live site against the build.
4. **Smoke test.**
   - Unauthenticated call to `requestSchoolRoleFn` answers 401.
   - The live site serves the new main script.
   - With a personal test account, the chooser shows only Parent/Guardian. With a DepEd account it shows both. Do not submit a request from either.
5. **Record.** Open a deployment record PR under `docs/audits/deployments/2026-10-2x-deped-adviser-requests/` with the counts, logs, verifications and rollback notes. Rollback: the Hosting console for the Parent App, and the backend preparer for the three functions.
