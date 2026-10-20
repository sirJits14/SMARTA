# Role-based registration and advisory slips — production release

Date: 2026-10-19 (Asia/Manila evening). Source: `master` at `e028a7f` (merge of PR #62).
Project: `bnhs-sims`. Preparer: `docs/releases/2026-10-19-registration/prepare.mjs`, which wraps the
adviser-sync release, so the held coordinator rollout stays out of SIMS.

## Baseline checks (before publishing)

- **SIMS:** the rebuilt adviser-sync release tree matched the live site 59/59 twice: once at the start, and again immediately before publishing (`sims-baseline-verification.json`).
- **Parent App:** the live site matched the 2026-10-19 School access record 49/49 (main script `index-NXoslati.js`), checked immediately before publishing.
- **Functions:** 56 live (`functions-before.json`).
- **Firestore rules:** not redeployed. The production ruleset has no catch-all and no `advisory_slips` match, so the new collection is already closed to all clients. The preparer refuses to run if that changes.

## Published

| What | How | Result |
| --- | --- | --- |
| 19 Functions | `firebase deploy --config firebase.registration-release.json --only functions:<19 names>` from the prepared backend | All ACTIVE, 62 live (`functions-after.json`). `revokeAdvisorySlipFn` failed once on a transient GCF auth timeout and succeeded on retry (`functions-deploy*.log`). |
| SIMS hosting | same config, `--only hosting:sims` | 61/61 files match (`sims-hosting-verification.json`). Main script `assets/index-DA7LcfDk.js`. |
| Parent hosting | root `firebase.json`, `--only hosting:parent`, built from `e028a7f` | 50/50 files match (`parent-hosting-verification.json`). Main script `assets/index-C9Vz8RrN.js`. Initial load 220.8 KB / 260 KB. |

The 19 Functions:
- New: `issueAdvisorySlipsFn`, `revokeAdvisorySlipFn`, `listAdvisoryStatusFn`, `previewAdvisorySlipFn`, `redeemAdvisorySlipFn`, `migrateSubjectTeachersFn`.
- Updated:
  - school access: `getSchoolContextFn`, `requestSchoolRoleFn`, `resolveSchoolRoleFn`, `resolveSchoolRolesFn`, `replaceAdviserFn`, `assignSchoolRoleFn`, `revokeSchoolRoleFn`;
  - school year: `endSchoolYearFn`;
  - announcements: `getPortalAnnouncementsFn`, `getPortalAnnouncementFn`, `announcementAudienceCountFn`, `onAnnouncementWritten`, `publishAnnouncementsJob`.

## Subject Teacher migration: not run (nothing to migrate)

A read-only count of production (`migration-dry-count.json`) found:
- 47 `school_accounts`, all of them advisers;
- 0 Subject Teacher assignments of either shape;
- 0 pending requests;
- 0 accounts holding both roles.

`migrateSubjectTeachersFn` stays deployed, but calling it now would change nothing.

## Release testing

- **Release SIMS tree:** 539/539 unit tests. A hash-normalised comparison with the live build showed that unrelated chunks differ only in the bundler's one-letter import aliases.
- **Prepared backend:**
  - unit tests 172/172;
  - emulator tests 102/102 across `schoolAccess`, `advisorySlips`, `schoolMigration`, `schoolYear`, `portalAnnouncements`, `announcements` and `legacyAttendanceRelease`.
- **Smoke test after release:** the new callables answer unauthenticated requests with 401, and both sites serve the new main scripts.

## Rollback

- **SIMS:** redeploy the adviser-sync release tree (`docs/releases/2026-10-19-section-adviser-sync/prepare.mjs`, build `sims/`), and verify against that record.
- **Parent App:** roll back to the previous release in the Hosting console. Its main script is `index-NXoslati.js`.
- **Functions:**
  - The six new callables can be deleted by name. No other function calls them.
  - Updated functions can be redeployed from the adviser-sync backend preparer by name.
  - Data written by the new code (`advisory_slips`, grade-level Subject Teacher assignments) is ignored by the old code.

## Open item

The consent notice still says a class adviser can link "using the school's slip". That predates this release, and changing it is a policy decision, possibly with a `consentVersion` bump.
