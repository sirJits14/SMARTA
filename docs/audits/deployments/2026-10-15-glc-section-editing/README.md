# Production deployment: Grade Level Coordinator section editing

On October 15, 2026 the user requested merge, push and deployment. Feature commit
`e31b6b1` was merged into `master` as `e6285ef` and pushed before publication.

Grade Level Coordinators can edit an existing section's name, adviser name and
existing schedule/shift assignment in their assigned grade. Only the configured
current school year and the immediately following year are eligible; the window
rolls with settings, and ended years are locked. Section creation/deletion,
grade/year/track/strand changes, learner/enrollment edits and schedule definitions
remain Administrator-only. JHS/SHS academic coordinators remain view-only for
section metadata. Next-year setup contains section metadata only.

## Limited production source

The broader coordinator grade-isolation rollout remains held for the existing
school-record warnings. Neither the root hosting build nor root rules was
published. Existing production roster read permissions are unchanged.

The production UI baseline was recreated exactly as documented in
`../2026-10-15-pm-session-sims/README.md`: prepare the password release from
`670c87e`, apply its six live overlays and `sims-pm-port.patch`. Before this
feature, all **55** locally built files matched the live site by SHA-256, including
main script `/assets/index-urwiHn6y.js`. See `baseline-hosting-verification.json`.

Only these runtime UI changes were then applied:

- `shared/sectionEditing.js` and `src/data/coordinatorSections.js` from `e31b6b1`.
- The Sections page from that commit, with its four subscriptions adapted to
  production's existing `useCollectionResource` API. No held query helper was added.
- Only the new permission-helper import/export and `canEditSection` added to the
  existing release `src/lib/access.js`.

The two exact adapted files are saved under `release-source/`. Future releases
from the held-rollout release tree must preserve this adapter, the two runtime
files from `e31b6b1`, and the existing PM and earlier live overlays. The root source
already contains the complete feature for when the broader hold is lifted.

The restricted hosting configuration contains **only** `hosting:sims`. The local
publication guard checked hashes of 225 release source/build files and rechecked
the live baseline HTML immediately before publishing. `hosting-manifest.json`
and `hosting-config.json` preserve the reviewed selection and hashes.

## Functions published first

Only these new functions were deployed from the tested feature source:

```powershell
firebase deploy --project bnhs-sims --non-interactive --only "functions:getCoordinatorSectionOptionsFn,functions:updateCoordinatorSectionFn"
```

Both use the existing App Check, staff identity and session gate. Their handlers
recheck the stored role/grade/session, section, current-year setting and ended-year
marker in a transaction. Saves accept only the three approved fields, maintain
shared-schedule grade audiences atomically and audit the actor and changed fields.

The first attempt stopped before upload because the worktree lacked the existing
public `PORTAL_URL` parameter. Restoring `https://bnhs-parent.web.app` and retrying
succeeded. No credentials or environment files are committed.

Both functions are ACTIVE on Node.js 22 in `asia-southeast1`:

- `getCoordinatorSectionOptionsFn`: `getcoordinatorsectionoptionsfn-00001-wub`.
- `updateCoordinatorSectionFn`: `updatecoordinatorsectionfn-00001-ric`.

For each deployed source archive, the entrypoint, handler, callable gate, school
year helper, shared section/role helpers and error module match the reviewed local
files. Both endpoints return **401 UNAUTHENTICATED** for unauthenticated requests.
All **34** previously deployed function revisions and source references remain
unchanged. See `functions-before.json`, `functions-verification.json` and
`functions-deploy.log`.

## Verification and hosting publication

- Merged main checkout: SIMS **476** tests and Functions unit **146** tests passed.
- Feature verification before merge: Functions/Auth emulator **230** tests passed;
  Firestore rules **129** tests passed, with six alternate password-release
  compatibility tests skipped by their existing condition.
- Exact production UI release: **436** unit tests and all **nine** synthetic
  browser checks passed. Independent review found no remaining actionable issues.
- Production-config build passed, retaining the existing large-chunk warning.
- Hosting publication used an explicit `--only hosting:sims` and a configuration
  with no Functions, rules or indexes targets. See `hosting-deploy.log`.
- All **55** files served by https://bnhs-sims.web.app match the published build by
  SHA-256. Main script: `/assets/index-Q_dGAsL7.js`. See `hosting-verification.json`.

No school records, backfill, account changes, Firestore rules/indexes, existing
functions, Parent App hosting or kiosk hosting were changed. A real GLC sign-in
and save against a live school section was not performed; authorization and save
behavior were exercised with emulator data and synthetic browser records.

## Rollback

Restore the preceding SIMS Hosting version with main script
`/assets/index-urwiHn6y.js` to remove the editor from the UI. The new callables enforce
the approved permission independently of the UI; fully revoking that permission
also requires disabling or removing these two new endpoints. Existing edits remain
saved. Do not roll back unrelated functions or publish the held root rules.
