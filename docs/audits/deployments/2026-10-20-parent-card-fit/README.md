# Parents App sign-in card fit — production release

Date: 2026-10-20. Source: `master` at `6e20168` (merge of PR #72). Project: `bnhs-sims`, site `bnhs-parent`.

Parents App hosting only. No Functions, Firestore rules or SIMS changes.

## What shipped

One line in `parent/src/app.css`: `box-sizing: border-box` on `.card`. Before the fix, the sign-in card set `width: 100%`
with padding under `content-box`, so on a 375px screen it measured 377px and the page scrolled sideways. No other card
sets a width or height, so nothing else moves. Since the previous release (`4274cc1`, PR #70) this is the only change
under `parent/` or `shared/`.

## Baseline check (before publishing)

All 50 live files matched `docs/audits/deployments/2026-10-20-parent-ui-restyle/parent-hosting-verification.json`
(main script `index-tgsWMCsg.js`).

## Build

- `npm run build` in `parent/`, with the main checkout's `parent/.env` loaded into the build process only and its full
  `parent/node_modules` linked by junction.
- `npm run size`: initial load 220.5 KB gz of the 260 KB limit.
- The App Check (reCAPTCHA) site key is embedded in the bundle.
- Parent tests 182/182.

## Published

| What | How | Result |
| --- | --- | --- |
| Parents App hosting | `firebase deploy --project bnhs-sims --only hosting:parent` (run by the project owner from PowerShell). The Hosting release is dated 2026-10-20 08:17 UTC, with message "Parents App sign-in card fit (PR 72)". | 50/50 files match (`parent-hosting-verification.json`). Main script `assets/index-DujRImr6.js`. |

The live sign-in page was checked at 375px: the card is 343px wide with 16px gutters, and the page's scroll width equals
the viewport.

## Rollback

Roll back to the previous release in the Hosting console (main script `index-tgsWMCsg.js`).
