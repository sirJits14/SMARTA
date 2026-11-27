# SIMS module restyle — production release

Date: 2026-10-20. Source: `master` at `e6e4861` (merge of PR #68). Project: `bnhs-sims`.
Preparer: `docs/releases/2026-10-20-ui-modules/prepare.mjs`. It wraps the UI foundation release
(`docs/releases/2026-10-20-ui-foundation/prepare.mjs`), so the held coordinator rollout stays out of SIMS.

SIMS hosting only. No Functions, Firestore rules or Parent App changes.

## Overlay (`release-source/`)

PR #68 changed 25 files under `src/`. 16 of them were identical in the release tree and on PR #68's base (`2de1a93`),
so they are copied unchanged from `e6e4861`. The 16 are `App.jsx`, `GradePills.jsx`, `NavIcon.jsx`, `ui.jsx`, the
`sectionControls` test, `enrollment.css`, `registrar.css`, `styles.js`, and the pages `AccountsPage`,
`AnnouncementsPage`, `ImportStudentsWizard`, `SectionDetailModal`, `StudentForm`, `guardians/LinksTab`,
`guardians/PortalSettingsTab` and `idCards/SavedBatchTab`.

The other nine are the release tree's own versions with PR #68's hunks applied. Each one changed by exactly as many
lines as in the PR:

| File | Applied |
| --- | --- |
| `pages/AttendanceSummaryPage.jsx` | By hand: `fontWeight` 700 → 600 (the tree's day cell also colors half-day absences). |
| `pages/AttendanceTakePage.jsx`, `DashboardPage.jsx`, `EnrollPage.jsx`, `SchedulesPage.jsx`, `SectionsPage.jsx`, `SessionReviewPage.jsx`, `StudentsPage.jsx`, `announcements/AnnouncementForm.jsx` | `patch` on the tree file. |

## Baseline check (before publishing)

The rebuilt UI foundation tree matched the live site 59/59 (`sims-baseline-verification.json`), main script
`index-B2pkp4gR.js`.

## Release testing

- **Release tree:** 620/620 unit tests (63 files).
- **Build comparison:** compared with the baseline, with hashed names normalised in names and contents, the real
  changes are PR #68's pages, `GradePills`, and the main `index` chunk and CSS. Other chunks (`browser`, `enrollments`,
  `guardians`, `slipIssue`, `useAsyncAction`, `AuditTab`, `CodesTab`, `ReportsTab`) differ only in bundler import order
  and aliases. They were checked with identifiers normalised; `ReportsTab` uses a three-letter alias the normaliser
  skips, and its imports were compared by eye.

## Published

| What | How | Result |
| --- | --- | --- |
| SIMS hosting | `firebase deploy --project bnhs-sims --config firebase.ui-modules-release.json --only hosting:sims` (run by the project owner from PowerShell) | 59/59 files match (`sims-hosting-verification.json`). Main script `assets/index-DIiDC7eb.js`. |

The deploy uploaded 36 new files. The live sign-in page was checked visually afterwards.

## Rollback

Redeploy the UI foundation release tree, or roll back to the previous release in the Hosting console. Its main script
is `index-B2pkp4gR.js`.

Later SIMS releases should start from `docs/releases/2026-10-20-ui-modules/prepare.mjs`.
