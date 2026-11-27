# Production deployment: no activation slips for an ended school year (functions)

On October 13, 2026 the user asked for four functions to be deployed from `master` (`ee65016`), which includes merge `d72f9dd` (branch `claude/admiring-shamir-50294f`). No rules, indexes or hosting were published.

## Source

As in `../2026-10-13-reissue-slip-functions`, the functions were deployed by name from `master` in the main checkout. The release wrapper only republishes its fixed set of 25 callables, and the coordinator rollout's triggers on `master` stay held.

```bash
NODE_OPTIONS="--dns-result-order=ipv4first" FUNCTIONS_DISCOVERY_TIMEOUT=120 \
  npx firebase deploy --project bnhs-sims --non-interactive \
  --only "functions:issueActivationCodesFn,functions:reissueActivationCodeFn,functions:activateCodeFn,functions:endSchoolYearFn"
```

Compared with the live revisions:

- `issueActivationCodesFn` and `reissueActivationCodeFn` gain only the ended-year check since this morning's deploy (`121e267`).
- `activateCodeFn` was last deployed from the release tree. It gains only the ended-year check:
  - Since the release base `26a6ed7`, the other commits in `codes.js` did not touch `activateCode`. `1adbdbf` (PR #30) changed only `acceptConsent`, which was not redeployed.
  - Its wrappers in `index.js` and `callable.js` differ from the release overlay only by the new `reissueActivationCodeFn` export and the `reissueCode` rate limit.
- `endSchoolYearFn` gains only the `school_years/{sy}` marker it writes first.

None of the four import the held coordinator code. `functions/src/lib/schoolYears.js` imports nothing.

## Behaviour change now live

- **Ending a year:** `endSchoolYear` writes `school_years/{sy}` (`endedAt`, `endedBy`) before revoking that year's codes and expiring its links.
- **Issuing:** once the marker exists, `issueActivationCodes` and `reissueActivationCode` refuse that year with "The {sy} school year has ended."
- **Redeeming:** `activateCode` reads the marker inside its link transaction. Parents get the generic failure message, and the logged reason is `year-ended`.
- **Years already ended:** any year ended before this release has no marker. It isn't blocked unless `endSchoolYear` is run for it again, which is safe: its codes are already revoked and its links already expired.
- **Rules:** the `firestore.rules` entry for `school_years` (admin read, no client writes) is in `master` only. Production rules are the password-only release rules, which already deny that collection by default. Only the Admin SDK in functions reads or writes it, so no rules deploy is needed.

## Verified

- Deploy output: all four were updated in asia-southeast1 on Node.js 22.
- An unauthenticated POST to each returns `401 UNAUTHENTICATED` from the function itself.
- Tests on the merged `master` before release: Functions unit 146, Functions/Auth emulator 180, Firestore rules 129 (6 password-release compatibility tests skipped as usual), SIMS 465. All passed.

## Rollback

In the Cloud console, roll each of the four back to its previous revision. Any `school_years` marker already written is ignored by the previous code.
