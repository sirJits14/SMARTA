# Production deployment: optional PM session (Parent App)

On October 15, 2026, after `../2026-10-15-pm-session-functions`, the Parent App was published from the same temporary checkout of `4acf334` (branch `claude/pm-arrival-departure-option-a5ad52`, PR #31). Only `hosting:parent` was published.

## Source

The Parent App is not affected by the coordinator hold. Before the release, a build of `parent/` at `master` (`baa0422`) was compared with https://bnhs-parent.web.app with content hashes ignored. The only difference was the Settings build stamp: live was built from `6bc34b1` on 2026-10-13, and `parent/` and `shared/` are unchanged between `6bc34b1` and `baa0422`.

The PR changes `parent/src/strings.js`, `parent/src/lib/format.js` and `parent/src/screens/Home.jsx`. Compared with the `master` build, only the `Home`, `format` and shared `ui` chunks changed in content.

```bash
NODE_OPTIONS="--dns-result-order=ipv4first" npx firebase deploy --project bnhs-sims --non-interactive --only hosting:parent
```

## Verified

- Parent tests: 101 passed.
- All 32 files served by https://bnhs-parent.web.app match the deployed build by SHA-256; see `hosting-verification.json`. The main script is `/assets/index-B9IrTlet.js`.
- Not yet checked in production: a parent's Home screen showing "Late PM" or "Absent AM" for a real split-day learner.

## Behaviour now live

The Home screen shows the learner's split-day notes (`today.notes`: Late PM, Absent AM) beside today's arrival/departure. Learners without notes look exactly as before.

## Rollback

Roll back to the previous Parent App hosting version in the Firebase console. No data format changed.
