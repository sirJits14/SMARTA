# Production deployment: faster search (SIMS)

On October 15, 2026 the user asked for this to be merged, pushed and deployed. The branch `claude/sims-search-optimization-910cfd` was brought up to date with `master` (merge `da47a76`) and fast-forwarded onto `master`, which was pushed before publication. Only `hosting:sims` was published.

Spec: `docs/superpowers/specs/2026-10-15-search-optimization-design.md`. Plan: `docs/superpowers/plans/2026-10-15-sims-search-optimization.md`, Task 8.

## Source

The broader coordinator rollout is still held. Production is built from the release tree, and so is this release. Neither the root hosting build nor the root rules were published.

The live baseline was rebuilt following `../2026-10-15-glc-section-editing/README.md`:

1. Prepared the password release from a temporary detached checkout of `670c87e`.
2. Applied the six live overlays and `../2026-10-15-pm-session-sims/sims-pm-port.patch`.
3. Added `shared/sectionEditing.js` and `src/data/coordinatorSections.js` from `e31b6b1`.
4. Added the two adapted files from `../2026-10-15-glc-section-editing/release-source/`.

That build matched production byte for byte: 55 of 55 files, with main script `/assets/index-Q_dGAsL7.js`. See `baseline-hosting-verification.json`.

## Port

Changes in `052dc02..3c08a05` that applied cleanly to the tree:

- **New files:** `src/lib/search.js` (index), `src/lib/subscriptionRegistry.js`, `src/lib/session.js` and `src/session.js`, each with its tests.
- **Firestore setup and sign-out:** `src/firebase.js` (multi-tab persistent cache), `src/App.jsx` and `src/components/ChangePassword.jsx`. Every sign-out now goes through `endSession`, and a tab signed out elsewhere clears its cache and reloads.
- **Guardians tabs:** Links, Reports, Requests and Scan Log now load only the current school year's enrollments, and their search uses the deferred query.
- **ID Cards:** the page and its Saved batch tab load current-year enrollments, and Saved batch searches the index.
- `tests/browser/registrar-fixture.js`.

Two files were adapted by hand. The tree has no `useStaffCollectionResource` or `src/lib/staffQueries.js`, both of which belong to the held rollout. The exact files are in `release-source/`:

- **`src/hooks/useCollection.js`:** the branch version, minus `useStaffCollectionResource` and its `staffQueries.js` import. `useCollectionResource` is shared through the registry. `useSchoolYearEnrollments` and `useSharedQueryResource` are added.
- **`src/pages/StudentsPage.jsx`:** the branch version, but the three roster subscriptions keep production's `useCollectionResource('students' | 'sections' | 'enrollments')`.

`src/lib/staffQueries.js` and its test were left out. They are not in the tree.

Future releases from the held-rollout tree must reapply all of this on top of the earlier overlays, the PM patch and the section-editing files.

## Verification

- **Branch:** 520 unit tests passed after merging `master`, and 129 Firestore rules tests passed (6 skipped by their existing condition).
- **Release tree:** 461 unit tests passed (436 before this change).
- **Registrar browser regression (tree):** 10 of 12 PASS, including all four ID card saved-batch checks, among them "Search offers enrolled learners not in the batch". Two checks fail: "Coordinator section print never asks to mark" and "Sidebar brand is the SMARTA wordmark". Both fail the same way with this port's ID Cards changes reverted, so they predate this release.
- **Build comparison against the live-equivalent build, ignoring content hashes:**
  - No files were added or removed.
  - **Changed in substance:** the main script (Firestore setup, session, hooks, registry), `search`, `StudentsPage`, `LinksTab`, `ReportsTab`, `RequestsTab`, `ScanLogTab` and `IDCardsPage`.
  - Other changed chunks differ only in renamed import bindings.
- **Before publishing:** the live `index.html` was rechecked against the baseline immediately before.
- **Publish command:**
  ```
  NODE_OPTIONS=--dns-result-order=ipv4first npx firebase deploy --project bnhs-sims --config firebase.search-release.json --only hosting:sims --non-interactive
  ```
  The config contains only the `sims` hosting target (identical to `../2026-10-15-glc-section-editing/hosting-config.json`). See `hosting-deploy.log`.
- **Byte check:** all 55 files served by https://bnhs-sims.web.app match the deployed build by SHA-256. The main script is `/assets/index-CFFzMvnY.js`. See `hosting-verification.json`.

No functions, Firestore rules or indexes, school records, Parent App hosting or kiosk hosting were changed.

**Not yet checked in production:**
- Page-open timing.
- Signing out with two tabs open: the other tab should reload, and the `firestore/*` IndexedDB database should be gone.
- A forced sign-out notice after the reload.

## Measured

On 3,000 synthetic learners, per-keystroke search went from 9–132 ms (filter plus DepEd sort) to 0.1–0.2 ms with the index.

## Rollback

In the Firebase console, roll SIMS hosting back to the preceding version, whose main script is `/assets/index-Q_dGAsL7.js`.

Tabs that already ran this version keep their on-disk Firestore cache. The old build reopens it through the deprecated single-tab API, which is the same state as before this release.
