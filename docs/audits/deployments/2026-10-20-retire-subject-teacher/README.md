# Retire Subject Teacher — production release

Date: 2026-10-20/21 (Asia/Manila). Source: `master` at `579a2bf` (merge of PR #76). Project: `bnhs-sims`.
Spec: `docs/superpowers/specs/2026-10-20-retire-subject-teacher-design.md`.
Plan and release checklist: `docs/superpowers/plans/2026-10-20-retire-subject-teacher.md`.

Status: **published 2026-10-21 (Asia/Manila)**, every step verified. See "Published" below.

## Baseline (before publishing, all read-only)

- **Production data** (`production-count-before.txt`):
  - 54 `school_accounts`: 48 adviser rows and **9 `subject_teacher` rows held by 5 accounts**;
  - 0 Subject Teacher requests.
  - Two announcements list `subject_teacher` alongside other roles. `VcPMMOxoeCe9LgDTCsL7` is published and `S5ZG4EAeizizaT2XgVqI` is unpublished. After release the server skips the retired role, so both keep reaching Advisers and Curriculum Advisers. Opening either in the new SIMS editor drops the role.
- **Functions:** 62 live, including `migrateSubjectTeachersFn` (`functions-before.json`).
- **SIMS:** the rebuilt ui-modules release tree matched the live site 59/59 (`sims-baseline-verification.json`, main script `index-DIiDC7eb.js`).
  - This checkout writes `index.html` and `manifest.webmanifest` with CRLF line endings, but live has LF. The preparer normalizes both files to LF, which is why it matches.
- **Parent App:**
  - The live site matched its last record (`2026-10-20-parent-theme-settings`) 50/50 (`parent-baseline-verification.txt`).
  - A rebuild of pre-PR master (`a324143`) equals live in every file once hashed chunk names are normalized, except the Settings › About build stamp. That stamp embeds the build day and commit, so no rebuild can be byte-identical.

## What ships

### Functions (by name, from `docs/releases/2026-10-18-school-family/prepareBackend.mjs`)

**Prepared backend:**
- It reproduces the live scan handler (SHA-256 `49ee1a2e…`).
- Since the last functions release (`e028a7f`), the only `functions/` or `shared/` changes are PR #76. The `shared/theme/` changes are excluded from functions.

**Tests:**
- Unit: 168/168.
- Emulator: 117 tests across `schoolAccess`, `advisorySlips`, `retireSubjectTeachers`, `portalAnnouncements`, `announcements`, `legacyAttendanceRelease`, `sessionAttendance` and `schoolYear`, with logs.
  - In the combined run, the first test's setup timed out on a cold emulator. `schoolAccess` then passed 28/28 on its own.

**Deploy set** (22 functions):
- `getSchoolContextFn`, `requestSchoolRoleFn`, `withdrawSchoolRequestFn`, `resolveSchoolRoleFn`, `resolveSchoolRolesFn`, `replaceAdviserFn`, `assignSchoolRoleFn`, `revokeSchoolRoleFn`, `markSchoolOpenedFn`, `getSchoolPendingCountFn`;
- `issueAdvisorySlipsFn`, `revokeAdvisorySlipFn`, `listAdvisoryStatusFn`, `previewAdvisorySlipFn`, `redeemAdvisorySlipFn`;
- `getPortalAnnouncementsFn`, `getPortalAnnouncementFn`, `savePortalAnnouncementFn`;
- `announcementAudienceCountFn`, `onAnnouncementWritten`, `publishAnnouncementsJob`;
- `retireSubjectTeachersFn` (new).

`migrateSubjectTeachersFn` is deleted by name. Other handlers that import the shared files (`guardianAudience`, `reports`, `sessionAttendance`) are unchanged in behavior and stay out.

### SIMS (`docs/releases/2026-10-20-retire-subject-teacher/prepare.mjs`, wrapping the ui-modules release)

**Overlay** (`release-source/`):
- **Copied unchanged from `579a2bf`:** `parent/src/lib/school.js`, `shared/announcementAudience.js` and its test, `src/lib/announcements.js` and its test, `src/lib/schoolAssignments.js` and its test, `CoverageView.jsx` and its test, and `PendingView.test.js`. Each tree copy was identical to master just before the PR.
- **`shared/schoolAccess.js`:** the tree's own version, which keeps its older live approval rule (DepEd advisers only for Curriculum Advisers). Only the role lists change:
  - `SCHOOL_ROLES` and `SCHOOL_ROLE_LABELS` drop Subject Teacher;
  - `GRADE_ROLES` becomes `['curriculum_adviser']`;
  - `EXCLUSIVE`, `conflictingRole` and `canHold` are removed (nothing in the tree used them).
  - The tree's `schoolAccess.test.js` needed no change.

**Release tree tests:** 623/623.

**Build comparison:** compared with the baseline build, with hashed names normalized, only the `AnnouncementsPage`, `school`, `SchoolAccessTab` and `schoolAssignments` chunks differ. The "Subject Teacher" text that remains is:
- Parent App join strings bundled into a shared chunk, which SIMS never displays;
- the History label kept for old audit rows.

### Parent App (from `579a2bf`)

- Built from a `git archive` export with `index.html` and `manifest.webmanifest` normalized to LF, and the main checkout's `parent/.env` loaded into the build process only.
- Tests: 183/183. Initial load: 219.0 KB of the 260 KB limit.
- Compared with the pre-PR build, the `Join`, `schoolAccess`, `Settings` and `strings` chunks differ, as does the main `index` chunk (the role labels). `History` and `useLinks` differ only in a one-letter import alias.

Deploy config for all three: `firebase.retire-subject-teacher-release.json`.

## Published

Steps ran in this order, each from this checkout with `NODE_OPTIONS=--dns-result-order=ipv4first`.

| Step | Command | Result |
| --- | --- | --- |
| Functions | `firebase deploy --project bnhs-sims --config firebase.retire-subject-teacher-release.json --only functions:<22 names>` | 21 updated, `retireSubjectTeachersFn` created (`functions-deploy.log`). |
| Delete | `firebase functions:delete migrateSubjectTeachersFn --region asia-southeast1 --project bnhs-sims --force` | Deleted (`functions-delete.log`). Still 62 live, all checked ACTIVE (`functions-after.json`). |
| Cleanup | `node functions/scripts/retireSubjectTeachers.mjs --project bnhs-sims --admin ict@admin.com`, then the same with `--apply`, then the count again | Count: 5 accounts / 9 rows / 0 requests. Apply: 5 / 9 / 0. Recount: 0 / 0 / 0. Every result shows `"emulator": false` and `"projectId": "bnhs-sims"` (`cleanup-*.json`). A read-only check found 5 `school.roleRetired` audit rows listing all 9 removed rows, 5 "Subject Teacher access has ended" inbox notes, and the actor `ict@admin.com` (`cleanup-audit-check.json`). |
| SIMS hosting | same config, `--only hosting:sims` | 59/59 files match (`sims-hosting-verification.json`). Main script `assets/index-D9WRJGvm.js`. |
| Parent hosting | same config, `--only hosting:parent` | 50/50 files match (`parent-hosting-verification.json`). Main script `assets/index-Bn2A4NpX.js`. |

Smoke test: `retireSubjectTeachersFn` answers an unauthenticated call with 401, and both sites serve the new main scripts.

## Rollback

- **SIMS:** redeploy the ui-modules release tree, or use the Hosting console (main script `index-DIiDC7eb.js`).
- **Parent App:** use the Hosting console (main script `index-D8xSSj5w.js`).
- **Functions:**
  - Redeploy the updated ones by name from the registration backend preparer.
  - `migrateSubjectTeachersFn` can be redeployed from the same preparer.
  - Removed Subject Teacher rows are listed in each `school.roleRetired` audit row's `removed` field, so they can be restored by hand if needed.
