# Adviser student history and attendance flagging (PR #88)

Released 2026-10-21 from master `cb9e0db988eff5721e7c59eba9fc63413c7199a8` (merge of PR #88).

## Functions (by name, 2 new callables)

- `getSchoolLearnerHistoryFn` and `getSchoolLearnerAttendanceFn`, asia-southeast1, Node.js 22. Production
  went from 64 to 66 listed functions. No existing function was redeployed.
- Prepared with `docs/releases/2026-10-18-school-family/prepareBackend.mjs` run from a `git archive` export of
  `cb9e0db` (output `backend/`), so the live scan source and the `adaptSessionAttendance` gradeLevel fallback are
  preserved. Root `functions/` was not deployed: its `validAttendance` requires `attendance.gradeLevel`, which
  live scans do not write.
- Before publishing, both callables and `setSessionAbsence` were run against the prepared tree with an attendance
  document that has no `gradeLevel` (2 emulator tests passed).
- `backend/functions/.env` carried the public `PORTAL_URL=https://bnhs-parent.web.app` for the deploy and was removed.
- Command: `firebase deploy --config firebase.functions-release.json --project bnhs-sims --only
  functions:getSchoolLearnerHistoryFn,functions:getSchoolLearnerAttendanceFn` with
  `NODE_OPTIONS=--dns-result-order=ipv4first FUNCTIONS_DISCOVERY_TIMEOUT=120`.

## Parent hosting

- Built from the same export with `docs/releases/2026-10-21-advisory-toggle/build.mjs parent <main parent dir>`;
  `index.html` and `public/manifest.webmanifest` LF-normalised. The worktree HEAD was `cb9e0db`, so Settings > About
  shows that commit.
- Main script `/assets/index-B7teBbN2.js`, 54 files. The reCAPTCHA site key sits in `firebase-BN6t3e8w.js`, the same
  chunk (same hash) as before the release; no emulator strings in the bundle.
- Baseline before publishing: live main script `/assets/index-C8vTYG8X.js` (release 2026-10-21T00:55:14Z, source
  `99371bb`); no newer release existed.
- Release `sites/bnhs-parent/releases/1792588787160000`, version `3a2ec84399ae7ae2`, 2026-10-21T13:19:47Z, message
  "Adviser learner history and flagging in Class tab (PR 88, master cb9e0db)".
- `parent-hosting-verification.json`: all 54 live files SHA-256 match the build.
- Preserves the PR #74 UI (theme only in Settings > Appearance, icon-only Sessions button).
- Command: `firebase deploy --config firebase.parent-hosting-release.json --project bnhs-sims --only hosting:parent`.

## Not covered

- No signed-in check of the live site (App Check rejects the built-in browser); the feature was checked against
  local emulators before the release.
- No SIMS hosting change.
