# Optional PM session on schedules — design

Date: 2026-10-15
Status: approved

## Problem

Some Grade 12 sections run a split day: 8:00 AM–12:00 NN and 1:00 PM–4:00 PM.
A schedule today has a single Time in and Time out. That causes two problems:

- Late is judged only against the morning time in. Nothing records whether a
  learner came back on time after lunch.
- The day's attendance record keeps one `timeIn` and one `timeOut` per
  learner. A later tap replaces an earlier one, so a lunch tap-out and a
  1:00 PM tap-in overwrite the morning times.

## Decisions (from the brainstorm)

| Question | Answer |
|---|---|
| What PM times do | Learners tap four times a day. Afternoon tap-ins are checked against the PM arrival. The day still gets a single P/L/A mark. |
| On time AM, late PM (7:55 AM, 1:15 PM) | Day stays **P**. The record gets a **Late PM** note. |
| Missed the morning, first tap-in at 12:50 PM | Day is **P**. The record gets an **Absent AM** note. |
| Lunch taps | Some learners stay on campus and never tap at lunch, so a missing afternoon tap-in is **not** flagged. |
| Where it shows | Take Attendance, Attendance Summary hover text, and the parent app's today status. |

## Scope

In:
- Optional PM arrival and PM departure on a schedule.
- Backend sorts each kiosk tap into the morning or afternoon session. It
  stores afternoon taps separately and records Late PM / Absent AM notes.
- Notes appear in SIMS Take Attendance, SIMS Attendance Summary, and the
  parent app (Home row and learner header).

Out:
- The kiosk app (separate repo). Its confirmation card still shows the day
  mark, so a learner who taps in late after lunch sees "Present".
- Push notification wording.
- Half-day absence counting, totals, and the SF2 export. Notes never change
  P/L/A counts.
- An "Absent PM" note (ruled out by the lunch-tap answer).

## Data model

`schedules/{id}` gets two optional fields, both present or both absent:

```
pmTimeIn:  "13:00"   // PM arrival, HH:MM 24-hour
pmTimeOut: "16:00"   // PM departure
```

The existing `timeIn` / `timeOut` stay as they are and mean the morning (AM)
arrival and departure when PM times exist. No rules change is needed:
schedule writes are admin-only and the shape isn't validated.

`student_attendance/{sectionId}_{date}` gets these optional per-learner maps,
written only when the section's schedule has PM times:

```
pmTimeIn:  { [studentId]: "13:05" }   // latest afternoon tap-in (same keep-latest rule as timeIn)
pmTimeOut: { [studentId]: "16:02" }   // latest afternoon tap-out
latePm:    { [studentId]: true }      // first afternoon tap-in was after pmTimeIn
absentAm:  { [studentId]: true }      // first tap-in of the day was in the afternoon
```

Existing readers of `timeIn` / `timeOut` (staff pages, kiosk dedupe) keep
working: for split-day sections those fields now hold only morning taps.
Staff `saveMarks` merges `marks` only, so it never wipes these fields.

`learners/{id}.today` gets a `notes` array, always present: `[]`,
`['absentAm']`, `['latePm']` or both, in that order.

## Shared session rules — `shared/scheduleSessions.js`

Pure helpers, used by SIMS, the parent app and Cloud Functions. Functions get
them through the existing `scripts/syncShared.mjs` copy.

- `hasPmSession(schedule)`: true when `timeOut`, `pmTimeIn` and `pmTimeOut`
  are all valid HH:MM. The split needs the AM departure too.
- `sessionSplit(schedule)`: the midpoint between AM departure (`timeOut`) and
  PM arrival (`pmTimeIn`), as HH:MM, rounded down to the minute. 12:00 and
  13:00 give 12:30.
- `sessionOf(time, schedule)`: `'pm'` when the schedule has a PM session and
  `time >= sessionSplit`, otherwise `'am'`.
- `sessionNotes({ inTimes, schedule })`: works out the notes from all of the
  day's tap-in times. `absentAm` is set when there is at least one tap-in and
  none of them is AM. `latePm` is set when the earliest PM tap-in is later
  than `pmTimeIn`. Returns an empty list when the schedule has no PM session.

All of these compare times as zero-padded HH:MM strings, which is the
convention the code already uses.

## Backend — `functions/src/handlers/scanAttendance.js`

`applyScanAttendance` already reads the section's schedule inside the
transaction. It now keeps the whole schedule document, not just `timeIn`.

For each applied kiosk tap:
1. `session = sessionOf(scanTime, schedule)`.
2. The field becomes `timeIn` / `timeOut` for AM taps and `pmTimeIn` /
   `pmTimeOut` for PM taps. The existing never-move-backwards rule applies
   to all four fields.
3. **Day mark.** It is set only on the learner's first tap-in of the day
   (no `timeIn` and no `pmTimeIn` yet), and only if the current mark is
   missing or `A`, which are today's rules.
   - An AM tap-in gives `L` if after `timeIn`, otherwise `P`. This is today's
     behavior.
   - A PM tap-in gives `P` and sets `absentAm`.
4. **Late PM.** Late PM is judged on the earliest afternoon tap-in. It is
   set when the first PM tap-in (no `pmTimeIn` yet) is after `pmTimeIn`, and
   cleared when any on-time PM tap-in (at or before `pmTimeIn`) is processed.
   So the result doesn't depend on the order a delayed offline kiosk syncs
   its taps.
5. **Delayed morning tap.** If an AM tap-in is applied after a PM tap-in was
   already recorded (an offline kiosk syncing late), clear `absentAm` for
   that learner. If the day mark is `P`, it is judged again against the AM
   arrival (`L` if after `timeIn`, otherwise `P`), because the `P` came from
   the PM-first rule. `E` and `L` marks are untouched.

Sections whose schedule has no PM times take exactly the current path, so
nothing changes for them.

Staff-entered scans (`source: 'staff'`) don't go through
`applyScanAttendance` today, and that doesn't change.

## Backend — parent summary (`scanEvent.js`, `recomputeSummary.js`)

- `handleScanEvent` already loads the section. It also loads the section's
  schedule, when `scheduleId` is set, and passes it to `recomputeSummary`.
- `recomputeSummary({ events, todayDate, schedule })` adds
  `today.notes = sessionNotes({ inTimes: <today's recorded tap-in times>, schedule })`.
- Voided events are already left out of today's events, so a voided tap
  can't produce a note.

## SIMS UI

**Schedules page (`SchedulesPage.jsx`, `data/schedules.js`)**
- The form gets a checkbox: **Add afternoon session (PM)**. Ticked, it shows
  **PM arrival** and **PM departure** and relabels the first two fields
  **AM arrival** / **AM departure**. It opens ticked when editing a
  schedule that has PM times.
- Validation lives in a pure `validateSchedule(form)` in
  `src/lib/schedules.js`:
  - A name is required.
  - AM times are required, and AM departure must be after AM arrival.
  - With the checkbox ticked, both PM times are required, and the times must
    run AM arrival < AM departure ≤ PM arrival < PM departure.
- On save, an unticked checkbox removes `pmTimeIn` / `pmTimeOut`
  (`deleteField()` on update; omitted on create).
- The table gets **PM In** / **PM Out** columns, showing "—" when a schedule
  has no PM times.

**Take Attendance (`AttendanceTakePage.jsx`)**
- PM columns show when the selected section's schedule has a PM session,
  or the day's record already has PM data. The second case covers a past day
  after the schedule was changed.
- In that case the headers read **AM In / AM Out / PM In / PM Out**, and the
  row minimum width grows to fit.
- A small muted badge under the status pill reads **Late PM** / **Absent AM**.
  The notes are added to the row's `aria-label` too.
- Tally and saving don't change.

**Attendance Summary (`AttendanceSummaryPage.jsx`)**
- Each day cell's hover text adds `PM in: … · PM out: …` and the note
  labels when present. Cells and totals don't change.

A pure helper in `src/lib/attendance.js` reads a learner's PM times and notes
from an attendance doc, so both pages use the same logic.

## Parent app

- `parent/src/lib/format.js` gets `todayNotes(today, todayDate)`. It returns
  the labels `S.noteAbsentAm` ("Absent AM") and `S.noteLatePm` ("Late PM"),
  or `[]` when `today` is stale or has no notes. Older summaries with no
  `notes` field give `[]`.
- The Home row preview becomes `happened · notes · section`.
- The History header status becomes `Entered 12:50 PM · Absent AM`.

## Errors and edge cases

- If a schedule has only one PM field (legacy or hand-edited),
  `hasPmSession` is false, so it is treated as a single session.
- If the section has no schedule, nothing changes.
- If the schedule is edited mid-day, notes already written stay. This is the
  same as how an `L` mark already freezes.
- A tap exactly at the split (12:30) is PM.
- A tap-out before the split is the AM departure. The existing never-move-
  backwards rule keeps the latest morning tap-out.

## Known limitations

- AM In shows the latest morning tap-in. A learner who taps out at 12:05 and
  back in before the 12:30 split shows that lunch tap as AM In. This is
  display only, a keep-latest rule.
- PM In shows the latest afternoon tap-in, while Late PM is judged on the
  earliest. So "PM In 01:15 PM" can appear with no Late PM badge.
- Office-entered scans (`source: 'staff'`) and voided scans affect the parent
  app's notes but not the `student_attendance` notes. That's the existing
  behavior: staff scans never touched `student_attendance`.
- A morning tap-out with no morning tap-in still counts the day's first
  tap-in as afternoon, so a learner gets "Absent AM".
- If a schedule is edited mid-day, notes already written stay. The parent app
  recomputes on the next tap.
- The delayed-AM re-judge keys on the mark being P. If staff hand-set P on a
  learner who still has "Absent AM", a delayed late morning tap can still flip
  it to L. The user accepted this.
- If two delayed morning taps sync in the wrong order (08:30, then 07:50), the
  first one processed decides the mark. This is the same "first processed
  wins" behavior as the first-of-day rule.

## Testing

- `shared/scheduleSessions.test.js`: split midpoint, `sessionOf` boundaries,
  every `sessionNotes` case, malformed or half-PM schedules.
- `src/lib/schedules.test.js`: every `validateSchedule` rule.
- `src/lib/attendance.test.js`: the PM-details helper.
- `functions/src/lib/recomputeSummary.test.js`: `notes` with and without a
  PM schedule, and voided events ignored.
- `functions/test/emulator/scanAttendance.test.js` (emulator):
  - an AM tap-in on a split schedule still marks P/L
  - a PM tap-in goes to `pmTimeIn` and leaves `timeIn` untouched
  - Late PM leaves the mark P
  - first tap at 12:50 gives P plus `absentAm`
  - a delayed AM tap clears `absentAm`, re-marks a PM-first `P` as `L` when
    it is after the AM time in, and leaves a staff `E` alone
  - a delayed on-time PM tap clears a stale `latePm`
  - a schedule without PM is unchanged
- `parent/src/lib/format.test.js`: `todayNotes`.

## Rollout

Cloud Functions, SIMS hosting and the parent app hosting each deploy.
Functions should go first so records carry the new fields before the pages
read them. Every reader also treats missing fields as "no PM data", so any
order is safe.

The coordinator rollout hold still applies:
- Functions deploy by name only: `functions:onScanEventCreated`. Never use a
  bare `--only functions`. Check first that the trigger's import graph has
  no held coordinator code.
- SIMS hosting deploys from the release tree, not the root build. See
  `docs/audits/deployments/` for the current procedure.

- Admins should not tick the PM checkbox on a schedule until the new
  `onScanEventCreated` is live. Older functions keep putting PM taps in
  `timeIn`.
- The SIMS release tree (base 26a6ed7) uses `useCollectionResource`, not
  `useStaffCollectionResource`, which belongs to the held coordinator
  rollout. So the SIMS changes are a hand port into the release tree, not a
  clean `git apply`.

Deploying is a separate step that needs the user's go-ahead.
