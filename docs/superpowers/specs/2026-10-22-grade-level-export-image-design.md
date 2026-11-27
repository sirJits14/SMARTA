# Grade-level section summary image (SIMS)

Date: 2026-10-22

## Goal

On the Sections page, a registrar or coordinator can export the sections of the
selected grade level as one PNG: a clean table of every section with its
adviser, schedule and enrolled learners (male / female / total), plus the grade
total, ready to post in a group chat or drop into a report. The image shows
counts only. It never carries learner names or LRNs.

## Decisions (agreed with the user)

- Contents: a section summary for one grade. Columns: Section, Strand
  (Grades 11-12 only), Adviser, Schedule, Male, Female, Total, then a grade
  total row. No learner names.
- Scope: the grade selected in the grade pills. The button sits in the Sections
  toolbar beside the search box.
- After the click: the PNG downloads immediately. No preview dialog and no
  clipboard button.
- Approach: draw the image on a `<canvas>`. No new dependency.
- Defaults accepted: a fixed light look regardless of dark mode, the whole
  grade regardless of the search box, current school year only, 1080 px wide
  saved at up to 2x.

## Existing pieces reused

- `SectionsPage.jsx`: `rows` (current-year sections, already sorted),
  `activeGrade`, `scheduleById`, the scoped `enrollments` and `students`
  (`scopeRoster` keeps coordinators inside their grades), `canViewRoster`.
- `capsName` (`src/lib/roster.js`), `isSHS` (`src/lib/constants.js`).
- `Btn` and its `loading` state (`src/components/ui.jsx`).
- The local export-error pattern of `AttendanceSummaryPage.doExport`. The shared
  `useAsyncAction` message ("Your entries are still here") is save-specific, so
  it is not used here.
- Asset import with `?url` as in `src/lib/sf2.js`; anchor download as in
  `src/lib/downloadWorkbook.js`.
- `App.jsx` already reads `settings/app`, so the school name needs no new
  listener.
- Light tokens in `shared/theme/theme.css`; the fixed print font stack `T.print`
  in `src/styles.js`.
- The real-browser harness pattern in `tests/browser/` (`section-editing.*`).

## Design

### Behaviour

1. `SectionsPage` shows a ghost button labelled **Export image** (text only) in
   the toolbar row, directly after the search box and before "Select N sections
   without a slip". Its accessible name is "Export image of Grade 8 sections",
   which contains the visible label.
2. It renders only when `canViewRoster` is true (the current school year) and a
   grade is active, which is the only time the toolbar exists. The Next-year
   planning view has no enrollment counts and gets no button.
3. Click: the button shows its busy state, the image renders, and
   `BNHS-Grade-8-Sections-SY2026-2027.png` downloads. Further clicks while it
   renders are ignored (`Btn loading` disables it).
4. The image always covers the entire active grade, in the same order as the
   table, and ignores text typed in the search box. Otherwise the totals row
   would present a subset as the grade total.
5. Everyone who can open Sections gets the button: administrators, JHS and SHS
   coordinators and Grade Level Coordinators. The data is exactly what their
   scoped page already shows.
6. Failure shows `Could not create the image. Please try again.` in the page's
   `sims-feedback` alert style and makes the button usable again.

### Numbers (`src/lib/gradeSummary.js`, pure)

- `sectionCounts(enrollments, students, schoolYear)` makes one pass and returns
  a `Map` of section id to `{ male, female, total }`. It counts only enrollment
  rows with `status === 'enrolled'` in that school year. Sex comes from the
  student record (`'M'` or `'F'`). `total` counts every enrolled row, so a
  learner whose record is missing or has no sex adds to Total only.
- The page's **Enrolled** column switches to `sectionCounts(...).total`,
  replacing its inline `enrolledCountBySection`. The table and the image then
  read one function and cannot disagree (PRODUCT principle 4).
- `gradeSummary({ grade, sections, counts, schedules, schoolYear })` keeps the
  sections of that grade and school year in the order given and returns
  `{ grade, schoolYear, hasStrand, rows, totals, unknownSex }`. `counts` is the
  `sectionCounts` Map and `schedules` is the page's `scheduleById` Map. Each row
  is `{ id, name, strand, adviser, schedule, male, female, total }`, with the
  adviser in capitals (`capsName`) and empty strings when there is no adviser or
  strand, or when the schedule id matches no schedule. `totals` is
  `{ sections, male, female, total }`,
  `unknownSex` is `total - male - female`, and `hasStrand` is true for
  Grades 11-12.
- `gradeImageFilename(grade, schoolYear)` returns
  `BNHS-Grade-8-Sections-SY2026-2027.png`.

### Image (`src/lib/gradeSummaryImage.js`)

Layout is a pure function over an injected text measurer, and painting takes a
2D context, so both are testable without a canvas.

- Width 1080 logical px; height follows the content. Side padding 48 px.
- Header: the BNHS logo (`src/assets/bnhs_logo.png`, 96 px square) with, to its
  right, the school name in capitals (30 px, 700), `Grade 8 · Sections and
  enrollment` (24 px, 600, teal) and `SY 2026-2027` (22 px, 400, muted). A
  hairline follows. A long school name drops to 26 px, then 22 px, to stay on one
  line, and ends in `…` if it still does not fit.
- Column header row (18 px, 600, muted, capitals): SECTION, STRAND (SHS only),
  ADVISER, SCHEDULE, MALE, FEMALE, TOTAL. The three count columns are
  right-aligned.
- Rows (26 px): section name 600 in ink, Total 700, other cells in the subtle
  text color, hairlines between rows. Text wraps inside its column to at most
  two lines, then ends in `…`. An empty adviser, schedule or strand shows `—`.
  Line height 32, minimum row height 64.
- Totals row: a 2 px teal top rule, the label `Grade 8 total · 4 sections`
  (`1 section` when singular) across the leading columns, and bold Male, Female
  and Total.
- Footnote only when `unknownSex > 0`: `1 learner has no sex on record, so Male +
  Female is less than Total.` (`N learners have` when more than one).
- Footer: `Generated Oct 22, 2026 · BNHS Learner Records` (20 px, muted), dated
  with the device's local date and formatted with `en-US` and a short month.
- Palette: surface `#FFFFFF`, border `#E3E8EF`, ink `#17212F`, subtle
  `#3F4C5E`, muted `#5F6E83`, teal `#077683`. These mirror the light tokens in
  `shared/theme/theme.css` and are fixed so the image stays light in dark mode.
  A test fails if the two drift. They live in a `.js` module, so the JSX
  color-literal check is unaffected.
- Font: `T.print` (`'Inter',system-ui,sans-serif`). Before measuring,
  `renderGradeSummaryPng` awaits `document.fonts.load` for the weights it uses;
  if that fails the image falls back to system-ui.
- Resolution: the backing store is scaled by `fitScale(width, height)`, which is
  2x reduced so width x height x scale^2 stays under 16 million pixels (the iOS
  Safari canvas limit).
- `renderGradeSummaryPng(summary, { schoolName, generatedOn })` returns a PNG
  `Blob` and rejects if `toBlob` yields null. A logo that fails to load is
  skipped and never blocks the export.
- School name: `App.jsx` passes `settings.schoolName` to `SectionsPage` as a new
  optional `schoolName` prop. A blank value falls back to
  `Bukidnon National High School`.

### Download

`src/lib/downloadBlob.js` holds the anchor-download logic and
`downloadWorkbook.js` calls it. The Excel exports behave as before.

## Error handling

- Render or encode failure: caught in the page handler, the message is shown and
  the busy state clears. Nothing downloads.
- Missing logo or unreachable fonts: the image still renders.
- A section with no learners is listed with 0, 0 and 0.
- Very long names wrap, then truncate with `…`.
- A very tall grade reduces the scale to the pixel limit. There is no
  pagination.

## Testing

- `gradeSummary.test.js`: counts only enrolled rows of the year; male and female
  from student sex; unknown sex adds to Total only; zero rows; adviser capitals
  and blanks; input order kept; other grades and years excluded; `hasStrand`;
  filename.
- `gradeSummaryImage.test.js` (fake measurer and a recording fake context):
  every row and the totals painted in order; columns stay inside the content
  width; SHS adds Strand and JHS does not; wrap and ellipsis limits; singular
  section label; footnote only when needed; logo drawn only when provided;
  nothing painted outside the canvas; `fitScale`; palette equals the light
  tokens in `theme.css`; and `renderGradeSummaryPng` against stubbed browser
  objects (fonts awaited, canvas sized at the fitted scale, and a failing logo,
  failing fonts or a null PNG each handled as described above).
- `downloadBlob.test.js`: anchor href and filename, click, URL revocation.
- `SectionsPage.test.js`: the button and its accessible name render for a
  coordinator and an administrator, and the Enrolled column still shows counts.
- Browser harness `tests/browser/grade-export.*` (the real `SectionsPage`,
  synthetic data, no services): button present or absent by school year; the
  click downloads the right filename; the PNG decodes at the expected width and
  is not blank; the export ignores the search box; failure shows the alert and
  recovers; dark mode still yields a light image. The page also displays the
  PNG so a Grade 8 (JHS) and a Grade 11 (SHS) export can be checked by eye.
- `npm test` and `npm run build` pass.

## Deployment

SIMS only: no functions, rules or Parent app change. This work does not deploy
anything. SIMS hosting continues to ship through its documented release
preparation.

## Out of scope

- All-grades or school-wide export, a preview dialog, copy to clipboard, a share
  sheet.
- Learner rosters, or any learner names or LRNs in the image.
- Export from the Next-year planning view.
- A Parent app version.
- A dark-mode variant, and file formats other than PNG.
