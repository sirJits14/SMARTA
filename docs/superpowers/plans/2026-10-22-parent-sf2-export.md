# SF2 Download from the Parent App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Class Adviser can download the SF2 for their section and a chosen month from the Parent App's Class tab, as the same Excel workbook SIMS exports.

**Architecture:** The SIMS SF2 builder moves into `shared/sf2/` and takes the template as an input, so SIMS (browser) and Cloud Functions (Node) run one implementation. A new `schoolCall` callable, `exportSchoolSf2Fn`, gathers the roster and attendance, builds the workbook and returns it as base64. The Parent App adds a lazy month-picker sheet to the Class tab that calls it and saves the file with the phone's share sheet or a download link.

**Tech Stack:** ExcelJS 4.4, Firebase Functions v2 (Node 22, Admin SDK), React 19 with Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-parent-sf2-export-design.md`. One refinement to it, already reflected in the spec: SIMS's `src/lib/dates.js`, `roster.js` and `attendance.js` are left alone. `shared/sf2/` carries its own copies of the few pure helpers the builder needs (school days, month label, first Friday of June, name formatting), and parity tests keep them in step with SIMS's.

**This plan comes first.** The learner-requests plan (`2026-10-22-parent-learner-requests.md`) builds on all of it: the shared `Sheet` component, the Class tab action row, the `schoolCall` options and the new strings.

## Global Constraints

- **Format:** Excel only, identical to the SIMS export (same template, marks, totals, adviser name, layout). No PDF.
- **Authorization:** the same as the roster, `canReviewSection`, for the current school year only.
- **Months offered:** the current school year, June through May, up to the current month in Manila, and only once the month's first weekday has arrived.
- **School days:** every weekday counts, exactly as SIMS does today (no holiday calendar).
- **Rate limit:** 20 exports per hour per user (action `sf2Export`).
- **Function:** 512 MiB memory, 60 second timeout.
- **Parent App budget:** first-load JavaScript stays under 260 KB gzip (`npm --prefix parent run size`). The sheet loads on demand and the Parent App gains no dependency.
- **Parent App UI:** keep the merged PR #74 design: theme choice only in Settings › Appearance, and the icon-only Sessions button. Do not touch either.
- **DESIGN.md:** new CSS uses only the documented radii (8, 10, 12, 999px) and type sizes (12 to 16px for new rules).
- **SIMS behavior does not change.** Its SF2 export must produce the same workbook as before.

## Before you start

Run everything from the repository root in PowerShell. Set this once per terminal (it avoids IPv6 flakiness on this machine):

```powershell
$env:NODE_OPTIONS = '--dns-result-order=ipv4first'
```

A fresh worktree has no dependencies. Link them from the main checkout (directory junctions; skip any that already exist):

```powershell
$main = 'C:\Users\jitsb\OneDrive - Department of Education\Desktop\APPS\bnhs-sims'
foreach ($d in 'node_modules', 'functions\node_modules', 'parent\node_modules') {
  if (-not (Test-Path $d)) { New-Item -ItemType Junction -Path $d -Target (Join-Path $main $d) | Out-Null }
}
```

Command forms used below (each was run in this repository while writing the plan):

| What | Command |
|---|---|
| SIMS and shared unit tests | `npx vitest run <files>` |
| Parent unit tests | `npm --prefix parent test -- <files>` (no files = the whole Parent suite) |
| Functions unit tests | `node scripts/syncShared.mjs` then `cd functions; npx vitest run <files>; cd ..` |
| Functions emulator tests | `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run --no-file-parallelism <test files>"` |
| Firestore rules tests | `npx firebase emulators:exec --only firestore "vitest run -c vitest.rules.config.js <files>"` |

Emulator runs need Java (installed) and take 15 to 40 seconds. Always pass `--no-file-parallelism` when you name more than one emulator file: the files wipe the shared database and would break each other.

Builds need the production `VITE_*` values. Load them from the main checkout into the current process only; never copy the `.env` files into the worktree and never print their values:

```powershell
$main = 'C:\Users\jitsb\OneDrive - Department of Education\Desktop\APPS\bnhs-sims'
# Parent App
Get-Content (Join-Path $main 'parent\.env') | ForEach-Object { if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $_ -notmatch '^\s*#') { Set-Item -Path ("Env:" + $Matches[1]) -Value $Matches[2].Trim('"') } }
npm --prefix parent run build
npm --prefix parent run size
# SIMS (use a fresh terminal, or clear the Parent values first)
Get-Content (Join-Path $main '.env') | ForEach-Object { if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $_ -notmatch '^\s*#') { Set-Item -Path ("Env:" + $Matches[1]) -Value $Matches[2].Trim('"') } }
Remove-Item Env:VITE_APPCHECK_DEBUG_TOKEN -ErrorAction SilentlyContinue
$env:VITE_USE_EMULATORS = 'false'
npm run build
```

`dist` and `parent/dist` are gitignored. SIMS prints a chunk-size warning about two large chunks; it is long-standing and harmless.

Commits: end each commit message with the attribution line your session was given, and never commit `.env` files. Do not commit anything under `.impeccable/` or `.superpowers/`.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `shared/sf2/calendar.js` | create | `schoolDaysInMonth`, `monthLabel`, `firstFridayOfJune` |
| `shared/sf2/months.js` | create | `sf2Months`, `isSf2Month`: the months an adviser may download |
| `shared/sf2/names.js` | create | `capsName`, `fullName` for the form |
| `shared/sf2/sf2Template.js` | move from `src/lib/sf2Template.js` | row marks, totals, Monday alignment |
| `shared/sf2/buildSf2Workbook.js` | move from `src/lib/sf2.js` | the workbook builder; the template is passed in |
| `shared/sf2/sf2-template.xlsx` | move from `src/assets/` | the DepEd SF2 template |
| `src/lib/sf2.js`, `src/lib/sf2Template.js` | rewrite | SIMS wrapper and re-export, same public API |
| `src/pages/AttendanceSummaryPage.jsx` | modify | imports `firstFridayOfJune` from shared |
| `functions/src/handlers/sf2Export.js` | create | `exportSchoolSf2`, `sf2Filename` |
| `functions/src/callable.js`, `functions/index.js`, `functions/package.json` | modify | the limit, `schoolCall` options, the export, `exceljs` |
| `parent/src/lib/sf2.js` | create | month options, base64 to File, save/share |
| `parent/src/components/Sheet.jsx` | create | shared bottom sheet (portal, Escape, focus) |
| `parent/src/screens/school/Sf2Sheet.jsx`, `ClassActions.jsx` | create | the month sheet and the Class tab action row |
| `parent/src/screens/school/ClassTab.jsx`, `ClassTab.css`, `parent/src/strings.js` | modify | wiring, styles, copy |

### Task 1: Shared SF2 calendar and month rules

**Files:**
- Create: `shared/sf2/calendar.js`, `shared/sf2/months.js`
- Test: `shared/sf2/calendar.test.js`, `shared/sf2/months.test.js`

**Interfaces:**
- Produces: `schoolDaysInMonth(year, month)` → `YYYY-MM-DD[]`; `monthLabel('2026-10')` → `'October 2026'`; `firstFridayOfJune('2026-2027')` → `'2026-06-05'`; `sf2Months(schoolYear, today)` → `YYYY-MM[]` newest first; `isSf2Month(schoolYear, month, today)` → boolean.

- [ ] **Step 1: Write the failing tests**

`shared/sf2/calendar.test.js` (it also checks the helpers against SIMS's own copies in `src/lib/dates.js`):

```js
import { describe, expect, it } from 'vitest';
import { firstFridayOfJune, monthLabel, schoolDaysInMonth } from './calendar.js';
import * as simsDates from '../../src/lib/dates.js';

describe('SF2 calendar helpers', () => {
  it('lists the weekdays of a month', () => {
    const days = schoolDaysInMonth(2026, 10);
    expect(days).toHaveLength(22);
    expect(days[0]).toBe('2026-10-01');
    expect(days.at(-1)).toBe('2026-10-30');
    expect(days).not.toContain('2026-10-03'); // a Saturday
  });
  it('labels a month in English', () => {
    expect(monthLabel('2026-10')).toBe('October 2026');
  });
  it('finds the first Friday of June', () => {
    expect(firstFridayOfJune('2026-2027')).toBe('2026-06-05');
    expect(firstFridayOfJune('2027-2028')).toBe('2027-06-04');
    expect(firstFridayOfJune('2028-2029')).toBe('2028-06-02');
  });
  it('agrees with the SIMS copies in src/lib/dates.js', () => {
    for (const [year, month] of [[2026, 6], [2026, 9], [2026, 12], [2027, 2], [2027, 5]]) {
      expect(schoolDaysInMonth(year, month)).toEqual(simsDates.schoolDaysInMonth(year, month));
    }
    for (const ym of ['2026-06', '2026-12', '2027-03']) expect(monthLabel(ym)).toBe(simsDates.monthLabel(ym));
  });
});
```

`shared/sf2/months.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { isSf2Month, sf2Months } from './months.js';

describe('sf2Months', () => {
  it('lists the school year up to today, newest first', () => {
    expect(sf2Months('2026-2027', '2026-10-22')).toEqual(['2026-10', '2026-09', '2026-08', '2026-07', '2026-06']);
  });
  it('waits for a month’s first weekday', () => {
    // 2026-11-01 is a Sunday; November's first weekday is Monday the 2nd.
    expect(sf2Months('2026-2027', '2026-11-01')[0]).toBe('2026-10');
    expect(sf2Months('2026-2027', '2026-11-02')[0]).toBe('2026-11');
  });
  it('covers June through May once the year is over', () => {
    const all = sf2Months('2026-2027', '2027-07-15');
    expect(all).toHaveLength(12);
    expect(all[0]).toBe('2027-05');
    expect(all.at(-1)).toBe('2026-06');
  });
  it('offers nothing before the school year starts or for malformed input', () => {
    expect(sf2Months('2026-2027', '2026-05-30')).toEqual([]);
    expect(sf2Months('2026-27', '2026-10-22')).toEqual([]);
    expect(sf2Months('2026-2028', '2026-10-22')).toEqual([]);
    expect(sf2Months('2026-2027', 'today')).toEqual([]);
    expect(sf2Months(undefined, '2026-10-22')).toEqual([]);
  });
  it('checks one month against the same rule', () => {
    expect(isSf2Month('2026-2027', '2026-10', '2026-10-22')).toBe(true);
    expect(isSf2Month('2026-2027', '2026-05', '2026-10-22')).toBe(false);
    expect(isSf2Month('2026-2027', '2026-11', '2026-10-22')).toBe(false);
    expect(isSf2Month('2026-2027', 'garbage', '2026-10-22')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

```powershell
npx vitest run shared/sf2/calendar.test.js shared/sf2/months.test.js
```

Expected: FAIL. Both files fail to load (`Failed to resolve import "./calendar.js"` and `"./months.js"`).

- [ ] **Step 3: Write the implementation**

`shared/sf2/calendar.js`:

```js
// School-calendar helpers for the SF2. SIMS keeps its own copies in src/lib/dates.js (see
// calendar.test.js, which keeps the two in step); Cloud Functions and the Parent App use these.
const pad2 = (n) => String(n).padStart(2, '0');

// Every weekday of a month as YYYY-MM-DD. SIMS has no holiday calendar, so each weekday counts.
export function schoolDaysInMonth(year, month /* 1..12 */) {
  const out = [];
  const days = new Date(year, month, 0).getDate();
  for (let day = 1; day <= days; day++) {
    const dow = new Date(year, month - 1, day).getDay(); // 0 Sun .. 6 Sat
    if (dow !== 0 && dow !== 6) out.push(`${year}-${pad2(month)}-${pad2(day)}`);
  }
  return out;
}

// "2026-10" -> "October 2026"
export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

// DepEd's "Enrolment as of 1st Friday of June" cutoff for a school year such as "2026-2027".
export function firstFridayOfJune(schoolYear) {
  const year = Number(schoolYear.split('-')[0]);
  const d = new Date(year, 5, 1); // June 1
  for (let i = 0; i < 7 && d.getDay() !== 5; i++) d.setDate(d.getDate() + 1); // 5 = Friday, at most 6 steps
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
```

`shared/sf2/months.js`:

```js
import { schoolDaysInMonth } from './calendar.js';

const SCHOOL_YEAR = /^(\d{4})-(\d{4})$/;
const pad2 = (n) => String(n).padStart(2, '0');

// The months an adviser may download an SF2 for: June of the school year's first year through May of
// its second, up to `today` (a YYYY-MM-DD in school time), and only once the month's first weekday has
// arrived. Newest first, as YYYY-MM. The Parent App and Cloud Functions share this rule.
export function sf2Months(schoolYear, today) {
  const match = SCHOOL_YEAR.exec(schoolYear || '');
  if (!match || Number(match[2]) !== Number(match[1]) + 1 || !/^\d{4}-\d{2}-\d{2}$/.test(today || '')) return [];
  const start = Number(match[1]);
  const months = [];
  for (let i = 0; i < 12; i++) {
    const year = start + Math.floor((5 + i) / 12); // June is zero-based month 5
    const month = ((5 + i) % 12) + 1;
    if (schoolDaysInMonth(year, month)[0] <= today) months.push(`${year}-${pad2(month)}`);
  }
  return months.reverse();
}

export const isSf2Month = (schoolYear, month, today) => sf2Months(schoolYear, today).includes(month);
```

- [ ] **Step 4: Run the tests to see them pass**

```powershell
npx vitest run shared/sf2/calendar.test.js shared/sf2/months.test.js
```

Expected: PASS, 2 test files.

- [ ] **Step 5: Commit**

```powershell
git add shared/sf2/calendar.js shared/sf2/calendar.test.js shared/sf2/months.js shared/sf2/months.test.js
git commit -m "feat(sf2): shared school-calendar and month rules"
```

### Task 2: Move the SF2 builder into shared code

SIMS keeps working exactly as before: `src/lib/sf2.js` becomes a thin wrapper that fetches the template and calls the shared builder, and `src/lib/sf2Template.js` re-exports the moved helpers.

**Files:**
- Create: `shared/sf2/names.js`, `src/lib/sf2.js` (new wrapper), `src/lib/sf2Template.js` (new re-export)
- Move: `src/assets/sf2-template.xlsx` → `shared/sf2/sf2-template.xlsx`; `src/lib/sf2Template.js` → `shared/sf2/sf2Template.js`; `src/lib/sf2.js` → `shared/sf2/buildSf2Workbook.js`
- Modify: `src/lib/sf2.test.js`, `src/pages/AttendanceSummaryPage.jsx`
- Test: `shared/sf2/names.test.js`, `shared/sf2/buildSf2Workbook.test.js`

**Interfaces:**
- Consumes: `schoolDaysInMonth`, `monthLabel`, `firstFridayOfJune` from Task 1.
- Produces: `buildSf2Workbook({ templateBuffer, section, roster, schoolDays, docsByDate, monthLabelText, schoolId, schoolName, enrolledAsOfCutoff })` → ExcelJS workbook (`templateBuffer` is an ArrayBuffer, Uint8Array or Node Buffer); `capsName(name)`, `fullName(student)` (`DELA CRUZ, JUAN S. JR`); SIMS keeps `buildSF2Workbook(options)` (no `templateBuffer`) and every export of `src/lib/sf2Template.js`.

- [ ] **Step 1: Write the failing tests**

`shared/sf2/names.test.js` (the second test keeps the copy identical to `src/lib/roster.js`):

```js
import { describe, expect, it } from 'vitest';
import { capsName, fullName } from './names.js';
import * as roster from '../../src/lib/roster.js';

describe('SF2 names', () => {
  it('writes DepEd order in capitals with a middle initial and extension', () => {
    expect(fullName({ lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos', extName: 'Jr' })).toBe('DELA CRUZ, JUAN S. JR');
    expect(fullName({ lastName: 'Dy', firstName: 'Ben' })).toBe('DY, BEN');
    expect(capsName(undefined)).toBe('');
  });
  it('matches the SIMS roster helpers it was copied from', () => {
    const samples = [
      { lastName: 'Cruz', firstName: 'Ana', middleName: 'B' },
      { lastName: 'Reyes', firstName: 'Mark', middleName: ' ', extName: 'III' },
      { lastName: 'Ñato', firstName: 'Zoë', middleName: 'ñandú' },
    ];
    for (const sample of samples) expect(fullName(sample)).toBe(roster.fullName(sample));
    expect(capsName('teacher tina')).toBe(roster.capsName('teacher tina'));
  });
});
```

`shared/sf2/buildSf2Workbook.test.js` (builds September 2026 from the real template, as Cloud Functions will):

```js
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildSf2Workbook } from './buildSf2Workbook.js';
import { monthLabel, schoolDaysInMonth } from './calendar.js';

const templateBuffer = readFileSync(new URL('./sf2-template.xlsx', import.meta.url));
const section = { id: 'SEC1', name: 'Rizal', gradeLevel: 7, schoolYear: '2026-2027', adviserName: 'Teacher Tina' };
const roster = [
  { id: 'S1', firstName: 'Ana', lastName: 'Cruz', middleName: 'B', sex: 'F' },
  { id: 'S2', firstName: 'Ben', lastName: 'Dy', sex: 'M' },
];
const docsByDate = {
  '2026-09-21': { sectionId: 'SEC1', marks: { S1: 'L', S2: 'A' } },
  '2026-09-23': { sectionId: 'SEC1', marks: {}, sessionOverrides: { S2: { am: { absent: true } } } },
};

// Builds September 2026, saves and reloads it, and returns the sheet, as a downloaded file would be read.
async function build(over = {}) {
  const workbook = await buildSf2Workbook({
    templateBuffer, section, roster, schoolDays: schoolDaysInMonth(2026, 9), docsByDate, monthLabelText: monthLabel('2026-09'),
    schoolId: '300000', schoolName: 'Bukidnon NHS', enrolledAsOfCutoff: 2, ...over,
  });
  const saved = new ExcelJS.Workbook();
  await saved.xlsx.load(await workbook.xlsx.writeBuffer());
  return saved.worksheets[0];
}

describe('buildSf2Workbook (shared builder)', () => {
  it('fills the header from the section and the school', async () => {
    const ws = await build();
    expect(['C6', 'K6', 'X6', 'C8', 'X8', 'AC8', 'AD88'].map((address) => ws.getCell(address).value))
      .toEqual(['300000', '2026-2027', 'September 2026', 'Bukidnon NHS', 7, 'Rizal', 'TEACHER TINA']);
  });
  it('writes males first and females after, with marks in the Monday-aligned day columns', async () => {
    const ws = await build();
    expect(ws.getCell('B14').value).toBe('DY, BEN');
    expect(ws.getCell('B36').value).toBe('CRUZ, ANA B.');
    expect(ws.getCell('S14').value).toBe('X'); // Monday 21 Sep, absent
    expect(ws.getCell('S36').value).toBe('L'); // Monday 21 Sep, late
    expect(ws.getCell('U14').value).toBe('½A'); // Wednesday 23 Sep, morning absence
    expect(ws.getCell('U14').note).toContain('AM:X PM:P');
    expect(['AC14', 'AD14', 'AC36', 'AD36'].map((address) => ws.getCell(address).value)).toEqual([1.5, 0, 0, 1]);
  });
  it('totals the month', async () => {
    const ws = await build();
    expect(ws.getCell('AG64').value).toBe(22);
    expect(['AH70', 'AI70', 'AJ70', 'AJ66', 'AJ72'].map((address) => ws.getCell(address).value)).toEqual([1, 1, 2, 2, 100]);
  });
  it('accepts an ArrayBuffer template, which is what a browser fetch returns', async () => {
    const arrayBuffer = templateBuffer.buffer.slice(templateBuffer.byteOffset, templateBuffer.byteOffset + templateBuffer.byteLength);
    const ws = await build({ templateBuffer: arrayBuffer });
    expect(ws.getCell('B14').value).toBe('DY, BEN');
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

```powershell
npx vitest run shared/sf2/names.test.js shared/sf2/buildSf2Workbook.test.js
```

Expected: FAIL. `./names.js` and `./buildSf2Workbook.js` do not exist yet.

- [ ] **Step 3: Move the files**

`git mv` keeps their history. The template is binary; do not open it.

```powershell
git mv src/assets/sf2-template.xlsx shared/sf2/sf2-template.xlsx
git mv src/lib/sf2Template.js shared/sf2/sf2Template.js
git mv src/lib/sf2.js shared/sf2/buildSf2Workbook.js
```

- [ ] **Step 4: Edit the moved files**

`shared/sf2/sf2Template.js` reads attendance through the shared module and defines the small `markFor` that SIMS's `attendance.js` used to supply:

```diff
--- a/src/lib/sf2Template.js
+++ b/shared/sf2/sf2Template.js
@@ -1,4 +1,6 @@
-import { markFor, attendanceUnits, sessionAttendance } from './attendance.js';
+import { effectiveDayMark, attendanceUnits, sessionAttendance } from '../sessionAttendance.js';
+
+const markFor = (docsByDate, date, studentId) => effectiveDayMark(docsByDate[date], studentId);
 
 const MARK_CHAR = { P: '', A: 'X', L: 'L', E: 'E' };
 
```

`shared/sf2/buildSf2Workbook.js` loses its `fetch` and `?url` import, takes the template as `templateBuffer`, and imports names from the shared copy:

```diff
--- a/src/lib/sf2.js
+++ b/shared/sf2/buildSf2Workbook.js
@@ -1,6 +1,5 @@
 import ExcelJS from 'exceljs';
-import sf2TemplateUrl from '../assets/sf2-template.xlsx?url';
-import { capsName, fullName } from './roster.js';
+import { capsName, fullName } from './names.js';
 import { splitByGender, rowsFor, dailyTallies, summaryFigures, mondayAlignmentOffset } from './sf2Template.js';
 
 const DAY_LETTER = ['S', 'M', 'T', 'W', 'TH', 'F', 'S']; // Date#getDay() index 0=Sun..6=Sat
@@ -142,11 +141,11 @@ function fillSheet(ws, { section, male, female, schoolDays, docsByDate, monthLab
   cell('AD88').value = capsName(section.adviserName);
 }
 
-export async function buildSF2Workbook({ section, roster, schoolDays, docsByDate, monthLabelText, schoolId, schoolName, enrolledAsOfCutoff }) {
-  const res = await fetch(sf2TemplateUrl);
-  const buffer = await res.arrayBuffer();
+// `templateBuffer` is the SF2 template workbook as an ArrayBuffer, Uint8Array or Node Buffer. The caller
+// supplies it so this module runs in the browser (SIMS fetches the file) and in Cloud Functions (reads it).
+export async function buildSf2Workbook({ templateBuffer, section, roster, schoolDays, docsByDate, monthLabelText, schoolId, schoolName, enrolledAsOfCutoff }) {
   const wb = new ExcelJS.Workbook();
-  await wb.xlsx.load(buffer);
+  await wb.xlsx.load(templateBuffer);
   const templateSheet = wb.worksheets[0];
 
   const { male, female } = splitByGender(roster);
```

Create `shared/sf2/names.js` (a copy of `capsName` and `fullName` from `src/lib/roster.js`; the parity test above keeps them equal):

```js
export const capsName = (name) => String(name ?? '').toUpperCase();

export function fullName(s) {
  const mi = s.middleName?.trim() ? ` ${s.middleName.trim()[0]}.` : '';
  const ext = s.extName?.trim() ? ` ${s.extName.trim()}` : '';
  return capsName(`${s.lastName}, ${s.firstName}${mi}${ext}`);
}
```

- [ ] **Step 5: Recreate the two SIMS files at their old paths**

`src/lib/sf2.js` loads the template in the browser and calls the shared builder; `src/lib/sf2Template.js` re-exports the moved helpers:

```js
import sf2TemplateUrl from '../../shared/sf2/sf2-template.xlsx?url';
import { buildSf2Workbook } from '../../shared/sf2/buildSf2Workbook.js';

// The workbook is built by shared/sf2 so SIMS and Cloud Functions produce the same file. SIMS loads the
// template in the browser; Cloud Functions reads the same file from disk.
export async function buildSF2Workbook(options) {
  const res = await fetch(sf2TemplateUrl);
  return buildSf2Workbook({ ...options, templateBuffer: await res.arrayBuffer() });
}
```

```js
// The SF2 row and total helpers live in shared/sf2 so Cloud Functions builds the same form.
export * from '../../shared/sf2/sf2Template.js';
```

- [ ] **Step 6: Point the SIMS test and page at the new locations**

The existing `src/lib/sf2.test.js` reads the template from its new home:

```diff
--- a/src/lib/sf2.test.js
+++ b/src/lib/sf2.test.js
@@ -20,7 +20,7 @@ function students(sex, count) {
 describe('SF2 workbook export', () => {
   let template;
   beforeEach(async () => {
-    const buffer = await readFile(new URL('../assets/sf2-template.xlsx', import.meta.url));
+    const buffer = await readFile(new URL('../../shared/sf2/sf2-template.xlsx', import.meta.url));
     template = new ExcelJS.Workbook();
     await template.xlsx.load(buffer);
     // Only the browser asset fetch is replaced; use the real template and exporter.
```

`AttendanceSummaryPage.jsx` stops carrying its own `firstFridayOfJune`:

```diff
--- a/src/pages/AttendanceSummaryPage.jsx
+++ b/src/pages/AttendanceSummaryPage.jsx
@@ -5,21 +5,13 @@ import { fullName, depedSort } from '../lib/roster.js';
 import { schoolDaysInMonth, monthLabel, localMonth } from '../lib/dates.js';
 import { markFor, summarizeMonth, scanTitle as dayScanTitle } from '../lib/attendance.js';
 import { buildSF2Workbook } from '../lib/sf2.js';
+import { firstFridayOfJune } from '../../shared/sf2/calendar.js';
 import { downloadWorkbook } from '../lib/downloadWorkbook.js';
 import { T, S, MARK_COLOR } from '../styles.js';
 import { Inp, Field, Btn, Card, EmptyState } from '../components/ui.jsx';
 import SectionPicker from '../components/SectionPicker.jsx';
 import { grades, scopeRoster } from '../lib/access.js';
 
-// DepEd's "Enrolment as of 1st Friday of June" cutoff for a given school
-// year (e.g. "2026-2027" -> the 1st Friday of June 2026).
-function firstFridayOfJune(schoolYear) {
-  const year = Number(schoolYear.split('-')[0]);
-  const d = new Date(year, 5, 1); // June 1
-  for (let i = 0; i < 7 && d.getDay() !== 5; i++) d.setDate(d.getDate() + 1); // 5 = Friday, at most 6 steps
-  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
-}
-
 export default function AttendanceSummaryPage({ me, schoolYear }) {
   const sectionsResource = useStaffCollectionResource('sections', { me, schoolYear });
   // Coordinators pick only their grades' sections; an out-of-scope dashboard
```

- [ ] **Step 7: Run the tests to see them pass**

```powershell
npx vitest run shared/sf2 src/lib/sf2.test.js src/lib/sf2Template.test.js
npx vitest run
```

Expected: the first run passes (6 test files: the four in `shared/sf2` plus the two SIMS ones). The full run passes with 73 test files and 728 tests.

- [ ] **Step 8: Commit**

```powershell
git add shared/sf2 src/lib/sf2.js src/lib/sf2Template.js src/lib/sf2.test.js src/pages/AttendanceSummaryPage.jsx
git commit -m "refactor(sf2): move the SF2 builder into shared code"
```

`git status` should now list only these changes: the template, helpers and builder moved into `shared/sf2/`, the new `names.js`, tests, wrapper and re-export, and the edited test and page.

### Task 3: The `exportSchoolSf2Fn` callable

**Files:**
- Create: `functions/src/handlers/sf2Export.js`
- Modify: `functions/src/callable.js`, `functions/index.js`, `functions/package.json`, `functions/package-lock.json`
- Test: `functions/src/handlers/sf2Export.test.js`, `functions/test/emulator/sf2Export.test.js`

**Interfaces:**
- Consumes: `buildSf2Workbook`, `schoolDaysInMonth`, `monthLabel`, `firstFridayOfJune`, `isSf2Month` (Tasks 1 and 2); `loadSchoolActor` from `schoolAccess.js`; `canReviewSection` from `shared/schoolAccess.js`; `enforceRateLimit` and `LIMITS` from `callable.js`.
- Produces: `exportSchoolSf2(deps, { sectionId, month })` → `{ filename, contentType, contentBase64 }`; `sf2Filename(sectionName, month)`; the callable `exportSchoolSf2Fn`.

- [ ] **Step 1: Write the failing tests**

`functions/src/handlers/sf2Export.test.js` (the file-name helper):

```js
import { describe, expect, it } from 'vitest';
import { sf2Filename } from './sf2Export.js';

describe('sf2Filename', () => {
  it('names the file like the SIMS export', () => {
    expect(sf2Filename('Rizal', '2026-09')).toBe('SF2_Rizal_2026-09.xlsx');
  });
  it('replaces characters a file name cannot hold', () => {
    expect(sf2Filename('St. John/Paul: "A"?', '2026-09')).toBe('SF2_St. John-Paul- -A--_2026-09.xlsx');
  });
  it('falls back when the section has no name', () => {
    expect(sf2Filename('  ', '2026-09')).toBe('SF2_Section_2026-09.xlsx');
    expect(sf2Filename(undefined, '2026-09')).toBe('SF2_Section_2026-09.xlsx');
  });
});
```

`functions/test/emulator/sf2Export.test.js` (runs against the Firestore emulator; it builds a real workbook and reads cells back):

```js
import { beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { db, clearAll, seedSchool } from './helpers.js';
import { exportSchoolSf2 } from '../../src/handlers/sf2Export.js';

const year = '2026-2027';
const now = () => new Date('2026-10-22T09:00:00+08:00');
const people = {
  teacher: { email: 'teacher@deped.gov.ph', displayName: 'Teacher Tina' }, // Class Adviser of SEC1 (Grade 7 Rizal)
  other: { email: 'other@deped.gov.ph', displayName: 'Omar Other' }, // Class Adviser of SEC2 (Grade 7 Mabini, no learners)
  admin: { email: 'admin@school.test', displayName: 'Ada Admin' },
  coord7: { email: 'coord7@school.test', displayName: 'Cora Seven' },
  ca7: { email: 'ca7@deped.gov.ph', displayName: 'Cleo Curriculum' },
};
const deps = (uid) => ({ db: db(), now, uid, email: people[uid].email, displayName: people[uid].displayName, authTime: 1792195200 });
const ask = (uid = 'teacher', over = {}) => exportSchoolSf2(deps(uid), { sectionId: 'SEC1', month: '2026-09', ...over });
const sheetOf = async (result) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(result.contentBase64, 'base64'));
  return workbook.worksheets[0];
};

beforeEach(async () => {
  await clearAll(); await seedSchool();
  const d = db();
  await d.doc('settings/app').set({ currentSchoolYear: year, schoolId: '300000', schoolName: 'Bukidnon NHS' });
  await d.doc('sections/SEC1').update({ adviserName: 'Teacher Tina' });
  await d.doc('sections/SEC2').set({ name: 'Mabini', gradeLevel: 7, schoolYear: year });
  // Ana (F) enrolled after the first Friday of June; Ben (M) before it.
  await d.doc('enrollments/S1_2026-2027').update({ gradeLevel: 7, dateEnrolled: '2026-07-10' });
  await d.doc('enrollments/S2_2026-2027').set({ studentId: 'S2', sectionId: 'SEC1', schoolYear: year, gradeLevel: 7, status: 'enrolled', dateEnrolled: '2026-06-01' });
  await d.doc('student_attendance/SEC1_2026-09-21').set({ sectionId: 'SEC1', schoolYear: year, date: '2026-09-21', marks: { S1: 'L', S2: 'A' } });
  await d.doc('student_attendance/SEC1_2026-09-23').set({ sectionId: 'SEC1', schoolYear: year, date: '2026-09-23', marks: {}, sessionOverrides: { S2: { am: { absent: true } } } });
  // A stray document under this section's id that names another section must be ignored.
  await d.doc('student_attendance/SEC1_2026-09-22').set({ sectionId: 'SEC2', schoolYear: year, date: '2026-09-22', marks: { S2: 'A' } });
  await d.doc('school_accounts/teacher').set({ assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 }] });
  await d.doc('school_accounts/other').set({ assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC2', gradeLevel: 7 }] });
  await d.doc('school_accounts/ca7').set({ assignments: [{ role: 'curriculum_adviser', schoolYear: year, gradeLevel: 7 }] });
  await d.doc('users/admin@school.test').set({ uid: 'admin', role: 'admin' });
  await d.doc('users/coord7@school.test').set({ uid: 'coord7', role: 'glc', gradeLevel: 7, name: 'Cora Seven' });
});

describe('exportSchoolSf2', () => {
  it('gives the section’s adviser the SIMS workbook for the month', async () => {
    const result = await ask();
    expect(result.filename).toBe('SF2_Rizal_2026-09.xlsx');
    expect(result.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const ws = await sheetOf(result);
    expect(['C6', 'K6', 'X6', 'C8', 'X8', 'AC8', 'AD88'].map((address) => ws.getCell(address).value))
      .toEqual(['300000', '2026-2027', 'September 2026', 'Bukidnon NHS', 7, 'Rizal', 'TEACHER TINA']);
    expect(ws.getCell('B14').value).toBe('DY, BEN');
    expect(ws.getCell('B36').value).toBe('CRUZ, ANA B.');
    expect(ws.getCell('S14').value).toBe('X'); // Monday 21 Sep, absent
    expect(ws.getCell('S36').value).toBe('L'); // Monday 21 Sep, late
    expect(ws.getCell('U14').value).toBe('½A'); // Wednesday 23 Sep, morning absence
    expect(ws.getCell('AC14').value).toBe(1.5);
    expect(ws.getCell('AD36').value).toBe(1);
    expect(ws.getCell('AG64').value).toBe(22);
    expect(ws.getCell('AJ66').value).toBe(1); // only Ben was enrolled by the first Friday of June
  });
  it('ignores a day document that names another section', async () => {
    const ws = await sheetOf(await ask());
    expect(ws.getCell('T14').value ?? '').toBe(''); // Tuesday 22 Sep stays blank (present), not an X
  });
  it('lets an administrator, a coordinator for the grade and a Curriculum Adviser export too', async () => {
    for (const uid of ['admin', 'coord7', 'ca7']) expect((await ask(uid)).filename).toBe('SF2_Rizal_2026-09.xlsx');
  });
  it('refuses an adviser of another section', async () => {
    await expect(ask('other')).rejects.toMatchObject({ code: 'permission-denied', message: 'This section is outside your attendance access.' });
  });
  it('refuses a month outside the school year, in the future, or malformed', async () => {
    for (const month of ['2026-05', '2026-11', '2027-01', '2026-13', 'garbage', undefined]) {
      await expect(ask('teacher', { month })).rejects.toMatchObject({ code: 'invalid-argument', message: 'Choose a month of this school year, up to the current month.' });
    }
    await expect(ask('teacher', { sectionId: 'a/b' })).rejects.toMatchObject({ code: 'invalid-argument', message: 'Choose a valid section.' });
    await expect(ask('teacher', { sectionId: 'NOPE' })).rejects.toMatchObject({ code: 'not-found' });
  });
  it('refuses a class with no learners', async () => {
    await expect(exportSchoolSf2(deps('other'), { sectionId: 'SEC2', month: '2026-09' }))
      .rejects.toMatchObject({ code: 'failed-precondition', message: 'There are no learners in this class yet.' });
  });
  it('stops advisers once the school year has ended', async () => {
    await db().doc(`school_years/${year}`).set({ endedAt: new Date() });
    await expect(ask()).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await ask('admin')).filename).toBe('SF2_Rizal_2026-09.xlsx');
  });
  it('limits exports to 20 an hour for each person', async () => {
    for (let i = 0; i < 20; i++) await ask();
    await expect(ask()).rejects.toMatchObject({ code: 'resource-exhausted', message: 'Too many exports. Try again in a few minutes.' });
    expect((await ask('admin')).filename).toBe('SF2_Rizal_2026-09.xlsx');
  }, 60000);
});
```

- [ ] **Step 2: Run the unit test to see it fail**

```powershell
node scripts/syncShared.mjs
cd functions; npx vitest run src/handlers/sf2Export.test.js; cd ..
```

Expected: FAIL (`Failed to resolve import "./sf2Export.js"`).

- [ ] **Step 3: Add the dependency and the rate limit**

Add `exceljs` to `functions/package.json` (same version as the root app) and refresh the lock file without touching `node_modules`:

```diff
--- a/functions/package.json
+++ b/functions/package.json
@@ -12,6 +12,7 @@
     "serve": "node ../scripts/syncShared.mjs && firebase emulators:start --only functions,firestore,auth,pubsub"
   },
   "dependencies": {
+    "exceljs": "^4.4.0",
     "firebase-admin": "^13.0.0",
     "firebase-functions": "^6.0.0"
   },
```

```powershell
npm --prefix functions install --package-lock-only
```

Expected: it finishes with a funding and audit summary (npm may list audit warnings; they are not part of this task). `functions/package-lock.json` gains `exceljs` and its dependencies, and `functions/node_modules` is not touched.

Add the limit:

```diff
--- a/functions/src/callable.js
+++ b/functions/src/callable.js
@@ -19,6 +19,8 @@ export const LIMITS = {
   relationshipChange: { windowMs: 60 * 60 * 1000, max: 60 },
   // Preview and redeem of advisory slips share one budget per account.
   advisorySlip: { windowMs: 60 * 60 * 1000, max: 10 },
+  // SF2 downloads from the Class tab (spec 2026-10-22). Each builds a workbook, so keep it modest.
+  sf2Export: { windowMs: 60 * 60 * 1000, max: 20 },
 };
 export const MAX_OPEN_REQUESTS = 3;
 
```

- [ ] **Step 4: Write the handler**

`functions/src/handlers/sf2Export.js`:

```js
// The SF2 (Daily Attendance Report of Learners) for one section and month, as the same Excel file SIMS
// exports (spec 2026-10-22). Advisers have no direct read on attendance, so the server gathers the
// roster and attendance, builds the workbook with the shared builder, and returns it as base64.
import { readFileSync } from 'node:fs';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { loadSchoolActor } from './schoolAccess.js';
import { canReviewSection } from '../../shared/schoolAccess.js';
import { manilaDate } from '../../shared/dates.js';
import { buildSf2Workbook } from '../../shared/sf2/buildSf2Workbook.js';
import { firstFridayOfJune, monthLabel, schoolDaysInMonth } from '../../shared/sf2/calendar.js';
import { isSf2Month } from '../../shared/sf2/months.js';

const fail = (code, message) => { throw new CallableError(code, message); };
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const MONTH_MESSAGE = 'Choose a month of this school year, up to the current month.';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let template;
// scripts/syncShared.mjs copies shared/ (template included) next to this code on every deploy and test run.
const templateBuffer = () => (template ??= readFileSync(new URL('../../shared/sf2/sf2-template.xlsx', import.meta.url)));

// SF2_<Section>_<YYYY-MM>.xlsx, as SIMS names it, minus characters a file name cannot hold.
export const sf2Filename = (sectionName, month) =>
  `SF2_${String(sectionName ?? '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'Section'}_${month}.xlsx`;

export async function exportSchoolSf2(deps, input) {
  if (!identifier(input?.sectionId)) fail('invalid-argument', 'Choose a valid section.');
  if (typeof input.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) fail('invalid-argument', MONTH_MESSAGE);
  const now = (deps.now || (() => new Date()))();
  const actor = await loadSchoolActor(deps);
  const sectionSnap = await deps.db.doc(`sections/${input.sectionId}`).get();
  if (!sectionSnap.exists) fail('not-found', 'Section not found.');
  const section = { ...sectionSnap.data(), id: sectionSnap.id };
  if (!canReviewSection(actor, section)) fail('permission-denied', 'This section is outside your attendance access.');
  if (!isSf2Month(section.schoolYear, input.month, manilaDate(now))) fail('invalid-argument', MONTH_MESSAGE);
  await enforceRateLimit(deps.db, deps.uid, 'sf2Export', LIMITS.sf2Export, now.getTime(), () => 'Too many exports. Try again in a few minutes.');

  const [enrollmentSnap, settingsSnap] = await Promise.all([
    deps.db.collection('enrollments').where('sectionId', '==', section.id).where('schoolYear', '==', section.schoolYear).get(),
    deps.db.doc('settings/app').get(),
  ]);
  const enrollments = enrollmentSnap.docs.map((d) => d.data());
  const enrolledIds = enrollments.filter((e) => e.status === 'enrolled').map((e) => e.studentId);
  if (!enrolledIds.length) fail('failed-precondition', 'There are no learners in this class yet.');
  const [year, month] = input.month.split('-').map(Number);
  const schoolDays = schoolDaysInMonth(year, month);
  const [students, attendance] = await Promise.all([
    deps.db.getAll(...enrolledIds.map((id) => deps.db.doc(`students/${id}`))),
    deps.db.getAll(...schoolDays.map((date) => deps.db.doc(`student_attendance/${section.id}_${date}`))),
  ]);
  const roster = students.filter((s) => s.exists).map((s) => ({ id: s.id, ...s.data() }));
  if (!roster.length) fail('failed-precondition', 'There are no learners in this class yet.');
  // SIMS counts every enrollment of the section dated on or before the first Friday of June.
  const cutoff = firstFridayOfJune(section.schoolYear);
  const enrolledAsOfCutoff = enrollments.filter((e) => e.dateEnrolled <= cutoff).length;
  // A day document counts only when it belongs to this section, the same filter SIMS applies. The roster
  // call's stricter validAttendance check is not used: documents written by live scans lack some fields.
  const docsByDate = {};
  attendance.forEach((snap, i) => { if (snap.exists && snap.data().sectionId === section.id) docsByDate[schoolDays[i]] = snap.data(); });
  const settings = settingsSnap.data() || {};
  const workbook = await buildSf2Workbook({
    templateBuffer: templateBuffer(), section, roster, schoolDays, docsByDate, monthLabelText: monthLabel(input.month),
    schoolId: settings.schoolId || '', schoolName: settings.schoolName || '', enrolledAsOfCutoff,
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return { filename: sf2Filename(section.name, input.month), contentType: XLSX, contentBase64: Buffer.from(buffer).toString('base64') };
}
```

- [ ] **Step 5: Register the callable**

`schoolCall` gains an optional options argument (as `staffCall` already has) so this function can ask for more memory:

```diff
--- a/functions/index.js
+++ b/functions/index.js
@@ -24,6 +24,7 @@ import { getSchoolContext, requestSchoolRole, setAdvisoryRequestsEnabled, withdr
 import { retireSubjectTeachers } from './src/handlers/retireSubjectTeachers.js';
 import { getSchoolRoster, setSessionAbsence, getFamilyAttendance, getSchoolLearnerAttendance, getSchoolLearnerHistory, handleAttendanceCorrection, sendDueAttendanceUpdates } from './src/handlers/sessionAttendance.js';
 import { getPortalAnnouncements, getPortalAnnouncement, savePortalAnnouncement } from './src/handlers/portalAnnouncements.js';
+import { exportSchoolSf2 } from './src/handlers/sf2Export.js';
 
 setGlobalOptions({ region: 'asia-southeast1', minInstances: 0, maxInstances: 10, memory: '256MiB' });
 
@@ -48,7 +49,7 @@ const guardianCall = (fn) => onCall({ enforceAppCheck: true }, async (req) => {
 const staffCall = (fn, options = {}) => onCall({ enforceAppCheck: true, ...options }, async (req) => {
   try { return await fn({ ...callDeps(), ...(await staffIdentity(db, auth, req)), authTime: req.auth.token.auth_time }, req.data || {}); } catch (e) { throw toHttpsError(e); }
 });
-const schoolCall = fn => onCall({ enforceAppCheck: true }, async req => {
+const schoolCall = (fn, options = {}) => onCall({ enforceAppCheck: true, ...options }, async req => {
   try { return await fn({ ...callDeps(), ...(await schoolIdentity(db, auth, req)) }, req.data || {}); }
   catch (e) { throw toHttpsError(e); }
 });
@@ -124,6 +125,8 @@ export const getSchoolLearnerHistoryFn = schoolCall(getSchoolLearnerHistory);
 export const getPortalAnnouncementsFn = schoolCall(getPortalAnnouncements);
 export const getPortalAnnouncementFn = schoolCall(getPortalAnnouncement);
 export const savePortalAnnouncementFn = staffCall(savePortalAnnouncement);
+// The SF2 workbook for a section and month, built on the server so phones never load ExcelJS (spec 2026-10-22).
+export const exportSchoolSf2Fn = schoolCall(exportSchoolSf2, { memory: '512MiB', timeoutSeconds: 60 });
 export const onAttendanceCorrectionCreated = onDocumentCreated(
   { document: 'attendance_corrections/{id}', retry: true }, event =>
     handleAttendanceCorrection(deps(), { id: event.params.id, data: event.data?.data() }));
```

- [ ] **Step 6: Run the tests to see them pass**

```powershell
node scripts/syncShared.mjs
cd functions; npx vitest run src/handlers/sf2Export.test.js; cd ..
npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run --no-file-parallelism test/emulator/sf2Export.test.js test/emulator/schoolAccess.test.js"
npm --prefix functions test
```

Expected: the unit test passes (3 tests). The emulator run passes with 2 test files and 39 tests: the 8 new SF2 tests plus the existing School access suite, which proves nothing there broke. The functions unit suite passes with 23 test files and 171 tests.

- [ ] **Step 7: Commit**

```powershell
git add functions/src/handlers/sf2Export.js functions/src/handlers/sf2Export.test.js functions/test/emulator/sf2Export.test.js functions/src/callable.js functions/index.js functions/package.json functions/package-lock.json
git commit -m "feat(functions): exportSchoolSf2Fn builds the SF2 workbook for an adviser"
```

### Task 4: Parent helpers and copy

**Files:**
- Create: `parent/src/lib/sf2.js`
- Modify: `parent/src/strings.js`, `parent/src/lib/strings.test.js`
- Test: `parent/src/lib/sf2.test.js`

**Interfaces:**
- Consumes: `sf2Months` and `monthLabel` from `shared/sf2` (Task 1).
- Produces: `XLSX_TYPE`; `sf2MonthOptions(schoolYear, today)` → `[{ value: '2026-10', label: 'October 2026' }]`; `base64ToFile(base64, filename, type?)` → `File`; `saveFile(file, nav?, doc?)` → `'shared' | 'downloaded' | 'cancelled'`; the `S.sf2*` and `S.classActions` strings.

- [ ] **Step 1: Write the failing tests**

`parent/src/lib/sf2.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { XLSX_TYPE, base64ToFile, saveFile, sf2MonthOptions } from './sf2.js';

describe('sf2MonthOptions', () => {
  it('labels the school year’s months up to today, newest first', () => {
    expect(sf2MonthOptions('2026-2027', '2026-10-22')).toEqual([
      { value: '2026-10', label: 'October 2026' }, { value: '2026-09', label: 'September 2026' }, { value: '2026-08', label: 'August 2026' },
      { value: '2026-07', label: 'July 2026' }, { value: '2026-06', label: 'June 2026' },
    ]);
  });
  it('is empty before the school year starts', () => {
    expect(sf2MonthOptions('2026-2027', '2026-05-30')).toEqual([]);
  });
});

describe('base64ToFile', () => {
  it('turns the server’s base64 back into a named spreadsheet file', async () => {
    const file = base64ToFile(Buffer.from('PK-fake-xlsx').toString('base64'), 'SF2_Rizal_2026-09.xlsx');
    expect(file.name).toBe('SF2_Rizal_2026-09.xlsx');
    expect(file.type).toBe(XLSX_TYPE);
    expect(Buffer.from(await file.arrayBuffer()).toString()).toBe('PK-fake-xlsx');
  });
});

describe('saveFile', () => {
  const file = new File(['x'], 'SF2.xlsx', { type: XLSX_TYPE });
  it('uses the share sheet where the browser can share files', async () => {
    const nav = { canShare: vi.fn(() => true), share: vi.fn(async () => {}) };
    expect(await saveFile(file, nav, undefined)).toBe('shared');
    expect(nav.share).toHaveBeenCalledWith({ files: [file], title: 'SF2.xlsx' });
  });
  it('stays quiet when the person closes the share sheet', async () => {
    const nav = { canShare: () => true, share: async () => { throw Object.assign(new Error('closed'), { name: 'AbortError' }); } };
    expect(await saveFile(file, nav, undefined)).toBe('cancelled');
  });
  it('downloads through a link when sharing is unavailable or fails', async () => {
    const click = vi.fn();
    const link = { click };
    const doc = { createElement: vi.fn(() => link) };
    expect(await saveFile(file, {}, doc)).toBe('downloaded');
    expect(doc.createElement).toHaveBeenCalledWith('a');
    expect(link.download).toBe('SF2.xlsx');
    expect(link.href).toMatch(/^blob:/);
    expect(click).toHaveBeenCalledTimes(1);
    const broken = { canShare: () => true, share: async () => { throw new Error('share failed'); } };
    expect(await saveFile(file, broken, doc)).toBe('downloaded');
  });
});
```

A copy-check in `strings.test.js`:

```diff
--- a/parent/src/lib/strings.test.js
+++ b/parent/src/lib/strings.test.js
@@ -57,6 +57,10 @@ describe('strings', () => {
       'addRoleRow', 'addRoleRowHint', 'addRoleRowHintParent', 'schoolRequestsRow', 'requestFulfilled', 'requestSuperseded'])
       expect(typeof S[k], k).toBe('string');
   });
+  it('has the SF2 download strings', () => {
+    for (const k of ['classActions', 'sf2Button', 'sf2Title', 'sf2Hint', 'sf2Month', 'sf2Download', 'sf2Preparing', 'sf2Close', 'sf2NoLearners', 'sf2NoMonths'])
+      expect(typeof S[k], k).toBe('string');
+  });
   it('calls the family role Parent/Guardian and drops Subject Teacher copy', () => {
     expect(S.joinFamily).toBe('Parent/Guardian');
     expect(S.modeFamily).toBe('Parent/Guardian');
```

- [ ] **Step 2: Run the tests to see them fail**

```powershell
npm --prefix parent test -- src/lib/sf2.test.js src/lib/strings.test.js
```

Expected: FAIL (`./sf2.js` does not exist; the SF2 strings are undefined).

- [ ] **Step 3: Write the implementation**

`parent/src/lib/sf2.js`:

```js
import { sf2Months } from '../../../shared/sf2/months.js';
import { monthLabel } from '../../../shared/sf2/calendar.js';

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// The months an adviser can download, newest first, as { value: '2026-10', label: 'October 2026' }.
// `today` is the school-time date (YYYY-MM-DD); the server applies the same rule.
export const sf2MonthOptions = (schoolYear, today) =>
  sf2Months(schoolYear, today).map((value) => ({ value, label: monthLabel(value) }));

// The server returns the workbook as base64; a File lets a phone's share sheet save or open it.
export function base64ToFile(base64, filename, type = XLSX_TYPE) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type });
}

// Phones get the share sheet (Save to Files, Drive, open in Excel); other browsers get a normal
// download. Resolves 'shared', 'downloaded' or 'cancelled' (the person closed the share sheet).
export async function saveFile(file, nav = typeof navigator === 'undefined' ? undefined : navigator, doc = typeof document === 'undefined' ? undefined : document) {
  if (nav?.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
      // Any other share failure falls through to a download.
    }
  }
  const url = URL.createObjectURL(file);
  const link = doc.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
```

The copy (every string avoids `location`, `tracking` and `live`, which `strings.test.js` forbids):

```diff
--- a/parent/src/strings.js
+++ b/parent/src/strings.js
@@ -318,6 +318,16 @@ const S = {
   schoolRequestsNeedsAdmin: 'This section already has an adviser, so an administrator reviews this request in SIMS.',
   schoolRequestsApproved: 'Approved. The teacher gets an inbox note.',
   schoolRequestsRejected: 'Rejected. The teacher sees your reason.',
+  classActions: 'Class actions',
+  sf2Button: 'Download SF2',
+  sf2Title: 'Download SF2',
+  sf2Hint: 'Daily attendance of learners for one month, as an Excel file.',
+  sf2Month: 'Month',
+  sf2Download: 'Download',
+  sf2Preparing: 'Preparing SF2…',
+  sf2Close: 'Close',
+  sf2NoLearners: 'No learners in this class yet.',
+  sf2NoMonths: 'There are no school months to download yet.',
   notFound: 'That page does not exist.',
   sessionButton: 'Sessions',
   sessionTitle: 'Session attendance',
```

- [ ] **Step 4: Run the tests to see them pass**

```powershell
npm --prefix parent test -- src/lib/sf2.test.js src/lib/strings.test.js
```

Expected: PASS, 2 test files.

- [ ] **Step 5: Commit**

```powershell
git add parent/src/lib/sf2.js parent/src/lib/sf2.test.js parent/src/strings.js parent/src/lib/strings.test.js
git commit -m "feat(parent): SF2 month, file and share helpers"
```

### Task 5: The sheet and the Class actions row

**Files:**
- Create: `parent/src/components/Sheet.jsx`, `parent/src/screens/school/Sf2Sheet.jsx`, `parent/src/screens/school/ClassActions.jsx`
- Modify: `parent/src/screens/school/ClassTab.css`
- Test: `parent/src/screens/school/Sf2Sheet.test.js`, `parent/src/screens/school/ClassActions.test.js`

**Interfaces:**
- Consumes: `S.sf2*` strings (Task 4); `Btn`, `Banner`, `Sel` from `components/ui.jsx`; `Icon` (`download`).
- Produces: `Sheet({ title, hint, busy, onClose, children })` (a portalled bottom sheet; Escape and a tap outside close it unless `busy`); `Sf2Form({ months, busy, error, onDownload(month), onClose })` and the default `Sf2Sheet({ sectionLabel, months, busy, error, onDownload, onClose })`; `ClassActions({ onSf2, sf2Hint })`, which renders nothing without `onSf2`.

- [ ] **Step 1: Write the failing tests**

The sheets are portalled, so the tests render their inner forms.

`parent/src/screens/school/Sf2Sheet.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../../strings.js';
import { Sf2Form } from './Sf2Sheet.jsx';

const months = [{ value: '2026-10', label: 'October 2026' }, { value: '2026-09', label: 'September 2026' }];
const render = (props) => renderToStaticMarkup(createElement(Sf2Form, { months, busy: false, error: '', onDownload() {}, onClose() {}, ...props }));

describe('Sf2Form', () => {
  it('offers the months newest first and a Download button', () => {
    const html = render();
    expect(html.indexOf('October 2026')).toBeGreaterThan(-1);
    expect(html.indexOf('October 2026')).toBeLessThan(html.indexOf('September 2026'));
    expect(html).toContain(S.sf2Download);
    expect(html).not.toContain('disabled=""');
  });
  it('shows progress and locks the controls while preparing', () => {
    const html = render({ busy: true });
    expect(html).toContain(S.sf2Preparing);
    expect(html).not.toContain(`>${S.sf2Download}<`);
    expect(html.match(/disabled=""/g).length).toBeGreaterThanOrEqual(3);
  });
  it('shows an error banner', () => {
    expect(render({ error: 'Too many exports. Try again in a few minutes.' })).toContain('Too many exports. Try again in a few minutes.');
  });
  it('says so when there is no month to download yet', () => {
    const html = render({ months: [] });
    expect(html).toContain(S.sf2NoMonths);
    expect(html).not.toContain('<select');
  });
});
```

`parent/src/screens/school/ClassActions.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../../strings.js';
import ClassActions from './ClassActions.jsx';

const render = (props) => renderToStaticMarkup(createElement(ClassActions, props));

describe('ClassActions', () => {
  it('shows nothing when no action is available', () => {
    expect(render({})).toBe('');
  });
  it('offers Download SF2', () => {
    const html = render({ onSf2() {} });
    expect(html).toContain(S.sf2Button);
    expect(html).toContain(`aria-label="${S.classActions}"`);
    expect(html).not.toContain('disabled=""');
  });
  it('disables the button and says why', () => {
    const html = render({ onSf2() {}, sf2Hint: S.sf2NoLearners });
    expect(html).toContain('disabled=""');
    expect(html).toContain(S.sf2NoLearners);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

```powershell
npm --prefix parent test -- src/screens/school/Sf2Sheet.test.js src/screens/school/ClassActions.test.js
```

Expected: FAIL (`Sf2Sheet.jsx` and `ClassActions.jsx` do not exist).

- [ ] **Step 3: Write the components**

`parent/src/components/Sheet.jsx` (the same behavior as `FlagSheet`, reusable):

```jsx
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// A bottom sheet over the page. Portalled to <body> so no ancestor's transform or filter can trap the
// fixed overlay (see FlagSheet and ScanSheet). Escape and a tap outside close it unless `busy`; focus
// goes to the first control and returns to whatever opened the sheet.
export default function Sheet({ title, hint, busy = false, onClose, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    dialog.current?.querySelector('input, select, textarea, button')?.focus();
    return () => { if (opener instanceof HTMLElement) opener.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);
  return createPortal(
    <div className="flag-sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={dialog} className="flag-sheet class-sheet" role="dialog" aria-modal="true" aria-labelledby="class-sheet-title">
        <span className="flag-sheet-grip" aria-hidden="true" />
        <h2 id="class-sheet-title">{title}</h2>
        {hint && <p className="flag-sheet-hint">{hint}</p>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
```

`parent/src/screens/school/Sf2Sheet.jsx`:

```jsx
import { useState } from 'react';
import S from '../../strings.js';
import { Banner, Btn, Sel } from '../../components/ui.jsx';
import Sheet from '../../components/Sheet.jsx';

// The sheet's content, kept apart from the portal so it can be rendered on its own in tests.
export function Sf2Form({ months, busy, error, onDownload, onClose }) {
  const [month, setMonth] = useState(months[0]?.value || '');
  return (
    <>
      {error && <Banner tone="danger">{error}</Banner>}
      {months.length === 0 ? <p className="class-note">{S.sf2NoMonths}</p> : (
        <label className="p-field">
          <span className="p-field-label">{S.sf2Month}</span>
          <Sel value={month} disabled={busy} onChange={(e) => setMonth(e.target.value)}>
            {months.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Sel>
        </label>
      )}
      <Btn disabled={busy || !month} onClick={() => onDownload(month)} style={{ width: '100%' }}>{busy ? S.sf2Preparing : S.sf2Download}</Btn>
      <Btn variant="ghost" disabled={busy} onClick={onClose} style={{ width: '100%', marginTop: 10 }}>{S.sf2Close}</Btn>
    </>
  );
}

// Pick a month, then download this class's SF2 (the same Excel file SIMS exports).
export default function Sf2Sheet({ sectionLabel, months, busy, error, onDownload, onClose }) {
  return (
    <Sheet title={S.sf2Title} hint={`${sectionLabel} · ${S.sf2Hint}`} busy={busy} onClose={onClose}>
      <Sf2Form months={months} busy={busy} error={error} onDownload={onDownload} onClose={onClose} />
    </Sheet>
  );
}
```

`parent/src/screens/school/ClassActions.jsx`:

```jsx
import S from '../../strings.js';
import { Btn } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';

// The Class tab's secondary actions, under the summary card. A button appears only when its handler is
// given; `sf2Hint` disables the SF2 button and says why.
export default function ClassActions({ onSf2, sf2Hint = '' }) {
  if (!onSf2) return null;
  return (
    <div className="class-actions" role="group" aria-label={S.classActions}>
      <Btn variant="ghost" disabled={Boolean(sf2Hint)} onClick={onSf2}><Icon name="download" size={18} />{S.sf2Button}</Btn>
      {sf2Hint && <span className="class-note">{sf2Hint}</span>}
    </div>
  );
}
```

Styles for the row and the sheet (flat, uses existing tokens):

```diff
--- a/parent/src/screens/school/ClassTab.css
+++ b/parent/src/screens/school/ClassTab.css
@@ -12,6 +12,9 @@
 .class-link { min-height: 44px; padding: 0; border: 0; background: none; color: var(--t-primary); font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
 .class-link[aria-pressed="true"] { color: var(--t-ink); }
 .class-note { margin: 0 0 12px; color: var(--t-muted); font-size: 13px; line-height: 1.5; }
+.class-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: -6px 0 16px; }
+.class-actions .class-note { margin: 0; }
+.class-sheet { max-height: 92dvh; overflow-y: auto; overscroll-behavior: contain; }
 .class-group { margin: 0 0 20px; }
 .class-group-title, .class-group > summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 36px; margin: 0 0 4px; color: var(--t-muted); font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
 .class-group > summary { min-height: 44px; cursor: pointer; list-style: none; }
```

- [ ] **Step 4: Run the tests to see them pass**

```powershell
npm --prefix parent test -- src/screens/school/Sf2Sheet.test.js src/screens/school/ClassActions.test.js
```

Expected: PASS, 2 test files.

- [ ] **Step 5: Commit**

```powershell
git add parent/src/components/Sheet.jsx parent/src/screens/school/Sf2Sheet.jsx parent/src/screens/school/Sf2Sheet.test.js parent/src/screens/school/ClassActions.jsx parent/src/screens/school/ClassActions.test.js parent/src/screens/school/ClassTab.css
git commit -m "feat(parent): SF2 month sheet and Class actions row"
```

### Task 6: Wire the download into the Class tab

**Files:**
- Modify: `parent/src/screens/school/ClassTab.jsx`
- Test: `parent/src/screens/school/ClassTab.test.js`

**Interfaces:**
- Consumes: everything from Tasks 4 and 5; the callable `exportSchoolSf2Fn` (Task 3).
- Produces: a **Download SF2** button under the Class summary card that opens the month sheet, calls the server, and saves the file. It is hidden once the school year has ended, and disabled with "No learners in this class yet." for an empty roster.

- [ ] **Step 1: Write the failing smoke test**

`ClassTab` imports Firebase, so the test stubs it and checks the screen still loads:

```js
import { describe, expect, it, vi } from 'vitest';

// Smoke test: ClassTab pulls in Firebase, so stub it and check the module still loads and exports a screen.
vi.mock('../../firebase.js', () => ({
  app: {},
  db: {},
  auth: { currentUser: null },
  callable: () => async () => ({ data: {} }),
}));

describe('ClassTab', () => {
  it('loads and exports a component', async () => {
    const mod = await import('./ClassTab.jsx');
    expect(typeof mod.default).toBe('function');
  });
});
```

- [ ] **Step 2: Run it** (it already passes before the change; it guards the edit below)

```powershell
npm --prefix parent test -- src/screens/school/ClassTab.test.js
```

Expected: PASS, 1 test.

- [ ] **Step 3: Wire the screen**

```diff
--- a/parent/src/screens/school/ClassTab.jsx
+++ b/parent/src/screens/school/ClassTab.jsx
@@ -11,9 +11,13 @@ import { initials } from '../../lib/format.js';
 import { Banner, Btn, Inp, Sel, Spinner, EmptyState } from '../../components/ui.jsx';
 import Icon from '../../components/Icon.jsx';
 import UndoToast from './UndoToast.jsx';
+import ClassActions from './ClassActions.jsx';
+import { sf2MonthOptions, base64ToFile, saveFile } from '../../lib/sf2.js';
+import S from '../../strings.js';
 import './ClassTab.css';
 
 const FlagSheet = lazy(() => import('./FlagSheet.jsx'));
+const Sf2Sheet = lazy(() => import('./Sf2Sheet.jsx'));
 const STATUS = { P: 'Present', L: 'Late', E: 'Excused', A: 'Absent' };
 const DAY = 86400000;
 const rosterKey = (sectionId, date) => `roster:${auth.currentUser?.uid || ''}:${sectionId}:${date}`;
@@ -38,6 +42,7 @@ export default function ClassTab({ sections, ended, navigate }) {
   const sheetOpen = useRef(false);
   sheetOpen.current = Boolean(sheet);
   const validSection = sections.some((s) => s.id === sectionId) ? sectionId : sections[0]?.id || '';
+  const section = sections.find((s) => s.id === validSection);
 
   useEffect(() => {
     if (!validSection) return undefined;
@@ -69,6 +74,22 @@ export default function ClassTab({ sections, ended, navigate }) {
   const canCorrect = Boolean(roster?.canCorrect) && !ended && isToday;
   const refresh = () => setReload((n) => n + 1);
 
+  // SF2: pick a month in a sheet, the server builds the workbook, and the phone saves it.
+  const [sf2Open, setSf2Open] = useState(false);
+  const [sf2Busy, setSf2Busy] = useState(false);
+  const [sf2Error, setSf2Error] = useState('');
+  const sf2Lock = useRef(false);
+  const downloadSf2 = async (month) => {
+    if (sf2Lock.current) return;
+    sf2Lock.current = true; setSf2Busy(true); setSf2Error('');
+    try {
+      const { data } = await callable('exportSchoolSf2Fn')({ sectionId: validSection, month });
+      const outcome = await saveFile(base64ToFile(data.contentBase64, data.filename, data.contentType));
+      if (outcome !== 'cancelled') setSf2Open(false);
+    } catch (e) { setSf2Error(schoolError(e)); }
+    finally { sf2Lock.current = false; setSf2Busy(false); }
+  };
+
   useEffect(() => { import('./FlagSheet.jsx').catch(() => {}); }, []);
   useEffect(() => {
     if (!canCorrect || !groups.inSchool.length) { setSelecting(false); setSelected(new Set()); }
@@ -143,6 +164,7 @@ export default function ClassTab({ sections, ended, navigate }) {
           {!isToday && <Inp type="date" aria-label="School day" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 'auto', minHeight: 44 }} />}
         </div>
       </section>
+      <ClassActions onSf2={ended ? undefined : () => { setSf2Error(''); setSf2Open(true); }} sf2Hint={roster && !roster.rows?.length ? S.sf2NoLearners : ''} />
       {error && <Banner tone="danger" action={<Btn variant="ghost" onClick={refresh}>Try again</Btn>}>{error}</Banner>}
       {loading && !roster && <Spinner label="Loading your class" />}
       {roster && !isToday && <p className="class-note">Past days are view-only. Your coordinator corrects earlier days in SIMS.</p>}
@@ -166,6 +188,12 @@ export default function ClassTab({ sections, ended, navigate }) {
           <FlagSheet rows={sheet.rows} session={session} mode={sheet.mode} busy={saving} error={sheetError} onConfirm={confirm} onClose={() => { if (!saving) setSheet(null); }} />
         </Suspense>
       )}
+      {sf2Open && (
+        <Suspense fallback={null}>
+          <Sf2Sheet sectionLabel={sectionLabel(section)} months={sf2MonthOptions(section?.schoolYear, today)} busy={sf2Busy} error={sf2Error}
+            onDownload={downloadSf2} onClose={() => setSf2Open(false)} />
+        </Suspense>
+      )}
       {toast && <UndoToast key={toast.id} message={toast.message} onUndo={toast.undo} onDone={() => setToast(null)} />}
     </div>
   );
```

- [ ] **Step 4: Run the whole Parent suite, then build and check the size**

```powershell
npm --prefix parent test
```

Expected: PASS, 28 test files and 206 tests.

Load the build environment as shown in "Before you start", then:

```powershell
npm --prefix parent run build
npm --prefix parent run size
```

Expected: the build finishes, and the size check ends with `initial-load total: 219.3 KB gz (limit 260 KB)`. The new sheet appears as its own small chunk (`Sf2Sheet-*.js`), so the first load does not grow.

- [ ] **Step 5: Commit**

```powershell
git add parent/src/screens/school/ClassTab.jsx parent/src/screens/school/ClassTab.test.js
git commit -m "feat(parent): download the SF2 from the Class tab"
```

### Task 7: Adviser guide, release notes and final verification

**Files:**
- Modify: `docs/parent-portal-adviser-guide.md`
- Create: `docs/releases/2026-10-22-sf2-export/README.md`

- [ ] **Step 1: Document the feature for advisers**

Append this section to the end of `docs/parent-portal-adviser-guide.md`:

```markdown

## Downloading the SF2

1. Open **Class** in the parent app and tap **Download SF2**.
2. Choose the month. The list shows this school year's months up to the current one.
3. Tap **Download**. On a phone the share sheet opens: choose **Save to Files**, **Drive**, or open the file in Excel. On a computer the file downloads.
4. The file is the same SF2 that SIMS exports: your learners (boys first, then girls), the daily marks, the totals and your name. Check it before you print or submit it.

If the button is greyed out, your class has no learners yet. If you see "Too many exports", wait a few minutes and try again.
```

- [ ] **Step 2: Write the release notes**

Create `docs/releases/2026-10-22-sf2-export/README.md`:

```markdown
# SF2 download from the Parent App (2026-10-22)

Spec: `docs/superpowers/specs/2026-10-22-parent-sf2-export-design.md`
Plan: `docs/superpowers/plans/2026-10-22-parent-sf2-export.md`

## What ships

- **Functions:** `exportSchoolSf2Fn` (512 MiB, 60 s) and the `exceljs` dependency. Deploy by name; `scripts/syncShared.mjs` runs as the functions predeploy step and copies `shared/sf2/` (template included) into `functions/shared/`.
- **Parent App:** the Download SF2 button and month sheet on the Class tab.
- **SIMS:** nothing is required. `src/lib/sf2.js` and `src/lib/sf2Template.js` now wrap `shared/sf2/`; they ride along with SIMS's next release, and live SIMS keeps its current files until then. The Parent feature does not depend on them.

## Order

1. Functions (the callable must exist before the Parent App calls it).
2. Parent App, with `npm run deploy:parent` from a fresh `origin/master` (see `AGENTS.md`).

## Checks

- Confirm the deployed function's source contains `shared/sf2/sf2-template.xlsx`.
- As a real class adviser, download a month and compare it with the SIMS export for the same section: same learners, marks and totals.
- Record the deployment under `docs/audits/deployments/` (source revision, byte check of the live Parent assets).
```

- [ ] **Step 3: Run the complete verification**

```powershell
npx vitest run
npm --prefix parent test
npm --prefix functions test
npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run --no-file-parallelism test/emulator/sf2Export.test.js test/emulator/schoolAccess.test.js"
```

Expected: root 73 files and 728 tests; Parent 28 files and 206 tests; functions 23 files and 171 tests; emulator 2 files and 39 tests. Then build SIMS as shown in "Before you start" and confirm it finishes (`✓ built`).

- [ ] **Step 4: Optional browser check**

With the emulators running (a `demo-` project id, an App Check placeholder, and `functions/.env.local` containing `PORTAL_URL`), sign in as a class adviser, open **Class**, tap **Download SF2**, pick a month and confirm a workbook downloads and opens. This was not part of the automated checks.

- [ ] **Step 5: Commit**

```powershell
git add docs/parent-portal-adviser-guide.md docs/releases/2026-10-22-sf2-export/README.md
git commit -m "docs: SF2 download guide and release notes"
```

## Self-review notes

- **Spec coverage:** Excel identical to SIMS (Tasks 2, 3); server-side build (Task 3); authorization and months (Tasks 1, 3); rate limit and resources (Task 3); sheet, share/download, hidden at year end, disabled for an empty class (Tasks 4 to 6); budget (Task 6); guide and rollout (Task 7). PDF, holiday calendar, other roles' entry points and earlier school years are out of scope, as in the spec.
- **Names used across tasks:** `buildSf2Workbook` (shared) versus `buildSF2Workbook` (the SIMS wrapper, unchanged name); `sf2Months`/`isSf2Month`/`sf2MonthOptions`; `exportSchoolSf2`/`exportSchoolSf2Fn`; `Sf2Form`/`Sf2Sheet`; `ClassActions({ onSf2, sf2Hint })`.
