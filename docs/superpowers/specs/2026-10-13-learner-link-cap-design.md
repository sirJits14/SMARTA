# Learner link cap — design

Date: 2026-10-13
Builds on: `2026-09-30-parent-qr-scan-adviser-slot-design.md` (2 guardians + 1 adviser),
`2026-10-13-reissue-single-activation-slip-design.md` (`slotsFromLinks`)

## Goal

A learner has at most **2 active guardian links and 1 active adviser link per
school year** (`MAX_GUARDIANS` / `MAX_ADVISERS` in
`functions/src/lib/codeSlots.js`), however the links were made.

Before this change the cap lived only in each activation code's own slot
counters. Reissuing pre-fills a new code's counters from the learner's active
links, but links approved through access requests after a code was issued
never touch its counters. A code issued with 2 free guardian slots, followed
by 2 approved access requests, could still link a third and fourth guardian.

## Rule

The learner's active `guardian_links` for the school year are the source of
truth. `slotsFromLinks(links, schoolYear)` counts them: only `status ===
'active'` links of that school year, a link with no `slot` counts as a
guardian. The caller's own link (`guardian_links/{uid}_{studentId}`) is left
out of the count, so the person being linked is never counted against
themselves.

## 1. `activateCode`

Inside the existing transaction, also read
`guardian_links where studentId == … where status == 'active'` (the same query
`issueCodeFor` uses; no new index). Firestore transactions are serializable,
so a link written concurrently by another activation or approval conflicts
with this one and it retries.

- If the caller's link is already active **for the code's school year**, it is
  already counted: no cap check, no slot used (unchanged "already active"
  path, including the slot-mismatch check).
- Otherwise, when the requested slot kind is full by links, refuse with the
  usual generic message, logged as `activation_failed` with reason `'cap'`.
  The code's counters are not changed.
- Then the code's own counters are checked as before (`claimSlot`), so a code
  is never used by more people than its slots, either.

A link still active from the previous school year (before the nightly expiry
runs) that enters this year's code is a new link for this year, so it is
checked against the cap.

## 2. `resolveAccessRequest`: refuse, not warn

**Decision: approval past the guardian cap is refused.** Staff get
`failed-precondition`: "This learner already has 2 linked guardians for
{schoolYear}. Revoke one on the Links tab first." The request stays open, and
nothing is written (no link, learner projection, profile, inbox item or
audit entry).

Why refuse rather than warn:

- The cap is meant to hold no matter how a link is made. A warning makes it
  advisory for exactly the path that caused the leak.
- Staff already have the remedy: **Revoke** on the Links tab, then approve.
  That leaves an audit trail of which guardian lost access and why, which a
  silent third link would not.
- The Requests tab already shows callable errors through `ActionFeedback`, so
  no SIMS change is needed.

The check and the link write run in one transaction (with the learner
projection seed), reading the same active-links query. Access requests only
ever create guardian links, so only the guardian cap applies. Re-approving a
guardian whose link is already active is allowed (their own link is not
counted). An expired or revoked link of the requester is reactivated only if
there is room.

## Testing

Emulator, `functions/test/emulator/codes.test.js` (`activateCode` → link cap):
code issued with 2 free guardian slots, 2 access requests approved, a third
guardian's code redemption is refused (reason `cap`, counters unchanged), the
adviser still links; an access-approved guardian can re-enter the code while
full; a second adviser linked outside the code is refused; a guardian still
active from last school year is refused when this year's slots are full.

Emulator, `functions/test/emulator/links.test.js`: approving a third guardian
is refused and writes nothing; re-approving an already-linked guardian works;
the count ignores the adviser and revoked, expired or other-year links.
Existing approval tests free one of the two guardian slots `seedSchool()` fills.
