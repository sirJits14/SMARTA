# Search, Grade Categorization & Manual Section Assignment — Design

Date: 2026-09-29
Status: Approved (brainstorming session)

## Goal

Make learners and sections fast to find for administrators, organized by grade
level, across the Sections, Attendance and Guardians tabs, and let admins
assign or move a learner's grade & section directly from the learner form.

## Scope

| Tab | Change |
|---|---|
| Sections | Per-grade learner name search (results replace the section table while typing) |
| Students | Grade + Section dropdowns in `StudentForm` (Add and Edit) |
| Attendance (Take + Summary) | Section dropdown replaced by grade pills + section-name search picker |
| Guardians → Activation slips | Same section picker as Attendance |
| Guardians → Learner access | Grade pills + improved learner name search |
| Guardians → Access requests, Reports, Scan log | Learner-name search + grade pill filter over loaded rows |

Out of scope: server-side search, Firestore index changes, security-rule
changes, unassigning/dropping learners from the learner form (stays on the
Enroll page), moving previously recorded attendance when a learner changes
section, Cloud Functions changes.

## Matching rules (apply everywhere)

- Live filtering as the user types. No Search button, no minimum length.
- Case-insensitive and accent-insensitive (`ñ` = `n`, `é` = `e`).
- Query is split on whitespace into tokens. **Every** token must be a
  **prefix of some word** in the searched fields.
  - `jo` matches "Jose", "Joanna". `iza` does NOT match "Rizal".
  - Section "Jose Rizal": `jose`, `rizal`, `riz`, `jose riz` all match.
  - Learner Juan Dela Cruz: `juan`, `dela`, `cruz`, `cruz juan` all match.
- Empty/whitespace query matches everything.
- Learner fields searched: `firstName`, `lastName` (plus `lrn` where noted).
- Section fields searched: `name` only.

## Shared building blocks

### 1. `src/lib/search.js` (new)

```js
export function normalize(text)            // String(text ?? '') → NFD, strip \p{Diacritic}, lowercase, trim
export function words(text)                // normalize(text).split(/[\s,.\-]+/).filter(Boolean)
export function matchesWords(query, ...fields)
// true if every token of words(query) is a prefix of some word in words(field) across fields.
// true for empty query. Non-string/undefined fields are ignored.
export function learnerMatches(query, student, { includeLrn = false } = {})
// matchesWords(query, student.firstName, student.lastName, ...(includeLrn ? [student.lrn] : []))
export function sectionMatches(query, section)   // matchesWords(query, section.name)
```

LRN matching: when `includeLrn` is true, the learner matches if the name
rule matches **OR** the normalized query (with spaces removed) is a prefix of
`normalize(student.lrn)`, so typing `1234` finds LRNs starting with 1234.

The existing Students-tab search box (`StudentsPage.jsx`, substring on
name/LRN) is **not** changed.

### 2. `src/lib/enrollmentChange.js` (new)

```js
export function currentEnrollmentByStudent(enrollments, schoolYear)
// Map<studentId, enrollment> for records with schoolYear === schoolYear && status === 'enrolled'.
// (Move the identical inline logic out of StudentsPage.jsx and use this there.)

export function planEnrollmentChange({ current, section, schoolYear, type })
// current: the learner's current-SY enrolled record or null/undefined
// section: chosen section object or null
// Returns one of:
//   { kind: 'none' }                                  – section null, or current?.sectionId === section.id
//   { kind: 'transfer', data: { gradeLevel, sectionId, track, strand } }
//       – current exists and section differs. data only; merged into the existing doc.
//         dateEnrolled, type, status are NOT included (preserved).
//   { kind: 'enroll', data: { studentId?, schoolYear, gradeLevel, sectionId, track, strand,
//                             type, dateEnrolled, status: 'enrolled' } }
//       – no current enrolled record. type defaults to 'new'. dateEnrolled = localDate().
//         (studentId is filled in by the caller.)
// track/strand come from the section: section.track || null, section.strand || null.
```

Note: a learner whose current-SY enrollment has `status: 'dropped'` (or
`transferred`) is "not currently enrolled" → `enroll` (full overwrite of the
`{studentId}_{schoolYear}` doc), same as the Enroll page does today.

### 3. `src/data/students.js` — atomic save with enrollment

Add `saveStudentWithEnrollment({ id, form, isNew, enrollmentPlan, schoolYear })`:

- Uses `writeBatch(db)`.
- New learner: pre-generate the ref with `doc(collection(db, 'students'))`,
  write the same shape `createStudent` writes today.
- Existing learner: same shape/merge `updateStudent` writes today.
- Refactor: extract the shared field-shaping into a local `studentShape(form)`
  helper so `createStudent`/`updateStudent` and the batch write stay identical.
- Enrollment doc id: `enrollmentId(studentId, schoolYear)` from
  `src/data/enrollments.js`.
  - `transfer` → `batch.set(ref, plan.data, { merge: true })`
  - `enroll` → `batch.set(ref, { ...plan.data, studentId })` (no merge)
  - `none` → no enrollment write.
- Returns the student id.

Existing exports `createStudent`, `updateStudent`, `enrollStudent`,
`withdrawEnrollment` keep working (other callers such as the import wizard and
Enroll page are unchanged).

### 4. `src/components/GradePills.jsx` (new)

Extracted from the pill row in `SectionsPage.jsx` (keep the exact visual
style: uppercase 12px, pill radius, `T.primary` active background).

```jsx
<GradePills
  options={[{ value: 7, label: 'Grade 7', count: 4 }, …]}  // count optional → "Grade 7 (4)"
  value={activeValue}
  onChange={(value) => …}
  label="Grade level"            // used as aria-label on the group
  disabled={false}
/>
```

- Renders `<div role="group" aria-label={label}>` of `<button type="button"
  aria-pressed={active}>`.
- Callers add "All" / "Unassigned" entries themselves via `options`
  (use `UNASSIGNED` from `src/lib/constants.js` as the value for Unassigned,
  and `''` for All).

### 5. `src/components/SectionPicker.jsx` (new)

Replaces a single long `<Sel>` of sections.

```jsx
<SectionPicker
  sections={sectionsSY}          // already filtered to the school year & sorted
  value={sectionId}
  onChange={(id) => …}
  disabled={saving}
  label="Section"
/>
```

- Top: `GradePills` for each grade present in `sections` with section counts.
  Active grade = grade of the selected section if any, else user's last pick,
  else the first grade. When `value` changes from outside (e.g. QR entry),
  the active grade follows the selected section.
- Search `<Inp type="search">` with placeholder
  `Search Grade {n} sections by name`, filtered with `sectionMatches`, scoped to
  the active grade. Search text persists across grade switches.
- List of matching sections as buttons (one per row; wraps on mobile),
  label: `{name}` plus muted `{strand}` / adviser when present. Selected row is
  visually highlighted and has `aria-pressed="true"`.
- Summary line above the list when a section is selected:
  `Selected: {name} · Grade {g}{ · strand}`.
- Empty state: `No Grade {g} sections match "{query}"`.
- `disabled` disables pills, input and rows.
- If `value` is set but not in `sections`, show nothing selected (pages already
  render their own "section no longer available" alert).

## Per-tab changes

### Sections — `src/pages/SectionsPage.jsx`

- Replace the inline pill row with `GradePills` (options = `groups`, count =
  number of sections in the grade — unchanged behavior).
- Below the pills, above the table: search input, full-width,
  `aria-label="Search learners in Grade {g}"`, placeholder
  `Search Grade {g} learners by first or last name`.
- Learners in scope = students whose `currentEnrollmentByStudent(enrollments,
  schoolYear)` record has `gradeLevel === activeGrade`.
- When the query is non-empty, replace the section table (same Card) with a
  results table sorted via `depedSort`:
  `Name | LRN | Section | ''` where the last cell has
  `View section` (opens existing `SectionDetailModal` for that section) and
  `Edit` (opens `StudentForm`).
- Result count line: `{n} learner(s) in Grade {g} match "{query}"`.
- Empty: `EmptyState title="No matching learners" hint="No Grade {g} learners match "{query}"."`
- Clearing the input restores the section table. Switching grade keeps the
  query and re-scopes results.

### Students — `src/pages/StudentForm.jsx`

New props: `sections`, `enrollments`, `schoolYear` (required).
Callers to update: `StudentsPage.jsx` and `SectionsPage.jsx` (both already
load these collections).

New block after the name/sex/birthdate grid, heading
`Grade & section (SY {schoolYear})`, 2-column grid:

- **Grade** `<Sel>` of `GRADES` (label `Grade {g}`).
- **Section** `<Sel>` of sections where `schoolYear` matches and
  `gradeLevel === grade`, sorted by name; label `{name}{ · strand}`.
- Changing grade clears the section.
- **Currently enrolled learner** (per `currentEnrollmentByStudent`): pre-fill
  grade & section from the enrollment; no empty/"Not assigned" option in
  either select. Show muted helper text:
  `Moving keeps the original enrollment date and type. Past attendance stays with the previous section.`
- **Not currently enrolled** (Add learner, or Edit of an unassigned/dropped
  learner): grade and section start at `— Not assigned —` (value `''`). When a
  section is chosen, show **Enrollment type** `<Sel>` of `ENROLL_TYPE`
  (default `new`). Leaving both at Not assigned is valid.
- Validation (added to the existing `errors` state): grade chosen but section
  empty → `errors.section = 'Choose a section for this grade.'`. If the grade
  has no sections in this SY, show that message as the section field hint
  instead: `No Grade {g} sections for SY {schoolYear}. Add one on the Sections tab.`
- Save: build `plan = planEnrollmentChange(...)`, then
  `saveStudentWithEnrollment(...)` inside the existing `action.run('save', …)`.
  Keep the existing LRN validation and duplicate check first.
- `StudentsPage` table already derives grade/section from enrollments, so it
  updates live via `onSnapshot`.

### Attendance — `AttendanceTakePage.jsx`, `AttendanceSummaryPage.jsx`

- Replace the `<Field label="Section"><Sel …/></Field>` with `SectionPicker`
  (`sections={sectionsSY}`). Keep the Date/Month fields and export button beside
  or below it; the picker takes full width of the card on its own row.
- Take page: `onChange` must still call `setSectionId(id)` and
  `setEntryMessage('')`; `disabled={saving}`. QR entry (`resolveAttendanceEntry`)
  still sets `sectionId`; the picker must switch to that section's grade.
- The existing effect that clears `marks` on section/date change is unchanged.
- Remove `sectionLabel` only if it becomes unused in that file.

### Guardians — `src/pages/guardians/*`

**CodesTab.jsx (Activation slips):** replace the section `<Sel>` with
`SectionPicker` (`disabled={busy || action.busy}`; on change also
`setResult(null)`).

**LinksTab.jsx (Learner access):**
- Load `enrollments`; compute `currentEnrollmentByStudent`.
- `GradePills` options: All (`''`), Grade 7–12 (only grades that have
  enrolled learners), Unassigned (`UNASSIGNED`).
- Search uses `learnerMatches(q, s, { includeLrn: true })`, scoped to the
  selected pill. Results appear once the query is non-empty; show up to 20
  buttons, then `Showing 20 of {n} — keep typing to narrow down.`
- Result button label: `{fullName} · {lrn} · Grade {g} {section}` (or
  `· Unassigned`).

**RequestsTab.jsx, ReportsTab.jsx, ScanLogTab.jsx:**
- Add a filter row (in a Card above the table; ScanLog: inside the existing
  filter Card) with a search `<Inp type="search">`
  (placeholder `Filter by learner first or last name`) and `GradePills`
  (All default, Grade 7–12, Unassigned).
- Load `enrollments` where not already loaded (Reports, ScanLog) and use
  `currentEnrollmentByStudent` for grade.
- Row's learner: Reports/ScanLog → `byId.get(row.studentId)`;
  Requests → `byLrn.get(r.studentLrn)`.
- Search matches the learner's first/last name; Requests also match
  `r.learnerNameTyped` via `matchesWords`.
- Grade pill filter: row passes if learner's current enrollment grade equals
  the pill; `UNASSIGNED` = learner found but not enrolled, **or** no learner
  record matched. All = no grade filter.
- Muted hint under the filter: Requests/Reports
  `Filters apply to the 50 most recent open items.`; ScanLog
  `Filters apply to this date's loaded scans.`
- Filtered-to-nothing empty state: `No rows match these filters.` (keep the
  existing empty states for when there is no data at all).
- ScanLog's raw-event count text keeps counting all loaded rows; append
  ` · {shown} shown` when a filter is active.

## Accessibility & responsive

- Search inputs have visible labels (via `Field`) or `aria-label`.
- Pills are `aria-pressed` toggle buttons in a labelled group; keyboard
  operable (native buttons).
- Result counts are in an element with `aria-live="polite"`.
- Must work at 375px width without horizontal page scroll (pills wrap,
  picker list rows wrap).
- Follow existing styling tokens (`T`, `S` from `src/styles.js`, `Btn`, `Inp`,
  `Sel`, `Field`, `Card`, `EmptyState` from `src/components/ui.jsx`). No new
  dependencies.

## Testing

Unit tests (Vitest, colocated like `src/lib/roster.test.js`):

`src/lib/search.test.js`
- empty / whitespace query matches
- case-insensitive; accents (`Nuñez` found by `nunez`, `NUÑ`)
- prefix only: `riz` matches "Jose Rizal", `iza` does not
- multi-token: `jose riz` matches; `jose cruz` does not match "Jose Rizal"
- learnerMatches on first and last name; LRN only when `includeLrn`
- undefined/null fields don't throw

`src/lib/enrollmentChange.test.js`
- `currentEnrollmentByStudent` ignores other SYs and non-`enrolled` status
- `none` when section null or unchanged
- `transfer` returns only gradeLevel/sectionId/track/strand (no dateEnrolled/type/status)
- `transfer` to a JHS section sets track/strand to null
- `enroll` for no current record: type default `new`, chosen type respected,
  status `enrolled`, dateEnrolled = today
- `enroll` when the only current-SY record is `dropped`

Verification commands (must pass): `npm test`, `npm run build`.

Manual checklist (emulators or dev):
1. Sections: Grade 8 → type a last name → results show only Grade 8 learners;
   View section opens the modal; Edit opens the form; clear restores table.
2. Students: Edit enrolled learner, move to another section → Students table
   shows new section; enrollment doc keeps original `dateEnrolled` & `type`.
3. Students: Add learner with Grade 7 + section + type `transferee` →
   appears enrolled. Add learner with no grade → Unassigned.
4. Students: pick grade, no section → error shown, nothing saved.
5. Attendance Take: pick via pills + search "rizal"; QR entry URL selects the
   right grade/section; picker disabled while saving.
6. Attendance Summary: same picker; SF2 export still works.
7. Guardians: Activation slips picker; Learner access pills + search;
   Requests/Reports/Scan log filters narrow rows; Unassigned pill works.
8. 375px width: no horizontal scroll on any changed screen.
