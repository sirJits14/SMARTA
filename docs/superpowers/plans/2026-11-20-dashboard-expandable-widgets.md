# Dashboard Expandable Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the SIMS Dashboard as a widget grid (main column plus a right rail). Every widget opens a right-side drawer with its detailed data, and the open drawer is mirrored in `?panel=<id>`.

**Architecture:** All numbers come from pure functions in `src/lib/dashboardStats.js` and `src/lib/dates.js`, each unit-tested with Vitest. One hook, `useDashboardData`, loads and scopes the data once. Each widget is a module exporting a `…Card` (summary for the grid) and a `…Detail` (drawer body). `DashboardPage` arranges them and renders one shared `WidgetDrawer`. `useDashboardPanel` syncs the open drawer with the URL.

**Tech Stack:** React 19, Vite 8, Vitest 4 (node environment, no DOM testing library), Firebase JS SDK 12 (Firestore listeners via `src/hooks/useCollection.js`), plain CSS with `--t-*` tokens.

**Spec:** [docs/superpowers/specs/2026-11-20-dashboard-expandable-widgets-design.md](../specs/2026-11-20-dashboard-expandable-widgets-design.md)

## Global Constraints

- Colors: only existing `--t-*` tokens. Charts use `--t-decor`, `--t-decor-mid`, `--t-decor-soft` and `--t-chart-track`. No gradients, glass, blur, glows, pastel fills, colored side borders or card shadows. If a needed token is missing, stop and ask; never hard-code a color.
- `src/dashboard.css` must be added to `THEMED_CSS` in `shared/theme/literals.test.js`, and `npm test` must pass, including `literals.test.js` and `contrast.test.js`.
- Type: card titles 16px/600, metrics 26–36px/600 with `font-variant-numeric: tabular-nums`, table headers 12px/500 muted, no weight above 600. Radii: 8px controls, 12px cards and dialogs, 999px pills.
- Motion: 120–200ms state changes only. The drawer slides 24px over 200ms. All motion is removed under `prefers-reduced-motion` (the existing global rule in `registrar.css` already does this for `.sims-ui *` and `.sims-dialog`).
- Every roster-derived number uses the `scopeRoster` output, so grade-scoped staff see only their grades.
- Attendance rate = present ÷ (present + absent + excused), from `attendanceUnits` in `shared/sessionAttendance.js`. Present already includes late. Only section-days that have a `student_attendance` doc count; a missing doc is "not recorded", never present. Do not use `todayAttendance`.
- Sex: `'M'` = male and `'F'` = female. Anything else is "Not recorded", never dropped.
- Announcements: reuse `useCollectionResource('announcements')`, the same source the Announcements page uses. No events collection.
- `id_card_batch` is read only when `isAdmin(me)`. The learner-request count reuses `useLearnerRequestCount(canOpen(me, 'learnerRequests'))`, which returns `{ count, truncated }`.
- Names go through `fullName` from `src/lib/roster.js`. Calendar dates come from `src/lib/dates.js`. Post timestamps use `shortDate` from `src/lib/schoolAssignments.js` and `toMillis` from `shared/announcements.js`.
- The only URL state is `?panel=<id>`, written with `history.replaceState` (never `pushState`).
- 44px targets on coarse pointers, a visible focus ring everywhere, and every chart has text values.
- Never deploy. The work ends in a PR. SIMS deploys from its documented release tree.
- The function names in this plan supersede the provisional list in the spec. `attendanceTally` covers the spec's `weeklyAttendance` / `attendanceBySection`; `noticePosts` / `upcomingPosts` / `postsByDay` / `recentActivity` / `attentionQueues` cover the rest.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/dates.js` (modify) | Calendar math: `addDays`, `isWeekend`, `weekdaysOf`, `schoolDaysToDate`, `shiftMonth`, `monthGrid`, `manilaDay`, `dayLabel` |
| `src/lib/dates.test.js` (modify) | Tests for the above |
| `src/lib/dashboardStats.js` (modify) | Pure dashboard numbers: attendance tally, sex and SHS breakdowns, unassigned list, posts, activity, attention queues, labels |
| `src/lib/dashboardStats.widgets.test.js` (create) | Tests for every new `dashboardStats` export |
| `src/hooks/useDashboardPanel.js` (create) | `?panel=` read/write: `PANEL_IDS`, `readPanel`, `panelHref`, `useDashboardPanel` |
| `src/hooks/useDashboardPanel.test.js` (create) | Tests for `readPanel` and `panelHref` |
| `src/components/ui.jsx` (modify) | `Modal` gets `closeLabel`; `ResourceState` gets `inline` |
| `src/components/NavIcon.jsx` (modify) | Adds `expand` and `chevronRight` glyphs |
| `src/components/dashboard/useDashboardData.js` (create) | Loads and scopes everything the dashboard reads |
| `src/components/dashboard/WidgetCard.jsx` (create) | Card chrome: title, subtitle, filter slot, expand button, per-widget `ResourceState` |
| `src/components/dashboard/WidgetDrawer.jsx` (create) | Right-side drawer on `Modal` with a footer page link |
| `src/components/dashboard/parts.jsx` (create) | `DataTable`, `Segmented`, `ListRow` |
| `src/components/dashboard/widgets/KpiStrip.jsx` (create) | KPI tiles |
| `src/components/dashboard/widgets/EnrollmentWidget.jsx` (create) | Enrollment by grade card and detail |
| `src/components/dashboard/widgets/CoverageWidget.jsx` (create) | Attendance coverage card and detail |
| `src/components/dashboard/widgets/AttendanceWidget.jsx` (create) | Weekly attendance card and detail |
| `src/components/dashboard/widgets/SexWidget.jsx` (create) | Learners by sex card and detail |
| `src/components/dashboard/widgets/AttentionWidget.jsx` (create) | Needs attention card and detail |
| `src/components/dashboard/widgets/NoticeWidget.jsx` (create) | Notice board card and detail |
| `src/components/dashboard/widgets/CalendarWidget.jsx` (create) | Calendar card, Upcoming posts card, agenda detail |
| `src/components/dashboard/widgets/ActivityWidget.jsx` (create) | Recent activity card and detail |
| `src/dashboard.css` (create) | All dashboard and drawer styles |
| `src/pages/DashboardPage.jsx` (rewrite) | Layout composition and drawer switch |
| `src/registrar.css` (modify) | Remove the retired dashboard-only selectors |
| `src/components/dashboard/AttentionPanel.jsx`, `CoveragePanel.jsx` (delete) | Replaced by widgets |
| `shared/theme/literals.test.js` (modify) | Scan `src/dashboard.css` |
| `DESIGN.md` (modify) | Layout and the "Widget cards and drawers" component entry |

UI components have no unit tests, because the repo runs Vitest in node without a DOM library. They are verified by `npm run build` plus the browser check in Task 13. All logic they need lives in tested pure functions.

---

### Task 0: Workspace setup

**Files:** none committed.

- [ ] **Step 1: Link dependencies into the worktree**

Worktrees under `.claude/worktrees/` have no usable `node_modules`. Junction them to the main checkout (all three paths are gitignored). Never run `npm install` here.

```powershell
$main = "C:\Users\jitsb\OneDrive - Department of Education\Desktop\APPS\bnhs-sims"
foreach ($p in @('node_modules','functions\node_modules','parent\node_modules')) {
  if (Test-Path $p) { Remove-Item $p -Recurse -Force -Confirm:$false }
  New-Item -ItemType Junction -Path $p -Target (Join-Path $main $p) | Out-Null
}
```

- [ ] **Step 2: Confirm the baseline is green**

Run: `npm test`
Expected: all test files pass. Note the count; later tasks only add tests.

---

### Task 1: Calendar date helpers

**Files:**
- Modify: `src/lib/dates.js`
- Test: `src/lib/dates.test.js`

**Interfaces:**
- Produces:
  - `addDays(iso: string, n: number): string`
  - `isWeekend(iso: string): boolean`
  - `weekdaysOf(iso: string): string[5]` (Mon–Fri of the week containing `iso`; Sat/Sun map to the preceding Mon–Fri)
  - `schoolDaysToDate(iso: string): string[]` (weekdays of that month up to and including `iso`)
  - `shiftMonth(ym: string, n: number): string`
  - `monthGrid(ym: string): { date: string, inMonth: boolean, weekend: boolean }[][]` (Monday-first weeks)
  - `manilaDay(ms: number): string` (`YYYY-MM-DD` in Asia/Manila)
  - `dayLabel(iso: string, options: Intl.DateTimeFormatOptions): string` (`en-PH`)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/dates.test.js`, and change its import line to:

```js
import { pad2, localDate, localMonth, schoolDaysInMonth, monthLabel, previousSchoolYear,
  addDays, isWeekend, weekdaysOf, schoolDaysToDate, shiftMonth, monthGrid, manilaDay, dayLabel } from './dates.js';
```

```js
describe('dashboard calendar helpers', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('knows weekends', () => {
    expect(isWeekend('2026-07-25')).toBe(true);  // Sat
    expect(isWeekend('2026-07-26')).toBe(true);  // Sun
    expect(isWeekend('2026-07-24')).toBe(false); // Fri
  });

  it('lists Monday to Friday of the week, including from a weekend', () => {
    const week = ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24'];
    expect(weekdaysOf('2026-07-24')).toEqual(week);
    expect(weekdaysOf('2026-07-20')).toEqual(week);
    expect(weekdaysOf('2026-07-25')).toEqual(week);
    expect(weekdaysOf('2026-07-26')).toEqual(week);
  });

  it('lists the month’s school days up to a date', () => {
    expect(schoolDaysToDate('2026-07-03')).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(schoolDaysToDate('2026-07-05')).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  });

  it('shifts months across years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('builds a Monday-first month grid', () => {
    const weeks = monthGrid('2026-07'); // 1 July 2026 is a Wednesday
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toEqual({ date: '2026-06-29', inMonth: false, weekend: false });
    expect(weeks[0][2]).toEqual({ date: '2026-07-01', inMonth: true, weekend: false });
    expect(weeks[0][5].weekend).toBe(true);
    expect(weeks[4][6]).toEqual({ date: '2026-08-02', inMonth: false, weekend: true });
  });

  it('buckets timestamps into Manila days around midnight', () => {
    expect(manilaDay(Date.UTC(2026, 10, 20, 15, 59))).toBe('2026-11-20'); // 23:59 Manila
    expect(manilaDay(Date.UTC(2026, 10, 20, 16, 30))).toBe('2026-11-21'); // 00:30 Manila
  });

  it('labels a day in en-PH', () => {
    expect(dayLabel('2026-11-20', { weekday: 'short' })).toBe('Fri');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/dates.test.js`
Expected: FAIL. `addDays` (and the others) are not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/dates.js`:

```js
// Calendar math for the dashboard. Dates are local ISO days (YYYY-MM-DD); noon
// avoids any daylight-saving edge when stepping a day at a time.
const noon = (iso) => new Date(`${iso}T12:00:00`);

export const addDays = (iso, n) => {
  const d = noon(iso);
  d.setDate(d.getDate() + n);
  return localDate(d);
};

export const isWeekend = (iso) => {
  const dow = noon(iso).getDay();
  return dow === 0 || dow === 6;
};

// Monday to Friday of the week holding `iso`. A weekend maps to the week that just ended.
export function weekdaysOf(iso) {
  const dow = noon(iso).getDay();
  const monday = addDays(iso, dow === 0 ? -6 : 1 - dow);
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
}

export function schoolDaysToDate(iso) {
  const [y, m] = iso.split('-').map(Number);
  return schoolDaysInMonth(y, m).filter((d) => d <= iso);
}

export const shiftMonth = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  return localMonth(new Date(y, m - 1 + n, 1));
};

// Monday-first weeks covering the whole month, padded with the neighbouring months' days.
export function monthGrid(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const start = addDays(`${ym}-01`, -lead);
  const weeks = Math.ceil((lead + new Date(y, m, 0).getDate()) / 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, w * 7 + i);
    return { date, inMonth: date.startsWith(ym), weekend: i >= 5 };
  }));
}

const MANILA_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
export function manilaDay(ms) {
  const parts = Object.fromEntries(MANILA_DAY.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export const dayLabel = (iso, options) => noon(iso).toLocaleDateString('en-PH', options);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/dates.test.js`
Expected: PASS. If `dayLabel` returns a different abbreviation on this machine's ICU build, print the actual value and match the test to it; do not change the locale.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates.js src/lib/dates.test.js
git commit -m "feat(dashboard): add calendar date helpers"
```

---

### Task 2: Attendance tally

**Files:**
- Modify: `src/lib/dashboardStats.js`
- Test: `src/lib/dashboardStats.widgets.test.js` (create)

**Interfaces:**
- Produces:
  - `rosterBySection(students, enrollments, schoolYear): Map<sectionId, studentId[]>` (enrolled this SY, only students present in the scoped `students` list)
  - `attendanceTally({ roster, attendance, schoolYear, dates, sectionIds? }): { days, sections, total }`
    - `days`: `{ date, sectionsRecorded, present, late, absent, excused, rate }[]` in `dates` order
    - `sections`: `{ sectionId, daysRecorded, present, late, absent, excused, rate }[]` (only sections with at least one record)
    - `total`: `{ present, late, absent, excused, rate }`
    - `rate`: integer percent, or `null` when nothing was recorded
  - `percentOf(part, whole): number | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/dashboardStats.widgets.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { rosterBySection, attendanceTally, percentOf } from './dashboardStats.js';

const SY = '2026-2027';

describe('rosterBySection', () => {
  it('maps sections to enrolled learners who are in scope', () => {
    const students = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
    const enrollments = [
      { studentId: 's1', sectionId: 'A', schoolYear: SY, status: 'enrolled' },
      { studentId: 's2', sectionId: 'A', schoolYear: SY, status: 'enrolled' },
      { studentId: 's3', sectionId: 'B', schoolYear: SY, status: 'enrolled' },
      { studentId: 's4', sectionId: 'B', schoolYear: SY, status: 'enrolled' }, // out of scope
      { studentId: 's1', sectionId: 'C', schoolYear: '2025-2026', status: 'enrolled' },
      { studentId: 's2', sectionId: 'C', schoolYear: SY, status: 'dropped' },
    ];
    expect([...rosterBySection(students, enrollments, SY)]).toEqual([['A', ['s1', 's2']], ['B', ['s3']]]);
  });
});

describe('attendanceTally', () => {
  const roster = new Map([['A', ['s1', 's2']], ['B', ['s3']]]);
  const attendance = [
    { sectionId: 'A', date: '2026-07-20', schoolYear: SY, marks: { s2: 'A' } },
    { sectionId: 'A', date: '2026-07-21', schoolYear: SY, marks: { s2: 'E' }, sessionOverrides: { s1: { am: { absent: true } } } },
    { sectionId: 'B', date: '2026-07-21', schoolYear: SY, marks: { s3: 'L' } },
    { sectionId: 'B', date: '2026-07-21', schoolYear: '2025-2026', marks: { s3: 'A' } }, // other school year
    { sectionId: 'A', date: '2026-07-27', schoolYear: SY, marks: { s1: 'A' } },          // outside the dates
    { sectionId: 'Z', date: '2026-07-20', schoolYear: SY, marks: { x: 'A' } },           // section not in roster
  ];
  const dates = ['2026-07-20', '2026-07-21', '2026-07-22'];

  it('counts unmarked learners in a recorded section as present', () => {
    const { days } = attendanceTally({ roster, attendance, schoolYear: SY, dates });
    expect(days[0]).toEqual({ date: '2026-07-20', sectionsRecorded: 1, present: 1, late: 0, absent: 1, excused: 0, rate: 50 });
  });

  it('treats a half-day absence as half present, half absent, and keeps late inside present', () => {
    const { days } = attendanceTally({ roster, attendance, schoolYear: SY, dates });
    expect(days[1]).toEqual({ date: '2026-07-21', sectionsRecorded: 2, present: 1.5, late: 1, absent: 0.5, excused: 1, rate: 50 });
  });

  it('leaves a day with no records as not recorded rather than 0% or 100%', () => {
    const { days } = attendanceTally({ roster, attendance, schoolYear: SY, dates });
    expect(days[2]).toEqual({ date: '2026-07-22', sectionsRecorded: 0, present: 0, late: 0, absent: 0, excused: 0, rate: null });
  });

  it('totals per section and overall', () => {
    const { sections, total } = attendanceTally({ roster, attendance, schoolYear: SY, dates });
    expect(sections).toEqual([
      { sectionId: 'A', daysRecorded: 2, present: 1.5, late: 0, absent: 1.5, excused: 1, rate: 38 },
      { sectionId: 'B', daysRecorded: 1, present: 1, late: 1, absent: 0, excused: 0, rate: 100 },
    ]);
    expect(total).toEqual({ present: 2.5, late: 1, absent: 1.5, excused: 1, rate: 50 });
  });

  it('limits to the given sections', () => {
    const { total, sections } = attendanceTally({ roster, attendance, schoolYear: SY, dates, sectionIds: ['B'] });
    expect(sections.map((s) => s.sectionId)).toEqual(['B']);
    expect(total.rate).toBe(100);
  });

  it('handles an empty week', () => {
    const { days, total } = attendanceTally({ roster, attendance: [], schoolYear: SY, dates });
    expect(days.every((d) => d.rate === null)).toBe(true);
    expect(total.rate).toBe(null);
  });
});

describe('percentOf', () => {
  it('rounds and guards zero', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(0, 0)).toBe(null);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/dashboardStats.widgets.test.js`
Expected: FAIL. `rosterBySection` is not exported.

- [ ] **Step 3: Implement**

At the top of `src/lib/dashboardStats.js`, replace `import { depedSort } from './roster.js';` with:

```js
import { depedSort, fullName } from './roster.js';
import { attendanceUnits } from '../../shared/sessionAttendance.js';
import { toMillis } from '../../shared/announcements.js';
import { manilaDay } from './dates.js';
```

Append:

```js
export const percentOf = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

// Enrolled learners per section for the school year, limited to the scoped student list.
export function rosterBySection(students, enrollments, schoolYear) {
  const ids = new Set(students.map((s) => s.id));
  const out = new Map();
  for (const e of enrollments) {
    if (e.schoolYear !== schoolYear || e.status !== 'enrolled' || !e.sectionId || !ids.has(e.studentId)) continue;
    if (!out.has(e.sectionId)) out.set(e.sectionId, []);
    out.get(e.sectionId).push(e.studentId);
  }
  return out;
}

const zeroUnits = () => ({ present: 0, late: 0, absent: 0, excused: 0 });
const addUnits = (into, u) => { into.present += u.present; into.late += u.late; into.absent += u.absent; into.excused += u.excused; };
// Present already includes late (attendanceUnits counts L as present), so late is never added to the denominator.
const withRate = (t) => ({ ...t, rate: percentOf(t.present, t.present + t.absent + t.excused) });

// Attendance over a set of dates, from the same summarizer SF2 uses. A section-day counts only when a
// student_attendance doc exists for it; inside a recorded doc, unmarked learners are present by default.
export function attendanceTally({ roster, attendance, schoolYear, dates, sectionIds = null }) {
  const wanted = new Set(dates);
  const allowed = sectionIds ? new Set(sectionIds) : null;
  const days = new Map(dates.map((date) => [date, { date, sectionsRecorded: 0, ...zeroUnits() }]));
  const sections = new Map();
  for (const doc of attendance) {
    if (doc.schoolYear !== schoolYear || !wanted.has(doc.date) || !roster.has(doc.sectionId)) continue;
    if (allowed && !allowed.has(doc.sectionId)) continue;
    const day = days.get(doc.date);
    const section = sections.get(doc.sectionId) || { sectionId: doc.sectionId, daysRecorded: 0, ...zeroUnits() };
    day.sectionsRecorded += 1;
    section.daysRecorded += 1;
    for (const studentId of roster.get(doc.sectionId)) {
      const units = attendanceUnits(doc, studentId);
      addUnits(day, units);
      addUnits(section, units);
    }
    sections.set(doc.sectionId, section);
  }
  const total = zeroUnits();
  for (const day of days.values()) addUnits(total, day);
  return {
    days: [...days.values()].map(withRate),
    sections: [...sections.values()].sort((a, b) => a.sectionId.localeCompare(b.sectionId)).map(withRate),
    total: withRate(total),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/dashboardStats.widgets.test.js src/lib/dashboardStats.test.js`
Expected: PASS (the old suite is unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboardStats.js src/lib/dashboardStats.widgets.test.js
git commit -m "feat(dashboard): attendance tally from the SF2 summarizer"
```

---

### Task 3: Learner breakdowns and labels

**Files:**
- Modify: `src/lib/dashboardStats.js`
- Test: `src/lib/dashboardStats.widgets.test.js`

**Interfaces:**
- Consumes: `fullName` (already imported in Task 2).
- Produces:
  - `sexBreakdown({ students, enrollments, sections, schoolYear, grade? }): { male, female, unknown, total, byGrade: Row[], bySection: Row[] }`
    - `byGrade` rows: `{ grade, male, female, unknown, total }`
    - `bySection` rows: `{ sectionId, gradeLevel, name, male, female, unknown, total }`, sorted by grade then name
  - `shsBreakdown(enrollments, sections, schoolYear): { track, strand, count }[]`
  - `unassignedStudents(students, enrollments, schoolYear): student[]` (sorted by `fullName`). `unassignedCount` now delegates to it.
  - `gradesInScope(sections, schoolYear): number[]`
  - `sectionTitle(section): string` (e.g. "Grade 11 · Rizal · STEM", or "Unavailable section")
  - `formatUnits(n: number): string` (whole numbers as `1,200`; halves as `2.5`)
  - `formatRate(rate: number | null): string` (`"50%"` or `"—"`)

- [ ] **Step 1: Write the failing tests**

Add to the import in `src/lib/dashboardStats.widgets.test.js`: `sexBreakdown, shsBreakdown, unassignedStudents, unassignedCount, gradesInScope, sectionTitle, formatUnits, formatRate`. Then append:

```js
describe('sexBreakdown', () => {
  const students = [
    { id: 'a', sex: 'M' }, { id: 'b', sex: 'F' }, { id: 'c', sex: '' }, { id: 'd', sex: 'M' },
  ];
  const sections = [{ id: 'A', name: 'Rizal', gradeLevel: 7 }, { id: 'B', name: 'Mabini', gradeLevel: 8 }];
  const enrollments = [
    { studentId: 'a', sectionId: 'A', gradeLevel: 7, schoolYear: SY, status: 'enrolled' },
    { studentId: 'b', sectionId: 'A', gradeLevel: 7, schoolYear: SY, status: 'enrolled' },
    { studentId: 'c', sectionId: 'B', gradeLevel: '8', schoolYear: SY, status: 'enrolled' },
    { studentId: 'e', sectionId: 'A', gradeLevel: 7, schoolYear: SY, status: 'enrolled' }, // not in scoped students
    { studentId: 'a', sectionId: 'A', gradeLevel: 7, schoolYear: '2025-2026', status: 'enrolled' },
    { studentId: 'd', sectionId: 'A', gradeLevel: 7, schoolYear: SY, status: 'dropped' },
  ];

  it('counts enrolled learners in scope and keeps unknown sex as Not recorded', () => {
    const r = sexBreakdown({ students, enrollments, sections, schoolYear: SY });
    expect([r.male, r.female, r.unknown, r.total]).toEqual([1, 1, 1, 3]);
    expect(r.byGrade).toEqual([
      { grade: 7, male: 1, female: 1, unknown: 0, total: 2 },
      { grade: 8, male: 0, female: 0, unknown: 1, total: 1 },
    ]);
    expect(r.bySection.map((s) => [s.name, s.total])).toEqual([['Rizal', 2], ['Mabini', 1]]);
  });

  it('filters to one grade', () => {
    const r = sexBreakdown({ students, enrollments, sections, schoolYear: SY, grade: 8 });
    expect([r.male, r.female, r.unknown, r.total]).toEqual([0, 0, 1, 1]);
  });
});

describe('shsBreakdown', () => {
  it('groups grades 11 and 12 by track and strand', () => {
    const sections = [
      { id: 's11', gradeLevel: 11, track: 'Academic', strand: 'STEM' },
      { id: 's12', gradeLevel: 12, track: 'TVL', strand: 'ICT' },
      { id: 's7', gradeLevel: 7 },
    ];
    const row = (sectionId, gradeLevel) => ({ studentId: sectionId + gradeLevel + Math.random(), sectionId, gradeLevel, schoolYear: SY, status: 'enrolled' });
    const enrollments = [row('s11', 11), row('s11', 11), row('s12', 12), row('s7', 7), row('gone', 11)];
    expect(shsBreakdown(enrollments, sections, SY)).toEqual([
      { track: 'Academic', strand: 'STEM', count: 2 },
      { track: 'No track', strand: 'No strand', count: 1 },
      { track: 'TVL', strand: 'ICT', count: 1 },
    ]);
  });
});

describe('unassignedStudents', () => {
  it('lists active learners without an enrolled row, sorted by name, and backs unassignedCount', () => {
    const students = [
      { id: 's1', status: 'active', lastName: 'Cruz', firstName: 'Ana' },
      { id: 's2', status: 'active', lastName: 'Abad', firstName: 'Ben' },
      { id: 's3', status: 'active', lastName: 'Diaz', firstName: 'Cy' },
      { id: 's4', status: 'dropped', lastName: 'Ely', firstName: 'Di' },
    ];
    const enrollments = [{ studentId: 's3', schoolYear: SY, status: 'enrolled' }];
    expect(unassignedStudents(students, enrollments, SY).map((s) => s.id)).toEqual(['s2', 's1']);
    expect(unassignedCount(students, enrollments, SY)).toBe(2);
  });
});

describe('labels', () => {
  it('lists grades that have sections this school year', () => {
    expect(gradesInScope([{ gradeLevel: '8', schoolYear: SY }, { gradeLevel: 7, schoolYear: SY }, { gradeLevel: 9, schoolYear: 'old' }], SY)).toEqual([7, 8]);
  });
  it('titles sections', () => {
    expect(sectionTitle({ gradeLevel: 11, name: 'Rizal', strand: 'STEM' })).toBe('Grade 11 · Rizal · STEM');
    expect(sectionTitle({ gradeLevel: 7, name: 'Mabini' })).toBe('Grade 7 · Mabini');
    expect(sectionTitle(undefined)).toBe('Unavailable section');
  });
  it('formats units and rates', () => {
    expect(formatUnits(1200)).toBe('1,200');
    expect(formatUnits(2.5)).toBe('2.5');
    expect(formatRate(50)).toBe('50%');
    expect(formatRate(null)).toBe('—');
  });
});
```

`fullName` returns `LASTNAME, FIRSTNAME` in capitals, so "ABAD, BEN" sorts before "CRUZ, ANA".

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/dashboardStats.widgets.test.js`
Expected: FAIL. `sexBreakdown` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/dashboardStats.js`, replace the existing `unassignedCount` function with:

```js
export function unassignedStudents(students, enrollments, schoolYear) {
  const enrolledIds = new Set(
    enrollments
      .filter((e) => e.schoolYear === schoolYear && e.status === 'enrolled')
      .map((e) => e.studentId)
  );
  return students
    .filter((s) => s.status === 'active' && !enrolledIds.has(s.id))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));
}

export function unassignedCount(students, enrollments, schoolYear) {
  return unassignedStudents(students, enrollments, schoolYear).length;
}
```

Append:

```js
const sexTally = () => ({ male: 0, female: 0, unknown: 0, total: 0 });
const bumpSex = (t, sex) => { t[sex === 'M' ? 'male' : sex === 'F' ? 'female' : 'unknown'] += 1; t.total += 1; };

// Learners enrolled this school year by sex. Any value other than 'M' or 'F' is counted as unknown
// ("Not recorded") so the totals always match enrollment.
export function sexBreakdown({ students, enrollments, sections, schoolYear, grade = null }) {
  const byId = new Map(students.map((s) => [s.id, s]));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const total = sexTally();
  const grades = new Map();
  const bySection = new Map();
  for (const e of enrollments) {
    if (e.schoolYear !== schoolYear || e.status !== 'enrolled') continue;
    const student = byId.get(e.studentId);
    if (!student) continue;
    const g = Number(e.gradeLevel);
    if (grade != null && g !== Number(grade)) continue;
    bumpSex(total, student.sex);
    if (!grades.has(g)) grades.set(g, { grade: g, ...sexTally() });
    bumpSex(grades.get(g), student.sex);
    if (e.sectionId) {
      if (!bySection.has(e.sectionId)) bySection.set(e.sectionId, { sectionId: e.sectionId, gradeLevel: g, name: sectionById.get(e.sectionId)?.name || 'Unavailable section', ...sexTally() });
      bumpSex(bySection.get(e.sectionId), student.sex);
    }
  }
  return {
    ...total,
    byGrade: [...grades.values()].sort((a, b) => a.grade - b.grade),
    bySection: [...bySection.values()].sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)),
  };
}

export function shsBreakdown(enrollments, sections, schoolYear) {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const groups = new Map();
  for (const e of enrollments) {
    if (e.schoolYear !== schoolYear || e.status !== 'enrolled' || Number(e.gradeLevel) < 11) continue;
    const section = byId.get(e.sectionId);
    const track = section?.track || 'No track';
    const strand = section?.strand || 'No strand';
    const key = `${track}|${strand}`;
    const group = groups.get(key) || { track, strand, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.track.localeCompare(b.track) || a.strand.localeCompare(b.strand));
}

export const gradesInScope = (sections, schoolYear) =>
  [...new Set(sections.filter((s) => s.schoolYear === schoolYear).map((s) => Number(s.gradeLevel)))].sort((a, b) => a - b);

export const sectionTitle = (section) => (section
  ? [section.gradeLevel && `Grade ${section.gradeLevel}`, section.name, section.strand].filter(Boolean).join(' · ')
  : 'Unavailable section');

export const formatUnits = (n) => n.toLocaleString('en-PH', { maximumFractionDigits: 1 });
export const formatRate = (rate) => (rate == null ? '—' : `${rate}%`);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/dashboardStats.widgets.test.js src/lib/dashboardStats.test.js`
Expected: PASS, including the old `unassignedCount` tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboardStats.js src/lib/dashboardStats.widgets.test.js
git commit -m "feat(dashboard): learner breakdowns, unassigned list and labels"
```

---

### Task 4: Posts, activity and attention queues

**Files:**
- Modify: `src/lib/dashboardStats.js`
- Test: `src/lib/dashboardStats.widgets.test.js`

**Interfaces:**
- Consumes: `toMillis`, `manilaDay` (imported in Task 2).
- Produces:
  - `postState(post, nowMs): 'published' | 'scheduled' | 'ended'` (published but past `expiresAt` → ended)
  - `postDate(post): number` (ms: `publishAt` for scheduled, else `publishedAt ?? publishAt`; 0 when missing)
  - `noticePosts(posts, { status = 'all', nowMs, limit = 4 }): post[]`
    - `'all'`: published (pinned first, then newest) followed by scheduled (soonest first)
    - `'published'` / `'scheduled'` / `'ended'`: only that state
  - `postsByDay(posts, nowMs): Record<'YYYY-MM-DD', post[]>` (non-ended posts, keyed by Manila day of `postDate`)
  - `upcomingPosts({ posts, nowMs, day = null, limit = 3 }): post[]`
  - `recentActivity({ enrollments, posts, schoolYear, kind = 'all', limit = 6 }): Item[]`
    - `Item = { key, kind: 'enrollment', day, enrollment } | { key, kind: 'post', day, post, scheduled }`
  - `attentionQueues({ admin, canRequests, unassigned, pendingSections, requests, idCards }): { id, label, count, truncated? }[]`
    - `id` is one of `unassigned | attendance | requests | idcards`

- [ ] **Step 1: Write the failing tests**

Add to the import: `postState, postDate, noticePosts, postsByDay, upcomingPosts, recentActivity, attentionQueues`. Append:

```js
const NOW = Date.UTC(2026, 10, 20, 4, 0); // 20 Nov 2026, 12:00 Manila
const P = {
  p1: { id: 'p1', status: 'published', publishedAt: Date.UTC(2026, 10, 19, 2), title: 'One' },
  p2: { id: 'p2', status: 'published', publishedAt: Date.UTC(2026, 10, 18, 2), expiresAt: Date.UTC(2026, 10, 19, 0), title: 'Expired' },
  p3: { id: 'p3', status: 'scheduled', publishAt: Date.UTC(2026, 10, 23, 1), createdAt: Date.UTC(2026, 10, 17, 1), title: 'Later' },
  p4: { id: 'p4', status: 'unpublished', publishedAt: Date.UTC(2026, 10, 10, 2), title: 'Pulled' },
  p5: { id: 'p5', status: 'scheduled', publishAt: Date.UTC(2026, 10, 21, 1), createdAt: Date.UTC(2026, 10, 18, 1), title: 'Soon' },
  p6: { id: 'p6', status: 'published', publishedAt: Date.UTC(2026, 10, 20, 1), pinned: true, title: 'Pinned' },
};
const posts = Object.values(P);

describe('posts', () => {
  it('derives state with expiry', () => {
    expect(['p1', 'p2', 'p3', 'p4'].map((id) => postState(P[id], NOW))).toEqual(['published', 'ended', 'scheduled', 'ended']);
    expect(postDate(P.p3)).toBe(P.p3.publishAt);
    expect(postDate({})).toBe(0);
  });

  it('orders the notice board: live first (pinned, newest), then scheduled (soonest)', () => {
    expect(noticePosts(posts, { nowMs: NOW }).map((p) => p.id)).toEqual(['p6', 'p1', 'p5', 'p3']);
    expect(noticePosts(posts, { nowMs: NOW, status: 'scheduled' }).map((p) => p.id)).toEqual(['p5', 'p3']);
    expect(noticePosts(posts, { nowMs: NOW, status: 'ended', limit: 50 }).map((p) => p.id)).toEqual(['p2', 'p4']);
    expect(noticePosts(posts, { nowMs: NOW, limit: 2 })).toHaveLength(2);
  });

  it('buckets current posts by Manila day, including just after midnight', () => {
    const late = { id: 'p7', status: 'scheduled', publishAt: Date.UTC(2026, 10, 21, 16, 30) }; // 00:30 on the 22nd, Manila
    const days = postsByDay([...posts, late], NOW);
    expect(Object.keys(days).sort()).toEqual(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23']);
    expect(days['2026-11-22'].map((p) => p.id)).toEqual(['p7']);
  });

  it('lists upcoming scheduled posts, or one day’s posts', () => {
    expect(upcomingPosts({ posts, nowMs: NOW }).map((p) => p.id)).toEqual(['p5', 'p3']);
    expect(upcomingPosts({ posts, nowMs: NOW, day: '2026-11-20' }).map((p) => p.id)).toEqual(['p6']);
  });
});

describe('recentActivity', () => {
  const enrollments = [
    { studentId: 'a', sectionId: 'A', schoolYear: SY, status: 'enrolled', dateEnrolled: '2026-11-20' },
    { studentId: 'b', sectionId: 'A', schoolYear: SY, status: 'enrolled', dateEnrolled: '2026-11-19' },
    { studentId: 'c', sectionId: 'A', schoolYear: SY, status: 'enrolled', dateEnrolled: '' },
    { studentId: 'd', sectionId: 'A', schoolYear: SY, status: 'dropped', dateEnrolled: '2026-11-20' },
  ];

  it('merges enrollments and posts newest first, posts before enrollments on the same day', () => {
    const items = recentActivity({ enrollments, posts, schoolYear: SY, limit: 50 });
    expect(items.map((i) => i.key)).toEqual(['p:p6', 'e:a', 'p:p1', 'e:b', 'p:p2', 'p:p5', 'p:p3']);
    expect(items.find((i) => i.key === 'p:p5')).toMatchObject({ kind: 'post', day: '2026-11-18', scheduled: true });
  });

  it('filters by kind and limits', () => {
    expect(recentActivity({ enrollments, posts, schoolYear: SY, kind: 'enrollment' }).map((i) => i.key)).toEqual(['e:a', 'e:b']);
    expect(recentActivity({ enrollments, posts, schoolYear: SY })).toHaveLength(6);
  });
});

describe('attentionQueues', () => {
  const counts = { unassigned: 3, pendingSections: 2, requests: { count: 50, truncated: true }, idCards: 4 };

  it('shows every non-empty queue to admins', () => {
    expect(attentionQueues({ admin: true, canRequests: true, ...counts }).map((q) => [q.id, q.count])).toEqual([
      ['unassigned', 3], ['attendance', 2], ['requests', 50], ['idcards', 4],
    ]);
    expect(attentionQueues({ admin: true, canRequests: true, ...counts })[2].truncated).toBe(true);
  });

  it('hides admin-only rows and empty queues', () => {
    expect(attentionQueues({ admin: false, canRequests: false, ...counts }).map((q) => q.id)).toEqual(['attendance']);
    expect(attentionQueues({ admin: true, canRequests: true, unassigned: 0, pendingSections: 0, requests: { count: 0 }, idCards: 0 })).toEqual([]);
  });
});
```

Two cases to note:
- In `recentActivity`, p3 (scheduled, created 17 Nov) sorts after p5 (created 18 Nov).
- The expired p2 still appears, because its publish event happened. The unpublished p4 does not.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/dashboardStats.widgets.test.js`
Expected: FAIL. `postState` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/dashboardStats.js`:

```js
export function postState(post, nowMs) {
  if (post.status === 'scheduled') return 'scheduled';
  const expires = toMillis(post.expiresAt);
  if (post.status === 'published' && !(expires != null && expires <= nowMs)) return 'published';
  return 'ended';
}

export const postDate = (post) =>
  toMillis(post.status === 'scheduled' ? post.publishAt : (post.publishedAt ?? post.publishAt)) ?? 0;

const STATE_RANK = { published: 0, scheduled: 1, ended: 2 };

// Notice board order: what is live now (pinned first, then newest), then what is coming (soonest first).
export function noticePosts(posts, { status = 'all', nowMs, limit = 4 }) {
  const state = new Map(posts.map((p) => [p.id, postState(p, nowMs)]));
  return posts
    .filter((p) => (status === 'all' ? state.get(p.id) !== 'ended' : state.get(p.id) === status))
    .sort((a, b) => {
      const sa = state.get(a.id);
      const sb = state.get(b.id);
      if (sa !== sb) return STATE_RANK[sa] - STATE_RANK[sb];
      if (sa === 'published' && Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      const byDate = sa === 'scheduled' ? postDate(a) - postDate(b) : postDate(b) - postDate(a);
      return byDate || a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

export function postsByDay(posts, nowMs) {
  const out = {};
  for (const post of posts) {
    const ms = postDate(post);
    if (!ms || postState(post, nowMs) === 'ended') continue;
    (out[manilaDay(ms)] ||= []).push(post);
  }
  for (const list of Object.values(out)) list.sort((a, b) => postDate(a) - postDate(b) || a.id.localeCompare(b.id));
  return out;
}

export function upcomingPosts({ posts, nowMs, day = null, limit = 3 }) {
  if (day) return (postsByDay(posts, nowMs)[day] || []).slice(0, limit);
  return posts
    .filter((p) => p.status === 'scheduled' && postDate(p) > nowMs)
    .sort((a, b) => postDate(a) - postDate(b) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

// Enrollments (by dateEnrolled) and posts (published: publishedAt; scheduled: when it was scheduled)
// as one newest-first feed. Same day: posts before enrollments, then by key, so the order is stable.
export function recentActivity({ enrollments, posts, schoolYear, kind = 'all', limit = 6 }) {
  const items = [];
  if (kind !== 'post') {
    for (const e of enrollments) {
      if (e.schoolYear !== schoolYear || e.status !== 'enrolled' || !e.dateEnrolled) continue;
      items.push({ key: `e:${e.studentId}`, kind: 'enrollment', day: e.dateEnrolled, enrollment: e });
    }
  }
  if (kind !== 'enrollment') {
    for (const post of posts) {
      if (post.status !== 'published' && post.status !== 'scheduled') continue;
      const ms = toMillis(post.status === 'scheduled' ? post.createdAt : post.publishedAt);
      if (!ms) continue;
      items.push({ key: `p:${post.id}`, kind: 'post', day: manilaDay(ms), post, scheduled: post.status === 'scheduled' });
    }
  }
  const rank = { post: 0, enrollment: 1 };
  return items
    .sort((a, b) => b.day.localeCompare(a.day) || rank[a.kind] - rank[b.kind] || a.key.localeCompare(b.key))
    .slice(0, limit);
}

export function attentionQueues({ admin, canRequests, unassigned, pendingSections, requests, idCards }) {
  return [
    admin && { id: 'unassigned', label: 'Learners without a section', count: unassigned },
    { id: 'attendance', label: 'Sections without attendance today', count: pendingSections },
    canRequests && { id: 'requests', label: 'Learner requests waiting', count: requests.count, truncated: Boolean(requests.truncated) },
    admin && { id: 'idcards', label: 'ID cards waiting to print', count: idCards },
  ].filter((q) => q && q.count > 0);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/dashboardStats.widgets.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboardStats.js src/lib/dashboardStats.widgets.test.js
git commit -m "feat(dashboard): notice, calendar, activity and attention data"
```

---

### Task 5: Panel URL state, `Modal.closeLabel`, `ResourceState.inline`

**Files:**
- Create: `src/hooks/useDashboardPanel.js`
- Test: `src/hooks/useDashboardPanel.test.js`
- Modify: `src/components/ui.jsx:46-60` (`Modal`), `src/components/ui.jsx:82-87` (`ResourceState`)

**Interfaces:**
- Produces:
  - `PANEL_IDS: string[]` = `['attendance','sex','enrollment','coverage','attention','notices','calendar','activity']`
  - `readPanel(search: string): string | null` (`upcoming` is an alias of `calendar`)
  - `panelHref(href: string, id: string | null): string` (path + search + hash)
  - `useDashboardPanel(): { panel: string | null, open(id), close() }`
  - `<Modal closeLabel="…">` (default `'Close dialog'`)
  - `<ResourceState inline>`: on error it renders a borderless alert plus a ghost "Try again" instead of a nested `Card`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useDashboardPanel.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { PANEL_IDS, readPanel, panelHref } from './useDashboardPanel.js';

describe('dashboard panel URL', () => {
  it('reads known panels and the upcoming alias', () => {
    expect(readPanel('?panel=attendance')).toBe('attendance');
    expect(readPanel('?foo=1&panel=upcoming')).toBe('calendar');
    expect(PANEL_IDS.every((id) => readPanel(`?panel=${id}`) === id)).toBe(true);
  });

  it('ignores unknown or missing panels', () => {
    expect(readPanel('?panel=bogus')).toBe(null);
    expect(readPanel('')).toBe(null);
  });

  it('writes and removes the panel while keeping other params and the hash', () => {
    expect(panelHref('https://sims.test/?foo=1#top', 'sex')).toBe('/?foo=1&panel=sex#top');
    expect(panelHref('https://sims.test/?foo=1&panel=sex#top', null)).toBe('/?foo=1#top');
    expect(panelHref('https://sims.test/?panel=sex', null)).toBe('/');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/hooks/useDashboardPanel.test.js`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useDashboardPanel.js`:

```js
import { useCallback, useEffect, useState } from 'react';

// The dashboard's open drawer, mirrored in ?panel=<id> so a refresh or a shared link reopens it.
// This is SIMS's only URL state: written with replaceState, never adding history entries.
export const PANEL_IDS = ['attendance', 'sex', 'enrollment', 'coverage', 'attention', 'notices', 'calendar', 'activity'];
const ALIASES = { upcoming: 'calendar' };

export function readPanel(search) {
  const raw = new URLSearchParams(search).get('panel');
  const id = ALIASES[raw] || raw;
  return PANEL_IDS.includes(id) ? id : null;
}

export function panelHref(href, id) {
  const url = new URL(href);
  if (id) url.searchParams.set('panel', id);
  else url.searchParams.delete('panel');
  return `${url.pathname}${url.search}${url.hash}`;
}

const writePanel = (id) => {
  const { pathname, search, hash, href } = window.location;
  const next = panelHref(href, id);
  if (next !== `${pathname}${search}${hash}`) window.history.replaceState(window.history.state, '', next);
};

let mounted = 0;

export function useDashboardPanel() {
  const [panel, setPanel] = useState(() => readPanel(window.location.search));
  useEffect(() => {
    mounted += 1;
    writePanel(readPanel(window.location.search)); // drops an unknown id and rewrites an alias
    return () => {
      mounted -= 1;
      // StrictMode unmounts and remounts once in development; only a real exit from the dashboard clears the URL.
      setTimeout(() => { if (mounted === 0) writePanel(null); }, 0);
    };
  }, []);
  const open = useCallback((id) => { setPanel(id); writePanel(id); }, []);
  const close = useCallback(() => { setPanel(null); writePanel(null); }, []);
  return { panel, open, close };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/useDashboardPanel.test.js`
Expected: PASS.

- [ ] **Step 5: Extend `Modal` and `ResourceState`**

In `src/components/ui.jsx`, change the `Modal` signature and its close button:

```jsx
export function Modal({ children, onClose, width = 520, overlayClassName = '', title, labelledBy, dismissible = true, closeLabel = 'Close dialog' }) {
```

```jsx
      {dismissible && <button type="button" className="sims-btn sims-btn--icon sims-dialog-close" aria-label={closeLabel} onClick={onClose}><NavIcon name="close" size={18} /></button>}
```

Replace `ResourceState` with:

```jsx
export function ResourceState({ resources, children, label = 'records', inline = false }) {
  const failed = resources.filter(r => r.error);
  const retry = () => failed.forEach(r => r.retry());
  if (failed.length && inline) return <div className="sims-inline-error"><p role="alert" className="sims-feedback">Could not load {label}. Please try again.</p><Btn variant="ghost" onClick={retry}>Try again</Btn></div>;
  if (failed.length) return <Card style={{ padding:24 }}><p role="alert" className="sims-feedback">Could not load {label}. Please try again.</p><Btn onClick={retry}>Try again</Btn></Card>;
  if (resources.some(r => r.loading)) return <div className="sims-loading" role="status"><span className="sims-sr-only">Loading {label}…</span><div className="sims-skeleton" aria-hidden="true"><span /><span /><span /></div></div>;
  return children;
}
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. Existing behaviour is unchanged because both new props are opt-in.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useDashboardPanel.js src/hooks/useDashboardPanel.test.js src/components/ui.jsx
git commit -m "feat(dashboard): panel URL state; Modal closeLabel and inline ResourceState"
```

---

### Task 6: Widget chrome, data hook and base styles

**Files:**
- Modify: `src/components/NavIcon.jsx`
- Create: `src/components/dashboard/useDashboardData.js`
- Create: `src/components/dashboard/WidgetCard.jsx`
- Create: `src/components/dashboard/WidgetDrawer.jsx`
- Create: `src/components/dashboard/parts.jsx`
- Create: `src/dashboard.css`
- Modify: `shared/theme/literals.test.js:15`

**Interfaces:**
- Consumes: Task 2–5 exports.
- Produces:
  - `useDashboardData({ me, schoolYear })` returns:
    - `{ me, admin, canRequests, schoolYear, today, nowMs, students, sections, enrollments, attendance, studentsById, sectionsById, rosterMap, coverage, requests, posts, idCardIds }`
    - `resources: { roster: Resource[], posts: Resource[], idCards: Resource[] }`
  - `<WidgetCard title subtitle? filter? expanded onExpand? resources? label? className? footer?>`
  - `<WidgetFilter label value options={[[value,label]]} onChange(value)>` (named export from `WidgetCard.jsx`)
  - `<WidgetDrawer title pageLink={ {label,page,params} | null } onNavigate(page, params) onClose resources?>`
  - `parts.jsx`:
    - `<DataTable label columns={[{key,label,num?}]} rows={[{key,...}]} empty={[title,hint]}>`
    - `<Segmented label value options onChange>`
    - `<ListRow title meta? action onClick>`
  - NavIcon names `expand` and `chevronRight`

- [ ] **Step 1: Add the icons**

In `src/components/NavIcon.jsx`, add two entries to `paths` (after `panel`):

```js
  expand: 'M14 4h6v6 M20 4l-7 7 M10 20H4v-6 M4 20l7-7',
  chevronRight: 'M10 7l5 5-5 5',
```

- [ ] **Step 2: Create the data hook**

Create `src/components/dashboard/useDashboardData.js`:

```js
import { useMemo } from 'react';
import { collection } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useCollectionResource, useQueryResource, useStaffCollectionResource } from '../../hooks/useCollection.js';
import { useLocalToday } from '../../hooks/useLocalToday.js';
import { useLearnerRequestCount } from '../../hooks/useLearnerRequestCount.js';
import { canOpen, grades, isAdmin, scopeRoster } from '../../lib/access.js';
import { attendanceCoverage, rosterBySection } from '../../lib/dashboardStats.js';

// Everything the dashboard reads, loaded once and scoped to the signed-in person's grades.
export function useDashboardData({ me, schoolYear }) {
  const studentsResource = useStaffCollectionResource('students', { me, schoolYear });
  const sectionsResource = useStaffCollectionResource('sections', { me, schoolYear });
  const enrollmentsResource = useStaffCollectionResource('enrollments', { me, schoolYear });
  const attendanceResource = useStaffCollectionResource('student_attendance', { me, schoolYear });
  const postsResource = useCollectionResource('announcements');
  const admin = isAdmin(me);
  const canRequests = canOpen(me, 'learnerRequests');
  // Rules let only admins read the ID card batch; everyone else never opens the listener.
  const idCardsResource = useQueryResource(() => (admin ? collection(db, 'id_card_batch') : null), [admin]);
  const requests = useLearnerRequestCount(canRequests);
  const today = useLocalToday();

  const { students, sections, enrollments, attendance } = useMemo(() => scopeRoster({
    students: studentsResource.data, sections: sectionsResource.data,
    enrollments: enrollmentsResource.data, attendance: attendanceResource.data,
  }, grades(me), schoolYear), [studentsResource.data, sectionsResource.data, enrollmentsResource.data, attendanceResource.data, me, schoolYear]);

  const studentsById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const sectionsById = useMemo(() => Object.fromEntries(sections.map((s) => [s.id, s])), [sections]);
  const rosterMap = useMemo(() => rosterBySection(students, enrollments, schoolYear), [students, enrollments, schoolYear]);
  const coverage = useMemo(() => attendanceCoverage({ students, sections, enrollments, attendance, schoolYear, date: today }),
    [students, sections, enrollments, attendance, schoolYear, today]);
  // Post states depend on the clock; recomputed whenever posts or the day change.
  const nowMs = useMemo(() => Date.now(), [postsResource.data, today]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    me, admin, canRequests, schoolYear, today, nowMs,
    students, sections, enrollments, attendance, studentsById, sectionsById, rosterMap, coverage, requests,
    posts: postsResource.data,
    idCardIds: idCardsResource.data.map((d) => d.id),
    resources: {
      roster: [studentsResource, sectionsResource, enrollmentsResource, attendanceResource],
      posts: [postsResource],
      idCards: admin ? [idCardsResource] : [],
    },
  };
}
```

- [ ] **Step 3: Create the card chrome**

Create `src/components/dashboard/WidgetCard.jsx`:

```jsx
import { useId } from 'react';
import { Btn, Card, ResourceState, Sel } from '../ui.jsx';
import NavIcon from '../NavIcon.jsx';

// One compact filter in a card header. options: [[value, label], ...]
export function WidgetFilter({ label, value, options, onChange }) {
  return <Sel aria-label={label} className="sims-widget-filter" value={value} onChange={(e) => onChange(e.target.value)}>
    {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
  </Sel>;
}

// Dashboard card: title row (title, optional subtitle, optional filter, expand button) and a body that
// shows its own loading and error state, so one failed feed never blanks the page.
export default function WidgetCard({ title, subtitle, filter, expanded = false, onExpand, resources = [], label, className = '', footer, children }) {
  const headingId = useId();
  return <Card as="section" surface="summary" aria-labelledby={headingId} className={`sims-widget ${className}`}>
    <header className="sims-widget-head">
      <div className="sims-widget-titles">
        <h2 id={headingId}>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {filter}
      {onExpand && <Btn variant="icon" aria-label={`Expand ${title}`} title={`Expand ${title}`} aria-haspopup="dialog" aria-expanded={expanded} onClick={onExpand}>
        <NavIcon name="expand" size={18} />
      </Btn>}
    </header>
    <div className="sims-widget-body">
      <ResourceState resources={resources} label={label || title.toLowerCase()} inline>{children}</ResourceState>
    </div>
    {footer && <div className="sims-widget-foot">{footer}</div>}
    {onExpand && <Btn variant="quiet" className="sims-widget-more" onClick={onExpand}>View details</Btn>}
  </Card>;
}
```

- [ ] **Step 4: Create the drawer**

Create `src/components/dashboard/WidgetDrawer.jsx`:

```jsx
import { Btn, Modal, ResourceState } from '../ui.jsx';
import NavIcon from '../NavIcon.jsx';

// A right-side drawer over the dashboard. Native <dialog> (via Modal): Escape, backdrop click,
// focus trap and focus return to the expand button come from DialogFrame.
export default function WidgetDrawer({ title, pageLink, onNavigate, onClose, resources = [], children }) {
  return <Modal title={title} width={560} overlayClassName="sims-side-drawer" onClose={onClose} closeLabel={`Close ${title}`}>
    <div className="sims-side-drawer-body">
      <ResourceState resources={resources} label={title.toLowerCase()} inline>{children}</ResourceState>
    </div>
    {pageLink && <div className="sims-side-drawer-foot">
      <Btn variant="quiet" onClick={() => { onClose(); onNavigate(pageLink.page, pageLink.params ?? null); }}>
        {pageLink.label} <NavIcon name="arrow" size={16} />
      </Btn>
    </div>}
  </Modal>;
}
```

- [ ] **Step 5: Create shared parts**

Create `src/components/dashboard/parts.jsx`:

```jsx
import { EmptyState } from '../ui.jsx';
import NavIcon from '../NavIcon.jsx';

// Detail table inside a named, keyboard-scrollable region. The first column is the row header.
export function DataTable({ label, columns, rows, empty }) {
  if (!rows.length) return <EmptyState title={empty[0]} hint={empty[1]} />;
  return <div className="sims-table-scroll" role="region" aria-label={label} tabIndex={0}>
    <table className="sims-widget-table">
      <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={c.num ? 'is-num' : undefined}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.key}>{columns.map((c, i) => (i === 0
        ? <th key={c.key} scope="row">{row[c.key]}</th>
        : <td key={c.key} className={c.num ? 'is-num' : undefined}>{row[c.key]}</td>))}</tr>)}</tbody>
    </table>
  </div>;
}

// One-of-many filter in a drawer, using the existing segmented control. options: [[value, label], ...]
export function Segmented({ label, value, options, onChange }) {
  return <div role="group" aria-label={label} className="sims-segmented">
    {options.map(([v, text]) => <button key={v} type="button" className="sims-segment" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>)}
  </div>;
}

// A full-width actionable row: title and optional meta on the left, action text and chevron on the right.
export function ListRow({ title, meta, action, onClick, icon }) {
  return <button type="button" className="sims-list-row" onClick={onClick}>
    <span className="sims-list-main">
      {icon && <NavIcon name={icon} size={16} />}
      <span><strong>{title}</strong>{meta && <small>{meta}</small>}</span>
    </span>
    <span className="sims-list-action">{action}<NavIcon name="chevronRight" size={16} /></span>
  </button>;
}
```

`registrar.css` already styles `.sims-segment[aria-pressed="true"]`, so `Segmented` needs no new CSS.

- [ ] **Step 6: Create the base stylesheet**

Create `src/dashboard.css`:

```css
/* SIMS dashboard: widget grid, cards and the detail drawer. Tokens only (shared/theme/theme.css). */
@media screen {
  .sims-ui .sims-dashboard-date { margin:8px 0 0; font-size:13px; color:var(--t-muted); }

  /* Layout: main column + 320px rail. Rows inside main respond to main's own width. */
  .sims-ui .sims-dash-layout { display:grid; grid-template-columns:minmax(0,1fr); gap:24px; align-items:start; }
  .sims-ui .sims-dash-layout.has-rail { grid-template-columns:minmax(0,1fr) 320px; }
  .sims-ui .sims-dash-main { display:flex; flex-direction:column; gap:20px; min-width:0; container:dash-main / inline-size; }
  .sims-ui .sims-dash-rail { display:flex; flex-direction:column; gap:20px; min-width:0; }
  .sims-ui .sims-dash-row { display:grid; gap:20px; }
  .sims-ui .sims-dash-row.is-two { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .sims-ui .sims-dash-row.is-three { grid-template-columns:repeat(3,minmax(0,1fr)); }

  /* Widget card */
  .sims-ui .sims-widget { display:flex; flex-direction:column; gap:16px; padding:20px; min-width:0; }
  .sims-ui .sims-widget-head { display:flex; align-items:flex-start; gap:8px; }
  .sims-ui .sims-widget-titles { flex:1; min-width:0; }
  .sims-ui .sims-widget-titles h2 { margin:0; font-size:16px; font-weight:600; line-height:1.4; letter-spacing:-.01em; color:var(--t-ink); }
  .sims-ui .sims-widget-titles p { margin:2px 0 0; font-size:13px; line-height:1.5; color:var(--t-muted); }
  .sims-ui .sims-widget-filter { width:auto; flex-shrink:0; font-size:13px; }
  .sims-ui .sims-widget-head .sims-btn--icon { flex-shrink:0; border-color:transparent; }
  .sims-ui .sims-widget-body { flex:1; min-width:0; }
  .sims-ui .sims-widget-foot { display:flex; justify-content:flex-end; }
  .sims-ui .sims-widget-more { display:none; align-self:flex-start; }
  .sims-ui .sims-widget-note { margin:8px 0 0; font-size:12px; line-height:1.5; color:var(--t-muted); }
  .sims-ui .sims-inline-error { display:flex; flex-direction:column; align-items:flex-start; gap:12px; padding:8px 0; }
  @media (pointer:fine) {
    .sims-ui .sims-widget-head .sims-btn--icon, .sims-ui .sims-widget-filter { --sims-control-height:32px; }
  }

  /* Count chips inside dashboard lists are calm teal, not the red navigation badge. */
  .sims-ui .sims-dashboard .sims-count-badge { margin-left:0; min-width:24px; height:22px; color:var(--t-primary-deep); background:var(--t-tint-strong); }

  /* Actionable rows */
  .sims-ui .sims-list { list-style:none; margin:0; padding:0; }
  .sims-ui .sims-list-row { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; min-height:44px; padding:10px 8px; background:transparent; color:var(--t-ink); border:0; border-top:1px solid var(--t-border); border-radius:0; font:inherit; font-size:13px; text-align:left; cursor:pointer; transition:background-color 150ms ease-out; }
  .sims-ui .sims-list > li:first-child .sims-list-row { border-top:0; }
  .sims-ui .sims-list-row:hover { background:var(--t-row-hover); }
  .sims-ui .sims-list-row:focus-visible { outline:2px solid var(--t-focus); outline-offset:-2px; border-radius:8px; }
  .sims-ui .sims-list-main { display:flex; align-items:center; gap:10px; min-width:0; }
  .sims-ui .sims-list-main svg { color:var(--t-muted); flex-shrink:0; }
  .sims-ui .sims-list-main strong { display:block; font-weight:500; overflow-wrap:anywhere; }
  .sims-ui .sims-list-main small { display:block; margin-top:2px; font-size:12px; color:var(--t-muted); }
  .sims-ui .sims-list-action { display:flex; align-items:center; gap:6px; flex-shrink:0; font-size:12px; color:var(--t-primary); }

  /* Detail tables */
  .sims-ui .sims-widget-table { width:100%; border-collapse:collapse; font-size:13px; }
  .sims-ui .sims-widget-table th[scope="col"] { padding:8px 12px; text-align:left; font-size:12px; font-weight:500; color:var(--t-muted); white-space:nowrap; }
  .sims-ui .sims-widget-table th[scope="row"] { text-align:left; font-weight:500; color:var(--t-ink); }
  .sims-ui .sims-widget-table th[scope="row"], .sims-ui .sims-widget-table td { padding:10px 12px; border-top:1px solid var(--t-border); }
  .sims-ui .sims-widget-table td { color:var(--t-subtle); }
  .sims-ui .sims-widget-table .is-num { text-align:right; font-variant-numeric:tabular-nums; }

  /* Drawer */
  .sims-ui .sims-dialog.sims-side-drawer { margin:16px 16px 16px auto; height:calc(100dvh - 32px); max-height:calc(100dvh - 32px); padding:24px 24px 0; }
  .sims-ui .sims-dialog.sims-side-drawer[open] { animation:sims-side-drawer-in 200ms cubic-bezier(.16,1,.3,1); }
  .sims-ui .sims-side-drawer-body { display:flex; flex-direction:column; gap:24px; padding-bottom:24px; }
  .sims-ui .sims-side-drawer-foot { position:sticky; bottom:0; display:flex; justify-content:flex-end; padding:12px 0 16px; background:var(--t-dialog); border-top:1px solid var(--t-border); }
  .sims-ui .sims-drawer-section h3 { margin:0 0 8px; font-size:13px; font-weight:600; color:var(--t-ink); }
  .sims-ui .sims-drawer-filters { display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
  @keyframes sims-side-drawer-in { from { opacity:.7; transform:translateX(24px); } to { opacity:1; transform:none; } }
}

@container dash-main (max-width:760px) {
  .sims-ui .sims-dash-row.is-three { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .sims-ui .sims-dash-row.is-three > :last-child { grid-column:1 / -1; }
}
@container dash-main (max-width:560px) {
  .sims-ui .sims-dash-row.is-two, .sims-ui .sims-dash-row.is-three { grid-template-columns:minmax(0,1fr); }
  .sims-ui .sims-dash-row.is-three > :last-child { grid-column:auto; }
}
@media screen and (max-width:1279px) {
  .sims-ui .sims-dash-layout.has-rail { grid-template-columns:minmax(0,1fr); }
  .sims-ui .sims-dash-rail { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start; }
}
@media screen and (max-width:767px) {
  .sims-ui .sims-dash-rail { grid-template-columns:minmax(0,1fr); }
  .sims-ui .sims-widget { padding:16px; }
  .sims-ui .sims-widget-more { display:inline-flex; }
  .sims-ui .sims-dialog.sims-side-drawer { width:calc(100vw - 24px)!important; max-width:calc(100vw - 24px)!important; margin:12px; height:calc(100dvh - 24px); max-height:calc(100dvh - 24px); padding:20px 20px 0; }
}
```

- [ ] **Step 7: Make the literals test scan the new stylesheet**

In `shared/theme/literals.test.js`, change line 15 to:

```js
const THEMED_CSS = ['src/registrar.css', 'src/enrollment.css', 'src/dashboard.css', 'parent/src/app.css', 'parent/src/screens/school/ClassTab.css'];
```

- [ ] **Step 8: Verify**

Run: `npm test`
Expected: PASS. `literals.test.js` now scans `src/dashboard.css` and finds no literals.

Run: `npm run build`
Expected: the build succeeds. The new modules are not imported yet, so this only checks that existing imports are untouched. If the build needs `VITE_*` values, load them from the main checkout's `.env` into this process only; never copy or print the file.

- [ ] **Step 9: Commit**

```bash
git add src/components/NavIcon.jsx src/components/dashboard/useDashboardData.js src/components/dashboard/WidgetCard.jsx src/components/dashboard/WidgetDrawer.jsx src/components/dashboard/parts.jsx src/dashboard.css shared/theme/literals.test.js
git commit -m "feat(dashboard): widget card, drawer, data hook and base styles"
```

---

### Task 7: New layout with KPI strip, Enrollment and Coverage

**Files:**
- Create: `src/components/dashboard/widgets/KpiStrip.jsx`
- Create: `src/components/dashboard/widgets/EnrollmentWidget.jsx`
- Create: `src/components/dashboard/widgets/CoverageWidget.jsx`
- Rewrite: `src/pages/DashboardPage.jsx`
- Modify: `src/dashboard.css` (append)

**Interfaces:**
- Consumes:
  - from Task 6: `useDashboardData`, `WidgetCard`, `WidgetDrawer`, `DataTable`, `ListRow`, `useDashboardPanel`
  - from Tasks 2–3: `attendanceTally`, `sectionTitle`, `shsBreakdown`, `formatRate`
- Produces:
  - `<KpiStrip data todayRate onNavigate onOpenPanel>`
  - `EnrollmentCard`, `EnrollmentDetail`
  - `CoverageCard({ data, expanded, onExpand, onTakeAttendance })`, `CoverageDetail({ data, onTakeAttendance })`
  - `DashboardPage` with anchors (`is-two` row, `is-three` row, `drawers` object) that later tasks extend

- [ ] **Step 1: KPI strip**

Create `src/components/dashboard/widgets/KpiStrip.jsx`:

```jsx
import NavIcon from '../../NavIcon.jsx';
import { canOpen } from '../../../lib/access.js';
import { activeStudentCount, enrolledCount, formatRate, unassignedCount } from '../../../lib/dashboardStats.js';
import { isWeekend } from '../../../lib/dates.js';
import { UNASSIGNED } from '../../../lib/constants.js';

// Headline numbers. A tile is a button only when it has somewhere this person may go.
export default function KpiStrip({ data, todayRate, onNavigate, onOpenPanel }) {
  const { me, admin, canRequests, students, enrollments, sections, schoolYear, coverage, requests, today } = data;
  const rate = isWeekend(today) ? null : todayRate;
  const page = (name, params) => (canOpen(me, name) ? () => onNavigate(name, params ?? null) : null);
  const tiles = [
    { label: 'Active learners', value: activeStudentCount(students), icon: 'students', go: page('students', { status: 'active' }) },
    { label: 'Enrolled this school year', value: enrolledCount(enrollments, schoolYear), icon: 'enroll', go: page('enroll') },
    { label: 'Sections this school year', value: sections.filter((s) => s.schoolYear === schoolYear).length, icon: 'sections', go: page('sections') },
    { label: "Today's present rate", value: formatRate(rate), icon: 'attendance', go: () => onOpenPanel('attendance'),
      sub: rate == null ? 'No attendance recorded today' : `${coverage.recordedCount} of ${coverage.totalSections} sections recorded` },
    admin && { label: 'Unassigned learners', value: unassignedCount(students, enrollments, schoolYear), icon: 'students',
      go: page('students', { gradeFilter: UNASSIGNED, status: 'active' }) },
    canRequests && { label: 'Open learner requests', value: requests.truncated ? `${requests.count}+` : requests.count, icon: 'accounts',
      go: page('learnerRequests') },
  ].filter(Boolean);
  return <div className="sims-kpis">
    {tiles.map((t) => {
      const body = <>
        <span className="sims-kpi-label"><NavIcon name={t.icon} size={16} />{t.label}</span>
        <strong>{typeof t.value === 'number' ? t.value.toLocaleString() : t.value}</strong>
        {t.sub && <small>{t.sub}</small>}
      </>;
      return t.go
        ? <button type="button" key={t.label} className="sims-kpi" onClick={t.go}>{body}</button>
        : <div key={t.label} className="sims-kpi">{body}</div>;
    })}
  </div>;
}
```

- [ ] **Step 2: Enrollment widget**

Create `src/components/dashboard/widgets/EnrollmentWidget.jsx`:

```jsx
import { useMemo } from 'react';
import WidgetCard from '../WidgetCard.jsx';
import { DataTable } from '../parts.jsx';
import GradeBarChart from '../../GradeBarChart.jsx';
import { EmptyState } from '../../ui.jsx';
import { fullName } from '../../../lib/roster.js';
import { countByGrade, enrolledCount, recentEnrolledSections, recentEnrollments, sectionTitle, shsBreakdown } from '../../../lib/dashboardStats.js';

export function EnrollmentCard({ data, expanded, onExpand }) {
  const { enrollments, schoolYear, admin } = data;
  return <WidgetCard title="Enrollment by grade" subtitle={admin ? 'This school year, across all sections' : 'This school year, in your grade levels'}
    expanded={expanded} onExpand={onExpand} resources={data.resources.roster} label="enrollment">
    {enrolledCount(enrollments, schoolYear)
      ? <GradeBarChart counts={countByGrade(enrollments, schoolYear)} />
      : <EmptyState title="No enrollments yet" hint="Enroll a learner to begin your school-year overview." />}
  </WidgetCard>;
}

export function EnrollmentDetail({ data }) {
  const { enrollments, sections, schoolYear, studentsById, sectionsById } = data;
  const bySection = useMemo(() => recentEnrolledSections(enrollments, schoolYear), [enrollments, schoolYear]);
  const shs = useMemo(() => shsBreakdown(enrollments, sections, schoolYear), [enrollments, sections, schoolYear]);
  const recent = useMemo(() => recentEnrollments(enrollments, schoolYear, 30), [enrollments, schoolYear]);
  return <>
    <section className="sims-drawer-section"><h3>By grade</h3><GradeBarChart counts={countByGrade(enrollments, schoolYear)} /></section>
    <section className="sims-drawer-section"><h3>Sections</h3>
      <DataTable label="Enrolled learners by section" empty={['No enrolled sections', 'Sections with enrollments this school year will appear here.']}
        columns={[{ key: 'section', label: 'Section' }, { key: 'latest', label: 'Latest enrollment' }, { key: 'count', label: 'Enrolled learners', num: true }]}
        rows={bySection.map((r) => ({ key: r.sectionId, section: sectionTitle(sectionsById[r.sectionId]), latest: r.latestDate || '—', count: r.count.toLocaleString() }))} />
    </section>
    {shs.length > 0 && <section className="sims-drawer-section"><h3>Senior high track and strand</h3>
      <DataTable label="Senior high enrollment by track and strand" empty={['', '']}
        columns={[{ key: 'track', label: 'Track' }, { key: 'strand', label: 'Strand' }, { key: 'count', label: 'Learners', num: true }]}
        rows={shs.map((r) => ({ key: `${r.track}|${r.strand}`, track: r.track, strand: r.strand, count: r.count.toLocaleString() }))} />
    </section>}
    <section className="sims-drawer-section"><h3>Recent enrollments</h3>
      <DataTable label="Recent enrollments" empty={['No recent enrollments', 'New enrollments for this school year will appear here.']}
        columns={[{ key: 'learner', label: 'Learner' }, { key: 'section', label: 'Section' }, { key: 'date', label: 'Enrolled' }]}
        rows={recent.map((e) => ({ key: `${e.studentId}_${e.schoolYear}`, learner: studentsById[e.studentId] ? fullName(studentsById[e.studentId]) : 'Unavailable learner',
          section: sectionTitle(sectionsById[e.sectionId]), date: e.dateEnrolled || '—' }))} />
    </section>
  </>;
}
```

- [ ] **Step 3: Coverage widget**

Create `src/components/dashboard/widgets/CoverageWidget.jsx`:

```jsx
import WidgetCard from '../WidgetCard.jsx';
import { ListRow } from '../parts.jsx';
import { EmptyState } from '../../ui.jsx';
import { isWeekend } from '../../../lib/dates.js';

const sectionMeta = (s) => `Grade ${s.gradeLevel}${s.strand ? ` · ${s.strand}` : ''}`;

function SectionLinks({ sections, onPick }) {
  return <ul className="sims-list">{sections.map((s) => <li key={s.id}>
    <ListRow title={s.name} meta={sectionMeta(s)} action="Take attendance" onClick={() => onPick(s)} />
  </li>)}</ul>;
}

export function CoverageCard({ data, expanded, onExpand, onTakeAttendance }) {
  const { recordedCount, totalSections, percent, pendingSections } = data.coverage;
  const weekend = isWeekend(data.today);
  return <WidgetCard title="Attendance coverage" subtitle={weekend ? 'No school day today' : 'Sections with a record today'}
    expanded={expanded} onExpand={onExpand} resources={data.resources.roster} label="attendance coverage">
    {totalSections ? <>
      <div className="sims-metric">{percent}<span>%</span></div>
      <progress className="sims-progress" aria-label="Sections with attendance records today" max={totalSections} value={recordedCount} />
      <p className="sims-widget-note">{recordedCount} of {totalSections} enrolled sections</p>
      {!weekend && pendingSections.length > 0 && <SectionLinks sections={pendingSections.slice(0, 3)} onPick={onTakeAttendance} />}
    </> : <EmptyState title="No enrolled sections" hint="Enroll learners to begin recording attendance." />}
  </WidgetCard>;
}

export function CoverageDetail({ data, onTakeAttendance }) {
  const { eligibleSections, pendingSections } = data.coverage;
  const pendingIds = new Set(pendingSections.map((s) => s.id));
  const recorded = eligibleSections.filter((s) => !pendingIds.has(s.id));
  return <>
    <section className="sims-drawer-section"><h3>Waiting for a record ({pendingSections.length})</h3>
      {pendingSections.length ? <SectionLinks sections={pendingSections} onPick={onTakeAttendance} />
        : <EmptyState title="Every section has a record" hint="All enrolled sections have attendance for today." />}
    </section>
    <section className="sims-drawer-section"><h3>Recorded ({recorded.length})</h3>
      {recorded.length ? <ul className="sims-list">{recorded.map((s) => <li key={s.id} className="sims-list-static"><strong>{s.name}</strong><small>{sectionMeta(s)}</small></li>)}</ul>
        : <EmptyState title="Nothing recorded yet" hint="Sections appear here once attendance is saved today." />}
    </section>
    <p className="sims-widget-note">Records may come from registrar entry or kiosk activity. This does not indicate completed review or learner presence.</p>
  </>;
}
```

- [ ] **Step 4: Rewrite the page**

Replace `src/pages/DashboardPage.jsx` with:

```jsx
import { useMemo } from 'react';
import { Btn, ResourceState } from '../components/ui.jsx';
import NavIcon from '../components/NavIcon.jsx';
import AttentionPanel from '../components/dashboard/AttentionPanel.jsx';
import WidgetDrawer from '../components/dashboard/WidgetDrawer.jsx';
import { useDashboardData } from '../components/dashboard/useDashboardData.js';
import { useDashboardPanel } from '../hooks/useDashboardPanel.js';
import KpiStrip from '../components/dashboard/widgets/KpiStrip.jsx';
import { EnrollmentCard, EnrollmentDetail } from '../components/dashboard/widgets/EnrollmentWidget.jsx';
import { CoverageCard, CoverageDetail } from '../components/dashboard/widgets/CoverageWidget.jsx';
import { attendanceTally, unassignedCount } from '../lib/dashboardStats.js';
import { canOpen } from '../lib/access.js';
import { UNASSIGNED } from '../lib/constants.js';
import '../dashboard.css';

export default function DashboardPage({ me, schoolYear, setPage }) {
  const data = useDashboardData({ me, schoolYear });
  const { panel, open, close } = useDashboardPanel();
  const { today, admin } = data;
  const link = (label, page, params) => (canOpen(me, page) ? { label, page, params } : null);
  const takeAttendance = (section) => setPage('attendance', { attendanceEntry: { sectionId: section.id, date: today } });
  const todayTally = useMemo(() => attendanceTally({ roster: data.rosterMap, attendance: data.attendance, schoolYear, dates: [today] }),
    [data.rosterMap, data.attendance, schoolYear, today]);
  const card = (id) => ({ data, expanded: panel === id, onExpand: () => open(id) });
  const roster = data.resources.roster;
  const drawers = {
    enrollment: { title: 'Enrollment by grade', link: link('Open Enrollment', 'enroll'), resources: roster, body: <EnrollmentDetail data={data} /> },
    coverage: { title: 'Attendance coverage', link: link('Open Attendance', 'attendance'), resources: roster, body: <CoverageDetail data={data} onTakeAttendance={takeAttendance} /> },
  };
  const drawer = panel ? drawers[panel] : null;
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return <div className="sims-dashboard">
    <div className="sims-heading">
      <div><h1>Your school day, at a glance.</h1><p className="sims-dashboard-date">{dateLabel}</p></div>
      {admin && <Btn onClick={() => setPage('enroll')}>Enroll a learner <NavIcon name="enroll" size={17} /></Btn>}
    </div>
    <div className="sims-dash-layout">
      <div className="sims-dash-main">
        <ResourceState resources={roster} label="dashboard summary" inline>
          <AttentionPanel unassigned={unassignedCount(data.students, data.enrollments, schoolYear)} pendingSections={data.coverage.pendingSections}
            totalSections={data.coverage.totalSections} date={today} showUnassigned={admin}
            onUnassigned={() => setPage('students', { gradeFilter: UNASSIGNED, status: 'active' })} onSection={takeAttendance} />
          <KpiStrip data={data} todayRate={todayTally.days[0]?.rate ?? null} onNavigate={setPage} onOpenPanel={open} />
        </ResourceState>
        <div className="sims-dash-row is-two">
          <EnrollmentCard {...card('enrollment')} />
        </div>
        <div className="sims-dash-row is-three">
          <CoverageCard {...card('coverage')} onTakeAttendance={takeAttendance} />
        </div>
      </div>
    </div>
    {drawer && <WidgetDrawer title={drawer.title} pageLink={drawer.link} resources={drawer.resources} onNavigate={setPage} onClose={close}>{drawer.body}</WidgetDrawer>}
  </div>;
}
```

`AttentionPanel` stays here temporarily; Task 9 replaces it.

- [ ] **Step 5: Append the KPI and coverage styles**

Append inside a new `@media screen { … }` block at the end of `src/dashboard.css`:

```css
@media screen {
  .sims-ui .sims-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:16px; }
  .sims-ui .sims-kpi { display:flex; flex-direction:column; align-items:flex-start; gap:8px; min-height:104px; padding:16px 20px; font:inherit; text-align:left; color:var(--t-ink); background:var(--t-surface); border:1px solid var(--t-border); border-radius:12px; }
  .sims-ui button.sims-kpi { cursor:pointer; transition:background-color 150ms ease-out,border-color 150ms ease-out; }
  .sims-ui button.sims-kpi:hover { background:var(--t-row-hover); border-color:var(--t-border-strong); }
  .sims-ui button.sims-kpi:focus-visible { outline:2px solid var(--t-focus); outline-offset:2px; }
  .sims-ui .sims-kpi-label { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; color:var(--t-muted); }
  .sims-ui .sims-kpi-label svg { color:var(--t-stat-icon); flex-shrink:0; }
  .sims-ui .sims-kpi strong { font-size:26px; font-weight:600; line-height:1.1; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
  .sims-ui .sims-kpi small { font-size:12px; color:var(--t-muted); }

  .sims-ui .sims-metric { font-size:36px; font-weight:600; line-height:1.1; letter-spacing:-.02em; font-variant-numeric:tabular-nums; color:var(--t-ink); }
  .sims-ui .sims-metric span { margin-left:4px; font-size:20px; color:var(--t-muted); }
  .sims-ui .sims-progress { display:block; width:100%; height:8px; margin:12px 0 0; appearance:none; border:0; border-radius:999px; overflow:hidden; background:var(--t-chart-track); accent-color:var(--t-decor); }
  .sims-ui .sims-progress::-webkit-progress-bar { background:var(--t-chart-track); }
  .sims-ui .sims-progress::-webkit-progress-value { background:var(--t-decor); border-radius:999px; }
  .sims-ui .sims-progress::-moz-progress-bar { background:var(--t-decor); border-radius:999px; }
  .sims-ui .sims-widget-body > .sims-list { margin-top:12px; }
  .sims-ui .sims-list-static { display:flex; flex-direction:column; padding:10px 8px; border-top:1px solid var(--t-border); font-size:13px; }
  .sims-ui .sims-list > .sims-list-static:first-child { border-top:0; }
  .sims-ui .sims-list-static strong { font-weight:500; color:var(--t-ink); }
  .sims-ui .sims-list-static small { margin-top:2px; font-size:12px; color:var(--t-muted); }
}
@media screen and (max-width:767px) {
  .sims-ui .sims-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
}
```

- [ ] **Step 6: Verify**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: the build succeeds.

Browser check (see the Task 13 harness; a quick check is fine here): the dashboard shows the KPI tiles, the Enrollment card and the Coverage card. Expand opens the right drawer with the URL at `?panel=enrollment`. Escape closes the drawer, removes the param and returns focus to the expand button.

- [ ] **Step 7: Commit**

```bash
git add src/pages/DashboardPage.jsx src/components/dashboard/widgets src/dashboard.css
git commit -m "feat(dashboard): widget layout with KPI strip, enrollment and coverage drawers"
```

---

### Task 8: Weekly attendance and Learners by sex

**Files:**
- Create: `src/components/dashboard/widgets/AttendanceWidget.jsx`
- Create: `src/components/dashboard/widgets/SexWidget.jsx`
- Modify: `src/pages/DashboardPage.jsx`
- Modify: `src/dashboard.css` (append)

**Interfaces:**
- Consumes: `attendanceTally`, `gradesInScope`, `formatUnits`, `formatRate`, `sexBreakdown`, `percentOf`, `sectionTitle`, `weekdaysOf`, `addDays`, `schoolDaysToDate`, `dayLabel`, `WidgetCard`, `WidgetFilter`, `DataTable`, `Segmented`.
- Produces: `AttendanceCard`, `AttendanceDetail`, `SexCard`, `SexDetail`.

- [ ] **Step 1: Attendance widget**

Create `src/components/dashboard/widgets/AttendanceWidget.jsx`:

```jsx
import { useMemo, useState } from 'react';
import WidgetCard, { WidgetFilter } from '../WidgetCard.jsx';
import { DataTable, Segmented } from '../parts.jsx';
import { attendanceTally, formatRate, formatUnits, gradesInScope, sectionTitle } from '../../../lib/dashboardStats.js';
import { addDays, dayLabel, schoolDaysToDate, weekdaysOf } from '../../../lib/dates.js';

export function DayBars({ days, today }) {
  return <div className="sims-daybars" role="list" aria-label="Attendance rate by day">
    {days.map((d) => {
      const isToday = d.date === today;
      return <div role="listitem" key={d.date} className={`sims-daybar${isToday ? ' is-today' : ''}`}
        aria-label={`${dayLabel(d.date, { weekday: 'long', month: 'long', day: 'numeric' })}: ${d.rate == null ? 'not recorded' : `${d.rate}% present`}`}>
        <strong aria-hidden="true">{formatRate(d.rate)}</strong>
        <span className="sims-daybar-track" aria-hidden="true"><span className="sims-daybar-fill" style={{ height: `${d.rate ?? 0}%` }} /></span>
        <span aria-hidden="true">{isToday ? 'Today' : dayLabel(d.date, { weekday: 'short' })}</span>
      </div>;
    })}
  </div>;
}

const useTally = (data, dates, sectionIds) => useMemo(
  () => attendanceTally({ roster: data.rosterMap, attendance: data.attendance, schoolYear: data.schoolYear, dates, sectionIds }),
  [data.rosterMap, data.attendance, data.schoolYear, dates.join(), sectionIds?.join()], // eslint-disable-line react-hooks/exhaustive-deps
);

export function AttendanceCard({ data, expanded, onExpand }) {
  const [week, setWeek] = useState('this');
  const dates = weekdaysOf(week === 'this' ? data.today : addDays(data.today, -7));
  const tally = useTally(data, dates);
  return <WidgetCard title="Weekly attendance" subtitle="Present and late, as a share of learners in recorded sections"
    filter={<WidgetFilter label="Week" value={week} onChange={setWeek} options={[['this', 'This week'], ['last', 'Last week']]} />}
    expanded={expanded} onExpand={onExpand} resources={data.resources.roster} label="weekly attendance">
    <DayBars days={tally.days} today={data.today} />
  </WidgetCard>;
}

const unitColumns = [
  { key: 'present', label: 'Present', num: true }, { key: 'late', label: 'Late', num: true },
  { key: 'absent', label: 'Absent', num: true }, { key: 'excused', label: 'Excused', num: true }, { key: 'rate', label: 'Rate', num: true },
];
const unitCells = (t) => ({ present: formatUnits(t.present), late: formatUnits(t.late), absent: formatUnits(t.absent), excused: formatUnits(t.excused), rate: formatRate(t.rate) });

export function AttendanceDetail({ data }) {
  const [grade, setGrade] = useState('all');
  const [period, setPeriod] = useState('week');
  const grades = gradesInScope(data.sections, data.schoolYear);
  const sectionIds = grade === 'all' ? null : data.sections.filter((s) => s.schoolYear === data.schoolYear && Number(s.gradeLevel) === Number(grade)).map((s) => s.id);
  const dates = period === 'week' ? weekdaysOf(data.today) : schoolDaysToDate(data.today);
  const tally = useTally(data, dates, sectionIds);
  return <>
    <div className="sims-drawer-filters">
      <Segmented label="Period" value={period} onChange={setPeriod} options={[['week', 'This week'], ['month', 'Month to date']]} />
      <WidgetFilter label="Grade" value={grade} onChange={setGrade} options={[['all', 'All grades'], ...grades.map((g) => [String(g), `Grade ${g}`])]} />
    </div>
    {period === 'week' && <section className="sims-drawer-section"><DayBars days={tally.days} today={data.today} /></section>}
    <section className="sims-drawer-section"><h3>By day</h3>
      <DataTable label="Attendance by day" empty={['No school days yet', 'Weekdays in this period will appear here.']}
        columns={[{ key: 'date', label: 'Date' }, { key: 'recorded', label: 'Sections recorded', num: true }, ...unitColumns]}
        rows={tally.days.map((d) => ({ key: d.date, date: dayLabel(d.date, { weekday: 'short', month: 'short', day: 'numeric' }), recorded: d.sectionsRecorded, ...unitCells(d) }))} />
    </section>
    <section className="sims-drawer-section"><h3>By section</h3>
      <DataTable label="Attendance by section" empty={['No attendance recorded', 'Sections appear here once attendance is saved in this period.']}
        columns={[{ key: 'section', label: 'Section' }, { key: 'days', label: 'Days recorded', num: true }, ...unitColumns]}
        rows={tally.sections.map((s) => ({ key: s.sectionId, section: sectionTitle(data.sectionsById[s.sectionId]), days: s.daysRecorded, ...unitCells(s) }))
          .sort((a, b) => a.section.localeCompare(b.section))} />
    </section>
    <p className="sims-widget-note">Present includes late arrivals. A section-day without an attendance record is left out of the rate. Half-day absences count as half a day.</p>
  </>;
}
```

- [ ] **Step 2: Sex widget**

Create `src/components/dashboard/widgets/SexWidget.jsx`:

```jsx
import { useMemo, useState } from 'react';
import WidgetCard, { WidgetFilter } from '../WidgetCard.jsx';
import { DataTable } from '../parts.jsx';
import { EmptyState } from '../../ui.jsx';
import { gradesInScope, percentOf, sexBreakdown } from '../../../lib/dashboardStats.js';

const segmentsOf = (r) => [
  { key: 'male', label: 'Male', value: r.male },
  { key: 'female', label: 'Female', value: r.female },
  { key: 'unknown', label: 'Not recorded', value: r.unknown },
];

function Donut({ segments, total }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return <figure className="sims-donut">
    <svg viewBox="0 0 136 136" aria-hidden="true">
      <circle cx="68" cy="68" r={r} className="sims-donut-track" />
      {total > 0 && segments.filter((s) => s.value).map((s) => {
        const len = (c * s.value) / total;
        const arc = <circle key={s.key} cx="68" cy="68" r={r} className={`sims-donut-seg is-${s.key}`}
          strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 68 68)" />;
        offset += len;
        return arc;
      })}
    </svg>
    <figcaption><strong>{total.toLocaleString()}</strong><span>learners</span></figcaption>
  </figure>;
}

function Legend({ segments, total }) {
  return <ul className="sims-legend">
    {segments.filter((s) => s.key !== 'unknown' || s.value).map((s) => <li key={s.key}>
      <span className={`sims-legend-dot is-${s.key}`} aria-hidden="true" />{s.label}
      <strong>{s.value.toLocaleString()}</strong><small>{percentOf(s.value, total) ?? 0}%</small>
    </li>)}
  </ul>;
}

export function SexCard({ data, expanded, onExpand }) {
  const [grade, setGrade] = useState('all');
  const grades = gradesInScope(data.sections, data.schoolYear);
  const r = useMemo(() => sexBreakdown({ students: data.students, enrollments: data.enrollments, sections: data.sections, schoolYear: data.schoolYear, grade: grade === 'all' ? null : grade }),
    [data.students, data.enrollments, data.sections, data.schoolYear, grade]);
  const segments = segmentsOf(r);
  return <WidgetCard title="Learners by sex" subtitle="Enrolled this school year"
    filter={<WidgetFilter label="Grade" value={grade} onChange={setGrade} options={[['all', 'All grades'], ...grades.map((g) => [String(g), `Grade ${g}`])]} />}
    expanded={expanded} onExpand={onExpand} resources={data.resources.roster} label="learners by sex">
    {r.total ? <>
      <Donut segments={segments} total={r.total} />
      <Legend segments={segments} total={r.total} />
    </> : <EmptyState title="No enrolled learners" hint="Enrolled learners will be counted here." />}
  </WidgetCard>;
}

const sexColumns = (first) => [first,
  { key: 'male', label: 'Male', num: true }, { key: 'female', label: 'Female', num: true },
  { key: 'unknown', label: 'Not recorded', num: true }, { key: 'total', label: 'Total', num: true }];
const sexCells = (t) => ({ male: t.male.toLocaleString(), female: t.female.toLocaleString(), unknown: t.unknown.toLocaleString(), total: t.total.toLocaleString() });

export function SexDetail({ data }) {
  const r = useMemo(() => sexBreakdown({ students: data.students, enrollments: data.enrollments, sections: data.sections, schoolYear: data.schoolYear }),
    [data.students, data.enrollments, data.sections, data.schoolYear]);
  return <>
    <section className="sims-drawer-section"><h3>By grade</h3>
      <DataTable label="Learners by sex and grade" empty={['No enrolled learners', 'Enrolled learners will be counted here.']}
        columns={sexColumns({ key: 'grade', label: 'Grade' })}
        rows={r.byGrade.map((g) => ({ key: g.grade, grade: `Grade ${g.grade}`, ...sexCells(g) }))} />
    </section>
    <section className="sims-drawer-section"><h3>By section</h3>
      <DataTable label="Learners by sex and section" empty={['No enrolled learners', 'Enrolled learners will be counted here.']}
        columns={sexColumns({ key: 'section', label: 'Section' })}
        rows={r.bySection.map((s) => ({ key: s.sectionId, section: `Grade ${s.gradeLevel} · ${s.name}`, ...sexCells(s) }))} />
    </section>
    <p className="sims-widget-note">"Not recorded" counts learners whose sex is missing from their record.</p>
  </>;
}
```

- [ ] **Step 3: Wire them into the page**

In `src/pages/DashboardPage.jsx`, add these imports below the coverage import:

```jsx
import { AttendanceCard, AttendanceDetail } from '../components/dashboard/widgets/AttendanceWidget.jsx';
import { SexCard, SexDetail } from '../components/dashboard/widgets/SexWidget.jsx';
```

Add to the `drawers` object:

```jsx
    attendance: { title: 'Weekly attendance', link: link('Open Attendance', 'attendance'), resources: roster, body: <AttendanceDetail data={data} /> },
    sex: { title: 'Learners by sex', link: link('Open Students', 'students'), resources: roster, body: <SexDetail data={data} /> },
```

Replace the two rows with:

```jsx
        <div className="sims-dash-row is-two">
          <EnrollmentCard {...card('enrollment')} />
          <AttendanceCard {...card('attendance')} />
        </div>
        <div className="sims-dash-row is-three">
          <SexCard {...card('sex')} />
          <CoverageCard {...card('coverage')} onTakeAttendance={takeAttendance} />
        </div>
```

- [ ] **Step 4: Append the chart styles**

Append to `src/dashboard.css`:

```css
@media screen {
  .sims-ui .sims-daybars { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:12px; align-items:end; }
  .sims-ui .sims-daybar { display:flex; flex-direction:column; align-items:center; gap:8px; min-width:0; }
  .sims-ui .sims-daybar strong { font-size:12px; font-weight:500; color:var(--t-subtle); font-variant-numeric:tabular-nums; }
  .sims-ui .sims-daybar-track { display:flex; align-items:flex-end; width:100%; max-width:56px; height:150px; background:var(--t-chart-track); border-radius:8px; overflow:hidden; }
  .sims-ui .sims-daybar-fill { width:100%; background:var(--t-decor-soft); border-radius:8px 8px 0 0; }
  .sims-ui .sims-daybar.is-today .sims-daybar-fill { background:var(--t-decor); }
  .sims-ui .sims-daybar > span:last-child { font-size:12px; color:var(--t-muted); }
  .sims-ui .sims-daybar.is-today strong, .sims-ui .sims-daybar.is-today > span:last-child { color:var(--t-ink); font-weight:600; }

  .sims-ui .sims-donut { position:relative; width:152px; height:152px; margin:0 auto; }
  .sims-ui .sims-donut svg { display:block; width:100%; height:100%; }
  .sims-ui .sims-donut circle { fill:none; stroke-width:18; }
  .sims-ui .sims-donut-track { stroke:var(--t-chart-track); }
  .sims-ui .sims-donut-seg.is-male { stroke:var(--t-decor); }
  .sims-ui .sims-donut-seg.is-female { stroke:var(--t-decor-soft); }
  .sims-ui .sims-donut-seg.is-unknown { stroke:var(--t-decor-mid); }
  .sims-ui .sims-donut figcaption { position:absolute; inset:0; display:grid; place-content:center; text-align:center; }
  .sims-ui .sims-donut figcaption strong { font-size:26px; font-weight:600; line-height:1.1; font-variant-numeric:tabular-nums; color:var(--t-ink); }
  .sims-ui .sims-donut figcaption span { font-size:12px; color:var(--t-muted); }
  .sims-ui .sims-legend { list-style:none; margin:16px 0 0; padding:0; display:flex; flex-direction:column; gap:8px; }
  .sims-ui .sims-legend li { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--t-subtle); }
  .sims-ui .sims-legend strong { margin-left:auto; font-weight:600; color:var(--t-ink); font-variant-numeric:tabular-nums; }
  .sims-ui .sims-legend small { min-width:40px; text-align:right; color:var(--t-muted); font-variant-numeric:tabular-nums; }
  .sims-ui .sims-legend-dot { width:8px; height:8px; border-radius:999px; flex-shrink:0; }
  .sims-ui .sims-legend-dot.is-male { background:var(--t-decor); }
  .sims-ui .sims-legend-dot.is-female { background:var(--t-decor-soft); }
  .sims-ui .sims-legend-dot.is-unknown { background:var(--t-decor-mid); }
}
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run build`
Expected: both pass.

Browser check:
- The weekly bars show today's bar in the deeper teal with "Today" in ink.
- Days with no record read "—".
- The donut legend numbers add up to the centre total.
- `?panel=attendance` and `?panel=sex` open the right drawers on reload.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/widgets/AttendanceWidget.jsx src/components/dashboard/widgets/SexWidget.jsx src/pages/DashboardPage.jsx src/dashboard.css
git commit -m "feat(dashboard): weekly attendance and learners-by-sex widgets"
```

---

### Task 9: Needs attention (replaces AttentionPanel)

**Files:**
- Create: `src/components/dashboard/widgets/AttentionWidget.jsx`
- Modify: `src/pages/DashboardPage.jsx`
- Delete: `src/components/dashboard/AttentionPanel.jsx`
- Modify: `src/dashboard.css` (append)

**Interfaces:**
- Consumes: `attentionQueues`, `unassignedStudents`, `isWeekend`, `ListRow`, `CountBadge`, `fullName`.
- Produces:
  - `AttentionCard({ data, queues, expanded, onExpand, onQueue })`
  - `AttentionDetail({ data, queues, onQueue, onTakeAttendance })`
  - `onQueue(id)` with `id ∈ unassigned | attendance | requests | idcards`

- [ ] **Step 1: Widget**

Create `src/components/dashboard/widgets/AttentionWidget.jsx`:

```jsx
import WidgetCard from '../WidgetCard.jsx';
import { ListRow } from '../parts.jsx';
import { CountBadge, EmptyState } from '../../ui.jsx';
import NavIcon from '../../NavIcon.jsx';
import { fullName } from '../../../lib/roster.js';
import { unassignedStudents } from '../../../lib/dashboardStats.js';

const ICON = { unassigned: 'students', attendance: 'attendance', requests: 'accounts', idcards: 'idcards' };
const countText = (q) => (q.truncated ? `${q.count}+` : q.count.toLocaleString());

export function AttentionCard({ data, queues, expanded, onExpand, onQueue }) {
  return <WidgetCard title="Needs attention" subtitle="Queues waiting on staff" expanded={expanded} onExpand={onExpand}
    resources={[...data.resources.roster, ...data.resources.idCards]} label="attention queues">
    {queues.length
      ? <ul className="sims-list">{queues.map((q) => <li key={q.id}>
        <button type="button" className="sims-list-row" onClick={() => onQueue(q.id)}>
          <span className="sims-list-main"><NavIcon name={ICON[q.id]} size={16} /><strong>{q.label}</strong></span>
          <span className="sims-list-action"><CountBadge count={countText(q)} label={q.label.toLowerCase()} /><NavIcon name="chevronRight" size={16} /></span>
        </button>
      </li>)}</ul>
      : <EmptyState title="All caught up" hint="Nothing is waiting on you today." />}
  </WidgetCard>;
}

export function AttentionDetail({ data, queues, onQueue, onTakeAttendance }) {
  const ids = new Set(queues.map((q) => q.id));
  if (!queues.length) return <EmptyState title="All caught up" hint="Nothing is waiting on you today." />;
  const unassigned = ids.has('unassigned') ? unassignedStudents(data.students, data.enrollments, data.schoolYear) : [];
  const cards = data.idCardIds.map((id) => data.studentsById[id]).filter(Boolean);
  return <>
    {ids.has('unassigned') && <section className="sims-drawer-section"><h3>Learners without a section ({unassigned.length})</h3>
      <ul className="sims-list">{unassigned.slice(0, 10).map((s) => <li key={s.id} className="sims-list-static"><strong>{fullName(s)}</strong></li>)}</ul>
      <ListRow title="Review unassigned learners" action="Open Students" onClick={() => onQueue('unassigned')} />
    </section>}
    {ids.has('attendance') && <section className="sims-drawer-section"><h3>Sections without attendance today ({data.coverage.pendingSections.length})</h3>
      <ul className="sims-list">{data.coverage.pendingSections.slice(0, 10).map((s) => <li key={s.id}>
        <ListRow title={s.name} meta={`Grade ${s.gradeLevel}${s.strand ? ` · ${s.strand}` : ''}`} action="Take attendance" onClick={() => onTakeAttendance(s)} />
      </li>)}</ul>
    </section>}
    {ids.has('requests') && <section className="sims-drawer-section"><h3>Learner requests waiting</h3>
      <ListRow title={`${countText(queues.find((q) => q.id === 'requests'))} waiting for a decision`} action="Open Learner requests" onClick={() => onQueue('requests')} />
    </section>}
    {ids.has('idcards') && <section className="sims-drawer-section"><h3>ID cards waiting to print ({data.idCardIds.length})</h3>
      <ul className="sims-list">{cards.slice(0, 10).map((s) => <li key={s.id} className="sims-list-static"><strong>{fullName(s)}</strong></li>)}</ul>
      <ListRow title="Print the waiting cards" action="Open ID Cards" onClick={() => onQueue('idcards')} />
    </section>}
  </>;
}
```

- [ ] **Step 2: Wire it in and remove AttentionPanel**

In `src/pages/DashboardPage.jsx`:

1. Delete the `AttentionPanel` import and its JSX block (the `<AttentionPanel … />` element inside `ResourceState`).
2. Change the `dashboardStats` import to `import { attendanceTally, attentionQueues, unassignedCount } from '../lib/dashboardStats.js';`, and add `import { isWeekend } from '../lib/dates.js';` and `import { AttentionCard, AttentionDetail } from '../components/dashboard/widgets/AttentionWidget.jsx';`.
3. After `takeAttendance`, add:

```jsx
  const queues = attentionQueues({
    admin, canRequests: data.canRequests,
    unassigned: unassignedCount(data.students, data.enrollments, schoolYear),
    pendingSections: isWeekend(today) ? 0 : data.coverage.pendingSections.length,
    requests: data.requests, idCards: data.idCardIds.length,
  });
  const onQueue = (id) => {
    if (id === 'unassigned') setPage('students', { gradeFilter: UNASSIGNED, status: 'active' });
    else if (id === 'attendance') open('coverage');
    else if (id === 'requests') setPage('learnerRequests');
    else if (id === 'idcards') setPage('idcards');
  };
```

4. Add to `drawers`:

```jsx
    attention: { title: 'Needs attention', link: null, resources: [...roster, ...data.resources.idCards],
      body: <AttentionDetail data={data} queues={queues} onQueue={(id) => { close(); onQueue(id); }} onTakeAttendance={takeAttendance} /> },
```

5. In the `is-three` row, add after `CoverageCard`:

```jsx
          <AttentionCard {...card('attention')} queues={queues} onQueue={onQueue} />
```

6. Delete the file:

```bash
git rm src/components/dashboard/AttentionPanel.jsx
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run build`
Expected: both pass. `grep -r "AttentionPanel" src` returns nothing.

Browser check:
- As admin, all four rows appear when non-zero.
- As a grade-scoped account, only "Sections without attendance today" (and requests, if allowed) appear.
- With everything at zero, the card shows "All caught up".
- "Sections without attendance today" opens the coverage drawer.

- [ ] **Step 4: Commit**

```bash
git add -A src/components/dashboard src/pages/DashboardPage.jsx
git commit -m "feat(dashboard): needs-attention widget replaces AttentionPanel"
```

---

### Task 10: Notice board

**Files:**
- Create: `src/components/dashboard/widgets/NoticeWidget.jsx`
- Modify: `src/pages/DashboardPage.jsx`
- Modify: `src/dashboard.css` (append)

**Interfaces:**
- Consumes: `noticePosts`, `postState`, `postDate`, `audienceLabel` (`src/lib/announcements.js`), `shortDate` (`src/lib/schoolAssignments.js`), `Badge`, `Segmented`, `WidgetFilter`.
- Produces: `NoticeCard`, `NoticeDetail`, and `NoticeList({ posts, nowMs, preview })`.

- [ ] **Step 1: Widget**

Create `src/components/dashboard/widgets/NoticeWidget.jsx`:

```jsx
import { useState } from 'react';
import WidgetCard, { WidgetFilter } from '../WidgetCard.jsx';
import { Segmented } from '../parts.jsx';
import { Badge, EmptyState } from '../../ui.jsx';
import { audienceLabel } from '../../../lib/announcements.js';
import { shortDate } from '../../../lib/schoolAssignments.js';
import { noticePosts, postDate, postState } from '../../../lib/dashboardStats.js';

const EMPTY = {
  all: ['No current announcements', 'Published and scheduled announcements appear here.'],
  published: ['Nothing published', 'Live announcements appear here.'],
  scheduled: ['Nothing scheduled', 'Scheduled announcements appear here.'],
  ended: ['Nothing has ended', 'Unpublished and expired announcements appear here.'],
};

export function NoticeList({ posts, nowMs, preview = false }) {
  return <ul className="sims-notices">{posts.map((p) => {
    const state = postState(p, nowMs);
    return <li key={p.id} className="sims-notice">
      <div className="sims-notice-title">{p.title}
        {p.pinned && <Badge tone="accent">Pinned</Badge>}
        {state === 'scheduled' && <Badge tone="info">Scheduled</Badge>}
        {state === 'ended' && <Badge>Ended</Badge>}
      </div>
      <div><span className="sims-notice-k">Audience</span><span className="sims-notice-v">{audienceLabel(p.audienceKeys, p.audience)}</span></div>
      <div><span className="sims-notice-k">{state === 'scheduled' ? 'Goes out' : 'Date'}</span><span className="sims-notice-v">{shortDate(postDate(p)) || '—'}</span></div>
      <div><span className="sims-notice-k">Created by</span><span className="sims-notice-v">{p.createdBy?.name || '—'}</span></div>
      {preview && p.body && <p className="sims-notice-preview">{p.body}</p>}
    </li>;
  })}</ul>;
}

export function NoticeCard({ data, expanded, onExpand }) {
  const [status, setStatus] = useState('all');
  const posts = noticePosts(data.posts, { status, nowMs: data.nowMs, limit: 4 });
  return <WidgetCard title="Notice board" subtitle="Announcements to families and staff"
    filter={<WidgetFilter label="Status" value={status} onChange={setStatus} options={[['all', 'All current'], ['published', 'Published'], ['scheduled', 'Scheduled']]} />}
    expanded={expanded} onExpand={onExpand} resources={data.resources.posts} label="announcements">
    {posts.length ? <NoticeList posts={posts} nowMs={data.nowMs} /> : <EmptyState title={EMPTY[status][0]} hint={EMPTY[status][1]} />}
  </WidgetCard>;
}

export function NoticeDetail({ data }) {
  const [status, setStatus] = useState('all');
  const posts = noticePosts(data.posts, { status, nowMs: data.nowMs, limit: 50 });
  return <>
    <Segmented label="Announcement status" value={status} onChange={setStatus}
      options={[['all', 'All current'], ['published', 'Published'], ['scheduled', 'Scheduled'], ['ended', 'Ended']]} />
    {posts.length ? <NoticeList posts={posts} nowMs={data.nowMs} preview /> : <EmptyState title={EMPTY[status][0]} hint={EMPTY[status][1]} />}
  </>;
}
```

- [ ] **Step 2: Wire it in**

In `src/pages/DashboardPage.jsx`, add the import `import { NoticeCard, NoticeDetail } from '../components/dashboard/widgets/NoticeWidget.jsx';`. Add to `drawers`:

```jsx
    notices: { title: 'Notice board', link: link('Open Announcements', 'announcements'), resources: data.resources.posts, body: <NoticeDetail data={data} /> },
```

After the `is-three` row's closing `</div>`, add:

```jsx
        <NoticeCard {...card('notices')} />
```

- [ ] **Step 3: Append the styles**

```css
@media screen {
  .sims-ui .sims-notices { list-style:none; margin:0; padding:0; container:notices / inline-size; }
  .sims-ui .sims-notice { display:grid; grid-template-columns:minmax(0,2fr) minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr); gap:12px; align-items:center; padding:12px 0; border-top:1px solid var(--t-border); font-size:13px; }
  .sims-ui .sims-notice:first-child { border-top:0; padding-top:0; }
  .sims-ui .sims-notice-title { display:flex; flex-wrap:wrap; align-items:center; gap:6px; font-weight:500; color:var(--t-ink); overflow-wrap:anywhere; }
  .sims-ui .sims-notice-k { display:block; font-size:12px; color:var(--t-muted); }
  .sims-ui .sims-notice-v { display:block; color:var(--t-subtle); overflow-wrap:anywhere; }
  .sims-ui .sims-notice-preview { grid-column:1 / -1; margin:0; font-size:13px; color:var(--t-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
}
@container notices (max-width:600px) {
  .sims-ui .sims-notice { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .sims-ui .sims-notice-title { grid-column:1 / -1; }
}
@container notices (max-width:380px) {
  .sims-ui .sims-notice { grid-template-columns:minmax(0,1fr); gap:6px; }
}
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: both pass.

Browser check:
- Seed one pinned, one plain published, one scheduled and one expired post.
- The card shows pinned, published, then scheduled.
- The drawer's Ended filter shows the expired post.
- The drawer is 560px wide and its rows wrap into three columns.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/widgets/NoticeWidget.jsx src/pages/DashboardPage.jsx src/dashboard.css
git commit -m "feat(dashboard): notice board widget"
```

---

### Task 11: Calendar and Upcoming posts (adds the rail)

**Files:**
- Create: `src/components/dashboard/widgets/CalendarWidget.jsx`
- Modify: `src/pages/DashboardPage.jsx`
- Modify: `src/dashboard.css` (append)

**Interfaces:**
- Consumes: `monthGrid`, `shiftMonth`, `addDays`, `monthLabel`, `dayLabel`, `manilaDay`, `postsByDay`, `upcomingPosts`, `postDate`, `audienceLabel`.
- Produces:
  - `CalendarCard({ data, month, onMonth, selectedDay, onSelectDay, expanded, onExpand })`
  - `UpcomingCard({ data, selectedDay, onSelectDay, expanded, onExpand })`
  - `CalendarDetail({ data, month, onMonth })`

- [ ] **Step 1: Widget**

Create `src/components/dashboard/widgets/CalendarWidget.jsx`:

```jsx
import { useMemo, useRef, useState } from 'react';
import WidgetCard from '../WidgetCard.jsx';
import { Btn, EmptyState } from '../../ui.jsx';
import NavIcon from '../../NavIcon.jsx';
import { audienceLabel } from '../../../lib/announcements.js';
import { postDate, postsByDay, upcomingPosts } from '../../../lib/dashboardStats.js';
import { addDays, dayLabel, manilaDay, monthGrid, monthLabel, shiftMonth } from '../../../lib/dates.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STEP = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

function MonthNav({ month, onMonth }) {
  return <div className="sims-cal-head">
    <strong>{monthLabel(month)}</strong>
    <span>
      <Btn variant="icon" aria-label="Previous month" onClick={() => onMonth(shiftMonth(month, -1))}><NavIcon name="collapse" size={16} /></Btn>
      <Btn variant="icon" aria-label="Next month" onClick={() => onMonth(shiftMonth(month, 1))}><NavIcon name="chevronRight" size={16} /></Btn>
    </span>
  </div>;
}

// Month grid with a roving tab stop: arrow keys move by day or week, Page Up/Down change month.
function MonthGrid({ month, onMonth, today, selectedDay, onSelectDay, marks }) {
  const gridRef = useRef(null);
  const [focusDay, setFocusDay] = useState(null);
  const weeks = monthGrid(month);
  const days = weeks.flat().map((d) => d.date);
  const active = [focusDay, selectedDay, today, `${month}-01`].find((d) => d && d.startsWith(month) && days.includes(d));
  const moveTo = (date) => {
    if (date.slice(0, 7) !== month) onMonth(date.slice(0, 7));
    setFocusDay(date);
    requestAnimationFrame(() => gridRef.current?.querySelector(`[data-date="${date}"]`)?.focus());
  };
  const onKeyDown = (e) => {
    if (STEP[e.key]) { e.preventDefault(); moveTo(addDays(active, STEP[e.key])); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); moveTo(`${shiftMonth(month, e.key === 'PageUp' ? -1 : 1)}-01`); }
  };
  return <div role="grid" aria-label={monthLabel(month)} ref={gridRef} className="sims-cal-grid" onKeyDown={onKeyDown}>
    <div role="row" className="sims-cal-row">{WEEKDAYS.map((w) => <span role="columnheader" key={w} className="sims-cal-dow">{w}</span>)}</div>
    {weeks.map((week) => <div role="row" key={week[0].date} className="sims-cal-row">{week.map((d) => {
      const count = marks[d.date]?.length || 0;
      const cls = ['sims-cal-day', !d.inMonth && 'is-outside', d.weekend && 'is-weekend', d.date === today && 'is-today', d.date === selectedDay && 'is-selected'].filter(Boolean).join(' ');
      return <span role="gridcell" key={d.date} aria-selected={d.date === selectedDay}>
        <button type="button" data-date={d.date} tabIndex={d.date === active ? 0 : -1} className={cls}
          aria-current={d.date === today ? 'date' : undefined}
          aria-label={`${dayLabel(d.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${count ? `, ${count} post${count === 1 ? '' : 's'}` : ''}`}
          onClick={() => { setFocusDay(d.date); if (!d.inMonth) onMonth(d.date.slice(0, 7)); onSelectDay(selectedDay === d.date ? null : d.date); }}>
          {Number(d.date.slice(8))}
          {count > 0 && <span className="sims-cal-dot" aria-hidden="true" />}
        </button>
      </span>;
    })}</div>)}
  </div>;
}

const useMarks = (data) => useMemo(() => postsByDay(data.posts, data.nowMs), [data.posts, data.nowMs]);
const postDay = (p) => manilaDay(postDate(p));

function PostRows({ posts }) {
  return <ul className="sims-list">{posts.map((p) => <li key={p.id} className="sims-upcoming-row">
    <span className="sims-date-chip">{dayLabel(postDay(p), { month: 'short', day: 'numeric' })}</span>
    <span><strong>{p.title}</strong><small>{audienceLabel(p.audienceKeys, p.audience)}</small></span>
  </li>)}</ul>;
}

export function CalendarCard({ data, month, onMonth, selectedDay, onSelectDay, expanded, onExpand }) {
  const marks = useMarks(data);
  return <WidgetCard title="Calendar" expanded={expanded} onExpand={onExpand} resources={data.resources.posts} label="calendar">
    <MonthNav month={month} onMonth={onMonth} />
    <MonthGrid month={month} onMonth={onMonth} today={data.today} selectedDay={selectedDay} onSelectDay={onSelectDay} marks={marks} />
  </WidgetCard>;
}

export function UpcomingCard({ data, selectedDay, onSelectDay, expanded, onExpand }) {
  const posts = upcomingPosts({ posts: data.posts, nowMs: data.nowMs, day: selectedDay, limit: 3 });
  const title = selectedDay ? `Posts on ${dayLabel(selectedDay, { month: 'short', day: 'numeric' })}` : 'Upcoming posts';
  return <WidgetCard title={title} expanded={expanded} onExpand={onExpand} resources={data.resources.posts} label="upcoming posts"
    footer={selectedDay && <Btn variant="quiet" onClick={() => onSelectDay(null)}>Show upcoming</Btn>}>
    {posts.length ? <PostRows posts={posts} />
      : selectedDay ? <EmptyState title="No posts on this day" hint="Pick another day, or show upcoming posts." />
        : <EmptyState title="No upcoming posts" hint="Scheduled announcements will appear here." />}
  </WidgetCard>;
}

export function CalendarDetail({ data, month, onMonth }) {
  const marks = useMarks(data);
  const days = Object.keys(marks).filter((d) => d.startsWith(month)).sort();
  return <>
    <MonthNav month={month} onMonth={onMonth} />
    {days.length ? days.map((d) => <section key={d} className="sims-drawer-section">
      <h3>{dayLabel(d, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
      <PostRows posts={marks[d]} />
    </section>) : <EmptyState title="No posts this month" hint="Published and scheduled announcements appear on their day." />}
  </>;
}
```

- [ ] **Step 2: Wire in the rail**

In `src/pages/DashboardPage.jsx`:

1. Change the React import to `import { useMemo, useState } from 'react';` and add `import { CalendarCard, CalendarDetail, UpcomingCard } from '../components/dashboard/widgets/CalendarWidget.jsx';`.
2. After the `useDashboardPanel()` line, add:

```jsx
  const [month, setMonth] = useState(() => data.today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(null);
```

3. Add to `drawers`:

```jsx
    calendar: { title: 'Calendar', link: link('Open Announcements', 'announcements'), resources: data.resources.posts, body: <CalendarDetail data={data} month={month} onMonth={setMonth} /> },
```

4. Change `<div className="sims-dash-layout">` to `<div className="sims-dash-layout has-rail">`. After the closing `</div>` of `sims-dash-main`, add:

```jsx
      <aside className="sims-dash-rail" aria-label="Calendar and activity">
        <CalendarCard {...card('calendar')} month={month} onMonth={setMonth} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
        <UpcomingCard data={data} expanded={panel === 'calendar'} onExpand={() => open('calendar')} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
      </aside>
```

- [ ] **Step 3: Append the styles**

```css
@media screen {
  .sims-ui .sims-cal-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
  .sims-ui .sims-cal-head strong { font-size:14px; font-weight:600; color:var(--t-ink); }
  .sims-ui .sims-cal-head .sims-btn--icon { border-color:transparent; }
  .sims-ui .sims-cal-row { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:2px; }
  .sims-ui .sims-cal-dow { padding:4px 0; text-align:center; font-size:11px; font-weight:500; color:var(--t-muted); }
  .sims-ui .sims-cal-day { position:relative; display:grid; place-items:center; width:100%; height:36px; padding:0; font:inherit; font-size:13px; font-variant-numeric:tabular-nums; color:var(--t-ink); background:transparent; border:2px solid transparent; border-radius:999px; cursor:pointer; transition:background-color 120ms ease-out; }
  .sims-ui .sims-cal-day:hover { background:var(--t-hover); }
  .sims-ui .sims-cal-day.is-weekend { color:var(--t-muted); }
  .sims-ui .sims-cal-day.is-outside { color:var(--t-placeholder); }
  .sims-ui .sims-cal-day.is-today { border-color:var(--t-primary); font-weight:600; }
  .sims-ui .sims-cal-day.is-selected { background:var(--t-selected); color:var(--t-ink); }
  .sims-ui .sims-cal-day:focus-visible { outline:2px solid var(--t-focus); outline-offset:1px; }
  .sims-ui .sims-cal-dot { position:absolute; bottom:3px; left:50%; width:4px; height:4px; margin-left:-2px; border-radius:999px; background:var(--t-decor); }
  @media (pointer:fine) { .sims-ui .sims-cal-head .sims-btn--icon { --sims-control-height:32px; } }
  @media (pointer:coarse) { .sims-ui .sims-cal-day { height:44px; } }

  .sims-ui .sims-upcoming-row { display:grid; grid-template-columns:auto minmax(0,1fr); gap:12px; align-items:start; padding:10px 0; border-top:1px solid var(--t-border); }
  .sims-ui .sims-list > .sims-upcoming-row:first-child { border-top:0; padding-top:0; }
  .sims-ui .sims-upcoming-row strong { display:block; font-size:13px; font-weight:500; color:var(--t-ink); overflow-wrap:anywhere; }
  .sims-ui .sims-upcoming-row small { display:block; margin-top:2px; font-size:12px; color:var(--t-muted); }
  .sims-ui .sims-date-chip { display:inline-block; padding:2px 8px; border-radius:999px; background:var(--t-selected); color:var(--t-primary-deep); font-size:12px; font-weight:500; white-space:nowrap; font-variant-numeric:tabular-nums; }
}
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: both pass.

Browser check:
- Today has the teal ring, and days with posts show a dot.
- Clicking a day filters Upcoming; clicking it again clears the filter.
- Arrow keys move focus and cross into the next month.
- Page Down changes the month.
- `?panel=upcoming` reloads into the Calendar drawer and the URL becomes `?panel=calendar`.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/widgets/CalendarWidget.jsx src/pages/DashboardPage.jsx src/dashboard.css
git commit -m "feat(dashboard): calendar and upcoming posts rail"
```

---

### Task 12: Recent activity

**Files:**
- Create: `src/components/dashboard/widgets/ActivityWidget.jsx`
- Modify: `src/pages/DashboardPage.jsx`
- Modify: `src/dashboard.css` (append)

**Interfaces:**
- Consumes: `recentActivity`, `sectionTitle`, `fullName`, `shortDate`, `toMillis`, `dayLabel`, `Segmented`.
- Produces: `ActivityCard`, `ActivityDetail`.

- [ ] **Step 1: Widget**

Create `src/components/dashboard/widgets/ActivityWidget.jsx`:

```jsx
import { useMemo, useState } from 'react';
import WidgetCard from '../WidgetCard.jsx';
import { Segmented } from '../parts.jsx';
import { EmptyState } from '../../ui.jsx';
import NavIcon from '../../NavIcon.jsx';
import { fullName } from '../../../lib/roster.js';
import { shortDate } from '../../../lib/schoolAssignments.js';
import { toMillis } from '../../../../shared/announcements.js';
import { recentActivity, sectionTitle } from '../../../lib/dashboardStats.js';
import { dayLabel } from '../../../lib/dates.js';

function Sentence({ item, data }) {
  if (item.kind === 'enrollment') {
    const student = data.studentsById[item.enrollment.studentId];
    return <><strong>{student ? fullName(student) : 'Unavailable learner'}</strong> enrolled in {sectionTitle(data.sectionsById[item.enrollment.sectionId])}</>;
  }
  const by = item.post.createdBy?.name ? ` by ${item.post.createdBy.name}` : '';
  return <><strong>{item.post.title}</strong> {item.scheduled ? `scheduled for ${shortDate(toMillis(item.post.publishAt))}` : 'published'}{by}</>;
}

function Timeline({ items, data }) {
  return <ol className="sims-timeline">{items.map((item) => <li key={item.key}>
    <span className="sims-timeline-icon" aria-hidden="true"><NavIcon name={item.kind === 'post' ? 'announcements' : 'enroll'} size={14} /></span>
    <div><p><Sentence item={item} data={data} /></p><small>{dayLabel(item.day, { month: 'short', day: 'numeric', year: 'numeric' })}</small></div>
  </li>)}</ol>;
}

const useItems = (data, kind, limit) => useMemo(
  () => recentActivity({ enrollments: data.enrollments, posts: data.posts, schoolYear: data.schoolYear, kind, limit }),
  [data.enrollments, data.posts, data.schoolYear, kind, limit],
);
const EMPTY = ['No recent activity', 'Enrollments and announcements will appear here.'];

export function ActivityCard({ data, expanded, onExpand }) {
  const items = useItems(data, 'all', 6);
  return <WidgetCard title="Recent activity" expanded={expanded} onExpand={onExpand}
    resources={[...data.resources.roster, ...data.resources.posts]} label="recent activity">
    {items.length ? <Timeline items={items} data={data} /> : <EmptyState title={EMPTY[0]} hint={EMPTY[1]} />}
  </WidgetCard>;
}

export function ActivityDetail({ data }) {
  const [kind, setKind] = useState('all');
  const items = useItems(data, kind, 50);
  return <>
    <Segmented label="Activity type" value={kind} onChange={setKind} options={[['all', 'All'], ['enrollment', 'Enrollments'], ['post', 'Posts']]} />
    {items.length ? <Timeline items={items} data={data} /> : <EmptyState title={EMPTY[0]} hint={EMPTY[1]} />}
  </>;
}
```

- [ ] **Step 2: Wire it in**

In `src/pages/DashboardPage.jsx`, add `import { ActivityCard, ActivityDetail } from '../components/dashboard/widgets/ActivityWidget.jsx';`. Add to `drawers`:

```jsx
    activity: { title: 'Recent activity', link: null, resources: [...roster, ...data.resources.posts], body: <ActivityDetail data={data} /> },
```

In the `<aside>`, after `UpcomingCard`, add:

```jsx
        <ActivityCard {...card('activity')} />
```

- [ ] **Step 3: Append the styles**

```css
@media screen {
  .sims-ui .sims-timeline { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; }
  .sims-ui .sims-timeline li { position:relative; display:grid; grid-template-columns:28px minmax(0,1fr); gap:12px; padding-bottom:16px; }
  .sims-ui .sims-timeline li:last-child { padding-bottom:0; }
  .sims-ui .sims-timeline li:not(:last-child)::before { content:""; position:absolute; left:13.5px; top:32px; bottom:4px; width:1px; background:var(--t-border); }
  .sims-ui .sims-timeline-icon { display:grid; place-items:center; width:28px; height:28px; border-radius:999px; background:var(--t-hover); color:var(--t-muted); }
  .sims-ui .sims-timeline p { margin:0; font-size:13px; line-height:1.5; color:var(--t-subtle); overflow-wrap:anywhere; }
  .sims-ui .sims-timeline p strong { font-weight:500; color:var(--t-ink); }
  .sims-ui .sims-timeline small { display:block; margin-top:2px; font-size:12px; color:var(--t-muted); }
}
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: both pass.

Browser check:
- Learner names show in capitals.
- The same day lists posts before enrollments.
- The drawer's filter switches between kinds.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/widgets/ActivityWidget.jsx src/pages/DashboardPage.jsx src/dashboard.css
git commit -m "feat(dashboard): recent activity widget"
```

---

### Task 13: Cleanup, docs, verification and PR

**Files:**
- Delete: `src/components/dashboard/CoveragePanel.jsx`
- Modify: `src/registrar.css:211-267`
- Modify: `DESIGN.md`
- Modify: `docs/superpowers/specs/2026-11-20-dashboard-expandable-widgets-design.md` (status line only)

- [ ] **Step 1: Remove retired code**

```bash
git rm src/components/dashboard/CoveragePanel.jsx
```

In `src/registrar.css`, delete these rules from the `@media screen` block that starts at the `.sims-dashboard h2` rule (around line 211), and from the two media blocks that follow it:
- `.sims-dashboard h2`, `.sims-dashboard p`, `.sims-dashboard-date`, `.sims-dashboard-pair`
- `.sims-attention-card*`, `.sims-attention-value`, `.sims-attendance-attention`, `.sims-dashboard .sims-count-badge`
- `.sims-attention-list`, `.sims-attention-row*`, `.sims-caught-up`, `.sims-dashboard-totals`, `.sims-stat*`
- `.sims-dashboard-charts`, `.sims-chart-card`, `.sims-coverage*`, `.sims-no-sections`, `.sims-recent*`

Keep these, because other pages use them:
- `.sims-section-label` and `.sims-section-label > span`
- `.sims-card-label`
- `.sims-row-action` (and its 767px rule)
- every `.sims-grade-*` rule (`GradeBarChart` still uses them)

Then confirm nothing references the removed classes:

Run: `git grep -nE "sims-(attention|stat\b|stat-|dashboard-(totals|charts|pair)|chart-card|coverage|recent|caught-up|no-sections)" -- src`
Expected: no output.

- [ ] **Step 2: Update DESIGN.md**

In `DESIGN.md` → `## Layout`, replace the sentence `Dashboard pairs become one column at 1100px; totals stack below 768px.` with:

```markdown
The Dashboard is a main column plus a 320px right rail (Calendar, Upcoming posts, Recent activity). Below 1280px the rail moves under the main column as two columns, and below 768px as one. Rows inside the main column respond to the column's own width (container queries): three-up becomes two-up at 760px and one-up at 560px. KPI tiles fill `repeat(auto-fit, minmax(180px, 1fr))`, two per row on phones.
```

In `## Components`, after the **Stat and tally cards** bullet, add:

```markdown
- **Widget cards and drawers** (`src/components/dashboard/`). A widget card is the flat `Card` with a header row: 16px/600 title, optional 13px muted subtitle, at most one compact `Sel` filter, and an icon-only expand button (`Expand {title}`, `aria-haspopup="dialog"`). Each card shows its own loading and error state (`ResourceState inline`). Expand opens a `WidgetDrawer`: a 560px right-side `Modal` (full width minus 24px on phones), with a 200ms fade-and-slide that is removed under reduced motion, a scrolling body of filters, chart and named-region tables, and a sticky footer link to the owning page. Only one drawer is open at a time, and `?panel=<id>` mirrors it with `history.replaceState`. Charts use `--t-decor`, `--t-decor-mid` and `--t-decor-soft` on `--t-chart-track`, and every chart carries its numbers as text.
```

- [ ] **Step 3: Mark the spec implemented**

In the spec, change `Status: approved design, not yet implemented` to `Status: implemented (see docs/superpowers/plans/2026-11-20-dashboard-expandable-widgets.md)`.

- [ ] **Step 4: Run all checks**

Run: `npm test`
Expected: PASS, including `literals.test.js` and `contrast.test.js`.

Run: `npm run build`
Expected: success.

Run: `git grep -nE "#[0-9a-fA-F]{3,8}\b" -- src/dashboard.css src/components/dashboard`
Expected: no output.

- [ ] **Step 5: Browser verification against emulators**

Use a `demo-*` project with alternate emulator ports and a wrapper Vite config that injects the App Check placeholder header. Start the emulators with the global firebase CLI, and seed with firebase-admin from `functions/node_modules`:
- an admin account and a grade-scoped coordinator account;
- sections in grades 7, 8 and 11 (with track and strand);
- learners including one with no `sex`;
- enrollments across several dates;
- attendance docs for some sections on this week's days, including one with a `sessionOverrides` half-day;
- announcements: pinned, published, scheduled and expired;
- two `id_card_batch` docs.

Keep test passwords in the seed file only. Stop only the processes you started (by PID or by the harness file names), never node by name. Delete `functions/.env.local` and any temporary emulator config afterwards.

Check, in both light and dark, at 1440, 1280, 1024, 768 and 375px:
- [ ] Nothing scrolls horizontally, and no text overlaps or truncates mid-word.
- [ ] Admin sees 6 KPI tiles. The coordinator sees 4 (5 if allowed learner requests), and grade 11 data is hidden when out of scope.
- [ ] Keyboard only: Tab reaches each expand button, Enter opens the drawer, focus lands inside it, Escape closes it, focus returns to the same expand button, and the URL loses `?panel`.
- [ ] Reloading with `?panel=attendance` opens that drawer. Reloading with `?panel=bogus` opens nothing and strips the param.
- [ ] Leaving the dashboard through the sidebar removes `?panel`.
- [ ] The attendance rate matches a hand calculation from the seeded docs, and a section with no doc for a day is not counted.
- [ ] The donut shows "Not recorded" for the learner with no sex.
- [ ] Turn on reduced motion and the drawer appears without sliding.

Take screenshots of admin desktop light, admin desktop dark, coordinator 1024 light and phone dark with a drawer open. Keep them in the scratchpad for the PR description; do not commit them.

- [ ] **Step 6: Design pass**

Run `/impeccable audit` on `src/pages/DashboardPage.jsx` and fix every finding that breaks a Global Constraint. Then run `/impeccable polish` on the dashboard. Re-run `npm test && npm run build` after any change.

- [ ] **Step 7: Commit**

```bash
git add -A src DESIGN.md docs/superpowers/specs/2026-11-20-dashboard-expandable-widgets-design.md
git commit -m "chore(dashboard): retire old panels and styles; document widget cards and drawers"
```

- [ ] **Step 8: Open the PR**

Push the branch and open a PR against `master`. The title is `feat(dashboard): widget grid with expandable detail drawers`. The body links the spec and this plan, lists the verification matrix from Step 5 with its results, attaches the screenshots, and states "No deploy: SIMS releases from the documented release tree." End the body with the attribution line from the session's system reminder. Do not deploy.
