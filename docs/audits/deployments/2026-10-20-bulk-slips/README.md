# Bulk advisory slip printing — production release

Date: 2026-10-20 (Asia/Manila morning). Source: `master` at `275a9db` (merge of PR #64).
Project: `bnhs-sims`. Preparer: `docs/releases/2026-10-20-bulk-slips/prepare.mjs`. It wraps the
role-based registration release, so the held coordinator rollout stays out of SIMS.

SIMS hosting only. No Functions, Firestore rules or Parent App changes: `issueAdvisorySlipsFn` already takes a
list of section ids.

## Overlay (`release-source/`)

- `src/lib/advisoryStatus.js` and its test: copied unchanged from `275a9db`.
- `src/pages/SectionsPage.jsx`: `275a9db`'s file with the release tree's collection hooks (`useCollectionResource`
  instead of `useStaffCollectionResource`). This is the same swap as the 2026-10-19 registration port, and the only
  difference from master.
- `src/pages/SectionsPage.test.js`: `275a9db`'s test, with the same hook name in its mock. The tree's old test still
  expected the removed all-grades button.

## Baseline check (before publishing)

The rebuilt registration release tree matched the live site 61/61 (`sims-baseline-verification.json`).

## Release testing

- **Release tree:** 544/544 unit tests.
- **Build comparison:** compared with the baseline build, with hashed file names normalised in both names and
  contents, only the `SectionsPage` chunk differs. The sticky bar's `school-bulk-bar` style is already in the tree's
  `registrar.css`.

## Published

| What | How | Result |
| --- | --- | --- |
| SIMS hosting | `firebase deploy --config firebase.bulk-slips-release.json --only hosting:sims` | 61/61 files match (`sims-hosting-verification.json`). Main script `assets/index-CMhPOmry.js`. |

## Rollback

Redeploy the registration release tree (`docs/releases/2026-10-19-registration/prepare.mjs`, build `sims/`), or roll
back to the previous release in the Hosting console. Its main script is `index-DA7LcfDk.js`.
