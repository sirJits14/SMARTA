# SF2 download from the Parent App Class tab

Date: 2026-10-22
Surfaces: Parent App (School mode, Class tab), Cloud Functions, shared code.
Companion spec: `2026-10-22-parent-learner-requests-design.md` (independent; can ship before or after this one).

## Goal

A Class Adviser can download the SF2 (Daily Attendance Report of Learners) for their section and a chosen
month from the Class tab. The file is the same Excel workbook SIMS exports today under Attendance summary →
Export SF2 (Excel).

## Decisions (agreed with the user, 2026-10-22)

1. **Format: Excel only, identical to SIMS.** Same template, marks, totals, adviser name and layout. No PDF.
2. **Built on the server** with the SIMS builder moved into shared code, so there is one implementation. The
   Parent App only saves the file; ExcelJS and the 116 KB template never reach phones. (Building on the phone
   was rejected: heavier download, and ExcelJS would join the Parent build.)

Defaults chosen for this spec (change during review if wrong):

- Authorization is the same as the Class tab's roster (`canReviewSection`), current school year only.
- Months offered: the current school year, June through May, up to the current month.
- Weekdays all count as school days, exactly as SIMS does today (no holiday calendar exists).
- Exports are rate limited to 20 per hour per user.

## Existing pieces reused

- `buildSF2Workbook` (`src/lib/sf2.js`), the helpers in `src/lib/sf2Template.js`, the template
  `src/assets/sf2-template.xlsx`, `schoolDaysInMonth` and `monthLabel` (`src/lib/dates.js`), `capsName`,
  `fullName`, `depedSort` (`src/lib/roster.js`), and `effectiveDayMark`, `attendanceUnits`, `sessionAttendance`
  (`shared/sessionAttendance.js`).
- The data preparation in `AttendanceSummaryPage.jsx`: enrolled roster, attendance by date, and the
  enrolment-as-of-first-Friday-of-June count (`firstFridayOfJune`).
- `loadSchoolActor`, `canReviewSection`, `schoolCall`, `enforceRateLimit`.
- `src/lib/sf2.test.js` already builds the workbook under Node with the real template (only `fetch` is stubbed),
  so the builder has no browser-only dependency besides loading the template.

## Design

### Shared builder

- New `shared/sf2/` holds the builder (`buildSf2Workbook.js`) with the template passed in as `templateBuffer` (no
  `fetch`, no `?url`), the moved `sf2Template.js` helpers (which read attendance through
  `shared/sessionAttendance.js`), and its own copies of the few pure helpers the builder needs:
  `calendar.js` (`schoolDaysInMonth`, `monthLabel`, `firstFridayOfJune`), `names.js` (`capsName`, `fullName`) and
  `months.js` (the month rule shared by the Parent App and the server). One template file:
  `shared/sf2/sf2-template.xlsx`.
- SIMS keeps its public API. `src/lib/sf2.js` becomes a thin wrapper that loads the template (Vite `?url` of the
  shared file) and calls the shared builder; `src/lib/sf2Template.js` re-exports the moved helpers; and
  `AttendanceSummaryPage.jsx` imports `firstFridayOfJune` from shared. SIMS's `dates.js`, `roster.js` and
  `attendance.js` are left alone, because live SIMS releases are assembled from older copies of them. Parity tests
  (`calendar.test.js`, `names.test.js`) keep the shared copies equal to SIMS's. SIMS behavior does not change.
- The existing SF2 tests keep running through the SIMS wrapper and re-export. New tests build the workbook from the
  real template in Node, the way Cloud Functions does.
- `scripts/syncShared.mjs` already copies `shared/` into `functions/shared/` on every functions deploy
  (`firebase.json` predeploy), so the builder and template reach the function with no new step. `exceljs`
  (`^4.4.0`, as in the root) is added to `functions/package.json`.

### `exportSchoolSf2Fn({ sectionId, month })`

A `schoolCall` with 512 MiB, a 60-second timeout and concurrency 5 (`schoolCall` gains an optional options argument, as
`staffCall` has).

1. Validate `sectionId` (identifier) and `month` (`YYYY-MM`).
2. `loadSchoolActor`; the section must exist and pass `canReviewSection(actor, section)`: the section's Class
   Adviser, plus Administrators and grade reviewers if they ever call it. Failure text is the existing "This
   section is outside your attendance access."
3. The month must fall between June of the school year's first year and May of the second, must not be after the
   current month in Manila, and its first weekday must have arrived. Otherwise `invalid-argument`: "Choose a
   month of this school year, up to the current month."
4. Rate limit: 20 per hour per user (`enforceRateLimit`, action `sf2Export`).
5. Read the section's enrollments for the year (all statuses): the roster is the `enrolled` ones, and the
   enrolment figure counts those with `dateEnrolled` on or before the first Friday of June, as SIMS does. Read
   the roster's students, `student_attendance/<sectionId>_<date>` for each weekday of the month, and
   `settings/app` for `schoolId` and `schoolName`. A day document is used only when its `sectionId` matches the
   section (SIMS's own filter); a day of another section is ignored. Kiosk days on the live system carry no
   grade and take the section's grade. A day that does carry a grade must be a valid grade (7 to 12) the
   caller may review, otherwise the call fails with `failed-precondition` ('Attendance record requires
   administrator repair.') or `permission-denied` ('The saved attendance grade is outside your scope.'),
   exactly as the live roster does.
6. An empty roster fails with `failed-precondition`: "There are no learners in this class yet."
7. Keep the learners SIMS lists (`sex` M or F, as `depedSort` does; the builder sorts them), build, `writeBuffer()`, and return `{ filename, contentType, contentBase64 }`.
   `filename` is `SF2_<Section>_<YYYY-MM>.xlsx`, with `\ / : * ? " < > |` replaced by `-`.

The call is read-only: no audit row, no writes. The response is the file and nothing else.

### Parent App

- **Download SF2** is part of the Class tab action row (shared with the learner-requests spec; whichever lands
  first creates the row). It is hidden when the school year has ended and disabled with "No learners in this
  class yet." when the roster is empty.
- **Sheet** (`Sf2Sheet.jsx`, lazy): the class label, a month picker (newest first, defaulting to the current
  month, built by a pure helper that applies the same range and first-weekday rule as the server), and a
  **Download** button. While waiting it reads "Preparing SF2…". Errors show a banner above the Download button, which stays enabled so the person can try again. Unexpected errors read "Could not prepare the SF2. Try again."; the server's own messages (for example the rate limit) show as sent. Once the file is prepared the sheet keeps it, and if the share was refused (below) the main button reads **Save SF2** with a note, "Your SF2 is ready. Tap Save to keep it."; choosing another month discards the prepared file.
- **Saving:** decode the base64 into a `File` of type
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. The share sheet is used only on
  touch-first devices (the primary pointer is coarse) where `navigator.canShare?.({ files: [file] })` is true:
  call `navigator.share` (on phones this offers Save to Files, Drive, or opening in Excel). A cancelled share
  (`AbortError`) is silent. Browsers only allow a share shortly after the tap that started it, and the file
  arrives after the server call, so the share can be refused (`NotAllowedError`): the sheet then stays open,
  keeps the prepared file and the main button becomes **Save SF2**, whose fresh tap is allowed to open the
  share sheet. If that is refused again, the file downloads, so the person is never stuck. On computers (and
  after any other share error) the file downloads through an object URL, as `downloadWorkbook` does in SIMS,
  because a computer's system share dialog has no "Save". While the sheet is open the Class tab does not
  reload the roster when the app regains focus (returning from the share sheet fires that event).
- Advisers with more than one section use the Class tab's section selector; the sheet exports the selected one.
- The sheet loads on demand and the Parent App gains no new dependency, so the 260 KB first-load budget is
  untouched (check with `npm run size`).

## Errors and edge cases

- Section outside the caller's access: `permission-denied` with the existing text.
- School year ended: advisers have no active assignment then, so the action is not offered. Administrators
  export from SIMS.
- Too many exports: "Too many exports. Try again in a few minutes."
- Any other failure: "Could not prepare the SF2. Try again."
- Large classes: the builder already expands rows for long rosters (tested up to 50 males and 60 females);
  memory is ample.
- Half-day absences keep their cell note ("AM:X PM:L") and fractional totals, because the same builder runs.
- Time zones: the builder and `schoolDaysInMonth` build local-time dates and read their weekday in the same
  zone, so a server in UTC gives the same weekdays as a browser in Manila. "Current month" and "today" use
  `manilaDate()`.

## Testing

- **Builder:** the existing `src/lib/sf2.test.js` and `sf2Template.test.js` keep passing through the SIMS wrapper
  and re-export, and `shared/sf2/buildSf2Workbook.test.js` builds a month from the real template in Node
  (header, boys-then-girls rows, Monday-aligned marks, half-day cell notes, totals, an ArrayBuffer template).
- **Parity:** `calendar.test.js` and `names.test.js` keep the shared copies equal to SIMS's `dates.js` and
  `roster.js`.
- **Emulator** (`functions/test/emulator/sf2Export.test.js`): the section's adviser receives a workbook that
  loads and shows the expected learners, marks (including half-day), totals, school id and name, and adviser
  name; another section's adviser is denied; an Administrator, a coordinator in the grade and a Curriculum
  Adviser for the grade are allowed; invalid, out-of-year and future months are refused; an empty roster is
  refused; the rate limit trips; attendance documents with a different `sectionId` are ignored; the file name
  is sanitised.
- **Parent unit tests:** the month-list helper (school-year boundaries, first-weekday rule, newest first), the
  base64-to-file helper, and the share-or-download branch with a stubbed `navigator`.
- **Builds:** SIMS build, Parent build with `npm run size`, `npm test` in root, `parent` and `functions`.
- **Manual:** emulator browser check that the downloaded workbook opens and matches the SIMS export for the
  same section and month.

## Rollout

1. Functions: the new callable and the `exceljs` dependency, deployed by name.
2. Parent App with `npm run deploy:parent` from fresh `origin/master` (keeps PR #74).
3. No SIMS release is needed for this feature. SIMS's wrappers and re-exports ride along with its next release;
   the live SIMS keeps its current files until then, and nothing in the feature depends on them.
4. Update `docs/parent-portal-adviser-guide.md` (downloading the SF2) and record the deployment under
   `docs/audits/deployments/`.

## Out of scope

PDF output; SF2 for earlier school years; Parent App entry points for coordinators and Curriculum Advisers (they
use SIMS); a holiday calendar; locking or signing off a month; changing the SF2 layout or the SIMS export page.
