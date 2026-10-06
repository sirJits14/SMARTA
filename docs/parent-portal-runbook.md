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

**Re-activating a device that is still powered on:** clicking **Re-activate**
in Kiosk devices only flips the record in Firestore. The kiosk tab's own
live connection to that record dies the moment it was deactivated (rules
deny it read access once inactive) and does not reconnect on its own — the
device will keep showing "not authorized" until someone **reloads the page
on the kiosk itself**. Tell whoever is on-site to refresh the kiosk after
you re-activate it.

## Register a new kiosk
1. Firebase console → Authentication → Add user: `kiosk-<gate>@bnhs.local`,
   password = 16+ random characters (generate one; store it in the office safe).
2. Copy the UID → Guardians → Kiosk devices → paste UID + gate label → Register.
3. On the device: open `/setup`, sign in once. Done.

## Parent lost the slip / new guardian / custody change
- Reissue: Guardians → Activation slips → section → Issue → print. (Old
  slips for that section stop working.) For one learner only: Learner
  access → find learner → **Revoke slip**, then issue the section again
  after the other slips are handed out — or approve an access request instead.
- Custody restriction: Learner access → find learner → reason → **Restrict**.
  This revokes every guardian's and adviser's access and blocks slips until lifted.
- Remove one guardian: Learner access → row → **Revoke**.
- A parent who works for DepEd could link with a slip as the adviser. The
  Learner access tab shows each link's relationship and email. If an
  "Adviser" link is not the section's adviser, revoke that link and reissue
  the learner's slip.

## Parent says a record is wrong
Guardians → Reports. Check the Scan log tab for that date/device. Resolve
with "no change", or "Void this scan" (parent sees it struck through with
your note), or add a manual scan under Learner access.

## School-year rollover (end of SY, then before the first school day of the new SY)
1. At the end of the school year: Guardians → Activation slips → **End school
   year** → choose the ending SY → type it to confirm. This revokes all of that
   year's slips and ends every guardian and adviser link; each account gets an
   inbox message. Nothing ends on its own any more.
2. Settings → set the new current school year (as today).
3. Enroll learners into the new sections (as today).
4. Print ID cards **and** activation slips per section; hand out together.
   Old events remain visible for the previous school year only.
If step 1 is forgotten, the Activation slips tab shows a banner while the
previous SY still has active slips or links.

## Deploying the adviser-slot / school-year release
Do these in order:
1. `firebase deploy --only firestore:indexes` and wait until the new indexes
   finish building (Firebase console → Firestore → Indexes).
2. Deploy rules and functions.
3. Deploy SIMS and parent hosting.
4. First publish the v2 privacy notice (reviewed by the school head) at the
   `privacyNoticeUrl` set in Portal settings. Then raise
   `settings/parent_portal.consentVersion` by 1 so existing parents
   re-accept the updated notice, which now names the class adviser. It is
   editable in SIMS → Guardians → Portal settings ("Consent version" field,
   then **Save**).
5. After deploy, check for `activation_codes` still `issued`/`exhausted` from
   an earlier school year. If any exist, use **End school year** for that
   year.

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
- **Staff roles warning:** do not roll `firestore.rules` or functions back
  past the staff-roles release (Accounts page, 2026-10-04). Older rules and
  functions treat ANY `users/{email}` profile -- coordinators and disabled
  accounts included -- as full staff. If you must, first disable (or delete)
  every non-Administrator staff account from the Accounts page.
- Parent site: **there is no `firebase hosting:rollback` CLI command** — use
  Firebase console → Hosting → the `bnhs-parent` site → Release history →
  the "⋮" menu on a prior release → **Rollback**. This is the only reliable
  way; do not try to invent a CLI equivalent under pressure. (If you'd
  rather redeploy from source instead: `git checkout <previous tag> --
  parent && npm --prefix parent run build && npx firebase deploy --only
  hosting:parent`.)
- Functions: `git checkout <previous tag> -- functions && npx firebase deploy --only functions`.
  Raw scans keep accumulating; the nightly reconcile fills gaps.
  **Warning:** once slips have been issued by the adviser-slot / school-year
  release, do not roll functions back past it. Roll forward instead. Older
  functions expect `expiresAt` and `redemptions` on codes, which the new
  slips don't have.
- Rules: `git checkout <previous tag> -- firestore.rules && npx firebase deploy --only firestore:rules`.
  **Warning:** rolling rules back past the adviser-slot release blanks the
  parent Home list (the app asks for up to 60 links; older rules allow 50).
  Roll the parent site back too, or roll forward.

## Data-subject requests (DPA)
- Access: the parent's own portal. Correction: Reports flow. Erasure: the
  parent can delete their account in Settings (self-service: `deleteGuardianAccountFn`
  only ever deletes the CALLER's own account, it is not an admin tool for an
  arbitrary UID). If the parent cannot sign in to do this themselves,
  Learner access → Revoke removes their access to the learner immediately;
  full account/profile deletion at that point needs a developer to write a
  one-off Admin SDK script (there is no console or CLI shortcut for it).
- Breach or suspected misuse: pause notifications, deactivate the affected
  kiosk or revoke the affected link, export the Audit log tab for the date
  range, and notify the school's privacy focal person.

## Announcements

Staff post from **SIMS → Announcements**. Admins can post to all parents or any grade;
JHS/SHS coordinators to their grades; grade-level coordinators to their own grade.

- **Publish now** shows the post at once. **Schedule** sends it within 5 minutes of the set
  Philippine time (`publishAnnouncementsJob`, every 5 minutes).
- **Push** is off by default. Use it only for urgent notices. It goes to guardians who keep
  both "notifications for new gate scans" and "notifications for school announcements" on.
  The **Pause notifications** switch in Portal Settings also stops announcement pushes
  (the post shows "Push skipped: notifications paused").
- **Push results** appear in the Push column. "Push may not have reached everyone" means the
  send was interrupted or failed; pushes are never re-sent automatically. Post a short
  follow-up with push on if it must reach everyone.
- A published post's audience and push can't change. Unpublish it and post a new one.
- Who sees what is `guardians/{uid}.audienceKeys`. `onGuardianLinkWritten` sets it on every
  activation, approval, revocation and expiry; the nightly `expireLinksJob` corrects grade
  changes within the school year (a learner moved to another section). It does not move
  guardians up a grade at a new school year: those keys arrive when the link is
  re-activated for the new year.
- After the first deploy, from the repo root and with Application Default Credentials for
  the project (`gcloud auth application-default login`), run `node scripts/syncShared.mjs`
  first, then `node functions/scripts/backfillGuardianAudience.mjs <projectId>` (a dry run)
  and `node functions/scripts/backfillGuardianAudience.mjs <projectId> --apply` once.
- Wait until the new Firestore indexes show **Enabled** (Firebase console → Firestore →
  Indexes, including the `devices.enabled` collection-group exemption) before posting with
  push on; until then the push's device query, the parents' Notices list and the publish
  job can fail.
- Every publish, edit, unpublish, delete, go-out and expiry is in `audit_log`
  (`targetType: 'announcement'`).
