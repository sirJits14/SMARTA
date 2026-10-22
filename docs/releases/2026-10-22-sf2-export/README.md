# SF2 download from the Parent App (2026-10-22)

Spec: `docs/superpowers/specs/2026-10-22-parent-sf2-export-design.md`
Plan: `docs/superpowers/plans/2026-10-22-parent-sf2-export.md`

## What ships

- **Functions:** `exportSchoolSf2Fn` (512 MiB, 60 s) and the `exceljs` dependency. Deploy by name; `scripts/syncShared.mjs` runs as the functions predeploy step and copies `shared/sf2/` (template included) into `functions/shared/`.
- **Functions behaviour:** the export applies the same rules as the attendance roster, including that each day keeps the grade it was saved under. A reviewer whose grade scope does not cover a day's saved grade is refused with "The saved attendance grade is outside your scope." `exportSchoolSf2Fn` loads ExcelJS on first use, so other callables' cold starts are unaffected.
- **Parent App:** the Download SF2 button and month sheet on the Class tab.
- **SIMS:** nothing is required now. `src/lib/sf2.js` and `src/lib/sf2Template.js` now wrap `shared/sf2/`; they ride along with SIMS's next release, and live SIMS keeps its current files until then, which are unaffected. Because SIMS's wrapper now imports the shared builder and the template from `shared/sf2/`, the next SIMS release overlay must carry all of `shared/sf2/` (including the binary `sf2-template.xlsx`), `src/lib/sf2.js`, `src/lib/sf2Template.js` and `src/pages/AttendanceSummaryPage.jsx`. The Parent feature does not depend on them.

## Order

1. Functions (the callable must exist before the Parent App calls it).
2. Parent App, with `npm run deploy:parent` from a fresh `origin/master` (see `AGENTS.md`).

## Checks

- Confirm the deployed function's source contains `shared/sf2/sf2-template.xlsx`.
- As a real class adviser, download a month and compare it with the SIMS export for the same section: same learners, marks and totals.
- Record the deployment under `docs/audits/deployments/` (source revision, byte check of the live Parent assets).
