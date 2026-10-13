# Production deployment: 2-guardian / 1-adviser cap from active links (functions)

On October 13, 2026 the user asked for two functions to be deployed from `master` (`dd7c5bb`), which includes branch `claude/vibrant-satoshi-ddef79` (spec `docs/superpowers/specs/2026-10-13-learner-link-cap-design.md`). No rules, indexes or hosting were published.

## Source

As in `../2026-10-13-reissue-slip-functions`, both functions were deployed by name from `master` in the main checkout. The coordinator rollout's triggers on `master` stay held.

```bash
NODE_OPTIONS="--dns-result-order=ipv4first" FUNCTIONS_DISCOVERY_TIMEOUT=120 \
  npx firebase deploy --project bnhs-sims --non-interactive \
  --only "functions:activateCodeFn,functions:resolveAccessRequestFn"
```

Compared with the live revisions:

- **`activateCodeFn`** gains only the link-cap check since the ended-school-year deploy (`1cc944c`).
- **`resolveAccessRequestFn`** was last deployed from the release tree (base `26a6ed7`). Since then `links.js` changed only in `e282015` (the cap check). Of its imports:
  - `codeSlots.js` gained `slotsFromLinks` (`12b5d70`).
  - `codes.js` matches the code already live in the other activation-slip functions.
  - `callable.js` gained only the `reissueCode` rate limit.
  - `guardianAudience.js`, `format.js`, `validators.js`, `audit.js`, `log.js` and `errors.js` are unchanged.

## Behaviour change now live

- **Redeeming a slip:** `activateCode` reads the learner's active `guardian_links` inside its link transaction. It refuses a guardian past 2, or an adviser past 1, for the code's school year, whatever the code's own slot counters say. Parents get the generic failure message, and the logged reason is `cap`. A link already active for that year re-entering a code is unaffected.
- **Approving an access request:** `resolveAccessRequest` refuses approval past 2 guardians with "This learner already has 2 linked guardians for {sy}. Revoke one on the Learner access tab first." The request stays open and nothing is written. Re-approving a guardian who is already linked still works.
- **Learners already over the limit:** any learner already above the limit through earlier access approvals keeps those links. New links are refused until staff revoke enough to get back under the limit.

## Verified

- Deploy output: both were updated in asia-southeast1 on Node.js 22.
- An unauthenticated POST to each returns `401 UNAUTHENTICATED` from the function itself.
- Tests on the merged result before release: Functions unit 146, Functions/Auth emulator 187 (including 7 cap tests), Firestore rules 129 (6 password-release compatibility tests skipped as usual), SIMS 465. All passed.

## Rollback

In the Cloud console, roll both functions back to their previous revisions. No data format changed.
