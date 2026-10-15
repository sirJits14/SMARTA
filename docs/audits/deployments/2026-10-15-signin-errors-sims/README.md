# Production deployment: real sign-in error messages (SIMS)

On October 15, 2026 the user asked for PR #32 (`5eab791`, merged as `186ad76`) to be deployed to the live SIMS site. Only `hosting:sims` was published.

## Why

Staff were told "That email and password did not match" for every sign-in failure. Firebase Authentication on `bnhs-sims` enforces App Check, so a browser whose reCAPTCHA Enterprise check fails (Brave Shields, ad-blockers) is refused before the password is checked, and that was reported as a wrong password. Rate limiting and network failures were hidden the same way. `src/lib/authErrors.js` now maps each Firebase Auth code to its own message.

## Source

The coordinator rollout is still held, so this was built from the release tree, like `../2026-10-15-search-optimization-sims/`:

1. Prepared the password release from a temporary detached checkout of `670c87e`.
2. Applied the six live overlays and `../2026-10-15-pm-session-sims/sims-pm-port.patch`.
3. Added `shared/sectionEditing.js` and `src/data/coordinatorSections.js` from `e31b6b1`, plus the two files in `../2026-10-15-glc-section-editing/release-source/`.
4. Applied `git diff 052dc02 3c08a05 -- src tests`, excluding `useCollection.js`, `StudentsPage.jsx` and `staffQueries.*`, plus the two files in `../2026-10-15-search-optimization-sims/release-source/`.

That build matched production byte for byte: 55 of 55 files, with main script `/assets/index-CFFzMvnY.js`. See `baseline-hosting-verification.json`.

## Change

`git diff 5eab791^ 5eab791` applied to the tree unchanged: the tree's `Login.jsx` was identical to the pre-fix version, and `access.js` still exports `DISABLED_MESSAGE`. It adds `src/lib/authErrors.js` and its test, and changes `src/components/Login.jsx`.

Later releases from the release tree must apply this diff too, or they will drop it.

## Verification

- **Release tree:** 467 unit tests passed (461 before this change).
- **Build comparison against the live-equivalent build, ignoring content hashes:** only the main script changed. No files were added or removed.
- **Before publishing:** the live `index.html` was rechecked against the baseline immediately before.
- **Publish command:**
  ```
  NODE_OPTIONS=--dns-result-order=ipv4first npx firebase deploy --project bnhs-sims --config firebase.signin-release.json --only hosting:sims --non-interactive
  ```
  The config contains only the `sims` hosting target (identical to `../2026-10-15-search-optimization-sims/firebase.search-release.json`). See `hosting-deploy.log`.
- **Byte check:** all 55 files served by https://bnhs-sims.web.app match the deployed build by SHA-256. The main script is `/assets/index-nHfTFpJL.js`. See `hosting-verification.json`.

No functions, Firestore rules or indexes, App Check or Auth settings, school records, Parent App hosting or kiosk hosting were changed.

**Not yet checked in production:** a real failed sign-in that shows the new App Check message.

## Rollback

In the Firebase console, roll SIMS hosting back to the preceding version, whose main script is `/assets/index-CFFzMvnY.js`.
