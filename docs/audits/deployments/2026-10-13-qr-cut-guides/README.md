# Production deployment: touching QR cards with cutting guides

On October 13, 2026 the user requested merge, push and deployment of the student QR print adjustment. Commit `f0f5b17` was fast-forwarded into `master` and pushed to `origin/master`.

Printed cards now touch their neighbors and have thin dashed cutting guides. Shared edges draw once. The 16 mm QR, student name, LRN and 80-card A4 capacity are preserved. The shared layout covers section printing, section-detail printing and the saved print queue.

## Release source

The coordinator rollout remains held on `master`, so SIMS hosting was built from the established production release tree. A temporary source snapshot of `670c87e` supplied the 25-callable overlay expected by `prepareTemporaryPasswordRelease.mjs`. Git archive operations were run against the repository root to include the complete baseline.

The existing live changes were applied: `c1b9883` excluding `scripts/build-logos.py`, `cb1e514`, `1ae23c4..a2db95a -- src/`, and `670c87e..1929223 -- src/`. All 54 resulting build files matched production by SHA-256 before applying this change; the baseline main script was `/assets/index-DFk8lSPJ.js`.

The two-file patch from `f0f5b17^..f0f5b17` was then applied. The release layout source matches merged `master`. Comparing builds with asset hashes normalized showed that only the shared `IdCardPrintConfirm` chunk changed in content; other differences are asset-name references.

## Verification and publication

- All 465 tests passed on the merged main checkout.
- All 399 tests passed in the production release tree; the release wrapper's `verify` passed and the production build succeeded.
- Isolated browser checks with synthetic students and the actual print styles verified touching edges, dashed guides, 16 mm QR dimensions and expected PDF page counts for 1, 8, 9, 79, 80, 81 and 160 cards, without extra blank pages.
- `node scripts/deployTemporaryPasswordRelease.mjs hosting` published only `hosting:sims` to https://bnhs-sims.web.app.
- All 54 files served by production matched the deployed build by SHA-256; see `hosting-verification.json`. The deployed main script is `/assets/index-BUv-Kdcg.js`.
- The school's physical printer has not been checked in this session.

## Future releases and rollback

While the coordinator rollout remains held, later SIMS releases must preserve the four earlier overlays above and the `f0f5b17` print patch. These changes are already in `master` for when the hold lifts.

To roll back this print adjustment, restore the preceding SIMS Hosting version (the Reissue slip release) in Firebase. No data migration is required.
