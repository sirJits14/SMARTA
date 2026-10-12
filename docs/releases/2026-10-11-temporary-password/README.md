# Step 3: server-enforced temporary passwords

Status: implemented and verified locally on October 11, 2026. Production rollout was authorized on October 12; the user confirmed staff usage and account changes are paused. The production rules baseline matches, all 33 functions are ACTIVE, and the staff binding dry-run has eight changes and zero warnings. Publication is in progress; final results are recorded in `docs/audits/deployments/2026-10-12-temporary-password`.

Staff using a temporary password cannot read school data, write records, invoke staff/admin operations, or use guardian/kiosk permission branches to bypass the restriction. Their bound profile GET and `changeOwnPasswordFn` remain available. A successful change revokes old sessions and requires a fresh sign-in. The SIMS screen waits for the server cutoff and keeps its data subscriptions closed until that sign-in completes.

Password operations are serialized per account. The restriction is written before dispatching an Auth password mutation. Old requests are checked again inside the lock. An ambiguous failure after dispatch retains the restriction and operation marker for administrator investigation; it is never automatically unlocked or taken over.

## Separate release source

The repository root includes the coordinator rollout that is still held because of the 83 school-record warnings. Do not publish the root build or root rules for this independent change.

`firestore.baseline.rules` was retrieved read-only from the active production ruleset. `baseline.json` records its ruleset and hash. `firestore.password-only.rules` adds the password/session restrictions while preserving production's roster reads, attendance permissions and Step 1 kiosk event rules. Existing coordinator grade isolation remains held. Two helpers avoid repeated authorization checks to stay within Firestore's expression budget.

`scripts/prepareTemporaryPasswordRelease.mjs` creates an independent source tree from commit `26a6ed7a1797624f614c364b4dc70e5f4778842e`, then overlays the reviewed Step 3 files. A verified tree is currently at `.superpowers/releases/temporary-password-verified`. Its manifest records source hashes and the permitted deployment selection.

The prepared tree contains the older scan-handler source for module loading. That handler and the recovery triggers must not be published: production retains the deployed Step 1 implementations. **Use the deployment wrapper below. A bare `firebase deploy`, including `--only functions`, does not enforce the manifest and is unsuitable for this tree.** The wrapper validates the source and rules and explicitly selects only the 25 callables, SIMS hosting or rules for each phase.

To create a fresh source tree from the repository root:

```powershell
node scripts/prepareTemporaryPasswordRelease.mjs .superpowers/releases/temporary-password-new
```

Use a new output directory. Install or reuse the project's locked dependencies there before testing/building. Build with the existing SIMS production VITE configuration; do not use placeholder configuration for publishing. Restore the existing Functions parameter configuration securely before deployment. Secrets and environment files are not included in the release manifest or source preparation.

## Verification evidence

| Check | Result |
| --- | --- |
| Root SIMS unit suite | 433 tests passed |
| Root Functions unit suite | 138 tests passed |
| Root Functions/Auth emulator suite | 162 tests passed |
| Root Firestore rules suite | 128 tests passed |
| Parent unit suite | 99 tests passed; Parent source unchanged |
| Password-only rules and production compatibility | 63 tests passed |
| Independent SIMS source unit suite | 367 tests passed |
| Independent Functions source unit suite | 111 tests passed |
| Independent password and binding migration emulator checks | 17 tests passed |
| SIMS production-config builds, root and independent tree | Passed |
| Release wrapper `verify` | Passed; no deployment performed |

The callable emulator tests invoke exported handlers with `.run()`; they exercise authorization and mutations but do not independently test the deployed HTTP/App Check middleware. Main success/reset tests use actual Auth emulator sign-ins and reuse the old token to verify rejection. Other boundary tests supply explicit `auth_time` values. Rules tests exercise direct database access and UID-bound normal staff permissions. No browser walkthrough or production account/scanner test was performed. Build output still reports the existing large-chunk warning.

## Staff UID binding migration

The server-owned `staff_profiles/{uid}` lookup prevents an Auth email change from bypassing restrictions. Existing staff must be bound before this release is considered effective. This migration affects only staff profiles and their UID lookup documents; it does not change the orphan enrollment/attendance records holding the coordinator rollout.

Run this from the reviewed source tree with the authorized project's ADC credentials:

```powershell
node functions/scripts/backfillStaffProfileBindings.mjs bnhs-sims
```

It defaults to a dry-run and prints aggregate counts only. Investigate every identity warning without guessing or deleting accounts. Keep a protected pre-change snapshot of staff profiles and mappings. Pause staff account creation, deletion, password resets/changes and Auth email changes while reviewing and applying the migration; Auth reads cannot join the Firestore transaction.

Only a zero-warning plan can be applied:

```powershell
node functions/scripts/backfillStaffProfileBindings.mjs bnhs-sims --apply
node functions/scripts/backfillStaffProfileBindings.mjs bnhs-sims
```

The second dry-run must report zero changes and zero warnings. The apply transaction checks profile versions and mapping conflicts and commits all planned bindings or none. More than 200 changed accounts requires a separately reviewed migration approach. The October 12 production dry-run reported eight profiles, eight changes and zero warnings; the final migration result is recorded with the deployment audit.

## Controlled publication

Keep staff usage and account mutations paused through the cutover. Re-read the active rules before publishing and compare them with the captured baseline; resolve production drift first. Confirm this base source still matches the intended SIMS release, runtime parameters and hosting configuration. Complete the reviewed staff binding migration and production build first.

From **inside the prepared release directory**, these commands publish when deployment is authorized:

```powershell
node scripts/deployTemporaryPasswordRelease.mjs verify
node scripts/deployTemporaryPasswordRelease.mjs hosting
node scripts/deployTemporaryPasswordRelease.mjs functions
node scripts/deployTemporaryPasswordRelease.mjs rules
```

Wait for each phase to succeed. The wrapper specifies project `bnhs-sims` and `firebase.password-release.json`. It excludes Parent/Kiosk hosting, indexes, scheduled jobs and scan/recovery triggers. A failed or partial phase leaves the maintenance hold in place until inspected; publication is not atomic across Firebase services.

Before resuming staff usage, verify live rules and callable revisions against this release. With designated accounts, confirm: temporary-password users see only password setup; direct data access is denied; successful password setup permits a new session; the old token remains denied; an admin reset signs out the prior session. Reload SIMS and check an ordinary administrator and coordinator. Confirm ordinary Parent App access and one designated kiosk scan still work. Do not insert arbitrary production student records for testing.

If a password operation is interrupted after Auth dispatch, keep its account restricted and investigate the operation and deployed worker before recovery. Do not simply delete the lock, clear `mustChangePassword` or reduce `sessionValidAfter`: the remote mutation may have completed or still be running. Ensure another administrator has access before testing a reset/change of an administrator account.

For rollback, retain the prior callable revisions, SIMS hosting version and active ruleset before cutover. Roll back these components together under maintenance if necessary; retain UID bindings and session cutoffs unless a reviewed recovery specifically changes them. Restoring old authorization code removes the new restrictions. Never restore the pre-Step-1 rules or publish this package's old scan trigger as a shortcut.
