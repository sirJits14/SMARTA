# Production deployment: ID Cards section-colored borders (SIMS hosting)

On November 26, 2026, the user asked for the Saved batch section colors (PR #102) to be deployed to SIMS. Claude prepared
and verified the build, and the user published it from their own PowerShell terminal with `deploy-sims.ps1`.

**Hosting only:** `hosting:sims`, project `bnhs-sims`, site `bnhs-sims`. No functions, rules, indexes or Parent App were
touched.

| | |
|---|---|
| Release | `1795672644036000`, 2026-11-26T05:57:24Z, version `555fc43c73771ad8` |
| Message | "ID Cards: section-colored borders + color key on Saved batch prints (PR 102)" |
| Main script | `assets/index-Bp2LPo0B.js`, 69 build files |
| Previous release | `1795525289646000` (2026-11-24T13:01Z, version `9b23e49a6e569262`, PR #101 kiosk devices), main `assets/index-DU3AcgBx.js`, 69 files |
| Source | PR #102 head `e9aa81e002e84d0f77707636cb11c570037e2639` (base master `26228e0`). The PR was still **open (unmerged)** at publish time. |

## Change

Saved batch prints give every card a 0.8mm frame in its section's color. There are 10 translucent hues, assigned in
print order. Each sheet also gets a 6mm color key listing its sections with counts. Rows shrink from 27mm to 26.4mm, so
a sheet still holds 80 cards and keeps the 270mm height. By section and the Sections page print as before.

## How the build was made

SIMS production still ships from the release tree, not from `master`.

1. **Base:** a copy (`robocopy /XJ`, without the dist folders) of the PR #101 kiosk-management release tree
   `…\worktrees\kiosk-management-remote-565acd\.superpowers\releases\kiosk-mgmt\sims\tree`. The copy is under this
   worktree's git-ignored `.superpowers/releases/idcard-colors/sims/tree`. `tree/sims/node_modules` is a junction to the
   main checkout's `node_modules`. Remove it with `.Delete()`, never recursively.
2. **Baseline:** built the unchanged tree with the main `.env` loaded into the build process only:
   `unset VITE_APPCHECK_DEBUG_TOKEN; VITE_USE_EMULATORS=false; node MAIN/node_modules/vite/bin/vite.js build`.
   It is **69/69 identical** to the PR #101 manifest and **69/69 byte-identical to live** (`sims-baseline-verification.json`).
3. **Patch:** `pr102-src.patch` = `git diff --binary 26228e0 e9aa81e -- src` (7 files).
   - Five files had a tree copy equal to `26228e0` (or were new), so `git apply` was used:
     `IdCardsPrintable.jsx`, the new `IdCardsPrintable.test.js`, `idCardPrintLayout.js` and its test, and `SavedBatchTab.jsx`.
     After LF normalisation each equals `e9aa81e` exactly.
   - `src/lib/idCardQueue.js` and its test differ in the tree, because it also carries the live PR #98 "Recently approved"
     code that master lacks. PR #102 only appends to these two files, so it was ported by hand:
     - the new block after `cardsLabel` was appended to `idCardQueue.js`;
     - the three new imports were added and the new `describe` blocks appended to the test.
     Compared with `e9aa81e`, the tree versions differ only by the PR #98 lines (+19 in the module; +42 / −1 in the test,
     where the −1 is the shorter import line).
   - Source hashes before and after the patch differ in exactly those 7 paths: 6 changed, 1 added.
4. **Tests in the tree:** 81 files, **862 tests passed**. That is the 852 from the PR #101 tree plus the 10 new ones.
5. **Build checks:**
   - Release build `dist-new`: main `index-Bp2LPo0B.js`, 69 files, manifest `sims-hosting-verification.json`.
   - The 40-char `6L…` reCAPTCHA key is FOUND in exactly 1 asset (`assets/ui-Coz8_du3.js`, unchanged from live).
   - There are no emulator strings.
   - Hash-normalised diff against the baseline (`build-diff.txt`): only `IDCardsPage-*.js` and `IdCardPrintConfirm-*.js`
     changed. The `section-coded` and `id-cards-legend` code is in `IdCardPrintConfirm-*.js`. Everything else is identical
     after normalisation.
6. **Before publishing:** live was still `index-DU3AcgBx.js`. 52/69 files already matched; the other 17 differed only
   through hashed-name churn, which is expected.

## Verification after publishing

- `deploy-sims.ps1` byte-checked live itself (`sims-live-verification.json`): **69/69 MATCH**, live main
  `assets/index-Bp2LPo0B.js`.
- Claude repeated the check independently afterwards and also got 69/69.
- The release listing (firebase-tools `requireAuth` + `apiv2`, read-only) shows the release above as the newest DEPLOY.

## Rollback

Firebase console > Hosting (bnhs-sims) > Release history > roll back to `1795525289646000` (version `9b23e49a6e569262`,
main `index-DU3AcgBx.js`). The baseline build is kept in the git-ignored tree as `tree/sims/dist-baseline`.

## Not verified

- No signed-in browser check of the Saved batch tab. App Check rejects automated browsers against production.
- The colors have not been checked on paper on the Brother DCP-T730DW. A local Chrome print-to-PDF of 90 test cards in
  11 sections rendered 2 pages (80 + 10), with full frames and a two-line key.

## Next SIMS release

Start from this tree: the PR #101 kiosk tree plus `pr102-src.patch`, with the two `idCardQueue` files ported as described
above. Live main is `index-Bp2LPo0B.js`. PR #102 was unmerged when this was published. Once it merges, `master` holds the
same PR #102 source; the release tree still differs from `master` in the held and unmerged parts.
