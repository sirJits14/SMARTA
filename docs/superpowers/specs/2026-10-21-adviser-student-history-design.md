# Adviser student history with attendance flagging (Parent app)

Date: 2026-10-21

## Goal

A class adviser using the Parent app in school mode can tap a student in the
Class tab and see the same history a Parent/Guardian sees for that learner
(gate scan bubbles grouped by day, plus the Sessions calendar with AM/PM
status). From that screen the adviser can flag or restore today's AM/PM
attendance.

## Decisions (agreed with the user)

- History content: same as the parent view. No extra analytics.
- Flagging: today only. Past days are view-only. This matches the existing
  `canCorrectSession` rule, so no permission change.
- Entry point: tapping a student row in the Class tab.
- Approach: a new adviser-only callable feeding the existing parent screens.
  Advisers do not get a guardian link (adviser links are inert on purpose).

## Existing pieces reused

- Auth: `loadSchoolActor`, `canReviewSection`, `canCorrectSession`
  (`functions/src/handlers/schoolAccess.js`, `shared/schoolAccess.js`),
  `schoolCall` wrapper in `functions/index.js`.
- Flagging: `setSessionAbsenceFn` / `setSessionAbsence`
  (`functions/src/handlers/sessionAttendance.js`) with revision checks,
  `operationId` idempotency, audit log and delayed parent notification.
  `FlagSheet.jsx`, `FLAG_REASONS`, `RESTORE_REASONS`, `correctionInput`.
- History UI: `historyThread` (`parent/src/lib/thread.js`), `Bubble`,
  `DayDivider`, `SessionSheet`, `FamilySessionDetails`, `SessionRows`.
- Attendance projection: logic behind `getFamilyAttendance`.

## Design

### Backend

1. New callable `getSchoolLearnerHistoryFn({ sectionId, studentId, cursor })`
   (`schoolCall`). Steps: load actor, `canReviewSection(actor, section)`,
   confirm the student is enrolled in that section for the current school
   year, then return:
   - `learner`: `{ displayName, sectionLabel, today, recent }` from
     `learners/{studentId}`.
   - `events`: page of 30 from `learners/{studentId}/events` ordered by
     `effectiveAt` desc, same field set as the guardian listener returns,
     plus `nextCursor`.
2. New callable `getSchoolLearnerAttendanceFn({ sectionId, studentId, date })`
   with the same authorization, returning the same shape as
   `getFamilyAttendance` (AM/PM rows with status, reason, actor, gate times)
   plus `canCorrect` (from `canCorrectSession` for that date) and `revision`
   so the client can call `setSessionAbsenceFn` without an extra fetch.
3. Extract the shared attendance projection from `getFamilyAttendance` into a
   helper used by both the family and the adviser callables, so the two views
   cannot drift.
4. No Firestore rule changes. Advisers still have no direct read on
   `learners`, `student_attendance` or `scan_events`.

### Parent app

1. Route `/school/learner/:sectionId/:studentId` in
   `parent/src/lib/router.js`, rendered by a new screen
   `parent/src/screens/school/LearnerHistory.jsx`.
2. The screen mirrors `History.jsx` but loads from the callable (paginated
   "load older") instead of Firestore listeners, and scan bubbles are not
   tappable to the report flow (reports are a guardian feature).
3. Calendar icon opens the existing `SessionSheet`; the date detail uses the
   adviser attendance callable. Today's AM/PM rows show Flag (or Restore when
   an override is active) using `FlagSheet` and `setSessionAbsenceFn`. Past
   dates render read-only (`canCorrect` false).
4. `ClassTab.jsx`: tapping a row navigates to the history. Existing
   multi-select flagging moves to a leading checkbox (or long-press) so the
   two interactions do not collide; the flag/undo toast behavior is unchanged.
5. Access: the route redirects to the Class tab if the user lacks school
   access (same guard as `School.jsx`).

## Error handling

- Student not enrolled in the section, or section not reviewable: callable
  returns not-found / permission-denied; screen shows "Not in your class"
  with a back action.
- Revision conflict on flag: reuse the existing conflict handling in the
  Class tab (refetch and retry prompt).
- Network failure: reuse the existing inline error and retry pattern.

## Testing

- Emulator tests for both callables: own-section adviser allowed; adviser of
  another section denied; student not enrolled denied; admin and grade
  reviewer allowed; pagination cursor; `canCorrect` true only for today for
  an adviser.
- Test that the extracted projection yields identical output for the family
  and adviser callables.
- Parent unit tests: route guard, row tap navigates while checkbox selects,
  past dates hide flag actions, flag then restore round trip updates the row.
- Manual check in the emulator browser per project notes.

## Deployment

Parent app via `npm run deploy:parent` (fresh build of current `origin/master`,
preserving PR #74 UI). The two new callables need a functions deploy first.
No SIMS (root app) hosting change.

## Out of scope

- Past-day corrections or correction requests.
- Adviser-side parent report/dispute handling.
- Extra analytics (absence/late counts).
- Curriculum-adviser-specific entry points (they are authorized by
  `canReviewSection` but have no Class tab today).
