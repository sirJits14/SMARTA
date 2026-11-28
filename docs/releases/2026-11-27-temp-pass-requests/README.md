# Release checklist — adviser temporary pass requests and Logistic Operator

Status: **nothing here has been deployed.**
Design: `docs/superpowers/specs/2026-11-27-temp-pass-requests-design.md`.

Base everything on **production, not `master`**: see
`docs/audits/deployments/2026-11-27-temp-id-pass/`. Check for newer releases (including ones without
a record) before each step. The kiosk needs no change.

## Before release

- [ ] Tell JHS/SHS Academic Coordinators that ID Cards and the Photo button move to Grade Level
      Coordinators and the new Logistic Operator. They lose pass access as soon as the rules publish.
- [ ] Decide who the Logistic Operator will be. **Do not create the account until step 5 is done.**

## Order

### 1. Firestore indexes

- [ ] Compare the live indexes with `firestore.indexes.json`, then add the four `temp_pass_requests`
      composite indexes without deleting any live index (no `--force`).
- [ ] Wait until all four show **Enabled**; the Requests list fails until then.

### 2. Functions, by name only (never bare `--only functions`)

Prepare the backend tree as in the 2026-11-27 record (school-family preparer). Its `shared/` must
contain `staffRoles.js`, `tempPass.js` and `tempPassRequests.js`.

- [ ] New (7): `requestTempPassesFn`, `withdrawTempPassRequestFn`, `getTempPassRequestsFn`,
      `listTempPassRequestsFn`, `fulfilTempPassRequestsFn`, `markTempPassRequestsPrintedFn`,
      `declineTempPassRequestFn`.
- [ ] Changed pass and photo functions (3): `issueTempPassFn`, `saveStudentPhotoFn`,
      `getStudentPhotoFn`.
- [ ] Changed account functions (6), so the new role is accepted: `createStaffUserFn`,
      `updateStaffUserFn`, `setStaffUserDisabledFn`, `resetStaffPasswordFn`, `deleteStaffUserFn`,
      `changeOwnPasswordFn`. **Without `changeOwnPasswordFn` a new Logistic Operator cannot replace
      the temporary password and cannot sign in.** First compare each live source with the prepared
      tree: these have not been redeployed by the pass releases.
- [ ] Do **not** include `onScanEventCreated`. Its live copy carries a hand-applied pass check; the
      prepared tree does not unless `apply-pass-check.mjs` from the 2026-11-27 release is run again.
- [ ] Any other function keeps the old role list and refuses a Logistic Operator, which is intended.

### 3. Firestore rules

- [ ] Run `node docs/releases/2026-11-27-temp-pass-requests/build-rules.mjs` against the live base.
      If the live ruleset differs from the 2026-11-27 record, update the base first and re-run.
- [ ] Run the rules tests on the generated file (see the plan's test commands), diff, then publish it
      with a one-off config.

### 4. SIMS

Publish straight after the rules: the current live SIMS still offers Academic Coordinators a pass tab
that the new rules refuse.

- [ ] Never publish a root build. Port this feature onto the live release tree
      (`port-sims.mjs` in the 2026-11-27 record describes it). Check there:
  - the tree has no `staffQueries`; pass panels read whole collections, so keep the Grade Level
    Coordinator's `temp_passes` query filtered by grade;
  - a Logistic Operator must trigger **no** read of schedules, attendance, announcements, learner
    requests, dashboard or guardian data (the tree's app shell differs from `master`);
  - the Requests tab sits beside the tree's "Recently approved" tab;
  - new files: `usePassPrinting.js`, `PassRequestsTab.jsx`, `PassPrintParts.jsx`,
    `shared/tempPassRequests.js`.
- [ ] Keep `Permissions-Policy: camera=(self)`; check the bundle has the reCAPTCHA site key and no
      emulator addresses.

### 5. Parent App

- [ ] `npm run deploy:parent` from merged `master` only; byte-check and record (`AGENTS.md`).

## After release

- [ ] Settings: set **Pass pick-up place**.
- [ ] Accounts: create the Logistic Operator; sign in with it, change the password, and confirm it
      sees only ID Cards and Students.
- [ ] As an adviser: request one learner with a photo and one without.
- [ ] Print both from **Requests** on paper at 100% scale: four per A4 sheet, 85 × 134.8 mm, 1 × 1
      inch photo area, dashed frame for the learner without a photo.
- [ ] Scan both printed passes at the gate, then scan an official ID card.
- [ ] **Mark as printed**; confirm the adviser's inbox notice names the pick-up place.
- [ ] Request a **Lost** replacement, print it, and confirm the old pass is refused at the gate.
- [ ] Decline one request and check the adviser sees the reason.
- [ ] Record the release under `docs/audits/deployments/`.

## Known limitations

- A request that has been prepared cannot be withdrawn or declined while its pass is live, unless the
  learner can no longer be requested (for example, moved to another class). Mark it printed instead.
- The Requests list shows at most 200 requests at a time and says so.
- "Mark as printed" is enabled after any print dialog, including a cancelled one.
- A plain pass issued in the same instant a request is filed may not see that request.
