# SF2 download from the Parent App (2026-10-22)

Spec: `docs/superpowers/specs/2026-10-22-parent-sf2-export-design.md`
Plan: `docs/superpowers/plans/2026-10-22-parent-sf2-export.md`

## What ships

- **Functions:** `exportSchoolSf2Fn` (512 MiB, 60 s, concurrency 5) and the `exceljs` dependency. Deploy by name; `scripts/syncShared.mjs` runs as the functions predeploy step and copies `shared/sf2/` (template included) into `functions/shared/`.
- **Functions behaviour:** the export uses the same scope rule as the attendance roster (the section's adviser, administrators, coordinators and Curriculum Advisers of the section's grade, current school year only) and the same saved-grade rule for days that carry a grade: a grade that is not an integer from 7 to 12 fails with "Attendance record requires administrator repair.", and a grade the reviewer's scope does not cover is refused with "The saved attendance grade is outside your scope." Live kiosk days carry no grade and take the section's grade. Unlike the roster, the export does not require a day's `schoolYear` and `date` fields to match, and it ignores a day document that names another section (the roster fails on it). `exportSchoolSf2Fn` loads ExcelJS on first use, so other callables' cold starts are unaffected.
- **Parent App:** the Download SF2 button and month sheet on the Class tab.
- **SIMS:** nothing is required now. `src/lib/sf2.js` and `src/lib/sf2Template.js` now wrap `shared/sf2/`; they ride along with SIMS's next release, and live SIMS keeps its current files until then, which are unaffected. Because SIMS's wrapper now imports the shared builder and the template from `shared/sf2/`, the next SIMS release overlay must carry all of `shared/sf2/` (including the binary `sf2-template.xlsx`), `src/lib/sf2.js`, `src/lib/sf2Template.js` and `src/pages/AttendanceSummaryPage.jsx`. The Parent feature does not depend on them.

## Order

Deploying needs the user's explicit approval in chat.

1. Functions (the callable must exist before the Parent App calls it). Deploy only this function, by name, from merged `master`. Never run a bare `--only functions` from `master`: `master` still holds the coordinator rollout's `scanAttendance` and `sessionAttendance` code, which must not reach production as running functions (see `docs/releases/2026-10-18-school-family/README.md`).

   **Why the root `firebase.json` is acceptable, and what it does not change.**
   - The 2026-10-18 README says not to deploy the root `firebase.json` for *that* release, which publishes rules, indexes, hosting and many functions, and so deploys from a prepared tree with `firebase.school-family-release.json`. This deploy publishes one function. With `--only functions:exportSchoolSf2Fn` the CLI deploys that endpoint and nothing else, so no rules, indexes, hosting or other function is touched. That matches the by-name deploys from `master` on 2026-10-13 and 2026-10-17 (`docs/audits/deployments/2026-10-13-reissue-slip-functions/README.md`, `docs/audits/deployments/2026-10-17-deped-relationship-change/README.md`).
   - The request path imports none of the held handlers. `functions/src/handlers/sf2Export.js` imports `node:fs`, `functions/src/errors.js`, `functions/src/callable.js`, `functions/src/handlers/schoolAccess.js`, `shared/schoolAccess.js`, `shared/dates.js` and `shared/sf2/*`. `exceljs` is reached through `shared/sf2/buildSf2Workbook.js`, and the pure `shared/sessionAttendance.js` comes in through `shared/sf2/sf2Template.js`. Through `callable.js` and `handlers/schoolAccess.js` it also reaches `shared/staffRoles.js`, `functions/src/lib/rateLimit.js` and `functions/src/lib/legacyAdvisers.js`.
   - The uploaded package is still the whole `functions/` directory, and the new function's cold start loads `functions/index.js`, which statically imports `src/handlers/scanEvent.js` (and through it `scanAttendance.js`) and `src/handlers/sessionAttendance.js`. So the held files are present in the package and loaded with `index.js`, although no SF2 request runs them. They are not deployed as endpoints, because only the named function is deployed: `onScanEventCreated`, the roster callables and the rest keep running their live revisions. Never add their names to `--only` from `master` (`docs/audits/deployments/2026-10-15-pm-session-functions/README.md` shows what the held `scanAttendance.js` does to live kiosk taps).
   - A deployer who does not want held source in the uploaded package can deploy from a prepared tree instead, as 2026-10-18 did: `docs/releases/2026-10-18-school-family/prepareBackend.mjs` builds a Functions tree that keeps the live `scanAttendance.js` and adapts `sessionAttendance.js`. Follow the Reproduce and Publish sections of that README (its default output directory is the one `firebase.school-family-release.json` points at) and deploy with `--config firebase.school-family-release.json --project bnhs-sims --only functions:exportSchoolSf2Fn`. Confirm first that the prepared tree contains `src/handlers/sf2Export.js`, `shared/sf2/sf2-template.xlsx` and `exceljs` in its `package.json`.

   **Before deploying, diff what the new function will run against what is live.** It runs `master`'s copies of `functions/src/callable.js`, `functions/src/handlers/schoolAccess.js` and `shared/schoolAccess.js`, which may differ from the copies the other live functions run. Download the live source of a function that uses them (for example `getSchoolContextFn`) read-only and compare those three files with `master`, as the 2026-10-17 release did (`docs/audits/deployments/2026-10-17-deped-relationship-change/README.md`; the 2026-10-15 record names the download call). Review any difference you did not expect before going on.

   **`PORTAL_URL`.** A non-interactive deploy needs it: `functions/index.js` declares it with a default, but Firebase still requires an explicit value (see the Publish section of the 2026-10-18 README). The gitignored `functions/.env` should hold the single line `PORTAL_URL=https://bnhs-parent.web.app`; verify the value against the current Parent deployment. The production env files live only in the main checkout, so a deploy from a worktree has to write that file first and delete it afterwards, as the 2026-10-17 record did. Do not copy any other value into it, and never print or commit it.

   Then deploy, with both settings this machine needs for function discovery:

   ```powershell
   $env:NODE_OPTIONS = '--dns-result-order=ipv4first'
   $env:FUNCTIONS_DISCOVERY_TIMEOUT = '120'
   npx firebase deploy --project bnhs-sims --non-interactive --only functions:exportSchoolSf2Fn
   ```
2. Parent App, with `npm run deploy:parent` from a fresh `origin/master` (see `AGENTS.md`).

## Checks

- After deploying Functions, confirm the deployed source contains `functions/shared/sf2/sf2-template.xlsx` (the predeploy step copies it there). Earlier releases downloaded the published source archive read-only through the Cloud Functions v2 `generateDownloadUrl` call; see `docs/audits/deployments/2026-10-15-pm-session-functions/README.md`.
- As a real class adviser, download a month and compare it with the SIMS export for the same section: same learners, marks and totals.
- Record one deployment under `docs/audits/deployments/` covering both: for Functions the source revision, the exact command and the result; for the Parent App the source revision and the byte check of the live Parent assets.
