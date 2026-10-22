# SF2 download from the Parent App (2026-10-22)

Spec: `docs/superpowers/specs/2026-10-22-parent-sf2-export-design.md`
Plan: `docs/superpowers/plans/2026-10-22-parent-sf2-export.md`

## What ships

- **Functions:** `exportSchoolSf2Fn` (512 MiB, 60 s, concurrency 5) and the `exceljs` dependency. Deploy by name; `scripts/syncShared.mjs` runs as the functions predeploy step and copies `shared/sf2/` (template included) into `functions/shared/`.
- **Functions behaviour:** the export uses the same scope rule as the attendance roster (the section's adviser, administrators, coordinators and Curriculum Advisers of the section's grade, current school year only) and the same saved-grade rule for days that carry a grade: a grade that is not an integer from 7 to 12 fails with "Attendance record requires administrator repair.", and a grade the reviewer's scope does not cover is refused with "The saved attendance grade is outside your scope." Live kiosk days carry no grade and take the section's grade. Unlike the roster, the export does not require a day's `schoolYear` and `date` fields to match. `exportSchoolSf2Fn` loads ExcelJS on first use, so other callables' cold starts are unaffected.
- **Parent App:** the Download SF2 button and month sheet on the Class tab.
- **SIMS:** nothing is required now. `src/lib/sf2.js` and `src/lib/sf2Template.js` now wrap `shared/sf2/`; they ride along with SIMS's next release, and live SIMS keeps its current files until then, which are unaffected. Because SIMS's wrapper now imports the shared builder and the template from `shared/sf2/`, the next SIMS release overlay must carry all of `shared/sf2/` (including the binary `sf2-template.xlsx`), `src/lib/sf2.js`, `src/lib/sf2Template.js` and `src/pages/AttendanceSummaryPage.jsx`. The Parent feature does not depend on them.

## Order

Deploying needs the user's explicit approval in chat.

1. Functions (the callable must exist before the Parent App calls it). Deploy only this function, by name, from merged `master`, with both settings this machine needs for function discovery:

   ```powershell
   $env:NODE_OPTIONS = '--dns-result-order=ipv4first'
   $env:FUNCTIONS_DISCOVERY_TIMEOUT = '120'
   firebase deploy --only functions:exportSchoolSf2Fn
   ```

   Never run a bare `--only functions` from `master`: `master` still holds the coordinator rollout's `scanAttendance` and `sessionAttendance` code, which must not reach production (see `docs/releases/2026-10-18-school-family/README.md`). A by-name deploy is safe here because `functions/src/handlers/sf2Export.js` imports only `functions/src/errors.js`, `functions/src/callable.js`, `functions/src/handlers/schoolAccess.js`, `shared/schoolAccess.js`, `shared/dates.js`, `shared/sf2/**` and `exceljs`, and through them `shared/staffRoles.js`, `functions/src/lib/rateLimit.js`, `functions/src/lib/legacyAdvisers.js` and the pure `shared/sessionAttendance.js`. None of the held handlers is among them, and the other functions are not redeployed.
2. Parent App, with `npm run deploy:parent` from a fresh `origin/master` (see `AGENTS.md`).

## Checks

- After deploying Functions, confirm the deployed source contains `functions/shared/sf2/sf2-template.xlsx` (the predeploy step copies it there).
- Record a Functions deployment under `docs/audits/deployments/`, next to the Parent one: source revision, the exact command, and the result.
- As a real class adviser, download a month and compare it with the SIMS export for the same section: same learners, marks and totals.
- Record the deployment under `docs/audits/deployments/` (source revision, byte check of the live Parent assets).
