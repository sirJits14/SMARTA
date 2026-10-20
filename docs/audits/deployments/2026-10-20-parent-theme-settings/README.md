# Parents App theme in Settings, icon Sessions button — production release

Date: 2026-10-20. Source: `master` at `e311ee9` (merge of PR #74). Project: `bnhs-sims`, site `bnhs-parent`.

Parents App hosting only. No Functions, Firestore rules or SIMS changes.

## What shipped

- The floating sun/moon theme button is gone from every screen, including sign-in. Settings › Appearance
  (Auto / Light / Dark) is now the only theme control. Signed-out screens follow the device setting.
- Gate scans (Home › learner): the "Sessions" pill is now a 44px round calendar icon at the right end of the header
  bar. Its accessible name is still "Sessions". Once the page scrolls, the back button, the learner's name and Sessions
  sit on one row.
- The unused theme menu CSS, the sun/moon icons and `ThemeMenuButton.jsx` are removed.

Since the previous release (`6e20168`, PR #72), this is the only change under `parent/` or `shared/`.

## Baseline check (before publishing)

All 50 live files matched `docs/audits/deployments/2026-10-20-parent-card-fit/parent-hosting-verification.json` (main
script `index-DujRImr6.js`). The newest Hosting release was still the PR 72 one (08:17 UTC), so no other deploy had
landed in between.

## Build

- `npm run build` in `parent/`, with the main checkout's `parent/.env` loaded into the build process only and its full
  `parent/node_modules` linked by junction.
- `npm run size`: initial load 219.2 KB gz of the 260 KB limit (220.5 KB before).
- The App Check (reCAPTCHA) site key is embedded in the bundle.
- Tests: Parents App 182/182, root 707/707 on the PR branch; Parents App 182/182 again on the merged `master`.

## Published

| What | How | Result |
| --- | --- | --- |
| Parents App hosting | `firebase deploy --project bnhs-sims --only hosting:parent` (run by the project owner from PowerShell). The Hosting release is dated 2026-10-20 13:53 UTC, with message "Parents App theme in Settings, icon Sessions button (PR 74)". | 50/50 files match (`parent-hosting-verification.json`). Main script `assets/index-D8xSSj5w.js`. |

The new header and the Appearance switch were checked before release in the browser previews at 375px, light and dark.
Signed-in live screens can't be checked from the browser pane, because App Check rejects it, so they need a check on a
real device.

## Rollback

Roll back to the previous release in the Hosting console (main script `index-DujRImr6.js`).
