# Production deployment: optional PM session (SIMS)

On October 15, 2026, after `../2026-10-15-pm-session-functions`, SIMS was released from the release tree with the PM session changes from PR #31 (`4acf334`) hand-ported in. Only `hosting:sims` was published.

## Source

The coordinator rollout is still held on `master`. As in the earlier releases, the tree was prepared from a temporary detached checkout of `670c87e` (25 callables) with `node scripts/prepareTemporaryPasswordRelease.mjs .superpowers/releases/pm-session`. These live overlays were then applied with `git diff --binary … | git apply --directory=…`:

1. `c1b9883`, without `scripts/build-logos.py`
2. `cb1e514`
3. `1ae23c4..a2db95a -- src/`
4. `670c87e..1929223 -- src/`
5. `f0f5b17^..f0f5b17`
6. `165dd5f^..165dd5f`

That build reproduced production byte for byte: all 54 files matched, with main script `/assets/index-BZpKYIEs.js`.

## Hand port

`sims-pm-port.patch` is the complete change on top of the tree. It applies cleanly to `26a6ed7`, and none of the overlays touch these files.

- **Applied unchanged from the PR:** `shared/scheduleSessions.js` (with its test), `src/lib/attendance.js`, `src/lib/schedules.js` (both with their tests) and `src/pages/SchedulesPage.jsx`.
- **Adapted by hand**, because the tree uses `useCollectionResource`/`useDocResource`, not the held `useStaffCollectionResource`:
  - `src/data/schedules.js`: `createSchedule` keeps the tree's shape, with no `gradeLevels: []`.
  - `src/pages/AttendanceTakePage.jsx`: schedules load with `useCollectionResource('schedules')`, kept out of `resources`. The attendance doc still comes from `useDocResource`, and `saveMarks` keeps the tree's signature.
  - `src/pages/AttendanceSummaryPage.jsx`: only the tooltip change.
- **Left out:** `src/data/scopeMetadata.test.js`, which is coordinator-only and not in the tree.

Compared with the PR, ignoring line endings, the ported files differ only in those coordinator hook and argument lines.

## Verified

- Tree tests: 425 passed. The wrapper's `verify` passed.
- Compared with the live-equivalent build, ignoring content hashes:
  - **Changed in substance:** the Attendance Take, Attendance Summary and Schedules page chunks, the `attendance` chunk and the main script, which now exports `deleteField`.
  - **Added:** one shared chunk, `scheduleSessions`.
  - Other changed chunks differ only in renamed import bindings.
- The live `index.html` was rechecked against the baseline immediately before publishing.
- **Command:** `node scripts/deployTemporaryPasswordRelease.mjs hosting`, which published hosting:sims only.
- **Byte check:** all 55 files served by https://bnhs-sims.web.app match the deployed build by SHA-256; see `hosting-verification.json`. The main script is `/assets/index-urwiHn6y.js`.
- **Not yet checked in production:** ticking "Add afternoon session (PM)" on a real schedule, and the AM/PM columns on the Take Attendance page.

## Follow-up

Later SIMS releases from the release tree must apply the six overlays above plus `sims-pm-port.patch`, or they will drop these changes. When the hold lifts, all of this is in `master` once PR #31 is merged.

## Rollback

Roll back to the previous SIMS hosting version (the QR cutting-guide transparency release) in the Firebase console. Any PM times already saved on schedules stay, and the functions keep splitting taps for those schedules. To stop that, clear the PM times on those schedules before rolling back.
