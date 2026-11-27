# Restore advisory request controls

The Subject Teacher retirement deployment published on 21 October 2026 used the
pre-PR #77 source snapshot. It replaced the advisory control in SIMS, the Parent
request gate, and the two existing school-access callables. The source on master
still contains the feature. This release combines that feature with the published
retirement release instead of deploying the full SIMS source tree.

## Prepared source

- `prepare.mjs` wraps the verified retirement SIMS preparer. Its only SIMS source
  change is the administrator's advisory request section in `SchoolAccessTab.jsx`.
  The previous release's coordinator boundaries are retained.
- The school-family backend preparer preserves the live attendance adaptations.
  Deploy only `getSchoolContextFn`, `requestSchoolRoleFn`, and
  `setAdvisoryRequestsEnabledFn`.
- Parent comes from current master; its runtime changes since the retirement
  source revision are the advisory request gate from PR #77.
- `build.mjs` loads the existing production VITE configuration, validates the
  Firebase project, and excludes emulator mode and the App Check debug token.
- `manifest.json` in the prepared output records the source revision and hashes.

Prepare with `node docs/releases/2026-10-21-advisory-toggle/prepare.mjs`.
Link or install the declared dependencies in the prepared app directories.
Build each app with `node docs/releases/2026-10-21-advisory-toggle/build.mjs
<sims|parent> <directory-containing-production-env>`.
The prepared backend needs the existing public parameter
`PORTAL_URL=https://bnhs-parent.web.app` in its ignored Functions `.env`.

## Validation

- Both production builds passed. SIMS reports the existing large-chunk warning.
- SIMS release suite: 623 tests passed.
- Parent release suite: 183 tests passed. An initial concurrent run hit a cold
  Join import timeout; its 11-test file and then the complete suite passed alone.
- Node syntax checks passed for both preparation scripts and `schoolAccess.js`.
- A source comparison against the prepared SIMS baseline shows only the
  advisory control section added above the existing School access subtabs.

## Publish

Use `firebase.advisory-toggle-release.json` and deploy only the three named
Functions and both Hosting targets. Verify the live HTML and JavaScript bytes
against the build, including the actual `SchoolAccessTab` chunk and its imports;
checking only `index.html` does not prove that the button is present.
`node docs/releases/2026-10-21-advisory-toggle/verify.mjs` checks every deployed
file against the prepared build and asserts that the School access chunk contains
the heading, both button labels, and the administrator callable.

Status: prepared; deployment verification pending.
