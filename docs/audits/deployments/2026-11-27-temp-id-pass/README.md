# Deployment record: temporary ID passes and learner photos

Published 2026-11-27, 13:52–14:17 UTC (21:52–22:17 Manila), project `bnhs-sims`. The user ran
every step from PowerShell with `publish.ps1`; each step passed its pre-check, then was verified.

Source: SMARTA `master` `05864bc66075d43cab25779cea8b00240355b53a` (PR 107 merge `59b10b6`; the
later merge changes one line of `firebase.json`). Kiosk: `master` `d28c9ea` (kiosk PR 9).

## Result

| Step | Published | Before | After |
|---|---|---|---|
| Storage | switched on (`bnhs-sims.firebasestorage.app`, `ASIA-SOUTHEAST1`); deny-all rules | none | ruleset `cc52a03f` |
| Functions | 6 new, `onScanEventCreated`, `getSchoolRosterFn` | 75 functions | 81 functions; revisions in `live-state.json` |
| Firestore rules | live rules plus the pass additions (`rules.diff`) | ruleset `ebaacb5d` | ruleset `0194fed6` |
| Kiosk hosting | build of `d28c9ea` | version `a49e53df3c72e454` | release `1795788204511000`, version `af3b911fde2bd2c5`, 17/17 files match |
| SIMS hosting | PR 106 release tree plus PR 107 | version `1680e6bacdf293c9`, `index-Zt08fD3E.js` | release `1795788340639000`, version `628b6aa03e5fd26c`, `index-NF6hKelY.js`, 70/70 files match |
| Parent hosting | fresh build of `05864bc` by its release script | version `88863933447e311b` | release `1795789026611000`, version `a5bcf5096a1ea7dd`, `index-CuoSl-ld.js`, 60/60 files match |

File-by-file results: `sims-live-verification.json`, `parent-live-verification.json`,
`kiosk-live-verification.json`. SIMS now sends `Permissions-Policy: geolocation=(), camera=(self),
microphone=()`. Parent initial load 220.5 KB gz (limit 260 KB); its CSS has the current button and
header classes and no `theme-menu-btn`.

## What production runs now (bases for the next release)

- **Rules:** `firestore.rules` in this folder. It is the live line, not `master`'s file.
- **Functions:** the eight published names come from the 2026-10-18 school-family backend preparer on
  this source, plus `scanAttendance.diff` on the preserved live scan handler. The other 73 functions
  were not touched. Those that write `learners/*` do not copy `photoUpdatedAt` until redeployed.
- **SIMS:** the 2026-11-26 dashed-border tree plus `port-sims.mjs` (keeps "Recently approved";
  leaves out `staffQueries`). `build-diff.txt` lists the changed files.

## Checks

Before publishing: all 53 pass rules tests on the new live-based rules, no test passing on the old
rules failing on the new; functions tree 183 unit and 212 emulator tests (10 held tests skipped);
SIMS tree 988 tests; kiosk 208 tests; the previous SIMS and kiosk builds were rebuilt and matched
the live sites byte for byte (69/69, 17/17).

After publishing: `check-live.cjs` passed for storage, functions and rules; no warning or error log
entries from the eight functions as of 14:18 UTC.

## Not yet verified in production

No gate scan, photo upload or pass had been processed when this was written. Still to do: reload
the kiosk computers; scan an official ID card; set the principal in Settings; upload one photo as an
adviser and view it as a guardian; print a pass on paper and scan it; print that learner's official
card and confirm the gate refuses the pass.

## Note on the Parent step

The first run stalled on Git's `Should I try again? (y/n)` prompt while its automatic cleanup tried
to delete folders locked by OneDrive. It was stopped before building. `publish.ps1` now disables
Git auto-maintenance for itself and its child processes; the second run completed.

## Rollback

Hosting: Firebase console > Hosting > Release history > the "before" version. Rules: publish the
previous ruleset `ebaacb5d`. Functions: restore `onScanEventCreated` from the previous prepared tree
only after the kiosk and rules are rolled back, because the old handler accepts a pass scan without
checking it.
