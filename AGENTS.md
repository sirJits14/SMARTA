# Deployment requirements

- Parent app deployments must preserve the latest merged UI/UX, including PR #74
  (`e311ee95cbfa095984721e417f0428b42953a44e`): theme selection only in
  Settings > Appearance and the icon-only Sessions calendar button.
- Fetch `origin/master` and deploy the current merged source. Never rebuild an
  older commit or reuse an existing `parent/dist` for a small text change unless
  the user explicitly requests a rollback.
- Use `npm run deploy:parent` for Parent hosting. Its predeploy hook checks the
  source revision and builds a fresh bundle. For worktrees, `PARENT_ENV_DIR` may
  point to the directory containing the existing production Parent `.env`;
  do not print or commit its contents.
- Verify the live HTML and all deployed asset bytes against the new build, and
  record the source revision and result under `docs/audits/deployments/`.
- SIMS uses its documented release preparations; a Parent-only change deploys
  only `hosting:parent`.
