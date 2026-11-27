# SIMS recently enrolled sections dashboard release

## Source and scope

Feature: PR #93, commit `1887cb011b986169f1f6eb46f2bc69f2b5487bd6`.
Merged source: `9f259badafb8c598a04a6e3519b179a44825d8eb`; fetched and fast-forwarded
to the current `origin/master` before the final production build.
The dashboard lists the five most recently enrolled sections, expandable to ten,
with latest recorded enrollment date and current enrolled learner count.
Only `hosting:sims` is selected. Parent hosting, functions, rules and indexes are excluded.

## Reproducible preparation

1. Fetch `origin/master`. Pre-feature baseline was `2b23a7cc19ce2be8ee1a90395bcd95a6b9aa45f4`.
2. Run `node docs/releases/2026-10-21-caps-names/prepare.mjs .superpowers/r`.
   Restore the generated change to the historical `firebase.caps-names-release.json`.
3. Reconstruct the live PR #91 release exactly as recorded in
   `../2026-10-22-sims-grade-image-export/README.md`: preserve both legacy-adviser
   fixes, copy PR #90's three import-preview files, and apply PR #91's
   `cb9e0db..bf3a892` diff to the named app/lib/Sections files. Adapt the section test
   mock from `useStaffCollectionResource` to `useCollectionResource`.
4. Build using the main checkout's existing production VITE configuration,
   with `VITE_USE_EMULATORS=false` and no App Check debug token. Do not print or commit it.
   The rebuilt baseline reproduced `index-v222Du5b.js`; all 61 files matched live
   SHA-256 hashes, recorded in `baseline-verification.json`.
5. Apply `git diff --binary 1887cb0^ 1887cb0 -- src` to the prepared SIMS tree.
   Adapt patch context to the release's existing `useCollectionResource` calls,
   retaining that release's data hooks and the held coordinator-rollout boundary.
6. Build the prepared source afresh with the same production configuration.
   `firebase.recent-sections-release.json` selects only this tree's SIMS bundle.

## Validation

- Main source: 74 test files, 773 tests passed; browser verified five initial rows,
  expansion, collapse, and retained learner list. Independent review had no actionable findings.
- Reconstructed production baseline: 69 files, 685 tests passed.
- Prepared release with feature: 69 files, 687 tests passed.
- Production build passed, main script `index-D5qJ_tSL.js`, dashboard chunk
  `DashboardPage-CJXFM58L.js`. Existing large-chunk warning remains.
- `source-manifest.json` records the prepared source hashes and feature revision.
- No signed-in production dashboard walkthrough was performed; local browser checks used synthetic data.

## Publication

Published successfully on October 27, 2026, using:

```powershell
$env:NODE_OPTIONS='--dns-result-order=ipv4first'
node node_modules/firebase-tools/lib/bin/firebase.js deploy --config firebase.recent-sections-release.json --project bnhs-sims --only hosting:sims --non-interactive --message 'SIMS recent enrolled sections dashboard PR 93 source 9f259ba'
```

GitHub CI job `122069198322` (run `40468369897`) passed before PR #93 was merged,
including SIMS, Functions and Parent tests/builds and the Firestore/Auth emulator checks.

The live HTML and all 61 deployed files match the new build byte for byte, with
zero mismatches. See `hosting-verification.json` for per-file SHA-256 values and
the exact UTC verification time. Live site: https://bnhs-sims.web.app.
