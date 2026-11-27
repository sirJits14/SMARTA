# ID Card Print Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an Administrator print one merged batch of QR ID cards: every enrolled learner whose card hasn't been printed yet, from all sections, plus learners added by hand. After printing, the app asks whether the cards came out right and then records them as printed.

**Architecture:** A `students/{id}.idCard` field (`printedAt`, `printedBy`, `lrn`) records the last print. The queue is computed in the client by pure functions in `src/lib/idCardQueue.js`, from the `students`, `enrollments`, and `sections` collections the ID Cards page already subscribes to. A shared hook, `useIdCardPrintConfirm`, wraps `window.print()` with an admin-only "Did these N cards print correctly?" dialog. All three print buttons use it: the By section tab, the Print queue tab, and the section detail modal.

**Tech Stack:** React 19, Vite 8, Firebase 12 (Firestore web SDK), `qrcode`, Vitest 4 (node environment), and the repo's own browser regression harness in `tests/browser/`.

**Spec:** `docs/superpowers/specs/2026-10-05-id-card-print-queue-design.md`

## Global Constraints

- A learner counts as printed only when `idCard.printedAt` is set **and** `idCard.lrn === student.lrn`.
- The mark never resets by school year.
- Writes go to `students/{id}` with `{ merge: true }` through `writeBatch`, in chunks of at most 500.
- No `firestore.rules` change and no new index.
- Batch order: grade level ascending → section name → DepEd order (males, then females, each by last then first name).
- Print grid is unchanged: 8 × 10 on A4, `grid-auto-rows: 27mm`, QR `16mm`, and `@page` margin `8mm`.
- Each printed card shows a section line such as `7 · Rizal`, or `11 · Acacia · STEM` when the section has a strand.
- The confirm dialog appears only for admins (`isAdmin(me)` from `src/lib/access.js`). Coordinators can print but never mark.
- Exact copy:
  - Dialog title: "Mark as printed?"
  - Dialog question: "Did these N cards print correctly?" (one card: "Did this card print correctly?")
  - Dialog buttons: "Yes, mark as printed" / "No, don't mark"
  - Tabs: "By section" / "Print queue"
  - Queue buttons: "Print" / "Mark as printed without printing"
- Every `localStorage` access is wrapped in try/catch.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Map

| File | Responsibility |
|---|---|
| `src/lib/roster.js` (modify) | Export the existing `byLastThenFirstName` comparator |
| `src/lib/idCardQueue.js` (new) | Pure queue logic: printed check, section label, sort, queue, list, grouping, copy helpers |
| `src/lib/idCardQueue.test.js` (new) | Unit tests for the above |
| `src/data/idCards.js` (new) | `markIdCardsPrinted(students, me)` |
| `src/data/idCards.test.js` (new) | Payload, merge, and chunking tests |
| `src/pages/idCardPrintLayout.js` (modify) | Print styles for the section line |
| `src/pages/idCardPrintLayout.test.js` (modify) | Section line is shown in print |
| `src/components/IdCardsPrintable.jsx` (modify) | Takes `entries` (`{ student, section }[]`) |
| `src/components/ui.jsx` (modify) | `Confirm` gets a `cancelLabel` prop |
| `src/components/IdCardPrintConfirm.jsx` (new) | `useIdCardPrintConfirm(me, { onMarked })` |
| `src/pages/idCards/BySectionTab.jsx` (new) | Today's section view, moved out of the page |
| `src/pages/idCards/PrintQueueTab.jsx` (new) | The merged queue UI |
| `src/pages/IDCardsPage.jsx` (modify) | Loads data, shows the tabs, remembers the last tab |
| `src/App.jsx` (modify) | Passes `me` to `IDCardsPage` |
| `src/pages/SectionDetailModal.jsx`, `src/pages/SectionsPage.jsx` (modify) | Modal print goes through the confirm hook |
| `tests/browser/registrar-fixture.js`, `tests/browser/registrar-recovery.jsx`, `tests/browser/README.md` (modify) | Browser regressions for the queue and the confirm dialog |

---

### Task 1: Queue logic (`src/lib/idCardQueue.js`)

**Files:**
- Modify: `src/lib/roster.js:7` (export the comparator)
- Create: `src/lib/idCardQueue.js`
- Test: `src/lib/idCardQueue.test.js`

**Interfaces:**
- Consumes: `byLastThenFirstName(a, b)` from `src/lib/roster.js`. It exists today but isn't exported.
- Produces (later tasks use exactly these):
  - `isIdCardPrinted(student) → boolean`
  - `sectionShortLabel(section) → string`, e.g. `'7 · Rizal'`, `'11 · Acacia · STEM'`, or `''` for null
  - `sortIdCardBatch(entries) → entries` (new array), where an entry is `{ student, section }`
  - `buildIdCardQueue({ students, enrollments, sections, schoolYear }) → { eligible, queue, missingLrnCount }`. `eligible` and `queue` are sorted entry arrays, and `queue` holds the unprinted subset of `eligible`.
  - `listQueueEntries(eligible, addedIds: Set<string>) → entries`. It returns the unprinted entries plus the hand-added ones, in print order.
  - `groupBySection(entries) → [{ section, entries }]`. The input must already be sorted.
  - `cardsLabel(n) → '1 card' | 'N cards'`

- [ ] **Step 1: Write the failing test**

Create `src/lib/idCardQueue.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  isIdCardPrinted, sectionShortLabel, sortIdCardBatch, buildIdCardQueue,
  listQueueEntries, groupBySection, cardsLabel,
} from './idCardQueue.js';

const SY = '2026-2027';
const rizal = { id: 'rizal', gradeLevel: 7, name: 'Rizal', schoolYear: SY };
const bonifacio = { id: 'bonifacio', gradeLevel: 7, name: 'Bonifacio', schoolYear: SY };
const acacia = { id: 'acacia', gradeLevel: '11', name: 'Acacia', strand: 'STEM', schoolYear: SY };

const learner = (id, lastName, sex, extra = {}) =>
  ({ id, lastName, firstName: 'Ana', sex, lrn: `LRN-${id}`, ...extra });
const printed = (s, lrn = s.lrn) =>
  ({ ...s, idCard: { printedAt: { seconds: 1 }, printedBy: 'admin@bnhs', lrn } });
const enroll = (student, section, extra = {}) => ({
  id: `${student.id}_${SY}`, studentId: student.id, sectionId: section.id,
  schoolYear: SY, status: 'enrolled', ...extra,
});
const ids = (entries) => entries.map((e) => e.student.id);

describe('isIdCardPrinted', () => {
  it('is false for a learner never printed', () => {
    expect(isIdCardPrinted(learner('a', 'Cruz', 'M'))).toBe(false);
  });
  it('is true when printed for the current LRN', () => {
    expect(isIdCardPrinted(printed(learner('a', 'Cruz', 'M')))).toBe(true);
  });
  it('is false when the LRN changed after printing', () => {
    expect(isIdCardPrinted(printed(learner('a', 'Cruz', 'M'), 'OLD-LRN'))).toBe(false);
  });
  it('is false when idCard has no printedAt', () => {
    expect(isIdCardPrinted({ ...learner('a', 'Cruz', 'M'), idCard: { lrn: 'LRN-a' } })).toBe(false);
  });
});

describe('sectionShortLabel', () => {
  it('joins grade, name and strand', () => {
    expect(sectionShortLabel(rizal)).toBe('7 · Rizal');
    expect(sectionShortLabel(acacia)).toBe('11 · Acacia · STEM');
    expect(sectionShortLabel(null)).toBe('');
  });
});

describe('sortIdCardBatch', () => {
  it('orders by grade, section name, then males before females by name', () => {
    const entries = [
      { student: learner('dela', 'Dela', 'F'), section: acacia },
      { student: learner('ana', 'Abad', 'F'), section: rizal },
      { student: learner('ben', 'Bautista', 'M'), section: rizal },
      { student: learner('cruz', 'Cruz', 'M'), section: bonifacio },
      { student: learner('aba', 'Aba', 'F'), section: bonifacio },
    ];
    expect(ids(sortIdCardBatch(entries))).toEqual(['cruz', 'aba', 'ben', 'ana', 'dela']);
  });
  it('does not mutate its input', () => {
    const entries = [
      { student: learner('b', 'B', 'M'), section: rizal },
      { student: learner('a', 'A', 'M'), section: rizal },
    ];
    sortIdCardBatch(entries);
    expect(ids(entries)).toEqual(['b', 'a']);
  });
});

describe('buildIdCardQueue', () => {
  const ana = learner('ana', 'Abad', 'F');
  const ben = printed(learner('ben', 'Bautista', 'M'));
  const cruz = printed(learner('cruz', 'Cruz', 'M'), 'OLD-LRN');
  const dela = learner('dela', 'Dela', 'F');
  const eli = learner('eli', 'Eli', 'M');
  const fe = learner('fe', 'Fe', 'F');
  const gil = learner('gil', 'Gil', 'M', { lrn: '  ' });
  const hal = learner('hal', 'Hal', 'M');
  const result = buildIdCardQueue({
    students: [ana, ben, cruz, dela, eli, fe, gil, hal],
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

  it('lists every enrolled learner with an LRN, in print order', () => {
    expect(ids(result.eligible)).toEqual(['cruz', 'ben', 'ana', 'dela']);
  });
  it('queues only learners not printed for their current LRN', () => {
    expect(ids(result.queue)).toEqual(['cruz', 'ana', 'dela']);
  });
  it('counts enrolled learners without an LRN', () => {
    expect(result.missingLrnCount).toBe(1);
  });
  it('pairs each learner with their own section', () => {
    expect(result.queue.map((e) => e.section.id)).toEqual(['bonifacio', 'rizal', 'acacia']);
  });

  it('adds hand-picked printed learners to the listed entries, in print order', () => {
    expect(ids(listQueueEntries(result.eligible, new Set(['ben'])))).toEqual(['cruz', 'ben', 'ana', 'dela']);
    expect(ids(listQueueEntries(result.eligible, new Set()))).toEqual(['cruz', 'ana', 'dela']);
  });
});

describe('groupBySection', () => {
  it('groups consecutive entries of the same section', () => {
    const entries = [
      { student: learner('a', 'A', 'M'), section: bonifacio },
      { student: learner('b', 'B', 'M'), section: rizal },
      { student: learner('c', 'C', 'F'), section: rizal },
    ];
    expect(groupBySection(entries).map((g) => [g.section.id, ids(g.entries)]))
      .toEqual([['bonifacio', ['a']], ['rizal', ['b', 'c']]]);
  });
});

describe('cardsLabel', () => {
  it('pluralises', () => {
    expect(cardsLabel(1)).toBe('1 card');
    expect(cardsLabel(0)).toBe('0 cards');
    expect(cardsLabel(81)).toBe('81 cards');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/idCardQueue.test.js`
Expected: FAIL with `Failed to load url ./idCardQueue.js` (or "Cannot find module").

- [ ] **Step 3: Export the roster comparator**

In `src/lib/roster.js`, change line 7 from:

```js
function byLastThenFirstName(a, b) {
```

to:

```js
export function byLastThenFirstName(a, b) {
```

- [ ] **Step 4: Write the implementation**

Create `src/lib/idCardQueue.js`:

```js
import { byLastThenFirstName } from './roster.js';

// A card is current only if it was printed for the learner's present LRN:
// the QR encodes the LRN, so a corrected LRN makes the old card wrong.
export function isIdCardPrinted(student) {
  return !!student?.idCard?.printedAt && student.idCard.lrn === student.lrn;
}

export const sectionShortLabel = (section) =>
  section ? [section.gradeLevel, section.name, section.strand].filter(Boolean).join(' · ') : '';

const SEX_RANK = { M: 0, F: 1 };
const sexRank = (student) => SEX_RANK[student.sex] ?? 2;

// Grade, then section, then DepEd order (males, then females, each by last
// then first name) -- the order a single-section print already uses.
export function sortIdCardBatch(entries) {
  return [...entries].sort((a, b) =>
    Number(a.section.gradeLevel) - Number(b.section.gradeLevel) ||
    a.section.name.localeCompare(b.section.name) ||
    a.section.id.localeCompare(b.section.id) ||
    sexRank(a.student) - sexRank(b.student) ||
    byLastThenFirstName(a.student, b.student));
}

export function buildIdCardQueue({ students, enrollments, sections, schoolYear }) {
  const studentById = new Map(students.map((s) => [s.id, s]));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const eligible = [];
  let missingLrnCount = 0;
  for (const enrollment of enrollments) {
    if (enrollment.schoolYear !== schoolYear || enrollment.status !== 'enrolled') continue;
    const student = studentById.get(enrollment.studentId);
    const section = sectionById.get(enrollment.sectionId);
    // An enrollment whose learner or section was deleted has no card to print.
    if (!student || !section) continue;
    if (!String(student.lrn ?? '').trim()) { missingLrnCount += 1; continue; }
    eligible.push({ student, section });
  }
  const sorted = sortIdCardBatch(eligible);
  return { eligible: sorted, queue: sorted.filter((e) => !isIdCardPrinted(e.student)), missingLrnCount };
}

// What the Print queue tab lists: everyone still unprinted plus anyone
// added by hand. `eligible` is already in print order, so filtering keeps it.
export const listQueueEntries = (eligible, addedIds) =>
  eligible.filter((e) => !isIdCardPrinted(e.student) || addedIds.has(e.student.id));

// Expects entries in print order (see sortIdCardBatch).
export function groupBySection(entries) {
  const groups = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last?.section.id === entry.section.id) last.entries.push(entry);
    else groups.push({ section: entry.section, entries: [entry] });
  }
  return groups;
}

export const cardsLabel = (n) => `${n} card${n === 1 ? '' : 's'}`;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/idCardQueue.test.js src/lib/roster.test.js`
Expected: PASS (all tests in both files).

- [ ] **Step 6: Commit**

```bash
git add src/lib/roster.js src/lib/idCardQueue.js src/lib/idCardQueue.test.js
git commit -m "feat(idcards): queue logic for unprinted learners" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Record printed cards (`src/data/idCards.js`)

**Files:**
- Create: `src/data/idCards.js`
- Test: `src/data/idCards.test.js`

**Interfaces:**
- Consumes: `db` from `src/firebase.js`.
- Produces: `markIdCardsPrinted(students: {id, lrn}[], me: {email}) → Promise<void>`. For each learner it writes `{ idCard: { printedAt: serverTimestamp(), printedBy: me.email, lrn: student.lrn } }` with merge, at most 500 per batch commit.

- [ ] **Step 1: Write the failing test**

Create `src/data/idCards.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => {
  const sets = [];
  const commit = vi.fn().mockResolvedValue(undefined);
  return {
    sets,
    commit,
    doc: vi.fn((_db, collectionName, id) => ({ path: `${collectionName}/${id}` })),
    writeBatch: vi.fn(() => ({ set: (...args) => sets.push(args), commit })),
    serverTimestamp: vi.fn(() => 'SERVER_TIME'),
  };
});

vi.mock('firebase/firestore', () => ({
  doc: firestore.doc,
  writeBatch: firestore.writeBatch,
  serverTimestamp: firestore.serverTimestamp,
}));
vi.mock('../firebase.js', () => ({ db: { kind: 'db' } }));

import { markIdCardsPrinted } from './idCards.js';

const me = { email: 'admin@bnhs.edu.ph' };

beforeEach(() => {
  firestore.sets.length = 0;
  firestore.commit.mockClear();
  firestore.writeBatch.mockClear();
});

describe('markIdCardsPrinted', () => {
  it('merges the printed mark, with the LRN that was printed, into each learner', async () => {
    await markIdCardsPrinted([{ id: 's1', lrn: '111' }, { id: 's2', lrn: '222' }], me);

    expect(firestore.sets).toEqual([
      [{ path: 'students/s1' }, { idCard: { printedAt: 'SERVER_TIME', printedBy: 'admin@bnhs.edu.ph', lrn: '111' } }, { merge: true }],
      [{ path: 'students/s2' }, { idCard: { printedAt: 'SERVER_TIME', printedBy: 'admin@bnhs.edu.ph', lrn: '222' } }, { merge: true }],
    ]);
    expect(firestore.commit).toHaveBeenCalledTimes(1);
  });

  it('splits more than 500 learners across batches', async () => {
    const students = Array.from({ length: 501 }, (_, i) => ({ id: `s${i}`, lrn: String(i) }));
    await markIdCardsPrinted(students, me);

    expect(firestore.writeBatch).toHaveBeenCalledTimes(2);
    expect(firestore.commit).toHaveBeenCalledTimes(2);
    expect(firestore.sets).toHaveLength(501);
  });

  it('writes nothing for an empty batch', async () => {
    await markIdCardsPrinted([], me);
    expect(firestore.commit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/idCards.test.js`
Expected: FAIL with "Failed to load url ./idCards.js".

- [ ] **Step 3: Write the implementation**

Create `src/data/idCards.js`:

```js
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

const BATCH_CHUNK_SIZE = 500; // Firestore's hard limit per writeBatch

// Records that each learner's card was printed for their current LRN;
// isIdCardPrinted in src/lib/idCardQueue.js reads it back.
export async function markIdCardsPrinted(students, me) {
  for (let i = 0; i < students.length; i += BATCH_CHUNK_SIZE) {
    const batch = writeBatch(db);
    students.slice(i, i + BATCH_CHUNK_SIZE).forEach((student) =>
      batch.set(doc(db, 'students', student.id),
        { idCard: { printedAt: serverTimestamp(), printedBy: me.email, lrn: student.lrn } },
        { merge: true }));
    await batch.commit();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/data/idCards.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/idCards.js src/data/idCards.test.js
git commit -m "feat(idcards): record printed cards on learners" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Per-card section line on printed sheets

**Files:**
- Modify: `src/pages/idCardPrintLayout.js:74` (the `.id-card-section` print rule)
- Modify: `src/pages/idCardPrintLayout.test.js:43`
- Modify: `src/components/IdCardsPrintable.jsx` (whole file)
- Modify: `src/pages/IDCardsPage.jsx:28-32,68` (pass entries)
- Modify: `src/pages/SectionsPage.jsx:138,216` (pass entries)

**Interfaces:**
- Consumes: `sectionShortLabel(section)` from Task 1.
- Produces: `IdCardsPrintSheets({ entries: {student, section}[], printOnly?: boolean })`, the default export of `src/components/IdCardsPrintable.jsx`. The `roster` and `section` props are removed.

**Why the line fits:** a row is 27 mm and the card's padding is 1 mm on each side, which leaves 25 mm.
- QR: 16 + 0.5 mm margin = 16.5 mm
- Name: 2 lines × 5 pt × 1.05 ≈ 3.7 mm
- LRN: 4.5 pt + 0.4 mm ≈ 2.0 mm
- New section line: 4 pt + 0.3 mm ≈ 1.7 mm

The total is ≈ 23.9 mm, so the QR stays at 16 mm.

- [ ] **Step 1: Update the layout test to expect the section line in print**

In `src/pages/idCardPrintLayout.test.js`, replace this line (line 43):

```js
    expect(ID_CARD_PRINT_STYLES).toContain('.id-card-section { display: none !important; }');
```

with:

```js
    expect(ID_CARD_PRINT_STYLES).not.toContain('.id-card-section { display: none !important; }');
    expect(ID_CARD_PRINT_STYLES).toMatch(/\.id-card-section\s*\{[^}]*font-size: 4pt !important;[^}]*\}/s);
    expect(ID_CARD_PRINT_STYLES).toMatch(/\.id-card-section\s*\{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;[^}]*\}/s);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/idCardPrintLayout.test.js`
Expected: FAIL in "generates the fixed A4 grid and compact card sizing" (the `not.toContain` assertion).

- [ ] **Step 3: Show the section line in print**

In `src/pages/idCardPrintLayout.js`, replace:

```js
    .id-card-section { display: none !important; }
```

with:

```js
    .id-card-section {
      width: 100%;
      overflow: hidden !important;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 4pt !important;
      line-height: 1 !important;
      margin-top: 0.3mm !important;
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pages/idCardPrintLayout.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Make the printable take entries**

Replace the whole of `src/components/IdCardsPrintable.jsx` with:

```jsx
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { fullName } from '../lib/roster.js';
import { sectionShortLabel } from '../lib/idCardQueue.js';
import { T } from '../styles.js';
import { ID_CARD_PRINT_STYLES, chunkIdCardsIntoSheets } from '../pages/idCardPrintLayout.js';

function IdCard({ student, section }) {
  const [qrSrc, setQrSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(student.lrn)
      .then((url) => { if (!cancelled) setQrSrc(url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [student.lrn]);

  return (
    <div className="id-card" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 16, textAlign: 'center', boxShadow: T.cardShadow }}>
      {qrSrc ? (
        <img className="id-card-qr" src={qrSrc} alt={`QR code for LRN ${student.lrn}`} width={140} height={140} style={{ display: 'block', margin: '0 auto 10px' }} />
      ) : failed ? (
        <div className="id-card-qr" style={{ width: 140, height: 140, margin: '0 auto 10px', display: 'grid', placeItems: 'center', border: `1px dashed ${T.border}`, borderRadius: 8 }}>
          <span style={{ ...T.num, fontSize: 11, color: T.inkMuted }}>QR unavailable</span>
        </div>
      ) : (
        <div className="id-card-qr" style={{ width: 140, height: 140, margin: '0 auto 10px' }} />
      )}
      <div className="id-card-name" style={{ fontFamily: T.body, fontWeight: 700, fontSize: 13, color: T.ink }}>{fullName(student)}</div>
      <div className="id-card-lrn" style={{ ...T.num, fontSize: 12, color: T.inkMuted, marginTop: 2 }}>{student.lrn}</div>
      <div className="id-card-section" style={{ fontFamily: T.body, fontSize: 11, color: T.inkMuted, marginTop: 2 }}>{sectionShortLabel(section)}</div>
    </div>
  );
}

// entries: [{ student, section }] in print order. A batch may mix sections.
export default function IdCardsPrintSheets({ entries, printOnly = false }) {
  const sheets = useMemo(() => chunkIdCardsIntoSheets(entries), [entries]);
  const gridClassName = printOnly ? 'id-cards-grid id-cards-print-only' : 'id-cards-grid';

  return (
    <>
      <style>{ID_CARD_PRINT_STYLES}</style>
      <div className={gridClassName} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
        {sheets.map((sheet, i) => (
          <div className="id-cards-sheet" key={i}>
            {sheet.map(({ student, section }) => <IdCard key={student.id} student={student} section={section} />)}
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 6: Update the ID Cards page caller**

In `src/pages/IDCardsPage.jsx`, directly after the `roster` `useMemo` (which ends `}, [enrollments, students, section]);`), add:

```jsx
  const entries = useMemo(() => roster.map((student) => ({ student, section })), [roster, section]);
```

and replace:

```jsx
        <div ref={printRoot}><IdCardsPrintSheets roster={roster} section={section} /></div>
```

with:

```jsx
        <div ref={printRoot}><IdCardsPrintSheets entries={entries} /></div>
```

- [ ] **Step 7: Update the Sections page caller**

In `src/pages/SectionsPage.jsx`, directly after this line:

```jsx
  const detailRosterDeped = useMemo(() => depedSort(detailRoster), [detailRoster]);
```

add:

```jsx
  const detailEntries = useMemo(() => detailRosterDeped.map((student) => ({ student, section: detailSection })), [detailRosterDeped, detailSection]);
```

and replace:

```jsx
      {detailSection && <div ref={printRoot}><IdCardsPrintSheets section={detailSection} roster={detailRosterDeped} printOnly /></div>}
```

with:

```jsx
      {detailSection && <div ref={printRoot}><IdCardsPrintSheets entries={detailEntries} printOnly /></div>}
```

- [ ] **Step 8: Verify that nothing else uses the old props, then run tests and build**

Run: `git grep -n "IdCardsPrintSheets" -- src`
Expected: only the definition and the two `entries={...}` call sites.

Run: `npm test`
Expected: all test files pass.

Run: `npm run build`
Expected: `✓ built in …` with no errors.

- [ ] **Step 9: Commit**

```bash
git add src/pages/idCardPrintLayout.js src/pages/idCardPrintLayout.test.js src/components/IdCardsPrintable.jsx src/pages/IDCardsPage.jsx src/pages/SectionsPage.jsx
git commit -m "feat(idcards): print each card's section line; printable takes entries" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Print-then-confirm hook

**Files:**
- Modify: `src/components/ui.jsx` (the `Confirm` component)
- Create: `src/components/IdCardPrintConfirm.jsx`

**Interfaces:**
- Consumes: `markIdCardsPrinted(students, me)` (Task 2), `cardsLabel(n)` (Task 1), `isAdmin(me)` from `src/lib/access.js`, and `Confirm` from `src/components/ui.jsx`.
- Produces: `useIdCardPrintConfirm(me, { onMarked } = {}) → { printAndConfirm(students: object[]): void, confirmDialog: ReactNode }`. Callers render `{confirmDialog}` somewhere in their tree.
  - `printAndConfirm` calls `window.print()`. If `isAdmin(me)` and the batch is not empty, it then opens the dialog.
  - "Yes" awaits `markIdCardsPrinted`, closes the dialog, and calls `onMarked`.
  - If the write fails, `Confirm` keeps the dialog open with "The action could not be completed. Please try again.", and the "Yes" button retries.
  - "No" closes with no change.
- Produces: `Confirm` accepts `cancelLabel` (default `'Cancel'`).

- [ ] **Step 1: Add `cancelLabel` to `Confirm`**

In `src/components/ui.jsx`, change the `Confirm` signature from:

```jsx
export function Confirm({ message, onYes, onNo, label = 'Delete', danger = true, title = 'Confirm action' }) {
```

to:

```jsx
export function Confirm({ message, onYes, onNo, label = 'Delete', cancelLabel = 'Cancel', danger = true, title = 'Confirm action' }) {
```

and inside it change:

```jsx
      <Btn disabled={pending} variant="ghost" onClick={onNo}>Cancel</Btn>
```

to:

```jsx
      <Btn disabled={pending} variant="ghost" onClick={onNo}>{cancelLabel}</Btn>
```

- [ ] **Step 2: Create the hook**

Create `src/components/IdCardPrintConfirm.jsx`:

```jsx
import { useState } from 'react';
import { Confirm } from './ui.jsx';
import { isAdmin } from '../lib/access.js';
import { cardsLabel } from '../lib/idCardQueue.js';
import { markIdCardsPrinted } from '../data/idCards.js';

// Browsers don't report whether the printer actually printed, so after the
// print dialog closes the person at the printer says whether the cards came
// out right. Only admins can write learner records, so only they are asked.
export function useIdCardPrintConfirm(me, { onMarked } = {}) {
  const [batch, setBatch] = useState(null);

  const printAndConfirm = (students) => {
    window.print();
    if (isAdmin(me) && students.length > 0) setBatch(students);
  };

  const confirmDialog = batch && (
    <Confirm
      title="Mark as printed?"
      danger={false}
      message={batch.length === 1 ? 'Did this card print correctly?' : `Did these ${cardsLabel(batch.length)} print correctly?`}
      label="Yes, mark as printed"
      cancelLabel="No, don't mark"
      onYes={async () => { await markIdCardsPrinted(batch, me); setBatch(null); onMarked?.(); }}
      onNo={() => setBatch(null)}
    />
  );

  return { printAndConfirm, confirmDialog };
}
```

- [ ] **Step 3: Run tests and build**

Run: `npm test`
Expected: all test files pass. Existing `Confirm` callers keep the default "Cancel" label.

Run: `npm run build`
Expected: `✓ built in …` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui.jsx src/components/IdCardPrintConfirm.jsx
git commit -m "feat(idcards): ask after printing before marking cards printed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Print queue tab

**Files:**
- Create: `src/pages/idCards/PrintQueueTab.jsx`

**Interfaces:**
- Consumes:
  - `buildIdCardQueue`, `listQueueEntries`, `groupBySection`, `isIdCardPrinted`, `cardsLabel` (Task 1)
  - `markIdCardsPrinted` (Task 2)
  - `IdCardsPrintSheets({ entries, printOnly })` (Task 3)
  - `useIdCardPrintConfirm` (Task 4)
  - `learnerMatches(query, student, { includeLrn: true })` from `src/lib/search.js`
  - `usePrintReadiness(ref, key, count)` from `src/hooks/usePrintReadiness.js`
  - `ID_CARD_PRINT_LAYOUT.cardsPerSheet` from `src/pages/idCardPrintLayout.js`
- Produces: default export `PrintQueueTab({ me, students, enrollments, sections, schoolYear })`. Task 6 mounts it.

**Behavior notes for the implementer:**
- **State:** `addedIds` holds learners added by search. `excludedIds` holds learners who are listed but unticked. Both are sets of student ids, so live data updates can't desync them (marked learners simply drop out of `listed`).
- **Printing:** the screen UI is wrapped in `className="id-cards-controls"`, which the existing print CSS hides. The cards print from a `printOnly` sheet.
- **Reset:** after a successful mark, both sets are cleared.

- [ ] **Step 1: Create the component**

Create `src/pages/idCards/PrintQueueTab.jsx`:

```jsx
import { useMemo, useRef, useState } from 'react';
import { usePrintReadiness } from '../../hooks/usePrintReadiness.js';
import { Btn, Inp, Field, Card, EmptyState, Confirm } from '../../components/ui.jsx';
import IdCardsPrintSheets from '../../components/IdCardsPrintable.jsx';
import { useIdCardPrintConfirm } from '../../components/IdCardPrintConfirm.jsx';
import { markIdCardsPrinted } from '../../data/idCards.js';
import { buildIdCardQueue, listQueueEntries, groupBySection, isIdCardPrinted, cardsLabel } from '../../lib/idCardQueue.js';
import { ID_CARD_PRINT_LAYOUT } from '../idCardPrintLayout.js';
import { learnerMatches } from '../../lib/search.js';
import { fullName } from '../../lib/roster.js';
import { T } from '../../styles.js';

const sectionLabel = (s) => `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}`;
const SEARCH_LIMIT = 8;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const reprintTag = { fontSize: 11, fontWeight: 600, color: T.primary, border: `1px solid ${T.primary}`, borderRadius: T.pill, padding: '1px 8px' };

export default function PrintQueueTab({ me, students, enrollments, sections, schoolYear }) {
  const { eligible, queue, missingLrnCount } = useMemo(
    () => buildIdCardQueue({ students, enrollments, sections, schoolYear }),
    [students, enrollments, sections, schoolYear]);
  const [addedIds, setAddedIds] = useState(() => new Set());
  const [excludedIds, setExcludedIds] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [confirmMark, setConfirmMark] = useState(false);

  const listed = useMemo(() => listQueueEntries(eligible, addedIds), [eligible, addedIds]);
  const listedIds = useMemo(() => new Set(listed.map((e) => e.student.id)), [listed]);
  const groups = useMemo(() => groupBySection(listed), [listed]);
  const batch = useMemo(() => listed.filter((e) => !excludedIds.has(e.student.id)), [listed, excludedIds]);
  const batchStudents = useMemo(() => batch.map((e) => e.student), [batch]);
  const results = useMemo(() => (query.trim()
    ? eligible.filter((e) => !listedIds.has(e.student.id) && learnerMatches(query, e.student, { includeLrn: true })).slice(0, SEARCH_LIMIT)
    : []), [eligible, listedIds, query]);

  const reset = () => { setAddedIds(new Set()); setExcludedIds(new Set()); };
  const { printAndConfirm, confirmDialog } = useIdCardPrintConfirm(me, { onMarked: reset });

  const setTicked = (ids, ticked) => setExcludedIds((prev) => {
    const next = new Set(prev);
    ids.forEach((id) => (ticked ? next.delete(id) : next.add(id)));
    return next;
  });
  const add = (id) => { setAddedIds((prev) => new Set(prev).add(id)); setTicked([id], true); setQuery(''); };
  const remove = (id) => { setAddedIds((prev) => { const next = new Set(prev); next.delete(id); return next; }); setTicked([id], true); };

  const printRoot = useRef(null);
  const printKey = batch.map((e) => e.student.id + e.student.lrn + e.section.id).join(',');
  const printReady = usePrintReadiness(printRoot, printKey, batch.length);
  const sheets = Math.ceil(batch.length / ID_CARD_PRINT_LAYOUT.cardsPerSheet);

  return (
    <>
      <div className="id-cards-controls">
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ margin: '0 0 12px', fontFamily: T.body, color: T.ink, fontSize: 14 }}>
            <strong>{queue.length}</strong> {queue.length === 1 ? 'learner' : 'learners'} not yet printed
          </p>
          {missingLrnCount > 0 && (
            <p style={{ margin: '0 0 12px', fontFamily: T.body, color: T.inkMuted, fontSize: 13 }}>
              {plural(missingLrnCount, 'learner has', 'learners have')} no LRN and can't be printed.
            </p>
          )}
          <Field label="Add a learner (reprint or extra card)">
            <Inp value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or LRN" />
          </Field>
          {results.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {results.map(({ student, section }) => (
                <li key={student.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontFamily: T.body, fontSize: 13 }}>
                  <span style={{ flex: 1 }}>
                    <strong>{fullName(student)}</strong>{' '}
                    <span style={{ ...T.num, color: T.inkMuted }}>{student.lrn}</span>{' '}
                    <span style={{ color: T.inkMuted }}>· {sectionLabel(section)}</span>
                  </span>
                  <Btn variant="ghost" onClick={() => add(student.id)} aria-label={`Add ${fullName(student)}`}>Add</Btn>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && results.length === 0 && (
            <p style={{ margin: 0, fontFamily: T.body, color: T.inkMuted, fontSize: 13 }}>No other enrolled learner matches “{query.trim()}”.</p>
          )}
        </Card>

        {listed.length === 0 ? (
          <Card style={{ padding: 20 }}>
            <EmptyState title="Every enrolled learner has a printed card" hint="Search above to add a learner who needs a reprint." />
          </Card>
        ) : groups.map(({ section, entries }) => {
          const ids = entries.map((e) => e.student.id);
          const ticked = ids.filter((id) => !excludedIds.has(id)).length;
          return (
            <Card key={section.id} style={{ padding: 16, marginBottom: 12, fontFamily: T.body, color: T.ink }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 14 }}>
                <input type="checkbox" checked={ticked === ids.length}
                  ref={(node) => { if (node) node.indeterminate = ticked > 0 && ticked < ids.length; }}
                  onChange={(e) => setTicked(ids, e.target.checked)} />
                {sectionLabel(section)} · {ticked} of {ids.length}
              </label>
              <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                {entries.map(({ student }) => (
                  <li key={student.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 4px 24px', fontSize: 13 }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
                      <input type="checkbox" checked={!excludedIds.has(student.id)} onChange={(e) => setTicked([student.id], e.target.checked)} />
                      <span>{fullName(student)}</span>
                      <span style={{ ...T.num, color: T.inkMuted, fontSize: 12 }}>{student.lrn}</span>
                      {isIdCardPrinted(student) && <span style={reprintTag}>Reprint</span>}
                    </label>
                    {addedIds.has(student.id) && (
                      <Btn variant="ghost" onClick={() => remove(student.id)} aria-label={`Remove ${fullName(student)}`}>Remove</Btn>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}

        {listed.length > 0 && (
          <Card style={{ position: 'sticky', bottom: 0, padding: '12px 20px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', fontFamily: T.body }}>
            <span style={{ fontWeight: 600, color: T.ink }}>{cardsLabel(batch.length)} · {plural(sheets, 'sheet', 'sheets')}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn variant="ghost" disabled={batch.length === 0} onClick={() => setConfirmMark(true)}>Mark as printed without printing</Btn>
              <Btn disabled={batch.length === 0 || !printReady} onClick={() => printAndConfirm(batchStudents)}>
                {batch.length === 0 || printReady ? 'Print' : 'Preparing QR codes…'}
              </Btn>
            </div>
          </Card>
        )}
      </div>

      {batch.length > 0 && <div ref={printRoot}><IdCardsPrintSheets entries={batch} printOnly /></div>}
      {confirmDialog}
      {confirmMark && (
        <Confirm
          title="Mark without printing?"
          danger={false}
          label="Mark as printed"
          message={`Mark ${plural(batch.length, 'learner', 'learners')} as printed? They will leave the queue.`}
          onYes={async () => { await markIdCardsPrinted(batchStudents, me); setConfirmMark(false); reset(); }}
          onNo={() => setConfirmMark(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Check that it compiles**

Nothing imports the tab until Task 6, so a plain build would skip it. Have Vite build it as its own entry, with the output going to a scratch folder:

Run: `npx vite build --emptyOutDir --outDir node_modules/.tmp-queue-check --ssr src/pages/idCards/PrintQueueTab.jsx`
Expected: `✓ built in …` with no errors. Then delete the scratch output: `rm -rf node_modules/.tmp-queue-check`.

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/idCards/PrintQueueTab.jsx
git commit -m "feat(idcards): print queue tab merging unprinted learners across sections" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ID Cards page tabs (and By section confirm)

**Files:**
- Create: `src/pages/idCards/BySectionTab.jsx`
- Modify: `src/pages/IDCardsPage.jsx` (whole file)
- Modify: `src/App.jsx:136`

**Interfaces:**
- Consumes: `PrintQueueTab` (Task 5), `useIdCardPrintConfirm` (Task 4), `IdCardsPrintSheets({ entries })` (Task 3).
- Produces:
  - `BySectionTab({ me, students, enrollments, sections, schoolYear })`
  - `IDCardsPage({ me, schoolYear })`
  - The tab is stored in `localStorage` under the key `sims.idCards.tab`, with values `'section'` or `'queue'`.

- [ ] **Step 1: Move today's section view into `BySectionTab`**

Create `src/pages/idCards/BySectionTab.jsx`:

```jsx
import { useMemo, useRef, useState } from 'react';
import { usePrintReadiness } from '../../hooks/usePrintReadiness.js';
import { depedSort } from '../../lib/roster.js';
import { Sel, Field, Btn, Card, EmptyState } from '../../components/ui.jsx';
import IdCardsPrintSheets from '../../components/IdCardsPrintable.jsx';
import { useIdCardPrintConfirm } from '../../components/IdCardPrintConfirm.jsx';

const sectionLabel = (s) => s ? `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}` : '—';

export default function BySectionTab({ me, students, enrollments, sections, schoolYear }) {
  const sectionsSY = useMemo(() =>
    sections
      .filter((s) => s.schoolYear === schoolYear)
      .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)),
    [sections, schoolYear]);

  const [sectionId, setSectionId] = useState('');
  const section = sectionsSY.find((s) => s.id === sectionId) || null;

  const roster = useMemo(() => {
    if (!section) return [];
    const ids = new Set(enrollments.filter((e) => e.sectionId === section.id && e.status === 'enrolled').map((e) => e.studentId));
    return depedSort(students.filter((s) => ids.has(s.id)));
  }, [enrollments, students, section]);
  const entries = useMemo(() => roster.map((student) => ({ student, section })), [roster, section]);

  const printRoot = useRef(null);
  const printKey = (section?.id || '') + ':' + roster.map(s => s.id + s.lrn).join(',');
  const printReady = usePrintReadiness(printRoot, printKey, roster.length);
  const { printAndConfirm, confirmDialog } = useIdCardPrintConfirm(me);

  return (
    <>
      <Card className="id-cards-controls" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 'min(260px, 100%)' }}>
            <Field label="Section">
              <Sel value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="">Choose a section…</option>
                {sectionsSY.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
              </Sel>
            </Field>
          </div>
          {section && roster.length > 0 && (
            <div style={{ marginBottom: 12 }}><Btn disabled={!printReady} onClick={() => printAndConfirm(roster)}>{printReady ? 'Print' : 'Preparing QR codes…'}</Btn></div>
          )}
        </div>
      </Card>

      {!section ? (
        <Card style={{ padding: 20 }}><EmptyState title="Pick a section" hint="Choose a section above to generate ID cards for its enrolled learners." /></Card>
      ) : roster.length === 0 ? (
        <Card style={{ padding: 20 }}><EmptyState title="No learners enrolled here yet" hint="Enroll learners into this section on the Enrollment page first." /></Card>
      ) : (
        <div ref={printRoot}><IdCardsPrintSheets entries={entries} /></div>
      )}
      {confirmDialog}
    </>
  );
}
```

- [ ] **Step 2: Turn `IDCardsPage` into the tabbed shell**

Replace the whole of `src/pages/IDCardsPage.jsx` with:

```jsx
import { useState } from 'react';
import { useCollectionResource } from '../hooks/useCollection.js';
import { ResourceState } from '../components/ui.jsx';
import { S } from '../styles.js';
import BySectionTab from './idCards/BySectionTab.jsx';
import PrintQueueTab from './idCards/PrintQueueTab.jsx';

const TABS = [['section', 'By section'], ['queue', 'Print queue']];
const STORAGE = 'sims.idCards.tab';
const readTab = () => {
  try { const v = localStorage.getItem(STORAGE); return TABS.some(([k]) => k === v) ? v : 'section'; }
  catch { return 'section'; }
};

export default function IDCardsPage({ me, schoolYear }) {
  const sectionsResource = useCollectionResource('sections');
  const enrollmentsResource = useCollectionResource('enrollments');
  const studentsResource = useCollectionResource('students');
  const [tab, setTabState] = useState(readTab);
  const setTab = (next) => {
    setTabState(next);
    try { localStorage.setItem(STORAGE, next); } catch { /* the tab still switches without storage */ }
  };

  const resources = [sectionsResource, enrollmentsResource, studentsResource];
  if (resources.some(r => r.loading || r.error)) return <ResourceState resources={resources}/>;
  const data = { me, schoolYear, sections: sectionsResource.data, enrollments: enrollmentsResource.data, students: studentsResource.data };

  return (
    <div>
      <div className="id-cards-heading" style={S.plate}>
        <h1 style={S.h1}>ID Cards</h1>
      </div>

      <div className="id-cards-controls sims-tabs" role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {TABS.map(([k, label]) => {
          const active = tab === k;
          return <button key={k} role="tab" className="sims-tab" id={`id-cards-tab-${k}`}
            aria-selected={active} aria-controls={`id-cards-panel-${k}`} tabIndex={active ? 0 : -1}
            onClick={() => setTab(k)} onKeyDown={event => {
              const index = TABS.findIndex(([key]) => key === k);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 :
                event.key === 'ArrowRight' ? (index + 1) % TABS.length :
                event.key === 'ArrowLeft' ? (index - 1 + TABS.length) % TABS.length : null;
              if (next === null) return;
              event.preventDefault(); setTab(TABS[next][0]);
              document.getElementById(`id-cards-tab-${TABS[next][0]}`)?.focus();
            }}>{label}</button>;
        })}
      </div>

      <div role="tabpanel" id={`id-cards-panel-${tab}`} aria-labelledby={`id-cards-tab-${tab}`}>
        {tab === 'section' ? <BySectionTab {...data} /> : <PrintQueueTab {...data} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Pass `me` from `App.jsx`**

In `src/App.jsx`, change:

```jsx
          {shown==='idcards' && <IDCardsPage schoolYear={schoolYear} />}
```

to:

```jsx
          {shown==='idcards' && <IDCardsPage me={me} schoolYear={schoolYear} />}
```

- [ ] **Step 4: Run tests and build**

Run: `npm test`
Expected: all test files pass.

Run: `npm run build`
Expected: `✓ built in …` with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/idCards/BySectionTab.jsx src/pages/IDCardsPage.jsx src/App.jsx
git commit -m "feat(idcards): By section and Print queue tabs; section print asks to mark" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Section detail modal print asks admins to mark

**Files:**
- Modify: `src/pages/SectionDetailModal.jsx:7,16`
- Modify: `src/pages/SectionsPage.jsx` (hook + `onPrint` + render dialog)

**Interfaces:**
- Consumes: `useIdCardPrintConfirm(me)` (Task 4).
- Produces: `SectionDetailModal` accepts `onPrint` (default `() => window.print()`).

- [ ] **Step 1: Let the modal take a print handler**

In `src/pages/SectionDetailModal.jsx`, change:

```jsx
export default function SectionDetailModal({ section, roster, onClose, onEditStudent, printReady = false }) {
```

to:

```jsx
export default function SectionDetailModal({ section, roster, onClose, onEditStudent, printReady = false, onPrint = () => window.print() }) {
```

and change:

```jsx
          <Btn onClick={() => window.print()} disabled={!printReady}>
```

to:

```jsx
          <Btn onClick={onPrint} disabled={!printReady}>
```

- [ ] **Step 2: Wire the hook into `SectionsPage`**

In `src/pages/SectionsPage.jsx`:

1. Add the import after the `IdCardsPrintSheets` import:

```jsx
import { useIdCardPrintConfirm } from '../components/IdCardPrintConfirm.jsx';
```

2. Directly after this line:

```jsx
  const printReady = usePrintReadiness(printRoot, printKey, detailRosterDeped.length);
```

add:

```jsx
  const { printAndConfirm, confirmDialog } = useIdCardPrintConfirm(me);
```

3. Replace:

```jsx
        <SectionDetailModal printReady={printReady}
```

with:

```jsx
        <SectionDetailModal printReady={printReady} onPrint={() => printAndConfirm(detailRosterDeped)}
```

4. Directly after the line that renders the print-only sheets (`{detailSection && <div ref={printRoot}>…</div>}`), add:

```jsx
      {confirmDialog}
```

- [ ] **Step 3: Run tests and build**

Run: `npm test`
Expected: all test files pass.

Run: `npm run build`
Expected: `✓ built in …` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SectionDetailModal.jsx src/pages/SectionsPage.jsx
git commit -m "feat(idcards): section detail print asks admins to mark cards printed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Browser regressions

**Files:**
- Modify: `tests/browser/registrar-fixture.js` (two learners get `idCard`)
- Modify: `tests/browser/registrar-recovery.jsx` (import + 4 tests + `waitFor` helper)
- Modify: `tests/browser/README.md` (PASS count and coverage line)

**Interfaces:**
- Consumes: `IDCardsPage({ me, schoolYear })` (Task 6), `SectionsPage` with `me` (Task 7). In this harness, `src/data/*.js` exports are stubbed to `async () => ({})` by `tests/browser/registrar.config.mjs`, so "Yes, mark as printed" resolves without Firebase.

**Fixture facts:**
- 8 sections (`Acacia`…`Hope`): 2 per grade for grades 7–10. `sec0` = Acacia (grade 7).
- Learners `s0`–`s115` are enrolled, round-robin across `sec0`–`sec7`.
- After this task, `s0` is printed for its current LRN and `s1` was printed with an old LRN. That makes the queue 115 learners → `115 cards · 2 sheets`, across all 8 sections.

- [ ] **Step 1: Mark two fixture learners**

In `tests/browser/registrar-fixture.js`, directly after the line that defines `const students=Array.from({length:128},…);`, add:

```js
students[0].idCard={printedAt:{seconds:1},printedBy:'fixture@bnhs',lrn:students[0].lrn};
students[1].idCard={printedAt:{seconds:1},printedBy:'fixture@bnhs',lrn:'000000000000'};
```

- [ ] **Step 2: Add the tests**

In `tests/browser/registrar-recovery.jsx`:

1. Add `IDCardsPage` to the imports by appending this to the end of line 2:

```js
import IDCardsPage from '/src/pages/IDCardsPage.jsx';
```

2. After the `fill` helper (line 8), add:

```js
const waitFor=async(check,message,ms=8000)=>{const end=Date.now()+ms;while(!check()){if(Date.now()>end)throw Error(message);await act(async()=>new Promise(r=>setTimeout(r,50)))}};
const admin={role:'admin',email:'admin@bnhs'};
const openQueue=async()=>{try{localStorage.removeItem('sims.idCards.tab')}catch{}await scenario('normal');await render(<IDCardsPage me={admin} schoolYear="2026-2027"/>);await click(button('Print queue'));};
const dialogText=()=>[...host.querySelectorAll('dialog[open]')].map(d=>d.textContent).join(' ');
const stubPrint=()=>{const real=window.print;let calls=0;window.print=()=>{calls++};return{calls:()=>calls,restore:()=>{window.print=real}}};
```

3. Append these four entries to the `tests` array, before its closing `];`:

```js
,['Print queue merges unprinted learners from every section onto shared sheets',async()=>{await openQueue();
  assert(host.textContent.includes('115 learners not yet printed'),'Queue count wrong: expected 115 (s0 printed, s1 stale LRN)');
  const cards=host.querySelectorAll('.id-cards-print-only .id-card');assert(cards.length===115,'Print sheet has '+cards.length+' cards, expected 115');
  assert(host.querySelectorAll('.id-cards-print-only .id-cards-sheet').length===2,'Expected 115 cards on 2 sheets');
  const labels=new Set([...host.querySelectorAll('.id-cards-print-only .id-card-section')].map(n=>n.textContent));assert(labels.size===8,'Expected cards from 8 sections, got '+labels.size);
  assert(host.querySelector('.id-cards-print-only .id-card-section').textContent==='7 · Acacia','First card is not grade 7 Acacia');
  assert(host.textContent.includes('115 cards · 2 sheets'),'Action bar summary missing');}]
,['Printing the queue asks before marking, and both answers close the dialog',async()=>{const print=stubPrint();try{await openQueue();
  await waitFor(()=>button('Print')&&!button('Print').disabled,'Print never became ready');
  await click(button('Print'));assert(print.calls()===1,'window.print not called');
  assert(dialogText().includes('Did these 115 cards print correctly?'),'Confirm dialog missing after print');
  await click(button("No, don't mark"));assert(!dialogText().includes('print correctly'),'Dialog stayed open after No');
  await click(button('Print'));await click(button('Yes, mark as printed'));
  await waitFor(()=>!dialogText().includes('print correctly'),'Dialog stayed open after Yes');}finally{print.restore()}}]
,['Mark as printed without printing asks first',async()=>{await openQueue();
  await click(button('Mark as printed without printing'));
  assert(dialogText().includes('Mark 115 learners as printed? They will leave the queue.'),'Mark-without-printing confirm missing');
  await click(button('Cancel'));assert(!host.querySelector('dialog[open]'),'Confirm stayed open after Cancel');}]
,['Coordinator section print never asks to mark',async()=>{const print=stubPrint();try{await scenario('normal');
  await render(<SectionsPage me={{role:'jhs_coord'}} schoolYear="2026-2027"/>);
  await click(host.querySelector('button[aria-label="View Acacia section details"]'));
  await waitFor(()=>button('Print QR Codes')&&!button('Print QR Codes').disabled,'Section print never became ready');
  await click(button('Print QR Codes'));assert(print.calls()===1,'window.print not called');
  assert(!dialogText().includes('print correctly'),'Coordinator was asked to mark cards');}finally{print.restore()}}]
```

- [ ] **Step 3: Update the README**

In `tests/browser/README.md`, change:

```
The visible result must show five PASS lines.
```

to:

```
The visible result must show nine PASS lines.
```

and change:

```
Covers learner/section/schedule draft retention on retrieval error, keyboard section access, and QR readiness on DOM detachment/remount.
```

to:

```
Covers learner/section/schedule draft retention on retrieval error, keyboard section access, QR readiness on DOM detachment/remount, the ID card print queue (merged sheets, confirm-after-print, mark without printing), and coordinators never being asked to mark cards.
```

- [ ] **Step 4: Run the browser suite**

Start the harness server in the background:

```bash
npm exec vite -- --config tests/browser/registrar.config.mjs
```

Open `http://127.0.0.1:5187/tests/browser/registrar-recovery.html` in the Browser pane. Wait until `#results[data-done="true"]` appears, then read the page text.
Expected: nine lines starting with `PASS`, and no `FAIL`. Stop the server afterwards.

If "Coordinator section print never asks to mark" fails because `View Acacia section details` is missing, check that `SectionsPage` with a `jhs_coord` profile shows grade 7 first (`scopeRoster` limits it to grades 7–10, and Acacia is grade 7).

- [ ] **Step 5: Commit**

```bash
git add tests/browser/registrar-fixture.js tests/browser/registrar-recovery.jsx tests/browser/README.md
git commit -m "test(browser): ID card print queue and confirm-after-print regressions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Final verification

**Files:** none changed unless a check fails.

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: every file passes. The count is the 137 from before this work plus the new tests from Tasks 1–2.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: `✓ built in …`. The ID Cards page chunk still builds as its own lazy chunk.

- [ ] **Step 3: Print preview check in the browser harness**

With the harness from Task 8 running, open the Print queue in a scratch page, or reuse the test page before cleanup. Then use the browser's print preview (Ctrl+P → Save as PDF):
- Page 1 has a full 8 × 10 grid.
- Page 2 has 35 cards.
- Each card shows QR, name, LRN, and a section line, all inside its cell.
- There is no blank third page.

- [ ] **Step 4: Report the manual checks for the user**

Tell the user these can't be automated here and need to be done on the real system after deploy:
1. As an admin, open ID Cards → Print queue. It lists everyone (no learner is marked yet). Select the sections already printed in the past, then click **Mark as printed without printing**.
2. Print a small mixed batch on the real printer. Check that the section line is readable at 4 pt and that the QR still scans at the gate kiosk.
3. Answer **Yes**. The learners leave the queue, and their `students/{id}` records show `idCard.printedAt`, `printedBy`, and `lrn` in the Firebase console.
