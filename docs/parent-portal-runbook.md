# Parent portal — registrar and admin runbook

All actions below are in the SIMS → **Guardians** area unless stated.
Every one of them is written to the Audit log tab.

## Pause / resume parent notifications (emergency switch)
Guardians → Portal settings → type a reason → **Pause notifications**.
Pushes stop within 30 s. Gate scans are still recorded and still appear in
parents' inboxes with a "paused" note. **Resume** when done.

## A kiosk is lost, stolen, or misbehaving
Guardians → Kiosk devices → **Deactivate**. The device stops scanning within
seconds. To rotate its password instead: Firebase console → Authentication →
the kiosk user → Reset password, then sign in again at the kiosk's `/setup`.

## Register a new kiosk
1. Firebase console → Authentication → Add user: `kiosk-<gate>@bnhs.local`,
   password = 16+ random characters (generate one; store it in the office safe).
2. Copy the UID → Guardians → Kiosk devices → paste UID + gate label → Register.
3. On the device: open `/setup`, sign in once. Done.

## Parent lost the slip / new guardian / custody change
- Reissue: Guardians → Activation slips → section → Issue → print. (Old
  slips for that section stop working.) For one learner only: Learner
  access → find learner → **Revoke unused slip**, then issue the section again
  after the other slips are handed out — or approve an access request instead.
- Custody restriction: Learner access → find learner → reason → **Restrict**.
  This revokes every guardian's access and blocks slips until lifted.
- Remove one guardian: Learner access → row → **Revoke**.

## Parent says a record is wrong
Guardians → Reports. Check the Scan log tab for that date/device. Resolve
with "no change", or "Void this scan" (parent sees it struck through with
your note), or add a manual scan under Learner access.

## School-year rollover (before the first school day of the new SY)
1. Settings → set the new current school year (as today).
2. Enroll learners into the new sections (as today).
3. Print ID cards **and** activation slips per section; hand out together.
4. The nightly job expires last year's links automatically and tells parents
   to re-activate. Old events remain visible for the previous school year only.

## App Check break-glass (parents or kiosks all see "can't reach the server")
Firebase console → App Check → Firestore → **Unenforced** (and Functions).
This is temporary; re-enforce after the reCAPTCHA/App Check issue clears.
Record the time in the audit log by pausing and resuming notifications with a
note, so there is a trace.

## Cost or usage alarm
Billing email at ₱500 / ₱1,500 / ₱3,000 → check Firebase console → Usage.
If parent traffic is the cause: pause notifications; if needed run
`npx firebase hosting:disable --site bnhs-parent` (SIMS and kiosk unaffected).
Re-enable with a normal parent deploy.

## Rollbacks
- Parent site: `npx firebase hosting:rollback --site bnhs-parent` (or the
  console → Hosting → release history).
- Functions: `git checkout <previous tag> -- functions && npx firebase deploy --only functions`.
  Raw scans keep accumulating; the nightly reconcile fills gaps.
- Rules: `git checkout <previous tag> -- firestore.rules && npx firebase deploy --only firestore:rules`.

## Data-subject requests (DPA)
- Access: the parent's own portal. Correction: Reports flow. Erasure: the
  parent can delete their account in Settings; or Learner access → Revoke,
  and ask the developer to run `deleteGuardianAccount` for that UID if the
  parent cannot sign in.
- Breach or suspected misuse: pause notifications, deactivate the affected
  kiosk or revoke the affected link, export the Audit log tab for the date
  range, and notify the school's privacy focal person.
