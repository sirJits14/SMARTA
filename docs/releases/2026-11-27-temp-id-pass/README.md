# Release checklist — temporary ID passes and learner photos

Status: **nothing here has been deployed.** Code is on `claude/temp-student-id-pass-97a900`
(this repository) and `claude/temp-id-pass` (kiosk repository, local only).
Design: `docs/superpowers/specs/2026-11-27-temp-student-id-pass-design.md`.

Production does not match `master` for Firestore rules, several functions, or SIMS hosting.
Check the newest record under `docs/audits/deployments/` (and any newer release without a record)
before each step.

## Order

Do the steps in this order. **Functions must be live before the new rules and before the kiosk:**
the old scan handler ignores `credential` / `passCode` and would apply a pass scan unchecked.

### 1. Prerequisites

- [ ] Enable Cloud Storage in the Firebase console for `bnhs-sims` so the default bucket exists.
- [ ] Confirm the Functions runtime configuration names that bucket (`storageBucket`) and the
      runtime service account can read and write it.
- [ ] Deploy `storage.rules` (denies every client). A plain `firebase deploy` now includes storage
      rules, so keep using explicit `--only` targets.

### 2. Functions, by name only (never bare `--only functions`)

- [ ] New: `saveStudentPhotoFn`, `getStudentPhotoFn`, `issueTempPassFn`, `revokeTempPassFn`,
      `onStudentWritten`, `onEnrollmentWritten`. The two triggers use `retry: true`, so the CLI may
      ask for `--force`; compare `functions:list` with the exports first.
- [ ] Changed: `onScanEventCreated`. The live `scanAttendance.js` differs from master. Port only the
      pass check (the `temp_passes` read and the `temp_pass_inactive` rejection) onto the live
      source; see the 2026-10-15 PM session functions record.
- [ ] Changed: `getSchoolRosterFn` (adds `canEditPhotos`, `photoUpdatedAt`). Ship it from the
      prepared backend tree, as for earlier session-attendance releases.
- [ ] Changed: functions that write `learners/*` through `learnerIdentity` (activation, access
      requests, report corrections, scan handling) carry `photoUpdatedAt` once redeployed. Until
      then a learner's parent view picks the photo up only from a new photo upload. Deploy them from
      their prepared sources if parents must see photos for newly linked learners.

### 3. Firestore rules

- [ ] Download the live ruleset first. Add only this feature's changes: `coordinatorMayReadPass`,
      the `temp_passes` match, `validScanCredential` / `activePass`, and `credential`, `passCode` in
      the `scan_events` `hasOnly` list. Diff, then publish with a one-off config.
- [ ] No new indexes.

### 4. Kiosk

- [ ] Merge `claude/temp-id-pass` in the kiosk repository.
- [ ] Update the main kiosk checkout and run `npm install` there (the upstream camera scanner needs
      `qr-scanner`, which that checkout did not have on 2026-11-27).
- [ ] `npm run deploy`, compare the live `assets/index-*.js`, then reload every kiosk once.
- [ ] For `npm run staging` before the SIMS branch is merged, set `BNHS_SIMS_DIR` to a checkout
      whose rules include `temp_passes`.

### 5. SIMS hosting

- [ ] Never publish a root or worktree build. Port the change onto the newest release tree.
      The tree must include `shared/studentPhoto.js`, `shared/tempPass.js`, `shared/photoCanvas.js`
      and `shared/photoSession.js`.
- [ ] `src/lib/idCardQueue.js` differs in the release tree; port the `isIdCardPrinted` re-export by
      hand.
- [ ] The release hosting config must send `Permissions-Policy: geolocation=(), camera=(self),
      microphone=()`. The existing `firebase.*-release.json` files say `camera=()`, which blocks the
      camera.
- [ ] Before publishing, check the bundle contains the reCAPTCHA site key and no emulator hosts.

### 6. Parent App

- [ ] `npm run deploy:parent` from merged `master` only; byte-check every file and record it
      (`AGENTS.md`). Initial load was 220.2 KB of the 260 KB limit.

Record each deploy under `docs/audits/deployments/`.

## Checks after release

- [ ] Settings: enter the principal's name and title.
- [ ] As a class adviser on a phone: add a photo with the camera and with a file (try an iPhone).
- [ ] As that learner's guardian: the photo appears on the learner's history screen.
- [ ] As a JHS coordinator: upload a photo and print a pass for own grades; another grade is absent.
- [ ] Print one sheet **on paper** at 100% scale: nine passes, 54 × 85.6 mm each.
- [ ] Scan that paper pass with the gate scanner: the learner is recorded.
- [ ] Scan an official ID card: unchanged.
- [ ] Confirm the official card printed for a test learner: the pass shows Official ID issued and the
      gate refuses it. Revoke another pass and confirm the same.

## Known limitations

- A pass scanned while a gate was offline, but synced after the pass ended, is refused. The gate may
  have shown it as captured, with no lasting staff notice.
- A gate restarted offline with an older cached pass list can show "expired" for a newly issued pass.
- A pass reissued and scanned in the same minute its old code was refused shows "Can't reach the
  server" for that one scan.
- Rules do not re-check the pass LRN or the printed card; the scan function rejects those.
- Photos are checked as square JPEG headers, not fully decoded.
