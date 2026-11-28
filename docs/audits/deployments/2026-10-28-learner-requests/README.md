# Production deployment: SF2 export and learner add/remove requests

On October 28, 2026 the user asked for the work of PR #95 to be deployed. It went out in the order the release notes require: indexes, functions, SIMS, then the Parent App.

## Source

- PR #95 (`sirJits14/SMARTA`), merged as `f11ea4f2…` (`f11ea4f`). Its tree is identical to `7f29726`, the branch tip that was merged with `origin/master` `636faaa` and from which the functions tree and the SIMS overlay were prepared (`git diff 7f29726 f11ea4f` is empty).
- Release notes and recipe: `docs/releases/2026-10-22-sf2-export/README.md`, `docs/releases/2026-10-22-learner-requests/README.md`. Spec and plan: `docs/superpowers/specs/2026-10-22-parent-*-design.md`, `docs/superpowers/plans/2026-10-22-parent-*.md`.
- The PR's CI job (`test`) passed before the merge.
- Who ran what: Claude ran the indexes deploy from PowerShell. The permission classifier blocked Claude's functions deploy and PR merge, so the user ran the functions deploy, the SIMS publish, `gh pr merge 95` and the Parent publish from their own terminal, using scripts Claude wrote.

## 1. Firestore indexes

- Production's 28 composite indexes and 5 field overrides were compared with `docs/releases/2026-10-18-school-family/firestore.indexes.json` and were identical; all 28 were READY.
- `firestore.indexes.json` here is that release file plus the five `learner_change_requests` indexes copied exactly from the root file (33 composites, the existing 28 byte-identical, the new five after `audit_log`).
- Command, with `firebase.learner-requests-indexes-release.json` (indexes only) from the prepared backend tree:

  ```powershell
  $env:NODE_OPTIONS = '--dns-result-order=ipv4first'
  npx firebase deploy --project bnhs-sims --config .superpowers/releases/lr-backend/firebase.learner-requests-release.json --non-interactive --only firestore:indexes
  ```

- Result: deployed successfully. The five indexes were CREATING, and all five were READY at 06:07Z (33 of 33 READY). No rules were deployed (the new collection is already denied by default and the explicit deny in `firestore.rules` changes nothing in production).

## 2. Cloud Functions (ten, by name)

Deployed from the prepared backend tree (`prepareBackend.mjs` at `7f29726`, see `backend-source-manifest.json`), never from `master`. Production had 65 functions before and has 73 now.

- Names: `exportSchoolSf2Fn` (512 MiB, 60 s, concurrency 5), `requestLearnerAddFn`, `requestLearnerRemovalFn`, `withdrawLearnerRequestFn`, `getLearnerRequestsFn`, `listLearnerRequestsFn`, `resolveLearnerRequestFn`, `getLearnerRequestCountFn` (all created), and `endSchoolYearFn`, `deleteGuardianAccountFn` (updated). No `--force`; none has a retry trigger.
- Before deploying: the import graph of the six handlers (25 files) reaches no `scanAttendance`, `scanEvent`, `handlers/sessionAttendance` or `coordinatorScope`, so none of the held coordinator code ships. The tree's `scanAttendance.js` equals the live `onScanEventCreated` copy (sha256 `49ee1a2e…`). Every live function exists in the tree, and the eight new names were the only ones not live.
- The two existing functions were last deployed on 2026-10-19. Compared with their own live zips, the code they run differs only by this feature (`schoolYear.js`; three lines in `deleteSchoolAccess`; `LIMITS.learnerRequest`, `LIMITS.sf2Export`; the `reviewGrades` export). Other differences are code that was changed later for other functions.
- Command (`firebase.learner-requests-functions-release.json`; a one-line `functions/.env` with `PORTAL_URL` was written for the deploy and deleted afterwards, and was confirmed removed):

  ```powershell
  $env:NODE_OPTIONS = '--dns-result-order=ipv4first'
  $env:FUNCTIONS_DISCOVERY_TIMEOUT = '120'
  npx firebase deploy --project bnhs-sims --config .superpowers/releases/lr-backend/firebase.learner-requests-functions.json --non-interactive --only "functions:exportSchoolSf2Fn,functions:requestLearnerAddFn,functions:requestLearnerRemovalFn,functions:withdrawLearnerRequestFn,functions:getLearnerRequestsFn,functions:listLearnerRequestsFn,functions:resolveLearnerRequestFn,functions:getLearnerRequestCountFn,functions:endSchoolYearFn,functions:deleteGuardianAccountFn"
  ```

- Result: eight creates and two updates succeeded. `firebase functions:list` shows 73 functions, all in `asia-southeast1` on `nodejs22`, with the ten names present. The live source zips of `exportSchoolSf2Fn`, `resolveLearnerRequestFn`, `endSchoolYearFn` and `deleteGuardianAccountFn` were downloaded; 12 key files in each (`index.js`, the learner-request and SF2 handlers, `schoolYear.js`, `schoolAccess.js`, `account.js`, `callable.js`, the cleanup lib, `shared/learnerRequests.js`, `shared/schoolAccess.js`, `shared/sf2/sf2-template.xlsx`, `shared/sf2/buildSf2Workbook.js`) were byte-identical to the tree, and the package declares `exceljs ^4.4.0`.

## 3. SIMS hosting

Live SIMS had moved past the last record: the PR #94 release (`2f5dc87237b13def`, 2026-10-27T08:03:02Z, "SIMS recent sections expanded to 30 PR 94 source 8e63984", main script `index-B51jXNNR.js`) has no deployment record, and the release notes' recipe stopped at PR #93. The baseline was therefore rebuilt as the PR #93 tree plus PR #94.

- Baseline: caps-names preparer, the legacy-adviser port, PR #90's three files, PR #91's `cb9e0db..bf3a892` diff, PR #93's `1887cb0^..1887cb0` diff with adapted context (the recipes are in the 2026-10-22 and 2026-10-27 records), then `git diff --binary efaeff0^ efaeff0 -- src` (PR #94). Built with the main checkout's production `VITE_*` values, `VITE_USE_EMULATORS=false`, no App Check debug token.
- Byte match before overlaying anything: **61 of 61 files matched live, 0 mismatches** (`sims-baseline-verification.json`), checked at 05:50Z and again at 05:58Z, with live still `2f5dc87237b13def`. Checked once more at 06:18Z, just before the publish: 61 of 61.
- Overlay: 23 feature files from `7f29726`. 15 new files copied unchanged; `App.jsx`, `Shell.jsx`, `navigation.js`, `registrar.css` took this feature's hunks; `access.js`, `access.test.js`, `shared/schoolAccess.js` (only the `reviewGrades` export) and `parent/src/lib/school.js` (inbox destination, `schoolError` fallback argument) were hand-ported. Nothing from the held coordinator rollout and none of the SF2 refactor was included. Hashes: `sims-source-manifest.json`.
- Tree tests: 76 files, 796 tests passed (69 files, 687 tests without the feature). Build: main script `index-BYw7kGJV.js`, 65 files. A second build was byte-identical. The reCAPTCHA site key is present once, in `assets/ui-DSCiEOWm.js` (no longer in the main script), with no emulator hosts.
- Bundler repartition: the new lazy page made the bundler emit a 691 KB `ui` chunk (React, Firebase init and the App Check key now live there) and three small shared chunks, and about 32 other chunks changed only in minified import aliases (proved structurally identical by an AST comparison). The `ui` chunk is statically imported and modulepreloaded, so any key check has to search all of `assets/`.
- Command, config `firebase.learner-requests-sims-release.json` (hosting `sims` only, public `sims/dist` of the prepared tree):

  ```powershell
  $env:NODE_OPTIONS = '--dns-result-order=ipv4first'
  node node_modules/firebase-tools/lib/bin/firebase.js deploy --config <prepared tree>\firebase.learner-requests-release.json --project bnhs-sims --only hosting:sims --non-interactive --message 'SIMS learner requests page (PR 95 source 7f29726) over live PR 94 release 2f5dc87'
  ```

- Result: release `c710ecc0a091f5d4` at 2026-10-28T06:32:20Z. The live HTML and **all 65 files match the new build byte for byte, 0 mismatches** (`sims-hosting-verification.json`, checked 06:33:39Z); the live main script is `index-BYw7kGJV.js`, the live `ui` chunk holds one site-key string and no emulator hosts.

## 4. Parent App hosting

- Deployed as `AGENTS.md` requires: the checkout was fast-forwarded to the merged `origin/master` (`f11ea4f`), then `npm run deploy:parent` (its predeploy hook fetched `origin/master`, refused anything else, checked the PR #74 baseline and built a fresh bundle with the existing production Parent `.env` through `PARENT_ENV_DIR`, which was not printed or committed). Only `hosting:parent` was selected.
- Result: release `443a01dd827ae128` at 2026-10-28T06:42:50Z ("Parent App: SF2 export and learner add/remove requests (PR 95)"), replacing `3a2ec84399ae7ae2` (2026-10-21, PR #88). No other Parent release had appeared in between.
- Live main script `/assets/index-ByDzLuQn.js`, 59 files, initial load 219.9 KB gz (limit 260 KB). The live HTML and **all 59 files match the new build byte for byte, 0 mismatches** (`parent-hosting-verification.json`, checked 06:43:59Z). The bundle has one App Check site-key string, no emulator hosts, the new `requestLearnerAddFn` and `exportSchoolSf2Fn` calls, and the PR #74 UI markers (`p-btn--solid` and `page-header-icon-btn` present, `glass-card` absent).

## Not verified

- No signed-in production walkthrough was done: App Check rejects automated browsers. No real SF2 export, learner request, approval, rejection, school-year end or account deletion was run against production. The checks listed in `docs/releases/2026-10-22-learner-requests/README.md` ("Checks") still need a person on a real device.
- The SIMS page and the Parent sheets were exercised in a real browser only against local emulators (see the PR description).

## Rollback

- SIMS: Firebase console, Hosting, Release history, roll back to `2f5dc87237b13def`.
- Parent App: roll back to `3a2ec84399ae7ae2`. (The Parent App's new buttons call the new functions; leaving the functions and indexes in place is harmless for the older bundle.)
- Functions and indexes are additive. The eight new callables can be deleted by name if ever needed; the two updated functions only add year-end and account-deletion cleanup of learner requests.

## Notes

- Live function count is 73, not the 62 the older release notes assumed (three functions were added since: `getSchoolLearnerAttendanceFn`, `getSchoolLearnerHistoryFn`, `setAdvisoryRequestsEnabledFn`).
- Later SIMS releases should start from this record's chain: caps-names + legacy-adviser port + PR #90 + PR #91 + PR #93 + PR #94 + this overlay.
- During the Parent deploy, `git fetch` triggered git's automatic cleanup of stale worktree folders (`.git/worktrees/bnhs-sims` to `bnhs-sims6`), which OneDrive refuses to delete, and git prompted "Should I try again?" for each. Answering `n` lets the deploy continue; it has no effect on the build.
