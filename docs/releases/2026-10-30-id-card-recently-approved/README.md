# Release — ID Cards: Recently approved (2026-10-30)

Plan: `docs/superpowers/plans/2026-10-30-id-card-recently-approved.md`
Builds on: `docs/releases/2026-10-22-learner-requests/README.md` (the approval path and the shared `learnerRequests` helpers).

When an add request creates a brand-new learner, the server logs them. An Administrator then prints their first QR card from **ID Cards > Recently approved**: select some or all, print them, or move them into the saved batch.

## What ships

- **Rules.** `id_card_approved`: administrators read and delete; nobody creates or updates it from a client.
- **Function.** Only `resolveLearnerRequestFn` (the callable's export name in `functions/index.js`; its handler is `resolveLearnerRequest`). Approving an add that creates a new learner also writes `id_card_approved/{studentId}`.
- **SIMS.** A third ID Cards tab, **Recently approved**. Every route that marks a card printed also clears the learner's log entry, and so does adding them to the saved batch.
- **Backfill script.** `functions/scripts/backfillApprovedCards.mjs`, run once.

The Parent App is unchanged. Do not deploy `hosting:parent`.

## Do not deploy from `master`

`master` holds the coordinator rollout, which is still on hold. Production runs from release trees, and publishing from the root config would switch it on under the live SIMS bundle, which still reads whole collections.

- **Rules:** `firebase deploy --only firestore:rules` from the root `firebase.json` would publish `master`'s `firestore.rules`, about 690 lines away from production's. Coordinators' SIMS would fail with permission errors. Production's rules are `docs/releases/2026-10-18-school-family/firestore.school-family.rules`.
- **Functions:** production's backend is deployed by name from a prepared tree, not from `master` (`docs/releases/2026-10-22-learner-requests/README.md`, "Order" step 2).
- **SIMS:** never publish a root build. It is rebuilt from the live release tree and this change is applied on top (`docs/releases/2026-10-22-learner-requests/README.md`, "Order" step 3).

## Order

Deploying needs the user's explicit approval in chat. Claude's own production deploys have been blocked by the classifier before: when that happens, hand the user the PowerShell command and let them run it, then byte-check live. PowerShell 5.1 rejects `&&` and `VAR=x cmd`.

**Rules first, then SIMS, then the Function, then the backfill.**

1. **Rules.** The new SIMS bundle deletes `id_card_approved/{id}` in the same write that marks a card printed. Without the rule that delete is denied and the whole write fails, so marking cards printed would break on every tab. This is the one step that must precede SIMS.
   1. Add one line to the release copy, directly under the existing `id_card_batch` line (line 112) in `docs/releases/2026-10-18-school-family/firestore.school-family.rules`:

      ```
          // Recently approved new learners (plan 2026-10-30): only the server creates them; admins read and dismiss.
          match /id_card_approved/{studentId} { allow read, delete: if isAdmin(); }
      ```

      `prepareRules.mjs` regenerates that file from `firestore.before.rules`, so it would drop the line. Add it after the last preparer run, or extend the preparer in the same commit.
   2. Confirm that copy is what production runs now: download the live ruleset read-only and diff it against the file before adding the line. The 2026-10-18 record gives ruleset `47a8d3f1…`, and the records since show no later rules deploy, but check. The only difference after your edit must be these two lines.
   3. Deploy the rules only, with the release config:

      ```powershell
      $env:NODE_OPTIONS = '--dns-result-order=ipv4first'
      npx firebase deploy --project bnhs-sims --config firebase.school-family-release.json --non-interactive --only firestore:rules
      ```

      The config also lists hosting and functions, but `--only firestore:rules` publishes nothing else.
2. **SIMS**, through the release-tree process, hosting only, and only on top of the CURRENT live SIMS tree. Nothing is read or written by this build until the Function and backfill run, so the new tab is simply empty until then.

   Live SIMS at the last record is the PR #93 chain, PR #94 and the learner-requests overlay: release `c710ecc0a091f5d4`, main script `/assets/index-BYw7kGJV.js`, 65 files. The records are on `claude/learner-requests-deployment-record` (`docs/audits/deployments/2026-10-28-learner-requests/`, PR #96); read them with `git show <ref>:<path>` without checking it out. Release history may have moved since (PR #94 once went out with no record): list `sites/bnhs-sims/releases` first and rebuild the newest preparer's tree.
   1. Rebuild the live tree as the 2026-10-28 record describes. Build it with the main checkout's production `VITE_*` values (`VITE_USE_EMULATORS=false`, no App Check debug token; never print or commit them).
   2. **Byte-match that baseline against live before overlaying anything** (every file's SHA-256 against https://bnhs-sims.web.app; expect 65 of 65 and the main script `index-BYw7kGJV.js`). If anything differs, stop: something was published that no record describes.
   3. Apply this overlay. It is four source files plus tests, taken from `git diff --binary 24337fa 6151d29 -- <path>`:
      - Changed: `src/data/idCards.js`, `src/lib/idCardQueue.js`, `src/pages/IDCardsPage.jsx`.
      - New: `src/pages/idCards/RecentlyApprovedTab.jsx`.
      - Tests (apply too, so the tree's tests stay honest): `src/data/idCards.test.js`, `src/lib/idCardQueue.test.js`, `src/pages/idCards/RecentlyApprovedTab.test.js`.

      Compare the tree's copy of each changed file with the `24337fa` version (`tr -d '\r'` and `cmp`). Apply the diff only where they are identical; where the tree differs, port the hunks by hand and check the tree diff line count equals the numstat. Tree files are LF; Git Bash `grep -c $'\r'` lies, use `tr -cd '\r' | wc -c`.
   4. **Dependency check.** `src/lib/idCardQueue.js` now imports `personText` and `whenText` from `src/lib/learnerRequests.js`, which imports `shared/learnerRequests.js`. Both came with the 2026-10-28 learner-requests overlay, so the live tree should have them. A build of the prepared tree proves it: if the build fails on either import, port them from `master`.
   5. Run the tree's tests, build afresh, and prepare a hosting-only release config (hosting `sims` only, `public` pointing at the prepared tree's `dist`), in the shape of the 2026-10-28 record's.
   6. Before publishing: grep every file in `dist/assets/` for the 40-character `6L…` reCAPTCHA key from the main `.env` (the bundler puts it in `assets/ui-*.js`), confirm no emulator hosts are in the bundle, and compare the new build with the verified baseline after hash-normalising file names and contents. Only the files this overlay touches and the main script should differ. Re-check that live still serves the main script the record names, right before publishing.
   7. Publish with `--config <release config> --only hosting:sims`, then byte-check live against the new build (new hashed names return 200 through the SPA fallback, so compare content, and wait a few seconds after release).
3. **Function.** Deploy `resolveLearnerRequestFn` only, by name, from a prepared tree.
   - Prepare the tree after this work is merged: `docs/releases/2026-10-18-school-family/prepareBackend.mjs` copies the current `functions/` and `shared/`. Confirm the tree contains the new file `functions/src/lib/approvedCards.js` and that `functions/src/handlers/learnerRequests.js` imports it. Follow `docs/releases/2026-10-22-sf2-export/README.md` step 1 for the mechanics (`PORTAL_URL` in `backend/functions/.env`, deleted afterwards; `FUNCTIONS_DISCOVERY_TIMEOUT`; `NODE_OPTIONS`; the warning about the held coordinator code in `scanAttendance` and `sessionAttendance`).
   - Before deploying, diff the live source of `resolveLearnerRequestFn` (download the function zip read-only, as the earlier records do) against the prepared tree's `functions/src/handlers/learnerRequests.js` and `functions/src/lib/`. The only differences must be the import and the `tx.set(db.doc(...APPROVED_CARDS...))` line in the new-learner branch, plus the new `approvedCards.js`.
   - No `--force`: it is a callable with no new retry trigger.

     ```powershell
     $env:NODE_OPTIONS = '--dns-result-order=ipv4first'
     $env:FUNCTIONS_DISCOVERY_TIMEOUT = '120'
     npx firebase deploy --project bnhs-sims --config firebase.school-family-release.json --non-interactive --only "functions:resolveLearnerRequestFn"
     ```
4. **Backfill.** Logs new learners approved before step 3 whose cards are still unprinted. It reads the `learner.addApproved` audit rows with `mode: 'new'`, so it covers the 2026-10-28 approvals and any made while SIMS was live without the Function. Learners already logged or in the saved batch are skipped, so running it after the Function is safe.
   - Run it from a checkout that contains this branch's merged files and has `functions/node_modules` (the main checkout), with Application Default Credentials for the ICT account. Dry run first and read the counts and skipped reasons; the output has student ids only, no names or LRNs.

     ```powershell
     $env:NODE_OPTIONS = '--dns-result-order=ipv4first'
     node functions/scripts/backfillApprovedCards.mjs bnhs-sims
     ```

     ```powershell
     node functions/scripts/backfillApprovedCards.mjs bnhs-sims --apply
     ```

   - If the run stops midway with ALREADY_EXISTS (the Function logged a learner between the script's read and write), run it again: the entries already written come back as "Already logged."
5. Record one deployment under `docs/audits/deployments/2026-10-30-id-card-recently-approved/`: for rules, the live ruleset id before and after and the diff; for SIMS, the source revision, `baseline-verification.json` and `hosting-verification.json`; for the Function, the revision and the source diff; for the backfill, the dry-run and apply counts.

## Rollback

- **SIMS:** Firebase console release history. Rolling SIMS back leaves the rules in place, which is safe.
- **Rules:** do not roll the rules back while the new SIMS bundle is live. Marking cards printed would fail. Roll SIMS back first.
- **Function:** redeploy the previous revision by name. Entries already logged stay in `id_card_approved` and are harmless.

## Checks

- As an administrator, ID Cards > **Recently approved** lists the backfilled learners with "Approved by …" and the approval time, grouped by section.
- Approve a test add request for a new LRN in Learner requests. The learner appears in the tab within seconds.
- Select two learners and **Add to saved batch**: they leave the tab and appear in **Saved batch**. In **Saved batch**, search for a third learner who is still in the log and add them: they leave the log too.
- Select learners, **Print selected**, then **Yes, mark as printed**: they leave the tab and show **Printed** elsewhere. **No, don't mark** keeps them.
- By section > print > mark printed also clears any of those learners from Recently approved.
- **Dismiss** on a selection asks first; the per-row Dismiss under "Not enrolled — won't print" does not.
- Approve an add that moves or re-enrolls an existing learner: it is not logged.
- As a coordinator, ID Cards is still unreachable, and approving requests still works.
- Confirm in the console that the new rule shows only the `id_card_approved` addition over the previous ruleset.
