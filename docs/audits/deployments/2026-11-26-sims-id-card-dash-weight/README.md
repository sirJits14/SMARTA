# Production deployment: ID Cards 0.8mm dashed section borders (SIMS hosting)

On November 26, 2026, the user asked to release PR #104. Claude prepared and verified the build, and the user published it
from their own PowerShell terminal with `deploy-sims.ps1`.

**Hosting only:** `hosting:sims`, project `bnhs-sims`, site `bnhs-sims`. No functions, rules, indexes or Parent App were
touched.

| | |
|---|---|
| Release | `1795675353250000`, 2026-11-26T06:42:33Z, version `a69a39f8f4f8d22a` |
| Message | "ID Cards: 0.8mm dashed section borders on Saved batch prints (PR 104)" |
| Main script | `assets/index-D7VyGn1x.js`, 69 build files |
| Previous release | `1795673566901000` (06:12Z the same day, PR #103, 0.5mm dashes), main `assets/index-BonRD81r.js` |
| Source | PR #104 head `63a7f2a` (base master `cf33cff`). The PR was open at publish time. |

## Change

On Saved batch prints, card frames go from 0.5mm to **0.8mm** dashed lines. Everything else is unchanged: 30% section
hue, double lines at seams, a solid key, and the layout.

## How the build was made

Same route as `2026-11-26-sims-id-card-dashed-borders`.

1. **Base:** a copy (`robocopy /XJ`, without the dist folders) of the PR #103 release tree, into this worktree's
   git-ignored `.superpowers/releases/idcard-dash08/sims/tree`. `tree/sims/node_modules` is a junction to the main
   checkout's `node_modules`. Remove it with `.Delete()`, never recursively.
2. **Baseline:** built the unchanged tree with the main `.env` loaded into the build process only. It is **69/69
   identical** to the PR #103 manifest and **69/69 byte-identical to live**.
3. **Patch:** `pr104-src.patch` = `git diff --binary cf33cff 63a7f2a -- src`. It changes 2 files,
   `src/pages/idCardPrintLayout.js` and its test.
   - It applied cleanly with `git apply`. After LF normalisation both files equal `63a7f2a` exactly.
   - Source hashes before and after differ in exactly those 2 paths.
4. **Tests in the tree:** 81 files, **865 tests passed**.
5. **Build checks:**
   - Release build: main `index-D7VyGn1x.js`, 69 files.
   - The `6L…` reCAPTCHA key is in exactly 1 asset (`ui-Coz8_du3.js`, unchanged).
   - There are no emulator strings.
   - Hash-normalised diff: only `IdCardPrintConfirm-*.js` changed (10,196 B both). Its frame constant is `S=.5` in the
     baseline and `S=.8` in the new build; the key swatch stays `C=.8`.
6. **Before publishing:** live was still `index-BonRD81r.js`. 52/69 files already matched; the other 17 differed only
   through hashed-name churn, which is expected.

## Verification after publishing

- `deploy-sims.ps1` byte-checked live itself (`sims-live-verification.json`, 06:42:54Z): **69/69 MATCH**, main
  `assets/index-D7VyGn1x.js`.
- Claude repeated the check independently afterwards and also got 69/69.
- The read-only release listing shows `1795675353250000` as the newest DEPLOY.

## Rollback

Firebase console > Hosting (bnhs-sims) > Release history > `1795673566901000` (0.5mm dashes, main `index-BonRD81r.js`).

## Not verified

- No signed-in browser check. App Check rejects automated browsers against production.
- Not checked on paper on the Brother DCP-T730DW.

## Next SIMS release

Start from `.superpowers/releases/idcard-dash08/sims/tree`. Live main is `index-D7VyGn1x.js`.
