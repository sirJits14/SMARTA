# SIMS names in capitals — production release

Date: 2026-10-21. Source: PR #86, `master` at `cdec910`. Project: `bnhs-sims`, site `bnhs-sims`.

SIMS hosting only, from the release tree. The coordinator rollout on `master` stays held, so the root build was not
published. No Functions, Firestore rules or Parents App changes.

## What shipped

Every learner and adviser name in SIMS shows in capitals, and so do the names printed on QR activation slips and ID
cards:

- Learner names (`fullName`): Students, Enrollment, Attendance, Dashboard, Section details, ID Cards, the Guardians
  tabs, session review, and the import preview. The SF2 export now has learner names and the adviser cell in capitals.
- Adviser names: the Sections list and details, the section picker, school assignments, coverage and pending
  requests, legacy advisers, and the activity history.
- Printed: QR activation slips and ID cards.
- Student name fields and the section's Adviser name field show capitals as typed.

Names are capitalised only when shown or printed. Stored names, search, sorting and the Parents App are unchanged, and
emails are never capitalised. Not changed: staff account names (Accounts) and guardian names.

## Baseline

The live SIMS main script before this release was `index-D3pdYMEg.js`, published 2026-10-20 21:45 UTC with no message.
It is the Codex "advisory toggle" release (`docs/releases/2026-10-21-advisory-toggle`, PR #80): the Subject Teacher
retirement baseline plus the restored advisory request section in `SchoolAccessTab.jsx`. It had no deployment record.

I rebuilt that preparer's SIMS output and byte-checked it against the live site: 59/59 files matched
(`advisory-toggle-baseline-verification.json`). I did not check that release's Functions or Parents App.

## Release source

`docs/releases/2026-10-21-caps-names/prepare.mjs` wraps the advisory-toggle SIMS preparer and overlays 23 files from
PR #86 (`release-source/`):

- 20 files were identical to the tree's copies of the pre-PR `master` files, so they are copied as they are.
- `SectionsPage.jsx` and `SessionReviewPage.jsx` differ in the tree, so only the PR's hunks were applied to the tree's own
  versions. The changed line counts match the PR (6 and 7).
- `printedNames.test.js` is new.

Output directory: `.superpowers/releases/cn/f`; hosting config `firebase.caps-names-release.json`.

## Build and checks

- Release-tree tests: 627/627 (64 files). The PR's own suite on `master`: 713/713.
- Built with the main checkout's `.env` loaded into the build process only, emulator mode off and the App Check debug
  token removed. The App Check (reCAPTCHA) key is embedded; this was checked before publishing.
- Against the baseline build, with hashed names normalised, only name-related chunks differ: the shared name
  formatter, the pages and tabs that show names, slip and ID card printing, and the CSS. Nothing was added or removed.

## Published

| What | How | Result |
| --- | --- | --- |
| SIMS hosting | `firebase deploy --project bnhs-sims --config firebase.caps-names-release.json --only hosting:sims` (run by the project owner from PowerShell). The Hosting release is dated 2026-10-21 12:37 UTC, with message "SIMS names in capitals (PR 86) over advisory-toggle release". | 59/59 files match (`sims-hosting-verification.json`). Main script `assets/index-tP1xkO1r.js`. |

The live site also has the new `sims-caps` CSS and the capitals formatter, and the App Check key.

## Rollback

Roll back to the previous release in the Hosting console (main script `index-D3pdYMEg.js`).
