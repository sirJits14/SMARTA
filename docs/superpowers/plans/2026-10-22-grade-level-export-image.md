# Grade-Level Section Summary Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the SIMS Sections page, an **Export image** button downloads a PNG summary of the selected grade's sections: adviser, schedule, male / female / total per section, and the grade total.

**Architecture:** Pure modules compute the numbers (`gradeSummary.js`) and lay the image out over an injected text measurer (`gradeSummaryImage.js`). A thin painter draws that layout on an offscreen `<canvas>` and encodes a PNG, and `downloadBlob.js` saves it. `SectionsPage` gets the button, and its Enrolled column switches to the same counting function so the table and the image cannot disagree. No new dependency.

**Tech Stack:** React 19, Vite 8, vitest 4 (node environment), Canvas 2D in the browser, and the repo's `tests/browser` Vite harness for real-browser checks.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-22-grade-level-export-image-design.md`.
- SIMS only: no change to `functions/`, `firestore.rules` or `parent/`; no new dependency in `package.json`.
- Image: 1080 logical px wide with 48 px side padding; backing-store scale is `min(2, sqrt(16,000,000 / (width x height)))`.
- Palette, fixed light: `#FFFFFF` surface, `#E3E8EF` border, `#17212F` ink, `#3F4C5E` subtle, `#5F6E83` muted, `#077683` teal. They must equal the light tokens in `shared/theme/theme.css`, and they live in a `.js` file, never a `.jsx` (`shared/theme/literals.test.js` rejects color literals in JSX).
- Font: `T.print` from `src/styles.js`.
- Counts: only enrollments with `status === 'enrolled'` in the school year; Total counts every enrolled row; male and female come from the student's `sex` (`'M'` / `'F'`).
- Button: ghost `Btn` labelled `Export image` (text only), accessible name `Export image of Grade N sections`, rendered only when `canViewRoster` is true, and it exports the whole active grade whatever is typed in the search box.
- File name: `BNHS-Grade-8-Sections-SY2026-2027.png` (grade and school year filled in).
- Error copy: `Could not create the image. Please try again.`
- School name: `settings.schoolName`, passed from `App.jsx` as the `schoolName` prop; blank falls back to `Bukidnon National High School`.
- The image carries counts and adviser names only: no learner names, no LRNs.
- Nothing in this plan deploys. SIMS hosting ships through its own release preparation.
- Match surrounding code: 2-space indent, single quotes, semicolons, terse comments.
- Commit steps below are part of the plan, but run them only after the user has approved executing it (no unprompted commits). End each commit message with the attribution line shown in the commands.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/downloadBlob.js` (create) | Save a Blob through a temporary link |
| `src/lib/downloadBlob.test.js` (create) | Its test |
| `src/lib/downloadWorkbook.js` (modify) | Use `downloadBlob`; Excel behavior unchanged |
| `src/lib/gradeSummary.js` (create) | `sectionCounts`, `gradeSummary`, `gradeImageFilename` (pure) |
| `src/lib/gradeSummary.test.js` (create) | Their tests |
| `src/lib/gradeSummaryImage.js` (create) | `wrapText`, `layoutGradeSummary`, `paintGradeSummary`, `fitScale`, `renderGradeSummaryPng` |
| `src/lib/gradeSummaryImage.test.js` (create) | Layout, painter, palette-drift and renderer tests |
| `src/pages/SectionsPage.jsx` (modify) | Button, handler, Enrolled column via `sectionCounts` |
| `src/App.jsx` (modify) | Pass `schoolName` to `SectionsPage` |
| `src/pages/SectionsPage.test.js` (modify) | Button and Enrolled-count tests |
| `tests/browser/grade-export.config.mjs`, `grade-export-fixture.js`, `grade-export.html`, `grade-export.jsx` (create) | Real-browser harness for the real page |
| `tests/browser/README.md` (modify) | Document the harness |

---

### Task 1: Shared download helper

**Files:**
- Create: `src/lib/downloadBlob.js`
- Create: `src/lib/downloadBlob.test.js`
- Modify: `src/lib/downloadWorkbook.js`

**Interfaces:**
- Produces: `downloadBlob(blob: Blob, filename: string): void`. Clicks a temporary link, then releases the object URL on the next tick.

- [ ] **Step 1: Make the worktree's dependencies available**

This worktree has no usable `node_modules` (worktrees never get an `npm install`). Never run `npm install` here; it would shadow the main checkout's React and Firebase copies. From the worktree root, in PowerShell:

```powershell
$main = 'C:\Users\jitsb\OneDrive - Department of Education\Desktop\APPS\bnhs-sims'
if (Test-Path node_modules) { Get-ChildItem node_modules -Force | Select-Object -First 5 -ExpandProperty Name }
```

Expected: no output. If it lists only `.vite*` cache folders, remove the folder with `Remove-Item -Recurse -Force node_modules` first. Then:

```powershell
if (-not (Test-Path node_modules)) { New-Item -ItemType Junction -Path node_modules -Target "$main\node_modules" | Out-Null }
npm test -- src/lib/dates.test.js
```

Expected: `Test Files  1 passed (1)`. (`node_modules` is gitignored.)

- [ ] **Step 2: Confirm a green baseline**

Run: `npm test`
Expected: every file passes (69 files, 713 tests when this plan was written). If anything fails before any change, stop and report it.

- [ ] **Step 3: Write the failing test**

Create `src/lib/downloadBlob.test.js`:

```js
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from './downloadBlob.js';

describe('downloadBlob', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('clicks a temporary link carrying the file name, then releases the object URL', () => {
    vi.useFakeTimers();
    const anchor = { click: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const blob = new Blob(['x'], { type: 'image/png' });

    downloadBlob(blob, 'grade.png');

    expect(create).toHaveBeenCalledWith(blob);
    expect(anchor).toMatchObject({ href: 'blob:test', download: 'grade.png' });
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- src/lib/downloadBlob.test.js`
Expected: FAIL with `Failed to resolve import "./downloadBlob.js"`.

- [ ] **Step 5: Implement the helper and use it in `downloadWorkbook`**

Create `src/lib/downloadBlob.js`:

```js
// Saves a Blob through a temporary link. The URL is released on the next tick so the browser has
// already started the download.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

Replace the whole of `src/lib/downloadWorkbook.js` with:

```js
import { downloadBlob } from './downloadBlob.js';

export async function downloadWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- src/lib/downloadBlob.test.js`
Expected: PASS, 1 test.

- [ ] **Step 7: Commit**

```bash
git add src/lib/downloadBlob.js src/lib/downloadBlob.test.js src/lib/downloadWorkbook.js
git commit -m "feat(sims): share one download helper between the Excel and image exports" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Section counts and the grade summary

**Files:**
- Create: `src/lib/gradeSummary.js`
- Create: `src/lib/gradeSummary.test.js`

**Interfaces:**
- Consumes: `isSHS(grade)` from `src/lib/constants.js`; `capsName(name)` from `src/lib/roster.js`.
- Produces:
  - `sectionCounts(enrollments, students, schoolYear): Map<sectionId, { male, female, total }>`. Only `status === 'enrolled'` rows of that school year count.
  - `gradeSummary({ grade, sections, counts, schedules, schoolYear })` returns `{ grade: number, schoolYear, hasStrand: boolean, rows: [{ id, name, strand, adviser, schedule, male, female, total }], totals: { sections, male, female, total }, unknownSex: number }`. `counts` is the `sectionCounts` Map and `schedules` is a Map of schedule id to schedule record (the page's `scheduleById`). Rows keep the order of `sections`.
  - `gradeImageFilename(grade, schoolYear): string`, for example `BNHS-Grade-8-Sections-SY2026-2027.png`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/gradeSummary.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { gradeImageFilename, gradeSummary, sectionCounts } from './gradeSummary.js';

const YEAR = '2026-2027';
const students = [{ id: 'm1', sex: 'M' }, { id: 'm2', sex: 'M' }, { id: 'f1', sex: 'F' }, { id: 'x1', sex: '' }];
const enroll = (studentId, sectionId, over = {}) => ({ studentId, sectionId, schoolYear: YEAR, status: 'enrolled', gradeLevel: 8, ...over });

describe('sectionCounts', () => {
  it('splits enrolled learners by sex per section', () => {
    const counts = sectionCounts([enroll('m1', 'a'), enroll('m2', 'a'), enroll('f1', 'a'), enroll('f1', 'b')], students, YEAR);
    expect(counts.get('a')).toEqual({ male: 2, female: 1, total: 3 });
    expect(counts.get('b')).toEqual({ male: 0, female: 1, total: 1 });
  });

  it('ignores withdrawn rows and other school years', () => {
    const counts = sectionCounts([
      enroll('m1', 'a'), enroll('m2', 'a', { status: 'transferred' }), enroll('f1', 'a', { status: 'dropped' }),
      enroll('f1', 'a', { schoolYear: '2025-2026' }),
    ], students, YEAR);
    expect(counts.get('a')).toEqual({ male: 1, female: 0, total: 1 });
  });

  it('counts a learner with no sex, or no record, in Total only', () => {
    const counts = sectionCounts([enroll('x1', 'a'), enroll('ghost', 'a')], students, YEAR);
    expect(counts.get('a')).toEqual({ male: 0, female: 0, total: 2 });
  });

  it('has no entry for a section nobody is enrolled in', () => {
    expect(sectionCounts([], students, YEAR).has('a')).toBe(false);
  });
});

describe('gradeSummary', () => {
  const sections = [
    { id: 'a', gradeLevel: 8, name: 'Mabini', adviserName: 'Ana Cruz', schoolYear: YEAR, scheduleId: 'AM' },
    { id: 'b', gradeLevel: '8', name: 'Rizal', schoolYear: YEAR },
    { id: 'c', gradeLevel: 9, name: 'Luna', adviserName: 'Cora Tan', schoolYear: YEAR },
    { id: 'd', gradeLevel: 8, name: 'Old', schoolYear: '2025-2026' },
    { id: 'e', gradeLevel: 11, name: 'Newton', adviserName: 'Ben Dy', schoolYear: YEAR, strand: 'STEM', scheduleId: 'GONE' },
  ];
  const schedules = new Map([['AM', { id: 'AM', name: 'Morning Shift' }]]);
  const counts = new Map([['a', { male: 21, female: 19, total: 40 }], ['e', { male: 5, female: 4, total: 10 }]]);
  const build = (grade, withCounts = counts) => gradeSummary({ grade, sections, counts: withCounts, schedules, schoolYear: YEAR });

  it('lists one grade and one school year in the order given', () => {
    expect(build(8).rows.map((row) => row.name)).toEqual(['Mabini', 'Rizal']);
  });

  it('carries the numbers and labels the table shows', () => {
    expect(build(8).rows[0]).toEqual({
      id: 'a', name: 'Mabini', strand: '', adviser: 'ANA CRUZ', schedule: 'Morning Shift', male: 21, female: 19, total: 40,
    });
  });

  it('lists a section nobody is enrolled in with zeros and blank labels', () => {
    expect(build(8).rows[1]).toEqual({ id: 'b', name: 'Rizal', strand: '', adviser: '', schedule: '', male: 0, female: 0, total: 0 });
  });

  it('totals the grade and reports learners without a recorded sex', () => {
    const summary = build(8, new Map([['a', { male: 2, female: 1, total: 4 }]]));
    expect(summary.totals).toEqual({ sections: 2, male: 2, female: 1, total: 4 });
    expect(summary.unknownSex).toBe(1);
  });

  it('shows strand for senior high and blanks a schedule that no longer exists', () => {
    const shs = build(11);
    expect(shs.hasStrand).toBe(true);
    expect(shs.rows[0]).toMatchObject({ strand: 'STEM', schedule: '' });
    expect(build(8).hasStrand).toBe(false);
  });

  it('returns an empty table for a grade without sections', () => {
    expect(build(10)).toMatchObject({ rows: [], totals: { sections: 0, male: 0, female: 0, total: 0 }, unknownSex: 0 });
  });
});

describe('gradeImageFilename', () => {
  it('names the file for the grade and school year', () => {
    expect(gradeImageFilename(8, '2026-2027')).toBe('BNHS-Grade-8-Sections-SY2026-2027.png');
    expect(gradeImageFilename('11', '2026-2027')).toBe('BNHS-Grade-11-Sections-SY2026-2027.png');
  });

  it('keeps odd characters out of the file name', () => {
    expect(gradeImageFilename(8, '2026/2027 "x"')).toBe('BNHS-Grade-8-Sections-SY20262027x.png');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/gradeSummary.test.js`
Expected: FAIL with `Failed to resolve import "./gradeSummary.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/gradeSummary.js`:

```js
import { isSHS } from './constants.js';
import { capsName } from './roster.js';

// Enrolled learners per section for one school year, split by sex. Only 'enrolled' rows count, so
// withdrawn learners never reach the Sections table or the exported image. `total` counts every
// enrolled row; a learner whose record is missing or has no sex adds to Total only.
export function sectionCounts(enrollments, students, schoolYear) {
  const sexById = new Map(students.map((student) => [student.id, student.sex]));
  const counts = new Map();
  enrollments.forEach((enrollment) => {
    if (enrollment.schoolYear !== schoolYear || enrollment.status !== 'enrolled') return;
    const count = counts.get(enrollment.sectionId) || { male: 0, female: 0, total: 0 };
    count.total += 1;
    const sex = sexById.get(enrollment.studentId);
    if (sex === 'M') count.male += 1;
    else if (sex === 'F') count.female += 1;
    counts.set(enrollment.sectionId, count);
  });
  return counts;
}

const NO_ONE = { male: 0, female: 0, total: 0 };

// The rows behind the grade image: one grade's sections for one school year, in the order given
// (the Sections table order), with the same numbers the table's Enrolled column shows.
// `counts` is the sectionCounts Map and `schedules` maps a schedule id to its record.
export function gradeSummary({ grade, sections, counts, schedules, schoolYear }) {
  const rows = sections
    .filter((section) => Number(section.gradeLevel) === Number(grade) && section.schoolYear === schoolYear)
    .map((section) => {
      const { male, female, total } = counts.get(section.id) || NO_ONE;
      return {
        id: section.id,
        name: section.name,
        strand: section.strand || '',
        adviser: capsName(section.adviserName),
        schedule: schedules.get(section.scheduleId)?.name || '',
        male, female, total,
      };
    });
  const totals = rows.reduce((sum, row) => ({
    sections: sum.sections + 1, male: sum.male + row.male, female: sum.female + row.female, total: sum.total + row.total,
  }), { sections: 0, male: 0, female: 0, total: 0 });
  return { grade: Number(grade), schoolYear, hasStrand: isSHS(grade), rows, totals, unknownSex: totals.total - totals.male - totals.female };
}

export const gradeImageFilename = (grade, schoolYear) =>
  `BNHS-Grade-${Number(grade)}-Sections-SY${String(schoolYear).replace(/[^\w-]/g, '')}.png`;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/gradeSummary.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gradeSummary.js src/lib/gradeSummary.test.js
git commit -m "feat(sims): count enrolled learners per section by sex for the grade image" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Image layout, painter and PNG renderer

**Files:**
- Create: `src/lib/gradeSummaryImage.js`
- Create: `src/lib/gradeSummaryImage.test.js`

**Interfaces:**
- Consumes: `T.print` from `src/styles.js`; the asset `src/assets/bnhs_logo.png` (imported with `?url`, as `src/lib/sf2.js` does for its template); the `gradeSummary` result from Task 2; `shared/theme/theme.css` (read by the palette test).
- Produces:
  - `DEFAULT_SCHOOL_NAME`, `IMAGE_PALETTE`.
  - `wrapText(text, maxWidth, measure, maxLines = 2): string[]`.
  - `layoutGradeSummary(summary, measure, { schoolName, generatedOn }): { width, height, columns, rects, texts, logo }`, where `measure(text, fontSpec)` returns a width in px.
  - `paintGradeSummary(ctx, layout, logo | null): void`.
  - `fitScale(width, height): number`.
  - `renderGradeSummaryPng(summary, { schoolName, generatedOn }): Promise<Blob>`, which rejects if the browser cannot encode a PNG.

**Notes for the implementer:**
- The test and the module below were run together before this plan was written. Column widths were tuned against real Inter metrics at 26 px, so that "Afternoon Shift", "Saint Francis" and "Agri-Fishery" are not cut mid-word. Keep them as written.
- If the design hook flags `#3F4C5E` or another palette value in `gradeSummaryImage.js`, it is a false positive. These are the light tokens of `shared/theme/theme.css` (`--t-subtle` is what the Sections table already uses for ordinary cells), and the palette test locks them to that file. Do not change them and do not add ignore comments.

- [ ] **Step 1: Write the failing test**

Create `src/lib/gradeSummaryImage.test.js`:

```js
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SCHOOL_NAME, IMAGE_PALETTE, fitScale, layoutGradeSummary, paintGradeSummary, renderGradeSummaryPng, wrapText,
} from './gradeSummaryImage.js';

const measure = (text) => text.length * 10;
const sizeAware = (text, font) => (text.length * Number(/(\d+)px/.exec(font)[1])) / 3;
const generatedOn = new Date(2026, 9, 22);
const row = (over = {}) => ({ id: 'a', name: 'Mabini', strand: '', adviser: 'ANA CRUZ', schedule: 'Morning Shift', male: 21, female: 19, total: 40, ...over });
const summary = (over = {}) => ({
  grade: 8, schoolYear: '2026-2027', hasStrand: false, unknownSex: 0,
  rows: [row(), row({ id: 'b', name: 'Rizal', adviser: '', schedule: '', male: 0, female: 0, total: 0 })],
  totals: { sections: 2, male: 21, female: 19, total: 40 },
  ...over,
});
const layout = (s = summary(), options = {}, measurer = measure) => layoutGradeSummary(s, measurer, { schoolName: 'Test School', generatedOn, ...options });
const strings = (l) => l.texts.map((t) => t.text);
const find = (l, text) => l.texts.find((t) => t.text === text);

describe('wrapText', () => {
  it('keeps short text on one line and empty text as one empty line', () => {
    expect(wrapText('aaa bbb', 100, measure)).toEqual(['aaa bbb']);
    expect(wrapText('', 100, measure)).toEqual(['']);
  });

  it('wraps at word boundaries', () => {
    expect(wrapText('aaa bbb ccc ddd', 100, measure)).toEqual(['aaa bbb', 'ccc ddd']);
  });

  it('breaks a word wider than the column', () => {
    expect(wrapText('abcdefghijklmnop', 100, measure)).toEqual(['abcdefghij', 'klmnop']);
  });

  it('ends the last allowed line with an ellipsis when text is left over', () => {
    const lines = wrapText('aaa bbb ccc ddd eee fff', 100, measure);
    expect(lines).toEqual(['aaa bbb', 'ccc ddd e…']);
    expect(lines.every((line) => measure(line) <= 100)).toBe(true);
  });
});

describe('layoutGradeSummary', () => {
  it('writes the header, every row and the totals in reading order', () => {
    const l = layout();
    expect(strings(l)).toEqual(expect.arrayContaining([
      'TEST SCHOOL', 'Grade 8 · Sections and enrollment', 'SY 2026-2027',
      'SECTION', 'ADVISER', 'SCHEDULE', 'MALE', 'FEMALE', 'TOTAL',
      'Mabini', 'ANA CRUZ', 'Morning Shift', '21', '19', '40', 'Rizal', 'Grade 8 total · 2 sections',
    ]));
    const ys = ['TEST SCHOOL', 'SECTION', 'Mabini', 'Rizal', 'Grade 8 total · 2 sections'].map((text) => find(l, text).y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it('shows a dash where the adviser or schedule is empty', () => {
    expect(strings(layout()).filter((text) => text === '—')).toHaveLength(2);
  });

  it('adds the Strand column only for senior high', () => {
    const shs = layout(summary({ grade: 11, hasStrand: true, rows: [row({ strand: 'STEM' })] }));
    expect(strings(shs)).toEqual(expect.arrayContaining(['STRAND', 'STEM']));
    expect(strings(layout())).not.toContain('STRAND');
  });

  it('lays the columns edge to edge inside the side padding, with labels that fit', () => {
    [summary(), summary({ grade: 11, hasStrand: true })].forEach((s) => {
      const { columns } = layout(s);
      expect(columns[0].x).toBe(48);
      columns.slice(1).forEach((column, i) => expect(column.x).toBe(columns[i].x + columns[i].width));
      expect(columns.at(-1).x + columns.at(-1).width).toBe(1032);
      columns.forEach((column) => expect(measure(column.label)).toBeLessThanOrEqual(column.width));
    });
  });

  it('keeps every piece of text inside the canvas', () => {
    const l = layout(summary({ unknownSex: 2 }));
    l.texts.forEach((t) => {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(l.width);
      expect(t.y).toBeGreaterThan(0);
      expect(t.y).toBeLessThan(l.height);
    });
  });

  it('grows a row by one line height for each extra wrapped line', () => {
    const long = layout(summary({ rows: [row({ adviser: 'ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT' })] }));
    const short = layout(summary({ rows: [row({ adviser: 'ONE' })] }));
    expect(long.height - short.height).toBe(32);
    expect(strings(long)).toEqual(expect.arrayContaining(['ONE TWO THREE FOUR FIVE SIX SEVEN', 'EIGHT']));
  });

  it('says "1 section" for a single section', () => {
    const one = summary({ rows: [row()], totals: { sections: 1, male: 21, female: 19, total: 40 } });
    expect(strings(layout(one))).toContain('Grade 8 total · 1 section');
  });

  it('prints the sex footnote only when some learners have none on record', () => {
    expect(strings(layout()).some((text) => text.includes('no sex on record'))).toBe(false);
    expect(strings(layout(summary({ unknownSex: 1 })))).toContain('1 learner has no sex on record, so Male + Female is less than Total.');
    expect(strings(layout(summary({ unknownSex: 3 })))).toContain('3 learners have no sex on record, so Male + Female is less than Total.');
  });

  it('dates the footer with the generation date', () => {
    expect(strings(layout())).toContain('Generated Oct 22, 2026 · BNHS Learner Records');
  });

  it('falls back to the default school name when the given one is blank or missing', () => {
    expect(strings(layout(summary(), { schoolName: '   ' }))).toContain(DEFAULT_SCHOOL_NAME.toUpperCase());
    expect(strings(layoutGradeSummary(summary(), measure, { generatedOn }))).toContain(DEFAULT_SCHOOL_NAME.toUpperCase());
  });

  it('shrinks a long school name, then ends it with an ellipsis', () => {
    const medium = layout(summary(), { schoolName: 'm'.repeat(90) }, sizeAware);
    expect(find(medium, 'M'.repeat(90)).font).toContain('26px');
    const huge = layout(summary(), { schoolName: 'm'.repeat(200) }, sizeAware);
    const clipped = huge.texts.find((t) => t.text.endsWith('…'));
    expect(clipped.font).toContain('22px');
    expect(sizeAware(clipped.text, clipped.font)).toBeLessThanOrEqual(864);
  });

  it('puts a full-canvas background first and a single teal rule above the totals', () => {
    const l = layout();
    expect(l.rects[0]).toEqual({ x: 0, y: 0, w: l.width, h: l.height, color: IMAGE_PALETTE.surface });
    expect(l.rects.filter((rect) => rect.color === IMAGE_PALETTE.primary)).toHaveLength(1);
  });

  it('reserves a square box for the logo beside the header text', () => {
    expect(layout().logo).toEqual({ x: 48, y: 50, size: 96 });
  });
});

describe('IMAGE_PALETTE', () => {
  it('equals the light tokens in shared/theme/theme.css', () => {
    const css = readFileSync(new URL('../../shared/theme/theme.css', import.meta.url), 'utf8');
    const start = css.indexOf(':root, .paper {');
    const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
    const light = Object.fromEntries([...body.matchAll(/--t-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().toUpperCase()]));
    expect(IMAGE_PALETTE).toEqual({
      surface: light.surface, border: light.border, ink: light.ink, subtle: light.subtle, muted: light.muted, primary: light.primary,
    });
  });
});

function recorder() {
  const calls = [];
  const ctx = {
    fillStyle: '', font: '', textAlign: '', textBaseline: '',
    fillRect: (...args) => calls.push(['fillRect', ...args, ctx.fillStyle]),
    fillText: (...args) => calls.push(['fillText', ...args, ctx.font, ctx.fillStyle, ctx.textAlign]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
  };
  return { ctx, calls };
}

describe('paintGradeSummary', () => {
  it('fills the background first, then draws every text with its own style', () => {
    const l = layout();
    const { ctx, calls } = recorder();
    paintGradeSummary(ctx, l, null);
    expect(calls[0]).toEqual(['fillRect', 0, 0, l.width, l.height, IMAGE_PALETTE.surface]);
    expect(ctx.textBaseline).toBe('middle');
    const drawn = calls.filter(([name]) => name === 'fillText');
    expect(drawn).toHaveLength(l.texts.length);
    const first = l.texts[0];
    expect(drawn[0]).toEqual(['fillText', first.text, first.x, first.y, first.font, first.color, first.align]);
  });

  it('draws the logo inside its box with its own proportions, and skips it when absent', () => {
    const l = layout();
    const withLogo = recorder();
    const logo = { naturalWidth: 200, naturalHeight: 100 };
    paintGradeSummary(withLogo.ctx, l, logo);
    expect(withLogo.calls.find(([name]) => name === 'drawImage')).toEqual(['drawImage', logo, 48, 74, 96, 48]);
    const without = recorder();
    paintGradeSummary(without.ctx, l, null);
    expect(without.calls.some(([name]) => name === 'drawImage')).toBe(false);
  });
});

describe('fitScale', () => {
  it('uses 2x for an ordinary image', () => {
    expect(fitScale(1080, 600)).toBe(2);
  });

  it('shrinks a very tall image to stay under 16 million pixels', () => {
    const scale = fitScale(1080, 20000);
    expect(scale).toBeLessThan(2);
    expect(1080 * 20000 * scale * scale).toBeCloseTo(16_000_000, 0);
  });
});

function fakeBrowser({ blob = new Blob(['png'], { type: 'image/png' }), logo = 'load' } = {}) {
  const ctx = {
    measureText: (text) => ({ width: text.length * 10 }),
    scale: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(),
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: vi.fn((done, type) => done(type === 'image/png' ? blob : null)) };
  const fonts = { load: vi.fn(async () => []) };
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas), fonts });
  vi.stubGlobal('Image', class { set src(value) { queueMicrotask(() => (logo === 'load' ? this.onload?.() : this.onerror?.())); } });
  return { canvas, ctx, fonts, blob };
}

describe('renderGradeSummaryPng', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('waits for the fonts, sizes the canvas at the fitted scale and returns the PNG', async () => {
    const { canvas, ctx, fonts, blob } = fakeBrowser();
    const result = await renderGradeSummaryPng(summary(), { schoolName: 'Test School', generatedOn });
    expect(result).toBe(blob);
    expect(fonts.load).toHaveBeenCalled();
    expect(canvas.width).toBe(2160);
    expect(canvas.height).toBe(Math.round(layout().height * 2));
    expect(ctx.scale).toHaveBeenCalledWith(2, 2);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });

  it('still renders when the logo cannot load', async () => {
    const { ctx } = fakeBrowser({ logo: 'fail' });
    await expect(renderGradeSummaryPng(summary(), { generatedOn })).resolves.toBeInstanceOf(Blob);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('carries on with fallback fonts when font loading fails', async () => {
    const { fonts } = fakeBrowser();
    fonts.load.mockRejectedValue(new Error('offline'));
    await expect(renderGradeSummaryPng(summary(), { generatedOn })).resolves.toBeInstanceOf(Blob);
  });

  it('rejects when the browser cannot encode a PNG', async () => {
    fakeBrowser({ blob: null });
    await expect(renderGradeSummaryPng(summary(), { generatedOn })).rejects.toThrow('PNG');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/gradeSummaryImage.test.js`
Expected: FAIL with `Failed to resolve import "./gradeSummaryImage.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/gradeSummaryImage.js`:

```js
import { T } from '../styles.js';
import logoUrl from '../assets/bnhs_logo.png?url';

export const DEFAULT_SCHOOL_NAME = 'Bukidnon National High School';
// The light tokens of shared/theme/theme.css, fixed so the image stays light in dark mode.
// gradeSummaryImage.test.js fails if they drift from the stylesheet.
export const IMAGE_PALETTE = {
  surface: '#FFFFFF', border: '#E3E8EF', ink: '#17212F', subtle: '#3F4C5E', muted: '#5F6E83', primary: '#077683',
};

const WIDTH = 1080;
const PAD = 48;
const TOP = 44;
const BOTTOM = 40;
const LOGO = 96;
const HEADER = 108;
const LINE = 32;
const ROW_PAD = 16;
const GAP = 12;
const RULE = 2;
const TOTALS_ROW = 72;
const MAX_LINES = 2;
const MAX_SCALE = 2;
const MAX_PIXELS = 16_000_000; // iOS Safari's canvas area limit
const ELLIPSIS = '…';
const font = (weight, size) => `${weight} ${size}px ${T.print}`;

// Column widths add up to the 984 px between the side paddings. Measured in Inter at 26 px, each
// plus the 12 px GAP: "Saint Francis" (600) needs 162 px, "Agri-Fishery" 153 px and
// "Afternoon Shift" 185 px, so those wrap or fit on one line without cutting a word.
const COUNT_COLUMNS = [
  { key: 'male', label: 'MALE', width: 64, align: 'right' },
  { key: 'female', label: 'FEMALE', width: 84, align: 'right' },
  { key: 'total', label: 'TOTAL', width: 74, align: 'right' },
];
const JHS_COLUMNS = [
  { key: 'name', label: 'SECTION', width: 184 },
  { key: 'adviser', label: 'ADVISER', width: 378 },
  { key: 'schedule', label: 'SCHEDULE', width: 200 },
  ...COUNT_COLUMNS,
];
const SHS_COLUMNS = [
  { key: 'name', label: 'SECTION', width: 184 },
  { key: 'strand', label: 'STRAND', width: 170 },
  { key: 'adviser', label: 'ADVISER', width: 208 },
  { key: 'schedule', label: 'SCHEDULE', width: 200 },
  ...COUNT_COLUMNS,
];
const cellFont = (key) => font(key === 'name' ? 600 : key === 'total' ? 700 : 400, 26);
const cellColor = (key) => (key === 'name' || key === 'total' ? IMAGE_PALETTE.ink : IMAGE_PALETTE.subtle);

// Splits a word wider than the column into pieces that each fit.
function breakWord(word, maxWidth, measure) {
  const pieces = [];
  let piece = '';
  for (const char of word) {
    if (piece && measure(piece + char) > maxWidth) { pieces.push(piece); piece = char; } else piece += char;
  }
  return piece ? [...pieces, piece] : pieces;
}

function fitEllipsis(text, maxWidth, measure) {
  let fitted = text;
  while (fitted && measure(fitted + ELLIPSIS) > maxWidth) fitted = fitted.slice(0, -1);
  return fitted.trimEnd() + ELLIPSIS;
}

// Wraps text to the column at word boundaries, to at most `maxLines` lines. Text left over ends
// the last line with an ellipsis.
export function wrapText(text, maxWidth, measure, maxLines = MAX_LINES) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
    .flatMap((word) => (measure(word) > maxWidth ? breakWord(word, maxWidth, measure) : [word]));
  const lines = [];
  let line = '';
  for (const word of words) {
    const joined = line ? `${line} ${word}` : word;
    if (!line || measure(joined) <= maxWidth) line = joined;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines.length ? lines : [''];
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = fitEllipsis(lines.slice(maxLines - 1).join(' '), maxWidth, measure);
  return kept;
}

// The school name on one line: the largest of three sizes that fits, else ellipsized at the smallest.
function schoolHeadline(name, maxWidth, measure) {
  for (const size of [30, 26, 22]) {
    if (measure(name, font(700, size)) <= maxWidth) return { text: name, size };
  }
  return { text: fitEllipsis(name, maxWidth, (value) => measure(value, font(700, 22))), size: 22 };
}

// Turns a gradeSummary into drawing primitives: filled rectangles, positioned text lines (drawn
// with a middle baseline) and the logo box. `measure(text, fontSpec)` returns a width in px.
export function layoutGradeSummary(summary, measure, { schoolName, generatedOn = new Date() } = {}) {
  let left = PAD;
  const columns = (summary.hasStrand ? SHS_COLUMNS : JHS_COLUMNS).map((column) => {
    const placed = { ...column, x: left };
    left += column.width;
    return placed;
  });
  const edge = (column) => (column.align === 'right' ? column.x + column.width : column.x);
  const rects = [];
  const texts = [];
  const text = (value, x, y, spec, color, align = 'left') => texts.push({ text: value, x, y, font: spec, color, align });
  const rule = (y, color = IMAGE_PALETTE.border) => rects.push({ x: PAD, y, w: WIDTH - PAD * 2, h: RULE, color });

  let y = TOP;
  const textLeft = PAD + LOGO + 24;
  const name = String(schoolName ?? '').trim() || DEFAULT_SCHOOL_NAME;
  const school = schoolHeadline(name.toUpperCase(), WIDTH - PAD - textLeft, measure);
  text(school.text, textLeft, y + 20, font(700, school.size), IMAGE_PALETTE.ink);
  text(`Grade ${summary.grade} · Sections and enrollment`, textLeft, y + 58, font(600, 24), IMAGE_PALETTE.primary);
  text(`SY ${summary.schoolYear}`, textLeft, y + 92, font(400, 22), IMAGE_PALETTE.muted);
  const logo = { x: PAD, y: y + (HEADER - LOGO) / 2, size: LOGO };
  y += HEADER + 28;
  rule(y);
  y += RULE;

  columns.forEach((column) => text(column.label, edge(column), y + 28, font(600, 18), IMAGE_PALETTE.muted, column.align));
  y += 56;
  rule(y);
  y += RULE;

  summary.rows.forEach((row, index) => {
    const cells = columns.map((column) => {
      const right = column.align === 'right';
      const spec = cellFont(column.key);
      const value = right ? String(row[column.key]) : row[column.key] || '—';
      return { column, spec, lines: right ? [value] : wrapText(value, column.width - GAP, (s) => measure(s, spec)) };
    });
    const height = Math.max(...cells.map((cell) => cell.lines.length)) * LINE + ROW_PAD * 2;
    cells.forEach(({ column, spec, lines }) => {
      const top = y + (height - lines.length * LINE) / 2;
      lines.forEach((line, i) => text(line, edge(column), top + i * LINE + LINE / 2, spec, cellColor(column.key), column.align));
    });
    y += height;
    if (index < summary.rows.length - 1) { rule(y); y += RULE; }
  });

  rule(y, IMAGE_PALETTE.primary);
  y += RULE;
  const count = summary.totals.sections;
  text(`Grade ${summary.grade} total · ${count} ${count === 1 ? 'section' : 'sections'}`, PAD, y + TOTALS_ROW / 2, font(600, 24), IMAGE_PALETTE.ink);
  columns.filter((column) => column.align === 'right')
    .forEach((column) => text(String(summary.totals[column.key]), edge(column), y + TOTALS_ROW / 2, font(700, 26), IMAGE_PALETTE.ink, 'right'));
  y += TOTALS_ROW + 28;

  if (summary.unknownSex > 0) {
    const n = summary.unknownSex;
    text(`${n} ${n === 1 ? 'learner has' : 'learners have'} no sex on record, so Male + Female is less than Total.`, PAD, y + 14, font(400, 20), IMAGE_PALETTE.muted);
    y += 40;
  }
  const date = generatedOn.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  text(`Generated ${date} · BNHS Learner Records`, PAD, y + 14, font(400, 20), IMAGE_PALETTE.muted);
  y += 28 + BOTTOM;

  rects.unshift({ x: 0, y: 0, w: WIDTH, h: y, color: IMAGE_PALETTE.surface });
  return { width: WIDTH, height: y, columns, rects, texts, logo };
}

// Draws a layout onto a 2D context already scaled to the layout's units. `logo` is a loaded image
// or null; it is fitted inside its box without distortion.
export function paintGradeSummary(ctx, layout, logo) {
  ctx.textBaseline = 'middle';
  layout.rects.forEach(({ x, y, w, h, color }) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); });
  if (logo && layout.logo) {
    const box = layout.logo;
    const ratio = (logo.naturalWidth || logo.width) / (logo.naturalHeight || logo.height) || 1;
    const w = ratio >= 1 ? box.size : box.size * ratio;
    const h = ratio >= 1 ? box.size / ratio : box.size;
    ctx.drawImage(logo, box.x + (box.size - w) / 2, box.y + (box.size - h) / 2, w, h);
  }
  layout.texts.forEach(({ text, x, y, font: spec, color, align }) => {
    ctx.font = spec; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(text, x, y);
  });
}

// 2x for crisp text, reduced so a very tall image stays under the browser's canvas area limit.
export const fitScale = (width, height) => Math.min(MAX_SCALE, Math.sqrt(MAX_PIXELS / (width * height)));

// Best effort: a face that fails to load leaves the image on the system-ui fallback.
async function loadFonts() {
  if (!document.fonts?.load) return;
  await Promise.allSettled([font(400, 26), font(600, 26), font(700, 30)].map((spec) => document.fonts.load(spec)));
}

function loadLogo() {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = logoUrl;
  });
}

// Renders a gradeSummary as a PNG Blob. The logo and Inter are best effort; a failure to encode rejects.
export async function renderGradeSummaryPng(summary, { schoolName, generatedOn = new Date() } = {}) {
  const [logo] = await Promise.all([loadLogo(), loadFonts()]);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const measure = (value, spec) => { ctx.font = spec; return ctx.measureText(value).width; };
  const layout = layoutGradeSummary(summary, measure, { schoolName, generatedOn });
  const scale = fitScale(layout.width, layout.height);
  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  ctx.scale(scale, scale);
  paintGradeSummary(ctx, layout, logo);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The PNG could not be encoded.'))), 'image/png');
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/gradeSummaryImage.test.js`
Expected: PASS, 26 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gradeSummaryImage.js src/lib/gradeSummaryImage.test.js
git commit -m "feat(sims): lay out and paint the grade section summary as a PNG" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Export image on the Sections page

**Files:**
- Modify: `src/pages/SectionsPage.jsx`
- Modify: `src/App.jsx`
- Test: `src/pages/SectionsPage.test.js`

**Interfaces:**
- Consumes: `sectionCounts`, `gradeSummary`, `gradeImageFilename` (Task 2); `renderGradeSummaryPng` (Task 3); `downloadBlob` (Task 1).
- Produces: a new optional `schoolName` prop on `SectionsPage`; an **Export image** button whose accessible name is `Export image of Grade N sections`.

- [ ] **Step 1: Write the failing page tests**

In `src/pages/SectionsPage.test.js`, make three edits.

Edit 1. Find (once):

```js
const fixture = vi.hoisted(() => ({ sections: [], advisory: new Map() }));
vi.mock('../hooks/useCollection.js', () => ({
  useStaffCollectionResource: path => ({ data: path === 'sections' ? fixture.sections : [], loading: false, error: null }),
}));
```

Replace with:

```js
const fixture = vi.hoisted(() => ({ sections: [], enrollments: [], advisory: new Map() }));
vi.mock('../hooks/useCollection.js', () => ({
  useStaffCollectionResource: path => ({
    data: path === 'sections' ? fixture.sections : path === 'enrollments' ? fixture.enrollments : [], loading: false, error: null,
  }),
}));
```

Edit 2. Find (once):

```js
beforeEach(() => { fixture.sections = [section]; fixture.advisory = new Map(); });
```

Replace with:

```js
beforeEach(() => { fixture.sections = [section]; fixture.enrollments = []; fixture.advisory = new Map(); });
```

Edit 3. Find (once, the end of the file):

```js
    expect(html).toContain('Slip issued · Oct 19, 2026');
  });
});
```

Replace with:

```js
    expect(html).toContain('Slip issued · Oct 19, 2026');
  });
});

describe('grade image export', () => {
  it.each([['a Grade Level Coordinator', glc], ['an administrator', { role: 'admin' }], ['an academic coordinator', { role: 'jhs_coord' }]])(
    'offers Export image to %s', (_who, me) => {
      const html = render(me);
      expect(html).toContain('>Export image<');
      expect(html).toContain('aria-label="Export image of Grade 8 sections"');
    });
  it('counts only current enrolled learners in the Enrolled column', () => {
    const enrollment = (studentId, status) => ({ studentId, sectionId: 's8', gradeLevel: 8, schoolYear: '2026-2027', status });
    fixture.enrollments = [enrollment('a', 'enrolled'), enrollment('b', 'enrolled'), enrollment('c', 'transferred')];
    expect(render(glc)).toMatch(/tabular-nums[^>]*>2<\/td>/);
  });
});
```

- [ ] **Step 2: Run the page tests to verify they fail**

Run: `npm test -- src/pages/SectionsPage.test.js`
Expected: the three `offers Export image to …` tests FAIL. The Enrolled-count test already passes; it guards the refactor in Step 3. Every other test in the file passes.

- [ ] **Step 3: Wire the page**

In `src/pages/SectionsPage.jsx`, make seven edits.

Edit 1, imports. Find (once):

```js
import AdvisorySlipsPanel from './sections/AdvisorySlipsPanel.jsx';
```

Replace with:

```js
import AdvisorySlipsPanel from './sections/AdvisorySlipsPanel.jsx';
import { sectionCounts, gradeSummary, gradeImageFilename } from '../lib/gradeSummary.js';
import { renderGradeSummaryPng } from '../lib/gradeSummaryImage.js';
import { downloadBlob } from '../lib/downloadBlob.js';
```

Edit 2, the prop. Find (once):

```js
export default function SectionsPage({ me, schoolYear }) {
```

Replace with:

```js
export default function SectionsPage({ me, schoolYear, schoolName }) {
```

Edit 3, one counting function for the table and the image. Find (once):

```js
  const enrolledCountBySection = useMemo(() => {
    const m = new Map();
    enrollments.forEach((e) => {
      if (e.schoolYear === selectedYear && e.status === 'enrolled') m.set(e.sectionId, (m.get(e.sectionId) || 0) + 1);
    });
    return m;
  }, [enrollments, selectedYear]);
```

Replace with:

```js
  const countsBySection = useMemo(() => sectionCounts(enrollments, students, selectedYear), [enrollments, students, selectedYear]);
```

Edit 4, the export handler. Find (once):

```js
  const matchingSections = useMemo(() => activeList.filter((section) => sectionMatches(sectionQuery, section)), [activeList, sectionQuery]);
```

Replace with:

```js
  const matchingSections = useMemo(() => activeList.filter((section) => sectionMatches(sectionQuery, section)), [activeList, sectionQuery]);
  // The grade image always covers the whole active grade, whatever the search box says, so its
  // totals row is the grade's total.
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const exportImage = async () => {
    setExporting(true);
    setExportError('');
    try {
      const summary = gradeSummary({ grade: activeGrade, sections: rows, counts: countsBySection, schedules: scheduleById, schoolYear: selectedYear });
      const png = await renderGradeSummaryPng(summary, { schoolName, generatedOn: new Date() });
      downloadBlob(png, gradeImageFilename(activeGrade, selectedYear));
    } catch {
      setExportError('Could not create the image. Please try again.');
    } finally {
      setExporting(false);
    }
  };
```

Edit 5, the button, directly after the search box and before "Select N sections without a slip". Find (once):

```jsx
              {untickedNeedingSlip.length > 0 && <Btn variant="ghost" onClick={() => setSlipSelection((prev) => withSelected(prev, untickedNeedingSlip))}>
```

Replace with:

```jsx
              {canViewRoster && <Btn variant="ghost" loading={exporting} aria-label={`Export image of Grade ${activeGrade} sections`} onClick={exportImage}>Export image</Btn>}
              {untickedNeedingSlip.length > 0 && <Btn variant="ghost" onClick={() => setSlipSelection((prev) => withSelected(prev, untickedNeedingSlip))}>
```

Edit 6, the error message under the toolbar. Find (once):

```jsx
            {sectionSearchActive && (
```

Replace with:

```jsx
            {exportError && <p role="alert" className="sims-feedback">{exportError}</p>}
            {sectionSearchActive && (
```

Edit 7, the Enrolled cell. Find (once):

```jsx
                    {canViewRoster && <td style={{ ...S.td, ...T.num }}>{enrolledCountBySection.get(s.id) || 0}</td>}
```

Replace with:

```jsx
                    {canViewRoster && <td style={{ ...S.td, ...T.num }}>{countsBySection.get(s.id)?.total || 0}</td>}
```

In `src/App.jsx`, find (once):

```jsx
          {shown==='sections' && <SectionsPage me={me} schoolYear={schoolYear} />}
```

Replace with (`settings` is the `settings/app` document `App` already reads):

```jsx
          {shown==='sections' && <SectionsPage me={me} schoolYear={schoolYear} schoolName={settings?.schoolName} />}
```

- [ ] **Step 4: Run the page tests and the theme guards**

Run: `npm test -- src/pages/SectionsPage.test.js shared/theme`
Expected: PASS for every file. `shared/theme/literals.test.js` confirms the JSX edits added no color literals.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SectionsPage.jsx src/pages/SectionsPage.test.js src/App.jsx
git commit -m "feat(sims): export a grade's section summary as an image from the Sections page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Real-browser harness

**Files:**
- Create: `tests/browser/grade-export.config.mjs`
- Create: `tests/browser/grade-export-fixture.js`
- Create: `tests/browser/grade-export.html`
- Create: `tests/browser/grade-export.jsx`
- Modify: `tests/browser/README.md`

**Interfaces:**
- Consumes: the real `SectionsPage` (Task 4) and the real image modules; the base config `tests/browser/registrar.config.mjs`.
- Produces: a harness on port 5192 that prints PASS or FAIL lines and shows each exported PNG.

This harness follows `tests/browser/section-editing.*`: the real page and the real image code in a real browser, with synthetic collections and no services. It also swaps `useAdvisoryStatus` for a quiet stub; without it the base config's blanket data stubs make that hook show an unrelated error banner.

The harness page loads Inter from Google Fonts exactly as `index.html` does, so the canvas measures and draws with the production typeface. If the design hook flags that `<link>` as an overused font, it is a false positive: Inter is the app's own typeface (`DESIGN.md`, `T.print`). Do not remove the link and do not add ignore comments; without it the image renders in a fallback font and the by-eye check in Step 4 would not reflect production.

- [ ] **Step 1: Create the harness files**

Create `tests/browser/grade-export.config.mjs`:

```js
import base from './registrar.config.mjs';

export default {
  ...base,
  plugins: [{
    name: 'grade-export-fixture', enforce: 'pre',
    load(id) {
      const path = id.replaceAll('\\', '/');
      if (path.endsWith('/src/hooks/useCollection.js')) return 'export { useStaffCollectionResource } from "/tests/browser/grade-export-fixture.js";';
      // Advisory slips are not under test; without this the blanket data stubs make the hook report an error banner.
      if (path.endsWith('/src/hooks/useAdvisoryStatus.js')) return 'export const useAdvisoryStatus = () => ({ bySection: new Map(), loading: false, error: "", reload() {} });';
    },
  }, ...base.plugins],
  server: { ...base.server, port: 5192 },
  cacheDir: 'node_modules/.vite-grade-export',
};
```

Create `tests/browser/grade-export-fixture.js`:

```js
export const SCHOOL_YEAR = '2026-2027';

const schedules = [{ id: 'AM', name: 'Morning Shift' }, { id: 'PM', name: 'Afternoon Shift' }];
const sections = [
  { id: 'g8-mabini', gradeLevel: 8, name: 'Mabini', adviserName: 'Ana Cruz', scheduleId: 'AM', schoolYear: SCHOOL_YEAR },
  { id: 'g8-rizal', gradeLevel: 8, name: 'Rizal', adviserName: 'Maria Cristina Dela Cruz-Santos', scheduleId: 'PM', schoolYear: SCHOOL_YEAR },
  { id: 'g8-bonifacio', gradeLevel: 8, name: 'Bonifacio', schoolYear: SCHOOL_YEAR },
  { id: 'g11-newton', gradeLevel: 11, name: 'Newton', adviserName: 'Cora Tan', scheduleId: 'AM', track: 'Academic', strand: 'STEM', schoolYear: SCHOOL_YEAR },
  { id: 'g11-bakery', gradeLevel: 11, name: 'Bakery', adviserName: 'Eva Santos', scheduleId: 'PM', track: 'TVL', strand: 'Home Economics', schoolYear: SCHOOL_YEAR },
  { id: 'g8-next', gradeLevel: 8, name: 'Aquino', adviserName: 'Ben Dy', scheduleId: 'AM', schoolYear: '2027-2028' },
];

const students = [];
const enrollments = [];
// One enrolled learner per head, so a section's counts are exactly the numbers given. A '' key makes
// learners with no sex on record.
const enroll = (sectionId, gradeLevel, counts) => {
  Object.entries(counts).forEach(([sex, count]) => {
    for (let i = 0; i < count; i += 1) {
      const id = `${sectionId}-${sex || 'none'}-${i}`;
      students.push({ id, sex });
      enrollments.push({ studentId: id, sectionId, gradeLevel, schoolYear: SCHOOL_YEAR, status: 'enrolled' });
    }
  });
};
enroll('g8-mabini', 8, { M: 21, F: 19 });
enroll('g8-rizal', 8, { M: 20, F: 20 });
enroll('g11-newton', 11, { M: 18, F: 22 });
enroll('g11-bakery', 11, { M: 3, F: 30, '': 1 });
// A transferred learner must not be counted.
enrollments.push({ studentId: 'gone', sectionId: 'g8-mabini', gradeLevel: 8, schoolYear: SCHOOL_YEAR, status: 'transferred' });

const collections = { sections, enrollments, students, schedules };

export function useStaffCollectionResource(path) {
  return { data: collections[path] ?? [], loading: false, error: null, retry: () => {} };
}
```

Create `tests/browser/grade-export.html`:

```html
<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grade image export — synthetic checks</title>
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" /></head>
<body><p>Synthetic grade image export. Add <code>?checks</code> to run the checks (PASS or FAIL lines, with each exported image shown below) and <code>&amp;theme=dark</code> for dark mode.</p>
<div id="results" aria-live="polite"></div><main class="sims-ui" id="root" style="padding:24px;max-width:1100px;margin:auto"></main>
<section id="previews" style="padding:24px"></section><script type="module" src="/tests/browser/grade-export.jsx"></script></body></html>
```

Create `tests/browser/grade-export.jsx`:

```jsx
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import '/shared/theme/theme.css';
import '/src/registrar.css';
import SectionsPage from '/src/pages/SectionsPage.jsx';
import { SCHOOL_YEAR } from './grade-export-fixture.js';

window.IS_REACT_ACT_ENVIRONMENT = true;
const host = document.getElementById('root');
const previews = document.getElementById('previews');
const root = createRoot(host);
const admin = { role: 'admin', uid: 'synthetic-admin' };
const glc = { role: 'glc', gradeLevel: 8, uid: 'synthetic-glc' };
const assert = (value, message) => { if (!value) throw Error(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const render = (me = admin, year = SCHOOL_YEAR, key = 'test') => act(async () => root.render(<SectionsPage key={key} me={me} schoolYear={year} />));
const exportButton = () => host.querySelector('button[aria-label^="Export image of Grade"]');
const gradeButton = (grade) => [...host.querySelectorAll('button.sims-segment')].find((node) => node.textContent.startsWith(`Grade ${grade}`));
const input = (label) => {
  const field = [...host.querySelectorAll('label')].find((node) => node.textContent === label);
  return document.getElementById(field?.htmlFor);
};
const click = (node) => act(async () => { assert(node, 'Missing control'); node.focus(); node.click(); });
const change = (node, value) => act(async () => {
  assert(node, 'Missing field');
  Object.getOwnPropertyDescriptor(node.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(node, value);
  node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});

// Downloads are captured instead of saved: the link click is swallowed and its Blob kept.
const downloads = [];
const blobs = new Map();
const createObjectURL = URL.createObjectURL.bind(URL);
URL.createObjectURL = (blob) => { const url = createObjectURL(blob); blobs.set(url, blob); return url; };
HTMLAnchorElement.prototype.click = function capture() { downloads.push({ filename: this.download, blob: blobs.get(this.href) }); };

const reset = async (key) => { downloads.length = 0; await render(admin, SCHOOL_YEAR, key); };
const exportAndWait = async () => {
  await click(exportButton());
  for (let i = 0; i < 100 && !downloads.length; i += 1) await act(async () => { await sleep(50); });
  assert(downloads.length === 1, 'The image was never downloaded');
  return downloads[0];
};
const showPreview = (label, blob) => {
  const figure = previews.appendChild(document.createElement('figure'));
  const image = figure.appendChild(new Image());
  image.src = URL.createObjectURL(blob);
  image.alt = `${label} export`;
  image.style.width = '540px';
  figure.appendChild(document.createElement('figcaption')).textContent = label;
};
// Size, corner colour and how much of the image is ink or the teal accent.
const inspect = async (blob) => {
  const bitmap = await createImageBitmap(blob);
  const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  let ink = 0;
  let teal = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) ink += 1;
    if (Math.abs(data[i] - 7) < 12 && Math.abs(data[i + 1] - 118) < 12 && Math.abs(data[i + 2] - 131) < 12) teal += 1;
  }
  return { width: bitmap.width, height: bitmap.height, corner: [...data.slice(0, 4)].join(), ink, teal };
};

const checks = [
  ['Export image shows for every role that opens Sections, in the current school year only', async () => {
    await render(admin, SCHOOL_YEAR, 'admin');
    assert(exportButton()?.textContent === 'Export image', 'Administrator has no Export image button');
    assert(exportButton().getAttribute('aria-label') === 'Export image of Grade 8 sections', 'Wrong accessible name');
    await render(glc, SCHOOL_YEAR, 'glc');
    assert(exportButton(), 'Grade Level Coordinator has no button');
    await render({ role: 'jhs_coord' }, SCHOOL_YEAR, 'jhs');
    assert(exportButton(), 'Academic coordinator has no button');
    await render(admin, SCHOOL_YEAR, 'next-year');
    await change(input('School year'), '2027-2028');
    assert(host.textContent.includes('Aquino') && !exportButton(), 'The next-year planning view must not offer the image');
  }],
  ['One click downloads a light, non-blank PNG named for the grade and school year', async () => {
    await reset('download');
    const { filename, blob } = await exportAndWait();
    assert(filename === 'BNHS-Grade-8-Sections-SY2026-2027.png', `Wrong file name: ${filename}`);
    assert(blob.type === 'image/png', `Wrong type: ${blob.type}`);
    const pixels = await inspect(blob);
    assert(pixels.width === 2160 && pixels.height > 500 && pixels.height < 3000, `Unexpected size ${pixels.width}x${pixels.height}`);
    assert(pixels.corner === '255,255,255,255', 'The corner is not white');
    assert(pixels.ink > 20000 && pixels.teal > 1000, 'The image looks blank');
    assert(!exportButton().disabled, 'The button stayed busy');
    showPreview('Grade 8 (junior high)', blob);
  }],
  ['The image covers the whole grade while the search box filters the table', async () => {
    await reset('search');
    const full = await inspect((await exportAndWait()).blob);
    downloads.length = 0;
    await change(host.querySelector('input[type="search"]'), 'Mab');
    assert(host.textContent.includes('1 section in Grade 8 match'), 'The search did not filter the table');
    const filtered = await inspect((await exportAndWait()).blob);
    assert(filtered.height === full.height, 'The search box changed which sections were exported');
  }],
  ['Grade 11 exports its own file, with the Strand column and the missing-sex note', async () => {
    await reset('grade-11');
    await click(gradeButton(11));
    assert(exportButton().getAttribute('aria-label') === 'Export image of Grade 11 sections', 'The button did not follow the grade');
    const { filename, blob } = await exportAndWait();
    assert(filename === 'BNHS-Grade-11-Sections-SY2026-2027.png', `Wrong file name: ${filename}`);
    showPreview('Grade 11 (senior high: Strand column, one learner without a sex on record)', blob);
  }],
  ['A failed export shows an alert, leaves the page usable and recovers', async () => {
    await reset('failure');
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function failing(done) { done(null); };
    const alertText = () => [...host.querySelectorAll('[role="alert"]')].map((node) => node.textContent).join('|');
    try {
      await click(exportButton());
      for (let i = 0; i < 100 && !alertText(); i += 1) await act(async () => { await sleep(50); });
      assert(alertText() === 'Could not create the image. Please try again.', `Wrong or missing export error: "${alertText()}"`);
      assert(!downloads.length && !exportButton().disabled, 'The failed export left the page unusable');
    } finally { HTMLCanvasElement.prototype.toBlob = toBlob; }
    await exportAndWait();
    assert(!alertText(), 'The error stayed after a successful export');
  }],
  ['Dark mode still produces a light image', async () => {
    await reset('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    try {
      const pixels = await inspect((await exportAndWait()).blob);
      assert(pixels.corner === '255,255,255,255', 'Dark mode leaked into the image');
    } finally { document.documentElement.removeAttribute('data-theme'); }
  }],
];

if (new URLSearchParams(location.search).get('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
if (location.search.includes('checks')) {
  for (const [name, run] of checks) {
    const result = document.getElementById('results').appendChild(document.createElement('p'));
    try { await run(); result.textContent = `PASS ${name}`; }
    catch (error) { result.textContent = `FAIL ${name}: ${error.message}`; console.error(error); }
  }
} else {
  await reset('preview');
}
```

- [ ] **Step 2: Document the harness**

In `tests/browser/README.md`, find (once, the last sentence of the file):

```
and assignments, revokes and corrections that persist until the page reloads. It never calls production services.
```

Replace with that same text followed by a blank line and this new section (the outer fence is four backticks because the section holds its own fenced block):

````markdown
and assignments, revokes and corrections that persist until the page reloads. It never calls production services.

## Grade image export

```powershell
npm exec vite -- --config tests/browser/grade-export.config.mjs
```

Open http://127.0.0.1:5192/tests/browser/grade-export.html?checks (add `&theme=dark` for dark mode). Six PASS lines cover the Export image button (every role that opens Sections, current school year only), the downloaded PNG (file name, 2160 px width, light background, not blank), the whole grade being exported while the search box filters the table, the Grade 11 export, a failed export showing an alert and then recovering, and dark mode still producing a light image. Each exported image is shown below the checks so the Grade 8 (junior high) and Grade 11 (Strand column, missing-sex note) layouts can be checked by eye. The real page runs against synthetic collections; it never calls production services.
````

- [ ] **Step 3: Run the harness and read the results**

Start the server in the background from the worktree root and note its task id (you stop it by that id, never by killing `node` by name):

```powershell
npm exec vite -- --config tests/browser/grade-export.config.mjs
```

Expected: Vite prints `http://127.0.0.1:5192/`. With a browser tool (the built-in browser pane), open `http://127.0.0.1:5192/tests/browser/grade-export.html?checks` and read the page text. Expected, exactly six lines:

```
PASS Export image shows for every role that opens Sections, in the current school year only
PASS One click downloads a light, non-blank PNG named for the grade and school year
PASS The image covers the whole grade while the search box filters the table
PASS Grade 11 exports its own file, with the Strand column and the missing-sex note
PASS A failed export shows an alert, leaves the page usable and recovers
PASS Dark mode still produces a light image
```

If a line reads `FAIL …`, fix the cause in the page or modules (not by loosening the check) and reload. If no browser tool is available, ask the user to open the URL and paste the six lines.

- [ ] **Step 4: Look at the exported images**

Scroll to the two previews under the results and check them by eye:
- **Grade 8:** the BNHS seal at the left of the header, `BUKIDNON NATIONAL HIGH SCHOOL`, `Grade 8 · Sections and enrollment` in teal, and `SY 2026-2027`. Rows in table order: Bonifacio (adviser and schedule shown as `—`, counts 0 / 0 / 0), Mabini (`ANA CRUZ`, Morning Shift, 21 / 19 / 40), Rizal (adviser wrapped onto two lines, Afternoon Shift on one line, 20 / 20 / 40). A teal rule, then `Grade 8 total · 3 sections` with 41 / 39 / 80, then `Generated <today> · BNHS Learner Records`.
- **Grade 11:** the same header, plus a STRAND column. Rows Bakery (`Home Economics` wrapped onto two lines) and Newton (`STEM`). Totals `Grade 11 total · 2 sections` with 21 / 52 / 74, and above the footer the line `1 learner has no sex on record, so Male + Female is less than Total.`
- Nothing is clipped at the right edge, no word is cut mid-word, and the background is white.

Also open the page once without `?checks` and confirm the **Export image** button sits right of the search box in the toolbar.

- [ ] **Step 5: Stop the server and commit**

Stop the Vite task you started, using its task id. Then:

```bash
git add tests/browser/grade-export.config.mjs tests/browser/grade-export-fixture.js tests/browser/grade-export.html tests/browser/grade-export.jsx tests/browser/README.md
git commit -m "test(sims): real-browser checks for the grade image export" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Final verification

**Files:** none (fix and recommit only if something fails).

- [ ] **Step 1: Run the whole SIMS unit suite**

Run: `npm test`
Expected: every file passes (72 files, 756 tests).

- [ ] **Step 2: Run a production build**

The build needs the Firebase `VITE_*` values. Load them from the main checkout's `.env` into this process only; never copy the file and never print the values. In PowerShell, from the worktree root:

```powershell
$mainEnv = 'C:\Users\jitsb\OneDrive - Department of Education\Desktop\APPS\bnhs-sims\.env'
Get-Content $mainEnv | Where-Object { $_ -match '^\s*VITE_[A-Z0-9_]+\s*=' } | ForEach-Object {
  $name, $value = $_ -split '=', 2
  Set-Item -Path ("Env:" + $name.Trim()) -Value $value.Trim().Trim('"')
}
npm run build
```

Expected: the build ends with `✓ built in …`. The "chunks are larger than 500 kB" warning is old and unrelated. PowerShell may also print a `NativeCommandError` banner around Vite's reporter output; that is only stderr wrapping.

- [ ] **Step 3: Check the bundle did not drag in Excel code**

Run:

```powershell
Get-ChildItem dist/assets -Filter 'downloadBlob-*.js' | Select-Object Name, Length
Select-String -Path (Get-ChildItem dist/assets -Filter 'SectionsPage-*.js').FullName -Pattern 'downloadWorkbook' -SimpleMatch -Quiet
```

Expected: a `downloadBlob-*.js` file of well under 1 KB, and `False` for the second command (the Sections page must not import the 930 kB `downloadWorkbook` chunk, which is ExcelJS).

- [ ] **Step 4: Confirm the tree is clean**

Run: `git status --short`
Expected: no output, except that an untracked `.impeccable/` folder may appear. That is the design hook's cache (`hook.cache.json`), not part of this work, so never add it; every commit above stages files by name for that reason. (`dist/` and `node_modules` are gitignored.) Then `git log --oneline -5` shows the five commits from Tasks 1 to 5.

- [ ] **Step 5: Report**

Tell the user what shipped: the Export image button, how it behaves, the verification run (unit counts, six browser checks, build), and that **nothing was deployed**. SIMS hosting ships through its own release preparation, and this is a SIMS-only change (no functions, rules or Parent app change).
