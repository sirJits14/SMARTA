# Production deployment: optional PM session (functions)

On October 15, 2026 the user approved releasing the optional PM arrival/departure feature from branch `claude/pm-arrival-departure-option-a5ad52` (PR #31, head `4acf334`) before merge. Spec: `docs/superpowers/specs/2026-10-15-pm-session-schedule-design.md`. Only `onScanEventCreated` was published; no rules, indexes or other functions.

## The branch's import graph held coordinator code

Before deploying, the live source of `onScanEventCreated` (revision `onscaneventcreated-00018-baz`, updated 2026-10-10T14:16Z) was downloaded read-only through the Cloud Functions v2 `generateDownloadUrl` call and compared with `master`:

- `scanEvent.js` and `lib/recomputeSummary.js` matched `master`.
- `handlers/scanAttendance.js` did not. `master`, and so the branch, carries the held coordinator grade-audience logic from `9e571c5`/`66fe883`. It writes `gradeLevel` on `student_attendance`, rejects a tap whose section grade is not 7–12, and rejects `section`/`grade` when an existing attendance doc has another section or no valid `gradeLevel`.

Live SIMS (release tree) and the live trigger both write attendance docs without `gradeLevel`. Deploying the branch as-is would have rejected kiosk taps on any section-day that already had an attendance doc.

## Source

A temporary detached checkout of `4acf334` was used. `scanAttendance-strip-coordinator.patch` was applied to it, removing only the coordinator lines. The deployed `scanAttendance.js` is therefore the live 00018 file plus exactly the PR's PM hunk (`sessionOf`, `pmTimeIn`/`pmTimeOut`, `latePm`/`absentAm`). `scanEvent.js`, `recomputeSummary.js` and `shared/scheduleSessions.js` are the PR's unchanged. `functions/.env` held only the public `PORTAL_URL`.

```bash
NODE_OPTIONS="--dns-result-order=ipv4first" FUNCTIONS_DISCOVERY_TIMEOUT=120 \
  npx firebase deploy --project bnhs-sims --non-interactive \
  --only "functions:onScanEventCreated"
```

## Verified

- Deploy output: `onScanEventCreated(asia-southeast1)` updated on Node.js 22. The new revision is `onscaneventcreated-00019-pol` (2026-10-15T04:17:32Z).
- The published source archive was downloaded again. Its `scanAttendance.js`, `scanEvent.js`, `recomputeSummary.js` and `shared/scheduleSessions.js` match the patched checkout, and `scanAttendance.js` has no `gradeLevel` references.
- Tests on the patched checkout:
  - Functions unit: 149 passed.
  - `shared/scheduleSessions`: 12 passed.
  - Scan emulator suites: 38 passed. The 10 failures are exactly the coordinator grade-scope tests, which fail as expected because that code was removed.
- Not yet checked in production: a real kiosk tap on a split-day Grade 12 section.

## Behaviour now live

On schedules with both `pmTimeIn` and `pmTimeOut`, taps after the lunch midpoint go to `pmTimeIn`/`pmTimeOut` instead of overwriting `timeIn`/`timeOut`. The first tap of the day in the afternoon sets `absentAm`, and a late first afternoon tap-in sets `latePm`. Both are informational and never change the mark. `learners/{id}.today.notes` carries the same notes for the parent app. Schedules without PM times behave exactly as before.

## Follow-up

- While the coordinator hold lasts, any later deploy of `onScanEventCreated` must reapply `scanAttendance-strip-coordinator.patch` (or its equivalent). Merging PR #31 into `master` does not remove the coordinator lines there.
- When the hold lifts, `master`'s `scanAttendance.js` needs no patch, but existing attendance docs without `gradeLevel` must be repaired first (the coordinator rollout's school-record warnings).

## Rollback

In the Cloud console, roll `onScanEventCreated` back to `onscaneventcreated-00018-baz`. PM fields that were already written stay on their docs. The older SIMS and parent pages ignore them.
