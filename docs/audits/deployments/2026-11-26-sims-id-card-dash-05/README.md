# Production deployment: back to 0.5mm dashed section borders (SIMS hosting)

On November 26, 2026, the user asked for the dash weight to go back to 0.5mm and for it to be released (PR #106). Claude
prepared and verified the build, and the user published it from their own PowerShell terminal with `deploy-sims.ps1`.

**Hosting only:** `hosting:sims`, project `bnhs-sims`, site `bnhs-sims`. No functions, rules, indexes or Parent App were
touched.

| | |
|---|---|
| Release | `1795676182403000`, 2026-11-26T06:56:22Z, version `1680e6bacdf293c9` |
| Message | "ID Cards: back to 0.5mm dashed section borders (PR 106)" |
| Main script | `assets/index-Zt08fD3E.js`, 69 build files |
| Previous release | `1795675837966000` (06:50Z, PR #105 color key fix, 0.8mm dashes), main `assets/index-DgYUvVBy.js` |
| Source | PR #106 head `2917608`. It is stacked on PR #105 (`66c94ed`), and both PRs were open at publish time. |

## Change

On Saved batch prints, card frames go from 0.8mm back to **0.5mm** dashed lines (`CARD_FRAME_MM`). Everything else is
unchanged: 30% section hue, double lines at seams, a solid key, and the never-clipped key from #105.

## How the build was made

Same route as `2026-11-26-sims-id-card-key-fit`.

1. **Base:** a copy of the PR #105 release tree, into this worktree's git-ignored
   `.superpowers/releases/idcard-dash05/sims/tree`. `tree/sims/node_modules` is a junction to the main checkout's
   `node_modules`. Remove it with `.Delete()`, never recursively.
2. **Baseline:** built the unchanged tree with the main `.env` loaded into the build process only. It is **69/69
   identical** to the PR #105 manifest and **69/69 byte-identical to live**.
3. **Patch:** `pr106-src.patch` = `git diff --binary 66c94ed 2917608 -- src`. It changes 2 files,
   `src/pages/idCardPrintLayout.js` and its test.
   - It applied cleanly with `git apply`. After LF normalisation both files equal `2917608` exactly.
   - Source hashes before and after differ in exactly those 2 paths.
4. **Tests in the tree:** 81 files, **872 tests passed**.
5. **Build checks:**
   - Release build: main `index-Zt08fD3E.js`, 69 files.
   - The `6L…` reCAPTCHA key is in exactly 1 asset (`ui-Coz8_du3.js`, unchanged).
   - There are no emulator strings.
   - Hash-normalised diff: only `IdCardPrintConfirm-*.js` changed (10,402 B both). Its frame constant is `.8` in the
     baseline and `.5` in the new build; the key swatch stays `.8`.
6. **Before publishing:** live was still `index-DgYUvVBy.js`. 52/69 files already matched; the other 17 differed only
   through hashed-name churn, which is expected.

## Verification after publishing

- `deploy-sims.ps1` byte-checked live itself (`sims-live-verification.json`, 06:56:42Z): **69/69 MATCH**, main
  `assets/index-Zt08fD3E.js`.
- Claude repeated the check independently afterwards and also got 69/69.
- The read-only release listing shows `1795676182403000` as the newest DEPLOY.

## Rollback

Firebase console > Hosting (bnhs-sims) > Release history > `1795675837966000` (0.8mm dashes with the key fix, main
`index-DgYUvVBy.js`).

## Not verified

- No signed-in browser check. App Check rejects automated browsers against production.
- Not checked on paper on the Brother DCP-T730DW.

## Next SIMS release

Start from `.superpowers/releases/idcard-dash05/sims/tree`. Live main is `index-Zt08fD3E.js`.
