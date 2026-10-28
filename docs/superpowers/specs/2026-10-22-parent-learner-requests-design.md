# Learner add/remove requests from the Parent App, approved in SIMS

Date: 2026-10-22
Surfaces: Parent App (School mode: Class tab and learner history), SIMS (new "Learner requests" page), Cloud Functions.
Companion spec: `2026-10-22-parent-sf2-export-design.md` (independent; can ship before or after this one).

## Goal

A Class Adviser can ask, from the Parent App, to add a learner to their advisory or to remove one with a
reason. Nothing changes in SIMS until an Administrator, or someone who covers the learner's grade, approves
the request in SIMS.

## Decisions (agreed with the user, 2026-10-22)

1. **Approvers: Administrators and anyone covering the request's grade.** That is a SIMS coordinator whose
   scope includes the grade (Grade Level Coordinator; JHS or SHS Academic Coordinator), or a Curriculum
   Adviser assigned to the grade. This is the grade-wide review rule the app already uses (`reviewGrades` in
   `shared/schoolAccess.js`). Approval happens only in SIMS, so a Curriculum Adviser needs a SIMS staff account
   (Accounts page, same email) to see the queue. Nobody approves their own request.
2. **Removal erases nothing; the reason decides the outcome.** The adviser picks Transferred out, Dropped out,
   or Moved to another section, and writes a required note. Permanent delete stays an Administrator-only action
   in SIMS.
3. **An LRN that already exists is flagged for the approver.** The adviser is not told whose record it is.
   Approving enrolls or moves the existing learner and leaves the details already in SIMS untouched. A learner
   already in the same section is refused at once.
4. **Add uses the Excel import's fields** (below). Grade and section are not typed; they are the adviser's
   section.

Defaults chosen for this spec (change during review if wrong):

- Approvers approve or reject. They do not edit a request first; a rejected add can be sent again, prefilled.
- No bulk approve, and no push notification to approvers. The SIMS badge and queue cover it.
- Approval reason is optional (stored as "Approved"); rejection reason is required.
- Address and contact numbers are removed from a request once it is decided or withdrawn (see Data model).

## Existing pieces reused

- Actor and authority: `loadSchoolActor` and `inboxRef` (`functions/src/handlers/schoolAccess.js`),
  `currentAssignments` and `reviewGrades` (`shared/schoolAccess.js`; `reviewGrades` becomes an export),
  `schoolCall` (`functions/index.js`), `enforceRateLimit`. Audit rows follow the shape of School access's but use
  their own `targetType`.
- Student and enrollment shapes: `studentShape`, `DOCS_DEFAULT` (`src/data/students.js`), `enrollmentId`,
  `studentScopeFields` (`src/data/enrollments.js`, `src/data/coordinatorScope.js`), the transfer rule in
  `planEnrollmentChange` (keeps the original enrollment date and type), and `withdrawEnrollment`
  (Enrollment page → Withdraw).
- Import rules: `validateStudent`, `TEMPLATE_HEADERS`, `ENROLL_TYPE` (`src/lib/validation.js`,
  `src/lib/studentImport.js`, `src/lib/constants.js`).
- Parent App: `ClassTab.jsx`, the lazily loaded sheet pattern of `FlagSheet.jsx`, `LearnerHistory.jsx`,
  `callable()`, `schoolError`, the Inbox.
- SIMS: `useSchoolPendingCount` and the sidebar badge in `Shell.jsx`, `NAV_ITEMS`, `access.js`.

## Add: fields

Same columns as the Excel template, minus Grade Level and Section:

| Field | Rule |
|---|---|
| LRN | Required, exactly 12 digits |
| Last name, First name | Required |
| Middle name, Ext (Jr/III) | Optional |
| Sex | Required, M or F |
| Birthdate | Required, a real date, not in the future |
| Address | Optional |
| Guardian name, relationship, contact | Optional |
| Contact number | Optional |
| Enrollment type | new, returning or transferee; defaults to new |

The shared rules live in `shared/learnerRequests.js` and run on the phone and again on the server. The import
sets no length limits; requests add them (names 60 characters, address 200, other text 60) so a request document
stays small. Text is trimmed and control characters are removed.

## Data model

`learner_change_requests/{autoId}`, closed to every client. The rules have no catch-all, so a new collection is
denied by default; add an explicit `allow read, write: if false` line and a rules test for the record. Production
needs no rules deploy. All access goes through callables.

```
kind:            'add' | 'remove'
status:          'pending' | 'approved' | 'rejected' | 'withdrawn'
schoolYear, sectionId, gradeLevel, sectionName
requestedByUid, requestedByEmail, requestedByName, createdAt
dedupeKey:       'add:<sectionId>:<lrn>' or 'remove:<sectionId>:<studentId>'
add:             student { lrn, lastName, firstName, middleName, extName, sex,
                           birthdate, address, guardianName, guardianRelationship,
                           guardianContact, contactNumber }, enrollType
remove:          studentId, lrn, displayName, reasonCode, note
decision:        decidedAt, decidedByUid, decidedByEmail, decidedByName, decisionReason
```

- `reasonCode` is `transferred_out`, `dropped_out` or `moved_section`; `note` is 1 to 500 characters.
- **Minimal retention:** in the same write that decides or withdraws a request, `address`, `guardianContact`
  and `contactNumber` are removed. The request keeps the rest of the submission (so a rejected add can be sent
  again with most of the form filled) and the facts of the decision. Audit rows carry the LRN, name, section and grade and,
  for removals, the reason code, never free text or contact details.
- **Dedupe:** at most one pending request per `dedupeKey`. The check is a query inside the transaction.
- **Limits:** 20 pending requests per adviser, 30 requests per hour per adviser (`enforceRateLimit`, action
  `learnerRequest`).
- **Indexes:** five composite entries in `firestore.indexes.json`: (requestedByUid, sectionId, createdAt desc)
  for the adviser's list; (status, schoolYear, createdAt) for Waiting (administrators); (status, schoolYear,
  gradeLevel, createdAt) for the Waiting list and badge of coordinators and Curriculum Advisers;
  (schoolYear, decidedAt desc) and (schoolYear, gradeLevel, decidedAt desc) for Decided. All five must be READY
  before the handlers go live. A withdrawn request has no `decidedAt`, so Decided lists only approved and
  rejected ones.

## Backend

New `functions/src/handlers/learnerRequests.js` with the pure rules in `shared/learnerRequests.js`
(`validateLearnerFields`, `validateEnrollType`, `validateRemoval`, `REMOVAL_REASONS`, `isSectionAdviser`,
`coversGrade`, `canDecideLearnerRequest`). Every callable is a `schoolCall`.

| Callable | Who | What |
|---|---|---|
| `requestLearnerAddFn` | Adviser of the section | Validate fields; refuse an LRN already enrolled in this section; dedupe; write a pending add; audit `learner.addRequested`. |
| `requestLearnerRemovalFn` | Adviser of the section | Learner must be enrolled in this section; reason code and note; dedupe; write a pending removal; audit `learner.removalRequested`. |
| `withdrawLearnerRequestFn` | The requester | Pending to withdrawn; clear address and contact fields; audit `learner.requestWithdrawn`. |
| `getLearnerRequestsFn` | Adviser | `{ sectionId }`: the caller's requests for that section, newest first, 50 at most. |
| `listLearnerRequestsFn` | Reviewer | `{ view: 'waiting' \| 'decided', cursor }`. Waiting is oldest first; Decided is approved and rejected, newest first, 50 per page. Waiting adds carry the existing-LRN flag (below). Waiting returns at most the 200 oldest and sets `truncated` when more were pending. |
| `resolveLearnerRequestFn` | Reviewer | `{ requestId, approve, reason }`; the approval transaction. |
| `getLearnerRequestCountFn` | Reviewer | How many pending requests the caller may decide: `{ count, truncated }`. |

**Who files.** The caller holds the current-year `adviser` assignment for that section, the same assignment the
roster and flagging calls require. Administrators and coordinators do not file; they use SIMS.

**Who decides.** `canDecideLearnerRequest(actor, request)`: the request is pending, in the current school year,
and not the caller's own; and the caller is an Administrator, or `reviewGrades(actor)` includes
`request.gradeLevel` (Curriculum Adviser assignment or SIMS coordinator scope). The list and count calls read at
most 200 pending requests for the year and filter by this rule in code, the way `getSchoolContext` builds the
Curriculum Adviser review queue.

**Existing-LRN flag.** For a pending add, the server looks up `students` by LRN (limit 2) and the learner's
current-year enrollment.

- No match: no flag.
- A learner counts as inside an approver's grades only through a current *enrolled* enrollment in a grade the
  approver covers (the rule `scopeRoster` applies). If the existing learner is not, because they are Unassigned,
  Dropped, Transferred, or in an uncovered grade, or if two learners share the LRN, only an Administrator can
  approve. Other approvers see "Needs an administrator" without the learner's name.
- Otherwise the flag carries the name, the current Grade and Section, and says approving moves them here.

### Approving an add (one transaction)

1. Re-read the request (still pending), the actor, the section (same school year and grade), and the
   requester's `school_accounts` assignments. If the requester no longer holds an adviser assignment for the
   section, fail with "The adviser no longer holds this class. Reject this request." The school year must not
   have ended.
2. No student with that LRN: create the student (`status: 'active'`, `DOCS_DEFAULT`, `createdAt` today in
   Manila, coordinator scope fields) and the enrollment `<studentId>_<schoolYear>` (grade, section, track,
   strand from the section; `type` from the request; `dateEnrolled` today; `status: 'enrolled'`).
3. Student exists and is enrolled in this section: fail with "<name> is already in this class. Reject this
   request."
4. Student exists and is enrolled in another section this year: move them. Update grade, section, track and
   strand on the existing enrollment (original date and type kept) and refresh their scope fields.
5. Student exists with no enrolled enrollment this year: set `status: 'active'`, write a fresh enrollment with
   the request's type, and set the scope fields.
6. For cases 3 to 5 the submitted details are ignored; SIMS keeps what it has.
7. Mark the request approved, clear address and contact fields, write audit `learner.addApproved` (mode `new`,
   `enrolled` or `moved`, previous section when moved) and the adviser's Inbox note (below).

### Approving a removal (one transaction)

1. Same re-reads. The learner must still be enrolled in this section, or fail with "<name> is no longer in this
   class. Reject this request."
2. By reason code:

| Reason | Enrollment status | Learner status | Result |
|---|---|---|---|
| `transferred_out` | `transferred` | `transferred` | Leaves the roster and SF2 |
| `dropped_out` | `dropped` | `dropped` | Leaves the roster and SF2 |
| `moved_section` | `dropped` (as Enrollment → Withdraw does today) | unchanged (`active`) | Shows as Unassigned for the registrar to place |

3. In every case the learner's scope fields are cleared (`gradeLevel: null`, `scopeSchoolYear: null`).
   Attendance history and the learner record stay. Family links lose attendance access automatically because
   those calls require an *enrolled* enrollment.
4. Mark approved, audit `learner.removalApproved` (reason code; the note stays on the request), Inbox note.

### Rejecting

Any pending request the caller may decide. The reason is required (1 to 500 characters). The request becomes
rejected, address and contact fields are cleared, audit `learner.requestRejected`, and the adviser gets an
Inbox note carrying the reason.

### Inbox notes

Written to `guardians/<requesterUid>/inbox/` with `inboxRef`, `type: 'learner_request'`:
"Learner added" / "Learner removed" (name and class) and "Request not approved" (with the reason).
`inboxDestination` in `parent/src/lib/school.js` sends `learner_request` notes to the Class tab (`/school`).

## Parent App

Everything below is on the Class tab and hides once the school year has ended.

- **Action row** under the summary card: **Add learner** and **Download SF2** (the SF2 spec). A link beside them
  reads "2 requests waiting for approval" while any are pending, and "Past requests" once every request is
  decided; it opens the Requests list.
- **Add learner sheet** (lazy, like `FlagSheet`): Learner (LRN, last, first, middle, ext, sex, birthdate),
  Enrollment type (default New), then optional address and guardian and contact details. The header shows the
  fixed class. An LRN already in this class gives "This LRN is already in your class." An LRN that exists
  elsewhere is accepted with no hint. Success: "Sent for approval. You get an Inbox note when it's decided."
- **Remove from class** lives in `LearnerHistory.jsx`, not on the class row (which already has Flag and
  Restore). The sheet asks for one of the three reasons and a required note, and says "<Name> stays in your
  class until it's approved." A pending removal shows a "Removal pending" chip on the roster row and Withdraw
  replaces Remove.
- **Requests list** (sheet): this section's requests, newest first: Waiting for approval, Approved, Not approved
  (with the reason), Withdrawn. Pending ones can be withdrawn; a not-approved add offers "Send again" with the
  form prefilled (address and contact numbers are cleared when a request is decided, so the adviser types them
  again). It loads from `getLearnerRequestsFn` and refreshes on focus, like the roster.
- New copy goes in `parent/src/strings.js`. The sheets load on demand, so the 260 KB first-load budget is
  untouched (check with `npm run size`).

## SIMS

- **Nav item** "Learner requests" after Students (`src/lib/navigation.js`). Administrators get it through
  `NAV_ITEMS`; non-admin staff roles get it by adding `learnerRequests` to `COORDINATOR_PAGES` in
  `src/lib/access.js`. A new hook `useLearnerRequestCount` (modelled on `useSchoolPendingCount`) feeds a badge on
  the item, refreshed on load, on window focus and after every decision. The Students page, Import and admin
  Add/Delete are unchanged.
- **Page** `src/pages/LearnerRequestsPage.jsx`, loaded lazily like the other pages, titled "Learner requests · SY
  <year>", with two tabs: **Waiting (n)** (oldest first) and **Decided** (newest first, "Load more").
- **Waiting card:** kind chip (Add or Remove), name and LRN, grade and section, who asked and how long ago.
  - Add: a Details toggle shows everything submitted. The existing-LRN flag reads "Already in SIMS: <name>,
    currently <Grade 8 · Rizal | Unassigned | Dropped>. Approving enrolls them here." or "Needs an administrator"
    with no actions for approvers who cannot decide it.
  - Remove: the reason, the adviser's note, and what approving does ("Marks <name> as transferred and ends the
    enrollment").
  - **Approve** is one tap. **Reject** expands an inline reason field (required). A server error shows on the
    card and the card reloads.
- **Counts:** Waiting (n) and the badge count only requests the signed-in person can decide. "Needs an
  administrator" cards still appear in Waiting, after the others and without actions, but are not counted.
- **Decided rows:** outcome, who decided, when, and the reason.
- Pure helpers (labels, flag text, grouping) live in `src/lib/learnerRequests.js` with tests.
- When the school year has ended, requests can no longer be decided, so Waiting is empty and the page is read
  only. Decided stays readable for Administrators; a coordinator's or Curriculum Adviser's grade scope ends with
  the year, as it does for session corrections. Ending the school year (`endSchoolYear`) withdraws the year's
  still-pending requests ("School year ended") and removes their address and phone numbers, so nothing personal
  is kept on a request nobody can close.

## Errors and edge cases

- Adviser loses the class while a request is pending: approval is blocked; only Reject remains.
- Learner already removed or enrolled by someone else, section changed grade or year, or the request was
  already decided: the specific message above, or "Already decided", and the card reloads.
- Two approvers act at once: the transaction re-reads the status, so the second sees "Already decided".
- An Administrator adds the same LRN in SIMS while a request is pending: approval takes the existing-learner
  path.
- Network failure on either app: inline error with Try again; a double tap cannot create a second request
  because of the dedupe check.
- A Curriculum Adviser without a SIMS staff account cannot reach the queue; an Administrator creates the
  account under Accounts.
- Deleting an adviser's account withdraws their pending learner requests (and clears the address and phone
  numbers), as it already does for their school role requests.

## Testing

- **Unit:** `validateLearnerFields` against the import's rules (including the cases `classifyImportRows`
  rejects); `canDecideLearnerRequest` matrix (Administrator; coordinator in and out of grade; Curriculum
  Adviser in and out of grade; own request; other year; already decided); the SIMS and Parent helpers; Parent
  strings test.
- **Emulator** (`functions/test/emulator/learnerRequests.test.js`): non-adviser and other-section adviser
  denied; add, duplicate, same-section LRN, limits; withdraw; list and count scoping; approve add as new,
  existing and unassigned, in the same section, moved, and cross-grade (Administrator only); approve each
  removal reason with the resulting statuses and scope fields; reject needs a reason; ended year blocked; the
  requester losing the class; audit rows; Inbox notes; address and contact fields cleared; account deletion
  withdrawing pending requests.
- **Rules:** a rules test that the new collection is closed to every role.
- **Builds:** SIMS build, Parent build and `npm run size`, `npm test` in root, `parent` and `functions`.
- **Manual:** emulator browser check of the full loop (adviser files, coordinator approves, roster updates).

## Rollout

1. Functions and indexes first (backward compatible; nothing calls them yet). The production backend is deployed
   by name from a prepared tree, so that tree needs the new function files, `shared/learnerRequests.js`, the
   `reviewGrades` export and the account-deletion change.
2. SIMS "Learner requests" page through the SIMS release-tree process, hosting only, on top of the CURRENT
   live SIMS tree: reconstruct it exactly as the latest deployment record describes
   (`docs/audits/deployments/2026-10-27-sims-recent-sections/README.md` and the records it cites, on
   `origin/master`), rebuild a baseline and byte-match it against live (`baseline-verification.json`, SHA-256
   per file), and only then overlay this feature, with `Shell.jsx`, `access.js`, `navigation.js` and `App.jsx`
   ported onto the tree's own copies. A preparer that wraps only
   `docs/releases/2026-10-21-caps-names/prepare.mjs` would remove the later live features (PR #90, #91 and #93
   and the legacy-adviser changes). `reviewGrades` becomes an export of `shared/schoolAccess.js`, so the tree's
   older copy gets the same one-word patch. The release notes
   (`docs/releases/2026-10-22-learner-requests/README.md`) give the full sequence.
3. Parent App last, with `npm run deploy:parent` from fresh `origin/master` (keeps PR #74), so requests cannot
   arrive before approvers have a page.
4. Update `docs/parent-portal-adviser-guide.md` (adding and removing learners) and record the deployment under
   `docs/audits/deployments/`.

## Out of scope

Bulk approve; editing a request before approving; push notifications to approvers; telling the previous adviser
when an approved add moves a learner out of their class; Excel upload from the Parent App; an Administrator
switch to open or close requests; permanent deletion from the Parent App; any change to the SIMS Students page,
Import wizard or Firestore rules for existing collections.
