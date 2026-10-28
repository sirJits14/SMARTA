# Learner add/remove requests (2026-10-22)

Spec: `docs/superpowers/specs/2026-10-22-parent-learner-requests-design.md`
Plan: `docs/superpowers/plans/2026-10-22-parent-learner-requests.md`
Builds on: `docs/releases/2026-10-22-sf2-export/README.md` (the shared `Sheet` component and the Class actions row).

A Class Adviser asks, from the Parent App, to add a learner to their advisory or to remove one with a reason. An Administrator, or whoever covers the learner's grade, decides in SIMS. Nothing changes in SIMS until a request is approved.

## What ships

- **Functions.** Nine functions are deployed by name (see "Order"). Seven are new; the other two (`endSchoolYearFn`, `deleteGuardianAccountFn`) already exist and need a redeploy for their changed behaviour to run.
  - **New callables (7)**, all in `functions/src/handlers/learnerRequests.js` and exported from `functions/index.js` as `schoolCall`s: `requestLearnerAddFn`, `requestLearnerRemovalFn`, `withdrawLearnerRequestFn`, `getLearnerRequestsFn`, `listLearnerRequestsFn`, `resolveLearnerRequestFn`, `getLearnerRequestCountFn`. They use `functions/src/lib/learnerRequestCleanup.js` (clearing contact fields, withdrawing pending requests) and `shared/learnerRequests.js` (field rules, removal reasons, who may file and decide).
  - **Rate limit:** `LIMITS.learnerRequest` in `functions/src/callable.js` (30 requests per hour per adviser).
  - **`endSchoolYearFn`** (`endSchoolYear` in `functions/src/handlers/schoolYear.js`): ending a school year now closes that year's still-pending learner requests (status `withdrawn`, reason "School year ended") and removes their address and phone numbers. The number closed goes into the `schoolyear.ended` audit row and log; the result the SIMS card shows is unchanged. **`endSchoolYearFn` must be redeployed with this release.** Without it, a request that is still pending when a year ends keeps its contact details for good, because nobody can decide it after the year ends.
  - **`deleteGuardianAccountFn`** (the only caller of `deleteSchoolAccess`, through `functions/src/handlers/account.js`): `deleteSchoolAccess` in `functions/src/handlers/schoolAccess.js` now withdraws a deleted adviser's pending learner requests ("Account deleted") and clears their address and phone numbers. Redeploy this function too, or the change does not run.
  - **Audit rows** (`audit_log`, `targetType: 'learner_request'`) carry no free text: the LRN, the learner's name, the section, the grade and, for removals, the reason code. The adviser's removal note and the rejection reason stay on the request document and in the Inbox note.
  - **Reviewer lists and counts (changed after review).** The Waiting response of `listLearnerRequestsFn` now carries `truncated` (true when more than 200 requests were pending for the person's scope, so the list shows the 200 oldest), and `getLearnerRequestCountFn` returns `{ count, truncated }`. The SIMS page shows "Showing the 200 oldest requests. Decide some to see the rest." when it is true; the badge keeps the count it is given. A coordinator or Curriculum Adviser now reads only the grades they cover, in the query itself; that is what the fifth index below is for. Decided rows sent to reviewers no longer carry the learner form (`student`).
  - **`resolveLearnerRequestFn`** returns `{ ok: true, mode }`, where `mode` is `new`, `moved`, `enrolled` (approved adds), `removed` (approved removal) or `rejected`. The SIMS page words its notice from `mode`, so a card that went stale (an "Add" that turned out to move a learner another approval just created) says "Moved", not "Added".
- **Firestore.**
  - **Five** composite indexes on `learner_change_requests` in `firestore.indexes.json`: (`requestedByUid`, `sectionId`, `createdAt` desc) for the adviser's list; (`status`, `schoolYear`, `createdAt`) for Waiting (administrators); (`status`, `schoolYear`, `gradeLevel`, `createdAt`) for the Waiting list and badge of coordinators and Curriculum Advisers; (`schoolYear`, `decidedAt` desc) and (`schoolYear`, `gradeLevel`, `decidedAt` desc) for Decided. **All five must be deployed and READY before the new handlers go live.** Without the fifth, every non-administrator's Waiting list and badge fails with a "requires an index" error. They are deployed with `firebase deploy --only firestore:indexes` (the exact command is in "Order").
  - `firestore.rules` gains an explicit `match /learner_change_requests/{id} { allow read, write: if false; }`. Production already denies the collection, so this changes nothing there and **no rules deploy is needed**.
- **SIMS:** the Learner requests page (Waiting and Decided tabs), the sidebar badge, and the access and navigation changes.
- **Parent App:** the Add learner, Remove from class and Requests sheets on the Class tab and learner history, the "Removal pending" chip, the Class tab's requests link, and the Inbox destination for `learner_request` notes.

## Order

Deploying needs the user's explicit approval in chat.

1. **Indexes, then wait until all five are READY.** Production's indexes have been deployed from the release copy rather than the root file: the 2026-10-19 release deployed them with
   `npx firebase deploy --project bnhs-sims --config firebase.school-family-release.json --non-interactive --only firestore:indexes`, which publishes `docs/releases/2026-10-18-school-family/firestore.indexes.json` (`docs/releases/2026-10-19-school-access-review/README.md`, "1. Functions and indexes"). Check the state in the Firebase console (Firestore, Indexes) before going on.

   **That release copy needs the same five entries.** It holds 28 composites (the same 28 the root `firestore.indexes.json` held before this feature; the root file now holds 33) and no `learner_change_requests` entry, so as committed it would not create them. Append the five objects from the root file to it before deploying. `docs/releases/2026-10-18-school-family/prepareRules.mjs` still runs: it requires the `audit_log` index to be the last entry of the root file ("Expected one audit_log index, last in firestore.indexes.json" otherwise), and the root file keeps `audit_log` last, with the five new entries placed before it. But the preparer carries over only the first three root indexes and the `audit_log` entry, so it does not add the five `learner_change_requests` indexes, and it rewrites the release copy from `firestore.indexes.before.json`. Those five therefore still have to be appended to `docs/releases/2026-10-18-school-family/firestore.indexes.json`, either by hand after the last preparer run or by extending the preparer in the same release commit.
2. **Functions.** The production backend is deployed by name from a prepared tree, not from `master`. For the by-name deploy mechanics, `PORTAL_URL`, `FUNCTIONS_DISCOVERY_TIMEOUT` and `NODE_OPTIONS`, the diff against the live source, and the warning about the held coordinator code (`scanAttendance`, `sessionAttendance`), follow step 1 of "Order" in `docs/releases/2026-10-22-sf2-export/README.md` and do not repeat them here. What is specific to this release:
   - Do not start this step until all five indexes are READY (step 1): the new handlers query them.
   - Deploy these nine names, and no others: the seven callables, `endSchoolYearFn` and `deleteGuardianAccountFn`. The `functionsToDeploy` list in a prepared tree's `backend-source-manifest.json` (written by `docs/releases/2026-10-18-school-family/prepareBackend.mjs`) predates them and does not include them; name them explicitly.
   - No `--force` is needed: they are callables, with no new retry trigger (the reason the 2026-10-19 release gave for its callables).
   - The prepared tree must be prepared after this work is merged and must contain every file in "Functions files" below. `prepareBackend.mjs` copies the current `functions/` and `shared/`, so a tree prepared from merged `master` has them; a tree prepared earlier does not.
   - Command shape (prepared tree, as in the SF2 notes):

     ```powershell
     $env:NODE_OPTIONS = '--dns-result-order=ipv4first'
     $env:FUNCTIONS_DISCOVERY_TIMEOUT = '120'
     npx firebase deploy --project bnhs-sims --config firebase.school-family-release.json --non-interactive --only "functions:requestLearnerAddFn,functions:requestLearnerRemovalFn,functions:withdrawLearnerRequestFn,functions:getLearnerRequestsFn,functions:listLearnerRequestsFn,functions:resolveLearnerRequestFn,functions:getLearnerRequestCountFn,functions:endSchoolYearFn,functions:deleteGuardianAccountFn"
     ```
3. **SIMS**, through the release-tree process, hosting only, and only on top of the CURRENT live SIMS tree. Each ported file is the tree's own copy with this change applied. Keep SIMS second: the page calls the new callables and reads the new indexes.

   **Do not wrap `docs/releases/2026-10-21-caps-names/prepare.mjs` alone.** That preparer rebuilds the 2026-10-21 caps-names tree. Live SIMS has moved on since (the 2026-10-21 13:04Z legacy-adviser changes, PR #90, PR #91 and PR #93), so deploying caps-names plus this overlay would remove those later features from live. Their deployment records are on `origin/master`, not on this branch (read them with `git show origin/master:<path>`; do not check it out):
   - `docs/audits/deployments/2026-10-27-sims-recent-sections/README.md`: the latest SIMS release (PR #93, published 2026-10-27, main script `index-D5qJ_tSL.js`, 61 files). Its "Reproducible preparation" is the recipe; its `baseline-verification.json` and `hosting-verification.json` show the byte checks.
   - `docs/audits/deployments/2026-10-22-sims-grade-image-export/README.md` ("Change" and "Base"): the PR #91 release that PR #93 sits on. It gives the two hand-ported legacy-adviser changes, PR #90's three import-preview files, the PR #91 overlay commands and the section-test mock adaptation (`useStaffCollectionResource` to `useCollectionResource`).
   - `docs/audits/deployments/2026-10-22-sims-import-error-nav/README.md` ("Base"): why the legacy-adviser changes exist (an unrecorded 2026-10-21 13:04Z release) and the PR #90 files.

   The sequence, from those records:
   1. Reconstruct the live tree exactly as the PR #93 record's steps 1 to 5 describe: prepare the caps-names tree with `node docs/releases/2026-10-21-caps-names/prepare.mjs <dir>` and restore the generated change to the historical `firebase.caps-names-release.json`; rebuild the PR #91 release as the grade-image-export record says (both legacy-adviser fixes, PR #90's three files from master, PR #91's `cb9e0db..bf3a892` diff, the test-mock adaptation); apply PR #93's `git diff --binary 1887cb0^ 1887cb0 -- src` with the context adapted as the PR #93 record describes. Keep the held coordinator-rollout boundary.
   2. Build that tree with the main checkout's production `VITE_*` values (`VITE_USE_EMULATORS=false`, no App Check debug token; never print or commit them). Grep the main script for the `6L...` reCAPTCHA key before any publish: the 2026-10-21 sign-in outage was a build without it.
   3. **Byte-match this baseline against live before overlaying anything.** Compare every built file's SHA-256 with the live site and save the result as `baseline-verification.json` (per file: `path`, `sha256`, `liveSha256`, `status`, `match`; plus `checked` and `mismatched`) in the new deployment record, as the PR #93 record does. Expect 61 of 61 files to match and the main script to be `index-D5qJ_tSL.js`. If anything differs, or live's main script is not the one the latest record names, stop: something was published that no record describes (the PR #90 record shows that has happened before). Find out what it was and reproduce it first.
   4. Only then apply the overlay in "SIMS overlay" below to the verified tree, run the tree's tests, build afresh, and prepare a release config in the shape of `firebase.recent-sections-release.json` (hosting `sims` only, `public` pointing at the prepared tree's `dist`).
   5. Before publishing, compare the new build with the verified baseline build, as the grade-image-export record's hash-normalised comparison does: only this feature's files and the main script should differ.
4. **Parent App last**, so requests cannot arrive before approvers have a page. Deploy it as `AGENTS.md` requires: fetch `origin/master`, `npm run deploy:parent` (its predeploy hook builds a fresh bundle; for a worktree, `PARENT_ENV_DIR` may point at the directory holding the existing production Parent `.env`; never print or commit it), preserve the PR #74 UI, and verify the live HTML and every deployed asset's bytes against the new build. A Parent App built from `master` also carries the SF2 Download button, so `exportSchoolSf2Fn` must already be live (SF2 notes, step 1) or be deployed in step 2.
5. Record one deployment under `docs/audits/deployments/`: for Functions the source revision, the exact commands and the result; for the indexes their READY state; for SIMS and the Parent App the source revision and the byte check of the live assets.

## Functions files

Taken from `git diff --name-status 1190c92..HEAD -- functions/src functions/index.js shared`, keeping only this feature's files (the SF2 files are `functions/src/handlers/sf2Export*.js` and `shared/sf2/`).

- New: `functions/src/handlers/learnerRequests.js`, `functions/src/lib/learnerRequestCleanup.js`, `shared/learnerRequests.js`.
- Changed: `functions/index.js` (the seven exports), `functions/src/callable.js` (`LIMITS.learnerRequest`), `functions/src/handlers/schoolAccess.js` (`deleteSchoolAccess`; it must still export `loadSchoolActor` and `inboxRef`, which the new handler imports), `functions/src/handlers/schoolYear.js` (`endSchoolYear`), `shared/schoolAccess.js` (`reviewGrades` becomes an export).
- Not shipped but in the repository: `functions/test/emulator/learnerRequests.test.js`, `functions/test/emulator/schoolYear.test.js`, `shared/learnerRequests.test.js`.

## SIMS overlay

Taken from `git diff --name-status 1190c92..HEAD -- src shared`, keeping only this feature's SIMS and shared files.

- New: `src/pages/LearnerRequestsPage.jsx`, `src/pages/learnerRequests/*` (`DecidedList.jsx`, `RequestCard.jsx`, `WaitingList.jsx`, `useLearnerRequestLists.js`), `src/hooks/useLearnerRequestCount.js`, `src/lib/learnerRequests.js`, `shared/learnerRequests.js`. Their tests (`src/pages/LearnerRequestsPage.test.js`, `src/pages/learnerRequests/lists.test.js`, `src/pages/learnerRequests/requestState.test.js`, `src/lib/learnerRequests.test.js`, `shared/learnerRequests.test.js`) are optional for the prepared tree.
- Ported onto the tree's copy: `src/App.jsx` (the lazy page and its route; the live tree's copy also carries PR #91's `schoolName` pass and PR #93, so apply only this feature's lines), `src/components/Shell.jsx` (the nav badge), `src/lib/access.js` (`learnerRequests` in `COORDINATOR_PAGES`; its test `src/lib/access.test.js` changed too), `src/lib/navigation.js` (the nav item).
- `shared/schoolAccess.js` is not only the one word the spec and plan describe. `shared/learnerRequests.js` imports `currentAssignments` and `reviewGrades` from it. The latest captured copy of the live file (`docs/releases/2026-10-20-retire-subject-teacher/release-source/shared/schoolAccess.js`) exports `currentAssignments` but has no `reviewGrades` at all, because `reviewGrades` came with the held coordinator rollout. Check the prepared tree with `grep reviewGrades shared/schoolAccess.js`. If it is absent, add master's `reviewGrades` function to the tree's copy as an export and leave the tree's `canReviewSection` and `canCorrectSession` as they are; changing them would pull in the held rollout. Without it the SIMS build fails.
- `src/pages/learnerRequests/useLearnerRequestLists.js` imports `schoolError` from `parent/src/lib/school.js` and passes it a second argument, a fallback message. The tree's older `parent/src/lib/school.js` (the latest captured copy is `docs/releases/2026-10-20-retire-subject-teacher/release-source/parent/src/lib/school.js`) ignores that argument. Either port `parent/src/lib/school.js` from `master` too, or accept the generic wording ("Could not complete this action. Check your connection and try again.") when a list fails to load.
- The page also imports files the live tree already has: `relativeAge` from `src/lib/schoolAssignments.js`, `capsName` and `fullName` from `src/lib/roster.js`, `src/pages/guardians/school/SubTabs.jsx`, and `Badge`, `Btn`, `Card`, `EmptyState`, `Field`, `Inp` from `src/components/ui.jsx`. A build of the prepared tree proves they are all there.
- Not part of this release: the SF2 refactor (`src/lib/sf2*.js`, `src/pages/AttendanceSummaryPage.jsx`, `shared/sf2/`).

## Parent App files

Taken from `git diff --name-status 1190c92..HEAD -- parent/src`, keeping this feature's files. The Parent App deploys from `master` as a whole, so this is a list for review, not an overlay.

- New: `parent/src/hooks/useLearnerRequests.js`, `parent/src/lib/learnerRequests.js`, `parent/src/screens/school/AddLearnerSheet.jsx`, `RemoveLearnerSheet.jsx`, `RequestsSheet.jsx` (the three sheets load on demand).
- Changed: `parent/src/screens/school/ClassActions.jsx`, `ClassTab.jsx`, `ClassTab.css`, `LearnerHistory.jsx`, `parent/src/strings.js`, `parent/src/lib/school.js` (Inbox notes of type `learner_request` open the Class tab).

## Checks

- As a Grade Level Coordinator, confirm the Learner requests item and its badge appear and only your grade's requests are listed.
- As a class adviser, add a learner and remove a learner; approve both in SIMS and confirm the roster, the learner's status in SIMS, and the Inbox notes.
- Add a learner whose LRN already exists and confirm an Administrator sees the "Already in SIMS" flag and a coordinator sees "Needs an administrator" for an Unassigned learner.
- As an Administrator, approve one request and reject another (a rejection needs a reason) and confirm the adviser's Inbox notes and the Decided tab.
- With two browser sessions, decide the same request in both. The second approver must see "Already decided."
- Reload the Parent App's learner history page directly (open its address, do not navigate from the Class tab) and confirm the Remove from class link and its sheet are styled.
- In a test environment, end the school year with a request still pending and confirm it becomes withdrawn ("School year ended") and its address and phone numbers are gone. This is the check that `endSchoolYearFn` was redeployed.
- Delete a test adviser's account that has a pending request and confirm the request is withdrawn ("Account deleted"). This is the check that `deleteGuardianAccountFn` was redeployed.
- In the Parent App, file a request, withdraw it from the Requests sheet, and confirm the "Request withdrawn." toast is visible over the sheet.
- After the indexes deploy, confirm all five show READY in the console before the new handlers are deployed.
- As a Grade Level Coordinator or Curriculum Adviser (not an administrator), open the Learner requests page and confirm the Waiting list and the sidebar badge load without a "requires an index" error. This is the check that the fifth index is READY.
- With more than 200 pending requests in a person's scope (test environment), confirm the Waiting tab shows "Showing the 200 oldest requests. Decide some to see the rest."
- Approve an Add for a learner that another approval has just moved or enrolled and confirm the notice says what happened ("Moved ..." or "Enrolled ...") and not "Added".
- Record the deployment under `docs/audits/deployments/`.

## Before release: merge `origin/master`

`origin/master` is ahead of this branch (24 commits when this was written, 2026-10-28; the SIMS releases cited in "Order" step 3 are among them). The only file that conflicts is `src/App.jsx`: master passes a `schoolName` prop to `SectionsPage` on the line next to the new Learner requests route. Merge `origin/master` into the branch, keep both changes in `src/App.jsx`, and rerun every suite (root, Parent, Functions unit and the emulator tests) before release. `git merge-tree --write-tree --name-only HEAD origin/master` lists the conflicts without touching the working tree.

## Runbook

- **Always end the previous school year.** `EndSchoolYearCard` in SIMS only counts activation slips and linked accounts; it does not mention learner requests. `endSchoolYearFn` is what closes a year's still-pending learner requests and removes their address and phone numbers. Pending requests of a year that is never ended keep those details, because nobody can decide them once the year has moved on. (This also needs the redeployed `endSchoolYearFn` from "What ships".)

## Follow-ups (tracked, not done)

- **Prune old requests.** Requests are kept forever. A later change should delete `learner_change_requests` older than the previous school year in the scheduled cleanup: `pruneDevices` in `functions/src/handlers/scheduled.js` already deletes resolved `reports` and `access_requests` once they are a year old (`retentionCutoffs`). Decided and withdrawn requests no longer hold addresses or phone numbers, but an add still keeps the learner's name, LRN and birthdate, which is the reason to prune them.
