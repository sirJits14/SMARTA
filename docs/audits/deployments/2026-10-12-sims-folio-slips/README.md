# Production deployment: activation slips on Folio, 16 per sheet

On October 12, 2026 the user asked for PR #28 (merge `efd1ca2`) to be deployed. Only SIMS hosting was published.

## Source

The coordinator rollout is still held on `master`, so this went out the same way as `../2026-10-12-sims-install-button`. The live release tree was recreated with `node scripts/prepareTemporaryPasswordRelease.mjs`, then `c1b9883` (PWA, without `scripts/build-logos.py`) and `cb1e514` (Install app card) were applied. That build reproduced the live site byte for byte: all 53 files, main script `/assets/index-Buvw3Nf9.js`.

The slip change (`1ae23c4..a2db95a`: `src/lib/slipLayout.js`, its test, `src/components/ActivationSlipsPrintable.jsx`, `src/pages/guardians/CodesTab.jsx`) was applied cleanly; the four files match the reviewed commit. The tree's 394 SIMS tests passed and the wrapper's `verify` passed.

The pre-change tree was also built separately and compared with the new build. Only the Codes tab chunk changed in content. Every other JS chunk, including the main script, differs only in hashed file references, `index.html` differs only in the main script's file name, and `sw.js` and `manifest.webmanifest` are identical.

## Published and verified

- Command: `node scripts/deployTemporaryPasswordRelease.mjs hosting` (hosting:sims only; no functions, rules, indexes or Parent/Kiosk hosting).
- All 53 files served by https://bnhs-sims.web.app match the local build by SHA-256. The main script is `/assets/index-CROHJVGN.js`.
- Before release, Chromium print-to-PDF of the slips gave Folio 612×936 pt pages at 16 per page and A4 at 14 per page with no blank trailing page, and a 26 mm QR rendered at 300 dpi decoded to the activation link.
- Not yet checked in production: printing from the live Codes tab on the school's printer and scanning a printed slip with a phone.

## Follow-up

Later SIMS releases from the release tree must apply `c1b9883`, `cb1e514` and `1ae23c4..a2db95a`, or they will drop these changes. When the hold lifts, all three are already in `master`.

## Rollback

Roll back to the previous SIMS hosting version (the Install app card release) in the Firebase console. No codes or data changed; slips already printed on A4 keep working.
