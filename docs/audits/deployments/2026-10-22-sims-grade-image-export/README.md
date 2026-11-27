# SIMS grade image export (PR #91)

Released 2026-10-22 14:21:38Z, hosting only (`hosting:sims`). Release `sites/bnhs-sims/releases/1792678898057000`,
version `87f92e4d5a37b4c8` (63 files in the Firebase version), message "SIMS grade image export (PR 91) over live 09:39Z
release", published by bnhs.ictservices@gmail.com. Main script `/assets/index-v222Du5b.js`, 61 build files; all 61 SHA-256
values match the live site after publishing (`sims-hosting-verification.json`).

## Change
Sections page: an **Export image** button beside the search box downloads a PNG of the selected grade's sections
(adviser, schedule, male / female / total, grade total; Strand for Grades 11-12). Source is PR #91 (merge commit `eb1c405`,
branch head `bf3a892`). Files overlaid on the tree: `src/lib/downloadBlob.js` (+ test), `src/lib/gradeSummary.js` (+ test),
`src/lib/gradeSummaryImage.js` (+ test), `src/lib/downloadWorkbook.js` (+ new test), `src/pages/SectionsPage.jsx`,
`src/pages/SectionsPage.test.js`, `src/App.jsx` (passes `schoolName`). The spec and plan are under `docs/superpowers/`.

How the overlay was applied, from the worktree root:
`git diff --binary cb9e0db bf3a892 -- src/App.jsx src/lib src/pages/SectionsPage.jsx | git apply --directory=<tree>`
(the tree's `downloadWorkbook.js` and `App.jsx` were identical to pre-change master; `SectionsPage.jsx` differs only in its
data-hook lines, so its hunks applied with a one-line offset). The page test needs one adaptation, because the tree's mock
is `useCollectionResource`:
`git diff --binary cb9e0db bf3a892 -- src/pages/SectionsPage.test.js | sed 's/useStaffCollectionResource: path/useCollectionResource: path/g' | git apply --directory=<tree>`

## Base
- Prepared with `docs/releases/2026-10-21-caps-names/prepare.mjs` into `.superpowers/releases/capsbase/release`, from
  PowerShell through a temporary `subst R:` (the committed `firebase.caps-names-release.json` it rewrites was restored with
  `git checkout`).
- Live was the PR #90 release (`docs/audits/deployments/2026-10-22-sims-import-error-nav`), which that record built as the
  caps-names tree plus two hand-ported legacy-adviser changes plus the PR #90 files. The legacy port was **not saved as a patch**, so it
  was recreated from the record's description, from the tree root:
  1. `src/pages/guardians/LegacyAdvisers.jsx` and `LegacyAdvisers.test.js`:
     `sed -i 's/No legacy adviser links to verify\./No old adviser slips to confirm./'`
  2. `src/pages/guardians/school/PendingView.jsx`:
     `sed -i 's/legacyAdviserRows(context.legacyAdvisers, context.managedAssignments);/legacyAdviserRows(context.legacyAdvisers, context.managedAssignments).filter(row => !row.assigned);/'`
     and `sed -i 's/const legacyOpen = legacy.filter(row => !row.assigned).length;/const legacyOpen = legacy.length;/'`
  3. PR #90's three files copied unchanged from master (`git show origin/master:<path>`; LF like the rest of the tree):
     `src/pages/ImportStudentsWizard.jsx`, `src/lib/importPreview.js`, `src/lib/importPreview.test.js`.
- **The rebuilt baseline reproduced live exactly**: built with the main checkout's `.env`, 59 of 59 files matched the PR #90
  manifest, main script `index-K3XGc15N.js`, tree tests 65 files / 635 tests. Live was byte-checked against that manifest
  twice before publishing (59/59 each time, main still `index-K3XGc15N.js`), so nothing unrecorded had been published since.
- The 13:04Z 10-21 release's source is still not on master (see the PR #90 record); the three edits above are its only
  difference from caps-names, and they are now written down.

## Checks before publishing
- Tree tests with the change: 69 files, 685 tests pass. The same change on master passes 73 files, 763 tests.
- Built with the main checkout's `.env` (`VITE_USE_EMULATORS=false`, no App Check debug token). The 40-character `6L...`
  reCAPTCHA key is in the main script; no emulator hosts in the bundle.
- Hash-normalised comparison of the baseline build with the new build: 55 files identical; changed `SectionsPage`,
  `downloadWorkbook` (now imports the shared helper) and the main `index`; added `downloadBlob` (163 bytes) and
  `bnhs_logo-Zi4VGyiY.png` (the BNHS seal the image draws; the first time the SIMS tree ships it). `exceljs` is not pulled
  into the Sections chunk.
- Release config `firebase.grade-image-export-release.json` is hosting only; `public` is
  `.superpowers/releases/capsbase/release/sims/dist`.

## Command
`firebase deploy --config firebase.grade-image-export-release.json --project bnhs-sims --only hosting:sims --message "SIMS grade image export (PR 91) over live 09:39Z release"`
with `NODE_OPTIONS=--dns-result-order=ipv4first`. Claude's own run of this command was declined in the session; the release
carries that exact message and was published by the ICT account minutes later, so it was presumably run from the user's terminal.

## After publishing
- Live main script before: `index-K3XGc15N.js`; after: `index-v222Du5b.js`.
- All 61 build files byte-match the live site; the page title is "BNHS Learner Records", the staff sign-in form renders, and the
  page requests the reCAPTCHA Enterprise script.

## Rollback
Firebase console > Hosting > Release history > roll back to release `1792661998840000` (version `5b3f90b61f9fd7d7`, the PR #90
release). The verified baseline build is also kept as `dist-live` in the (git-ignored) release tree.

## Not covered
- No signed-in check: App Check rejects the built-in browser, so the Export image button and a real PNG download were not
  exercised against live, and the App Check token exchange (`exchangeRecaptchaEnterpriseToken`) was not observed. One export
  on a school PC (and Safari, if used) is still worth doing.
- Functions, rules and Parent hosting were not touched.
