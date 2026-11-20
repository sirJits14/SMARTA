# ID Cards — Recently Approved Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an add request creates a brand-new learner, log that learner so an Administrator can print their first QR ID card from a new **Recently approved** tab in ID Cards. The admin can print some or all of them at once, or move them into the saved batch.

**Architecture:** `resolveLearnerRequest` writes `id_card_approved/{studentId}` in the same transaction that creates the learner (mode `'new'` only). The ID Cards page subscribes to that admin-only collection and renders it with the saved batch's existing split (`buildBatchView`). Every route that marks a card printed also deletes the learner's `id_card_approved` doc in the same `writeBatch`. "Add to saved batch" and "Dismiss" delete it as well. A one-time backfill logs new learners approved before this release.

**Tech Stack:** React 18 + Vite (SIMS), Firebase Web SDK v10 (`firebase/firestore`), Cloud Functions (Node, `firebase-admin`), Firestore rules, Vitest (unit, rules emulator, functions emulator).

## Decisions (from the planning Q&A, 2026-10-30)

| Question | Decision |
|---|---|
| Where it appears | A third ID Cards tab, **Recently approved**, after By section and Saved batch. It has checkboxes, **Print selected**, **Add to saved batch** and **Dismiss**. |
| Which approvals are logged | **New learner only**: the approval created a new `students` doc (`mode === 'new'`). Moves and re-enrollments are not logged. |
| When a learner leaves the log | Once their card is marked printed (by any route), once they are added to the saved batch, or when an admin dismisses them. |
| Whose approvals count | Any approver the server accepts: Administrator, Curriculum Adviser, or SIMS grade coordinator. |
| Earlier approvals | A one-time backfill from the `learner.addApproved` audit rows. |
| Count | Shown on the tab label only ("Recently approved · 3"). No sidebar badge. |

## Global Constraints

- Administrator-only: `firestore.rules` grants `id_card_approved` read and delete only to `isAdmin()`. Clients can never create or update it. The ID Cards page is already admin-only (`src/lib/access.js`, `allowedPages`).
- Only the server writes new `id_card_approved` docs (Admin SDK, in `resolveLearnerRequest` and the backfill).
- Doc shape, exactly: `id_card_approved/{studentId}: { approvedAt: Timestamp, approvedByName: string, requestId: string, schoolYear: 'YYYY-YYYY' }`. The card's name, LRN and section are read live, as the saved batch does.
- A Firestore `writeBatch` holds at most 500 operations. Use the existing `writeInChunks` in `src/data/idCards.js`.
- **Deploy order matters:** `firestore:rules` must be live **before** the new SIMS bundle. The new `markIdCardsPrinted` deletes `id_card_approved/{id}`. Without the rule, that delete is denied and the whole batch fails, so marking printed would break.
- SIMS hosting ships through its documented release tree (`docs/releases/…`, `docs/audits/deployments/…`), not a root build. The Parent App is untouched; do not deploy `hosting:parent`.
- Do not deploy from this plan. The release README (Task 7) lists the commands for the user to run.
- UI copy uses the existing tone. Names render through `fullName`/`personText` (capitals).
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Prerequisites (worktree)

- In a worktree, `node_modules` for the root, `functions/` and `parent/` must be junctioned or installed first. Emulator tests need the Firebase CLI on `PATH`.
- Unit tests: `npx vitest run <file>` from the repo root.
- Rules tests: `firebase emulators:exec --only firestore "npx vitest run -c vitest.rules.config.js tests/rules/<file>"`.
- Functions emulator tests: `firebase emulators:exec --only firestore,auth "cd functions && npx vitest run test/emulator/<file> --no-file-parallelism"`.

## File Structure

| File | Responsibility |
|---|---|
| `functions/src/lib/approvedCards.js` | **New.** Collection name and doc-shape builder shared by the handler and the backfill. |
| `functions/src/handlers/learnerRequests.js` | Writes the log doc when an approval creates a new learner. |
| `functions/test/emulator/learnerRequests.test.js` | Tests that a new learner is logged and other outcomes are not. |
| `firestore.rules` | `id_card_approved`: admin read and delete. |
| `tests/rules/idCardApproved.test.js` | **New.** Rules tests. |
| `src/data/idCards.js` | Print-mark functions also delete the log doc. New `addApprovedToBatch`, `dismissApproved`. |
| `src/data/idCards.test.js` | Updated op shapes and chunk sizes, and tests for the new functions. |
| `src/lib/idCardQueue.js` | `buildApprovedView`, `approvedTabLabel`, `approvalText`. |
| `src/lib/idCardQueue.test.js` | Tests for those helpers. |
| `src/pages/idCards/RecentlyApprovedTab.jsx` | **New.** The tab UI. |
| `src/pages/idCards/RecentlyApprovedTab.test.js` | **New.** Static render tests. |
| `src/pages/IDCardsPage.jsx` | Subscribes to `id_card_approved`, adds the third tab. |
| `functions/src/lib/approvedCardBackfill.js` | **New.** One-time backfill logic. |
| `functions/scripts/backfillApprovedCards.mjs` | **New.** CLI wrapper, dry-run by default. |
| `functions/test/emulator/approvedCardBackfill.test.js` | **New.** Backfill tests. |
| `docs/releases/2026-10-30-id-card-recently-approved/README.md` | **New.** Release order and checks. |

---

### Task 1: Log new learners when their add request is approved

**Files:**
- Create: `functions/src/lib/approvedCards.js`
- Modify: `functions/src/handlers/learnerRequests.js` (imports at the top; the `if (matches.empty) { … }` branch inside `resolveLearnerRequest`, around lines 369–376)
- Test: `functions/test/emulator/learnerRequests.test.js` (inside `describe('approving an add', …)`)

**Interfaces:**
- Produces: `APPROVED_CARDS = 'id_card_approved'` and `approvedCardEntry({ requestId, schoolYear, approvedByName, approvedAt? }) → { approvedAt, approvedByName, requestId, schoolYear }` (`approvedAt` defaults to `FieldValue.serverTimestamp()`). Task 6 uses both.

- [ ] **Step 1: Write the failing tests**

Add both tests at the end of `describe('approving an add', () => { … })` in `functions/test/emulator/learnerRequests.test.js`:

```js
  it('logs a new learner for ID card printing, with who approved it', async () => {
    const { id } = await file();
    await resolveLearnerRequest(deps('ca7'), { requestId: id, approve: true });
    const [created] = (await db().collection('students').where('lrn', '==', '200000000001').get()).docs;
    expect(await get(`id_card_approved/${created.id}`)).toEqual({
      approvedAt: expect.any(Timestamp), approvedByName: 'Cleo Curriculum', requestId: id, schoolYear: year,
    });
  });
  it('logs nothing for a move, a re-enrollment, a rejection or a removal', async () => {
    const moved = await file('teacher', { student: form({ lrn: '100000000002' }) });
    await resolveLearnerRequest(deps('coord7'), { requestId: moved.id, approve: true });
    const enrolled = await file('teacher', { student: form({ lrn: '100000000003' }) });
    await resolveLearnerRequest(deps('admin'), { requestId: enrolled.id, approve: true });
    const rejected = await file('teacher', { student: form({ lrn: '200000000009' }) });
    await resolveLearnerRequest(deps('admin'), { requestId: rejected.id, approve: false, reason: 'Wrong section' });
    const removed = await requestLearnerRemoval(deps('teacher'), removal());
    await resolveLearnerRequest(deps('admin'), { requestId: removed.id, approve: true });
    expect((await db().collection('id_card_approved').get()).size).toBe(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `firebase emulators:exec --only firestore,auth "cd functions && npx vitest run test/emulator/learnerRequests.test.js --no-file-parallelism -t \"ID card printing|logs nothing\""`
Expected: the first test FAILS (`get(...)` returns `undefined`); the second passes.

- [ ] **Step 3: Create the shared helper**

`functions/src/lib/approvedCards.js`:

```js
import { FieldValue } from 'firebase-admin/firestore';

// New learners waiting for their first card in SIMS ID Cards > Recently approved (plan 2026-10-30).
// One document per learner, keyed by student id. Only the server creates them; administrators read
// and delete them. The card's name, LRN and section are read live when the tab renders.
export const APPROVED_CARDS = 'id_card_approved';

export const approvedCardEntry = ({ requestId, schoolYear, approvedByName, approvedAt = FieldValue.serverTimestamp() }) =>
  ({ approvedAt, approvedByName: approvedByName || '', requestId, schoolYear });
```

- [ ] **Step 4: Write the log doc in the approval transaction**

In `functions/src/handlers/learnerRequests.js`, add the import after the `learnerRequestCleanup.js` import:

```js
import { APPROVED_CARDS, approvedCardEntry } from '../lib/approvedCards.js';
```

In `resolveLearnerRequest`, inside `if (matches.empty) { … }`, add one line right after the `tx.set(db.doc(\`enrollments/${studentRef.id}_${request.schoolYear}\`), …)` call. The branch becomes:

```js
        if (matches.empty) {
          const studentRef = db.collection('students').doc();
          studentId = studentRef.id;
          tx.set(studentRef, { ...Object.fromEntries(STUDENT_FIELDS.map((field) => [field, request.student[field] ?? ''])),
            status: 'active', documents: { ...NEW_LEARNER_DOCUMENTS }, createdAt: today, ...scopeFor(section.gradeLevel, request.schoolYear) });
          tx.set(db.doc(`enrollments/${studentRef.id}_${request.schoolYear}`), { studentId: studentRef.id, schoolYear: request.schoolYear, ...target,
            type: request.enrollType, dateEnrolled: today, status: 'enrolled' });
          // A brand-new learner has never had a card: log them for Recently approved in ID Cards.
          tx.set(db.doc(`${APPROVED_CARDS}/${studentRef.id}`), approvedCardEntry({ requestId: ref.id, schoolYear: request.schoolYear,
            approvedByName: actor.displayName }));
        } else {
```

- [ ] **Step 5: Run the whole learner-request emulator suite**

Run: `firebase emulators:exec --only firestore,auth "cd functions && npx vitest run test/emulator/learnerRequests.test.js --no-file-parallelism"`
Expected: PASS. All existing tests are unchanged, because the extra doc goes to a collection they never read.

- [ ] **Step 6: Commit**

```bash
git add functions/src/lib/approvedCards.js functions/src/handlers/learnerRequests.js functions/test/emulator/learnerRequests.test.js
git commit -m "feat(functions): log new learners approved for ID card printing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Firestore rule for `id_card_approved`

**Files:**
- Modify: `firestore.rules:167` (next to `id_card_batch`)
- Create: `tests/rules/idCardApproved.test.js`

**Interfaces:**
- Produces: admins may `get`/`list`/`delete` `id_card_approved/{studentId}`. Nobody may create or update it from a client. Tasks 3 and 5 depend on this.

- [ ] **Step 1: Write the failing rules test**

`tests/rules/idCardApproved.test.js`:

```js
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { setup, seed, seedBaseline, as, anon, ok, denied, STAFF, JHS, KIOSK, GUARDIAN_A, ANON } from './helpers.js';

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await seedBaseline(env);
  await seed(env, async (db) => {
    await db.doc('users/jhs@bnhs.edu').set({ name: 'JHS', role: 'jhs_coord', gradeLevel: null, disabled: false });
    await db.doc('id_card_approved/S1').set({ approvedAt: new Date(), approvedByName: 'Ada Admin', requestId: 'R1', schoolYear: '2026-2027' });
  });
});

const entry = { approvedAt: new Date(), approvedByName: 'Someone', requestId: 'R2', schoolYear: '2026-2027' };

describe('id_card_approved', () => {
  it('admins read and dismiss logged learners', async () => {
    const db = as(env, STAFF);
    await ok(db.collection('id_card_approved').get());
    await ok(db.doc('id_card_approved/S1').get());
    await ok(db.doc('id_card_approved/S1').delete());
  });

  it('admins may delete a learner who is not logged (a print that marks anyone)', async () => {
    await ok(as(env, STAFF).doc('id_card_approved/NOT-LOGGED').delete());
  });

  it('even admins cannot create or change a logged learner', async () => {
    const db = as(env, STAFF);
    await denied(db.doc('id_card_approved/S2').set(entry));
    await denied(db.doc('id_card_approved/S1').update({ approvedByName: 'Someone else' }));
  });

  for (const [label, who] of [['coordinator', JHS], ['kiosk', KIOSK], ['guardian', GUARDIAN_A], ['anonymous sign-in', ANON]]) {
    it(`${label} can neither read nor write`, async () => {
      const db = as(env, who);
      await denied(db.doc('id_card_approved/S1').get());
      await denied(db.collection('id_card_approved').get());
      await denied(db.doc('id_card_approved/S2').set(entry));
      await denied(db.doc('id_card_approved/S1').delete());
    });
  }

  it('signed-out users can neither read nor write', async () => {
    await denied(anon(env).doc('id_card_approved/S1').get());
    await denied(anon(env).doc('id_card_approved/S1').delete());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `firebase emulators:exec --only firestore "npx vitest run -c vitest.rules.config.js tests/rules/idCardApproved.test.js"`
Expected: FAIL. The admin read and delete tests are denied, because no rule matches yet.

- [ ] **Step 3: Add the rule**

In `firestore.rules`, directly under the `id_card_batch` line:

```
    match /id_card_batch/{studentId} { allow read, write: if isAdmin(); }
    // Recently approved new learners (plan 2026-10-30): only the server creates them; admins read and dismiss.
    match /id_card_approved/{studentId} { allow read, delete: if isAdmin(); }
```

- [ ] **Step 4: Run all rules tests**

Run: `npm run test:rules`
Expected: PASS, including `idCardApproved.test.js` and the untouched `idCardBatch.test.js`.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules/idCardApproved.test.js
git commit -m "feat(rules): admins read and dismiss recently approved ID cards" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Data layer — clear the log on print, batch or dismiss

**Files:**
- Modify: `src/data/idCards.js`
- Test: `src/data/idCards.test.js`

**Interfaces:**
- Consumes: the Task 2 rule (admin delete on `id_card_approved`).
- Produces:
  - `markIdCardsPrinted(students, me)`: now 2 ops per learner (the printed mark, plus deleting `id_card_approved/{id}`).
  - `markBatchPrinted(students, me)`: now 3 ops per learner (adds the same delete).
  - `addApprovedToBatch(studentIds: string[], me) → Promise<void>`: sets `id_card_batch/{id}` and deletes `id_card_approved/{id}`, 2 ops each.
  - `dismissApproved(studentIds: string[]) → Promise<void>`: deletes `id_card_approved/{id}`, 1 op each.

- [ ] **Step 1: Update and add the failing tests**

In `src/data/idCards.test.js`:

Change the import line to:

```js
import { markIdCardsPrinted, addToIdCardBatch, removeFromIdCardBatch, clearIdCardBatch, markBatchPrinted, addApprovedToBatch, dismissApproved } from './idCards.js';
```

Replace the first two tests in `describe('markIdCardsPrinted', …)` with:

```js
  it('merges the printed mark into each learner and takes them off Recently approved', async () => {
    await markIdCardsPrinted([{ id: 's1', lrn: '111' }, { id: 's2', lrn: '222' }], me);
    expect(firestore.batches[0].ops).toEqual([
      ['set', { path: 'students/s1' }, mark('111'), { merge: true }],
      ['delete', { path: 'id_card_approved/s1' }],
      ['set', { path: 'students/s2' }, mark('222'), { merge: true }],
      ['delete', { path: 'id_card_approved/s2' }],
    ]);
    expect(firestore.batches[0].commit).toHaveBeenCalledTimes(1);
  });
  it('splits 501 learners into batches of 250, 250 and 1 learners (2 operations each)', async () => {
    await markIdCardsPrinted(learners(501), me);
    expect(sizes()).toEqual([500, 500, 2]);
    firestore.batches.forEach((b) => expect(b.commit).toHaveBeenCalledTimes(1));
  });
```

Replace both tests in `describe('markBatchPrinted', …)` with:

```js
  it('marks each learner and removes them from the batch and Recently approved in the same write', async () => {
    await markBatchPrinted([{ id: 's1', lrn: '111' }, { id: 's2', lrn: '222' }], me);
    expect(firestore.batches).toHaveLength(1);
    expect(firestore.batches[0].ops).toEqual([
      ['set', { path: 'students/s1' }, mark('111'), { merge: true }],
      ['delete', { path: 'id_card_batch/s1' }],
      ['delete', { path: 'id_card_approved/s1' }],
      ['set', { path: 'students/s2' }, mark('222'), { merge: true }],
      ['delete', { path: 'id_card_batch/s2' }],
      ['delete', { path: 'id_card_approved/s2' }],
    ]);
  });
  it('splits 300 learners into 166 and 134 learners (3 operations each)', async () => {
    await markBatchPrinted(learners(300), me);
    expect(sizes()).toEqual([498, 402]);
  });
```

Append a new block:

```js
describe('Recently approved', () => {
  it('moves learners to the saved batch and off Recently approved in one write', async () => {
    await addApprovedToBatch(['s1', 's2'], me);
    expect(firestore.batches).toHaveLength(1);
    expect(firestore.batches[0].ops).toEqual([
      ['set', { path: 'id_card_batch/s1' }, { addedAt: 'SERVER_TIME', addedBy: 'admin@bnhs.edu.ph' }],
      ['delete', { path: 'id_card_approved/s1' }],
      ['set', { path: 'id_card_batch/s2' }, { addedAt: 'SERVER_TIME', addedBy: 'admin@bnhs.edu.ph' }],
      ['delete', { path: 'id_card_approved/s2' }],
    ]);
  });
  it('moves 251 learners in batches of 500 and 2 operations', async () => {
    await addApprovedToBatch(Array.from({ length: 251 }, (_, i) => `s${i}`), me);
    expect(sizes()).toEqual([500, 2]);
  });
  it('dismisses learners in batches of at most 500 deletes', async () => {
    await dismissApproved(Array.from({ length: 501 }, (_, i) => `s${i}`));
    expect(sizes()).toEqual([500, 1]);
    expect(firestore.batches[1].ops).toEqual([['delete', { path: 'id_card_approved/s500' }]]);
  });
  it('writes nothing for an empty selection', async () => {
    await addApprovedToBatch([], me);
    await dismissApproved([]);
    expect(firestore.batches).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/data/idCards.test.js`
Expected: FAIL. The op arrays lack the `id_card_approved` deletes, and `addApprovedToBatch`/`dismissApproved` are not exported.

- [ ] **Step 3: Implement**

In `src/data/idCards.js`, under `const BATCH = 'id_card_batch';` add:

```js
const APPROVED = 'id_card_approved';
```

Replace `markIdCardsPrinted` and `markBatchPrinted`, and append the two new functions:

```js
// Records that each learner's card was printed for their current LRN;
// isIdCardPrinted in src/lib/idCardQueue.js reads it back. A printed learner
// also leaves Recently approved; deleting a document that isn't there does nothing.
export const markIdCardsPrinted = (students, me) =>
  writeInChunks(students, 2, (batch, student) => {
    batch.set(doc(db, 'students', student.id), printedMark(student, me), { merge: true });
    batch.delete(doc(db, APPROVED, student.id));
  });
```

```js
// Marking and leaving the batch share one write, so a learner is never
// marked printed while still waiting in the batch, or the other way round.
export const markBatchPrinted = (students, me) =>
  writeInChunks(students, 3, (batch, student) => {
    batch.set(doc(db, 'students', student.id), printedMark(student, me), { merge: true });
    batch.delete(doc(db, BATCH, student.id));
    batch.delete(doc(db, APPROVED, student.id));
  });

// Recently approved holds new learners whose add request was approved. Moving
// them to the saved batch and leaving Recently approved share one write.
export const addApprovedToBatch = (studentIds, me) =>
  writeInChunks(studentIds, 2, (batch, id) => {
    batch.set(doc(db, BATCH, id), { addedAt: serverTimestamp(), addedBy: me.email });
    batch.delete(doc(db, APPROVED, id));
  });

export const dismissApproved = (studentIds) =>
  writeInChunks(studentIds, 1, (batch, id) => batch.delete(doc(db, APPROVED, id)));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/data/idCards.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/idCards.js src/data/idCards.test.js
git commit -m "feat(sims): clear Recently approved when a card is printed, batched or dismissed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: View helpers for Recently approved

**Files:**
- Modify: `src/lib/idCardQueue.js`
- Test: `src/lib/idCardQueue.test.js`

**Interfaces:**
- Consumes: the existing `buildBatchView({ batchDocs, enrolled, students }) → { printable: [{student, section}], notPrintable: [{id, student|null}] }`, plus `whenText(ms)` and `personText(name)` from `src/lib/learnerRequests.js`.
- Produces:
  - `buildApprovedView({ approvedDocs, enrolled, students }) → { printable: [{ student, section, approval }], notPrintable: [{ id, student|null, approval }] }`. `printable` is in print order.
  - `approvedTabLabel(n: number) → string`
  - `approvalText(approval) → string`, for example `"Approved by CLEO CURRICULUM · Oct 29, 2026, 9:00 AM"`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/idCardQueue.test.js`, extend the import:

```js
import {
  isIdCardPrinted, sectionShortLabel, sortIdCardBatch, groupBySection, cardsLabel,
  enrolledEntries, buildBatchView, sheetFillLabel, buildApprovedView, approvedTabLabel, approvalText,
} from './idCardQueue.js';
import { personText, whenText } from './learnerRequests.js';
```

Append:

```js
describe('buildApprovedView', () => {
  const ana = learner('ana', 'Abad', 'F');
  const ben = learner('ben', 'Bautista', 'M');
  const gone = learner('gone', 'Cruz', 'M');
  const students = [ana, ben, gone];
  const enrolled = enrolledEntries({ students, enrollments: [enroll(ana, rizal), enroll(ben, rizal)], sections: [rizal], schoolYear: SY });
  const approval = (id) => ({ id, approvedByName: 'Cleo Curriculum', requestId: `R-${id}`, schoolYear: SY, approvedAt: null });

  it('pairs each enrolled learner with their section and approval, in print order', () => {
    const { printable } = buildApprovedView({ approvedDocs: [approval('ana'), approval('ben')], enrolled, students });
    expect(ids(printable)).toEqual(['ben', 'ana']);
    expect(printable[0].section).toBe(rizal);
    expect(printable[0].approval.requestId).toBe('R-ben');
  });
  it('lists a learner who is no longer enrolled, or whose record is gone, as not printable', () => {
    const { printable, notPrintable } = buildApprovedView({ approvedDocs: [approval('gone'), approval('missing')], enrolled, students });
    expect(printable).toEqual([]);
    expect(notPrintable.map((e) => [e.id, e.student?.id ?? null, e.approval.requestId]))
      .toEqual([['gone', 'gone', 'R-gone'], ['missing', null, 'R-missing']]);
  });
});

describe('approvedTabLabel', () => {
  it('shows the count only when someone is waiting', () => {
    expect(approvedTabLabel(0)).toBe('Recently approved');
    expect(approvedTabLabel(3)).toBe('Recently approved · 3');
  });
});

describe('approvalText', () => {
  it('names the approver and when', () => {
    const ms = Date.UTC(2026, 9, 29, 1);
    expect(approvalText({ approvedByName: 'Cleo Curriculum', approvedAt: { toMillis: () => ms } }))
      .toBe(`Approved by ${personText('Cleo Curriculum')} · ${whenText(ms)}`);
  });
  it('leaves out a time the server has not filled in yet, and an unnamed approver reads "staff"', () => {
    expect(approvalText({ approvedByName: '', approvedAt: null })).toBe('Approved by staff');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/idCardQueue.test.js`
Expected: FAIL with `buildApprovedView is not a function` (and likewise for the other two).

- [ ] **Step 3: Implement**

At the top of `src/lib/idCardQueue.js`, add:

```js
import { personText, whenText } from './learnerRequests.js';
```

Append to `src/lib/idCardQueue.js`:

```js
// Recently approved (plan 2026-10-30) splits like the saved batch, and keeps
// each learner's approval for the "Approved by" line.
export function buildApprovedView({ approvedDocs, enrolled, students }) {
  const approvalById = new Map(approvedDocs.map((d) => [d.id, d]));
  const { printable, notPrintable } = buildBatchView({ batchDocs: approvedDocs, enrolled, students });
  return {
    printable: printable.map((e) => ({ ...e, approval: approvalById.get(e.student.id) })),
    notPrintable: notPrintable.map((e) => ({ ...e, approval: approvalById.get(e.id) })),
  };
}

export const approvedTabLabel = (n) => (n > 0 ? `Recently approved · ${n}` : 'Recently approved');

// approvedAt is a Firestore Timestamp, or null for a moment after the server writes it.
export const approvalText = (approval) =>
  [`Approved by ${personText(approval?.approvedByName) || 'staff'}`, whenText(approval?.approvedAt?.toMillis?.() ?? null)]
    .filter(Boolean).join(' · ');
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/idCardQueue.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/idCardQueue.js src/lib/idCardQueue.test.js
git commit -m "feat(sims): view helpers for Recently approved ID cards" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Recently approved tab

**Files:**
- Create: `src/pages/idCards/RecentlyApprovedTab.jsx`
- Create: `src/pages/idCards/RecentlyApprovedTab.test.js`
- Modify: `src/pages/IDCardsPage.jsx`

**Interfaces:**
- Consumes: `addApprovedToBatch`, `dismissApproved` and the default `markIdCardsPrinted` (Task 3); `buildApprovedView`, `approvedTabLabel`, `approvalText` (Task 4); and the existing `enrolledEntries`, `groupBySection`, `isIdCardPrinted`, `sheetFillLabel`, `useIdCardPrintConfirm`, `usePrintReadiness`, `IdCardsPrintSheets`.
- Produces: `<RecentlyApprovedTab me students enrollments sections schoolYear approvedDocs />`, and a third ID Cards tab with key `'approved'`.

**Behaviour:**
- Printable learners are grouped by section, each with a checkbox, name, LRN, the "Approved by … · when" line, and a **Printed** tag if `isIdCardPrinted`.
- **Select all (N)** toggles every printable learner. Selected ids that leave the list drop out of the selection, because `chosen` is derived from the live `printable` list.
- A sticky action bar shows `"{n} selected · {sheetFillLabel(n)}"`, or "Select learners to print or add to the saved batch", with three buttons:
  - **Dismiss** asks first, then deletes the logs for the selection.
  - **Add to saved batch** runs `addApprovedToBatch` on the selection.
  - **Print selected** prints the selection, then asks the existing "Mark as printed?" question. Yes runs the default `markIdCardsPrinted`, which also clears their logs.
- **Not enrolled — won't print · N** lists the rest, each with a **Dismiss** button that does not ask first, like the batch's Remove.
- Empty state: title "No new learners waiting", hint "New learners appear here when their add request is approved in Learner requests."

- [ ] **Step 1: Write the failing render tests**

`src/pages/idCards/RecentlyApprovedTab.test.js`:

```js
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../firebase.js', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), writeBatch: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(), serverTimestamp: vi.fn(),
}));

import RecentlyApprovedTab from './RecentlyApprovedTab.jsx';

const h = React.createElement;
const SY = '2026-2027';
const me = { email: 'admin@bnhs.edu.ph', role: 'admin' };
const rizal = { id: 'rizal', gradeLevel: 7, name: 'Rizal', schoolYear: SY };
const ana = { id: 'ana', lastName: 'Abad', firstName: 'Ana', sex: 'F', lrn: '200000000001' };
const dan = { id: 'dan', lastName: 'Dy', firstName: 'Dan', sex: 'M', lrn: '200000000002' };
const approval = (id) => ({ id, approvedByName: 'Cleo Curriculum', requestId: `R-${id}`, schoolYear: SY, approvedAt: null });
const render = (approvedDocs) => renderToStaticMarkup(h(RecentlyApprovedTab, {
  me, schoolYear: SY, sections: [rizal], students: [ana, dan],
  enrollments: [{ id: `ana_${SY}`, studentId: 'ana', sectionId: 'rizal', schoolYear: SY, status: 'enrolled' }],
  approvedDocs,
}));

describe('RecentlyApprovedTab', () => {
  it('says nothing is waiting when the log is empty', () => {
    const html = render([]);
    expect(html).toContain('No new learners waiting');
    expect(html).not.toContain('Print selected');
  });
  it('lists an approved learner by section with who approved them, ready to select', () => {
    const html = render([approval('ana')]);
    expect(html).toContain('Grade 7 - Rizal · 1');
    expect(html).toContain('ABAD, ANA');
    expect(html).toContain('Approved by CLEO CURRICULUM');
    expect(html).toContain('aria-label="Select ABAD, ANA"');
    expect(html).toContain('Select all (1)');
    for (const label of ['Print selected', 'Add to saved batch', 'Dismiss']) expect(html).toContain(label);
    expect(html).toContain('Select learners to print or add to the saved batch');
  });
  it('lists a learner who is no longer enrolled apart, to dismiss', () => {
    const html = render([approval('dan')]);
    expect(html).toContain('Not enrolled — won&#x27;t print · 1');
    expect(html).toContain('aria-label="Dismiss DY, DAN"');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/pages/idCards/RecentlyApprovedTab.test.js`
Expected: FAIL with "Failed to resolve import './RecentlyApprovedTab.jsx'".

- [ ] **Step 3: Implement the tab**

`src/pages/idCards/RecentlyApprovedTab.jsx`:

```jsx
import { useMemo, useRef, useState } from 'react';
import { usePrintReadiness } from '../../hooks/usePrintReadiness.js';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ActionFeedback, Badge, Btn, Card, EmptyState, Confirm } from '../../components/ui.jsx';
import IdCardsPrintSheets from '../../components/IdCardsPrintable.jsx';
import { useIdCardPrintConfirm } from '../../components/IdCardPrintConfirm.jsx';
import { addApprovedToBatch, dismissApproved } from '../../data/idCards.js';
import { enrolledEntries, buildApprovedView, groupBySection, isIdCardPrinted, sheetFillLabel, approvalText } from '../../lib/idCardQueue.js';
import { fullName } from '../../lib/roster.js';
import { T } from '../../styles.js';

const sectionLabel = (s) => `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const row = { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, flexWrap: 'wrap' };

// New learners whose add request was approved, waiting for their first card (plan 2026-10-30).
// Pick some or all, then print them now or move them to the saved batch.
export default function RecentlyApprovedTab({ me, students, enrollments, sections, schoolYear, approvedDocs }) {
  const enrolled = useMemo(() => enrolledEntries({ students, enrollments, sections, schoolYear }),
    [students, enrollments, sections, schoolYear]);
  const { printable, notPrintable } = useMemo(() => buildApprovedView({ approvedDocs, enrolled, students }),
    [approvedDocs, enrolled, students]);
  const groups = useMemo(() => groupBySection(printable), [printable]);

  const [selected, setSelected] = useState(() => new Set());
  // Derived from the live list, so a learner printed or dismissed elsewhere drops out of the selection.
  const chosen = useMemo(() => printable.filter((e) => selected.has(e.student.id)), [printable, selected]);
  const chosenIds = chosen.map((e) => e.student.id);
  const allChosen = printable.length > 0 && chosen.length === printable.length;
  const clearSelection = () => setSelected(new Set());
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(printable.map((e) => e.student.id)));

  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const action = useAsyncAction();
  const { printAndConfirm, confirmDialog } = useIdCardPrintConfirm(me, { onMarked: clearSelection });
  const printRoot = useRef(null);
  const printKey = chosen.map((e) => e.student.id + e.student.lrn + e.section.id).join(',');
  const printReady = usePrintReadiness(printRoot, printKey, chosen.length);

  const toBatch = () => action.run('batch', async () => { await addApprovedToBatch(chosenIds, me); clearSelection(); });
  const dismissOne = (id) => action.run('dismiss', () => dismissApproved([id]));

  if (approvedDocs.length === 0) {
    return (
      <Card style={{ padding: 20 }}>
        <EmptyState title="No new learners waiting" hint="New learners appear here when their add request is approved in Learner requests." />
      </Card>
    );
  }

  return (
    <>
      <div className="id-cards-controls" style={{ fontFamily: T.body, color: T.ink }}>
        <ActionFeedback action={action} />
        {printable.length > 0 && (
          <Card style={{ position: 'sticky', top: 0, zIndex: 1, padding: '12px 20px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <label className="sims-check">
              <input type="checkbox" checked={allChosen} onChange={toggleAll} /> Select all ({printable.length})
            </label>
            <span style={{ fontWeight: 600 }}>
              {chosen.length > 0 ? `${chosen.length} selected · ${sheetFillLabel(chosen.length)}` : 'Select learners to print or add to the saved batch'}
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn variant="ghost" disabled={action.busy || chosen.length === 0} onClick={() => setConfirmDismiss(true)}>Dismiss</Btn>
              <Btn variant="ghost" disabled={action.busy || chosen.length === 0} onClick={toBatch}>Add to saved batch</Btn>
              <Btn disabled={action.busy || chosen.length === 0 || !printReady} onClick={() => printAndConfirm(chosen.map((e) => e.student))}>
                {chosen.length === 0 || printReady ? 'Print selected' : 'Preparing QR codes…'}
              </Btn>
            </div>
          </Card>
        )}

        {groups.map(({ section, entries }) => (
          <Card key={section.id} style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{sectionLabel(section)} · {entries.length}</div>
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {entries.map(({ student, approval }) => (
                <li key={student.id} style={row}>
                  <input type="checkbox" checked={selected.has(student.id)} onChange={() => toggle(student.id)} aria-label={`Select ${fullName(student)}`} />
                  <span style={{ flex: 1 }}>{fullName(student)}{' '}
                    <span style={{ ...T.num, color: T.inkMuted, fontSize: 12 }}>{student.lrn}</span>
                    <span style={{ display: 'block', color: T.inkMuted, fontSize: 12 }}>{approvalText(approval)}</span></span>
                  {isIdCardPrinted(student) && <Badge tone="accent">Printed</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        ))}

        {notPrintable.length > 0 && (
          <Card style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Not enrolled — won't print · {notPrintable.length}</div>
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {notPrintable.map(({ id, student, approval }) => {
                const name = student ? fullName(student) : 'Learner record not found';
                return (
                  <li key={id} style={row}>
                    <span style={{ flex: 1, color: T.inkMuted }}>{name}{' '}
                      <span style={{ ...T.num, fontSize: 12 }}>{student?.lrn || id}</span>
                      <span style={{ display: 'block', fontSize: 12 }}>{approvalText(approval)}</span></span>
                    <Btn variant="ghost" disabled={action.busy} onClick={() => dismissOne(id)} aria-label={`Dismiss ${name}`}>Dismiss</Btn>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      {chosen.length > 0 && <div ref={printRoot}><IdCardsPrintSheets entries={chosen} printOnly /></div>}
      {confirmDialog}
      {confirmDismiss && (
        <Confirm
          title="Dismiss these learners?"
          label="Dismiss"
          message={`Remove ${plural(chosenIds.length, 'learner', 'learners')} from Recently approved? Their cards are not printed and they are not added to the saved batch.`}
          onYes={async () => { await dismissApproved(chosenIds); clearSelection(); setConfirmDismiss(false); }}
          onNo={() => setConfirmDismiss(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Run the render tests**

Run: `npx vitest run src/pages/idCards/RecentlyApprovedTab.test.js`
Expected: PASS. If the apostrophe escape differs in your React version, change that assertion to match what `renderToStaticMarkup` emits (`&#x27;`). Do not change the copy.

- [ ] **Step 5: Wire the tab into the page**

In `src/pages/IDCardsPage.jsx`:

Add imports:

```js
import RecentlyApprovedTab from './idCards/RecentlyApprovedTab.jsx';
import { approvedTabLabel } from '../lib/idCardQueue.js';
```

Replace the `TABS` line:

```js
// 'queue' is kept as the key so a remembered tab still opens the batch.
const TABS = [['section', 'By section'], ['queue', 'Saved batch'], ['approved', 'Recently approved']];
```

After `const batchResource = useCollectionResource('id_card_batch');` add:

```js
  const approvedResource = useCollectionResource('id_card_approved');
```

In the tab button map, render the counted label for the approved tab. Replace `}}>{label}</button>;` with:

```jsx
            }}>{k === 'approved' ? approvedTabLabel(approvedResource.data.length) : label}</button>;
```

Replace the panel body line with:

```jsx
        {tab === 'section' ? <BySectionTab {...data} />
          : tab === 'queue' ? <ResourceState resources={[batchResource]}><SavedBatchTab {...data} batchDocs={batchResource.data} /></ResourceState>
          : <ResourceState resources={[approvedResource]}><RecentlyApprovedTab {...data} approvedDocs={approvedResource.data} /></ResourceState>}
```

- [ ] **Step 6: Run the full SIMS unit suite and lint**

Run: `npm test`
Expected: PASS.
Run: `npx eslint src/pages/IDCardsPage.jsx src/pages/idCards/RecentlyApprovedTab.jsx src/data/idCards.js src/lib/idCardQueue.js`
Expected: no errors.

- [ ] **Step 7: Check it in the browser against the emulator**

Start the SIMS dev server against the Firestore emulator (use the project's documented emulator setup). Sign in as the seeded admin, file an add request as a seeded adviser in the Parent App (or seed `id_card_approved/{studentId}` for an enrolled learner), then approve it in Learner requests. Then confirm:
1. ID Cards shows **Recently approved · 1** and lists the learner under their section with "Approved by …".
2. Select them, click **Add to saved batch**: they leave this tab and appear in **Saved batch**.
3. Repeat with a second approval. Select, then **Print selected**, then **Yes, mark as printed**: they leave the tab.
4. Repeat with a third. **Dismiss** asks first, then removes them.
5. Signed in as a coordinator, the ID Cards page is not reachable (unchanged).

- [ ] **Step 8: Commit**

```bash
git add src/pages/idCards/RecentlyApprovedTab.jsx src/pages/idCards/RecentlyApprovedTab.test.js src/pages/IDCardsPage.jsx
git commit -m "feat(sims): Recently approved tab in ID Cards" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: One-time backfill of earlier approvals

**Files:**
- Create: `functions/src/lib/approvedCardBackfill.js`
- Create: `functions/scripts/backfillApprovedCards.mjs`
- Create: `functions/test/emulator/approvedCardBackfill.test.js`

**Interfaces:**
- Consumes: `APPROVED_CARDS` and `approvedCardEntry` (Task 1).
- Produces: `backfillApprovedCards(db, { apply = false }) → { added: string[], skipped: [{ studentId, reason }] }`.

**What it logs:** each `audit_log` row with `action === 'learner.addApproved'` and `details.mode === 'new'`. A learner is logged when the request doc still exists, the learner record exists, they are still `enrolled` in the request's school year, their card is unprinted for the current LRN, and they are not already in `id_card_approved` or `id_card_batch`. `approvedAt` is the request's `decidedAt`, falling back to the audit row's `at`. `approvedByName` is the request's `decidedByName`.

- [ ] **Step 1: Write the failing emulator test**

`functions/test/emulator/approvedCardBackfill.test.js`:

```js
import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { db, clearAll } from './helpers.js';
import { backfillApprovedCards } from '../../src/lib/approvedCardBackfill.js';

const year = '2026-2027';
const decidedAt = Timestamp.fromMillis(Date.UTC(2026, 9, 29, 1));
const get = async (path) => (await db().doc(path).get()).data();

// One approved add: the audit row, its request, the learner and their enrollment.
async function approved(studentId, { mode = 'new', status = 'enrolled', idCard, student = true } = {}) {
  const d = db();
  await d.doc(`audit_log/A-${studentId}`).set({
    action: 'learner.addApproved', actorType: 'staff', actorUid: 'admin@school.test', targetType: 'learner_request', targetId: `R-${studentId}`,
    details: { lrn: `LRN-${studentId}`, name: studentId, mode, studentId, sectionId: 'SEC1', gradeLevel: 7, previousSectionId: null, previousStatus: null },
    at: decidedAt,
  });
  await d.doc(`learner_change_requests/R-${studentId}`).set({ kind: 'add', status: 'approved', schoolYear: year, decidedByName: 'Ada Admin', decidedAt });
  if (student) await d.doc(`students/${studentId}`).set({ lrn: `LRN-${studentId}`, lastName: studentId, firstName: 'A', ...(idCard ? { idCard } : {}) });
  await d.doc(`enrollments/${studentId}_${year}`).set({ studentId, schoolYear: year, sectionId: 'SEC1', gradeLevel: 7, status });
}

beforeEach(async () => { await clearAll(); });

describe('backfillApprovedCards', () => {
  it('reports in a dry run and writes nothing', async () => {
    await approved('S1');
    expect(await backfillApprovedCards(db())).toEqual({ added: ['S1'], skipped: [] });
    expect(await get('id_card_approved/S1')).toBeUndefined();
  });

  it('logs an unprinted, still-enrolled new learner with the approver and time', async () => {
    await approved('S1');
    await backfillApprovedCards(db(), { apply: true });
    expect(await get('id_card_approved/S1')).toEqual({ approvedAt: decidedAt, approvedByName: 'Ada Admin', requestId: 'R-S1', schoolYear: year });
  });

  it('skips moves, printed cards, dropped or missing learners, and anyone already logged or batched', async () => {
    await approved('MOVED', { mode: 'moved' });
    await approved('PRINTED', { idCard: { printedAt: decidedAt, printedBy: 'a@b', lrn: 'LRN-PRINTED' } });
    await approved('DROPPED', { status: 'dropped' });
    await approved('GONE', { student: false });
    await approved('LOGGED');
    await db().doc('id_card_approved/LOGGED').set({ approvedAt: decidedAt, approvedByName: 'X', requestId: 'R-LOGGED', schoolYear: year });
    await approved('BATCHED');
    await db().doc('id_card_batch/BATCHED').set({ addedAt: decidedAt, addedBy: 'a@b' });
    await approved('REPRINT', { idCard: { printedAt: decidedAt, printedBy: 'a@b', lrn: 'OLD-LRN' } });

    const result = await backfillApprovedCards(db(), { apply: true });
    expect(result.added).toEqual(['REPRINT']);
    expect(Object.fromEntries(result.skipped.map((s) => [s.studentId, s.reason]))).toEqual({
      PRINTED: 'Card already printed.', DROPPED: 'No longer enrolled.', GONE: 'Learner record not found.',
      LOGGED: 'Already logged.', BATCHED: 'Already in the saved batch.',
    });
    expect((await db().collection('id_card_approved').get()).docs.map((d) => d.id).sort()).toEqual(['LOGGED', 'REPRINT']);
  });

  it('adds nothing the second time', async () => {
    await approved('S1');
    await backfillApprovedCards(db(), { apply: true });
    expect(await backfillApprovedCards(db(), { apply: true })).toEqual({ added: [], skipped: [{ studentId: 'S1', reason: 'Already logged.' }] });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `firebase emulators:exec --only firestore,auth "cd functions && npx vitest run test/emulator/approvedCardBackfill.test.js --no-file-parallelism"`
Expected: FAIL with "Failed to load url ../../src/lib/approvedCardBackfill.js".

- [ ] **Step 3: Implement the backfill**

`functions/src/lib/approvedCardBackfill.js`:

```js
import { APPROVED_CARDS, approvedCardEntry } from './approvedCards.js';

const docId = (value) => typeof value === 'string' && value.length > 0 && !value.includes('/');

// One-time: logs new learners approved before Recently approved existed (plan 2026-10-30), from the
// 'learner.addApproved' audit rows. A learner is logged only if that approval created them, they are
// still enrolled in that year, their card is unprinted, and they are not already logged or batched.
export async function backfillApprovedCards(db, { apply = false } = {}) {
  const rows = await db.collection('audit_log').where('action', '==', 'learner.addApproved').get();
  const result = { added: [], skipped: [] };
  const seen = new Set();
  for (const row of rows.docs) {
    const { details = {}, targetId, at } = row.data();
    const { mode, studentId } = details;
    if (mode !== 'new' || !docId(studentId) || seen.has(studentId)) continue;
    seen.add(studentId);
    const skip = (reason) => result.skipped.push({ studentId, reason });
    const request = docId(targetId) ? (await db.doc(`learner_change_requests/${targetId}`).get()).data() : null;
    if (!request?.schoolYear) { skip('Request not found.'); continue; }
    const [student, enrollment, logged, batched] = await Promise.all([
      db.doc(`students/${studentId}`).get(),
      db.doc(`enrollments/${studentId}_${request.schoolYear}`).get(),
      db.doc(`${APPROVED_CARDS}/${studentId}`).get(),
      db.doc(`id_card_batch/${studentId}`).get(),
    ]);
    if (!student.exists) { skip('Learner record not found.'); continue; }
    if (enrollment.data()?.status !== 'enrolled') { skip('No longer enrolled.'); continue; }
    const card = student.data().idCard;
    if (card?.printedAt && card.lrn === student.data().lrn) { skip('Card already printed.'); continue; }
    if (logged.exists) { skip('Already logged.'); continue; }
    if (batched.exists) { skip('Already in the saved batch.'); continue; }
    if (apply) {
      await db.doc(`${APPROVED_CARDS}/${studentId}`).create(approvedCardEntry({
        requestId: targetId, schoolYear: request.schoolYear, approvedByName: request.decidedByName, approvedAt: request.decidedAt ?? at,
      }));
    }
    result.added.push(studentId);
  }
  return result;
}
```

`functions/scripts/backfillApprovedCards.mjs`:

```js
// Dry-run by default; uses Application Default Credentials for live Firestore.
// node functions/scripts/backfillApprovedCards.mjs <projectId> [--apply]
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { backfillApprovedCards } from '../src/lib/approvedCardBackfill.js';

const [projectId, flag, ...extra] = process.argv.slice(2);
if (!projectId || projectId.startsWith('-') || (flag && flag !== '--apply') || extra.length) {
  console.error('Usage: node functions/scripts/backfillApprovedCards.mjs <projectId> [--apply]');
  process.exit(1);
}
const app = initializeApp({ projectId });
const db = getFirestore(app);
try {
  const result = await backfillApprovedCards(db, { apply: flag === '--apply' });
  console.log(JSON.stringify({ projectId, mode: flag === '--apply' ? 'apply' : 'dry-run',
    emulator: Boolean(process.env.FIRESTORE_EMULATOR_HOST), added: result.added.length, skipped: result.skipped }, null, 2));
} catch (error) {
  console.error(`Backfill failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.terminate();
  await deleteApp(app);
}
```

The script prints the number added, not learner names or LRNs. Skipped rows show only student ids and reasons.

- [ ] **Step 4: Run the test to verify it passes**

Run: `firebase emulators:exec --only firestore,auth "cd functions && npx vitest run test/emulator/approvedCardBackfill.test.js --no-file-parallelism"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/lib/approvedCardBackfill.js functions/scripts/backfillApprovedCards.mjs functions/test/emulator/approvedCardBackfill.test.js
git commit -m "feat(functions): one-time backfill for Recently approved ID cards" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Release notes and full verification

**Files:**
- Create: `docs/releases/2026-10-30-id-card-recently-approved/README.md`

- [ ] **Step 1: Run every suite**

Run: `npm run test:all`
Expected: PASS for SIMS unit, functions unit, parent unit, rules and functions emulator suites. If any fail, stop and fix before writing the release notes.

- [ ] **Step 2: Write the release README**

`docs/releases/2026-10-30-id-card-recently-approved/README.md`:

````markdown
# Release — ID Cards: Recently approved (2026-10-30)

Plan: `docs/superpowers/plans/2026-10-30-id-card-recently-approved.md`

## What ships

- `firestore.rules`: `id_card_approved` readable and deletable by administrators only.
- Function `resolveLearnerRequest`: approving an add that creates a new learner logs them in `id_card_approved`.
- SIMS: a third ID Cards tab, **Recently approved**. Printing a card by any route also clears its log entry.
- Script `functions/scripts/backfillApprovedCards.mjs`, run once.

Parent App: no change. Do not deploy `hosting:parent`.

## Order (must be followed)

1. **Rules first.** The new SIMS bundle deletes `id_card_approved/{id}` whenever it marks a card printed. Without the rule, marking printed fails.

   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Function.**

   ```bash
   firebase deploy --only functions:resolveLearnerRequest
   ```

3. **Backfill.** Dry run, read the counts, then apply.

   ```bash
   node functions/scripts/backfillApprovedCards.mjs <projectId>
   ```

   ```bash
   node functions/scripts/backfillApprovedCards.mjs <projectId> --apply
   ```

4. **SIMS hosting**, through the documented SIMS release tree, not a root build. Port these files onto the current live release base: `src/data/idCards.js`, `src/lib/idCardQueue.js`, `src/pages/IDCardsPage.jsx`, `src/pages/idCards/RecentlyApprovedTab.jsx`. Before publishing, confirm the bundle contains the reCAPTCHA site key. Then deploy `hosting:sims` only.

5. Record the source revision, the backfill counts and the live byte check under `docs/audits/deployments/2026-10-30-id-card-recently-approved/`.

## Live checks

- As an admin: ID Cards → **Recently approved** lists the backfilled learners.
- Approve a test add request for a new LRN. The learner appears within seconds, with "Approved by …".
- **Add to saved batch** moves them. **Print selected** → **Yes, mark as printed** clears them. **Dismiss** asks, then clears.
- By section → print → mark printed also clears any of those learners from Recently approved.
- As a coordinator: ID Cards is still unreachable.
````

- [ ] **Step 3: Commit**

```bash
git add docs/releases/2026-10-30-id-card-recently-approved/README.md
git commit -m "docs: release notes for ID Cards Recently approved" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Out of scope

- Logging moves and re-enrollments (only brand-new learners are logged).
- A sidebar badge for ID Cards.
- Logging learners an admin creates directly in the SIMS learner form (no approval happens).
- Removing a learner from the saved batch when they are printed from Recently approved or By section (the saved-batch spec already leaves that out).
- History of dismissed entries beyond the existing audit log.
