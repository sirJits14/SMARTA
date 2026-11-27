# Relationship correction production SIMS release

SIMS part of PR #47. It adds an administrator "Correct relationship" action to
Guardians → Links. Production SIMS stays on its release tree while the
coordinator rollout on master is held. Do not deploy the root `firebase.json`
or a build of master.

## Reproduce

From the repository root (PowerShell), with dependencies installed:

```powershell
node docs/releases/2026-10-18-relationship-correction/prepareSims.mjs
```

The preparer runs `../2026-10-18-school-mode/prepareSims.mjs` into
`<out>/school-mode/`. Its `sims/` tree is the live baseline. The preparer then
copies that tree to `<out>/sims/` and adds the files in `release-source/`. It
records the changed SIMS-bundled files in `<out>/sims-source-manifest.json` and
writes the hosting-only `sims/firebase.relationship-correction-release.json`.
Preparing deploys nothing.

`release-source/` holds master's (`43d6379`) versions of the four SIMS files that
PR #47 changed:

- `src/pages/guardians/LinksTab.jsx`
- `src/pages/guardians/linkRelationship.js` and its test
- `src/data/guardians.js` (adds the `correctLinkRelationshipFn` call)

Each file in the live tree matches pre-#47 master (`4ee0161`) once line endings
are ignored. Master's versions therefore overlay as they are, with no
adaptation. SIMS does not bundle `parent/src/lib/relationships.js`, the other
library file the PR changed.

## Build and verify

Build and check the trees the same way as `../2026-10-18-school-mode/README.md`
describes:

1. Link the main checkout's `node_modules` into each tree with a junction.
   Remove it with `.Delete()` before deleting a tree.
2. Load the main checkout's `.env` for the build only.
3. Run `verifyHosting.mjs` on the baseline.

The evidence from 2026-10-18 is in `preparation/`:

- `sims-baseline-verification.json`: the baseline matched live 59/59 files.
- `sims-source-manifest.json`: the four source changes. The hashes are for a
  normal checkout, where git writes CRLF.
- `sims-release-vs-live.json`: the release build against the verified live build.
  - 59 files, the same count as live.
  - 29 unchanged; none added or removed.
  - 30 renamed. Only two of them change content once hashed import names are
    ignored:
    - `LinksTab`: 8004 → 9544 bytes.
    - `guardians`: 797 → 852 bytes, the new callable name.
- The main script becomes `/assets/index-BrmqHMeI.js`. Live is
  `/assets/index-CN44oHj4.js`. Its content is unchanged apart from chunk names.

Tests in the prepared trees: baseline 501/501, release 505/505
(`npx vitest run --exclude 'functions/**' --exclude 'parent/**'`).

## Publish (not done here)

`correctLinkRelationshipFn` must be live before or together with this SIMS
release. Without it, the new action fails with a generic error.

From `<out>/sims`, with project `bnhs-sims`:

```powershell
firebase deploy --config firebase.relationship-correction-release.json --only hosting:sims
```

Then wait a few seconds and byte-check `dist/` against
https://bnhs-sims.web.app.
