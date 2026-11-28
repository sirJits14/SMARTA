# Class Adviser requests need a DepEd email: production release

Date: 2026-10-20 23:17-23:25 UTC (2026-10-21 Asia/Manila). Source: `master` at `cd3ccc1` (merge of PR #81). Project: `bnhs-sims`.
Spec: `docs/superpowers/specs/2026-10-21-deped-only-adviser-requests-design.md`. Plan and release checklist: `docs/superpowers/plans/2026-10-21-deped-only-adviser-requests.md`.

Status: **published**, every step verified except the signed-in chooser check, which is the user's to do on their own device (the built-in browser gets an App Check 403).

## What went live

- **Functions (3, by name, from `docs/releases/2026-10-18-school-family/prepareBackend.mjs`):**
  - `requestSchoolRoleFn` now refuses a non-DepEd account with `permission-denied`: "Class Adviser requests need a @deped.gov.ph account." The check runs before the rate limit and before the request gate from PR #77.
  - `previewAdvisorySlipFn` and `redeemAdvisorySlipFn` drop "Request the role instead." from their DepEd refusal. They also carry PR #77's `loadSchoolActor` change (one extra `settings/app` read), because they were not part of the advisory-toggle deploy.
- **Parent App:** a non-DepEd account sees only Parent/Guardian in "Who are you?" (an account that already holds Class Adviser keeps the locked "Active" card), and the Settings › Add a role subtitle says "Parent/Guardian" for it. The "Needs approval" tag and note are gone.
- **Not changed:** SIMS, Administrator assignment of any email, waiting requests, existing advisers. No data cleanup.

## Baseline (before publishing)

- **Hosting release list** for `bnhs-parent`: the newest release was `f2d0686f242dcde4` at 2026-10-20 21:45:13 UTC (the advisory-toggle release, PR #80). It was re-checked immediately before the deploy and nothing newer had appeared.
- **Live Parent App** matched the advisory-toggle release's prepared build 50/50 (`parent-baseline-verification.txt`, main script `index-GVT6CC6r.js`).
  - The advisory-toggle deployment record is **not on master** (its README still says "deployment verification pending"), so the baseline was the other session's prepared build at `.codex/worktrees/71f0/bnhs-sims/.superpowers/releases/advisory-toggle/parent/dist`.
  - The user said to proceed without that record.
- **Functions:** 63 live, all ACTIVE (`functions-before.json`).
- **Production counts** (read-only, numbers only, `production-count-before.json`):
  - 6 waiting Class Adviser requests, none from a non-DepEd email;
  - 54 school accounts, 48 with Class Adviser rows, 1 account with a non-DepEd email holding 1 such row;
  - `advisoryRequestsEnabled` is **false**, so Class Adviser requests are closed for everyone today. This release changes who sees the card and which refusal message comes first; it does not open requests.

## What was tested before publishing

- **Prepared backend:** unit 168/168 (`backend-unit-tests.log`); emulator `schoolAccess` 31/31 and `advisorySlips` 16/16, one file at a time (`backend-emulator-*.log`).
- **PR head tests (earlier):** Parent App 186/186, build and size check passed, functions unit 168, emulator `schoolAccess` 31, `advisorySlips` 16, `retireSubjectTeachers` 6, `portalAnnouncements` 9.
- **Browser check** on local emulators (earlier): a Gmail account sees only Parent/Guardian, a DepEd account sees both cards, the server refusal fires and writes nothing, and an Administrator assignment of a Gmail account still works.

## Published

Each step ran from this checkout with `NODE_OPTIONS=--dns-result-order=ipv4first` and `FUNCTIONS_DISCOVERY_TIMEOUT=120`, using `firebase.deped-adviser-release.json`.

| Step | Command | Result |
| --- | --- | --- |
| Functions | `firebase deploy --project bnhs-sims --config firebase.deped-adviser-release.json --only functions:requestSchoolRoleFn,functions:previewAdvisorySlipFn,functions:redeemAdvisorySlipFn` | 3 updated, none created or deleted (`functions-deploy.log`). Still 63 live, all ACTIVE (`functions-after.json`). |
| Parent build | `node docs/releases/2026-10-21-advisory-toggle/build.mjs parent <main checkout parent dir> .superpowers/releases/deped-adviser/parent-build` | Built from a `git archive` export of `cd3ccc1` (`parent/` and `shared/`), `index.html` and `manifest.webmanifest` normalized to LF, the main checkout's `parent/node_modules` linked in. `build.mjs` forced `VITE_USE_EMULATORS=false`, dropped the App Check debug token and checked the project id (`parent-build.log`). 51 files. |
| Parent hosting | `firebase deploy --project bnhs-sims --config firebase.deped-adviser-release.json --only hosting:parent` | Release `5a92e8997731c379` at 2026-10-20 23:24:31 UTC (`hosting-parent-deploy.log`). 51/51 live files match the build (`parent-hosting-verification.txt`). Main script `assets/index-BZsMhYih.js`. |

## Checks on the built Parent App

- **Against the live baseline** (`parent-build-vs-baseline.txt`), with hashed names normalized: only the `index`, `Join`, `Settings` and `strings` chunks differ, `ScanSheet` differs by an import alias only, and there is one new chunk, `join` (the shared chunk that `Join`, `Settings` and `ScanSheet` now import). That is why there are 51 files instead of 50.
- **App Check and development values** (`parent-bundle-check.json`, booleans and counts only): the reCAPTCHA site key is in the same chunk as in the baseline; the main checkout's debug token is empty, so nothing could leak; no emulator addresses appear; the four mentions of `FIREBASE_APPCHECK_DEBUG_TOKEN` are the Firebase library's, with the same count as the baseline. This check exists because a Parent build without the site key deploys cleanly and then refuses every sign-in (see `docs/audits/deployments/2026-10-21-sims-appcheck-key-fix/README.md`).
- **Live bundle text:** the live `strings` chunk has `addRoleRowHintParent` and no "Needs approval"; neither chunk contains the server's refusal text.

## Smoke test

- An unauthenticated call to each of the three functions answers 401 (`smoke-unauthenticated.txt`).
- The live site serves `index-BZsMhYih.js`.
- **Not done by Claude, for the user:** sign in on a real device with a personal (non-DepEd) account and a DepEd account.
  - Personal account: only Parent/Guardian in the chooser, and "Parent/Guardian" under Settings › Add a role.
  - DepEd account: both cards, and "Parent/Guardian or Class Adviser" under Settings › Add a role.
  - Do not submit a Class Adviser request from either account.

## Rollback

- **Parent App:** the Hosting console, release `f2d0686f242dcde4` (21:45:13 UTC, main script `index-GVT6CC6r.js`).
- **Functions:** re-prepare the backend from master commit `20f4549` (the commit just before PR #81 merged) with `prepareBackend.mjs` and redeploy the same three functions. The two slip functions then keep PR #77's `loadSchoolActor` change, which is harmless: one extra `settings/app` read.
