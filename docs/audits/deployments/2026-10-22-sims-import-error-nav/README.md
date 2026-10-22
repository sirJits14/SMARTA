# SIMS import error navigation (PR #90)

Released 2026-10-22 09:39:58Z, hosting only (`hosting:sims`). Release `sites/bnhs-sims/releases/1792661998840000`,
version `5b3f90b61f9fd7d7`, message "SIMS import error navigation (PR 90) over live 13:04Z release".
Main script `/assets/index-K3XGc15N.js`, 59 files; all 59 SHA-256 values match the build
(`sims-hosting-verification.json`).

## Change
Import-from-Excel preview: clickable "N errors skipped" link, All/New/Updates/Errors filter chips with counts,
Previous/Next error stepping with row highlight. Files from PR #90 (`d27b213`): `src/pages/ImportStudentsWizard.jsx`
(the tree's copy was identical to master's before the change), `src/lib/importPreview.js`, `src/lib/importPreview.test.js`,
copied CRLF-normalised into the tree.

## Base
- Prepared with `docs/releases/2026-10-21-caps-names/prepare.mjs` (via `subst R:`; the committed
  `firebase.caps-names-release.json` was restored afterwards). A fresh build reproduced the recorded main script
  `index-tP1xkO1r.js`.
- **Live was not that release any more.** An unrecorded release at 2026-10-21T13:04:17Z (version `3994c4b0bee2952f`,
  61 files, main `index-CciXWVOB.js`, published by bnhs.ictservices@gmail.com, no message) differed from caps-names in
  two things only, found by comparing every live file with the build after stripping chunk hashes. Its source is not
  on master or any remote branch:
  1. `src/pages/guardians/LegacyAdvisers.jsx` empty-state text "No old adviser slips to confirm." (was "No legacy adviser links to verify.").
  2. `src/pages/guardians/school/PendingView.jsx`: `legacy = legacyAdviserRows(...).filter(row => !row.assigned)` and `legacyOpen = legacy.length`.
- Both were hand-ported into the tree (plus the matching assertion in `LegacyAdvisers.test.js`) so this release does not
  revert them. With only that port the build reproduced live: main `index-CciXWVOB.js`, every chunk equal.
  Whoever published the 13:04Z release should land that source on master; until then master still says "legacy adviser links to verify".

## Checks before publishing
- Tree tests: 65 files, 635 tests pass.
- Built with the main checkout's `.env` (`VITE_USE_EMULATORS=false`, no App Check debug token). The 40-character `6L…`
  reCAPTCHA key is in the main script; no emulator hosts in the bundle.
- Against live before publishing, only the `StudentsPage` chunk (which holds the wizard) differed.
- Live main script before: `index-CciXWVOB.js`; after: `index-K3XGc15N.js`.

## Command
`firebase deploy --config firebase.import-error-nav-release.json --project bnhs-sims --only hosting:sims --message "..."`
with `NODE_OPTIONS=--dns-result-order=ipv4first`. Config = the root `sims` hosting entry with `public` pointing at the tree's `dist`.

## Not covered
- No signed-in check of the live import preview (App Check rejects the built-in browser); the UI was not exercised in a browser.
- Functions, rules and Parent hosting were not touched.
