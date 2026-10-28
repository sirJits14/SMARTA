# Production deployment: Parent App Class tab buttons centered

On October 28, 2026 the user asked for the Add learner and Download SF2 buttons on the Parent App's Class tab to be centered (they sat at the left of their row after the PR #95 release) and then for the change to be deployed live.

## Source

- PR #97 (`sirJits14/SMARTA`), merged as `24337fa`. The change is two lines in `parent/src/screens/school/ClassTab.css`: `justify-content: center` on `.class-actions`, and `text-align: center` on `.class-actions .class-note`.
- The PR's CI job (`test`) passed before the merge. Parent tests (33 files, 258 tests) and the Parent build passed locally.
- The user ran `gh pr merge 97` and the publish script from their own terminal (the permission classifier blocks Claude's merges and production deploys).

## Deployment

- Deployed as `AGENTS.md` requires: the checkout was fast-forwarded to the merged `origin/master` (`24337fa`), then `npm run deploy:parent`. The predeploy hook (`scripts/buildParentRelease.mjs`) fetched `origin/master`, refused anything else, confirmed the PR #74 UI baseline (`e311ee9`) is an ancestor and built a fresh bundle with the existing production Parent `.env` through `PARENT_ENV_DIR`, which was not printed or committed. Only `hosting:parent` was selected:

  ```powershell
  $env:NODE_OPTIONS = '--dns-result-order=ipv4first'
  $env:PARENT_ENV_DIR = '<main checkout>\parent'
  npm run deploy:parent -- --message 'Parent App: center the Class tab action buttons (PR 97)'
  ```

- Before the deploy, the newest Parent release was still `443a01dd827ae128` (2026-10-28T06:42:50Z, PR #95), so nothing had been published over it.
- Result: release `88863933447e311b` at 2026-10-28T07:00:27Z ("Parent App: center the Class tab action buttons (PR 97)"). Live main script `/assets/index-C6DN2qPX.js`, 59 files, initial load 219.9 KB gz (limit 260 KB).

## Verification

- The live HTML and **all 59 deployed files match the freshly built `parent/dist` byte for byte, 0 mismatches** (`parent-hosting-verification.json`, SHA-256 per file, checked 2026-10-28T07:01:09Z).
- The live `ClassTab` stylesheet contains `.class-actions{…justify-content:center…}`.
- The bundle has one App Check site-key string and no emulator hosts. The PR #74 UI markers are intact (`p-btn--solid` and `page-header-icon-btn` present, `glass-card` absent).
- Not verified: the buttons were not looked at on a phone or in a browser (the live app needs a signed-in device and App Check). Please check the Class tab on a device; pull to refresh or reopen the app if the old layout shows from the cache.

## Rollback

Firebase console, Hosting (`bnhs-parent`), Release history: roll back to `443a01dd827ae128` (PR #95). The change is CSS only and nothing else depends on it.
