# Parent / Guardian Portal — Design

**Status:** approved design, pending implementation plan
**Date:** 2026-09-21
**Repositories:** `bnhs-sims` (this repo) and `bnhs-student-kiosk`

## 1. Goal

Give verified parents and guardians of BNHS learners a mobile-first web
portal where they can:

- sign in securely;
- see only the learner(s) linked to them;
- see the school-gate entry and exit times the kiosk recorded;
- receive a push notification when a new gate scan is recorded;
- review a chronological history of gate scans; and
- report a record they believe is wrong to the registrar.

"Whereabouts" means **only** gate entry/exit scans recorded by the BNHS
student kiosk. The portal performs no GPS or location tracking and never
claims to show a learner's real-time location. The UI copy says "recorded a
scan at the gate", never "location", "tracking", or "live".

### Non-goals (MVP)

- No alert when a learner has *no* scan by a cutoff time.
- No SMS or WhatsApp channel. A paid fallback is considered only after
  measuring push adoption and failure rates (Section 12, stage 5).
- No learner-facing access; no adviser/teacher role.
- No display of attendance marks (Present/Late/Absent/Excused) to parents.
- No Filipino/Cebuano translations yet; all strings are externalized so
  translation is a content task later.

### Decisions already made

| Decision | Choice |
|---|---|
| Firebase plan | **Blaze** (pay-as-you-go) with a budget and alerts; Cloud Functions is the trusted backend |
| Guardian identity | Google sign-in, with email/password as fallback |
| Guardian ↔ learner linking | Printed activation slip per learner (bulk path) + registrar-reviewed access request (exception path) |
| Staff roles | Registrar only; no new roles |
| Kiosks | 2–4 devices on stable internet, each with its own identity |
| Retention | School-year window; links re-activated each school year |
| Language | English only, strings in one file |
| Architecture | Trusted append-only scan log + separate parent app (Section 2) |

### Budget and scale

~8,000 guardian accounts, up to ~8,000 gate events per school day, 22 school
days per month. Target operating cost under ₱3,000/month. With this design
the expected Firebase bill is **₱0–120/month typical, ₱300–600 worst
realistic case**, because Blaze keeps the daily free tier and this design
stays close to it (Section 10).

## 2. Architecture and application boundaries

### Why not the alternatives

- **A `/parent` route inside the SIMS, deriving events from
  `student_attendance`** was rejected: `student_attendance` is writable by
  any anonymous caller today, so a forged write would become a real push; a
  diff of the `timeIn`/`timeOut` maps cannot distinguish a re-scan from a
  correction from an overwrite; the parent bundle would ship the registrar UI
  and `exceljs`; and the SIMS auth flow signs out anyone without a
  `users/{email}` doc.
- **A server-mediated kiosk (every scan is a callable Function)** gives the
  strongest privacy (the roster never leaves the server) but makes the gate
  fully online-dependent and adds a function round-trip per scan. It remains
  a clean *future* hardening step: the `scan_events` schema and the
  Function's validation carry over unchanged.

### Chosen: trusted event log + separate parent app

```
Kiosk (device account + App Check)
  └─ one atomic batch per scan:
       • student_attendance/{sectionId}_{date}   merge (existing behaviour)
       • scan_events/{deviceUid}_{studentId}_{yyyymmddHHMM}   create (new, immutable)
            ▼ rules: isKiosk() ∧ shape ∧ receivedAt == request.time ∧ no update/delete
Cloud Function onScanEventCreated
  └─ validates → projects to learners/{studentId} (+ /events) → fans out to
     guardians/{uid}/inbox → sends minimal FCM push
Parent portal (separate Hosting site) reads only its own docs and
  link-gated learner docs
```

### Units and where they live

| Unit | Location | Deploy target | Audience |
|---|---|---|---|
| Registrar SIMS + new **Guardians** area | `bnhs-sims/src` | Hosting site `bnhs-sims` (target `sims`) | Staff |
| **Parent portal** | `bnhs-sims/parent/` (own `package.json`, `vite.config.js`, `index.html`, `src/`, `public/firebase-messaging-sw.js`, `public/manifest.webmanifest`) | Hosting site `bnhs-parent` (target `parent`) | Guardians |
| **Cloud Functions** | `bnhs-sims/functions/` (Node 20, 2nd gen, region `asia-southeast1`) | `firebase deploy --only functions` | Server only |
| **Rules and indexes** | `bnhs-sims/firestore.rules`, `bnhs-sims/firestore.indexes.json` | `--only firestore` | — |
| **Shared pure helpers** | `bnhs-sims/shared/` | imported by path from `src/`, `parent/`, `functions/` | — |
| **Kiosk** (modified) | `bnhs-student-kiosk` (separate repo, as today) | Hosting site `bnhs-student-kiosk` (existing) | Gate devices |

The parent app is a sibling directory rather than a route because it needs
its own origin (service-worker scope and FCM registration), its own small
mobile bundle, and its own shell — but it must move in lockstep with
`firestore.rules` and `functions/`, which live in this repo. A fourth
repository would spread one trust boundary across three codebases.

**Shared-code policy.** `parent/` and `functions/` import nothing from
`bnhs-sims/src`. The few pure helpers all three need (`localDate`,
`currentSchoolYear`, time formatting) move to `shared/` with their tests.
The kiosk keeps its own copies, as it does today.

**Trust boundary.** Clients write only raw or self-owned data: the kiosk
writes `scan_events` and its attendance merge; a guardian writes only their
own device tokens, `readAt` receipts, and three profile fields. **Every
parent-facing derived document is written exclusively by Cloud Functions.**

**Config changes.** `firebase.json` gains a `hosting` array with targets
`sims` → `dist` and `parent` → `parent/dist`, a `functions` block, and an
`emulators` block (auth, firestore, functions, hosting, pubsub).
`.firebaserc` gains the `parent` target mapping. The kiosk repo's
`.firebaserc` is unchanged.

## 3. Authentication and guardian linking

### Three identities

| Identity | Signs in with | Recognized in rules by |
|---|---|---|
| Staff | Email/password (unchanged) | `isStaff()`: `users/{email}` exists (unchanged) |
| Kiosk | Per-device email/password account, signed in once by staff at `/setup` | `isKiosk()`: `kiosks/{uid}` exists with `active == true` |
| Guardian | Google sign-in, or email/password | `isGuardian()`: signed in, provider is not `anonymous`, `email_verified == true` |

Anonymous authentication is **disabled** in the Firebase console once all
kiosks have migrated. No rule anywhere accepts `request.auth != null` alone.

### Guardian accounts

There is no sign-up form beyond the two providers. Email/password accounts
must verify their email (Firebase's built-in verification mail) before
activating a link; this is also what makes password reset work. The
`guardians/{uid}` profile document is created **server-side** by the first
successful activation, never by the client. An account with no profile sees
only "Enter your activation code".

### Activation codes (bulk path)

Issued per section by the registrar via the callable
`issueActivationCodes({sectionId, schoolYear})`. For each learner enrolled in
that section for that school year (skipping learners with
`activationRestricted == true`):

- **Code:** 8 characters from the Crockford base32 alphabet (no `I`, `L`,
  `O`, `U`), displayed as `K7M4-P2XQ`; about 2⁴⁰ possibilities.
- **Storage:** `activation_codes/{sha256(code)}` with `studentId`,
  `schoolYear`, `issuedAt`, `issuedBy`, `expiresAt` (issue + 90 days),
  `maxRedemptions: 2`, `redemptions: 0`,
  `status: issued | exhausted | revoked`. The raw code is returned once by
  the callable and used by the print job; it is never stored. Reissuing a
  learner's code revokes the previous one. Reprinting therefore means
  reissuing.
- **Slip:** printed through the same print pipeline as ID cards, carrying the
  learner's name and section, the code, a QR encoding
  `https://<parent-site>/activate?c=K7M4P2XQ`, and a one-paragraph privacy
  notice.
- **Redemption:** callable `activateCode({code, relationship,
  consentVersion})`. The server checks App Check, `isGuardian`, a per-uid
  rate limit (5 attempts per hour), that `consentVersion` equals
  `settings/parent_portal.consentVersion`, the hash lookup,
  status/expiry/redemption count, that the learner is `enrolled` for
  `settings/app.currentSchoolYear`, and that the learner is not restricted.
  On success it creates or re-activates `guardian_links/{uid}_{studentId}`,
  creates the guardian profile if missing (recording `consentAcceptedAt` and
  `consentVersion`), increments `redemptions`, and appends an `audit_log`
  entry. All
  failures return one generic message; the specific reason goes to logs.

### Link document

`guardian_links/{uid}_{studentId}`: `guardianUid`, `studentId`,
`schoolYear`, `relationship`, `status: active | revoked | expired`,
`activatedAt`, `activatedVia: code | staff`, `revokedAt`, `revokedBy`,
`revokedReason`. The deterministic ID prevents duplicates. Written only by
Functions; a guardian may read their own. Every parent-facing read is gated
by a single `get()` of this document checking `status == 'active'`.

- **Many guardians per learner:** up to 2 through one slip
  (`maxRedemptions`); more through the exception path.
- **Many learners per guardian:** one link per learner; the portal lists all
  active links.
- **Exception path:** the guardian submits an access request through the
  callable `requestAccess({studentLrn, learnerNameTyped, relationship,
  contactNumber, message})` (max 3 open per uid). The registrar reviews it in
  the Guardians area and calls `resolveAccessRequest({id, approve,
  studentId?, note})`, which creates the link with `activatedVia: staff` or
  records the denial. The guardian sees the outcome as an inbox item.
- **Revocation and custody:** registrar `revokeLink({linkId, reason})` sets
  `revoked`; rules deny reads immediately and fan-out stops. Setting
  `students.activationRestricted = true` suppresses slip issuance for that
  learner and revokes any active links; only the exception path can link
  such a learner.
- **Yearly expiry:** the nightly `expireLinks` job marks a link `expired`
  when the learner no longer has an `enrolled` enrollment for
  `settings/app.currentSchoolYear`. Re-activation with a new slip flips the
  same document back to `active` with the new `schoolYear`. Guardians get a
  `system` inbox item explaining the re-activation.
- **Recovery:** Google accounts recover through Google; email/password
  accounts through Firebase's reset mail; a lost slip is reissued by the
  registrar; a lost account is handled by revoking the old links after an
  identity check and issuing a new code. Staff never see or set guardian
  passwords and cannot impersonate a guardian.

## 4. Data model

Existing collections (`students`, `sections`, `enrollments`, `schedules`,
`users`, `student_attendance`) keep their shapes. Additive changes:
`students.activationRestricted: bool` (absent = false) and a new
`settings/parent_portal` document.

Legend — writers: **K** kiosk, **G** guardian (own docs only), **S** staff,
**F** Cloud Functions (bypass rules). Anything not listed is denied.

| Collection / document | Purpose | Writes | Reads |
|---|---|---|---|
| `kiosks/{uid}` — `label`, `active`, `createdBy`, `createdAt`, `lastSeenAt` | Device allow-list; `label` is the gate name shown to parents | F (via `registerKiosk` / `deactivateKiosk`); K may update only `lastSeenAt` | S, K (own) |
| `scan_events/{deviceUid}_{studentId}_{yyyymmddHHMM}` — `studentId`, `sectionId`, `schoolYear`, `kind: in \| out`, `deviceId`, `scannedAt` (device clock, Timestamp), `scannedDate`, `scannedTime`, `receivedAt` (server time), `source: kiosk` | Raw, immutable scan log; deterministic ID makes retries idempotent | K create-only, shape-validated; nobody updates or deletes. Staff corrections are `source: staff` documents written by F, with `kind: in \| out \| void`, `voidsEventId?`, `note`, `createdBy` | S |
| `learners/{studentId}` — `displayName` (first + last only), `sectionLabel`, `schoolYear`, `today: {date, firstIn: {time, eventId}?, lastOut: {time, eventId}?, status: no_scan \| in \| out}`, `recent[≤10]`, `lastPush: {kind, at}?`, `updatedAt` | Parent-safe summary; one read renders the home card. No LRN, birthdate, address, marks, or classmates | F | G with active link, S |
| `learners/{studentId}/events/{eventId}` — `kind`, `scannedAt`, `scannedDate`, `scannedTime`, `receivedAt`, `deviceLabel`, `status: recorded \| voided`, `delayedSync: bool`, `clockSkew: bool`, `voidReason?`, `correctionOf?`, `source: kiosk \| staff` | Per-learner chronological history | F | G with active link, queries must be `orderBy scannedAt desc` with `limit ≤ 50`; S |
| `guardians/{uid}` — `email`, `displayName`, `consentAcceptedAt`, `consentVersion`, `notificationsEnabled`, `lastOpenedAt`, `createdAt` | Guardian profile | F creates; G may update only `notificationsEnabled`, `displayName`, `lastOpenedAt` | G (own), S |
| `guardians/{uid}/devices/{sha256(token)}` — `token`, `platform`, `createdAt`, `refreshedAt`, `enabled`, `failureCount` | FCM tokens, one per browser/device | G create/update/delete own; F prunes | G (own), F |
| `guardians/{uid}/inbox/{id}` — `type: attendance \| system`, `studentId?`, `learnerName?`, `kind?`, `scannedDate?`, `scannedTime?`, `eventId?`, `title?`, `body?`, `createdAt`, `readAt?`, `pushStatus: pending \| sent \| skipped_paused \| skipped_disabled \| skipped_no_device \| skipped_suppressed \| failed`, `pushSentAt?` | Authoritative notification record; attendance items use the event ID so fan-out is idempotent | F; G may set only `readAt` | G (own), `limit ≤ 50` |
| `guardian_links/{uid}_{studentId}` | See Section 3 | F | G (own), S |
| `activation_codes/{sha256}` | See Section 3 | F | S |
| `access_requests/{id}` — `guardianUid`, `guardianEmail`, `studentLrn`, `learnerNameTyped`, `relationship`, `contactNumber`, `message`, `status: open \| approved \| denied`, `createdAt`, `resolvedAt?`, `resolvedBy?`, `resolutionNote?` | Exception path | F (via callable) | G (own), S |
| `reports/{id}` — `guardianUid`, `studentId`, `eventId`, `reason: wrong_time \| not_this_learner \| missing_event \| other`, `message` (≤ 500 chars), `status: open \| resolved`, `createdAt`, `resolvedAt?`, `resolvedBy?`, `resolutionNote?`, `resolutionAction: none \| voided \| corrected` | "This record looks wrong" | F (via callable) | G (own), S |
| `audit_log/{id}` — `action`, `actorType: staff \| guardian \| kiosk \| system`, `actorUid`, `targetType`, `targetId`, `details`, `at` | Every link/code/revoke/correct/pause/device action | F | S |
| `rate_limits/{uid}` — per-action `{count, windowStart}` | Callable throttling | F | — |
| `settings/parent_portal` — `notificationsPaused`, `pausedAt`, `pausedBy`, `pauseNote`, `announcement`, `consentVersion`, `privacyNoticeUrl` | School-wide switch and banners | S | any non-anonymous signed-in user |

### Rules applied throughout

- **Guardian actions are callables; guardian writes are tiny.** Activating,
  requesting access, reporting, and deleting the account go through
  Functions (validation, rate limit, audit). Direct client writes are limited
  to device tokens, `readAt`, and three profile fields.
- **Idempotency by document ID.** `scan_events` ID = device + learner +
  minute; attendance inbox ID = event ID. Duplicate scans within one minute
  are the same document; the trigger fires once.
- **No cross-learner documents on the parent side.** `learners/*` is keyed by
  one learner; the inbox is keyed by one guardian.
- **Metrics are not Firestore documents.** Counters go to structured Cloud
  Logging and logs-based metrics.
- **Retention windows** (enforced by the nightly jobs; stated in the privacy
  notice):

  | Data | Kept | Job |
  |---|---|---|
  | `learners/*/events`, `guardians/*/inbox` | Current and previous school year; anything older is deleted | `expireInbox` (also rebuilds `learners/*.recent` if it shrinks) |
  | `scan_events` | Current and previous school year | `expireInbox` |
  | `guardians/*/devices` | Until `refreshedAt` is 60 days old, or 7 days after being disabled | `pruneDevices` |
  | `access_requests`, `reports` | Open: indefinitely; resolved: 1 year | `expireInbox` |
  | `guardian_links` | Kept while `active`; `revoked`/`expired` docs kept 1 year for the audit trail | `expireLinks` |
  | `activation_codes` | Until 1 year after `expiresAt` | `expireLinks` |
  | `audit_log` | 2 years | `expireLinks` |
  | `guardians/{uid}` and Auth user | Until the guardian deletes the account or has had no active link for 1 year | `expireLinks` |
  | `rate_limits` | Rolling windows, overwritten in place | — |

  School-year boundaries come from `settings/app.currentSchoolYear`; a
  "previous school year" is the one immediately before it.

- **Composite indexes** in `firestore.indexes.json`:
  `guardian_links (studentId, status)`, `scan_events (scannedDate, deviceId)`,
  `reports (status, createdAt)`, `access_requests (status, createdAt)`,
  `activation_codes (studentId, schoolYear)`.

## 5. Trusted event flow

### Kiosk changes (`bnhs-student-kiosk`)

- **Device login.** A staff-only setup screen at `/setup`, not reachable from
  the scan UI, where the registrar signs the device in with its
  `kiosk-<label>@…` account. The session persists across reloads. If the
  account is disabled or `kiosks/{uid}.active` becomes false, the kiosk shows
  "Device not authorized — see the registrar" and stops scanning.
  `signInAnonymously` is removed.
- **App Check** (reCAPTCHA v3) is initialized before Firestore.
- **The scan write becomes a `writeBatch`** containing the existing
  `student_attendance` merge plus the `scan_events` create, so attendance and
  the raw log cannot diverge. `scannedAt` is the device clock;
  `receivedAt` is `serverTimestamp()`. A retry after a lost acknowledgement
  hits the same document ID; the kiosk treats "already exists" as success.
- **Offline.** Firestore's IndexedDB persistence queues the batch and flushes
  it on reconnect with the original `scannedAt` and a fresh server
  `receivedAt`. The kiosk shows "Saved · will sync" while
  `hasPendingWrites` is true. No custom queue.
- Roster subscription and local Present/Late computation stay as they are
  (now permitted by `isKiosk()`).

### `onScanEventCreated` (Firestore trigger, retries enabled)

1. Load `kiosks/{deviceId}` (cached in-instance 30 s); must be `active`,
   otherwise log `rejected:device` and stop.
2. Load `enrollments/{studentId}_{schoolYear}`; must be `enrolled` with a
   matching `sectionId`, otherwise log `rejected:enrollment` and stop. The
   raw event remains in `scan_events` for staff audit.
3. Classify: `delayedSync = receivedAt − scannedAt > 2 h`;
   `clockSkew = scannedAt > receivedAt + 5 min or scannedAt < receivedAt − 24 h`.
   A skewed event is positioned by `receivedAt`.
4. In a transaction on `learners/{studentId}`: upsert
   `events/{eventId}` (from `students` take first + last name; from
   `sections` the label; from `kiosks` the gate label), recompute `today`
   and `recent[]` ordered by `scannedAt` so delayed and out-of-order events
   land in the right place.
5. Query `guardian_links` where `studentId == X` and `status == 'active'`;
   for each, create `inbox/{eventId}` with `pushStatus: pending` (skip if it
   already exists with `sent`).
6. Push (Section 6) unless `delayedSync`, `clockSkew`, or
   `learners/{id}.lastPush` shows a same-kind push less than 10 minutes ago
   (`skipped_suppressed`).
7. Emit one structured log line `{eventId, deviceId, outcome, latencyMs}`.

Staff corrections use the same path: `correctEvent({eventId, reason})`
writes a `source: staff, kind: void` event; `addManualEvent({studentId,
kind, date, time, reason})` writes a `source: staff` event. The trigger
projects them, so the parent sees the original struck through with
"Corrected by the school" and any replacement, and gets an inbox item (and a
push, subject to the same gates).

### Raw versus confirmed

- `scan_events` — the raw log: every scan, every device, never edited;
  inspectable by staff by date and device.
- `student_attendance` — the confirmed record the registrar edits and
  exports; never shown to parents.
- `learners/*/events` — the parent-visible projection of the raw log,
  labelled "gate scan", never "attendance".

### Edge cases

| Case | Behaviour |
|---|---|
| Duplicate scan, same minute | Same document ID → one event |
| Repeat scan, later minute | Recorded; `today` keeps first-in / last-out; not re-pushed within 10 minutes |
| Delayed sync / out of order | Recorded and sorted by `scannedAt`; inbox item created; push suppressed if more than 2 h late; portal shows "recorded late" |
| Entry with no exit, or exit with no entry | `today.status` reflects what exists; portal says "No exit recorded yet" / "No entry recorded today"; no notification is generated by the absence of a scan |
| Unenrolled or wrong-section learner | Raw log only; no projection; no push; logged |
| Forged event attempt | Needs kiosk auth + App Check + rules shape; the Function re-verifies device and enrollment; a device exceeding 60 events/minute is logged as a warning; the registrar can deactivate a device with one click |
| Trigger fires twice | Every step keys on `eventId`; re-execution is a no-op |

## 6. Push-notification flow

### Opt-in on the device

- The parent portal is an installable PWA (web manifest,
  `firebase-messaging-sw.js` at the origin root). The browser permission
  prompt is shown **only** when the guardian taps "Turn on notifications",
  after a one-line explanation.
- On grant, `getToken({vapidKey})` stores
  `guardians/{uid}/devices/{sha256(token)}` with `refreshedAt = now`. Every
  app open calls `getToken` again and bumps `refreshedAt`; a changed token
  creates a new document and deletes the old one.
- The UI shows per-device state: *On for this device* / *Blocked in browser
  settings* (with steps) / *Not supported here* (iOS Safari in a tab — "Add
  to Home Screen first"; iOS 16.4+ delivers Web Push only to installed PWAs).
  The account-level `notificationsEnabled` toggle is separate from device
  state; both must be true to send.
- In the foreground, `onMessage` shows an in-app toast and refreshes the
  inbox instead of an OS notification.

### Send

1. Read `settings/parent_portal` (cached 30 s). If `notificationsPaused`,
   mark the inbox item `skipped_paused` and stop.
2. Per guardian: `skipped_disabled` if `notificationsEnabled == false`;
   `skipped_no_device` if no enabled device documents.
3. `sendEachForMulticast` to that guardian's tokens with a **webpush**
   payload: `notification.title = "BNHS Learner Records"`,
   `notification.body = "BNHS recorded a new attendance event. Tap to view securely."`
   (fixed sentence; no learner name, time, or kind), `notification.tag =
   inboxId`, `data = {inboxId, studentId}`, `fcmOptions.link =
   /inbox?item=<inboxId>`, `headers.TTL = 14400` (4 h), `headers.Urgency =
   high`.
4. Per-token results: `messaging/registration-token-not-registered` or
   `messaging/invalid-argument` → delete the device document; any other
   error → `failureCount++`, `enabled = false` at 5.
5. Update the inbox item (`sent | failed`, `pushSentAt`) and
   `learners/{id}.lastPush`.

**Idempotency.** The inbox item is created with `pending` before sending.
On a retry, an existing `pending` item younger than 5 minutes is re-sent
(the `tag` collapses any duplicate on the device); an existing `sent` item
is skipped.

**Emergency switch.** `settings/parent_portal.notificationsPaused` is a
toggle in the Guardians area with a required note (a direct staff write; a
Firestore trigger `onParentPortalSettingsChanged` writes the audit entry
with the before/after values). Effect within 30 s. Events still record and inbox items still appear;
pushes stop. The portal shows "Notifications are paused by the school:
<note>".

**Hygiene.** Nightly `pruneDevices` deletes device documents with
`refreshedAt` older than 60 days or `enabled == false` for 7 days. Nightly
`expireInbox` removes inbox items outside the retention window (Section 4).

**Honest expectations.** Settings copy: "Notifications may be delayed or
missed; your Inbox always has the complete record." Nothing implies
real-time location or guaranteed delivery.

**Volume.** ≈ 8,000 events × ~1.3 linked guardians × ~1.5 devices ≈ 16K
sends/day, 2–3/second at the 7 a.m. peak. `minInstances: 0`.

## 7. Parent user experience

**Principles.** Designed at 360 px and working at 320 px; one task per
screen; tap targets ≥ 44 px; system font stack; no images except the school
seal; WCAG AA contrast; honours `prefers-reduced-motion`; every control
labelled for screen readers. Bundle budget < 200 KB gzipped, enforced in CI.
Firestore persistence is on, so previously loaded data renders instantly
with a "Last updated 7:41 AM" stamp; actions are disabled while offline.

**Routing.** A small hand-written path router (path + query parsing, back
button), matching the no-dependency style of the existing apps. URL routing
is required because push taps and QR slips deep-link.

| Route | Guardian sees |
|---|---|
| `/` signed out | School seal; "Sign in with Google"; "Sign in with email" (create account, forgot password); "For parents and guardians of BNHS learners." |
| `/verify` | Email/password only: "Check your email to verify, then tap Continue." |
| `/consent` | Once, before first activation: plain-language privacy notice, checkbox, Continue. Version recorded on the profile. Re-shown when `consentVersion` changes. |
| `/activate?c=…` | Code field (pre-filled from QR), relationship dropdown, "Link learner". Success shows the learner's name and section. Failure shows one generic message plus "Ask the registrar to reissue your slip" and a link to `/request-access`. |
| `/` **Home** | One card per linked learner: name, section, today's "Entered 7:12 AM · Main Gate" / "Left 4:05 PM" / "No entry recorded today" / "No exit recorded yet". A "Turn on notifications" banner until done. Live via `onSnapshot` on `learners/{id}`. |
| `/learner/:id` **History** | Grouped by date, newest first, 30 per page with "Load more". Rows: icon, "Entered school" / "Left school", time, gate label, badges *Recorded late* and *Corrected by the school: reason* (struck through). Each row has "Report this record". |
| `/inbox` **Inbox** | Every event and system message, unread dot; tap sets `readAt` and opens the learner's history at that event. `?item=` from a push opens straight to it. |
| `/report/:eventId` | Reason (wrong time / not this learner / a scan is missing / other), optional message, Send. Confirmation: "Sent to the registrar. You'll get a message here when it's reviewed." |
| `/request-access` | LRN, learner name, relationship, contact number, message; shows open requests. |
| `/settings` | Notifications (account toggle + this-device status with fix-it steps); Linked learners (no self-unlink — "Ask the school to remove"); My reports; Privacy notice; Delete my account; Sign out. |

**Wording rules** live in `parent/src/strings.js`, with a test asserting no
string contains "location", "tracking", or "live". Gate labels come from
`kiosks.label`. Times are shown from `scannedTime` in Philippine time; dates
as "Mon 21 Sep".

**Banners.** `settings/parent_portal.announcement` and the
notifications-paused banner render at the top of every signed-in screen.

**Read budget per visit.** Profile 1 + learners ≈ 1.2 + inbox first page
≤ 20 ≈ 6–20 reads; history pages on demand. No parent screen queries
without a `limit`.

## 8. Security and privacy

### Firestore rules (complete policy)

```
isStaff()      users/{email} exists                                   (unchanged)
isKiosk()      kiosks/{uid} exists && .active == true
isGuardian()   signed in && sign_in_provider != 'anonymous' && email_verified == true
hasLink(sid)   isGuardian() && get(guardian_links/{uid}_{sid}).status == 'active'
bounded(n)     request.query.limit <= n

students, enrollments, sections, schedules, settings/app
                        read: isStaff() || isKiosk()        write: isStaff()
settings/parent_portal  read: signed in && provider != anonymous   write: isStaff()
users                   unchanged
student_attendance      read: isStaff() || isKiosk()
                        write: isStaff() || (isKiosk() && keys ⊆ {sectionId, date, schoolYear,
                                             marks, timeIn, timeOut, rosterInitialized, updatedAt})
kiosks/{uid}            read: isStaff() || own      create/delete: never (callables)
                        update: own && affectedKeys == {lastSeenAt}
scan_events/{id}        read: isStaff()
                        create: isKiosk() && id starts with uid + '_' && deviceId == uid
                                && source == 'kiosk' && kind in {in, out}
                                && receivedAt == request.time && keys == fixed set
                        update/delete: never
learners/{sid}          read: hasLink(sid) || isStaff()               write: never
learners/{sid}/events   read: (hasLink(sid) && bounded(50)) || isStaff()   write: never
guardians/{uid}         read: own || isStaff()   create: never
                        update: own && affectedKeys ⊆ {notificationsEnabled, displayName, lastOpenedAt}
  /devices/{t}          read/write: own && keys == fixed set && token.size() < 4096
  /inbox/{i}            read: own && bounded(50)   update: own && affectedKeys == {readAt}
                        create/delete: never
guardian_links          read: own (guardianUid == uid) || isStaff()   write: never
activation_codes        read: isStaff()   write: never
audit_log               read: isStaff()   write: never
access_requests         read: own || isStaff()   write: never
reports                 read: own || isStaff()   write: never
rate_limits             read/write: never
```

`get()` in a list rule is evaluated once per query because the learner ID is
in the path, so a link check costs one read per screen.

### App Check

reCAPTCHA v3 provider (free; **not** reCAPTCHA Enterprise) in the SIMS, the
parent app, and the kiosk. Enforcement is enabled for Firestore and every
callable (`enforceAppCheck: true`) only after all three apps ship with App
Check (Section 12). Emulator and local development use debug tokens
injected through environment variables, never committed.

### Callable hardening

One shared wrapper verifies, in order: App Check token; `auth` present and
non-anonymous; `email_verified` for guardian callables; `isStaff` for staff
callables; input shape (hand-written validators, whitelisted keys, length
caps); then a `rate_limits/{uid}` window check inside a transaction.
Limits: `activateCode` 5/hour; `submitReport` 5/day; `requestAccess` 3 open;
`issueActivationCodes` 20/day per staff account. Clients receive generic
errors; the specific reason goes to structured logs.

Function inventory — callables: guardian — `activateCode`,
`requestAccess`, `submitReport`, `deleteGuardianAccount`; staff —
`issueActivationCodes`, `revokeCode`, `resolveAccessRequest`, `revokeLink`,
`resolveReport`, `correctEvent`, `addManualEvent`, `registerKiosk`,
`deactivateKiosk`. Triggers: `onScanEventCreated`,
`onParentPortalSettingsChanged`. Scheduled: `expireLinks`,
`pruneDevices` (runs `expireInbox` in the same job), `reconcileEvents`.

### Secrets and headers

Clients ship only the public Firebase config, the reCAPTCHA site key, and the
VAPID public key. Functions use the runtime service account; there are no
key files. Kiosk device passwords are generated by the registrar (16+ random
characters), typed once at `/setup`, and rotated by resetting the Auth
password and re-logging in. Hosting sends `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, `Permissions-Policy` denying geolocation and
camera on the parent site, and `Cache-Control: no-store` on `index.html`.
The parent app has no third-party analytics or tag scripts.

### Audit log

Functions append an `audit_log` entry for: code issued/reissued/revoked;
activation success and failure (hashed code, uid); link revoked/expired;
access request resolved; report resolved; event voided/added; notifications
paused/resumed; kiosk registered/deactivated; guardian account deleted. The
Guardians area filters it by learner, guardian, or date.

### Data Privacy Act 2012 and education-record confidentiality

| Obligation | How it is met |
|---|---|
| Transparency and consent | Plain-language notice at `/consent` (what, why, who, how long, rights, the school's privacy focal person and contact); version-stamped acceptance; re-consent on version change |
| Proportionality / minimization | Parents see gate scans only; `learners/*` carries first + last name, section label, and scan times; push carries nothing personal; staff names never appear to parents |
| Purpose limitation | The notice and the UI define the purpose as informing the guardian of gate scans; nothing else is derived or shared |
| Data-subject rights | Access = the portal; correction = the Report flow; withdrawal/erasure = Settings → Delete my account (revokes links, deletes profile, devices, inbox, and the Auth user; audit entries retained) or a request to the registrar; objection to notifications = the toggle |
| Retention | Section 4 windows enforced by nightly jobs and stated in the notice |
| Security and accountability | Rules, App Check, callables, audit log; Cloud Logging retained 30 days; the Guardians area answers "who could see this learner, and when" |
| Minors | Only school-vetted guardians have access; no learner-facing access in MVP |

## 9. Failure handling

Principle: **record first, notify second, reconcile nightly.** A failure
downstream of the kiosk's write can delay a notification but never loses or
invents an event.

| Failure | Detection | Behaviour | Recovery |
|---|---|---|---|
| Kiosk loses internet | `hasPendingWrites` | Scan accepted, "Saved · will sync"; batch queued with the real `scannedAt` | Flushes on reconnect; labelled `delayedSync` if > 2 h; no push |
| Kiosk deactivated / password rotated | Auth state or permission-denied | "Device not authorized — see the registrar"; nothing written | Registrar re-activates or re-logs in |
| Kiosk clock wrong | `clockSkew` in the Function | Recorded, positioned by `receivedAt`, no push, device flagged in logs | Registrar fixes the clock; device shown flagged in Guardians → Devices |
| Function throws (transient) | Eventarc retry | Retried with backoff; all steps idempotent | Automatic |
| Function fails permanently / trigger lost | Nightly `reconcileEvents` (last 2 days of `scan_events` vs projections) | Missing projections reprocessed with push suppressed; count logged | Alert if count > 0 |
| reCAPTCHA / App Check unreachable | `permission-denied` with App Check error | Cached tokens last ~1 h; then kiosk writes queue and parents see "Can't reach the school's server" | Break-glass: disable App Check enforcement in the console (runbook) |
| FCM rejects a token | Per-token result | Device doc deleted or disabled after 5 failures; inbox item `failed` | Next app open re-registers a token |
| FCM outage / delay | Send errors or silence | Inbox item already exists; `TTL = 4 h` drops stale pushes | None needed |
| Guardian blocks notifications | `Notification.permission` | Settings shows unblock steps; sends `skipped_no_device` | Guardian action |
| Link revoked/expired mid-session | `onSnapshot` permission-denied | Card replaced by "Your access to this learner has ended. Contact the registrar."; other learners unaffected | New slip or access request |
| School-year rollover | Nightly job vs `settings/app.currentSchoolYear` | Links `expired`; system inbox item asks for re-activation | New slips with the new ID cards |
| Wrong learner's ID scanned | Guardian report or staff notice | Raw log keeps it; registrar voids → strike-through + inbox note; registrar corrects `student_attendance` as today | Report → void |
| Activation brute force | Rate limit trips; failure metric spikes | Generic failure to the caller; uid and hashed attempt logged | Alert at > 50 failures/hour; registrar can revoke a section's codes |
| Runaway reads/writes or cost spike | Budget alerts; Firestore usage page | Registrar pauses notifications; if needed `firebase hosting:disable` on the parent target only | Investigate via logs; re-enable |
| Parent site down / bad deploy | Uptime check | SIMS and kiosk unaffected | `firebase hosting:rollback` for `parent` |
| Report flood / abusive guardian | Rate limit 5/day; registrar sees repeat filer | Reports recorded; registrar may revoke with a reason | Audit log |

Not handled in MVP: no alert for a missing scan by a cutoff; no SMS/WhatsApp
fallback; no automatic device deactivation on anomaly (log and alert only —
an automatic lockout at the gate is worse than a few extra events).

## 10. Cost controls

### Design-level controls

- **Bounded reads by rule.** No parent query without `limit ≤ 50`; home
  screen is one document per learner; history and inbox are paginated.
- **One write per fact.** Event 1; projection 1 transaction; inbox 1 create
  + 1 status update; no Firestore counters. Expected ≈ 25–32K writes per
  school day.
- **Cached reads in Functions** for `settings/parent_portal` and
  `kiosks/*` (30 s).
- **Push suppression** (10-minute same-kind window; none for delayed or
  skewed events).
- **Retention jobs** keep storage and indexes under the free tier.
- **Hosting bandwidth.** Content-hashed assets with
  `Cache-Control: max-age=31536000, immutable`; a returning parent downloads
  only `index.html`.
- **No paid features by construction.** reCAPTCHA v3, no Identity Platform
  upgrade, no phone auth, `minInstances: 0`, single region
  `asia-southeast1`, no Cloud Storage, no BigQuery export, exactly three
  scheduled jobs (`expireLinks`; `pruneDevices` + `expireInbox` combined;
  `reconcileEvents`) within Cloud Scheduler's free allowance.

### Monitoring (free tier)

- **GCP budget** ₱1,500 with alerts at 50 / 100 / 200 % (₱500 / ₱1,500 /
  ₱3,000) emailed to the project owner and the registrar. Alerts notify
  only; the pause switch and `hosting:disable` are the manual brakes.
- **Logs-based metrics** from structured log lines: `events_processed`,
  `events_rejected`, `pushes_sent`, `pushes_failed`, `tokens_pruned`,
  `activation_failures`, `reconcile_missing`. Alerting policies: activation
  failures > 50/h; `reconcile_missing` > 0; `pushes_failed` > 20 % of sent
  over 1 h; any Function error rate > 5 %.
- **Firestore usage** reviewed weekly during rollout against per-school-day
  ceilings: reads ≤ 60K, writes ≤ 35K, deletes ≤ 10K (retention nights
  excepted). Exceeding 2× any ceiling is a rollout stop condition.
- **Uptime check** on the parent site URL.

### Expected bill

| Service | Pessimistic daily use | Free tier | Monthly |
|---|---|---|---|
| Firestore reads | 8,000 visits × ~6 = 48K | 50K/day | ≈ ₱0 (≈ ₱40 if 2×) |
| Firestore writes | 25–32K | 20K/day | ₱10–50 |
| Firestore storage | ~50 MB per school year + indexes | 1 GiB | ≈ ₱0 |
| Cloud Functions | ~8K invocations | 2M/month | ≈ ₱0–5 |
| FCM | ~16K sends | unlimited | ₱0 |
| Hosting | cached PWA | 360 MB/day | ₱0–60 (launch weeks) |
| Auth (Google, email) | — | unlimited | ₱0 |
| App Check (reCAPTCHA v3) | — | free | ₱0 |

Typical ₱0–120/month; worst realistic ₱300–600. Non-school days cost
essentially nothing. The staged rollout measures real usage before each
expansion.

## 11. Testing

### Unit tests (Vitest, `node` environment, per package)

- `shared/`: `localDate`, `currentSchoolYear`, time formatting (moved with
  existing tests).
- `functions/src/lib/`: `classifyEvent`, `recomputeSummary`, `shouldPush`,
  `activationCode`, `validators`, `rateLimit`, `linkExpiry`, `pushPayload`
  (asserts the fixed body and no learner fields).
- `parent/src/lib/`: `router`, `groupByDate`, `formatEvent`,
  `notificationState`, `strings` (no missing keys, no forbidden words).
- Kiosk: `scanEventId`, `buildScanBatch`.

### Rules tests (`@firebase/rules-unit-testing`, emulator)

One file per collection; identities: unauthenticated, anonymous,
guardian-unverified, guardian A, guardian B, kiosk-active, kiosk-inactive,
staff. Includes: anonymous denied everywhere; A reads `learners/S1` but not
`learners/S2`, `students/*`, `student_attendance/*`, `guardians/B/*`;
`limit 51` denied, `limit 50` allowed; kiosk create with wrong `deviceId`,
extra key, or `receivedAt != request.time` denied; any update/delete on
`scan_events` denied even for staff; guardian may update only `readAt` /
allowed profile keys; `rate_limits` unreadable.

### Function tests (emulator suite, `firebase-admin` messaging stubbed)

- `onScanEventCreated`: projection + inbox for two linked guardians, revoked
  guardian skipped; re-fire is a no-op; delayed → no push; paused →
  `skipped_paused`; unenrolled → rejected; stubbed `not-registered` → device
  doc deleted.
- Every callable's happy path and each rejection branch (expired, exhausted,
  restricted, wrong SY, rate-limited, unverified email, missing App Check).
- Scheduled jobs: `expireLinks`, `pruneDevices`/`expireInbox`,
  `reconcileEvents`.
- **Throughput rehearsal:** seed 8,000 synthetic scans across 2–4 device
  identities over 15 simulated minutes; assert all projections exist; record
  the emulator's request counts as the baseline for Section 10 ceilings.

### Manual checklists (per rollout stage)

Device matrix (Android Chrome low-end with 3G throttling, Samsung Internet,
iOS Safari tab and installed PWA); push grant/receive/tap, block and fix,
expired token; accessibility (TalkBack/VoiceOver, keyboard-only, contrast,
reduced motion); Lighthouse PWA installable and < 200 KB gzipped; kiosk
offline → reconnect, device deactivation stops scanning, `/setup` not
reachable from the scan screen.

### CI

GitHub Actions: `npm test` in the SIMS, `parent`, `functions`, and the
kiosk; then `firebase emulators:exec --only auth,firestore,functions,pubsub
"npm run test:rules && npm run test:functions"`. Rules and Functions deploy
only from a green run.

## 12. Migration and rollout

### Prerequisites (one-time console work)

Project on Blaze with a ₱1,500 budget and alerts; Google sign-in enabled;
Web Push (VAPID) certificate generated; reCAPTCHA v3 site key registered for
the three origins; Hosting site `bnhs-parent` created and both targets
applied (`firebase target:apply hosting sims bnhs-sims` and
`firebase target:apply hosting parent bnhs-parent`); Functions region
`asia-southeast1`; 2–4 kiosk Auth accounts with generated
passwords; `settings/parent_portal` document created. No existing collection
changes shape.

### Kiosk migration order (the gate never stops)

1. Deploy kiosk v2 (device login at `/setup`, batch write, App Check
   unenforced) while rules still accept `request.auth != null`; old and new
   kiosks both work.
2. Registrar signs each device in; `kiosks/{uid}` documents created via
   `registerKiosk`.
3. Deploy the new rules (`isStaff() || isKiosk()`); verify scanning at every
   gate. Rollback = redeploy the previous rules file.
4. Disable Anonymous auth in the console.
5. After one clean school day, enable App Check enforcement for Firestore,
   then for Functions.

### Staged rollout

| Stage | What runs | Exit criterion |
|---|---|---|
| 0. Emulator | Full suite, fake FCM, 8,000-scan rehearsal | All tests green; rehearsal counts within Section 10 ceilings |
| 1. Internal staff test | Real project; `notificationsPaused = true` initially; 5–10 staff accounts linked to test learners; real scans, real pushes to staff phones | 3 school days: 0 rejected events, 0 reconcile gaps, pushes land on Android and iOS PWA, kiosk offline test passed |
| 2. Consenting-parent pilot | ~30 guardians recruited by advisers; codes issued only for their learners | 5 school days: ≥ 80 % activate, ≥ 60 % enable push, reports triaged same day, no privacy incident, cost ≤ ₱50 |
| 3. One section | Slips for one full section through the normal print pipeline | 2 weeks: handout works in homeroom; measured reads/writes per active guardian project to ≤ ₱600/month school-wide |
| 4. Gradual school-wide | One grade level per week (7 → 12), slips bundled with ID cards | Weekly review of usage, cost, report volume, registrar workload; stop at 2× a ceiling or a registrar backlog > 2 days |
| 5. Steady state | Retention jobs on; school-year-rollover rehearsal before March | Paid fallback considered only from measured push adoption and failure data |

### Rollback per layer

Parent site: `firebase hosting:rollback` or `hosting:disable` for the
`parent` target only. Functions: redeploy the previous version; events keep
accumulating in `scan_events` and `reconcileEvents` back-fills. Rules:
previous file. Kiosk: the previous build keeps working against the new
rules while devices stay signed in. Nothing deletes or rewrites existing
SIMS data.

### Documentation delivered with the code

`docs/parent-portal-runbook.md` (pause switch, break-glass App Check, device
deactivation, reissue slip, school-year rollover, budget alerts); the privacy
notice text; a one-page adviser handout guide.
