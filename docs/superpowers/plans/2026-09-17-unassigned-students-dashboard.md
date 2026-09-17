# Unassigned Students Dashboard Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible "Unassigned" stat tile to the Dashboard that shows the count of active students with no enrollment for the current school year, and clicking it jumps to the Students page pre-filtered to that same list.

**Architecture:** A pure counting function (`unassignedCount`) joins `students` and `enrollments` the same way `StudentsPage`'s existing `UNASSIGNED` filter already does. `App.jsx` gains a small `pageParams` side-channel next to its existing `page` state so Dashboard can pass a filter value across the page switch; `StudentsPage` seeds its local filter state from that value on mount.

**Tech Stack:** React (function components + hooks), Vitest for unit tests. No new dependencies.

## Global Constraints

- Unassigned = active students (`status === 'active'`) with no `enrollments` row where `schoolYear` matches the current SY and `status === 'enrolled'`. This mirrors `StudentsPage.jsx`'s existing filter and `activeStudentCount`'s definition of "the student body being measured."
- The "Unassigned" filter sentinel value must be a single shared constant (`UNASSIGNED` in `src/lib/constants.js`), not re-declared per file — Dashboard and StudentsPage must agree on the exact string.
- The tile is always rendered, with the same visual treatment as the other four dashboard stat tiles (no conditional styling by count).
- `pageParams` is one-shot seed state, not synced/controlled — `StudentsPage` reads it once via a `useState` initializer, matching how the rest of the app treats page-local filter state as ephemeral UI state.

---

### Task 1: `unassignedCount` stat function

**Files:**
- Modify: `src/lib/dashboardStats.js`
- Test: `src/lib/dashboardStats.test.js`

**Interfaces:**
- Produces: `unassignedCount(students, enrollments, schoolYear) => number`, exported from `src/lib/dashboardStats.js`. Consumed by `DashboardPage.jsx` in Task 4.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/dashboardStats.test.js` (after the `activeStudentCount` describe block, before `enrolledCount`):

```js
describe('unassignedCount', () => {
  it('counts active students with no enrolled row for the school year', () => {
    const students = [
      { id: 's1', status: 'active' },
      { id: 's2', status: 'active' },
      { id: 's3', status: 'active' },
      { id: 's4', status: 'dropped' },
    ];
    const enrollments = [
      { studentId: 's1', schoolYear: '2026-2027', status: 'enrolled' },
      { studentId: 's2', schoolYear: '2025-2026', status: 'enrolled' },
      { studentId: 's3', schoolYear: '2026-2027', status: 'dropped' },
    ];
    // s1: enrolled this SY -> assigned. s2: enrolled, but wrong SY -> unassigned.
    // s3: has a row this SY but not 'enrolled' -> unassigned. s4: inactive -> excluded.
    expect(unassignedCount(students, enrollments, '2026-2027')).toBe(2);
  });

  it('returns 0 when every active student is enrolled', () => {
    const students = [{ id: 's1', status: 'active' }];
    const enrollments = [{ studentId: 's1', schoolYear: '2026-2027', status: 'enrolled' }];
    expect(unassignedCount(students, enrollments, '2026-2027')).toBe(0);
  });
});
```

Update the import line at the top of the file to include the new function:

```js
import { activeStudentCount, enrolledCount, countByGrade, todayAttendance, recentEnrollments, unassignedCount } from './dashboardStats.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dashboardStats.test.js`
Expected: FAIL — `unassignedCount is not a function` (or similar import error).

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/dashboardStats.js` (after `activeStudentCount`, before `enrolledCount`):

```js
export function unassignedCount(students, enrollments, schoolYear) {
  const enrolledIds = new Set(
    enrollments
      .filter((e) => e.schoolYear === schoolYear && e.status === 'enrolled')
      .map((e) => e.studentId)
  );
  return students.filter((s) => s.status === 'active' && !enrolledIds.has(s.id)).length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/dashboardStats.test.js`
Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboardStats.js src/lib/dashboardStats.test.js
git commit -m "feat: add unassignedCount dashboard stat"
```

---

### Task 2: Shared `UNASSIGNED` constant + `StudentsPage` seedable filter

**Files:**
- Modify: `src/lib/constants.js`
- Modify: `src/pages/StudentsPage.jsx`

**Interfaces:**
- Produces: `UNASSIGNED` string constant, exported from `src/lib/constants.js`. Consumed by `StudentsPage.jsx` (this task) and `DashboardPage.jsx` (Task 4).
- Produces: `StudentsPage` now accepts an `initialGradeFilter` prop (string, optional). Consumed by `App.jsx` in Task 3.

- [ ] **Step 1: Add the constant**

In `src/lib/constants.js`, add after the `GRADES`/`isSHS` lines (line 2):

```js
export const UNASSIGNED = '__unassigned__';
```

- [ ] **Step 2: Use the shared constant in `StudentsPage.jsx` and accept a seed prop**

In `src/pages/StudentsPage.jsx`, remove the local declaration and import the shared one instead. Change:

```js
import { STUDENT_STATUS, GRADES } from '../lib/constants.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Sel, Card, Confirm, EmptyState } from '../components/ui.jsx';
import StudentForm from './StudentForm.jsx';
import ImportStudentsWizard from './ImportStudentsWizard.jsx';

const UNASSIGNED = '__unassigned__';

export default function StudentsPage({ schoolYear }) {
  const students = useCollection('students');
  const sections = useCollection('sections');
  const enrollments = useCollection('enrollments');
  const [q, setQ] = useState(''); const [status, setStatus] = useState('');
  const [gradeFilter, setGradeFilter] = useState(''); const [sectionFilter, setSectionFilter] = useState('');
```

to:

```js
import { STUDENT_STATUS, GRADES, UNASSIGNED } from '../lib/constants.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Sel, Card, Confirm, EmptyState } from '../components/ui.jsx';
import StudentForm from './StudentForm.jsx';
import ImportStudentsWizard from './ImportStudentsWizard.jsx';

export default function StudentsPage({ schoolYear, initialGradeFilter }) {
  const students = useCollection('students');
  const sections = useCollection('sections');
  const enrollments = useCollection('enrollments');
  const [q, setQ] = useState(''); const [status, setStatus] = useState('');
  const [gradeFilter, setGradeFilter] = useState(initialGradeFilter || ''); const [sectionFilter, setSectionFilter] = useState('');
```

No other lines in the file change — every other reference to `UNASSIGNED` (the grade `<select>` option and the `rows` filter logic) keeps working unchanged since the name is identical, just now imported instead of locally declared.

- [ ] **Step 3: Verify by hand (no test framework for this component)**

Run: `npx vitest run` (full suite) to confirm nothing else broke.
Expected: PASS, same test count as before Task 1 plus the two new ones.

Then run: `npm run build`
Expected: build succeeds with no errors (catches the import/prop wiring at the JS level, since this component has no unit tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/constants.js src/pages/StudentsPage.jsx
git commit -m "refactor: share UNASSIGNED constant; let StudentsPage seed its grade filter"
```

---

### Task 3: `App.jsx` — `pageParams` side-channel for cross-page navigation

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `StudentsPage`'s `initialGradeFilter` prop (Task 2).
- Produces: a `setPage(next, params = null)` function passed down as the `setPage` prop to both `Shell` and `DashboardPage`, replacing the raw state setter. `Shell`'s and `DashboardPage`'s existing single-argument calls (`setPage('dashboard')`, `setPage('enroll')`) keep working unchanged since `params` defaults to `null`. Consumed by `DashboardPage.jsx`'s new tile in Task 4.

- [ ] **Step 1: Add `pageParams` state and a wrapping `setPage` function**

In `src/App.jsx`, change:

```js
export default function App() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState('dashboard');
  const settings = useDoc('settings/app');
```

to:

```js
export default function App() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [page, setPageRaw] = useState('dashboard');
  const [pageParams, setPageParams] = useState(null);
  const setPage = (next, params = null) => { setPageRaw(next); setPageParams(params); };
  const settings = useDoc('settings/app');
```

- [ ] **Step 2: Pass the seed value through to `StudentsPage`**

Change:

```js
        {page==='dashboard' && <DashboardPage schoolYear={schoolYear} setPage={setPage} />}
        {page==='students' && <StudentsPage schoolYear={schoolYear} />}
```

to:

```js
        {page==='dashboard' && <DashboardPage schoolYear={schoolYear} setPage={setPage} />}
        {page==='students' && <StudentsPage schoolYear={schoolYear} initialGradeFilter={pageParams?.gradeFilter} />}
```

(`Shell`'s `setPage={setPage}` prop a few lines above already points at the same wrapped function — no change needed there.)

- [ ] **Step 3: Verify by hand**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add pageParams side-channel for cross-page navigation filters"
```

---

### Task 4: Dashboard "Unassigned" tile

**Files:**
- Modify: `src/pages/DashboardPage.jsx`

**Interfaces:**
- Consumes: `unassignedCount(students, enrollments, schoolYear)` (Task 1), `UNASSIGNED` constant (Task 2), `setPage(next, params)` prop (Task 3).

- [ ] **Step 1: Import the new pieces and compute the stat**

Change:

```js
import { activeStudentCount, enrolledCount, countByGrade, todayAttendance, recentEnrollments } from '../lib/dashboardStats.js';
import { T, S } from '../styles.js';
import { Btn, Card } from '../components/ui.jsx';
import GradeBarChart from '../components/GradeBarChart.jsx';
```

to:

```js
import { activeStudentCount, enrolledCount, countByGrade, todayAttendance, recentEnrollments, unassignedCount } from '../lib/dashboardStats.js';
import { UNASSIGNED } from '../lib/constants.js';
import { T, S } from '../styles.js';
import { Btn, Card } from '../components/ui.jsx';
import GradeBarChart from '../components/GradeBarChart.jsx';
```

Change:

```js
  const stats = useMemo(() => ({
    students: activeStudentCount(students),
    sections: sectionsSY.length,
    enrolled: enrolledCount(enrollments, schoolYear),
    attendance: todayAttendance(attendance, sectionsSY.length, today),
  }), [students, sectionsSY, enrollments, schoolYear, attendance, today]);
```

to:

```js
  const stats = useMemo(() => ({
    students: activeStudentCount(students),
    sections: sectionsSY.length,
    enrolled: enrolledCount(enrollments, schoolYear),
    attendance: todayAttendance(attendance, sectionsSY.length, today),
    unassigned: unassignedCount(students, enrollments, schoolYear),
  }), [students, sectionsSY, enrollments, schoolYear, attendance, today]);
```

- [ ] **Step 2: Add the tile to the grid**

Change:

```js
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <StatTile label="Total Students" value={stats.students} />
        <StatTile label="Sections" value={stats.sections} />
        <StatTile label="Enrolled (this SY)" value={stats.enrolled} />
        <StatTile
          label="Today's Attendance"
          value={stats.attendance.presentRate === null ? '—' : `${stats.attendance.presentRate}%`}
          hint={stats.attendance.sectionsMarked === 0 ? 'Not yet taken today' : `${stats.attendance.sectionsMarked} section${stats.attendance.sectionsMarked === 1 ? '' : 's'} marked`}
        />
      </div>
```

to:

```js
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 20 }}>
        <StatTile label="Total Students" value={stats.students} />
        <StatTile label="Sections" value={stats.sections} />
        <StatTile label="Enrolled (this SY)" value={stats.enrolled} />
        <StatTile
          label="Today's Attendance"
          value={stats.attendance.presentRate === null ? '—' : `${stats.attendance.presentRate}%`}
          hint={stats.attendance.sectionsMarked === 0 ? 'Not yet taken today' : `${stats.attendance.sectionsMarked} section${stats.attendance.sectionsMarked === 1 ? '' : 's'} marked`}
        />
        <StatTile label="Unassigned" value={stats.unassigned} onClick={() => setPage('students', { gradeFilter: UNASSIGNED })} />
      </div>
```

- [ ] **Step 3: Make `StatTile` clickable when `onClick` is passed**

Change:

```js
function StatTile({ label, value, hint }) {
  return (
    <Card style={{ padding: 20 }}>
      <div style={{ fontFamily: T.body, fontSize: 12, fontWeight: 600, color: T.inkMuted, marginBottom: 8 }}>{label}</div>
      <div style={{ ...T.num, fontSize: 28, fontWeight: 800, color: T.ink }}>{value}</div>
      {hint && <div style={{ fontFamily: T.body, fontSize: 11, color: T.inkMuted, marginTop: 4 }}>{hint}</div>}
    </Card>
  );
}
```

to:

```js
function StatTile({ label, value, hint, onClick }) {
  return (
    <Card
      onClick={onClick}
      style={{ padding: 20, cursor: onClick ? 'pointer' : 'default' }}
    >
      <div style={{ fontFamily: T.body, fontSize: 12, fontWeight: 600, color: T.inkMuted, marginBottom: 8 }}>{label}</div>
      <div style={{ ...T.num, fontSize: 28, fontWeight: 800, color: T.ink }}>{value}</div>
      {hint && <div style={{ fontFamily: T.body, fontSize: 11, color: T.inkMuted, marginTop: 4 }}>{hint}</div>}
    </Card>
  );
}
```

(The other three `StatTile` calls don't pass `onClick`, so they stay non-interactive with the default cursor — no visual change for them.)

- [ ] **Step 4: Verify by hand**

Run: `npx vitest run`
Expected: PASS, full suite green (no dashboard component tests exist, so this just guards the stats logic you already covered in Task 1).

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.jsx
git commit -m "feat: add clickable Unassigned tile to dashboard"
```

---

### Task 5: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Confirm the tile renders and counts correctly**

In the browser, open the Dashboard. Confirm a 5th tile labeled "Unassigned" appears in the stats row, showing a number. Cross-check it against the Students page: go to Students, set the grade filter to "Unassigned", and confirm the row count matches the tile's number.

- [ ] **Step 3: Confirm the click-through works**

Back on the Dashboard, click the "Unassigned" tile. Confirm it navigates to the Students page with the grade filter already set to "Unassigned" and the section filter disabled (matching the existing behavior when a user picks that option manually).

- [ ] **Step 4: Confirm normal navigation still resets the filter**

From the filtered Students page, click "Dashboard" in the sidebar, then click "Students" in the sidebar (not the tile). Confirm the grade filter is back to "All grades" — i.e., the seeded filter doesn't leak into an unrelated visit to the page.

- [ ] **Step 5: Stop the dev server**

Stop the `npm run dev` process (Ctrl+C or equivalent) once verification is complete.

---

## Self-Review Notes

- **Spec coverage:** `unassignedCount` (spec §1) → Task 1. Dashboard tile, always shown, no conditional styling (spec §2) → Task 4. Cross-page filter wiring via `pageParams`/`goTo` (spec §3, renamed `setPage` here to avoid introducing a second prop name for the same job) → Task 3. One-shot seed via `useState` initializer (spec's "out of scope"/design note) → Task 2.
- **Naming deviation from spec:** the spec sketches a separate `goTo` function; this plan instead has `setPage` itself take an optional second argument, so `Shell` and the existing `DashboardPage` `setPage('enroll')` call need zero changes. Same behavior, fewer call sites touched.
- **Type/signature consistency:** `unassignedCount(students, enrollments, schoolYear)` — same parameter order as `enrolledCount`/`countByGrade`. `setPage(next, params = null)` used identically in Task 3 (definition) and Task 4 (call site). `initialGradeFilter` prop name matches between Task 2 (consumer) and Task 3 (producer).
