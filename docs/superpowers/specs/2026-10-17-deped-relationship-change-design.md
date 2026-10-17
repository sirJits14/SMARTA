# DepEd accounts change their relationship to a linked learner — design

Date: 2026-10-17
Builds on: `2026-09-30-parent-qr-scan-adviser-slot-design.md` (2 guardians + 1 adviser),
`2026-10-13-learner-link-cap-design.md` (active links are the cap)

## Goal

Some class advisers picked **Mother** (a guardian relationship) instead of
**Adviser** when they redeemed a learner's slip. Their link takes one of the
learner's 2 guardian slots, so the learner's real parent can be refused.

A signed-in account with a verified `@deped.gov.ph` email can change its own
link's relationship **once per link per school year**, between the two sides:

- a guardian relationship (Mother, Father, Guardian, Grandparent, Sibling,
  Other) → **Adviser**, or
- **Adviser** → a guardian relationship.

Out of scope: same-side changes (Mother → Father), non-DepEd accounts, staff
editing a relationship in SIMS, a request/approval flow, notifying anyone.

## 1. Callable `changeLinkRelationship({ studentId, relationship })`

New handler in `functions/src/handlers/links.js`, exported from
`functions/index.js` as `changeLinkRelationshipFn = guardianCall(changeLinkRelationship)`.
New rate limit in `functions/src/callable.js`:
`relationshipChange: { windowMs: 60 * 60 * 1000, max: 10 }`. The once-per-year
lock is the real limit; the rate limit only stops scripted calls.

### Checks, in order

The first three run before any link or slip is read.

1. `isDepedEmail(email)` (from `functions/src/lib/codeSlots.js`); the token's
   `email_verified` is already enforced by `guardianCall`. Otherwise
   `permission-denied`: "Only DepEd (@deped.gov.ph) accounts can change their
   relationship."
2. `studentId` is a non-empty string; `relationship` is one of
   `[...RELATIONSHIPS, ADVISER]` (`oneOf`), else `invalid-argument`.
3. Rate limit (`enforceRateLimit(db, uid, 'relationshipChange', …)`).
4. In one transaction, read:
   - `guardian_links/{uid}_{studentId}` (the caller's link);
   - the learner's active links
     (`guardian_links where studentId == … where status == 'active'`, the
     query `activateCode` already uses);
   - the learner's slips for the link's school year
     (`activation_codes where studentId == … where schoolYear == …`; index
     exists), keeping only `isOpenStatus` ones;
   - the school-year doc (`schoolYearRef`).
5. The link exists, belongs to the caller, has `status === 'active'`, and its
   school year is not ended (`isEnded`). Otherwise `failed-precondition`:
   "This link is no longer active."
6. `link.relationshipChangedFor !== link.schoolYear`. Otherwise
   `failed-precondition`: "You already changed your relationship for SY {SY}.
   Ask the registrar if it needs fixing again."
7. `slotFor(relationship) !== (link.slot ?? 'guardian')`. A same-side or
   unchanged value is `invalid-argument`: "Choose Adviser, or the relationship
   you have to the learner."
8. Cap: `slotsFromLinks(activeLinks without the caller's own link, link.schoolYear)`.
   If the target slot is full, `failed-precondition`:
   - to adviser: "This learner already has an adviser linked. Ask the registrar
     to remove that link first."
   - to guardian: "This learner already has 2 linked guardians. Ask the
     registrar to remove one first."

### Writes

In the same transaction:

- Caller's link (`tx.update`): `relationship`, `slot`,
  `previousRelationship` (the old value), `relationshipChangedFor: link.schoolYear`,
  `relationshipChangedAt: serverTimestamp()`.
- Each open slip of that learner and school year: the counters and `status`
  from `slotsFromLinks` over the active links **after** the change (caller's
  link with its new slot). `redemptions` / `maxRedemptions` are deleted as
  `activateCode` does. This frees the slot the caller left, so the next real
  parent can redeem the slip. `slotsFromLinks` caps each counter at its max.

After the transaction: `audit(db, { action: 'link.relationshipChanged',
actorType: 'guardian', actorUid: uid, targetType: 'student', targetId: studentId,
details: { from, to, fromSlot, toSlot, schoolYear } })` and
`logEvent('relationship_changed', { uid, studentId })`. Refusals log
`logWarn('relationship_change_failed', { uid, reason })`.

Returns `{ relationship, slot }`.

The lock is keyed by school year: a link re-activated with next year's slip
is a new link for that year and may change once again.

`guardian_links` stays server-write-only; `firestore.rules` does not change.

## 2. Parent app — learner history screen

`parent/src/screens/History.jsx` (`/learner/:id`).

**Who sees it.** Only when `user.emailVerified` and `isDepedEmail(user.email)`
(client copy of the helper, display only; the server enforces it). For those
accounts History also reads `guardian_links/{uid}_{studentId}` with `useDoc`
(the guardian may already `get` their own link). Other accounts make no new
read and see no change. `History` needs `user` from the screen props
(`App.jsx` already passes it).

**Row** under `PageHeader`, before the scan thread:

| Link state | Row |
|---|---|
| Active, not changed this SY | "Linked as **Mother** · [Change]" |
| Active, `relationshipChangedFor === schoolYear` | "Linked as **Adviser** · changed from Mother" |
| Not active / not readable | nothing (existing "access ended" banner covers it) |

**Change sheet** (lazy-loaded `parent/src/components/RelationshipSheet.jsx`,
same modal pattern as `ScanSheet`):

- Title "Change your relationship".
- Radio list of `relationshipOptions(link.relationship)`: currently guardian →
  `Adviser (class adviser)` only; currently Adviser → the six guardian
  relationships. Nothing pre-selected.
- Note: "You can change this once for SY {SY}. After that, ask the registrar."
- **Change** (disabled until a choice is made, and while the call runs) and
  **Cancel**.
- Success: calls `callable('changeLinkRelationshipFn')`, closes the sheet; the
  live `useDoc` shows the new relationship, and Settings → My learners picks up
  the new subtitle from the links it already loads.
- Error: the callable's message for `permission-denied`, `invalid-argument`
  and `failed-precondition`, shown inline in the sheet; any other error shows
  `S.relChangeFailed` ("Could not change your relationship right now. Please
  try again in a moment.").

**Shared list.** `RELATIONSHIPS` and `ADVISER` move from
`parent/src/screens/Activate.jsx` to `parent/src/lib/relationships.js`, with
`relationshipOptions(current)` and `isDepedEmail(email)`. `Activate.jsx` imports
them.

**Strings** (`parent/src/strings.js`): `relLinkedAs`, `relChange`,
`relChangedFrom`, `relSheetTitle`, `relOnceNote`, `relConfirm`,
`relChangeFailed`.

**Bundle.** The sheet is a dynamic import; `npm --prefix parent run size`
stays under budget.

## 3. SIMS — Learner access tab

`src/pages/guardians/LinksTab.jsx`: the Relationship cell shows the
relationship and, when `previousRelationship` is set, a second muted line
"changed from {previousRelationship} · {when(relationshipChangedAt)}". No new
actions; **Revoke** remains the remedy for a wrong change.

## 4. Docs

- `docs/parent-portal-adviser-guide.md`: picked the wrong relationship? On the
  learner's screen tap **Change** — once per school year, DepEd account only.
- `docs/guardian-account-guide.md`: one line that DepEd accounts can fix an
  Adviser/guardian mix-up once.
- `docs/parent-portal-runbook.md`: when the one change is used up, staff
  **Revoke** the link and the teacher redeems the slip again with the right
  relationship; the `link.relationshipChanged` audit action.

## 5. Testing

**Functions emulator** (`functions/test/emulator/links.test.js`):

- DepEd adviser linked as Mother → Adviser: link has `slot: 'adviser'`,
  `previousRelationship: 'Mother'`, `relationshipChangedFor` = SY; the open
  slip's counters move one guardian → adviser; audit row written. Then both
  real parents can redeem the slip.
- DepEd teacher Adviser → Father: counters move the other way.
- Refused, writing nothing: non-DepEd email; same-side change (Mother →
  Father); unchanged value; second change in the same SY; adviser slot held by
  another account; both guardian slots full on Adviser → Mother; revoked,
  expired or missing link; school year ended.
- The caller's own link is not counted; revoked, expired and other-year links
  are ignored.
- A link re-activated with next year's slip can change once again.

**Rules** (`tests/rules/parent.test.js`): a guardian still cannot update their
own `guardian_links` doc (e.g. `relationship`). No rule changes.

**Parent unit (vitest):** `relationshipOptions` for a guardian value,
`Adviser`, and an unknown/legacy value (treated as guardian);
`isDepedEmail` (case, whitespace, look-alike domains).

**Parent browser fixture** (`parent/tests/browser`, existing pattern): DepEd
account sees the row and the sheet offers only the other side; gmail account
sees no row; already-changed link shows "changed from…" with no button.

**SIMS:** Relationship cell renders "changed from Mother" when
`previousRelationship` is present.

## 6. Release

Touches `functions` (new callable), the Parent app (`hosting:parent`) and SIMS
(Links tab cell). Each follows its existing release flow. Deploy functions
before the Parent app so the Change button never calls a missing callable.
