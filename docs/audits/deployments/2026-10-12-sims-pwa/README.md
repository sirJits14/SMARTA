# Production deployment: SIMS installable app (PWA)

On October 12, 2026 the user asked for commit `c1b9883` (SIMS manifest, icons and service worker) to be deployed. Only SIMS hosting was published.

## Source

`master` still holds the coordinator rollout (83 school-record warnings), so the root build was not published. The live release tree was recreated with `node scripts/prepareTemporaryPasswordRelease.mjs` (base `26a6ed7` plus the temporary-password overlay). Its production-config build reproduced the live site byte for byte (`index.html` SHA-256 `6c5ebc2f…`, `/assets/index-CGqLs3B-.js` SHA-256 `fdf27ee2…`, as in `../2026-10-12-temporary-password/hosting-verification.json`).

The PWA commit's `index.html`, `src/main.jsx`, `public/` and `src/pwa.test.js` were applied on top. The release tree's 378 SIMS tests passed and the wrapper's `verify` passed. Compared with the live build, all 46 bundled assets were identical apart from hashed file references, except the main script, whose only change is the service worker registration. `index.html` gained the manifest, apple-touch-icon and iOS title tags. Six files were added: `sw.js`, `manifest.webmanifest` and four icons.

## Published and verified

- Command: `node scripts/deployTemporaryPasswordRelease.mjs hosting` (hosting:sims only; no functions, rules, indexes or Parent/Kiosk hosting).
- Served `index.html` and `/assets/index-25xfbXQ_.js` match the local build by SHA-256.
- `sw.js`, `manifest.webmanifest` (`application/manifest+json`) and all icons return 200.
- In a browser at https://bnhs-sims.web.app the service worker activated and cached the entry script and stylesheet on the first visit.

## Follow-up

The coordinator-held `master` build doesn't include this deployment's source tree. When the hold lifts and SIMS is deployed from `master` again, the PWA files are already in `master` via this branch once it's merged.

## Rollback

Roll back to the prior SIMS hosting version in the Firebase console. Browsers that already installed the worker keep it, but its pages are network-first, so they load whatever is live. To remove it completely, deploy a `sw.js` that unregisters itself.
