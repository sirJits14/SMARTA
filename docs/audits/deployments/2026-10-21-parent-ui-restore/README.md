# Restore the latest Parent UI/UX

Published 2026-10-21 (Asia/Taipei) to `bnhs-parent`, project `bnhs-sims`.
Application source: current merged `master` at `99371bb2d49a8b47021586fc21c959794232e06a`.

## Cause and correction

The previous developer-title deployment rebuilt `fa9c2cf`, an October 18 source
snapshot, instead of current master. That rolled back the UI already published
on October 20. PR #74 (`e311ee9`) remains merged, and its Shell, SignIn, History,
PageHeader, Icon and app.css files are unchanged in the current source.

The Parent app was rebuilt from current master, including PR #74 and the latest
developer titles. The release restores Settings > Appearance as the only theme
control and the icon-only Sessions calendar button.

## Deployment and verification

- Only `hosting:parent` was published, using `firebase.json` and the new
  `scripts/buildParentRelease.mjs` predeploy hook.
- The hook fetched master, checked the source revision and PR #74 ancestry,
  loaded existing production configuration without copying secrets, and built a
  fresh bundle before Firebase uploaded it.
- Production build succeeded; initial load is 219.0 KB gzip of the 260 KB budget.
- Parent regression suite: 186 tests passed. The first sandboxed attempt could
  not rename Vite temporary files; the suite passed outside the sandbox.
- All 51 live files match the local build by SHA-256, including HTML, styles,
  lazy-loaded screens and images. Main script: `assets/index-C8vTYG8X.js`.
- Compiled-asset checks confirm the Sessions icon class, the Settings theme
  controls, removal of the floating theme button, and the title
  `Lead Researcher and Product Developer`.

See `parent-hosting-verification.json` for the complete file comparison.
Signed-in screens were verified through the published assets, not an
authenticated device session.

## Future deployments

`npm run deploy:parent` uses the Hosting hook, which requires current merged
`origin/master`, PR #74 ancestry, clean Parent/shared source, and a fresh
production build within the size budget. `AGENTS.md` records the requirement to
preserve the latest merged UI/UX on every Parent release.
