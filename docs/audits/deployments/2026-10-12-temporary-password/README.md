# Production deployment: temporary-password restrictions

The user requested merge, push and deployment on October 12, 2026 and confirmed staff use and account mutations were paused. Code commit `a8c958b` was fast-forwarded into `master` and pushed to `origin/master`.

The release was prepared independently of the coordinator rollout. The root coordinator rules/build were not published. The 83 school-record warnings holding that rollout were not modified by this deployment.

## Published and verified

- Project: `bnhs-sims`.
- SIMS hosting: version `fdefc002d462788e`, at https://bnhs-sims.web.app.
- Firestore: password-only ruleset `42e6cc7c-5508-48f8-bdb1-ea794530ec94`.
- All 25 selected callables returned successful update operations and are ACTIVE with new revisions and one shared deployment hash.
- The eight excluded jobs/triggers retain their prior ACTIVE revisions. This includes `onScanEventCreated` revision `onscaneventcreated-00018-baz` and `reconcileEventsJob` revision `reconcileeventsjob-00015-zeh`, preserving deployed Step 1 attendance processing.
- Parent/Kiosk hosting, indexes and background triggers were not selected for publication.

The served SIMS HTML and main JavaScript match the reviewed local build by SHA-256. Active rule source matches the separate release. The actual published Functions archive was downloaded into a protected local directory; its entrypoint, callable identity checks, password handlers and shared roles match the reviewed runtime files. The held coordinator helper is absent. The live password-change endpoint rejected an unauthenticated request with HTTP 401/UNAUTHENTICATED, before any account mutation.

## Migration and local checks

The staff identity dry-run found eight profiles, eight required bindings and zero warnings. A protected minimal snapshot was saved locally before mutation; it includes only fields touched by this migration and mapping identifiers, with no names, passwords or tokens. It is excluded from Git. The reviewed migration applied all eight bindings. The follow-up dry-run returned zero changes and zero warnings. No student, enrollment or attendance records were changed by the migration.

Immediately before integration, 433 SIMS and 138 backend unit tests passed; they also passed on merged master before pushing. The exact password-only rules passed 63 direct database and compatibility tests. The independent production-config build succeeded. The prior complete validation, including 162 Functions/Auth emulator tests and the independent source checks, is recorded in the release guide. These tests do not substitute for authenticated browser/scanner checks.

## Administrator checks before staff use resumes

On October 12, the user confirmed that the administrator's requested checks passed: SIMS reload and ordinary staff sign-in, password setup with a designated temporary-password account, ordinary Parent App access, and one kiosk test badge. This is user-reported verification; Codex did not independently observe the browser or physical scanner checks. The staff maintenance hold can end.

## Recovery evidence

`preflight.json` records previous callable source/revision references, SIMS hosting version and active ruleset. `previous-firestore.rules` preserves the immediately prior Step 1 rules, not the older permissive kiosk rules. `migration.json`, `hosting-verification.json` and `verification.json` record aggregate migration results and live verification without account identifiers or credentials.

For recovery, keep staff usage paused and coordinate the prior SIMS version, callable revisions/source and prior active ruleset. Retain UID bindings and password session cutoffs unless a specifically reviewed recovery changes them. Restoring prior authorization code removes Step 3 protections. Do not publish the prepared tree's old scan handler or restore pre-Step-1 kiosk attendance rules. An interrupted password mutation must retain its restriction/operation lock until investigated.
