# Announcements (SIMS + Parents Portal) — Design

Date: 2026-10-05
Status: Approved (brainstorming session)

## Goal

Let BNHS staff publish announcements from the SIMS app to verified parents
and guardians, who read them in a new **Notices** tab of the Parents Portal.
This replaces notices sent home on paper or posted on social media with one
official channel that only linked guardians can see.

### Decisions

| Decision | Choice |
|---|---|
| Audience | School-wide ("all parents") or one or more grade levels (7–12) |
| Publishers | Admins: any audience. Coordinators: only grades they cover; never school-wide |
| Push | Poster chooses per post; off by default |
| Content | Title + plain-text body; `http(s)` URLs auto-linked. No images or files |
| Lifecycle | Publish now, schedule for later, expiry date, pin to top (max 3), edit, unpublish |
| Read tracking | Parent-side unread marker only; staff see no read data |
| Architecture | One `announcements` collection, server-maintained guardian audience keys, rules-enforced reads (Approach A) |

### Rejected alternatives

- **Fan-out copies into each guardian's Inbox:** ~8,000 writes per
  school-wide post, and again for every edit, unpublish or expiry; mixes
  announcements into the gate-scan thread.
- **Readable by any guardian + FCM topics:** a Grade 7 parent could read a
  Grade 12 post, breaking the portal's server-enforced visibility model;
  topic subscriptions would need syncing whenever links change.

## Data model

### `announcements/{id}`

| Field | Type | Written by | Notes |
|---|---|---|---|
| `title` | string, 1–120 chars | staff | |
| `body` | string, 1–5,000 chars | staff | Plain text; line breaks kept; no HTML stored |
| `audience` | `{ all: true }` or `{ grades: number[] }` | staff | What the poster chose |
| `audienceKeys` | `['all']` or e.g. `['g7','g8']` | staff | Derived from `audience` by a shared helper; used by queries and rules |
| `status` | `'scheduled' \| 'published' \| 'unpublished' \| 'expired'` | staff, Functions | |
| `publishAt` | timestamp | staff | Now for "Publish now"; future for scheduled |
| `publishedAt` | timestamp \| null | staff (publish now) / Functions (scheduled) | Sort key for parents |
| `expiresAt` | timestamp \| null | staff | End of the chosen day, Asia/Manila |
| `pinned` | bool | staff | At most 3 live pinned posts (enforced in the UI) |
| `push` | bool | staff | Locked once published |
| `pushedAt` | timestamp \| null | Functions only | Set once; guarantees at-most-once push |
| `pushResult` | `{ status, guardians, devices, sent, failed, pruned }` | Functions only | `status`: `sending`, `sent`, `failed`, `skipped_paused`, `interrupted` |
| `createdBy`, `updatedBy` | `{ uid, name }` | staff | |
| `createdAt`, `updatedAt` | timestamp | staff | |
| `editedAt` | timestamp \| null | staff | Set only when edited after publishing; parents see "Edited" |

### Lifecycle

```
scheduled ──(publishAt reached, job)──▶ published ──(expiresAt reached, job)──▶ expired
    │                                       │
 delete (staff)                       unpublish (staff) ──▶ unpublished
```

- "Publish now" creates the post directly as `published` with
  `publishedAt = publishAt = request.time`.
- While `scheduled`, every field is editable and the post may be deleted.
- Once `published`, only `title`, `body`, `pinned` and `expiresAt` are
  editable; `audience`, `audienceKeys` and `push` are locked. To change the
  audience, unpublish and publish a new post.
- `unpublished` and `expired` are terminal and kept for the record.

### Guardian fields (on `guardians/{uid}`)

| Field | Written by | Notes |
|---|---|---|
| `audienceKeys` | Functions only | `['all', 'g7', 'g11', ...]` from the grades of the guardian's active links; `[]` with no active link (guardian sees no announcements) |
| `announcementsSeenAt` | guardian | Unread marker; posts with `publishedAt` later than this are "New" |
| `announcementPushEnabled` | guardian | Default on (missing = on). Turning off `notificationsEnabled` also stops announcement pushes |

## Firestore rules

Added to `firestore.rules`, reusing `isStaff()`, `isAdmin()`, `role()`,
`profile()`, `isGuardian()`, `own()`, `bounded()` and `affectedOnly()`.

### `match /announcements/{id}`

- **Staff read:** `allow read: if isStaff();` — every staff member sees every post.
- **Guardian read:**
  `isGuardian() && resource.data.status == 'published' && resource.data.audienceKeys.hasAny(myAudienceKeys()) && bounded(50)`,
  where `myAudienceKeys()` reads `guardians/{request.auth.uid}.audienceKeys`.
- **Staff create/update** is allowed when the author's scope covers the
  post's `audienceKeys` (on update, both the old and new keys).
  `audienceKeys` is the authoritative field for scope and visibility;
  `audience` is for display and form state only:
  - admin: any keys, including `all`;
  - `jhs_coord`: `audienceKeys.hasOnly(['g7', 'g8', 'g9', 'g10'])`;
  - `shs_coord`: `audienceKeys.hasOnly(['g11', 'g12'])`;
  - `glc`: `audienceKeys.hasOnly(['g' + string(profile().gradeLevel)])`.
  - Non-admin lists therefore can never contain `all`. Every post needs at
    least one key (`audienceKeys.size() > 0`).
- Shape checks: allowed keys only; string lengths; `status` limited to the
  transitions above; staff can never write `pushedAt` or `pushResult`;
  `audience`, `audienceKeys` and `push` unchanged when the existing status
  is `published`.
- **Delete:** staff in scope, only while `status == 'scheduled'`.

### `match /guardians/{uid}`

Extend the guardian's own-update allow-list:
`affectedOnly(['notificationsEnabled', 'displayName', 'lastOpenedAt', 'announcementsSeenAt', 'announcementPushEnabled'])`.
`audienceKeys` stays server-only.

### Risk: list queries and `hasAny`

It is not yet confirmed that the rules engine accepts the guardian list
query (`where('audienceKeys', 'array-contains-any', myKeys)` +
`where('status', '==', 'published')`) against a `hasAny(...)` rule. **The
first implementation task is an emulator rules test that settles this.**

**Fallback if it is rejected:** the parent app runs one query per audience
key (`where('audienceKeys', 'array-contains', key)` for `all` and each of its
grades), each provable by a per-key rule, and merges the results client-side
(de-duplicated by id). The rest of this design is unchanged either way.

### Indexes (`firestore.indexes.json`)

- `announcements`: `audienceKeys` (array-contains) + `status` + `publishedAt` desc — parent list and unread-dot query.
- `announcements`: `status` + `publishAt` asc, and `status` + `expiresAt` asc — the publish job.
- `guardians`: `audienceKeys` (array-contains) — audience count and push fan-out.

## SIMS: Announcements page

- New nav item `{ key: 'announcements', label: 'Announcements', icon: 'megaphone' }`
  after Guardians in `src/lib/navigation.js`; added to `COORDINATOR_PAGES` in
  `src/lib/access.js`. Grade-scope checks go through `access.js` (no role
  string comparisons in pages).
- **Tabs:** Live (published; pinned first, then newest) · Scheduled
  (soonest first) · Ended (unpublished + expired; newest first).
- **Row:** title + pin icon, audience labels ("All parents" / "Grade 7 ·
  Grade 8"), publish and expiry dates, author, push status ("Push sent to
  6,812 devices", "No push", "Push pending", "Push may not have reached
  everyone" for `interrupted`/`failed`).
- Posts outside a coordinator's scope are shown read-only.
- **Form** (`New announcement` and edit, in a `Modal`):
  - Title; Message with a character counter and the hint "Links are made clickable automatically."
  - Audience: "All parents" (admins only) or grade checkboxes from
    `gradeOptions(me)`; a `glc`'s single grade is pre-selected and locked.
  - When: "Publish now" or "Schedule" (date + time, Asia/Manila, must be in
    the future), with the note "Scheduled posts go out within 5 minutes of
    the set time."
  - Expires on: optional date; the post ends at the end of that day.
  - Pin to top: blocked with a message when 3 live posts are already pinned.
  - Send push notification: off by default; hint "Use for urgent or time-sensitive notices."
  - Locked fields (audience, push) are shown disabled when editing a live post.
- **Confirm before publish/schedule:** "This will be visible to about N
  guardians (Grades 7, 8)" plus "and send them a notification" when push is
  on. N comes from a `count()` aggregation on
  `guardians where audienceKeys array-contains-any <post keys>`.
- **Unpublish** (live posts) and **Delete** (scheduled posts) each ask for
  confirmation.
- Data access in a new `src/data/announcements.js`, following the other
  `src/data/*` modules.

## Parents Portal: Notices tab

- `NAV_TABS` becomes Home · Notices · Inbox · Settings. Page title:
  "Announcements". Routes `/announcements` (list) and `/announcements/:id`
  (detail) in `parent/src/lib/router.js`; both light the Notices tab.
- **List:** query published posts for the guardian's keys, ordered by
  `publishedAt` desc, `limit(50)`; hide any with `expiresAt` in the past
  (covers a late job). "Pinned" group first, then the rest.
  Card: title, two-line body excerpt, date ("Today, 7:30 AM" / "Oct 3"),
  audience line ("For all parents" / "For Grade 7 parents"), "New" marker.
- **New markers:** read `announcementsSeenAt` on open; posts newer than it
  keep a "New" marker for the rest of the visit (same pattern as Inbox);
  then write `announcementsSeenAt = serverTimestamp()`.
- **Unread dot:** the Shell subscribes to a `limit(1)` query for the newest
  visible post (1 read per app open) and shows a dot on Notices when its
  `publishedAt` is later than `announcementsSeenAt`.
- **Detail:** full title, date, audience, "Edited" note when `editedAt` is
  set, body with line breaks; only `http://` and `https://` URLs become
  links, opened with `target="_blank" rel="noopener noreferrer"` and shown
  as the full URL.
- **Empty state:** "No announcements yet. School notices for your learner's
  grade will appear here."
- **Settings:** new "Announcement notifications" switch writing
  `announcementPushEnabled`, shown next to the existing notifications switch.
- All strings in `parent/src/strings.js` (English).
- **Push tap:** opens `/announcements/:id` via `fcmOptions.link`; the
  existing service worker already honours that link and needs no change.

## Cloud Functions

All in `functions/`, region `asia-southeast1`, following the existing
handler layout (`functions/src/handlers/announcements.js`, pure helpers in
`functions/src/lib/`).

### `onAnnouncementWritten` (`onDocumentWritten('announcements/{id}')`, `retry: true`)

1. **Audit:** write an `audit_log` entry for create (publish/schedule),
   edit, unpublish and delete, with the actor from `createdBy`/`updatedBy`.
2. **Push gate:** continue only if `status == 'published'`, `push == true`
   and `pushedAt` is unset.
3. **Claim:** in a transaction, set `pushResult.status = 'sending'` and a
   claim time; abort if already claimed. A retry that finds a claim older
   than 10 minutes marks it `interrupted` and does **not** resend.
4. **Pause switch:** if `settings/parent_portal.notificationsPaused` is
   true, record `skipped_paused` and stop.
5. **Fan-out:** query `guardians where audienceKeys array-contains-any
   <post keys>`; drop guardians with `notificationsEnabled == false` or
   `announcementPushEnabled == false`. Query enabled devices with one
   `collectionGroup('devices').where('enabled', '==', true)` and join by
   parent uid. Send with `sendEachForMulticast` in chunks of 500.
6. **Token hygiene:** apply FCM's per-token verdicts (delete dead tokens,
   count failures, disable after `MAX_FAILURES`). This logic is extracted
   from `handlers/push.js` into a shared helper used by both the scan push
   and the announcement push.
7. **Record:** set `pushedAt` and `pushResult { status, guardians, devices, sent, failed, pruned }`.

Push payload: title "BNHS announcement", body = post title (announcements
carry no learner information), `tag` = post id, `fcmOptions.link` =
`${PORTAL_URL}/announcements/${id}`.
Function options: `timeoutSeconds: 300`, `memory: '512MiB'`.
Expected cost: ~16k reads per school-wide push, within the daily free tier.

### `publishAnnouncementsJob` (`onSchedule('*/5 * * * *')`, Asia/Manila)

- `status == 'scheduled' && publishAt <= now` → `published`,
  `publishedAt = now` (the trigger above then sends any push).
- `status == 'published' && expiresAt <= now` → `expired`.
- Cost: the project already uses the 3 free Cloud Scheduler jobs; this one
  costs about US$0.10/month. Empty runs add ~17k reads/month.

### Guardian audience keys

- Pure helper `audienceKeysFor(grades)` → `[]` when no grades, otherwise
  `['all', ...grades.map(g => 'g' + g)]`, shared with SIMS/portal via `shared/`.
- `refreshGuardianAudience(db, uid)`: reads the guardian's active
  `guardian_links`, each link's `enrollments/{studentId}_{schoolYear}`
  `gradeLevel`, and writes `guardians/{uid}.audienceKeys`.
- Called from a new `onDocumentWritten('guardian_links/{id}')` trigger
  (covers activation, approval, revocation, expiry) and from the nightly
  `expireLinks` job for every guardian it visits (catches grade changes).
- One-time backfill script `scripts/backfillGuardianAudience.mjs` for
  guardians linked before this feature, run once at rollout.

## Error handling

| Situation | Behaviour |
|---|---|
| Push interrupted mid-send | At most once: marked `interrupted`; SIMS shows "Push may not have reached everyone"; no automatic resend |
| Notifications paused | `skipped_paused`; post still visible in the tab |
| Edit after publish | No push (gate on `pushedAt`) |
| Publish job late or down | Scheduled posts go out late; the portal still hides expired posts by `expiresAt` |
| Guardian with no active link | `audienceKeys = []`; sees no announcements |
| Learner changes grade | Picked up by the link trigger or the nightly refresh |
| Coordinator writes outside scope | Rejected by rules; the UI never offers it |
| Malicious link in body | Only `http(s)` URLs are linked; full URL shown; no HTML rendered |

## Testing

- **Unit (`npm test`, `parent` and `functions` tests):** `audienceKeysFor`,
  coordinator publishable grades, pin-limit check, "Edited"/"New" logic,
  parent list sorting and expiry filtering, linkify (only `http(s)`; rejects
  `javascript:` and others), token chunking at 500, push payload.
- **Rules (`npm run test:rules`, new `tests/rules/announcements.test.js`)** —
  written first to settle the `hasAny` risk: a guardian lists `all` and
  their own grades only; never `scheduled`/`unpublished`; coordinators
  can't post outside their grades or to `all`; staff can't write
  `pushedAt`/`pushResult`; locked fields stay locked after publish; delete
  only while scheduled; guardians can update only `announcementsSeenAt` and
  `announcementPushEnabled` among the new fields.
- **Functions (`npm run test:functions`, new emulator test):** push sent
  exactly once including on retry; `skipped_paused`; opted-out guardians
  skipped; no push on edit; job publishes due posts and expires old ones;
  link changes rebuild `audienceKeys`.
- **Browser:** SIMS form and confirm dialog as admin and as a coordinator;
  portal tab, detail and unread dot at 375px width.

## Rollout

1. Deploy indexes, rules and functions.
2. Run `scripts/backfillGuardianAudience.mjs`; spot-check a few guardians.
3. Deploy the Parents Portal (Notices tab is empty until a post exists).
4. Deploy SIMS.
5. Smoke test: an admin publishes a harmless school-wide post with push
   off, confirms it on a guardian test account, then unpublishes it.
6. Docs: a section in `docs/parent-portal-runbook.md` (posting, pause
   switch, push results) and a line in `docs/guardian-account-guide.md`
   about the Notices tab and its notification switch.

## Out of scope

Images and file attachments; section-level targeting; staff read counts or
acknowledgments; drafts that aren't scheduled; resending a push or changing
the audience after publishing; SMS; translations; announcements on the Home
screen.
