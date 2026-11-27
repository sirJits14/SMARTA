# Production deployment: DepEd accounts change their learner relationship

On October 17, 2026 the user asked for PR #39 (merged as `a7842bd`) to be deployed: functions first, then `hosting:parent` built from `master`, then SIMS from its release tree.

Spec: `docs/superpowers/specs/2026-10-17-deped-relationship-change-design.md`.

## 1. Functions (by name, from `master` `a7842bd`)

The coordinator rollout is still held on `master`, so nothing was deployed with a bare `--only functions`. These three callables were deployed:

```
NODE_OPTIONS=--dns-result-order=ipv4first FUNCTIONS_DISCOVERY_TIMEOUT=120 firebase deploy --project bnhs-sims --non-interactive --only functions:changeLinkRelationshipFn,functions:activateCodeFn,functions:resolveAccessRequestFn
```

| Function | Result | Revision |
|---|---|---|
| `changeLinkRelationshipFn` | created | `changelinkrelationshipfn-00001-ban` |
| `activateCodeFn` | updated | `activatecodefn-00018-miv` |
| `resolveAccessRequestFn` | updated | `resolveaccessrequestfn-00017-kup` |

**Checked before deploying:** the live source of `activateCodeFn` and `resolveAccessRequestFn` was downloaded and compared with pre-merge `master` (`58f79da`). Beyond this PR, the only differences were:
- the issue-slips rate-limit message (`callable.js`, `codes.js`, `format.js`), which these handlers never call;
- `index.js` importing the coordinator `sections.js` handlers.

`links.js`, `codeSlots.js` and the guardian identity code were otherwise identical, so the two updated callables gain only this PR's change.

`functions/.env` exists only in the main checkout and holds just `PORTAL_URL=https://bnhs-parent.web.app`. It was written for the deploy and deleted afterwards.

**After deploying:** all three functions are `ACTIVE`. An unauthenticated POST to `changeLinkRelationshipFn` returns HTTP 401, which is the App Check refusal (the function is publicly invokable). See `functions-deploy.log`.

## 2. Parent App (`hosting:parent`, from `master` `a7842bd`)

- **Toolchain:** built with the main checkout's `parent/node_modules`. This worktree's own toolchain produces different `firebase` and runtime chunks and doesn't reproduce production. The env was loaded from the main checkout's `parent/.env` for the build only.
- **Baseline:** pre-merge `master` (`58f79da`) built with the same toolchain matched live. With hashes and the build date normalized, all 36 files were equal; byte for byte, everything except the date-stamped main chunk and the chunks that reference it by name.
- **New build:**
  - Changed in substance: `History`, `Activate` and `RequestAccess`, the strings in the main script, and the new `relationships` and lazy `RelationshipSheet` chunks.
  - A small eager `preload-helper` chunk was split out.
  - Other chunks differ only in renamed import bindings.
- **Size:** the eager bundle is 259.9 KB gz against the 260 KB limit. Live was already 259.7 KB with this toolchain, so this release adds 0.2 KB. **The budget is now almost full.**
- **Deploy:** `NODE_OPTIONS=--dns-result-order=ipv4first firebase deploy --project bnhs-sims --non-interactive --only hosting:parent`. See `parent-deploy.log`.
- **Byte check:** all 39 files served by https://bnhs-parent.web.app match the build by SHA-256. The main script is `/assets/index-Bt1EmMhi.js`.

## 3. SIMS (`hosting:sims`, from the release tree)

The tree was rebuilt as in `../2026-10-15-signin-errors-sims/README.md`:
- prepared from a detached `670c87e` checkout;
- the six live overlays, `sims-pm-port.patch`, the section-editing files, the search port and `git diff 5eab791^ 5eab791`.

The tree built with the main checkout's root `node_modules` and `.env`, and matched production byte for byte: 55 of 55 files, main script `/assets/index-nHfTFpJL.js`.

**Change:** `git diff ae9cece 5fd1895 -- src` applied to the tree unchanged. It adds `src/pages/guardians/linkRelationship.js` and its test, and changes `LinksTab.jsx`.

**Later releases from the release tree must apply this diff too, or they will drop it.**

**Verification:**
- **Tree tests:** 469 unit tests passed (467 before this change).
- **Compared with the live-equivalent build, ignoring content hashes:** only the `LinksTab` chunk changed in substance. Other chunks differ only in renamed references, and no files were added or removed.
- **Before publishing:** the live `index.html` was rechecked against the baseline.
- **Deploy:** `NODE_OPTIONS=--dns-result-order=ipv4first firebase deploy --project bnhs-sims --config firebase.relationship-release.json --only hosting:sims --non-interactive`. The config contains only the `sims` hosting target, identical to the sign-in release config. See `sims-deploy.log`.
- **Byte check:** all 55 files served by https://bnhs-sims.web.app match the build by SHA-256. The main script is `/assets/index-gu2n-5mj.js`.

No Firestore rules or indexes, App Check or Auth settings, school records or kiosk hosting were changed.

## Not yet checked in production

- A DepEd adviser changing Mother → Adviser on a real learner, and the slip then accepting the real parent.
- The "changed from …" note on the SIMS Learner access tab.

## Rollback

- **SIMS:** roll hosting back to the version whose main script is `/assets/index-nHfTFpJL.js`.
- **Parent App:** roll hosting back to the version whose main script is `/assets/index-LHRsw2ke.js`.
- **Functions:**
  1. Redeploy `activateCodeFn` and `resolveAccessRequestFn` from `58f79da`, by name.
  2. Delete `changeLinkRelationshipFn` with `firebase functions:delete changeLinkRelationshipFn --region asia-southeast1`, or leave it, since the old Parent App never calls it.
  3. Links already changed keep their new relationship and slot.
