# Production deployment: Reissue slip in SIMS

On October 13, 2026 the user asked for SIMS to be deployed from the release tree. This follows `../2026-10-13-reissue-slip-functions`, which published `reissueActivationCodeFn` and the updated `issueActivationCodesFn` earlier the same day. Only SIMS hosting was published.

## Source

The coordinator rollout is still held on `master`. `prepareTemporaryPasswordRelease.mjs` now refuses to run from `master`, because it counts 26 callables and the release tooling expects 25. The tree was therefore prepared from a temporary checkout of `670c87e`, the commit before this branch. Its overlay files are the same ones used for the October 12 releases.

On that tree, the three changes already live were applied:
- `c1b9883`, without `scripts/build-logos.py`
- `cb1e514`
- `1ae23c4..a2db95a`, `src/` only

That build reproduced the live site byte for byte: all 53 files matched, with main script `/assets/index-CROHJVGN.js`.

Then this branch's SIMS change was applied: `git diff --binary 670c87e 1929223 -- src/`, 8 files. Ignoring line endings, every file matches commit `1929223`. The tree's 399 SIMS tests passed, and the wrapper's `verify` passed.

The new build was compared with the live-equivalent build, ignoring content hashes in file names:
- **Changed:** the Codes tab, Links tab, guardians data and Guardians page chunks. The Guardians page change is only its preload list, which now includes the new shared chunk.
- **Added:** one shared chunk, `slipIssue`.
- **Unchanged in content:** `index.html`, the main script, `sw.js` and `manifest.webmanifest`.

## Published and verified

- **Command:** `node scripts/deployTemporaryPasswordRelease.mjs hosting`. This published hosting:sims only. No functions, rules, indexes, or Parent or Kiosk hosting were touched.
- **Byte check:** all 54 files served by https://bnhs-sims.web.app match the local build by SHA-256. The main script is `/assets/index-DFk8lSPJ.js`.
- **Before release:** the real Learner access tab was rendered in a browser fixture with synthetic data and a fake callable, and checked for:
  - the Reissue slip panel and its slot text;
  - the server error message;
  - the learner-switch guard;
  - Folio/A4 page size;
  - print CSS that leaves only the slip visible.
- **Not yet checked in production:** reissuing a real learner's slip from the live Learner access tab, printing it on the school's printer, and scanning it with a phone.

## Follow-up

Later SIMS releases from the release tree must apply `c1b9883`, `cb1e514`, `1ae23c4..a2db95a` and `670c87e..1929223 -- src/`, or they will drop these changes. They must also prepare the tree from a checkout where `functions/index.js` has 25 callables, or update the release tooling. When the hold lifts, all of these are already in `master`.

## Rollback

Roll back to the previous SIMS hosting version (the Folio slips release) in the Firebase console. The functions can stay: the previous SIMS never calls `reissueActivationCodeFn`, and its Codes tab still works with the updated `issueActivationCodesFn`, showing the raw `fully-linked` reason for skipped learners.
