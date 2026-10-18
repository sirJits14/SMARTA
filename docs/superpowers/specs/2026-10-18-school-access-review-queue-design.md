# School access review queue — design

Date: 2026-10-18
Surface: SIMS → Guardians → School access, plus the Parent App's Settings and School mode.

## Problem

Today an administrator types a teacher's email into a form and the result lands in one long stack of
rows ("Active school assignments"). About five rows fit on a screen, there is no search, filter or
grouping, and nothing shows which sections still have no adviser. There is no request or approval
step: teachers cannot ask for access, so every assignment starts with the administrator chasing
emails. Rows do not say who assigned a role, when, or whether the teacher has ever opened School
mode. The success banner after assigning uses the error style and shows red.

## Decisions

Settled during brainstorming:

1. **Teachers request, approvers approve.** Requests come back. A teacher asks from the Parent App
   and the request waits in a Pending queue. Requests confer no access.
2. **Approvers are administrators and Curriculum Advisers.** Administrators approve any request in
   SIMS. Curriculum Advisers approve, in the Parent App, only *adviser* requests from verified
   `@deped.gov.ph` accounts for sections in their own assigned grades. Everything else goes to
   administrators. Nobody approves their own request.
3. **Teachers pick role and section.** The request names the responsibility and the section, so a
   review is mostly a yes or no.
4. **SIMS uses sub-tabs:** Pending · Coverage · Assignments · History.
5. **Conflicts offer Replace.** If a request is for a section that already has an adviser, an
   administrator can choose "Replace {current adviser}". It needs a reason and runs as a single
   audited transaction. Curriculum Advisers cannot replace.
6. **First version also includes:** a pending badge in the sidebar, bulk approve, a "Not opened
   yet" status, and CSV export.

> **Reverses an earlier decision.** Commit `f8e2944` ("Make school role approval
> administrator-only") deliberately removed Curriculum Adviser approval, and `52ec1bd` removed
> teacher requests. This design restores both, on purpose, with the narrower rule in decision 2.

Defaults chosen for this spec (change during review if wrong):

- **Requestable roles are Adviser and Subject Teacher only.** Curriculum Adviser stays
  administrator-assigned, as in the request handler that existed before `52ec1bd`.
- **An approval reason is optional and a rejection reason is required.** An empty approval reason
  is stored as "Approved". Today `resolveSchoolRole` requires a reason for both.
- **Teachers can withdraw their own pending request.** The `withdrawn` status already exists.

## Workflow

```
Teacher (app Settings)             Approver                          Result
──────────────────────             ────────                          ──────
Request: Adviser · G12 OBAMA  ──►  Pending queue
                                    ├─ Approve ─────────────────────► assignment + inbox note
                                    ├─ Reject (reason) ─────────────► inbox note with reason
                                    └─ Replace X (admin, reason) ───► X revoked, teacher assigned
Withdraw (while pending)      ──►  request leaves queue
```

The administrator's direct "Assign role" form stays and still works without a request.

## Data model

All writes still go through authenticated App Check callables. There are no client rules changes:
`school_role_requests` and `school_accounts` stay closed to direct client access.

- **`school_role_requests/{fingerprint(uid, assignmentKey)}`**, restored as it was before
  `52ec1bd`: `{ role, schoolYear, sectionId, gradeLevel, uid, email, emailVerified, displayName,
  status: 'pending'|'approved'|'rejected'|'withdrawn', createdAt, reviewedBy?, reviewedAt?, reason? }`.
  Keep the existing safeguards: dedupe by id, at most 20 pending per teacher, and 30 requests per
  hour per teacher.
- **Assignment entries** in `school_accounts/{uid}.assignments[]` gain `assignedAt` (a Timestamp;
  `serverTimestamp` cannot go inside arrays), `assignedBy` (the actor's email), and
  `source: 'direct' | 'request' | 'legacy' | 'replace'`. `assignmentKey` ignores these fields, so
  existing comparisons and locks are unchanged. Older entries without them show "—".
- **`school_accounts/{uid}.lastSchoolOpenAt`** records the last time the teacher opened School
  mode.
- **Audit rows:** keep `school.requested`, `school.requestApproved`, `school.requestRejected`,
  `school.assigned` and `school.revoked`, and add `school.requestWithdrawn` and `school.replaced`.
  `school.replaced` records the previous adviser's uid and the reason.

## Backend (functions/src/handlers/schoolAccess.js, shared/schoolAccess.js)

| Callable | Who | What |
|---|---|---|
| `requestSchoolRoleFn` | Verified account | Restore the pre-`52ec1bd` handler. It refuses `curriculum_adviser`. |
| `withdrawSchoolRequestFn` | Requester | Pending → withdrawn, with an audit row. |
| `resolveSchoolRoleFn` | Admin / eligible CA | Existing handler. Approval reason becomes optional, and rejection writes an inbox note with the reason. |
| `resolveSchoolRolesFn` (new) | Admin | Bulk approve of up to 25 request ids. Each runs in its own transaction, and the call returns `[{ id, ok, error? }]`, so one failure never blocks the rest. |
| `replaceAdviserFn` (new) | Admin | `{ requestId, reason }`. In one transaction it removes the lock holder's adviser entry for that section, moves the lock, grants the requester (`source: 'replace'`), marks the request approved, and writes `school.replaced`. |
| `markSchoolOpenedFn` (new) | Assigned teacher | Sets `lastSchoolOpenAt`. It does nothing unless the caller has a current assignment. |
| `getSchoolPendingCountFn` (new) | Admin | A `count()` aggregation of pending requests for the current school year. |
| `getSchoolHistoryFn` (new) | Admin | `audit_log` rows where `targetType == 'school_assignment'`, newest first, 50 per page, with a cursor. Needs a composite index on (`targetType`, `at` desc). |
| `getSchoolContextFn` | All | Admins also get `pendingRequests` (each with a `conflict: { uid, displayName, email }` when the section's lock belongs to someone else) and each assignment's metadata plus its account's `lastSchoolOpenAt`. CAs get `reviewQueue`, the requests they may approve. Everyone gets `myRequests` for the current year. |

`canApproveRoleRequest(actor, request)` in `shared/schoolAccess.js` becomes:

- false if the request is not pending, belongs to the actor, or is from another school year;
- true for administrators;
- true for a Curriculum Adviser when **all** of these hold: `request.role === 'adviser'`, the
  live Auth email ends with `@deped.gov.ph` and is verified, and the actor has a current
  `curriculum_adviser` assignment for `request.gradeLevel`;
- false otherwise.

A Curriculum Adviser approving a section whose lock is held by someone else gets the existing
`already-exists` error. Their queue shows such requests as "Needs an administrator", with no
actions.

`writeGrant` stamps the new assignment metadata. Approvals and direct assigns keep sending the
existing "School access approved" inbox note.

## Parent App

- **Settings → "Request school access"** is visible to any signed-in verified account. It opens a
  form with Responsibility (Adviser / Subject Teacher) and a Section picker grouped by grade, built
  from the metadata-only `sections` already in the school context. Below the form, **My requests**
  lists each request's status (Waiting for review · Approved · Not approved, with the reason ·
  Withdrawn), and pending requests have a Withdraw button.
- **School mode, for Curriculum Advisers:** a "Requests (n)" entry lists `reviewQueue` cards (in-grade DepEd adviser requests, conflicts included) with
  Approve and Reject (reject asks for a reason). Conflicting requests read "Needs an
  administrator".
- **School mode, on open:** calls `markSchoolOpenedFn` at most once per day per account. The client
  remembers the last call in `localStorage`, wrapped in try/catch.
- Check the parent bundle budget. The new screens load lazily.

## SIMS: Guardians → School access

Split the current 99-line `SchoolAccessTab.jsx` into `src/pages/guardians/school/`:
`SchoolAccessTab.jsx` (the shell and sub-tabs), `PendingView.jsx`, `CoverageView.jsx`,
`AssignmentsView.jsx`, `HistoryView.jsx` and `AssignRoleForm.jsx`. Pure logic goes in
`src/lib/schoolAssignments.js`, with tests: coverage rows, filters, opened status and CSV rows.

**Header:** "School access · SY 2026-2027", a primary **Assign role** button that opens the
existing form in a panel, and a small refresh control reading "Updated 2 min ago" that replaces
the large "Refresh school access" button.

**Sub-tabs:** `Pending (n)` · `Coverage` · `Assignments (n)` · `History`. The page opens on Pending
when n > 0 and on Coverage otherwise.

**Pending**
- Cards are listed oldest first. Each shows the name, email, age ("2h ago"), and
  responsibility · grade · section.
- Flags: "Non-DepEd email", "Section has an adviser ({name})", and "Waiting 3+ days".
- Actions: **Approve** (primary) and **Reject**, which expands an inline reason field. A
  conflicting card replaces Approve with **Replace {name}**, which expands an inline reason field
  and a confirm step.
- Conflict-free cards have a checkbox. A sticky bar reads "Approve n selected" and reports
  partial failures for each card.
- A secondary section, "Old adviser slips to confirm (n)", moves the existing `LegacyAdvisers`
  list here from the bottom of the page. "Use in form" prefills the Assign panel.
- Empty state: "No requests waiting. Teachers request access from the app's Settings."

**Coverage**
- Grouped by grade. Each grade header reads "Grade 12 · 8 of 10 sections have an adviser ·
  Curriculum Adviser: {name | None}".
- Each section row shows the adviser and their opened status, or **No adviser**. A no-adviser
  row offers "Pending: {name}" (jumps to the card) or "Assign" (prefills the panel). Each row also
  shows its subject-teacher count.
- An "Only gaps" toggle and **Export CSV** with the columns Grade, Section, Adviser, Adviser email,
  Opened, Subject teachers, Pending request.

**Assignments**
- A dense table: Teacher (name and email) · Responsibility · Scope · Since (date and "by {admin}")
  · Status (Opened {date} / **Not opened yet**) · an overflow menu with Revoke.
- "Not opened yet" means `lastSchoolOpenAt` is missing or earlier than `assignedAt`.
- Search by name, email or section. Filter by Grade, Responsibility and Status. The default sort
  is grade, then section.
- Revoke keeps today's two-step flow with a required reason, expanded inside the row.
- **Export CSV** follows the current filters, with the columns Name, Email, Responsibility, Grade,
  Section, Assigned on, Assigned by, Source, Status.

**History**
- Newest first: "Oct 18, 2:14 PM · {actor} approved {teacher} · Adviser · G12 WARREN BUFFET ·
  {reason}", with Load more.

**Sidebar badge:** a count on the Guardians nav item (`src/lib/navigation.js`) and on the School
access tab, taken from `getSchoolPendingCountFn`. It refreshes on load, on window focus, and after
any resolve. It is shown to admins only and hidden when the count is 0.

**Feedback fix:** add a success variant, `.sims-feedback.is-success`, with success tokens defined
in both themes. Notices in School access use it, so success is no longer shown in red.

**CSV export** is generated in the browser, with a UTF-8 BOM for Excel and quoted cells. Cells
starting with `= + - @` get a leading `'` to block formula injection. File names look like
`school-coverage-2026-2027.csv`.

## Errors and edge cases

- Concurrent approvals of the same section are serialized by the existing section lock. The loser
  sees "This section already has an adviser…", and the card refreshes to show the conflict.
- A request whose section changed grade or was removed fails with the existing messages, and the
  card offers Reject.
- An account deleted while a request is pending is handled by `deleteSchoolAccess`, which already
  withdraws its pending requests.
- When the school year has ended, all mutating actions are disabled and History stays readable.
- Bulk approve skips cards that turned into conflicts between selection and submission, and
  reports them for each card.

## Testing

- **Unit:** the `canApproveRoleRequest` matrix (admin, a CA in and out of grade, DepEd and
  non-DepEd, self, other year, subject-teacher role) and the pure SIMS helpers (coverage,
  filters, opened status, CSV escaping).
- **Emulator** (`functions/test/emulator/schoolAccess.test.js`): request, withdraw, CA
  approve/reject, admin approve/reject, replace (lock moves and old entry removed atomically), bulk
  with partial failure, `markSchoolOpened`, pending count, history paging, and approval races.
- **Builds:** build SIMS and the Parent App, and run the parent bundle budget check.

## Out of scope

Push notifications to approvers (the badge and the CA's Requests count cover it), co-advisers,
inbox notes to a replaced or revoked adviser, and bulk reject.

## Rollout

Implement locally with no deploy. Deploy order when released: functions and the Firestore index
first (backward compatible), then SIMS from the release tree per the SIMS deploy hold, then the
Parent App (`hosting:parent`).
