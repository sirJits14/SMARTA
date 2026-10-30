# Production deployment: ID Cards, Recently approved

On October 30, 2026 the user asked for PR #98 (branch `claude/student-approval-qr-printing-04f9fa`) to be deployed. It went out in the order the release notes require: rules, SIMS hosting, then the function. The backfill was dry-run only.

## Source

- PR #98 (`sirJits14/SMARTA`), unmerged at deploy time. The SIMS overlay and the function tree were prepared from branch commit `e2aa92d` (feature commits `3a07ffb` to `6151d29`, started from `24337fa`).
- Release notes and plan: `docs/releases/2026-10-30-id-card-recently-approved/README.md`, `docs/superpowers/plans/2026-10-30-id-card-recently-approved.md`.
- Who ran what: Claude's production deploys were blocked by the permission classifier (the rules deploy was denied, so nothing else was attempted). Claude wrote the scripts under the gitignored `.superpowers/releases/`; the user ran each from their own PowerShell terminal; Claude then verified live, read-only.

## 1. Firestore rules

- Production's ruleset was `7263ffa7-b9a7-4249-bb64-96d0388da0e0` (2026-10-19 13:42Z, the section-adviser-sync release). It is NOT the school-family copy: it holds a `sections` block with `schoolAdviserUid` guards that the school-family file lacks. The first plan would have published that copy and removed the block; this was caught by downloading the live ruleset first.
- Published: the live ruleset plus two lines under `id_card_batch` (a comment and `match /id_card_approved/{studentId} { allow read, delete: if isAdmin(); }`). `firestore.rules` here is that file.
- Command (the config's `rules` path is relative to the config file's folder; the first attempt failed with "Error reading rules file" before publishing anything):

  ```powershell
  $env:NODE_OPTIONS = '--dns-result-order=ipv4first'
  npx firebase deploy --project bnhs-sims --config .superpowers/releases/id-card-approved/firebase.json --non-interactive --only firestore:rules
  ```

- Result: ruleset `bda90c80-27d9-440d-9c47-2c72ae062613`, 2026-10-30T14:26:50Z. Downloaded again: the only difference from the previous live ruleset is those two lines, and it is byte-identical to the published file.

## 2. SIMS hosting

- Live before: release `c710ecc0a091f5d4` (2026-10-28T06:32Z), main script `index-BYw7kGJV.js`, 65 files.
- Baseline rebuilt from the 2026-10-28 record's chain (caps-names + legacy-adviser port + PR #90, #91, #93, #94 + the learner-requests overlay). **65 of 65 files matched live, 0 mismatches** (`sims-baseline-verification.json`), and it matched the 10-28 `sims-hosting-verification.json` 65 of 65. Source hashes equal the 10-28 manifest.
- Overlay: `src/data/idCards.js`, `src/lib/idCardQueue.js`, `src/pages/IDCardsPage.jsx`, new `src/pages/idCards/RecentlyApprovedTab.jsx`, and three test files, from `git diff --binary 24337fa HEAD`. All changed files matched `24337fa` in the tree, so the patch applied cleanly (`sims-source-manifest.json`).
- Tree tests: 77 files, 808 tests passed (796 baseline plus 12 new). Build: main script `index-CH2PMZML.js`, 65 files; a second build was byte-identical. The reCAPTCHA site key appears once, in `assets/ui-DSCiEOWm.js`, byte-identical to live; no emulator hosts.
- Hash-normalised difference from the baseline: three chunks (the ID Cards page, the shared chunk holding `idCards.js` and `idCardQueue.js`, and `SectionsPage`, one minified import alias).
- Command (config `firebase.id-card-approved-sims-release.json`, hosting `sims` only): `node <main>\node_modules\firebase-tools\lib\bin\firebase.js deploy --config <prepared tree>\firebase.id-card-approved-sims-release.json --project bnhs-sims --only hosting:sims --non-interactive --message 'SIMS Recently approved ID cards (PR 98) over live release c710ecc0a091f5d4'`, after a script re-check that live was still `c710ecc0a091f5d4`.
- Result: release `544ea3ffca0ea5be` at 2026-10-30T14:43:42Z. Live HTML and **all 65 files match the new build byte for byte, 0 mismatches** (`sims-hosting-verification.json`, checked 14:48Z); live main script `index-CH2PMZML.js`.

## 3. Cloud Function (one, by name)

- `resolveLearnerRequestFn`, deployed from the prepared backend tree (`prepareBackend.mjs` from the branch at `e2aa92d`), never from `master`. No `--force`. The live function count stays 73.
- Before deploying, against the live source zip: the only code differences were the `approvedCards.js` import and the one `APPROVED_CARDS` write in `learnerRequests.js` (new-learner branch), plus the new `src/lib/approvedCards.js`. Eight files differed only in line endings (tree CRLF, live LF). The handler's import graph (13 files) reaches no `scanAttendance`, `scanEvent`, `handlers/sessionAttendance` or `coordinatorScope`; the tree's `scanAttendance.js` equals the live copy (sha256 `49ee1a2e…`). `backend-source-manifest.json` lists the hashes.
- Command: `deploy-function.ps1` (writes the one-line, non-secret `PORTAL_URL` file for the deploy and always removes it): `firebase deploy --project bnhs-sims --config firebase.id-card-approved-functions-release.json --non-interactive --only "functions:resolveLearnerRequestFn"` with `NODE_OPTIONS=--dns-result-order=ipv4first` and `FUNCTIONS_DISCOVERY_TIMEOUT=120`.
- Result: revision `resolvelearnerrequestfn-00002-hax` (was `-00001-man`), 2026-10-30T15:08:23Z, nodejs22, ACTIVE. The live source zip was downloaded afterwards: 129 files identical to the tree, 0 mismatched, 0 only live, 0 only in the tree; 15 of 15 key files identical. The tree's `functions/.env` was confirmed removed.

## 4. Backfill

- `functions/scripts/backfillApprovedCards.mjs`, dry run only against production (read-only, Application Default Credentials): **0 would be added, 1 skipped, "No longer enrolled."** Production had one `learner.addApproved` audit row with `mode: 'new'` (2026-10-28) and that learner has since transferred. `id_card_approved` is empty, so nothing needs backfilling and `--apply` was not run.

## Not verified

- No signed-in production walkthrough: App Check rejects automated browsers. Not exercised in production: approving a new-learner add and seeing the learner in Recently approved, Print selected and the "Mark as printed?" question, Add to saved batch, Dismiss, and the Saved batch search add clearing the log. The checks in the release notes still need a person on a real device.
- The new tab was covered by unit and render tests only; it was never driven in a browser, locally or in production.

## Rollback

- SIMS: Firebase console, Hosting, Release history, roll back to `c710ecc0a091f5d4`. Do this before touching the rules.
- Function: redeploy the previous revision's source (`resolvelearnerrequestfn-00001-man`) by name, or leave it: entries already logged stay in `id_card_approved` and are harmless.
- Rules: do not roll the rules back while the new SIMS release is live. Marking a card printed deletes `id_card_approved/{id}` in the same write, and that delete would be denied, failing the whole write. Roll SIMS back first, then the rules to ruleset `7263ffa7-b9a7-4249-bb64-96d0388da0e0`.

## Notes

- Later SIMS releases start from this chain: caps-names + legacy-adviser port + PR #90 + PR #91 + PR #93 + PR #94 + the learner-requests overlay + this overlay. Live rules are the 2026-10-19 section-adviser-sync ruleset plus the `id_card_approved` rule; start any rules change from a fresh download of the live ruleset.
- The live function count is 73 (unchanged).
