# Adviser requests for temporary ID passes — Design

Date: 2026-11-27
Status: Approved in brainstorming. Not built, not deployed.
Builds on: [2026-11-27-temp-student-id-pass-design.md](2026-11-27-temp-student-id-pass-design.md) (live since 2026-11-27).
Reference card: [assets/2026-11-27-temp-id-pass-reference.png](assets/2026-11-27-temp-id-pass-reference.png)

## Goal

Class advisers ask, from the Parent App, for a temporary ID pass for learners in their class. A new
**Logistic Operator** account, Grade Level Coordinators and administrators print them. Passes may be
issued without a photo, and print four to an A4 sheet.

## Decisions

| # | Topic | Decision |
|---|-------|----------|
| 1 | Who prints passes | Administrators (all grades), Grade Level Coordinators (own grade), Logistic Operators (all grades). **JHS/SHS Academic Coordinators lose printing.** |
| 2 | Who uploads photos in SIMS | The same three. Academic Coordinators lose photo upload. Class advisers keep uploading in the Parent App. |
| 3 | Logistic Operator | New SIMS role `logistic`, created by an administrator on Accounts. All grades. Sees only ID Cards (Requests and Temporary passes tabs) and Students (list plus the Photo button). No Dashboard, attendance, guardians, accounts, settings, official ID cards or student editing; signs in straight to ID Cards. |
| 4 | How advisers request | Parent App Class tab: "Request temporary pass", tick one or more learners, optional note (up to 500 characters). |
| 5 | Photo needed to request | No. Learners with or without a photo can be requested. |
| 6 | Printing without a photo | Allowed. The photo area shows a dashed 1 × 1 inch frame labelled "Attach 1×1 photo". The pass works at the gate like any other. |
| 7 | Pass size | Four per A4 portrait sheet: 85 × 134.8 mm each (the same proportions as today's card; 2 × 2, 4 mm gap, 8 mm margins, leaving 7 mm spare height so a sheet never spills onto a second page). The photo area is exactly 1 × 1 inch (25.4 mm) for every pass; the rest of the layout is rebalanced (larger name and QR). Replaces today's nine-per-sheet CR80 layout. |
| 8 | Request lifecycle | `pending` → `printed` or `declined` (with reason), or `withdrawn` by the adviser while pending. The adviser sees Waiting / Printed / Declined. |
| 9 | Adviser notice | Parent App inbox. Printed: "Temporary pass for {name} is ready for pick-up at {place}." Declined: includes the reason. |
| 10 | Learner already has an active pass | The adviser must choose **Lost** or **Damaged**. Lost: printing revokes the old code and issues a new one. Damaged: the same code is reprinted. |
| 11 | Printing without a request | Kept. The section-based Temporary passes tab stays. A learner there with a pending request is prepared through that request (so Lost gets a new code), and "Mark as printed" after printing closes it, exactly as in the Requests tab. |
| 12 | Pick-up place | New `settings/app.passPickupPlace`, edited by administrators in Settings. If blank, the notice says "is ready for pick-up." |

## Eligibility

A learner can be requested when: enrolled in the adviser's section for the current school year, the
year has not ended, has an LRN, has no official card printed for the current LRN, and has no other
pending request. A photo is not required. With an active pass, a reason (Lost or Damaged) is
required; without one, a reason is not allowed. An adviser may have at most 40 pending requests.

`tempPassBlocker` no longer returns `no-photo`. Everything else it checks stays.

## Data

- `temp_pass_requests/{id}`: `{ studentId, sectionId, gradeLevel, schoolYear, reason: 'new'|'lost'|'damaged',
  note, status: 'pending'|'printed'|'declined'|'withdrawn', requestedByUid, requestedByName, requestedAt,
  decidedBy, decidedAt, declineReason, passCode }`. Callables only; clients cannot read or write.
- `temp_passes/{studentId}` is unchanged; the card reads the photo, if any, at print time.
- Guardian inbox items: `{ type: 'temp_pass_request', requestId, status, studentName, ... }` for the adviser.

## Callables

| Name | Caller | Purpose |
|---|---|---|
| `requestTempPassesFn` | school (adviser) | Create requests for up to 40 learners |
| `withdrawTempPassRequestFn` | school (adviser) | Withdraw own pending request |
| `getTempPassRequestsFn` | school (adviser) | Own section's requests and eligibility |
| `listTempPassRequestsFn` | staff (pass printers) | Requests in the caller's grades |
| `fulfilTempPassRequestsFn` | staff (pass printers) | Issue passes for requests (Lost: a new code, so the old one stops working), return codes |
| `markTempPassRequestsPrintedFn` | staff (pass printers) | After printing: mark the given requests printed, notify each adviser |
| `declineTempPassRequestFn` | staff (pass printers) | Decline with a reason, notify the adviser |
| `issueTempPassFn` (unchanged contract) | staff (pass printers) | Section tab, learners without a pending request; no longer requires a photo |

Pass printers are decided by `passGrades()` in `shared/tempPass.js`: admin → all, `glc` → own grade,
`logistic` → all, everyone else → none. `scopedGrades()` stays `[]` for `logistic`: `null` there means
administrator scope (announcements to everyone, advisory slips for every section, session review),
which a Logistic Operator must not get. Only pass, photo and the student, section and enrollment
reads a pass needs use the wider scope.

## Out of scope

Handover tracking, changes to the official ID card, kiosk changes (none needed), giving Logistic
Operators any page other than those listed.
