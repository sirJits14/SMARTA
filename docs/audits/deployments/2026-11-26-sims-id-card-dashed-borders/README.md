# Production deployment: ID Cards lighter dashed section borders (SIMS hosting)

On November 26, 2026, the user asked to release PR #103. Claude prepared and verified the build, and the user published it
from their own PowerShell terminal with `deploy-sims.ps1`.

**Hosting only:** `hosting:sims`, project `bnhs-sims`, site `bnhs-sims`. No functions, rules, indexes or Parent App were
touched.

| | |
|---|---|
| Release | `1795673566901000`, 2026-11-26T06:12:46Z, version `8facd4730c300117` |
| Message | "ID Cards: lighter dashed 30% section borders on Saved batch prints (PR 103)" |
| Main script | `assets/index-BonRD81r.js`, 69 build files |
| Previous release | `1795672644036000` (05:57Z the same day, version `555fc43c73771ad8`, PR #102), main `assets/index-Bp2LPo0B.js` |
| Source | PR #103 head `88beb11` (base master `191c2ab`). The PR was still **open** at publish time. |

## Change

On Saved batch prints, card frames change from solid 0.8mm at about 60% opacity to **0.5mm dashed at 30% opacity** of
the section's hue (`sectionBorderColor`, `--section-border`). Each card still draws all four sides, so seams are double
lines. The color key and the on-screen swatches keep the solid, stronger shade. The layout is unchanged: 80 cards per
sheet, 26.4mm rows and a 6mm key.

## How the build was made

Same route as `2026-11-26-sims-id-card-section-colors`.

1. **Base:** a copy (`robocopy /XJ`, without the dist folders) of the PR #102 release tree, into this worktree's
   git-ignored `.superpowers/releases/idcard-dashed/sims/tree`. `tree/sims/node_modules` is a junction to the main
   checkout's `node_modules`. Remove it with `.Delete()`, never recursively. The PR #102 tree
   (`.superpowers/releases/idcard-colors`) was left untouched.
2. **Baseline:** built the unchanged tree with the main `.env` loaded into the build process only. It is **69/69
   identical** to the PR #102 manifest and **69/69 byte-identical to live** (`sims-baseline-verification.json`).
3. **Patch:** `pr103-src.patch` = `git diff --binary 191c2ab 88beb11 -- src` (6 files). The tree copies were
   LF-normalised first.
   - Five files went in with `git apply`.
   - In `src/lib/idCardQueue.test.js` the import-line hunk does not apply, because the tree's import list also carries
     PR #98 names. It was ported by hand: `SECTION_BORDER_OPACITY, sectionBorderColor` were added to the import, and the
     `sectionBorderColor` describe block was inserted before `sectionLegendLabel`.
   - Four files then equal `88beb11` exactly. The two `idCardQueue` files differ from it only by the PR #98 lines
     (+19 / −0 and +42 / −1), exactly as in the PR #102 release.
   - Source hashes before and after differ in exactly the 6 PR paths.
4. **Tests in the tree:** 81 files, **865 tests passed** (862 + 3 new).
5. **Build checks:**
   - Release build `dist-new`: main `index-BonRD81r.js`, 69 files, manifest `sims-hosting-verification.json`.
   - The `6L…` reCAPTCHA key is FOUND in exactly 1 asset (`assets/ui-Coz8_du3.js`, unchanged).
   - There are no emulator strings.
   - Hash-normalised diff (`build-diff.txt`): only `IdCardPrintConfirm-*.js` changed (10,050 → 10,196 B). It holds
     `dashed var(--section-border)`. The other 68 files are identical after normalisation.
6. **Before publishing:** live was still `index-Bp2LPo0B.js`. 52/69 files already matched; the other 17 differed only
   through hashed-name churn, which is expected.

## Verification after publishing

- `deploy-sims.ps1` byte-checked live itself (`sims-live-verification.json`, 06:13:09Z): **69/69 MATCH**, main
  `assets/index-BonRD81r.js`.
- Claude repeated the check independently afterwards and also got 69/69.
- The read-only release listing shows `1795673566901000` as the newest DEPLOY.

## Rollback

Firebase console > Hosting (bnhs-sims) > Release history > `1795672644036000` (solid borders, main `index-Bp2LPo0B.js`).
To go back to before any section colors, use `1795525289646000` (main `index-DU3AcgBx.js`).

## Not verified

- No signed-in browser check. App Check rejects automated browsers against production.
- Not checked on paper on the Brother DCP-T730DW. A local Chrome print-to-PDF of 90 test cards rendered 2 pages
  (80 + 10). Brown and pink are the closest pair at 30%.

## Next SIMS release

Start from `.superpowers/releases/idcard-dashed/sims/tree`. Live main is `index-BonRD81r.js`.
