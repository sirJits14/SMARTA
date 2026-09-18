# Section Detail Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a section row on the Sections page opens a modal showing that section's enrolled students in alphabetical order, each with an Edit action, plus a "Print QR Codes" button that prints that section's ID cards without navigating to the ID Cards page.

**Architecture:** A new `SectionDetailModal` component (reusing the existing `Modal`/`StudentForm` primitives) renders the on-screen roster + edit affordance. The ID-card-rendering logic currently embedded in `IDCardsPage.jsx` is extracted into a shared `IdCardsPrintSheets` component so both the ID Cards page and the new modal can render identical printable sheets from a `roster`+`section` pair. The extracted component gains a `printOnly` mode: the sheets mount in the DOM (so the browser's native `window.print()` can find and paginate them) but stay `display:none` on screen, revealed only under `@media print` — this is how printing works from inside a modal without also printing the modal's dialog chrome or showing a stray card grid behind it on screen. The `Modal` primitive gains an `overlayClassName` prop so the print stylesheet can hide the section-detail dialog specifically when printing.

**Tech Stack:** React (function components + hooks), Vitest for unit tests, existing `qrcode` package (unchanged), existing print-CSS approach from `idCardPrintLayout.js`. No new dependencies.

## Global Constraints

- The on-screen roster inside the new modal is sorted **purely alphabetically** (last name, then first name — no grouping by sex). This is a new, distinct sort from the existing `depedSort` (which groups males-then-females), per the user's explicit request for "Alphabetical Order."
- Printed QR cards keep using `depedSort` (the existing DepEd-convention ordering already used by `IDCardsPage.jsx` for printed materials) — only the on-screen list in the new modal uses the new alphabetical sort. Do not change what `IDCardsPage.jsx` prints.
- "Edit details" reuses the existing `StudentForm` component exactly as `StudentsPage.jsx` already does — do not build a second student-edit form.
- Printing must work from inside the new modal without navigating to the ID Cards tab — the printable sheets render into the DOM as a sibling of the modal (not nested inside it), gated by the same `printOnly` visibility mechanism described above.
- No new automated coverage exists for React page/component rendering in this codebase (only pure functions in `src/lib/*.js` and `src/pages/idCardPrintLayout.js` have `.test.js` files) — this plan follows that existing convention. New pure-logic additions (the alphabetical sort, the CSS string additions) get tests; new page/component JSX is verified via the full existing test suite (regression) + a production build + a manual browser check in the final task.

---

### Task 1: `alphabeticalSort` in roster.js

**Files:**
- Modify: `src/lib/roster.js`
- Test: `src/lib/roster.test.js`

**Interfaces:**
- Produces: `alphabeticalSort(students) => Array` — exported from `src/lib/roster.js`. Consumed by `SectionsPage.jsx` in Task 6.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/roster.test.js` (after the existing `import` line, update it, and add a new `describe` block after the `depedSort` block):

Change the import line from:
```js
import { fullName, depedSort } from './roster.js';
```
to:
```js
import { fullName, depedSort, alphabeticalSort } from './roster.js';
```

Add this new `describe` block at the end of the file:
```js
describe('alphabeticalSort', () => {
  it('orders purely alphabetically by last name then first name, ignoring sex', () => {
    const input = [
      { lastName: 'Santos', firstName: 'Maria', sex: 'F' },
      { lastName: 'Bautista', firstName: 'Pedro', sex: 'M' },
      { lastName: 'Aquino', firstName: 'Rosa', sex: 'F' },
      { lastName: 'Bautista', firstName: 'Andres', sex: 'M' },
    ];
    expect(alphabeticalSort(input).map(s => s.firstName)).toEqual(['Rosa', 'Andres', 'Pedro', 'Maria']);
  });
  it('does not mutate input', () => {
    const input = [{ lastName: 'B', firstName: 'B' }, { lastName: 'A', firstName: 'A' }];
    const copy = [...input];
    alphabeticalSort(input);
    expect(input).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/roster.test.js`
Expected: FAIL — `alphabeticalSort is not a function` (or similar import error).

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/roster.js`, after the existing `depedSort` function:

```js
export function alphabeticalSort(students) {
  return [...students].sort((a, b) =>
    a.lastName.localeCompare(b.lastName, 'en', { sensitivity: 'base' }) ||
    a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' })
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/roster.test.js`
Expected: PASS (4 tests: 2 existing `fullName`/`depedSort` groups untouched, plus the 2 new `alphabeticalSort` tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/roster.js src/lib/roster.test.js
git commit -m "feat: add alphabeticalSort for section roster views"
```

---

### Task 2: `overlayClassName` prop on `Modal`

**Files:**
- Modify: `src/components/ui.jsx`

**Interfaces:**
- Produces: `Modal` now accepts an optional `overlayClassName` prop (string, default `''`), applied as the `className` of the fixed-position overlay `<div>`. Consumed by `SectionDetailModal.jsx` in Task 5, which passes `overlayClassName="section-detail-modal-overlay"` so the print stylesheet (Task 3) can target and hide it.

- [ ] **Step 1: Add the prop**

In `src/components/ui.jsx`, change:

```js
export const Modal = ({ children, onClose, width = 520 }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(30,27,51,0.45)',
    display: 'grid', placeItems: 'center', zIndex: 50 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, borderRadius: T.radius, padding: 24,
      width, maxWidth: '92vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(30,27,51,0.25)' }}>{children}</div>
  </div>
);
```

to:

```js
export const Modal = ({ children, onClose, width = 520, overlayClassName = '' }) => (
  <div onClick={onClose} className={overlayClassName} style={{ position: 'fixed', inset: 0, background: 'rgba(30,27,51,0.45)',
    display: 'grid', placeItems: 'center', zIndex: 50 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ background: T.surface, borderRadius: T.radius, padding: 24,
      width, maxWidth: '92vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(30,27,51,0.25)' }}>{children}</div>
  </div>
);
```

Every existing `<Modal>` caller (`StudentForm.jsx`, `SectionForm` in `SectionsPage.jsx`, `Confirm` in `ui.jsx`, etc.) omits `overlayClassName`, so it defaults to `''` and renders `className=""` — a no-op, identical to today's output. No other file needs to change in this task.

- [ ] **Step 2: Verify by hand**

Run: `npx vitest run` (full suite) — should stay pristine, same count as before this task.
Run: `npm run build` — should succeed with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui.jsx
git commit -m "feat: let Modal take an overlayClassName for targeted print hiding"
```

---

### Task 3: Print-only visibility + modal-overlay-hide CSS

**Files:**
- Modify: `src/pages/idCardPrintLayout.js`
- Test: `src/pages/idCardPrintLayout.test.js`

**Interfaces:**
- Produces: `ID_CARD_PRINT_STYLES` now also defines a `.id-cards-print-only` class (hidden on screen, `display:block !important` under `@media print`) and hides any element with class `section-detail-modal-overlay` when printing. Consumed by `IdCardsPrintable.jsx` (Task 4, applies `.id-cards-print-only` when its `printOnly` prop is true) and `SectionDetailModal.jsx` (Task 5, passes `overlayClassName="section-detail-modal-overlay"` to `Modal`).

- [ ] **Step 1: Write the failing test**

Add to `src/pages/idCardPrintLayout.test.js`, as a new `it` block inside the existing `describe('ID card print layout', ...)`, after the `'never reserves a fixed full-page height...'` test:

```js
  it('reveals the print-only wrapper only under @media print, and hides the section-detail modal overlay when printing', () => {
    expect(ID_CARD_PRINT_STYLES).toMatch(/\.id-cards-print-only\s*\{\s*display:\s*none;\s*\}/);
    expect(ID_CARD_PRINT_STYLES).toContain('.id-cards-print-only { display: block !important; }');
    expect(ID_CARD_PRINT_STYLES).toMatch(
      /\.app-sidebar,\s*\.app-topbar,\s*\.id-cards-controls,\s*\.id-cards-heading,\s*\.section-detail-modal-overlay\s*\{\s*display:\s*none\s*!important;\s*\}/,
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/idCardPrintLayout.test.js`
Expected: FAIL — the new assertions don't match the current `ID_CARD_PRINT_STYLES` string.

- [ ] **Step 3: Write minimal implementation**

In `src/pages/idCardPrintLayout.js`, change the start of `ID_CARD_PRINT_STYLES`:

```js
export const ID_CARD_PRINT_STYLES = `
  .id-cards-sheet { display: contents; }
  @media print {
    .app-sidebar, .app-topbar, .id-cards-controls, .id-cards-heading { display: none !important; }
```

to:

```js
export const ID_CARD_PRINT_STYLES = `
  .id-cards-sheet { display: contents; }
  .id-cards-print-only { display: none; }
  @media print {
    .app-sidebar, .app-topbar, .id-cards-controls, .id-cards-heading, .section-detail-modal-overlay { display: none !important; }
```

Then change:

```js
    .id-cards-grid { display: block !important; }
```

to:

```js
    .id-cards-grid { display: block !important; }
    .id-cards-print-only { display: block !important; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/idCardPrintLayout.test.js`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Commit**

```bash
git add src/pages/idCardPrintLayout.js src/pages/idCardPrintLayout.test.js
git commit -m "feat: add print-only visibility and modal-overlay-hide rules to ID card print CSS"
```

---

### Task 4: Extract `IdCardsPrintable.jsx`; refactor `IDCardsPage.jsx`

**Files:**
- Create: `src/components/IdCardsPrintable.jsx`
- Modify: `src/pages/IDCardsPage.jsx`

**Interfaces:**
- Consumes: `ID_CARD_PRINT_STYLES`, `chunkIdCardsIntoSheets` from `src/pages/idCardPrintLayout.js` (Task 3's additions to `ID_CARD_PRINT_STYLES` are consumed transparently — no signature change to either export). `fullName` from `src/lib/roster.js`.
- Produces: `IdCardsPrintSheets({ roster, section, printOnly = false })`, default export of `src/components/IdCardsPrintable.jsx`. Renders the shared `<style>{ID_CARD_PRINT_STYLES}</style>` plus the chunked-into-sheets card grid. When `printOnly` is `false` (the default), behavior is pixel-identical to what `IDCardsPage.jsx` renders today. When `printOnly` is `true`, the grid also carries the `id-cards-print-only` class (Task 3), so it's invisible on screen and only appears when printing. Consumed by `IDCardsPage.jsx` (this task, `printOnly` omitted) and `SectionsPage.jsx` (Task 6, `printOnly` passed).

- [ ] **Step 1: Create the shared component**

Write `src/components/IdCardsPrintable.jsx`:

```jsx
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { fullName } from '../lib/roster.js';
import { T } from '../styles.js';
import { ID_CARD_PRINT_STYLES, chunkIdCardsIntoSheets } from '../pages/idCardPrintLayout.js';

const sectionLabel = (s) => s ? `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}` : '—';

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
      <div className="id-card-section" style={{ fontFamily: T.body, fontSize: 11, color: T.inkMuted, marginTop: 2 }}>{sectionLabel(section)}</div>
    </div>
  );
}

export default function IdCardsPrintSheets({ roster, section, printOnly = false }) {
  const sheets = chunkIdCardsIntoSheets(roster);
  const gridClassName = printOnly ? 'id-cards-grid id-cards-print-only' : 'id-cards-grid';

  return (
    <>
      <style>{ID_CARD_PRINT_STYLES}</style>
      <div className={gridClassName} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
        {sheets.map((sheet, i) => (
          <div className="id-cards-sheet" key={i}>
            {sheet.map((s) => <IdCard key={s.id} student={s} section={section} />)}
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Refactor `IDCardsPage.jsx` to use it**

Replace the entire contents of `src/pages/IDCardsPage.jsx` with:

```jsx
import { useMemo, useState } from 'react';
import { useCollection } from '../hooks/useCollection.js';
import { depedSort } from '../lib/roster.js';
import { S } from '../styles.js';
import { Sel, Field, Btn, Card, EmptyState } from '../components/ui.jsx';
import IdCardsPrintSheets from '../components/IdCardsPrintable.jsx';

const sectionLabel = (s) => s ? `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}` : '—';

export default function IDCardsPage({ schoolYear }) {
  const sections = useCollection('sections');
  const enrollments = useCollection('enrollments');
  const students = useCollection('students');

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

  return (
    <div>
      <div className="id-cards-heading" style={S.plate}>
        <h1 style={S.h1}>ID Cards</h1>
      </div>

      <Card className="id-cards-controls" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 260 }}>
            <Field label="Section">
              <Sel value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="">Choose a section…</option>
                {sectionsSY.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
              </Sel>
            </Field>
          </div>
          {section && roster.length > 0 && (
            <div style={{ marginBottom: 12 }}><Btn onClick={() => window.print()}>Print</Btn></div>
          )}
        </div>
      </Card>

      {!section ? (
        <Card style={{ padding: 20 }}><EmptyState title="Pick a section" hint="Choose a section above to generate ID cards for its enrolled learners." /></Card>
      ) : roster.length === 0 ? (
        <Card style={{ padding: 20 }}><EmptyState title="No learners enrolled here yet" hint="Enroll learners into this section on the Enrollment page first." /></Card>
      ) : (
        <IdCardsPrintSheets roster={roster} section={section} />
      )}
    </div>
  );
}
```

This is behaviorally identical to the current page — same roster computation, same "Print" button, same empty states — just delegating the card-grid rendering to the shared component with `printOnly` omitted (defaults to `false`, i.e. always visible on screen, exactly as today).

- [ ] **Step 3: Verify by hand**

Run: `npx vitest run` (full suite) — should stay pristine.
Run: `npm run build` — should succeed with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/IdCardsPrintable.jsx src/pages/IDCardsPage.jsx
git commit -m "refactor: extract IdCardsPrintable so ID card sheets can render outside the ID Cards page"
```

---

### Task 5: `SectionDetailModal` component

**Files:**
- Create: `src/pages/SectionDetailModal.jsx`

**Interfaces:**
- Consumes: `Modal`, `Btn`, `EmptyState` from `src/components/ui.jsx` (`Modal`'s `overlayClassName` prop from Task 2). `fullName` from `src/lib/roster.js`.
- Produces: `SectionDetailModal({ section, roster, onClose, onEditStudent })`, default export. `section` is a section document (`{ id, name, gradeLevel, strand, adviserName, ... }`). `roster` is an already-sorted array of student documents to display (sorting is the caller's job — this component just renders what it's given). `onClose()` closes the modal. `onEditStudent(student)` is called when a row's Edit button is clicked. Consumed by `SectionsPage.jsx` in Task 6, which passes `roster` pre-sorted via `alphabeticalSort` (Task 1).

- [ ] **Step 1: Write the component**

Write `src/pages/SectionDetailModal.jsx`:

```jsx
import { Modal, Btn, EmptyState } from '../components/ui.jsx';
import { fullName } from '../lib/roster.js';
import { T, S } from '../styles.js';

const sectionLabel = (s) => `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}`;

export default function SectionDetailModal({ section, roster, onClose, onEditStudent }) {
  return (
    <Modal onClose={onClose} overlayClassName="section-detail-modal-overlay" width={720}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontFamily: T.display, color: T.ink, margin: 0, fontSize: 17, fontWeight: 600 }}>{sectionLabel(section)}</h2>
          <div style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted, marginTop: 4 }}>{section.adviserName || 'No adviser assigned'} · {roster.length} enrolled</div>
        </div>
        {roster.length > 0 && <Btn onClick={() => window.print()}>Print QR Codes</Btn>}
      </div>
      {roster.length === 0 ? (
        <EmptyState title="No learners enrolled here yet" hint="Enroll learners into this section on the Enrollment page first." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={S.thead}>
              {['LRN', 'Name', 'Sex', ''].map((h) => <th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>{roster.map((s) => (
              <tr key={s.id}>
                <td style={{ ...S.td, ...T.num }}>{s.lrn}</td>
                <td style={{ ...S.td, fontWeight: 600 }}>{fullName(s)}</td>
                <td style={S.td}>{s.sex}</td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <Btn variant="ghost" onClick={() => onEditStudent(s)}>Edit</Btn>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
}
```

Note: the "Print QR Codes" button calls `window.print()` directly — it does not render the printable sheets itself. `SectionsPage.jsx` (Task 6) mounts `IdCardsPrintSheets` as a **sibling** of this modal, not a child of it, specifically so that the `.section-detail-modal-overlay` print-hide rule (Task 3) — which will hide this entire modal, including anything nested inside it — does not also hide the sheets that need to survive into the printed page.

- [ ] **Step 2: Verify by hand**

Run: `npx vitest run` (full suite) — should stay pristine (this file has no dedicated test, per this plan's Global Constraints).
Run: `npm run build` — should succeed with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SectionDetailModal.jsx
git commit -m "feat: add SectionDetailModal showing a section's alphabetical roster with edit access"
```

---

### Task 6: Wire it into `SectionsPage.jsx`

**Files:**
- Modify: `src/pages/SectionsPage.jsx`

**Interfaces:**
- Consumes: `alphabeticalSort`, `depedSort` from `src/lib/roster.js` (Task 1). `SectionDetailModal` from `src/pages/SectionDetailModal.jsx` (Task 5). `IdCardsPrintSheets` from `src/components/IdCardsPrintable.jsx` (Task 4). `StudentForm` from `src/pages/StudentForm.jsx` (pre-existing, same component `StudentsPage.jsx` already uses — `StudentForm({ students, editing, onClose })`).

- [ ] **Step 1: Add the new imports**

In `src/pages/SectionsPage.jsx`, change:

```js
import { useMemo, useState } from 'react';
import { useCollection } from '../hooks/useCollection.js';
import { createSection, updateSection, deleteSection } from '../data/sections.js';
import { GRADES, isSHS, TRACKS, STRANDS } from '../lib/constants.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Sel, Field, Modal, Card, Confirm, EmptyState } from '../components/ui.jsx';
```

to:

```js
import { useMemo, useState } from 'react';
import { useCollection } from '../hooks/useCollection.js';
import { createSection, updateSection, deleteSection } from '../data/sections.js';
import { GRADES, isSHS, TRACKS, STRANDS } from '../lib/constants.js';
import { alphabeticalSort, depedSort } from '../lib/roster.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Sel, Field, Modal, Card, Confirm, EmptyState } from '../components/ui.jsx';
import StudentForm from './StudentForm.jsx';
import SectionDetailModal from './SectionDetailModal.jsx';
import IdCardsPrintSheets from '../components/IdCardsPrintable.jsx';
```

- [ ] **Step 2: Load students, add roster-membership map, and add the new state**

Change:

```js
export default function SectionsPage({ schoolYear }) {
  const sections = useCollection('sections');
  const schedules = useCollection('schedules');
  const enrollments = useCollection('enrollments');
  const scheduleById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules]);
  const enrolledCountBySection = useMemo(() => {
    const m = new Map();
    enrollments.forEach((e) => {
      if (e.schoolYear === schoolYear && e.status === 'enrolled') m.set(e.sectionId, (m.get(e.sectionId) || 0) + 1);
    });
    return m;
  }, [enrollments, schoolYear]);
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
```

to:

```js
export default function SectionsPage({ schoolYear }) {
  const sections = useCollection('sections');
  const schedules = useCollection('schedules');
  const enrollments = useCollection('enrollments');
  const students = useCollection('students');
  const scheduleById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules]);
  const enrolledCountBySection = useMemo(() => {
    const m = new Map();
    enrollments.forEach((e) => {
      if (e.schoolYear === schoolYear && e.status === 'enrolled') m.set(e.sectionId, (m.get(e.sectionId) || 0) + 1);
    });
    return m;
  }, [enrollments, schoolYear]);
  const enrolledStudentIdsBySection = useMemo(() => {
    const m = new Map();
    enrollments.forEach((e) => {
      if (e.status === 'enrolled') {
        if (!m.has(e.sectionId)) m.set(e.sectionId, new Set());
        m.get(e.sectionId).add(e.studentId);
      }
    });
    return m;
  }, [enrollments]);
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [detailSection, setDetailSection] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
```

`enrolledStudentIdsBySection` deliberately does not filter by `schoolYear` — `enrolledCountBySection` (used for the "Enrolled" column) does, matching that column's existing behavior, but section documents and their `id`s are already school-year-scoped (a section's `id` never appears under a different `schoolYear`), so filtering by `sectionId` alone is sufficient and matches the existing pattern in `EnrollPage.jsx` and `IDCardsPage.jsx`, which do the identical `e.sectionId === x.id && e.status === 'enrolled'` check with no separate `schoolYear` filter.

- [ ] **Step 3: Compute the detail roster**

Change:

```js
  const activeGrade = groups.some(([g]) => g === selectedGrade) ? selectedGrade : (groups[0]?.[0] ?? null);
  const activeList = groups.find(([g]) => g === activeGrade)?.[1] || [];
  return (
```

to:

```js
  const activeGrade = groups.some(([g]) => g === selectedGrade) ? selectedGrade : (groups[0]?.[0] ?? null);
  const activeList = groups.find(([g]) => g === activeGrade)?.[1] || [];
  const detailRoster = useMemo(() => {
    if (!detailSection) return [];
    const ids = enrolledStudentIdsBySection.get(detailSection.id) || new Set();
    return students.filter((s) => ids.has(s.id));
  }, [detailSection, enrolledStudentIdsBySection, students]);
  const detailRosterAlpha = useMemo(() => alphabeticalSort(detailRoster), [detailRoster]);
  return (
```

- [ ] **Step 4: Make each section row open the detail modal**

Change:

```js
              <tbody>{activeList.map((s) => (
                <tr key={s.id}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{s.name}</td>
                  <td style={S.td}>{s.strand || '—'}</td>
                  <td style={S.td}>{s.adviserName || '—'}</td>
                  <td style={S.td}>{scheduleById.get(s.scheduleId)?.name || '—'}</td>
                  <td style={{ ...S.td, ...T.num }}>{enrolledCountBySection.get(s.id) || 0}</td>
                  <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Btn variant="ghost" onClick={() => setForm(s)} style={{ marginRight: 6 }}>Edit</Btn>
                    <Btn variant="ghost" onClick={() => setConfirm(s)} style={{ color: T.absent, borderColor: T.absent }}>Delete</Btn>
                  </td>
                </tr>))}
              </tbody>
```

to:

```js
              <tbody>{activeList.map((s) => (
                <tr key={s.id} onClick={() => setDetailSection(s)} style={{ cursor: 'pointer' }}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{s.name}</td>
                  <td style={S.td}>{s.strand || '—'}</td>
                  <td style={S.td}>{s.adviserName || '—'}</td>
                  <td style={S.td}>{scheduleById.get(s.scheduleId)?.name || '—'}</td>
                  <td style={{ ...S.td, ...T.num }}>{enrolledCountBySection.get(s.id) || 0}</td>
                  <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Btn variant="ghost" onClick={(e) => { e.stopPropagation(); setForm(s); }} style={{ marginRight: 6 }}>Edit</Btn>
                    <Btn variant="ghost" onClick={(e) => { e.stopPropagation(); setConfirm(s); }} style={{ color: T.absent, borderColor: T.absent }}>Delete</Btn>
                  </td>
                </tr>))}
              </tbody>
```

The `e.stopPropagation()` calls on the existing Edit/Delete buttons are required — without them, clicking either button would also fire the new row `onClick` and open the detail modal underneath the section-edit form or delete confirmation.

- [ ] **Step 5: Render the new modal, print sheets, and student-edit form**

Change:

```js
      {form && <SectionForm editing={form.id ? form : null} schoolYear={schoolYear} schedules={schedules} onClose={() => setForm(null)} />}
      {confirm && <Confirm message={`Delete ${confirm.name}? This cannot be undone.`} onYes={async () => { await deleteSection(confirm.id); setConfirm(null); }} onNo={() => setConfirm(null)} />}
    </div>
  );
}
```

to:

```js
      {form && <SectionForm editing={form.id ? form : null} schoolYear={schoolYear} schedules={schedules} onClose={() => setForm(null)} />}
      {confirm && <Confirm message={`Delete ${confirm.name}? This cannot be undone.`} onYes={async () => { await deleteSection(confirm.id); setConfirm(null); }} onNo={() => setConfirm(null)} />}
      {detailSection && (
        <SectionDetailModal
          section={detailSection}
          roster={detailRosterAlpha}
          onClose={() => setDetailSection(null)}
          onEditStudent={(s) => setEditingStudent(s)}
        />
      )}
      {detailSection && <IdCardsPrintSheets section={detailSection} roster={depedSort(detailRoster)} printOnly />}
      {editingStudent && <StudentForm students={students} editing={editingStudent} onClose={() => setEditingStudent(null)} />}
    </div>
  );
}
```

`IdCardsPrintSheets` is rendered as a **sibling** to `SectionDetailModal`, not nested inside its JSX — this is what keeps the printable sheets alive when the print stylesheet hides `.section-detail-modal-overlay` (Task 3). `StudentForm` is rendered **last**, after `SectionDetailModal`, so that when both are open at once (editing a student from within the section detail view) it paints on top — both use the same `Modal` primitive at the same `z-index`, so later-in-the-DOM wins.

- [ ] **Step 6: Verify by hand**

Run: `npx vitest run` (full suite) — should stay pristine.
Run: `npm run build` — should succeed with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/SectionsPage.jsx
git commit -m "feat: open a section detail modal with alphabetical roster, edit, and QR printing"
```

---

### Task 7: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Confirm the modal opens and lists students alphabetically**

Open the Sections page, pick a grade with at least one section that has enrolled students, and click anywhere on a section row (not the Edit/Delete buttons). Confirm a modal opens showing that section's name/grade/strand, adviser, and enrolled count, with a table of students ordered alphabetically by last name (not grouped male-then-female — cross-check against the "Enrolled" count shown on the Sections table row).

- [ ] **Step 3: Confirm Edit works from inside the modal**

Click "Edit" next to a student in the modal. Confirm the existing learner-edit form opens on top of the section detail modal, and that saving a change (e.g. edit and save) updates the roster shown underneath once closed.

- [ ] **Step 4: Confirm clicking the section's own Edit/Delete buttons still works without opening the detail modal**

From the Sections table (not inside the new modal), click a section row's "Edit" button. Confirm it opens the section-edit form (name/grade/strand/adviser/schedule) and does **not** also open the new student-roster detail modal underneath. Same check for "Delete".

- [ ] **Step 5: Confirm QR printing works from inside the modal**

With the section detail modal open and its roster non-empty, click "Print QR Codes". Confirm the browser's print preview shows that section's QR ID cards (not a blank page, not the app's normal UI, not the modal dialog itself) — cross-check against what printing the same section from the ID Cards page produces, they should match.

- [ ] **Step 6: Confirm an empty section is handled**

Open the detail modal for a section with zero enrolled students. Confirm it shows the "No learners enrolled here yet" empty state and no "Print QR Codes" button (there's nothing to print).

- [ ] **Step 7: Stop the dev server**

Stop the `npm run dev` process (Ctrl+C or equivalent) once verification is complete.

---

## Self-Review Notes

- **Spec coverage:** Expandable section view on row click → Task 6 Step 4 + Task 5. Alphabetical student order in that view → Task 1 + Task 6 Step 3 (`detailRosterAlpha`). "Edit details function" → Task 6 Step 5 wires `StudentForm` in; Task 5's `onEditStudent` callback. "Print the QR code... no need to go to the ID Card Tab" → Task 3 (print-only CSS) + Task 4 (extracted, reusable sheets renderer) + Task 6 Step 5 (sibling render + button in Task 5's modal calling `window.print()`).
- **Placeholder scan:** No TBD/TODO markers; every step has complete, runnable code; no task defers logic to "similar to Task N" without repeating it.
- **Type/signature consistency:** `alphabeticalSort(students)` (Task 1) is called as `alphabeticalSort(detailRoster)` in Task 6 — matches. `IdCardsPrintSheets({ roster, section, printOnly = false })` (Task 4) is called with `printOnly` (no value, i.e. `true`) from `SectionsPage.jsx` (Task 6) and without it from `IDCardsPage.jsx` (Task 4 itself) — matches both call shapes. `SectionDetailModal({ section, roster, onClose, onEditStudent })` (Task 5) receives exactly those four props from Task 6. `Modal`'s new `overlayClassName` prop (Task 2) is consumed only by `SectionDetailModal` (Task 5) with the exact class name (`section-detail-modal-overlay`) that Task 3's CSS targets — verified matching string in both places.
- **Known limitation carried into Task 7:** two stacked `Modal`s (section detail + student edit) each render their own semi-transparent dark overlay, so the backdrop is very slightly darker than a single modal's — a minor, pre-existing consequence of composing the existing `Modal` primitive twice, not a functional defect. Not fixed here per YAGNI; flag to the user only if it looks wrong in Task 7's manual check.
