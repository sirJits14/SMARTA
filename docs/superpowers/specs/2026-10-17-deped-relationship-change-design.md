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
`relationshipChange: { windowMs: 60 * 60 * 1000, max: 60 }`. The once-per-year
lock is the real limit; an adviser may be fixing a whole section, so the rate
limit only stops scripted calls.

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
- Each open slip of that learner and school year: `moveSlot(slip, from, to,
  inUse)` in `codeSlots.js`. One count leaves the slot the caller left and
  one joins the slot they took; the side left is floored at what the learner's
  active links use (`inUse` is `slotsFromLinks` over the active links **after**
  the change) and the side joined is capped at its max. `status` follows the
  new counters. `redemptions` / `maxRedemptions` are deleted as `activateCode`
  does. This frees the slot the caller left, so the next real parent can
  redeem the slip. The slip is not fully recounted because that would also
  release counts held by **revoked** links; those stay counted, as everywhere
  else (`revokeLink` never lowers a slip's counters).

After the transaction: `audit(db, { action: 'link.relationshipChanged',
actorType: 'guardian', actorUid: uid, targetType: 'student', targetId: studentId,
details: { from, to, fromSlot, toSlot, schoolYear } })` and
`logEvent('relationship_changed', { uid, studentId })`. Refusals log
`logWarn('relationship_change_failed', { uid, reason })`.

Returns `{ relationship, slot }`.

The lock is keyed by school year: a link re-activated with next year's slip
is a new link for that year and may change once again.

Re-activation clears the old note: when `activateCode` writes a link that was
not already active, and whenever `resolveAccessRequest` approves (it sets the
relationship and slot anew), it deletes `previousRelationship` and
`relationshipChangedAt` and keeps `relationshipChangedFor`. Otherwise a
teacher whom staff fixed would show "Linked as Mother · changed from Mother",
and the once-a-year lock still holds for that school year.

`guardian_links` stays server-write-only; `firestore.rules` does not change.

## 2. Parent app — learner history screen

`parent/src/screens/History.jsx` (`/learner/:id`).

**Who sees it.** Only when `isDepedEmail(user.email)` (client copy of the
helper, display only; the server enforces it, and App's Verify gate already
keeps unverified accounts off this screen). For those
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
- Radio list of `relationshipOptions(link.slot)`: currently guardian slot (or no slot) →
  `Adviser (class adviser)` only; currently Adviser → the six guardian
  relationships. Nothing pre-selected.
- Note: "You can change this once per school year. After that, ask the registrar."
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
relationship and, when `previousRelationship` is set and
`relationshipChangedFor === link.schoolYear`, a second muted line
"changed from {previousRelationship} · {when(relationshipChangedAt)}". No new
actions; **Revoke** remains the remedy for a wrong change.

## 4. Docs

- `docs/parent-portal-adviser-guide.md`: picked the wrong relationship? On the
  learner's screen tap **Change** — once per school year, DepEd account only.
- `docs/guardian-account-guide.md`: one line that DepEd accounts can fix an
  Adviser/guardian mix-up once.
- `docs/parent-portal-runbook.md`: when the one change is used up, staff
  **Revoke** the link, **Reissue slip** for the learner, and the teacher
  redeems the new slip with the right relationship; the `link.relationshipChanged` audit action.

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

**Parent unit (vitest):** `relationshipOptions` for the guardian slot, the
adviser slot, and a missing (legacy) slot treated as guardian;
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

## Update 2026-10-18: family-only self-fix and administrator correction

The School mode redesign (PR #44) made Adviser a school role that
administrators assign in SIMS. An Adviser link now grants nothing: rules,
gate-scan pushes and the School view all skip it. This changes the design
above.

- **DepEd self-fix (Parent app, `changeLinkRelationshipFn`).** The account
  can move its own link to any *other family* relationship: same-side changes
  (Guardian → Mother) are now in scope, and so is a legacy Adviser link → a
  family relationship. Moving **to** Adviser is refused with "Family links and
  school roles are now separate. An administrator assigns school roles in
  SIMS and can correct your family link." Still once per link per school
  year, DepEd only, rate-limited, and the year must be open. Leaving the
  adviser slot moves one count on each open slip to the guardian slot, under
  the 2-guardian cap. A legacy Adviser link with no `slot` already counts as a
  guardian, so nothing moves.
- **Where.** On the learner screen, the "Linked as … · Change" row is back for
  DepEd accounts. Home leaves Adviser links out of the learner list, so it
  shows a "Linked as Adviser" section (DepEd accounts only, lazy-loaded) with
  a Change relationship button.
- **Administrator correction (SIMS, `correctLinkRelationshipFn`).** Under
  Guardians → Learner access, each active family link has a Correct
  relationship action. It takes a family relationship (never Adviser) and a
  required reason (1–500 characters). It refuses adviser links and inactive
  links. The action has no yearly limit. It writes `previousRelationship`,
  `relationshipChangedFor`, `relationshipChangedAt`, `relationshipChangedBy`
  and `relationshipChangeReason`, plus a `link.relationshipCorrected` audit row
  in the same transaction. Slots never move: every family relationship holds
  a guardian slot. A correction counts as that year's change, so the account
  cannot then self-fix again. SIMS shows "corrected from …" instead of
  "changed from …".
- A slip or staff approval that re-activates an ended link clears
  `relationshipChangedBy` and `relationshipChangeReason` along with the
  change note.
