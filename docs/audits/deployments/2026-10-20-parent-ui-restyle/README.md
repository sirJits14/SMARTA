# Parents App UI restyle — production release

Date: 2026-10-20. Source: `master` at `4274cc1` (merge of PR #70). Project: `bnhs-sims`, site `bnhs-parent`.

Parents App hosting only. No Functions, Firestore rules or SIMS changes. The Parents App is not under the SIMS
release-tree hold, so it was built straight from `master`.

## What shipped

Since the last Parents App release (`e028a7f`, 2026-10-19 registration), only two commits touch `parent/` or `shared/`:

- `dd8facf` (PR #66): the new shared color tokens and font stack in `shared/theme/theme.css`, and the dark
  `theme-color` in `parent/index.html`.
- `90d009b` (PR #70): the Parents App restyle. The glass layer is retired, and `glass.css` becomes `app.css`. Buttons,
  fields and banners use shared classes, settings tiles are neutral, heading weights are lighter, and the page-colored
  `theme-color` and manifest colors are in place.

## Baseline check (before publishing)

Every one of the 50 live files matched `docs/audits/deployments/2026-10-19-registration/parent-hosting-verification.json`,
with main script `index-C9Vz8RrN.js`, so no unrecorded deploy had landed in between.

## Build

- `npm run build` in `parent/`, with the main checkout's `parent/.env` loaded into the build process only and its full
  `parent/node_modules` linked by junction.
- `npm run size`: initial load 220.5 KB gz of the 260 KB limit (220.8 KB before).
- The App Check (reCAPTCHA) site key is embedded in the bundle.
- Parent tests 182/182, root tests 707/707.

## Published

| What | How | Result |
| --- | --- | --- |
| Parents App hosting | `firebase deploy --project bnhs-sims --only hosting:parent` (run by the project owner from PowerShell) | 50/50 files match (`parent-hosting-verification.json`). Main script `assets/index-tgsWMCsg.js`. |

The deploy uploaded 26 new files. The live sign-in page was checked visually at phone width. Signed-in screens could not
be checked from the browser pane, because App Check rejects it, so they need a check on a real device.

## Known issue found after release

On the sign-in screen at 375px width, the card is 377px wide: `Card` combines `width: 100%` with padding under
`content-box` sizing. This predates the restyle (the sign-in layout and `Card` sizing are unchanged) and is fixed
separately with `box-sizing: border-box` on `.card`.

## Rollback

Roll back to the previous release in the Hosting console (main script `index-C9Vz8RrN.js`), or rebuild `e028a7f`.
