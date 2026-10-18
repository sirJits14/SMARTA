# School mode production SIMS release

SIMS part of PR #44 (School mode redesign). Production SIMS stays on its
release tree while the coordinator rollout on master is held. Do not deploy the
root `firebase.json` or a build of master.

## Reproduce

From the repository root (PowerShell), with dependencies installed:

```powershell
node docs/releases/2026-10-18-school-mode/prepareSims.mjs
```

The preparer runs `../2026-10-18-school-family/prepareSims.mjs` into
`<out>/school-family/`. Its `sims/` tree is the live baseline. It then copies that
tree to `<out>/sims/` and adds the files in `release-source/`. The preparer
records every changed file that SIMS bundles in `<out>/sims-source-manifest.json`,
including the Parent helpers `parent/src/lib/school.js` and
`parent/src/lib/classSession.js`. It also writes the hosting-only
`sims/firebase.school-mode-release.json`. Preparing changes no checkout state and
deploys nothing. On this OneDrive checkout, the Family/School step's directory
rename can fail with a transient error. If it does, rerun into a new directory.

`release-source/` holds master's (`7b20548`) versions of the PR #44 SIMS files:

- `src/App.jsx` (Attendance → Session Review tab)
- `src/pages/guardians/SchoolAccessTab.jsx` (no approval queue)
- `src/pages/guardians/LegacyAdvisers.jsx`
- `src/lib/schoolAssignments.js`
- `src/lib/sessionReview.js`
- `src/pages/SessionReviewPage.jsx`
- `parent/src/lib/classSession.js`
- the matching tests

The live tree's `App.jsx` and `SchoolAccessTab.jsx` match pre-PR master once
line endings are ignored, so master's versions overlay cleanly.

One adaptation: the release tree's `src/hooks/useCollection.js` has no
`useStaffCollectionResource`. The release `SessionReviewPage.jsx` therefore reads
`useCollectionResource('sections')`, as every other live page does, and its test
mocks that hook. `reviewSections` still filters the sections by the
coordinator's grades and the current school year.

## Build and verify

Link the main checkout's `node_modules` into both trees with a junction. Remove
the junction with `.Delete()` before deleting a tree. Build each tree with the
main checkout's `.env` loaded for the build only (Bash):

```bash
set -a; . "<main checkout>/.env"; set +a; npm run build
```

Then byte-check the baseline against live:

```powershell
node docs/releases/2026-10-18-school-family/verifyHosting.mjs <out>/school-family/sims/dist https://bnhs-sims.web.app <report>.json
```

The evidence from 2026-10-18 is in `preparation/`:

- `sims-baseline-verification.json`: the baseline matched live 56/56 files.
- `sims-source-manifest.json`: the source changes. The hashes are for a normal
  checkout, where git writes CRLF. An LF-only overlay gives different source
  hashes, but the build output is byte-identical.
- `sims-release-vs-live.json`: the release build against the verified live build.
  - 59 files, compared with 56 live.
  - 27 unchanged.
  - 3 new chunks: `SessionReviewPage`, `dates` and `school` (shared modules split out).
  - 29 renamed. Only four of them change content once hashed import names are
    ignored: `index` (Session Review tab), `SchoolAccessTab`, `GuardiansPage` and
    `AnnouncementsPage` (now imports the split `dates` chunk).
- The main script becomes `/assets/index-CN44oHj4.js`. Live is `/assets/index-C1ztdq4p.js`.

Tests in the prepared trees: baseline 489/489, release 501/501
(`npx vitest run --exclude 'functions/**' --exclude 'parent/**'`).

## Publish (not done here)

Order:

1. In the current SIMS, clear pending `school_role_requests`. The new backend
   always denies new requests, and this release removes the SIMS approval queue.
2. Deploy the backend functions by name, from
   `../2026-10-18-school-family/prepareBackend.mjs`'s `functionsToDeploy`, and the
   Parent app. Ship them before or together with this SIMS release.
3. From `<out>/sims`, with project `bnhs-sims`, run
   `firebase deploy --config firebase.school-mode-release.json --only hosting:sims`.
   Then byte-check `dist/` against https://bnhs-sims.web.app. Wait a few seconds
   first, because the first requests can return the old `index.html`.
