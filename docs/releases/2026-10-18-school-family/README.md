# Family/School production release

Production remains on its compatible SIMS and Firestore baseline while the
coordinator grade-isolation rollout on master is held. Do not deploy the root
`firebase.json` for this release.

## Reproduce

From the repository root, with dependencies installed:

```powershell
node docs/releases/2026-10-18-school-family/prepareSims.mjs
node docs/releases/2026-10-18-school-family/prepareBackend.mjs --copy-dependencies
node docs/releases/2026-10-18-school-family/prepareRules.mjs
```

Preparers require new output directories, preserve the checkout, and perform no
deployment. SIMS reconstructs the historical production source and applies the
reviewed files in `release-source/`. The reconstructed baseline matched all 55
live files by SHA-256 before this release. Build the prepared SIMS tree with the
existing private SIMS Vite environment; build `parent/` with its existing private
environment. Never commit environment files.

The backend uses the current feature source except for two explicit adapters:

- Preserve the live optional-PM `scanAttendance.js` byte-for-byte.
- Accept missing attendance grade metadata using the server-read section grade.
  Invalid explicit grades fail; historical grades remain subject to scope checks.

The release rules retain existing production coordinator access, protect session
overrides from direct editing, deny raw school-role records, and require live
callable authorization for guardian announcements. The indexes preserve all 24
existing composite indexes and five field overrides, adding three composites.
Captured baseline rules and index definitions contain no learner records.

## Verify

```powershell
$env:TEMP = (Resolve-Path '.superpowers/sdd/2026-10-17-school-family-access').Path
$env:TMP = $env:TEMP
$env:NODE_OPTIONS = '--dns-result-order=ipv4first'
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --project demo-school-access --config firebase.school-family-release.json --only firestore,auth 'node docs/releases/2026-10-18-school-family/verifyEmulators.mjs'
```

The release suites explicitly skip the separately held coordinator assertions:
three broad-read restrictions, direct admin school-year reads, and ten scan-grade
requirements. They verify production behavior instead, including grade-less
attendance corrections and subsequent kiosk taps preserving the override.

## Publish

Use `firebase.school-family-release.json` with project `bnhs-sims`. Deploy indexes
and wait for READY; deploy only the 23 names in the generated
`backend/backend-source-manifest.json` `functionsToDeploy` array. Do not deploy
all functions. Deploy the compatible rules, then both hosting targets together.
The first deployment requires Firebase's `--force` flag to acknowledge the new
correction trigger's retry policy. Its operation and recipient claims are
idempotent and covered by emulator tests. Keep the explicit function selection;
the flag is not authorization to delete or redeploy unrelated functions.

For non-interactive Functions deployment, supply the existing production
`PORTAL_URL` in the ignored prepared Functions `.env.bnhs-sims` file. The value
for this release is `https://bnhs-parent.web.app`; verify it against the current
deployment before reuse. Firebase requires the explicit parameter even though
the source declares a default. Do not copy unrelated live environment values.

The Parent app must be rebuilt after the integration commit so Settings → About
identifies the published source. Users with older open clients need to refresh
because the old direct announcement query is intentionally no longer permitted.
School role assignment and legacy adviser verification remain explicit admin
actions; this release performs no automatic account migration.

See `../../school-family-access-rollout.md` for role semantics and recovery.
Deployment evidence is recorded under `../../audits/deployments/2026-10-18-school-family/`.
