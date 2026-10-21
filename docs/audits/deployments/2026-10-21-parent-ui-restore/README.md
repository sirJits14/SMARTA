# Parents App UI restore — production release

Date: 2026-10-21. Source: `master` at `99371bb` (merge of PR #83). Project: `bnhs-sims`, site `bnhs-parent`.

Parents App hosting only. No Functions, Firestore rules or SIMS changes.

## What happened

After the PR 74 release (2026-10-20 13:53 UTC), two Parents App releases with no message landed at 00:45 UTC on
2026-10-21, right after PR #83 (the Abellana role, a Codex branch) merged. They put the old design back:

- The live CSS had the old `glass-card` and `theme-menu-btn` styles, and only 21 of the 50 files matched the PR 74
  record (`2026-10-20-parent-theme-settings`).
- The App Check (reCAPTCHA) key was still in the live bundle, so sign-in was not affected.
- SIMS was not affected: its live CSS still carries the redesign (`sims-account`, `sims-pagebar`, `sims-badge`).

The source of those two releases was not recorded. `master` has the full restyle and no `glass-card` or
`ThemeMenuButton` code, so the cause was a deploy from a checkout that predates the restyle.

## What shipped

A fresh build of `master` at `99371bb`. It has the restyle, the Settings-only theme switch and the icon-only Sessions
button, plus everything merged since (PR #81 DepEd-only Class Adviser requests, PR #83 Abellana role). Nothing that is
merged was dropped.

## Build

- `npm run build` in `parent/`, with the main checkout's `parent/.env` loaded into the build process only and its full
  `parent/node_modules` linked by junction.
- `npm run size`: initial load 219.0 KB gz of the 260 KB limit.
- The App Check (reCAPTCHA) site key is embedded in the bundle.
- The built CSS has `p-btn--solid` and `page-header-icon-btn`, and no `glass-card` or `theme-menu-btn`.
- Parent tests 186/186.

## Published

| What | How | Result |
| --- | --- | --- |
| Parents App hosting | `firebase deploy --project bnhs-sims --only hosting:parent` (run by the project owner from PowerShell). The Hosting release is dated 2026-10-21 00:51 UTC, with message "Restore the Parents App restyle and Settings theme (master 99371bb)". | 51/51 files match (`parent-hosting-verification.json`). Main script `assets/index-C8vTYG8X.js`. |

## Keeping it

Any other session that deploys the Parents App from an older checkout overwrites this build. Before deploying, list
`sites/bnhs-parent/releases` and build from current `master`.

## Rollback

Roll back in the Hosting console. The previous release is the unmessaged 00:45 UTC one with the old UI, so rollback is
not recommended.

## Deployment safeguard

The stale bundle was confirmed to have been rebuilt from `fa9c2cf`, the October 18
source snapshot. To prevent this on future Parent releases:

- `npm run deploy:parent` uses the Parent Hosting predeploy hook in `firebase.json`.
- `scripts/buildParentRelease.mjs` fetches master, requires the current merged
  revision and PR #74 ancestry, and rejects uncommitted Parent/shared source.
- It loads existing production configuration without copying secrets, forces
  emulator/debug mode off, validates the project and App Check key, then rebuilds
  and checks the initial-load size budget before upload.
- `AGENTS.md` records the requirement to preserve the latest merged Parent UI/UX.

The guarded Parent-only deployment from `99371bb` completed on 2026-10-21 at
00:55 UTC. All 51 live files match the fresh build by SHA-256; compiled-asset
checks also confirm the Sessions icon, Settings theme controls, absence of the
floating theme button, and `Lead Researcher and Product Developer` title.
See `guard-hosting-verification.json` for this verification. Build size was
219.0 KB gzip of the 260 KB budget; Parent tests passed 186/186. An unmerged
checkout was separately rejected before the guard changed the built bundle.
Signed-in screens were verified through the published assets rather than an
authenticated device session.
