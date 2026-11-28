# Deployment record: adviser temporary pass requests and Logistic Operator

Published 2026-11-28, 09:10–09:24 UTC (17:10–17:24 Manila), project `bnhs-sims`. The user ran every step from
PowerShell with `publish.ps1`; each step passed its pre-check, then was verified by `check-live.cjs` or
`verify-hosting.mjs`.

Source: SMARTA `master` `191e348` (PR 109). Based on the live line from `../2026-11-27-temp-id-pass/`.

## Result

| Step | Published | Before | After |
|---|---|---|---|
| Indexes | 4 `temp_pass_requests` composite indexes (adds only) | 33 indexes | 37, all READY |
| Functions | 7 new request functions; `issueTempPassFn`, `saveStudentPhotoFn`, `getStudentPhotoFn` | 81 functions | 88; revisions in `live-state.json` (new ones `*-00001-*`, changed ones `*-00002-*`) |
| Firestore rules | live rules plus Logistic Operator and request additions (`rules.diff`) | ruleset `0194fed6` | ruleset `aac1e3ad` |
| SIMS hosting | 2026-11-27 release tree plus PR 109 (`port-sims.mjs`, `port-report.json`) | version `628b6aa03e5fd26c`, `index-NF6hKelY.js` | version `bd77dc983b08d1e8`, `index-D7mVtpF_.js`, 70/70 files match (`sims-live-verification.json`) |
| Account functions | `createStaffUserFn`, `updateStaffUserFn`, `setStaffUserDisabledFn`, `resetStaffPasswordFn`, `deleteStaffUserFn`, `changeOwnPasswordFn` | revisions `*-00007-*` (2026-10-12) | `*-00008-*` |
| Parent hosting | fresh build of `191e348` by its release script | version `a5bcf5096a1ea7dd` | version `7d96a7a961a7678d`, 61/61 files match (`parent-live-verification.json`); initial load 221.0 KB gz (limit 260 KB) |

Not published: the kiosk (no change), `onScanEventCreated` (its live copy carries the hand-applied pass check).

## What production runs now (bases for the next release)

- **Rules:** `firestore.rules` in this folder (ruleset `aac1e3ad`), not `master`'s file.
- **Functions:** the 16 names above come from the school-family backend preparer on `191e348`
  (`onScanEventCreated` untouched). The other 72 functions were not touched.
- **SIMS:** the 2026-11-27 release tree plus `port-sims.mjs`; `staffQueries` is still left out.
- **Order that was used:** indexes, functions, rules, SIMS, account functions, Parent. The Parent App was
  not deployed before the request functions were live.

## Checks

Before publishing: functions tree 184 unit and 681 emulator tests (10 held tests skipped); SIMS tree 1059
tests; rules tests on the live-based file 228 passing against 216 on the old rules, none regressing (51 fail
on both, from features held back from production); `check-live.cjs` pre-flight for each step.

## Account functions

The six account functions ran source from 2026-10-12. Their new revisions carry six weeks of changes that
were already live in other functions, e.g. `callable.js` rate limits and `schoolIdentity`, `audit.js`,
`account.js` (`live-vs-prepared-account-functions.files.txt`). The pass functions differ from the live line
only by this feature (`live-vs-prepared-pass-functions.diff`).

## Not yet verified in production

Filing a request from the Parent App on a phone; the Requests tab against the real indexes; four passes on
A4 at 100% scale on paper and a gate scan of one; Lost and Damaged requests; decline and the adviser's inbox
notice; creating a Logistic Operator, changing its temporary password and checking it sees only ID Cards and
Students. Still to do in Settings: set **Pass pick-up place**.

## Rollback

Hosting: Firebase console > Hosting > Release history > the "before" version. Rules: publish ruleset
`0194fed6` (`../2026-11-27-temp-id-pass/firestore.rules`). Indexes: leave them. Functions: send traffic back
to the previous revision in Cloud Run (changed pass/photo functions `*-00001-*`, account functions
`*-00007-*`); leave the new request functions unused. Roll back rules and SIMS together.
