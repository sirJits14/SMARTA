# Production deployment: Saved batch color key never clipped (SIMS hosting)

On November 26, 2026, the user asked to release PR #105. Claude prepared and verified the build, and the user published it
from their own PowerShell terminal with `deploy-sims.ps1`.

**Hosting only:** `hosting:sims`, project `bnhs-sims`, site `bnhs-sims`. No functions, rules, indexes or Parent App were
touched.

| | |
|---|---|
| Release | `1795675837966000`, 2026-11-26T06:50:37Z, version `931c9b8793de72c9` |
| Message | "ID Cards: never clip the Saved batch color key (PR 105)" |
| Main script | `assets/index-DgYUvVBy.js`, 69 build files |
| Previous release | `1795675353250000` (06:42Z, PR #104, 0.8mm dashes), main `assets/index-D7VyGn1x.js` |
| Source | PR #105 head `e2216ac` (base master `4ad9b53`). The PR was open at publish time. |

## Change

The user reported that some section entries at the top of the color key were cut off.

**Cause:** the key sat in a fixed 6mm grid row with `overflow: hidden` and vertically centred content, so a key needing 3 or
more lines lost its first and last lines.

**Fix:**
- The key row is now `auto` height and top-aligned, with no clipping.
- A sheet that reaches the 10th row (`sheetUsesAllRows`, more than 72 cards; class `sheet-full`) is held at 270mm, and its
  card rows use `minmax(0, 1fr)` to share what the key leaves.
- Shorter sheets keep 26.4mm rows and grow.

Local Chrome print-to-PDF checks:

| Batch | Result |
|---|---|
| 11 sections | 1 page |
| 28 sections in 80 cards | 1 page, key on 4 lines with all 28 visible, bottom-row names and LRNs intact, sheet ends 11mm above the printable limit |
| 45 sections | 2 pages, both keys complete |

## How the build was made

Same route as `2026-11-26-sims-id-card-dash-weight`.

1. **Base:** a copy of the PR #104 release tree, into this worktree's git-ignored
   `.superpowers/releases/idcard-keyfit/sims/tree`. `tree/sims/node_modules` is a junction to the main checkout's
   `node_modules`. Remove it with `.Delete()`, never recursively.
2. **Baseline:** built the unchanged tree with the main `.env` loaded into the build process only. It is **69/69
   identical** to the PR #104 manifest and **69/69 byte-identical to live**.
3. **Patch:** `pr105-src.patch` = `git diff --binary 4ad9b53 e2216ac -- src` (4 files: `IdCardsPrintable.jsx` and
   `idCardPrintLayout.js`, plus their tests).
   - It applied cleanly with `git apply`. After LF normalisation all 4 files equal `e2216ac` exactly.
   - Source hashes before and after differ in exactly those 4 paths.
4. **Tests in the tree:** 81 files, **872 tests passed** (865 + 7 new).
5. **Build checks:**
   - Release build: main `index-DgYUvVBy.js`, 69 files.
   - The `6L…` reCAPTCHA key is in exactly 1 asset (`ui-Coz8_du3.js`, unchanged).
   - There are no emulator strings.
   - Hash-normalised diff: only `IdCardPrintConfirm-*.js` changed (10,196 → 10,402 B). It contains `sheet-full`,
     `minmax(0, 1fr)` and `grid-template-rows: auto`.
6. **Before publishing:** live was still `index-D7VyGn1x.js`. 52/69 files already matched; the other 17 differed only
   through hashed-name churn, which is expected.

## Verification after publishing

- `deploy-sims.ps1` byte-checked live itself (`sims-live-verification.json`, 06:50:59Z): **69/69 MATCH**, main
  `assets/index-DgYUvVBy.js`.
- Claude repeated the check independently afterwards and also got 69/69.
- The read-only release listing shows `1795675837966000` as the newest DEPLOY.

## Rollback

Firebase console > Hosting (bnhs-sims) > Release history > `1795675353250000` (main `index-D7VyGn1x.js`).

## Not verified

- No signed-in browser check. App Check rejects automated browsers against production.
- Not checked on paper on the Brother DCP-T730DW.

## Next SIMS release

Start from `.superpowers/releases/idcard-keyfit/sims/tree`. Live main is `index-DgYUvVBy.js`.
