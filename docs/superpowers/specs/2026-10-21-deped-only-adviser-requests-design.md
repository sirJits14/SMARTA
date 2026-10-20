# Class Adviser requests need a DepEd email

Date: 2026-10-21. Status: approved design.
Builds on: `2026-10-19-role-based-registration-design.md` (decision 4, "Non-DepEd teachers request"), which this reverses
for self-service.

## Goal

A person who signs in with a non-DepEd email can no longer ask to become a Class Adviser. The option is hidden in the
Parent App, and the server refuses the request. A verified `@deped.gov.ph` account is unchanged: it scans the section's
advisory slip, or requests the section and waits for approval.

An Administrator can still make any account a Class Adviser in SIMS, so a teacher with no DepEd email is never locked out.

## Decisions

| Question | Decision |
| --- | --- |
| Who is blocked | Self-service Class Adviser requests from a non-DepEd email. |
| Administrator route | Unchanged. Assign role, and approving a request, still work for any email. |
| Requests already waiting | Left alone. They stay in the review queue with the "Non-DepEd email" flag for an Administrator to approve or reject. No cleanup step. |
| Non-DepEd account that already holds Class Adviser | Its card stays visible and locked as "Active", so a working adviser does not look as if the role was lost. |
| What the account sees instead | Only the Parent/Guardian card. No hint or explanation where the Class Adviser card was. |
| Approach | Hide the card in the Parent App and refuse the request on the server. Both ship together. |

## 1. Parent App

`roleOptions` in `parent/src/lib/join.js`:
- A non-DepEd account that does not hold Class Adviser gets no `adviser` option at all, so only Parent/Guardian shows.
- A non-DepEd account that holds it keeps the locked "Active" card.
- A DepEd account is unchanged.
- The Parent/Guardian card is never affected.

Preselection: `initialSelection` can still return `['adviser']` from a `?a=` advisory-slip link or `?role=adviser`. That
selection is ignored when the option is missing. `joinSteps` already counts only options that exist and are selected, so
a non-DepEd account that opens a slip link lands on the chooser with nothing ticked.

Dead copy removed, because every remaining Class Adviser card now belongs to a DepEd account:
- the `needsApproval` field in `roleOptions`;
- the "Needs approval" tag and the note under the cards in `RoleChooser.jsx`;
- the `joinNeedsApproval` and `joinNeedsApprovalNote` strings.

Not changed:
- `AdviserStep.jsx`. Its non-DepEd branches become unreachable but are harmless, and the step stays out of the diff.
- Settings › Add a role, which opens the same chooser.
- Settings › School access, which still lists a person's own earlier requests.

## 2. Server

`requestSchoolRole` in `functions/src/handlers/schoolAccess.js` refuses a non-DepEd account after the existing
role and `liveUser` checks, before the rate limit and transaction:
- code `permission-denied`;
- message "Class Adviser requests need a @deped.gov.ph account.";
- nothing is written, and no rate-limit slot is used.

The check reads `user.email` from the Auth record, which is verified, not anything the app sends. This closes the gap for
an old cached copy of the app and for a direct call.

Order with the request gate from PR #77: this DepEd check runs first, then the gate (`advisoryRequestsEnabled`, inside the
transaction). A non-DepEd account therefore always gets the DepEd message, whether requests are open or closed.

Everything else is unchanged:
- `redeemAdvisorySlip` and `previewAdvisorySlip` already refuse non-DepEd accounts, but their message ends "Request the
  role instead." That advice is now wrong, so the message becomes "Advisory slips need a DepEd email." The code stays
  `permission-denied`.
- `assignSchoolRole` and `resolveSchoolRole(s)` do not check the email domain, which is what keeps the Administrator route.
- `canApproveRoleRequest` in `shared/schoolAccess.js` is unchanged.
- SIMS needs no change, so there is no SIMS deploy.

## 3. Testing and release

**Parent App tests**
- `join.test.js` and `screens.test.js`:
  - a Gmail account gets only the Parent/Guardian option;
  - a Gmail account that holds Class Adviser keeps the locked card;
  - a DepEd account still gets both;
  - preselection from `?a=` is ignored for Gmail.
- The two tests that assert the "Needs approval" tag are replaced.

**Server emulator tests** (`functions/test/emulator/schoolAccess.test.js`, `advisorySlips.test.js`):
- A Gmail request is refused with `permission-denied` and writes no request, audit row or rate-limit row.
- A DepEd request still works.
- The slip refusal test in `advisorySlips.test.js` expects the shortened message.
- Several existing tests create their waiting requests by calling `requestSchoolRole` as the Gmail fixtures `personal`
  and `other`. They cover the conflict flag, section ordering and the review queue. Those requests can no longer be made
  that way, so the tests seed the request rows directly, the way a request left over from before this change would look.
  The assertions about what the queue and approvers see stay as they are.

**Release** follows the Subject Teacher pattern, with a record PR:
- Functions: `requestSchoolRoleFn`, plus `previewAdvisorySlipFn` and `redeemAdvisorySlipFn` for the shortened slip message,
  deployed by name from `docs/releases/2026-10-18-school-family/prepareBackend.mjs`.
  Backend unit and emulator tests run on the prepared backend.
- Parent App: built from master, byte-checked against the deployed site.
- No SIMS deploy and no data cleanup.

## Out of scope

- Any change to Curriculum Adviser, advisory slips, or the SIMS review queue and its "Non-DepEd email" flag.
- Rejecting or removing existing non-DepEd requests or advisers.
- The consent notice wording, which is still a separate open decision.
