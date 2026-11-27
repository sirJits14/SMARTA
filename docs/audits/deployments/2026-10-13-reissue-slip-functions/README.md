# Production deployment: reissue one learner's activation slip (functions)

On October 13, 2026 the user asked for the functions from merge `121e267` (branch `claude/activation-slips-validity-6e2c6c`) to be deployed. Only two callables were published. SIMS hosting was not deployed.

## Source

The release wrapper (`scripts/deployTemporaryPasswordRelease.mjs`) can only republish all 25 callables from the release tree, and `prepareTemporaryPasswordRelease.mjs` refuses to prepare a tree while `master` exports 26 callables. With the user's approval, the two changed callables were deployed by name from `master` (`121e267`) in the main checkout:

```bash
NODE_OPTIONS="--dns-result-order=ipv4first" FUNCTIONS_DISCOVERY_TIMEOUT=120 \
  npx firebase deploy --project bnhs-sims \
  --only "functions:issueActivationCodesFn,functions:reissueActivationCodeFn" --non-interactive
```

`functions/src/handlers/codes.js` and `functions/src/lib/codeSlots.js` at the release base `26a6ed7` were identical to `master` before this branch (`670c87e`). What these two functions now run is therefore the deployed code plus this branch's change. One exception: the uploaded `codes.js` also contains PR #30's `acceptConsent` change, but `acceptConsentFn` was not redeployed, so that change is not live. No other function, trigger, rule, index or hosting site was touched. The coordinator rollout held on `master` stays unpublished: its triggers were not selected.

## Published and verified

- `reissueActivationCodeFn` was created and `issueActivationCodesFn` was updated, both in asia-southeast1 on Node.js 22. `firebase functions:list` shows both.
- An unauthenticated POST to each function returns `401 UNAUTHENTICATED` from the function itself, not an IAM 403, so the SIMS client can invoke the new callable.
- Tests on the merged `master` before release: SIMS 465, Functions unit 144, Functions/Auth emulator 174, all passed. The SIMS production build passed.

## Behaviour change now live

Section-wide **Issue slips** skips learners whose 2 guardian + 1 adviser slots are all linked, and pre-fills each new code's slots from the learner's active links. The live SIMS (release tree) still shows skip reasons as raw keys, for example `fully-linked`, until the SIMS release below.

## Still to do

The SIMS release (Reissue slip on the Learner access tab, shared print controls, plain-words skip reasons) has not been published. When it is, apply `git diff --binary 670c87e 1929223 -- src/` to the release tree on top of the three changes listed in `../2026-10-12-sims-folio-slips` (`c1b9883`, `cb1e514`, `1ae23c4..a2db95a`).

## Rollback

In the Cloud console, roll `issueActivationCodesFn` back to its previous revision and delete `reissueActivationCodeFn`. Codes already issued keep working either way. Codes issued after this release carry pre-filled slot counts, which the previous code also reads correctly.
