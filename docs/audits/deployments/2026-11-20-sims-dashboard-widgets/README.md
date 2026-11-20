# SIMS dashboard widget grid (PR #99): release preparation

Prepared 2026-11-20. **Hosting only (`hosting:sims`).** No functions, rules, indexes or Parent App changes. Claude prepared,
built and verified the release. The publish is left to the user (`publish-sims.ps1`). This README describes the state
**before publishing**. The "After publishing" section is filled in once the script has run.

## What is released

PR #99 (`sirJits14/SMARTA`, merged as `384d2ea`; pre-PR master `24337fa`) rewrites the SIMS Dashboard as a widget grid
with detail drawers: a KPI strip; Enrollment, Coverage, Attendance, Sex, Attention, Notice board, Calendar/Upcoming and
Activity cards, each opening a drawer. It changes only SIMS front-end source: 28 files under `src/` and
`shared/theme/literals.test.js` (`git diff --stat 24337fa 384d2ea -- src shared`). `DESIGN.md` and `docs/` are not shipped,
and `src/main.jsx` is not touched.

Data the dashboard reads, all existing and all permitted by the live ruleset (`bda90c80…`, see the 2026-10-30 record):

- `students`, `sections`, `enrollments`, `student_attendance`: staff read, as before.
- `announcements`: staff `get, list`. This listener is new for the dashboard. It shares one listener with the Announcements page (`announcements|all`).
- `id_card_batch`: admin only. The listener opens only for administrators.
- `getLearnerRequestCountFn`: the existing callable. It uses the same shared count as the sidebar badge.

## Live before

- Release `544ea3ffca0ea5be` (2026-10-30T14:43:42Z, "SIMS Recently approved ID cards (PR 98) over live release
  c710ecc0a091f5d4"), main script `/assets/index-CH2PMZML.js`, 65 build files. It is still the newest SIMS release
  (release listing checked read-only on 2026-11-20).

## Baseline: reproduce live first

The live chain is caps-names + legacy-adviser port + PR #90 + PR #91 + PR #93 + PR #94 + learner-requests overlay
(2026-10-28 record, PR #96 branch `claude/learner-requests-deployment-record`) + ID-cards overlay (2026-10-30 record, PR
#98 branch `claude/student-approval-qr-printing-04f9fa`). The learner-requests overlay was hand-ported and saved only as
hashes, so the tree that produced live was taken from the preserved prepared tree of the 2026-10-30 release:

1. Copy `…/.claude/worktrees/student-approval-qr-printing-04f9fa/.superpowers/releases/idcard-approved/release` to
   `.superpowers/releases/dashw/release`, leaving out `node_modules`, `dist`, `dist-live`, `.firebase` and the nested
   preparer output `a/`. From PowerShell:
   `robocopy <src> <dst> /E /XJ /XD node_modules dist dist-live .firebase <src>\a`.
2. Re-verify the source. The 23 learner-requests overlay hashes (10-28 `sims-source-manifest.json`) and the 7 ID-card
   overlay hashes (10-30 `sims-source-manifest.json`) all match. The full baseline source is hashed in
   `sims-source-manifest.json` (`baseline.files`, 280 files, CR-insensitive). With it, a tree rebuilt by any other route
   can be checked.
3. Junction the main checkout's root `node_modules` into `<tree>/sims`, then build with the main `.env` loaded **into the build
   process only** (never copied or printed), from Bash:
   `(cd <tree>/sims && set -a && . <main>/.env && set +a && unset VITE_APPCHECK_DEBUG_TOKEN && export VITE_USE_EMULATORS=false && node <main>/node_modules/vite/bin/vite.js build)`
4. Result: **65 of 65 files identical to the 2026-10-30 `sims-hosting-verification.json`, and 65 of 65 byte-identical to the live
   site, 0 mismatched** (`sims-baseline-verification.json`). The build was kept as `<tree>/sims/dist-live`.
5. Tree tests (`node <main>/node_modules/vitest/vitest.mjs run`, cwd `<tree>/sims`): **77 files, 808 tests passed**, the same as the 10-30
   record.

## Port of PR #99

All 11 existing files the PR touches were compared with `24337fa` (CR-insensitive). Nine were identical. Two differed:
`src/pages/DashboardPage.jsx` (the tree uses `useCollectionResource(path)`, because it has no `useStaffCollectionResource`) and
`shared/theme/literals.test.js` (the tree's `THEMED_CSS` lists `parent/src/glass.css`). None of the 17 new files existed in the
tree.

Recipe (from the worktree root, Bash; `T=.superpowers/releases/dashw/release/sims`):

1. LF-normalise the 11 touched files in the tree: `sed -i 's/\r$//' "$T/<file>"` for each file in
   `git diff --name-only --diff-filter=MD 24337fa 384d2ea -- src shared`.
2. `git apply --directory=$T dashboard-port.patch` (this folder). The patch is the exact tree change: 28 files, +1600 −174,
   the same numstat as the PR. It was checked to apply to an LF copy of the baseline files. The same result comes from
   `git diff --binary 24337fa 384d2ea -- src shared/theme/literals.test.js | git apply --directory=$T --exclude="$T/shared/theme/literals.test.js" --exclude="$T/src/pages/DashboardPage.jsx"`,
   followed by the three manual steps below.
3. Hand edits (the files after the edits are in `release-source/`):
   - `src/pages/DashboardPage.jsx`: copied unchanged from `384d2ea`. The PR moved all data loading into
     `useDashboardData.js`, so the tree's own hook lines no longer exist in the new page.
   - `src/components/dashboard/useDashboardData.js`: the import drops `useStaffCollectionResource`, and the four
     `useStaffCollectionResource('<path>', { me, schoolYear })` calls become `useCollectionResource('<path>')`. These are the
     same reads the live dashboard makes; master's staff-scoped queries belong to the held coordinator rollout. The
     scoping is unchanged: `scopeRoster(..., grades(me), schoolYear)` is identical in the tree and master.
   - `shared/theme/literals.test.js`: `'src/dashboard.css'` added to the tree's own `THEMED_CSS` list. The tree keeps
     `parent/src/glass.css` rather than master's Parent CSS list.
4. Line endings: `git apply` on this machine (`core.autocrlf=true`) wrote CRLF. The files were then LF-normalised, and a build
   with LF files is byte-identical to the build with CRLF files, so line endings do not affect the bundle.

Every other dependency of the new code already exists in the tree: `useCollectionResource`, `useQueryResource`, `useLocalToday`,
`useLearnerRequestCount`, `access.js` (`canOpen`, `grades`, `isAdmin`, `scopeRoster`, page key `learnerRequests`),
`shared/sessionAttendance.js` `attendanceUnits`, `shared/announcements.js` `toMillis`, `src/lib/announcements.js`
`audienceLabel`, `schoolAssignments.js` `shortDate`, `roster.js`, `constants.js`, `GradePills.jsx`. After the port, the tree differs from the
baseline in exactly the PR's 28 paths (`sims-source-manifest.json`, `ported`). Nothing outside the PR's hunks changed in
`ui.jsx`, `NavIcon.jsx`, `GradeBarChart.jsx` or `registrar.css`.

Feature preservation:

- PR #93/#94 recently enrolled sections: `recentEnrolledSections` still caps at 30, and the list now sits in the Enrollment
  drawer's "Sections" table (all ≤30 rows at once). It replaces the old inline 5/30 "Show more sections" toggle, as PR #99
  intends.
- Learner-requests sidebar badge (`Shell.jsx`) is not touched. The dashboard's Attention card reuses the same shared count.
- ID Cards Recently approved, caps names, grade image export and import error navigation are in files PR #99 does not touch.
- The retired `registrar.css` dashboard rules (`.sims-attention-card`, `.sims-recent-sections`, …) are used by no other
  file in the tree.

## Checks

- Tree tests: **79 files, 842 tests passed** (baseline 77 / 808, plus `dashboardStats.widgets.test.js` and
  `useDashboardPanel.test.js` and the extended `dates.test.js`: +2 files, +34 tests).
- Build: main script `assets/index-hCVkXjug.js`, **68 files**. A second build was byte-identical (68/68).
  `sims-hosting-verification.json` holds every expected SHA-256.
- reCAPTCHA Enterprise site key (40 characters, `6L…`, from the main `.env`) is **present once**, in `assets/ui-Coz8_du3.js`,
  the same `ui` chunk position as live (`ui-DSCiEOWm.js`). No emulator hosts and no `connect*Emulator` calls are in the
  bundle. The build used `VITE_USE_EMULATORS=false` and no App Check debug token.
- CSS: `.sims-dash-layout` is present (new `assets/DashboardPage-DgzRHRxQ.css`). `.sims-attention-card` and
  `.sims-recent-sections` are gone (the PR removed those rules), and the main CSS shrank from 34,586 to 30,481 B.
- Hash-normalised comparison of `dist-live` and the new `dist` is in `build-diff.txt` (41 of 67 normalised names identical; two
  `dates-*` chunks share one normalised name, and `dates-BmMLuwUb.js` is byte-identical). Real changes:
  - Added: `DashboardPage-*.css`, `announcements-*.js` (`src/lib/announcements.js`, now shared by the dashboard and the
    Announcements page), `sessionAttendance-*.js` (`shared/sessionAttendance.js`, now shared by `dashboardStats`, the
    attendance pages and `attendance-*.js`).
  - Changed by the feature: `DashboardPage-*.js` (11.3 → 42.2 KB), `dates-*.js` (`src/lib/dates.js`), `ui-*.js` (`ui.jsx`
    Modal `closeLabel`, ResourceState `inline`), `index-*.js` (main, +154 B), `index-*.css` (registrar.css rules removed),
    `AnnouncementsPage`, `attendance`, `AttendanceSummaryPage`, `AttendanceTakePage` (code moved out to the two new shared
    chunks), and `GuardiansPage` (one extra preload index).
  - Same-size chunks marked CHANGED (`AccountsPage`, `CodesTab`, `SectionsPage`, `StudentsPage`, …) differ only in
    minified import aliases and chunk hashes, as in earlier releases. `index.html`, `sw.js` and `manifest.webmanifest`
    are identical after normalisation.
- Not done: a browser smoke test. The built app talks to production Firebase, and App Check rejects automated
  browsers.

## Publish (user)

`publish-sims.ps1` (this folder), from Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\jitsb\OneDrive - Department of Education\Desktop\APPS\bnhs-sims\.claude\worktrees\dashboard-ui-expandable-widgets-8d3491\docs\audits\deployments\2026-11-20-sims-dashboard-widgets\publish-sims.ps1"
```

The script:

1. Refuses to continue unless live is still `index-CH2PMZML.js`.
2. Checks that the prepared dist is the verified 68-file build and that the site key is in exactly one asset.
3. Sets `NODE_OPTIONS=--dns-result-order=ipv4first` and runs
   `npx firebase deploy --config <tree>\firebase.dashboard-widgets-release.json --project bnhs-sims --only hosting:sims --message "SIMS dashboard widget grid (PR 99 source 384d2ea) over live release 544ea3ffca0ea5be"`.
4. Waits 10 s and byte-compares all 68 live files with `sims-hosting-verification.json`, rewriting that file with the live
   result.

`firebase.dashboard-widgets-release.json` here is a copy of the config in the prepared tree: hosting target `sims` only,
`public: sims/dist`, and the same headers as the 2026-10-30 release. The prepared tree's `.firebaserc` maps target `sims` to site
`bnhs-sims`.

## After publishing

Not yet published. To be filled in after `publish-sims.ps1` runs: the new release id, the live main script
(`index-hCVkXjug.js` expected), and the 68/68 result from `sims-hosting-verification.json`.

## Rollback

Firebase console > Hosting > Release history > roll back to `544ea3ffca0ea5be`. The verified baseline build stays as
`.superpowers/releases/dashw/release/sims/dist-live` (git-ignored). Delete `sims/node_modules` with `.Delete()` before
ever removing that tree.

## Not verified

- No signed-in production walkthrough. App Check rejects automated browsers. Someone should open the Dashboard on a real
  device as an Administrator and as a Grade Level Coordinator, open each drawer, and confirm that the Enrollment drawer's
  Sections table, the Notice board and Calendar, and (admin) the ID-card count load without permission errors.
- The release tree's dashboard was never rendered, locally or in production. It is covered only by the tree's unit tests
  (no test renders `DashboardPage` itself). Any browser review of PR #99 ran on master, with master's staff-scoped data hooks.
