# ID Card Saved Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the automatic Print queue with a saved, shared batch. An Administrator fills it by searching for enrolled learners over several days, then prints it when it fills enough of a sheet. After a confirmed print, those learners are marked printed and leave the batch.

**Architecture:**
- **Storage.** A new admin-only Firestore collection, `id_card_batch/{studentId}` with `{ addedAt, addedBy }`, records who is in the batch.
- **Pure functions.** Functions in `src/lib/idCardQueue.js` turn the batch documents plus the live `students`/`enrollments`/`sections` into printable entries and not-printable entries.
- **Saved batch tab.** A new `SavedBatchTab` replaces `PrintQueueTab`. It reuses the existing print sheets and the confirm hook. The hook gains an optional `mark` function, so a confirmed batch print marks the learners and removes them from the batch in one chunked `writeBatch`.

**Tech Stack:** React 19, Vite 8, Firebase 12 (Firestore web SDK), Vitest 4 (node environment), `@firebase/rules-unit-testing` against the Firestore emulator (`npm run test:rules`), and the repo's browser harness in `tests/browser/`.

**Spec:** `docs/superpowers/specs/2026-10-06-id-card-saved-batch-design.md`

## Global Constraints

- **Batch document.** `id_card_batch/{studentId}` is `{ addedAt: serverTimestamp(), addedBy: me.email }`. Only who was added is stored. Name, LRN and section are read live at render time.
- **Rule.** `match /id_card_batch/{studentId} { allow read, write: if isAdmin(); }`.
- **Writes.** Every `writeBatch` holds at most 500 operations. A confirmed batch print writes the `students/{id}` merge `{ idCard: { printedAt: serverTimestamp(), printedBy: me.email, lrn: student.lrn } }` and the `id_card_batch/{id}` delete in the same batch.
- **Who can be added.** Search finds learners enrolled in the selected school year only, with a non-blank LRN and an existing section. It shows at most 8 results, all not already in the batch.
- **Printable.** A batch learner is printable when they have an `enrolled` enrollment in the selected school year, an existing section, and a non-blank LRN. Everyone else goes under "Not enrolled — won't print".
- **Print order.** Grade → section name → DepEd order (males, then females, each by last then first name), using `sortIdCardBatch`.
- **Fill meter.** 80 per sheet. The exact strings are:
  - `''` for 0.
  - `'N of 80 — R more fills a sheet'` for 1–79.
  - `'K full sheet'` / `'K full sheets'` when the count is an exact multiple of 80.
  - `'K full sheet(s) + M — R more fills the next sheet'` otherwise.
- **Copy:**
  - Tab label: "Saved batch". The stored tab value stays `'queue'`.
  - Search field label: "Add a learner", with placeholder "Search name or LRN".
  - Tag: "Printed".
  - Not-printable group title: "Not enrolled — won't print".
  - Empty state: "The batch is empty", with the hint "Search above to add learners whose cards still need printing."
  - Clear button: "Clear batch". Its confirm asks "Remove all N learners from the batch? Nothing is marked printed."
  - The print-confirm copy is unchanged.
- **Unchanged:** the By section tab, the section detail modal, the printed rule (`isIdCardPrinted`), and the print grid.
- **Deploy order.** `firestore:rules` must deploy before `hosting:sims`. The new page subscribes to `id_card_batch`, which the old rules deny.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

| File | Responsibility |
|---|---|
| `src/lib/idCardQueue.js` (modify) | Add `enrolledEntries`, `buildBatchView`, `sheetFillLabel`. Remove `buildIdCardQueue` and `listQueueEntries` (Task 4). |
| `src/lib/idCardQueue.test.js` (modify) | Tests for the above |
| `firestore.rules` (modify) | `id_card_batch` rule |
| `tests/rules/idCardBatch.test.js` (new) | Rules tests |
| `src/data/idCards.js` (modify) | Add `addToIdCardBatch`, `removeFromIdCardBatch`, `clearIdCardBatch`, `markBatchPrinted`, plus a shared chunk helper |
| `src/data/idCards.test.js` (modify) | Tests for all data functions |
| `src/components/IdCardPrintConfirm.jsx` (modify) | Optional `mark` function |
| `src/pages/idCards/SavedBatchTab.jsx` (new) | The batch UI |
| `src/pages/idCards/PrintQueueTab.jsx` (delete) | Replaced |
| `src/pages/IDCardsPage.jsx` (modify) | Subscribe to `id_card_batch`, rename the tab, render `SavedBatchTab` |
| `tests/browser/registrar-fixture.js`, `tests/browser/registrar-recovery.jsx`, `tests/browser/README.md` (modify) | Batch regressions |

---

### Task 1: Batch view logic

**Files:**
- Modify: `src/lib/idCardQueue.js`
- Test: `src/lib/idCardQueue.test.js`

**Interfaces:**
- Consumes (already in the file): `sortIdCardBatch(entries)`, `isIdCardPrinted(student)`, and `byLastThenFirstName` from `./roster.js`.
- Produces:
  - `enrolledEntries({ students, enrollments, sections, schoolYear }) → { student, section }[]`, sorted in print order. It includes only enrolled learners with a section and a non-blank LRN.
  - `buildBatchView({ batchDocs: {id}[], enrolled: entries, students }) → { printable: entries (print order), notPrintable: { id, student|null }[] }`. `notPrintable` is sorted by name, with missing records last by id.
  - `sheetFillLabel(n) → string` (see Global Constraints).
- This task keeps `buildIdCardQueue` and `listQueueEntries`, because `PrintQueueTab` still imports them. Task 4 removes them.

- [ ] **Step 1: Write the failing tests**

In `src/lib/idCardQueue.test.js`, change the import block at the top to:

```js
import {
  isIdCardPrinted, sectionShortLabel, sortIdCardBatch, buildIdCardQueue,
  listQueueEntries, groupBySection, cardsLabel,
  enrolledEntries, buildBatchView, sheetFillLabel,
} from './idCardQueue.js';
```

Then append to the end of the file:

```js
describe('enrolledEntries and buildBatchView', () => {
  const ana = learner('ana', 'Abad', 'F');
  const ben = printed(learner('ben', 'Bautista', 'M'));
  const cruz = printed(learner('cruz', 'Cruz', 'M'), 'OLD-LRN');
  const dela = learner('dela', 'Dela', 'F');
  const eli = learner('eli', 'Eli', 'M');
  const fe = learner('fe', 'Fe', 'F');
  const gil = learner('gil', 'Gil', 'M', { lrn: '  ' });
  const hal = learner('hal', 'Hal', 'M');
  const students = [ana, ben, cruz, dela, eli, fe, gil, hal];
  const enrolled = enrolledEntries({
    students,
    sections: [rizal, bonifacio, acacia],
    schoolYear: SY,
    enrollments: [
      enroll(ana, rizal), enroll(ben, rizal), enroll(cruz, bonifacio), enroll(dela, acacia),
      enroll(eli, rizal, { status: 'dropped' }),
      enroll(fe, rizal, { schoolYear: '2025-2026' }),
      enroll(gil, rizal),
      enroll(hal, { id: 'deleted-section' }),
    ],
  });

  it('lists enrolled learners with a section and an LRN, in print order', () => {
    expect(ids(enrolled)).toEqual(['cruz', 'ben', 'ana', 'dela']);
    expect(enrolled.map((e) => e.section.id)).toEqual(['bonifacio', 'rizal', 'rizal', 'acacia']);
  });

  const view = buildBatchView({
    batchDocs: [{ id: 'dela' }, { id: 'gone' }, { id: 'ana' }, { id: 'gil' }, { id: 'eli' }, { id: 'cruz' }, { id: 'fe' }, { id: 'hal' }],
    enrolled,
    students,
  });

  it('prints enrolled batch learners, in print order', () => {
    expect(ids(view.printable)).toEqual(['cruz', 'ana', 'dela']);
  });
  it('prints the learner\'s current LRN, even if it changed after a print', () => {
    expect(view.printable[0].student.lrn).toBe('LRN-cruz');
  });
  it('sets aside dropped, other-year, no-LRN, no-section and missing learners, by name then id', () => {
    expect(view.notPrintable.map((n) => n.id)).toEqual(['eli', 'fe', 'gil', 'hal', 'gone']);
    expect(view.notPrintable[4].student).toBeNull();
    expect(view.notPrintable[0].student).toBe(eli);
  });
  it('is empty for an empty batch', () => {
    expect(buildBatchView({ batchDocs: [], enrolled, students })).toEqual({ printable: [], notPrintable: [] });
  });
});

describe('sheetFillLabel', () => {
  it.each([
    [0, ''],
    [1, '1 of 80 — 79 more fills a sheet'],
    [79, '79 of 80 — 1 more fills a sheet'],
    [80, '1 full sheet'],
    [81, '1 full sheet + 1 — 79 more fills the next sheet'],
    [160, '2 full sheets'],
    [172, '2 full sheets + 12 — 68 more fills the next sheet'],
  ])('%i cards → %s', (n, label) => {
    expect(sheetFillLabel(n)).toBe(label);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/idCardQueue.test.js`
Expected: FAIL. The new tests fail with `enrolledEntries is not a function` (or similar), and the existing tests still pass.

- [ ] **Step 3: Implement**

In `src/lib/idCardQueue.js`:

1. Add this import at the top (beside the existing roster import):

```js
import { ID_CARD_PRINT_LAYOUT } from '../pages/idCardPrintLayout.js';
```

2. Directly after the `sortIdCardBatch` function, add:

```js
// Everyone who can get a card this school year: enrolled, with a section
// and an LRN (the QR encodes the LRN). In print order.
export function enrolledEntries({ students, enrollments, sections, schoolYear }) {
  const studentById = new Map(students.map((s) => [s.id, s]));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const entries = [];
  for (const enrollment of enrollments) {
    if (enrollment.schoolYear !== schoolYear || enrollment.status !== 'enrolled') continue;
    const student = studentById.get(enrollment.studentId);
    const section = sectionById.get(enrollment.sectionId);
    if (!student || !section || !String(student.lrn ?? '').trim()) continue;
    entries.push({ student, section });
  }
  return sortIdCardBatch(entries);
}

// Splits the saved batch into what will print now and what can't yet. Only
// ids are saved, so a card always shows the learner's current details.
export function buildBatchView({ batchDocs, enrolled, students }) {
  const entryById = new Map(enrolled.map((e) => [e.student.id, e]));
  const studentById = new Map(students.map((s) => [s.id, s]));
  const printable = [];
  const notPrintable = [];
  for (const { id } of batchDocs) {
    const entry = entryById.get(id);
    if (entry) printable.push(entry);
    else notPrintable.push({ id, student: studentById.get(id) || null });
  }
  notPrintable.sort((a, b) =>
    (!a.student) - (!b.student) ||
    (a.student && b.student ? byLastThenFirstName(a.student, b.student) : a.id.localeCompare(b.id)));
  return { printable: sortIdCardBatch(printable), notPrintable };
}

const sheetsLabel = (k) => `${k} full sheet${k === 1 ? '' : 's'}`;

export function sheetFillLabel(n) {
  const perSheet = ID_CARD_PRINT_LAYOUT.cardsPerSheet;
  const full = Math.floor(n / perSheet);
  const rest = n % perSheet;
  if (n === 0) return '';
  if (rest === 0) return sheetsLabel(full);
  if (full === 0) return `${n} of ${perSheet} — ${perSheet - n} more fills a sheet`;
  return `${sheetsLabel(full)} + ${rest} — ${perSheet - rest} more fills the next sheet`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/idCardQueue.test.js`
Expected: PASS (all tests, old and new).

Run: `npm test`
Expected: all files pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/idCardQueue.js src/lib/idCardQueue.test.js
git commit -m "feat(idcards): saved batch view and sheet fill label" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Admin-only `id_card_batch` rule

**Files:**
- Modify: `firestore.rules` (after the `match /schedules/{id}` line, around line 82)
- Create: `tests/rules/idCardBatch.test.js`

**Interfaces:**
- Consumes: from `tests/rules/helpers.js`, `setup`, `seed`, `seedBaseline`, `as`, `anon`, `ok`, `denied`, `STAFF` (legacy admin `registrar@bnhs.edu`, seeded by `seedBaseline`), `JHS`, `KIOSK`, `GUARDIAN_A` and `ANON`. The `isAdmin()` function already exists in `firestore.rules`.
- Produces: admins can read and write `id_card_batch/{studentId}`; nobody else can.

- [ ] **Step 1: Write the failing rules test**

Create `tests/rules/idCardBatch.test.js`:

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
    await db.doc('id_card_batch/S1').set({ addedAt: new Date(), addedBy: 'registrar@bnhs.edu' });
  });
});

const entry = { addedAt: new Date(), addedBy: 'someone@bnhs.edu' };

describe('id_card_batch', () => {
  it('admins read, add and remove batch learners', async () => {
    const db = as(env, STAFF);
    await ok(db.collection('id_card_batch').get());
    await ok(db.doc('id_card_batch/S2').set(entry));
    await ok(db.doc('id_card_batch/S1').delete());
  });

  for (const [label, who] of [['coordinator', JHS], ['kiosk', KIOSK], ['guardian', GUARDIAN_A], ['anonymous sign-in', ANON]]) {
    it(`${label} can neither read nor write`, async () => {
      const db = as(env, who);
      await denied(db.doc('id_card_batch/S1').get());
      await denied(db.collection('id_card_batch').get());
      await denied(db.doc('id_card_batch/S2').set(entry));
      await denied(db.doc('id_card_batch/S1').delete());
    });
  }

  it('signed-out users can neither read nor write', async () => {
    await denied(anon(env).doc('id_card_batch/S1').get());
    await denied(anon(env).doc('id_card_batch/S2').set(entry));
  });
});
```

- [ ] **Step 2: Run the rules tests to verify the new file fails**

Run: `npm run test:rules`
Expected: the emulator starts (Java is installed) and `idCardBatch.test.js` fails on "admins read, add and remove batch learners", because no rule matches, so access is denied by default. The other rules files pass.

- [ ] **Step 3: Add the rule**

In `firestore.rules`, directly after this line:

```
    match /schedules/{id}   { allow read: if isStaff() || isKiosk() || signedIn(); allow write: if isAdmin(); }
```

add:

```
    match /id_card_batch/{studentId} { allow read, write: if isAdmin(); }
```

- [ ] **Step 4: Run the rules tests to verify they pass**

Run: `npm run test:rules`
Expected: all rules test files pass, including `idCardBatch.test.js` (6 tests).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules/idCardBatch.test.js
git commit -m "feat(rules): admin-only id_card_batch collection" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Batch data functions and the confirm hook's `mark` option

**Files:**
- Modify: `src/data/idCards.js` (whole file)
- Modify: `src/data/idCards.test.js` (whole file)
- Modify: `src/components/IdCardPrintConfirm.jsx`

**Interfaces:**
- Consumes: `db` from `src/firebase.js`.
- Produces:
  - `markIdCardsPrinted(students, me) → Promise<void>`, unchanged in behaviour.
  - `addToIdCardBatch(studentId, me) → Promise`, which calls `setDoc(id_card_batch/{id}, { addedAt: serverTimestamp(), addedBy: me.email })`.
  - `removeFromIdCardBatch(studentId) → Promise`, which calls `deleteDoc(id_card_batch/{id})`.
  - `clearIdCardBatch(studentIds: string[]) → Promise<void>`: chunked deletes, at most 500 per batch.
  - `markBatchPrinted(students, me) → Promise<void>`: for each learner, the `idCard` merge plus the batch delete, in the same batch. That is 2 operations per learner, so 250 learners per batch.
  - `useIdCardPrintConfirm(me, { onMarked, mark = markIdCardsPrinted } = {})`. "Yes" awaits `mark(batch, me)`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `src/data/idCards.test.js` with:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => {
  const batches = [];
  return {
    batches,
    doc: vi.fn((_db, collectionName, id) => ({ path: `${collectionName}/${id}` })),
    writeBatch: vi.fn(() => {
      const batch = {
        ops: [],
        set: (...args) => batch.ops.push(['set', ...args]),
        delete: (...args) => batch.ops.push(['delete', ...args]),
        commit: vi.fn().mockResolvedValue(undefined),
      };
      batches.push(batch);
      return batch;
    }),
    setDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    serverTimestamp: vi.fn(() => 'SERVER_TIME'),
  };
});

vi.mock('firebase/firestore', () => ({
  doc: firestore.doc,
  writeBatch: firestore.writeBatch,
  setDoc: firestore.setDoc,
  deleteDoc: firestore.deleteDoc,
  serverTimestamp: firestore.serverTimestamp,
}));
vi.mock('../firebase.js', () => ({ db: { kind: 'db' } }));

import { markIdCardsPrinted, addToIdCardBatch, removeFromIdCardBatch, clearIdCardBatch, markBatchPrinted } from './idCards.js';

const me = { email: 'admin@bnhs.edu.ph' };
const mark = (lrn) => ({ idCard: { printedAt: 'SERVER_TIME', printedBy: 'admin@bnhs.edu.ph', lrn } });
const sizes = () => firestore.batches.map((b) => b.ops.length);
const learners = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, lrn: String(i) }));

beforeEach(() => {
  firestore.batches.length = 0;
  firestore.writeBatch.mockClear();
  firestore.setDoc.mockClear();
  firestore.deleteDoc.mockClear();
});

describe('markIdCardsPrinted', () => {
  it('merges the printed mark, with the LRN that was printed, into each learner', async () => {
    await markIdCardsPrinted([{ id: 's1', lrn: '111' }, { id: 's2', lrn: '222' }], me);
    expect(firestore.batches[0].ops).toEqual([
      ['set', { path: 'students/s1' }, mark('111'), { merge: true }],
      ['set', { path: 'students/s2' }, mark('222'), { merge: true }],
    ]);
    expect(firestore.batches[0].commit).toHaveBeenCalledTimes(1);
  });
  it('splits 501 learners into batches of 500 and 1', async () => {
    await markIdCardsPrinted(learners(501), me);
    expect(sizes()).toEqual([500, 1]);
    firestore.batches.forEach((b) => expect(b.commit).toHaveBeenCalledTimes(1));
  });
  it('writes nothing for an empty list', async () => {
    await markIdCardsPrinted([], me);
    expect(firestore.batches).toHaveLength(0);
  });
});

describe('saved batch', () => {
  it('adds a learner with who added them and when', async () => {
    await addToIdCardBatch('s1', me);
    expect(firestore.setDoc).toHaveBeenCalledWith({ path: 'id_card_batch/s1' }, { addedAt: 'SERVER_TIME', addedBy: 'admin@bnhs.edu.ph' });
  });
  it('removes a learner', async () => {
    await removeFromIdCardBatch('s1');
    expect(firestore.deleteDoc).toHaveBeenCalledWith({ path: 'id_card_batch/s1' });
  });
  it('clears in batches of at most 500 deletes', async () => {
    await clearIdCardBatch(Array.from({ length: 501 }, (_, i) => `s${i}`));
    expect(sizes()).toEqual([500, 1]);
    expect(firestore.batches[1].ops).toEqual([['delete', { path: 'id_card_batch/s500' }]]);
  });
});

describe('markBatchPrinted', () => {
  it('marks each learner and removes them from the batch in the same write', async () => {
    await markBatchPrinted([{ id: 's1', lrn: '111' }, { id: 's2', lrn: '222' }], me);
    expect(firestore.batches).toHaveLength(1);
    expect(firestore.batches[0].ops).toEqual([
      ['set', { path: 'students/s1' }, mark('111'), { merge: true }],
      ['delete', { path: 'id_card_batch/s1' }],
      ['set', { path: 'students/s2' }, mark('222'), { merge: true }],
      ['delete', { path: 'id_card_batch/s2' }],
    ]);
  });
  it('keeps each batch at 500 operations or fewer (250 learners)', async () => {
    await markBatchPrinted(learners(300), me);
    expect(sizes()).toEqual([500, 100]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/data/idCards.test.js`
Expected: FAIL. The new imports are undefined (`addToIdCardBatch is not a function`).

- [ ] **Step 3: Implement the data functions**

Replace the whole of `src/data/idCards.js` with:

```js
import { doc, writeBatch, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

const OPS_PER_BATCH = 500; // Firestore's hard limit per writeBatch
const BATCH = 'id_card_batch';

const printedMark = (student, me) =>
  ({ idCard: { printedAt: serverTimestamp(), printedBy: me.email, lrn: student.lrn } });

// Runs `write(batch, item)` for every item, committing before a batch would
// pass Firestore's operation limit. `opsPerItem` is how many writes each
// item adds.
async function writeInChunks(items, opsPerItem, write) {
  const size = Math.floor(OPS_PER_BATCH / opsPerItem);
  for (let i = 0; i < items.length; i += size) {
    const batch = writeBatch(db);
    items.slice(i, i + size).forEach((item) => write(batch, item));
    await batch.commit();
  }
}

// Records that each learner's card was printed for their current LRN;
// isIdCardPrinted in src/lib/idCardQueue.js reads it back.
export const markIdCardsPrinted = (students, me) =>
  writeInChunks(students, 1, (batch, student) =>
    batch.set(doc(db, 'students', student.id), printedMark(student, me), { merge: true }));

// The saved batch stores only who was added; the card's details are read
// live from the learner's records when it prints.
export const addToIdCardBatch = (studentId, me) =>
  setDoc(doc(db, BATCH, studentId), { addedAt: serverTimestamp(), addedBy: me.email });

export const removeFromIdCardBatch = (studentId) => deleteDoc(doc(db, BATCH, studentId));

export const clearIdCardBatch = (studentIds) =>
  writeInChunks(studentIds, 1, (batch, id) => batch.delete(doc(db, BATCH, id)));

// Marking and leaving the batch share one write, so a learner is never
// marked printed while still waiting in the batch, or the other way round.
export const markBatchPrinted = (students, me) =>
  writeInChunks(students, 2, (batch, student) => {
    batch.set(doc(db, 'students', student.id), printedMark(student, me), { merge: true });
    batch.delete(doc(db, BATCH, student.id));
  });
```

- [ ] **Step 4: Let the confirm hook take a `mark` function**

In `src/components/IdCardPrintConfirm.jsx`, change:

```jsx
export function useIdCardPrintConfirm(me, { onMarked } = {}) {
```

to:

```jsx
export function useIdCardPrintConfirm(me, { onMarked, mark = markIdCardsPrinted } = {}) {
```

and change:

```jsx
      onYes={async () => { await markIdCardsPrinted(batch, me); setBatch(null); onMarked?.(); }}
```

to:

```jsx
      onYes={async () => { await mark(batch, me); setBatch(null); onMarked?.(); }}
```

- [ ] **Step 5: Run the tests and build**

Run: `npx vitest run src/data/idCards.test.js`
Expected: PASS (8 tests).

Run: `npm test`
Expected: all files pass.

Run: `npm run build`
Expected: `✓ built in …` with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/data/idCards.js src/data/idCards.test.js src/components/IdCardPrintConfirm.jsx
git commit -m "feat(idcards): saved batch writes; batch print marks and removes together" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Saved batch tab replaces the Print queue

**Files:**
- Create: `src/pages/idCards/SavedBatchTab.jsx`
- Delete: `src/pages/idCards/PrintQueueTab.jsx`
- Modify: `src/pages/IDCardsPage.jsx`
- Modify: `src/lib/idCardQueue.js` and `src/lib/idCardQueue.test.js` (remove `buildIdCardQueue` and `listQueueEntries`, plus their tests)

**Interfaces:**
- Consumes:
  - From Task 1: `enrolledEntries`, `buildBatchView` and `sheetFillLabel`.
  - Already present: `groupBySection`, `isIdCardPrinted`, and `sectionLabel`-style formatting.
  - From Task 3: `addToIdCardBatch`, `removeFromIdCardBatch`, `clearIdCardBatch`, `markBatchPrinted`, and `useIdCardPrintConfirm(me, { mark })`.
  - Existing: `IdCardsPrintSheets({ entries, printOnly })`, `usePrintReadiness`, `useAsyncAction` with `ActionFeedback`, `learnerMatches`, `fullName`, and `useCollectionResource('id_card_batch')`, which returns `{ id, addedAt, addedBy }[]`.
- Produces:
  - `SavedBatchTab({ me, students, enrollments, sections, schoolYear, batchDocs })`.
  - `IDCardsPage` labels the `'queue'` tab "Saved batch".

**Notes for the implementer:**
- **Print visibility.** Everything on screen is inside `className="id-cards-controls"`, which the print CSS hides. Only the `printOnly` sheet prints.
- **Write errors.** Add/Remove write errors show through `ActionFeedback`, the same pattern as `SectionsPage`.
- **Action bar.** It is sticky at the **top** of the list, so the fill meter shows above the list, as the spec asks.

- [ ] **Step 1: Create the tab**

Create `src/pages/idCards/SavedBatchTab.jsx`:

```jsx
import { useMemo, useRef, useState } from 'react';
import { usePrintReadiness } from '../../hooks/usePrintReadiness.js';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ActionFeedback, Btn, Inp, Field, Card, EmptyState, Confirm } from '../../components/ui.jsx';
import IdCardsPrintSheets from '../../components/IdCardsPrintable.jsx';
import { useIdCardPrintConfirm } from '../../components/IdCardPrintConfirm.jsx';
import { addToIdCardBatch, removeFromIdCardBatch, clearIdCardBatch, markBatchPrinted } from '../../data/idCards.js';
import { enrolledEntries, buildBatchView, groupBySection, isIdCardPrinted, sheetFillLabel } from '../../lib/idCardQueue.js';
import { learnerMatches } from '../../lib/search.js';
import { fullName } from '../../lib/roster.js';
import { T } from '../../styles.js';

const sectionLabel = (s) => `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}`;
const SEARCH_LIMIT = 8;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const printedTag = { fontSize: 11, fontWeight: 600, color: T.primary, border: `1px solid ${T.primary}`, borderRadius: T.pill, padding: '1px 8px' };
const row = { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, flexWrap: 'wrap' };

export default function SavedBatchTab({ me, students, enrollments, sections, schoolYear, batchDocs }) {
  const enrolled = useMemo(() => enrolledEntries({ students, enrollments, sections, schoolYear }),
    [students, enrollments, sections, schoolYear]);
  const { printable, notPrintable } = useMemo(() => buildBatchView({ batchDocs, enrolled, students }),
    [batchDocs, enrolled, students]);
  const batchIds = useMemo(() => new Set(batchDocs.map((d) => d.id)), [batchDocs]);
  const groups = useMemo(() => groupBySection(printable), [printable]);
  const printableStudents = useMemo(() => printable.map((e) => e.student), [printable]);

  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const action = useAsyncAction();
  const results = useMemo(() => (query.trim()
    ? enrolled.filter((e) => !batchIds.has(e.student.id) && learnerMatches(query, e.student, { includeLrn: true })).slice(0, SEARCH_LIMIT)
    : []), [enrolled, batchIds, query]);

  const { printAndConfirm, confirmDialog } = useIdCardPrintConfirm(me, { mark: markBatchPrinted });
  const printRoot = useRef(null);
  const printKey = printable.map((e) => e.student.id + e.student.lrn + e.section.id).join(',');
  const printReady = usePrintReadiness(printRoot, printKey, printable.length);
  const fill = sheetFillLabel(printable.length);

  const add = (id) => { setQuery(''); action.run('add', () => addToIdCardBatch(id, me)); };
  const remove = (id) => action.run('remove', () => removeFromIdCardBatch(id));

  return (
    <>
      <div className="id-cards-controls" style={{ fontFamily: T.body, color: T.ink }}>
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <ActionFeedback action={action} />
          <Field label="Add a learner">
            <Inp value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or LRN" />
          </Field>
          {results.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {results.map(({ student, section }) => (
                <li key={student.id} style={row}>
                  <span style={{ flex: 1 }}>
                    <strong>{fullName(student)}</strong>{' '}
                    <span style={{ ...T.num, color: T.inkMuted }}>{student.lrn}</span>{' '}
                    <span style={{ color: T.inkMuted }}>· {sectionLabel(section)}</span>
                  </span>
                  {isIdCardPrinted(student) && <span style={printedTag}>Printed</span>}
                  <Btn variant="ghost" disabled={action.busy} onClick={() => add(student.id)} aria-label={`Add ${fullName(student)}`}>Add</Btn>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && results.length === 0 && (
            <p style={{ margin: 0, color: T.inkMuted, fontSize: 13 }}>No other enrolled learner matches “{query.trim()}”.</p>
          )}
        </Card>

        {batchDocs.length === 0 ? (
          <Card style={{ padding: 20 }}>
            <EmptyState title="The batch is empty" hint="Search above to add learners whose cards still need printing." />
          </Card>
        ) : (
          <>
            <Card style={{ position: 'sticky', top: 0, zIndex: 1, padding: '12px 20px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>{fill || 'Nothing in the batch can print yet'}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn variant="ghost" onClick={() => setConfirmClear(true)}>Clear batch</Btn>
                <Btn disabled={printable.length === 0 || !printReady} onClick={() => printAndConfirm(printableStudents)}>
                  {printable.length === 0 || printReady ? 'Print' : 'Preparing QR codes…'}
                </Btn>
              </div>
            </Card>

            {groups.map(({ section, entries }) => (
              <Card key={section.id} style={{ padding: 16, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{sectionLabel(section)} · {entries.length}</div>
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                  {entries.map(({ student }) => (
                    <li key={student.id} style={row}>
                      <span style={{ flex: 1 }}>{fullName(student)}{' '}
                        <span style={{ ...T.num, color: T.inkMuted, fontSize: 12 }}>{student.lrn}</span></span>
                      {isIdCardPrinted(student) && <span style={printedTag}>Printed</span>}
                      <Btn variant="ghost" disabled={action.busy} onClick={() => remove(student.id)} aria-label={`Remove ${fullName(student)}`}>Remove</Btn>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}

            {notPrintable.length > 0 && (
              <Card style={{ padding: 16, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Not enrolled — won't print · {notPrintable.length}</div>
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                  {notPrintable.map(({ id, student }) => {
                    const name = student ? fullName(student) : 'Learner record not found';
                    return (
                      <li key={id} style={row}>
                        <span style={{ flex: 1, color: T.inkMuted }}>{name}{' '}
                          <span style={{ ...T.num, fontSize: 12 }}>{student?.lrn || id}</span></span>
                        <Btn variant="ghost" disabled={action.busy} onClick={() => remove(id)} aria-label={`Remove ${name}`}>Remove</Btn>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </>
        )}
      </div>

      {printable.length > 0 && <div ref={printRoot}><IdCardsPrintSheets entries={printable} printOnly /></div>}
      {confirmDialog}
      {confirmClear && (
        <Confirm
          title="Clear the batch?"
          label="Clear batch"
          message={`Remove all ${plural(batchDocs.length, 'learner', 'learners')} from the batch? Nothing is marked printed.`}
          onYes={async () => { await clearIdCardBatch(batchDocs.map((d) => d.id)); setConfirmClear(false); }}
          onNo={() => setConfirmClear(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Wire it into the page**

In `src/pages/IDCardsPage.jsx`:

1. Replace:

```jsx
import PrintQueueTab from './idCards/PrintQueueTab.jsx';

const TABS = [['section', 'By section'], ['queue', 'Print queue']];
```

with:

```jsx
import SavedBatchTab from './idCards/SavedBatchTab.jsx';

// 'queue' is kept as the key so a remembered tab still opens the batch.
const TABS = [['section', 'By section'], ['queue', 'Saved batch']];
```

2. After `const studentsResource = useCollectionResource('students');`, add:

```jsx
  const batchResource = useCollectionResource('id_card_batch');
```

3. Replace:

```jsx
  const resources = [sectionsResource, enrollmentsResource, studentsResource];
```

with:

```jsx
  const resources = [sectionsResource, enrollmentsResource, studentsResource, batchResource];
```

4. Replace:

```jsx
        {tab === 'section' ? <BySectionTab {...data} /> : <PrintQueueTab {...data} />}
```

with:

```jsx
        {tab === 'section' ? <BySectionTab {...data} /> : <SavedBatchTab {...data} batchDocs={batchResource.data} />}
```

- [ ] **Step 3: Delete the old tab and its now-unused logic**

1. Delete `src/pages/idCards/PrintQueueTab.jsx`:

```bash
git rm src/pages/idCards/PrintQueueTab.jsx
```

2. In `src/lib/idCardQueue.js`, delete the whole `buildIdCardQueue` function and the `listQueueEntries` export together with its two-line comment above it ("What the Print queue tab lists…").

3. In `src/lib/idCardQueue.test.js`:
   - Delete the whole `describe('buildIdCardQueue', …)` block.
   - Change the import block to:

```js
import {
  isIdCardPrinted, sectionShortLabel, sortIdCardBatch, groupBySection, cardsLabel,
  enrolledEntries, buildBatchView, sheetFillLabel,
} from './idCardQueue.js';
```

4. Confirm that nothing else references the removed names:

Run: `git grep -n "buildIdCardQueue\|listQueueEntries\|PrintQueueTab" -- src`
Expected: no output.

- [ ] **Step 4: Run tests and build**

Run: `npm test`
Expected: all files pass.

Run: `npm run build`
Expected: `✓ built in …` with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/idCards/SavedBatchTab.jsx src/pages/IDCardsPage.jsx src/lib/idCardQueue.js src/lib/idCardQueue.test.js
git commit -m "feat(idcards): Saved batch tab replaces the automatic print queue" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm` in Step 3 already staged the deletion.)

---

### Task 5: Browser regressions for the saved batch

**Files:**
- Modify: `tests/browser/registrar-fixture.js`
- Modify: `tests/browser/registrar-recovery.jsx` (line 12 and lines 18–35)
- Modify: `tests/browser/README.md`

**Interfaces:**
- Consumes:
  - `IDCardsPage` (Task 4). The harness serves `useCollectionResource(path)` from the fixture's `data[path]` and stubs every `src/data/*.js` export to `async () => ({})`.
- **Fixture facts:**
  - Sections: `sec0` = Acacia (grade 7), `sec2` = Camia (grade 8), `sec5` = Faith (grade 9).
  - Learners `s0`–`s115` are enrolled round-robin (`sN` → `sec(N % 8)`), and `s120` is not enrolled.
  - Every learner's `lastName` is `Synthetic` and `firstName` is `Learner ###` (1-based, so `s3` is `Learner 004`).
  - `s0` is printed for its current LRN.
- **Batch for this task:** `s0`, `s2`, `s10`, `s5` and `s120`. Printable: 4, ordered `s0` (Acacia), `s2`, `s10` (Camia), `s5` (Faith). Not printable: `s120`.

- [ ] **Step 1: Add the batch to the fixture**

In `tests/browser/registrar-fixture.js`, replace:

```js
const data={students,sections,enrollments,student_attendance:attendance,schedules:[],kiosks:[]};
```

with:

```js
const id_card_batch=['s0','s2','s10','s5','s120'].map(id=>({id,addedAt:{seconds:1},addedBy:'fixture@bnhs'}));
const data={students,sections,enrollments,student_attendance:attendance,schedules:[],kiosks:[],id_card_batch};
```

- [ ] **Step 2: Replace the queue helper and tests**

In `tests/browser/registrar-recovery.jsx`:

1. Replace line 12 (the line starting `const openQueue=`) with:

```js
const openBatch=async()=>{try{localStorage.removeItem('sims.idCards.tab')}catch{}await scenario('normal');await render(<IDCardsPage me={admin} schoolYear="2026-2027"/>);await click(button('Saved batch'));};
```

2. Delete lines 18–35. These are the three test entries starting `,['Print queue merges unprinted learners…`, `,['Printing the queue asks before marking…` and `,['Mark as printed without printing asks first…`. Keep the `,['Coordinator section print never asks to mark'…` entry that follows them. In their place, insert:

```js
,['Saved batch prints its enrolled learners by section and sets aside the unenrolled one',async()=>{await openBatch();
  const cards=[...host.querySelectorAll('.id-cards-print-only .id-card')];assert(cards.length===4,'Print sheet has '+cards.length+' cards, expected 4');
  assert(cards.map(c=>c.querySelector('.id-card-section').textContent).join('|')==='7 · Acacia|8 · Camia|8 · Camia|9 · Faith','Cards are not in grade/section order');
  assert(host.textContent.includes("Not enrolled — won't print · 1"),'Unenrolled batch learner not set aside');
  assert(host.textContent.includes('4 of 80 — 76 more fills a sheet'),'Fill meter missing or wrong');
  assert([...host.querySelectorAll('span')].filter(n=>n.textContent==='Printed').length===1,'Expected one Printed tag (s0)');}]
,['Search offers enrolled learners not in the batch, and Add clears the search',async()=>{await openBatch();
  await fill(input('Add a learner'),'Learner 004');
  const add=host.querySelector('button[aria-label="Add Synthetic, Learner 004"]');assert(add,'Search did not offer Learner 004');
  await fill(input('Add a learner'),'Learner 003');assert(!host.querySelector('button[aria-label="Add Synthetic, Learner 003"]'),'Search offered a learner already in the batch');
  await fill(input('Add a learner'),'Learner 004');await click(host.querySelector('button[aria-label="Add Synthetic, Learner 004"]'));
  assert(input('Add a learner').value==='','Add did not clear the search');}]
,['Printing the batch asks before marking, and both answers close the dialog',async()=>{const print=stubPrint();try{await openBatch();
  await waitFor(()=>button('Print')&&!button('Print').disabled,'Print never became ready');
  await click(button('Print'));assert(print.calls()===1,'window.print not called');
  assert(dialogText().includes('Did these 4 cards print correctly?'),'Confirm dialog missing after print');
  await click(button("No, don't mark"));assert(!dialogText().includes('print correctly'),'Dialog stayed open after No');
  await click(button('Print'));await click(button('Yes, mark as printed'));
  await waitFor(()=>!dialogText().includes('print correctly'),'Dialog stayed open after Yes');}finally{print.restore()}}]
,['Clear batch asks first',async()=>{await openBatch();
  await click(button('Clear batch'));
  assert(dialogText().includes('Remove all 5 learners from the batch? Nothing is marked printed.'),'Clear confirm missing');
  await click(button('Cancel'));assert(!host.querySelector('dialog[open]'),'Confirm stayed open after Cancel');}]
```

`s2` is `Learner 003` and is already in the batch, so search must not offer it. `s3` is `Learner 004`: enrolled and not in the batch.

- [ ] **Step 3: Update the README**

In `tests/browser/README.md`, change `nine PASS lines` to `ten PASS lines`. Then replace this phrase:

```
the ID card print queue (merged sheets, confirm-after-print, mark without printing)
```

with:

```
the ID card saved batch (merged sheets in print order, unenrolled learners set aside, fill meter, search and add, confirm-after-print, clear)
```

- [ ] **Step 4: Check syntax and the unit suite**

Run: `npx vite build --emptyOutDir --outDir node_modules/.tmp-browser-check --ssr tests/browser/registrar-recovery.jsx`
Expected: it transforms with no parse errors. Then run `rm -rf node_modules/.tmp-browser-check`.

Run: `npm test`
Expected: all files pass.

- [ ] **Step 5: Run the browser suite**

Start `npm exec vite -- --config tests/browser/registrar.config.mjs` and open `http://127.0.0.1:5187/tests/browser/registrar-recovery.html`. Wait for `#results[data-done="true"]`.
Expected: 10 lines, all `PASS`. A subagent without browser tools skips this step and says so in its report; the controller runs it. Stop only the server you started (by its own PID or task), never all `node` processes.

- [ ] **Step 6: Commit**

```bash
git add tests/browser/registrar-fixture.js tests/browser/registrar-recovery.jsx tests/browser/README.md
git commit -m "test(browser): saved batch regressions replace print queue tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Final verification

**Files:** none, unless a check fails.

- [ ] **Step 1:** Run `npm test`. Expected: every file passes.
- [ ] **Step 2:** Run `npm run test:rules`. Expected: every rules file passes, including `idCardBatch.test.js`.
- [ ] **Step 3:** Run `npm run build`. Expected: `✓ built in …`.
- [ ] **Step 4:** Run the browser suite (Task 5 Step 5). Expected: 10 PASS lines.
- [ ] **Step 5: Report deploy notes to the user; do not deploy without their go-ahead.**
  - The release needs `firestore:rules` **then** `hosting:sims`. With the old rules, the new page's `id_card_batch` subscription is denied and the ID Cards page shows its load error.
  - Use `NODE_OPTIONS="--dns-result-order=ipv4first"`.
  - Build with the production `.env` from the main checkout.
