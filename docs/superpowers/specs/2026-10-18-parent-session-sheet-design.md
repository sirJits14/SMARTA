# Parent Session Attendance Sheet — Design

Date: 2026-10-18
Status: Approved
Area: `parent/` (Learner History), `functions/` (`getFamilyAttendanceFn`)

## Problem

Learner History (`parent/src/screens/History.jsx`) opens with the Session
attendance card above the gate-scan bubbles, so a parent has to scroll past it
to see Logged in / Logged out. The card also always shows **AM** and **PM**
rows. That is right only for split-day schedules. A learner on a single-session
schedule ("Morning Shift" or "Afternoon Shift" in SIMS) sees a meaningless empty
PM row, and an Afternoon Shift learner's attendance is labeled "AM", because
single-session data is stored in the `am` slot.

## Goals

1. History shows the gate-scan bubbles by default. Session attendance appears
   only when the parent asks for it.
2. A **Sessions** button at the top of History opens it.
3. The rows match the learner's section schedule in SIMS: AM + PM,
   Morning shift, Afternoon shift, or no schedule.

## Non-goals

- No change to how SIMS schedules are created or stored (no new "shift type"
  field).
- No change to SIMS staff screens (Session Review keeps AM/PM labels).
- No schedule history: past dates use the section's **current** schedule.
- No change to how attendance or overrides are recorded.

## Design

### 1. History default view

- `History.jsx` no longer renders `FamilySessionDetails` inline. The page is
  the header plus the bubble thread.
- `PageHeader` gains an optional `action` prop (a React node) rendered at the
  right end of the sticky top bar. History passes a **Sessions** pill
  (calendar icon + "Sessions"), so the button stays reachable after the large
  name collapses on scroll.
- The Shell places the theme button at `top: 14px; right: 16px` over the same
  corner. When `action` is set, the bar reserves that corner
  (`padding-right: 68px`, i.e. 16 px inset + 44 px button + 8 px gap), so the pill
  sits just left of the theme button and never overlaps it.
- The pill is a real `<button>` with a visible label and at least a 44 px tap
  target. `aria-haspopup="dialog"`, `aria-expanded` reflects the sheet.

### 2. Session attendance bottom sheet

- New `parent/src/components/SessionSheet.jsx`: a generic bottom-sheet shell
  (title, Close, children), imported by History. History is already a
  route-split chunk, so the sheet stays out of the eager bundle without
  `lazy()`. It is portalled to `<body>`, with a dimmed backdrop and a
  bottom-anchored panel up to 480 px wide, following `RelationshipSheet`.
- Contents: title "Session attendance", the existing date field
  ("School day · Manila", max = today), then the session rows. The fetch,
  retry, error and loading behavior of `FamilySessionDetails` is reused as is.
  `FamilySessionDetails` becomes the sheet's body: it drops its outer `Card`
  and `h2`, and the sheet provides the title. The row rendering moves into a
  Firebase-free `SessionRows.jsx`, so the browser preview can render it with
  synthetic data.
- Closes on: Close button, backdrop tap, Escape. Focus moves into the dialog on
  open and returns to the Sessions pill on close. The bubble scroll position is
  untouched because the sheet is an overlay.
- The panel scrolls inside itself (`max-height: 85dvh; overflow-y: auto`), so a
  long day with corrections fits on a phone. Bottom padding includes
  `env(safe-area-inset-bottom)`.

### 3. Auto-open from a notification

- An "Attendance updated" inbox item links to
  `/learner/:id?date=YYYY-MM-DD&session=am|pm` (`inboxDestination`, unchanged).
- When History mounts with `route.query.date`, the sheet opens on that date and
  highlights the row for `route.query.session`. For single-session schedules
  the only row is highlighted (its data lives in `am`).
- The current `scrollIntoView('#session-details')` branch in History's layout
  effect is removed. With a date link, the bubbles land at the bottom as usual,
  under the open sheet.
- Every other visit (`?event=` links, plain navigation) starts with the sheet
  closed.

### 4. Rows follow the SIMS schedule

`getFamilyAttendanceFn` adds `schedule` to its response: the section's bell
times `{ timeIn, timeOut, pmTimeIn, pmTimeOut }` (each `HH:MM` or `null`), or
`null` when the section has no schedule. It reuses `bellTimes()` from
`sessionAttendance.js`, so only times leave the server, never schedule names or
IDs.

A pure function `sessionRows(schedule)` in `parent/src/lib/sessionRows.js`
turns that into the rows to render:

| Schedule | Rule | Rows (`key` → data slot, label) |
|---|---|---|
| AM + PM | `hasPmSession(schedule)` | `am` → `AM · 07:30 AM–12:00 PM`; `pm` → `PM · 01:00 PM–04:30 PM` |
| Morning shift | single session, valid `timeIn` < `12:00` | `am` → `Morning shift · 06:00 AM–12:00 PM` |
| Afternoon shift | single session, valid `timeIn` ≥ `12:00` | `am` → `Afternoon shift · 12:30 PM–06:00 PM` |
| No schedule | `schedule === null`, or no valid `timeIn` | `am` → `Attendance` |
| Old server | `schedule === undefined` | legacy `AM`, `PM` rows (no times) |

- Times use `formatScanTime` from `shared/dates.js`. If either end of a range
  is missing, the times are left off and only the name shows.
- Each row shows the mark (Present / Late / Absent / Excused, or
  "No attendance mark"), the staff reason and "Updated by … · time" when
  present, and **Gate: in – out** from the slot's gate keys (`am` → `timeIn`/`timeOut`,
  `pm` → `pmTimeIn`/`pmTimeOut`).
- Footnote: AM + PM → "AM and PM attendance are recorded separately. Original
  gate scans are in the history." Every other case → "Original gate scans are
  in the history."

### 5. Release

- The **functions** deploy (`getFamilyAttendanceFn`) and the **Parent hosting**
  deploy are both needed. Either order is safe: an old server returns no
  `schedule` key and the sheet falls back to AM/PM. An old client ignores the
  new key.
- **Functions: never deploy `getFamilyAttendanceFn` from the root `functions/`
  on master.** The root `validAttendance` requires `attendance.gradeLevel`, and
  the live `onScanEventCreated` never writes it, so every live attendance doc
  would fail with "Attendance record requires administrator repair".
- Production is on the compatible baseline described in
  `docs/releases/2026-10-18-school-family/README.md` (read it first; do not
  deploy the root `firebase.json`). Prepare the backend with
  `node docs/releases/2026-10-18-school-family/prepareBackend.mjs --copy-dependencies`
  (default output `.superpowers/releases/school-family/backend`, which must not
  already exist). It applies `adaptSessionAttendance`, so a missing stored grade
  falls back to the server-read section grade. Then deploy only
  `getFamilyAttendanceFn`, from that prepared tree, with
  `firebase.school-family-release.json` and project `bnhs-sims`:
  `firebase deploy --config firebase.school-family-release.json --project bnhs-sims --only functions:getFamilyAttendanceFn`.
  Use the usual deploy settings for this machine (IPv4-first DNS, longer
  functions discovery timeout) and supply `PORTAL_URL` in the prepared
  functions `.env.bnhs-sims` per that README. `--force` is only for the
  correction trigger's first deployment and is not needed for this single
  function.
- **Parent:** ship per the Parent App release flow: build, `hosting:parent` only,
  then byte-check the deployed files against the build. This change does not
  touch SIMS hosting.

## Error handling

- Fetch failure: existing danger banner with "Try again" inside the sheet.
- Permission denied (link ended): the sheet shows the error. History already
  shows the access-ended banner, and the Sessions pill is hidden when the
  learner can't be read (same condition that used to hide the card).
- A malformed schedule (bad `HH:MM`) is nulled by `bellTimes()` and falls
  into the "no valid `timeIn`" → `Attendance` row.

## Testing

- `parent/src/lib/sessionRows.test.js`: AM + PM, morning (`11:59`),
  afternoon (`12:00` boundary), no schedule (`null`), schedule with invalid
  `timeIn`, missing end time (name only), legacy `undefined`, and footnote
  choice.
- `parent/src/lib/strings.test.js`: the new strings exist.
- `functions/test/emulator/sessionAttendance.test.js`: `getFamilyAttendance`
  returns `schedule: null` without a section schedule, and the bell times
  (with no extra fields) when `sections/SEC1.scheduleId` points to a schedule.
- Browser preview harness `parent/tests/browser/session-sheet-*`: renders the
  sheet with synthetic data for each schedule type, plus the History header pill
  next to the theme button, at 375 px width in light and dark. Checked visually
  before release.
