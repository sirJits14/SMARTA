# School Access adviser section sync release

This release applies the adviser-sync change to the deployed School Access
review bundle. It preserves the held coordinator rollout. The baseline build
matched all 59 live SIMS files, and the previous production Firestore rules
matched exactly before preparation. The deployed `updateCoordinatorSectionFn`
handler also matched the pre-change source exactly.

## Preparation

Run from the repository root at the merged release commit:

```powershell
node docs/releases/2026-10-19-section-adviser-sync/prepare.mjs
```

The output defaults to `.superpowers/releases/section-adviser-sync/release`.
Choose a new output path if that directory already exists. The preparer creates
`firebase.section-adviser-release.json` and prepares:

- SIMS from the prior production bundle, with only the adviser editor/detail
  changes and protected adviser writes. Existing broad collection reads remain
  unchanged. The release data module uses transactions without introducing the
  held schedule audience-maintenance client changes.
- Functions through the established School/Family backend preparer. The live
  scan handler and attendance compatibility adaptations remain intact.
- Firestore rules that add only server-owned section adviser metadata and
  adviser/scope write protection to the previous production rules.

Provide the existing Vite environment through the build process, and the
existing Functions dependencies plus `PORTAL_URL=https://bnhs-parent.web.app`
to the prepared backend. No credentials belong in this release directory.

## Publish

Only these seven existing Functions are affected:

```powershell
$env:NODE_OPTIONS = '--dns-result-order=ipv4first'
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '120'
firebase deploy --project bnhs-sims --config firebase.section-adviser-release.json --non-interactive --only "functions:resolveSchoolRoleFn,functions:resolveSchoolRolesFn,functions:replaceAdviserFn,functions:assignSchoolRoleFn,functions:revokeSchoolRoleFn,functions:deleteGuardianAccountFn,functions:updateCoordinatorSectionFn"
firebase deploy --project bnhs-sims --config firebase.section-adviser-release.json --non-interactive --only firestore:rules,hosting:sims
node functions/scripts/backfillSectionAdvisers.mjs bnhs-sims
node functions/scripts/backfillSectionAdvisers.mjs bnhs-sims --apply
node functions/scripts/backfillSectionAdvisers.mjs bnhs-sims
```

Build the prepared SIMS tree before publishing. Do not deploy the root SIMS
build, all Functions, indexes, or the Parent App for this change.

Verify hosting with the existing `verifyHosting.mjs`, and deployed rules with
this directory's `verifyRules.mjs`. The final backfill preview must report no
remaining changes or warnings. Save deployment evidence under
`docs/audits/deployments/2026-10-19-section-adviser-sync/`.

## Validation

The root implementation passed 610 SIMS unit tests, 168 Functions unit tests,
320 emulator tests, 136 rules tests, 11 browser checks, and a production build.
The prepared SIMS release passed 526 tests, and the prepared backend passed
73 adviser and section integration tests. The production rules suite passed
80 tests with 11 existing release exclusions/skips. Its first run timed out
during emulator setup; increasing the setup allowance to 30 seconds produced
a clean rerun. The suite preserves the previous release's explicit
coordinator-rollout exclusions and adds the adviser ownership tests.

## Rollback

Use the prior Hosting version or rebuild the School Access review bundle.
Do not roll back adviser ownership rules alone while the sync markers remain:
that would allow manual edits to assigned advisers. Preserve section names and
remove ownership markers only as part of an explicitly coordinated rollback
of the assignment Functions and rules. The previous ruleset and Function
hashes are recorded in deployment evidence.

## Production result

Merged in [PR #61](https://github.com/sirJits14/SMARTA/pull/61) at
`f08efb6adf84ad7f901595a399be1d7c2a184f8b` after GitHub CI passed.
Deployed on 2026-10-19 to https://bnhs-sims.web.app. All seven selected
Functions are active with release hash `19e5eb229672d065cf2e569ce9c835d73b7ba18c`;
the Function inventory and all unrelated Function hashes are unchanged.
All 59 hosted files match the tested build, and the deployed Firestore rules
match the prepared release exactly.

The current-year backfill synchronized 47 sections for 2026-2027 without
warnings. A subsequent live dry run found no remaining changes or warnings.
Reports and deployment logs are in the corresponding deployment audit folder.
