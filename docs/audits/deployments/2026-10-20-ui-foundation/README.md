# SIMS UI foundation — production release

Date: 2026-10-20. Source: `master` at `161b5a7` (merge of PR #66). Project: `bnhs-sims`.
Preparer: `docs/releases/2026-10-20-ui-foundation/prepare.mjs`. It wraps the bulk advisory slip release, so the held
coordinator rollout stays out of SIMS.

SIMS hosting only. No Functions, Firestore rules or Parent App changes. The Parents App shares `shared/theme/theme.css`
but was not rebuilt or deployed; it picks up the new palette at its next release.

## Overlay (`release-source/`)

All 19 files are copied unchanged from PR #66 (`dd8facf`). Each one was identical in the bulk-slips tree and on the PR's
base (`00eea6d`), so no hand port was needed:

- `index.html`, `public/manifest.webmanifest` (theme colors)
- `shared/theme/theme.css` and its `boot` and `contrast` tests
- `src/components/`: `AccountMenu.jsx` (new), `ChangePassword.jsx`, `IdCardsPrintable.jsx`, `Login.jsx`, `NavIcon.jsx`,
  `Shell.jsx`, `ui.jsx`
- `src/registrar.css`, `src/enrollment.css`, `src/styles.js`
- `src/pages/AccountsPage.jsx`, `guardians/EndSchoolYearCard.jsx`, `guardians/school/AssignmentsView.jsx`,
  `guardians/school/PendingView.jsx` (danger buttons)

The preparer also removes `src/components/ThemeControl.jsx` and `ThemeMenuButton.jsx`, which the account menu replaces.
It sets the tree's `parent/index.html` dark theme color to `#0B0F19`, because the shared boot test reads that page too.
The Parents App is not built from the tree.

## Baseline check (before publishing)

The rebuilt bulk-slips tree matched the live site 61/61 (`sims-baseline-verification.json`), main script
`index-CMhPOmry.js`. It was checked again just before deploying, and still matched 61/61.

## Release testing

- **Release tree:** 620/620 unit tests (63 files).
- **Build comparison:** compared with the baseline build, with hashed file names normalised in both names and contents,
  the differences are: the main `index` chunk and CSS, `EnrollPage.css`, `index.html` and `manifest.webmanifest`. Two
  assets were removed: the tagline wordmarks the old Login used. The page chunks that import `ui.jsx` or `styles.js`
  also differ, but only in import aliases: `AuditTab`, `SectionPicker`, `StudentForm` and `ReportsTab` were compared
  with short identifiers normalised and differ only in the alias names.

## Published

| What | How | Result |
| --- | --- | --- |
| SIMS hosting | `firebase deploy --project bnhs-sims --config firebase.ui-foundation-release.json --only hosting:sims` (run by the project owner from PowerShell) | 59/59 files match (`sims-hosting-verification.json`). Main script `assets/index-B2pkp4gR.js`. |

The deploy uploaded 37 new files. The live sign-in page was checked visually afterwards.

## Rollback

Redeploy the bulk-slips release tree (`docs/releases/2026-10-20-bulk-slips/prepare.mjs`, build `sims/`), or roll back to
the previous release in the Hosting console. Its main script is `index-CMhPOmry.js`.
