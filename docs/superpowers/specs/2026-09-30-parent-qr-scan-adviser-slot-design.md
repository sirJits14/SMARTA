# Parent portal: in-app QR scan, adviser slot, school-year slips — design

Date: 2026-09-30
Builds on: `2026-09-21-parent-guardian-portal-design.md` (activation codes §3, links §4, retention §5)

## Goal

1. Parents can **scan** the QR on the activation slip from inside the parent
   app instead of typing the code (typing stays available).
2. Slips stay valid for the **whole school year** until an administrator
   manually ends the year; the 90-day expiry and the automatic rollover
   expiry are removed.
3. Each slip allows **3 people: 2 guardians + 1 class adviser**. The adviser
   uses the parent app to see the learner's gate IN/OUT like a guardian.

Out of scope: section-wide adviser access without slips, reprinting slips
(raw codes are still never stored), staff role tiers, freeing a slot when a
link is revoked.

## 1. In-app QR scanner (parent app)

**Today:** the printed QR encodes `<portal>/activate?c=<CODE>`, so a phone
camera app already deep-links into Activate. There is no scanner inside the app.

**UI.** `parent/src/screens/Activate.jsx` gains a **"Scan QR code"** button
above the code field. It opens a lazy-loaded full-screen `ScanSheet`
component: rear camera (`facingMode: 'environment'`) video, a square framing
guide, a Cancel button. On a match: short `navigator.vibrate` (if present),
camera stops, sheet closes, the code field is filled. The parent still enters
their name, picks the relationship and taps **Link learner**; a scan never
activates on its own.

**Decoding — `parent/src/lib/qrScan.js`:**
- `extractCode(text)` (pure): accepts the slip URL (any host, path ending
  `/activate`, `c` query param) or a bare code (`ABCD-1234`, lowercase,
  spaces). Normalizes the same way as the server (`O→0`, `I/L→1`, strip
  non-alphanumerics) and returns the 8-char code if it matches the Crockford
  pattern, else `null`.
- `createDetector()`: returns the native `BarcodeDetector({ formats: ['qr_code'] })`
  when `'BarcodeDetector' in window` and it supports `qr_code`; otherwise
  dynamically imports `jsqr` and wraps it (frame drawn to an offscreen canvas,
  `getImageData` → `jsQR`). Same `detect(source) → string | null` interface
  for both.
- Frames are sampled with `requestAnimationFrame`, throttled to ~8/s.

**Bundle.** `ScanSheet` and `jsqr` are dynamic imports, so they stay out of
the eager entry chunk measured by `parent/scripts/checkSize.mjs` (260 KB gz
budget unchanged). `jsqr` is added to `parent/package.json`.

**Errors / fallbacks:**
| Situation | Behaviour |
|---|---|
| Camera permission denied / no camera / `getUserMedia` missing (non-HTTPS) | Message explaining it, plus **"Take a photo of the slip instead"** (`<input type="file" accept="image/*" capture="environment">`, decoded once with the same detector) and "type the code" |
| QR decoded but `extractCode` → `null` | Inline "This QR isn't an activation slip" — keeps scanning |
| Photo has no readable QR | "Couldn't read a QR in that photo — try again closer, or type the code" |
| Sheet closes / component unmounts | All `MediaStreamTrack`s stopped, animation frame cancelled |

New strings go in `parent/src/strings.js` (`scanButton`, `scanTitle`,
`scanCancel`, `scanDenied`, `scanPhoto`, `scanNotSlip`, `scanPhotoFailed`).

## 2. Two guardian slots + one adviser slot

**Code document (`activation_codes/{hash}`), new issues:**
`guardianRedemptions: 0`, `maxGuardians: 2`, `adviserRedemptions: 0`,
`maxAdvisers: 1` (replacing `redemptions` / `maxRedemptions`). No `expiresAt`.

**Legacy codes** (issued before this change): read as
`guardianRedemptions = redemptions ?? 0`, `maxGuardians = 2`,
`adviserRedemptions = 0`, `maxAdvisers = 1`. A legacy code already marked
`exhausted` (2 guardians used) is treated as `issued` if its adviser slot is
free, so existing slips gain the adviser slot. The first redemption after
deploy writes the new fields.

**Relationships.** `RELATIONSHIPS` in `functions/src/handlers/codes.js`
becomes the guardian list; a separate `ADVISER = 'Adviser'`. `activateCode`
accepts `[...RELATIONSHIPS, ADVISER]`; `requestAccess` / `resolveAccessRequest`
keep accepting only `RELATIONSHIPS` (no adviser through the exception path).

**`activateCode` rules (in order):**
1. Validate inputs as today.
2. If `relationship === 'Adviser'`: caller's token must have
   `email_verified === true` and email ending `@deped.gov.ph`
   (case-insensitive). Otherwise throw `permission-denied` with
   "Sign in with your @deped.gov.ph account to link as adviser." This check
   runs **before** the code lookup, so it leaks nothing about code validity.
3. Existing checks (format, consent, unknown, status, learner restricted,
   enrollment) — all still the single generic message. The expiry and
   `currentSchoolYear` checks change per §3.
4. In the transaction: `slot = relationship === 'Adviser' ? 'adviser' : 'guardian'`.
   - Link already `active` for this uid+learner: no slot consumed. If the
     existing link's slot differs from the requested slot, fail (generic).
   - Otherwise, if that slot's count ≥ its max, fail `exhausted`; else increment it.
   - `status` becomes `exhausted` only when **both** slots are full.
   - Link doc gets `slot: 'guardian' | 'adviser'` alongside `relationship`.

**Parent app.** Activate's relationship `<Sel>` lists the guardian relationships
and then "Adviser". When "Adviser" is selected, a hint shows:
"For the class adviser — sign in with your DepEd (@deped.gov.ph) account."
A `permission-denied` response shows that message instead of `activateFailed`.
Advisers get the same Home cards, History, Inbox and push as guardians; they
can turn notifications off with the existing Settings toggle.

**SIMS.** Links tab already shows `relationship`, so advisers show as "Adviser".
Slip text in `src/components/ActivationSlipsPrintable.jsx` becomes:
"Parent/guardian: scan the QR in the BNHS Parent app or at {portal}, or enter
this code. Valid for SY {schoolYear} until the school revokes it. Up to 2
parents/guardians + the class adviser. Keep it private. …" (`schoolYear` is
added to each returned slip). Adviser change mid-year: registrar revokes the
old adviser's links and reissues slips (existing flow).

## 3. School-year validity and manual "End school year"

**Codes never expire by time.** `issueActivationCodes` stops writing
`expiresAt`; `CODE_TTL_MS` is removed. `activateCode` drops the `expiresAt`
check (legacy codes with a 90-day `expiresAt` keep working).

**Code SY vs current SY.** `activateCode` no longer requires
`codeDoc.schoolYear === settings/app.currentSchoolYear`. It checks enrollment
`enrollments/{studentId}_{codeDoc.schoolYear}` and writes the link with
`schoolYear: codeDoc.schoolYear`. So changing `currentSchoolYear` does not
disable slips; only revocation does.

**Nightly `expireLinks` (`functions/src/handlers/scheduled.js`).** It no
longer expires links because `link.schoolYear !== currentSchoolYear`. It still
expires a link when the learner's enrollment **for the link's own school year**
is missing or not `enrolled` (drop/transfer). The "Re-activation needed" inbox
text for that case becomes "Your link to a learner has ended because the
learner is no longer enrolled. Contact the registrar if this is a mistake."

**Retention.** Code deletion moves from `expiresAt < cutoff` to
`revokedAt < now − 365 days` (plus `exhausted` codes whose `lastRedeemedAt`
is older than 365 days). `issued` codes are never deleted.
`functions/src/lib/retention.js` cutoffs updated accordingly.

**New callable `endSchoolYear({ schoolYear, confirmText })`**
(`functions/src/handlers/codes.js`, exported via `functions/index.js` like
the other staff callables, `isStaff` gate):
1. Validate `schoolYear` (9 chars) and `confirmText === schoolYear`, else
   `invalid-argument`.
2. Revoke all `activation_codes` where `schoolYear == SY` and
   `status in ['issued', 'exhausted']` → `status: 'revoked'`,
   `revokedReason: 'school-year-ended'`, `revokedAt`, `revokedBy`.
3. Expire all `guardian_links` where `schoolYear == SY` and
   `status == 'active'` → `status: 'expired'`, `expiredAt`,
   `expiredReason: 'school-year-ended'`.
4. One system inbox item per distinct affected `guardianUid`:
   "SY {SY} has ended. Use the new activation slip from the school to link
   again for the next school year."
5. Writes in batches of ≤ 400; re-running skips already revoked/expired docs,
   so a partial failure is fixed by pressing the button again.
6. Audit `schoolyear.ended` with counts; returns
   `{ codesRevoked, linksExpired, accountsNotified }`.

New composite indexes in `firestore.indexes.json`:
`activation_codes (schoolYear ASC, status ASC)` and
`guardian_links (schoolYear ASC, status ASC)`.

**SIMS UI.** New "End school year" card at the bottom of Guardians → Codes
(`src/pages/guardians/CodesTab.jsx`, extracted to
`src/pages/guardians/EndSchoolYearCard.jsx`):
- School-year selector (defaults to the SY being viewed), counts of active
  slips and active links for it (Firestore `count()` queries).
- Red **End SY {SY}** button → dialog requiring the SY to be typed →
  calls `endSchoolYear`, shows the result counts.
- Banner at the top of Codes when an older SY than `currentSchoolYear` still
  has active slips or links: "SY {old} is still open in the parent portal —
  end it when you are ready."
- `call.endSchoolYear` added to `src/data/guardians.js`.

Any staff account can run it (the app has no staff roles today).

## 4. Docs

Update `docs/parent-portal-adviser-guide.md` (no 90 days; adviser slot and
DepEd sign-in; in-app scan), `docs/parent-portal-runbook.md` (year-end
procedure: End SY → switch current SY → issue new slips), and
`docs/parent-portal-privacy-notice.md` (class adviser may be linked and sees
gate scans).

## 5. Testing

- **Parent unit (vitest):** `extractCode` — slip URL, bare code, dashed /
  lowercase / spaced, `O/I/L` substitutions, foreign URL, wrong length, junk.
  `createDetector` — picks native when a fake `BarcodeDetector` supports
  `qr_code`, falls back to jsQR otherwise (import mocked).
- **Functions unit:** DepEd email check helper; legacy code field reading helper.
- **Functions emulator:**
  - two guardians fill guardian slots; third guardian refused; adviser still
    succeeds; code `exhausted` only after all three.
  - non-DepEd / unverified email as adviser → `permission-denied`, no code
    read side effects.
  - re-redeem by linked user consumes nothing; guardian→adviser switch refused.
  - legacy code (`redemptions: 2`, `status: 'exhausted'`, `expiresAt` in the
    past) accepts an adviser.
  - slip works 120 days after issue; works after `currentSchoolYear` changes
    (learner enrolled in slip SY).
  - `expireLinks` leaves links alone on SY change; still expires a dropped
    learner's link.
  - `endSchoolYear`: revokes codes, expires links, one inbox item per account
    with several learners, audit row; second run changes nothing; wrong
    `confirmText` rejected; non-staff rejected.
- **Rules tests:** unchanged rules; add a case that an adviser-slot link grants
  `learners/{id}` read like a guardian link.
- **Manual:** scan on Android Chrome (native) and iPhone Safari (jsQR), denied
  permission → photo fallback, `npm --prefix parent run size` stays under budget.
