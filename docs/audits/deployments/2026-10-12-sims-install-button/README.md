# Production deployment: SIMS "Install app" card in Settings

On October 12, 2026 the user asked for commit `cb1e514` (Install app card) to be deployed. Only SIMS hosting was published.

## Source

The coordinator rollout is still held on `master`, so this went out the same way as `../2026-10-12-sims-pwa`. The live release tree was recreated with `node scripts/prepareTemporaryPasswordRelease.mjs`, then `c1b9883` (PWA) was applied. That build reproduced the live site byte for byte (`/assets/index-25xfbXQ_.js`, `index.html` SHA-256 `10eefd2a…`). Then `cb1e514` was applied cleanly (6 files). The tree's 387 SIMS tests passed and the wrapper's `verify` passed.

The build is deterministic and the only source change was `cb1e514`, so every bundle difference comes from it. The main script gains the install listener and the Settings chunk gains the card. Other page chunks differ only in renamed imports from the main script. `index.html` differs only in the main script's file name, and `sw.js` and `manifest.webmanifest` are unchanged.

## Published and verified

- Command: `node scripts/deployTemporaryPasswordRelease.mjs hosting` (hosting:sims only; no functions, rules, indexes or Parent/Kiosk hosting).
- All 38 JS/CSS assets, `index.html`, `sw.js` and the manifest served by https://bnhs-sims.web.app match the local build by SHA-256. The main script is `/assets/index-Buvw3Nf9.js`.
- A request made immediately after the release got the previous `index.html` for the new script's URL (SPA fallback while the release propagated). A few seconds later the script was served correctly. The service worker never caches an HTML reply for `/assets/`, and `vite:preloadError` reloads once.
- A browser already controlled by the earlier service worker loaded the new main script on its next visit (pages are network-first).

## Rollback

Roll back to the previous SIMS hosting version (the PWA release) in the Firebase console.
