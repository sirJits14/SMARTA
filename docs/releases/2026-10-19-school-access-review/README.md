# School access review queue production release

This release covers the School access review queue
(`docs/superpowers/specs/2026-10-18-school-access-review-queue-design.md`).
Teachers request Adviser or Subject Teacher roles in the Parent App. Admins
review them in SIMS under Guardians → School access, which has Pending,
Coverage, Assignments and History tabs, a sidebar badge and CSV export.
Curriculum Advisers approve in-grade DepEd adviser requests in the app.

The coordinator rollout on master is still held. SIMS ships from the release
tree. Do not deploy the root `firebase.json` or a build of master for SIMS.
Never run a bare `--only functions`.

## What is prepared

- **Functions:** `../2026-10-18-school-family/prepareBackend.mjs` now lists the
  five new callables. That makes 29 names in `functionsToDeploy`. This release
  deploys only the 10 school-role callables below.
  - **New:** `withdrawSchoolRequestFn`, `resolveSchoolRolesFn`,
    `replaceAdviserFn`, `markSchoolOpenedFn`, `getSchoolPendingCountFn`.
  - **Changed:** `getSchoolContextFn`, `requestSchoolRoleFn`,
    `resolveSchoolRoleFn`, `assignSchoolRoleFn`, `revokeSchoolRoleFn`.
  - No other handler changed. `deleteSchoolAccess` and `loadSchoolActor` are
    unchanged. The new shared helpers are used only by `schoolAccess.js`.
- **Indexes:** `../2026-10-18-school-family/prepareRules.mjs` now also carries
  the `audit_log` (targetType ASC, at DESC) index. The History tab needs it. The
  root file keeps that index last, and the preparer refuses to run if it moves.
  `../2026-10-18-school-family/firestore.indexes.json` holds 28 composites:
  production's 27 plus this one. The five field overrides are unchanged.
- **Rules:** no change. The regenerated `firestore.school-family.rules` matches
  the committed file apart from line endings. The History tab reads `audit_log`,
  which production rules already allow for admins.
- **SIMS:** `prepareSims.mjs` runs `../2026-10-18-relationship-correction/prepareSims.mjs`
  into `<out>/relationship-correction/`. That tree is the live baseline. The
  preparer then copies it to `<out>/sims/`, removes the old
  `src/pages/guardians/SchoolAccessTab.jsx` and adds `release-source/`. It also
  copies the release index file to the tree's `firestore.indexes.json`, so
  `HistoryView.test.js` checks the production indexes.

`release-source/` holds master's versions (`e90f9ad`, PR #59) of these
files:

- `src/pages/guardians/school/*` (15 files)
- `src/hooks/useSchoolPendingCount.js`
- `src/components/Shell.jsx` and `src/components/ui.jsx`, plus `CountBadge.test.js`
- `src/lib/schoolAssignments.js` and its test
- `src/pages/GuardiansPage.jsx` and `src/registrar.css`
- `shared/theme/theme.css` and `contrast.test.js`
- `parent/src/lib/school.js` and `parent/src/strings.js`, which SIMS imports

In the live tree, `Shell.jsx`, `ui.jsx`, `schoolAssignments.js`,
`GuardiansPage.jsx`, `registrar.css` and `theme.css` match pre-feature master
once line endings are ignored. They therefore overlay as they are.

The tree's `parent/src/lib/school.js` and `strings.js` are older. Master's
`school.js` drops `roleRequestError`, which no SIMS file uses. The full
`strings.js` adds about 13 KB to the lazy `school` chunk. No file needed adapting.

## Evidence (2026-10-19, `preparation/`)

- `sims-baseline-verification.json`: the baseline build matched
  https://bnhs-sims.web.app 59/59.
- `sims-source-manifest.json`: 26 source changes. Hashes are for a normal
  checkout, where git writes CRLF.
- `sims-release-vs-live.json`: release build against the verified baseline.
  - 59 files, the same count as live.
  - The main script becomes `/assets/index-ComX5WGQ.js`. Live is
    `/assets/index-BrmqHMeI.js`.
  - The intended growth is in `SchoolAccessTab` (7.1 → 24.6 KB), `school`
    (0.4 → 13.6 KB, Parent strings), `GuardiansPage`, the main script
    (Shell, CountBadge, +10 KB) and the CSS (+1.8 KB).
  - Changing `ui.jsx` moves the shared chunk graph. The bundler's
    `jsx-runtime` chunk becomes `rolldown-runtime`. Most other chunks change only
    their minified import names, by about ±40 bytes each.
- Tests in the release tree: 520/520
  (`npx vitest run --exclude 'functions/**' --exclude 'parent/**'`). The
  baseline was 505.
- `prepareBackend.mjs` ran cleanly at `b36e7d5`, which has the same tree as `e90f9ad`. The live scan SHA-256 was
  `49ee1a2e…`, unchanged. All 29 names are exported by the prepared
  `functions/index.js`.

## Release checklist

Deploy in this order. If the Parent App ships before SIMS, teachers can send
requests that no admin can see.

Preparing deploys nothing. Run every deploy from the **main checkout** at the
merged `master`, in PowerShell. The env files live only there. Set these in
the session before any Firebase command:

```powershell
$env:NODE_OPTIONS = '--dns-result-order=ipv4first'
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '120'
```

### 0. Preconditions

- [x] PR #59 is merged (`e90f9ad`). Put the main
      checkout on that `master` or later.
- [ ] Live SIMS still serves `/assets/index-BrmqHMeI.js`. If not, someone
      released SIMS since. Stop and rebase this overlay on their release.
- [ ] Check that nothing in `sites/bnhs-parent/releases` is newer than the last
      Parent record. Codex sessions also deploy Parent.

### 1. Functions and indexes

- [ ] Prepare the backend. If `.superpowers/releases/school-family/` is left
      over from an earlier release, delete it first. Remove any `node_modules`
      junction inside it with `.Delete()` before deleting the folder.

      ```powershell
      node docs/releases/2026-10-18-school-family/prepareBackend.mjs --copy-dependencies
      ```

      In a worktree, `functions/node_modules` is a junction, so leave out
      `--copy-dependencies`. Junction
      `.superpowers/releases/school-family/backend/functions/node_modules`
      to the main checkout's copy instead.
- [ ] Create
      `.superpowers/releases/school-family/backend/functions/.env.bnhs-sims`
      containing `PORTAL_URL=https://bnhs-parent.web.app`. Check it against the
      current deployment. Delete the file after the deploy.
- [ ] Record the current functions:
      `npx firebase functions:list --project bnhs-sims`. Expect 51, the count after PR #52.
- [ ] Deploy the indexes and wait until `audit_log` shows READY in the console:

      ```powershell
      npx firebase deploy --project bnhs-sims --config firebase.school-family-release.json --non-interactive --only firestore:indexes
      ```

- [ ] Deploy the 10 callables by name. No `--force` is needed, because there is
      no new retry trigger.

      ```powershell
      npx firebase deploy --project bnhs-sims --config firebase.school-family-release.json --non-interactive --only "functions:getSchoolContextFn,functions:requestSchoolRoleFn,functions:resolveSchoolRoleFn,functions:assignSchoolRoleFn,functions:revokeSchoolRoleFn,functions:withdrawSchoolRequestFn,functions:resolveSchoolRolesFn,functions:replaceAdviserFn,functions:markSchoolOpenedFn,functions:getSchoolPendingCountFn"
      ```

- [ ] Run `functions:list` again. Expect 56, with nothing removed.

Live SIMS and Parent keep working in the gap before the next steps:

- `getSchoolContextFn` returns a superset of the old shape. `assignedAt` becomes
  milliseconds, and no live client reads it.
- `assignSchoolRoleFn` and `revokeSchoolRoleFn` accept the same input.
- The live Parent App has no request screen, so no requests can arrive yet.

### 2. SIMS from the release tree

- [ ] Prepare the tree:

      ```powershell
      node docs/releases/2026-10-19-school-access-review/prepareSims.mjs
      ```

- [ ] Junction the main checkout's `node_modules` into
      `.superpowers/releases/school-access-review/relationship-correction/sims`
      and into `.superpowers/releases/school-access-review/sims`.
- [ ] Build both trees with `.env` loaded for the build only. In Bash, from
      each tree:

      ```bash
      (set -a; . "<main checkout>/.env"; set +a; npm run build)
      ```

- [ ] Check the baseline. It must match 59/59:

      ```powershell
      node docs/releases/2026-10-18-school-family/verifyHosting.mjs .superpowers/releases/school-access-review/relationship-correction/sims/dist https://bnhs-sims.web.app <report>.json
      ```

- [ ] Run the tests in the release tree. Expect 520/520.
- [ ] Compare the release `dist/` with `preparation/sims-release-vs-live.json`.
      Expect 59 files and main script `index-ComX5WGQ.js` if built from the same
      sources.
- [ ] Deploy from `.superpowers/releases/school-access-review/sims`:

      ```powershell
      npx firebase deploy --project bnhs-sims --config firebase.school-access-review-release.json --only hosting:sims
      ```

- [ ] Wait a few seconds, then run `verifyHosting.mjs` on the release `dist/`.
      It must match 59/59.
- [ ] As an admin in SIMS, open Guardians → School access. Check that
      Pending, Coverage, Assignments and History load. History needs the
      READY index. The sidebar badge should show 0.

### 3. Parent App (`hosting:parent` only)

- [ ] Build `parent/` from merged `master` with the main checkout's
      `parent/.env` and the full `parent/node_modules` junction. Keep the
      initial load under the 260 KB budget. It was about 220 KB before this
      feature.
- [ ] Build the pre-merge master into `dist-base`, or SHA-256 the live site
      against the last Parent record. This confirms the deploy publishes only
      this change.
- [ ] Deploy and byte-check against https://bnhs-parent.web.app:

      ```powershell
      npx firebase deploy --project bnhs-sims --non-interactive --only hosting:parent
      ```

- [ ] On a teacher's own device, send a request from Settings → School access.
      Confirm it shows under SIMS Pending and the badge counts it. Approve it.
      Confirm History records it. App Check blocks signed-in checks from the
      built-in browser.

### 4. Record

- [ ] Save the evidence under `docs/audits/deployments/2026-10-19-school-access-review/`:
      functions before and after, hosting verifications, and the index state.

## Rollback

- **SIMS:** redeploy the relationship-correction tree with
  `firebase.relationship-correction-release.json`, or roll back in the Hosting
  console.
- **Parent:** roll back the `bnhs-parent` release in the Hosting console.
- **Functions:** redeploy the five changed callables by name from a backend
  prepared at the previous master. The five new callables are unused without
  the new clients.
- **Index:** leave the `audit_log` index in place. It is harmless.
