# Role-based registration and advisory slips — design

Date: 2026-10-19
Surface: Parent App onboarding (`/join`) and Settings → Add a role; SIMS → Sections; Cloud Functions.

## Problem

Every new Parent App account lands on one screen, Activate, which assumes the person is a parent
holding a learner slip. Teachers have to find Settings → Request school access after skipping that
screen, and the "Request a school role" link on Activate sends a profile-less account to `/school`,
which immediately redirects home. Every adviser waits for an Administrator or Curriculum Adviser to
approve, even when the school already knows who advises which section. Subject Teachers request
access per section, although all they receive is notices.

## Decisions

Settled during brainstorming:

1. **A "Who are you?" step comes first.** After Verify and Consent, the person enters their name
   once, then picks their roles: **Family Member**, **Class Adviser**, **Subject Teacher**.
2. **Hybrid means two roles, never three.** Family can be paired with one school role. Adviser and
   Subject Teacher cannot both be held in one school year. There is no separate "Hybrid" option:
   ticking two cards is hybrid.
3. **Advisory slips make advisers instantly.** Each section can have a single-use QR advisory slip.
   A verified `@deped.gov.ph` account that redeems it becomes that section's adviser without any
   approval.
4. **Non-DepEd teachers request.** Non-DepEd advisers and subject teachers send a request that an
   Administrator or a Curriculum Adviser (own grades) approves. Curriculum Advisers may now approve
   adviser and subject-teacher requests from any email in their grades.
5. **Subject Teachers are grade-level.** They tick one or more grades (7–12) and see notices only.
   DepEd accounts get access at once; other accounts create one request per grade.
6. **Slips are issued in SIMS only**, by Administrators (every grade) and by JHS/SHS Academic
   Coordinators and Grade Level Coordinators (their scoped grades).
7. **A slip cannot be issued for a section that has an adviser.** Replacing an adviser stays the
   existing manual Replace action.
8. **Slip lifetime:** valid until redeemed, revoked, reissued (which revokes the previous slip) or
   the school year is ended. No day-based expiry.
9. **The chooser serves new and existing users.** New users see it after Consent. Existing users
   open the same flow from Settings → Add a role, which replaces the Request school access page.
10. **Hybrid halves are independent.** Each role step saves on its own; a failed half can be
    retried on the spot or later from Settings.
11. **Existing section-based Subject Teacher assignments convert to grade-level** through a one-off
    migration.

> **Amends earlier decisions.**
> - `2026-10-18-school-access-review-queue-design.md` decision 2 limited Curriculum Advisers to
>   DepEd adviser requests. Decision 4 here widens that to adviser and subject-teacher requests
>   from any email, still only in their own grades.
> - `2026-10-17-school-family-access-design.md` defined Subject Teacher per section. Decision 5
>   here makes it per grade level.
> - `2026-10-09-coordinator-view-only-design.md` made coordinators view-only. Issuing and revoking
>   advisory slips for their own grades becomes a named exception.

## Parent App flow

Order: Sign in → Verify email → Consent (unchanged) → **Who are you?** → one step per chosen role
→ Summary.

### Who are you? (`/join`)

`/join` replaces bare `/activate` as the destination for an account without a `guardians/{uid}`
profile. `/activate?c=CODE` and `/activate?a=CODE` deep links still work: they open `/join` with
Family (for `c`) or Adviser (for `a`) pre-ticked and the code filled into that step.

- **Your name** comes first, prefilled from the profile, the Google account or the name typed at
  email sign-up. At least 2 characters. Used for every role chosen; written to `displayName`.
- Three role cards, each a real checkbox:
  - **Family Member** — "I'm a parent or guardian of a BNHS learner."
  - **Class Adviser** — "I have an advisory slip for my section."
  - **Subject Teacher** — "I teach a grade level and need school notices."
- Selection rules (shared helper, also enforced on the server):
  - At most one of Adviser and Subject Teacher. Ticking one disables the other with the visible
    note "Choose Adviser or Subject Teacher, not both."
  - Family may be added to either.
  - Roles already held (Add a role from Settings) show as *Active*, are locked, and count toward
    the rules. A current adviser cannot add Subject Teacher and vice versa.
- Accounts whose email is not `@deped.gov.ph` see a **Needs approval** tag, in text, on the
  Adviser and Subject Teacher cards before choosing.
- **Continue** names what follows, for example "Continue · 2 steps". It is disabled until a name
  and at least one role are present.

### Role steps

A step label shows progress, for example "Step 1 of 2 · Family". Order: Family first, then the
school role.

- **Family:** the current scan-or-type learner slip form plus relationship, without the name field
  (taken from the chooser). Calls `activateCodeFn` as today.
- **Adviser, DepEd account:**
  1. Scan or type the advisory slip (`ScanSheet`, `extractCode` extended to read `?a=`).
  2. Confirm screen shows the section, for example "Grade 8 – Sampaguita", returned by a
     non-consuming preview (see `previewAdvisorySlipFn`).
  3. Confirm calls `redeemAdvisorySlipFn`. Success: "You're the adviser of Grade 8 – Sampaguita."
  - "No slip?" opens the section request form (grade, then section), which calls
    `requestSchoolRoleFn` and ends as *Waiting for approval*.
- **Adviser, non-DepEd account:** no scanner. The step is the section request form with the copy
  "Your account isn't a DepEd email, so an Administrator or Curriculum Adviser must approve this."
- **Subject Teacher:** grade chips 7–12, multi-select, at least one. Calls `requestSchoolRoleFn`
  with `gradeLevels`. DepEd accounts are granted at once; other accounts get one pending request
  per grade.
- If a learner slip is scanned in the Adviser step, or an advisory slip in the Family step, the
  step says which kind of slip it is and offers to switch, instead of submitting.

### Summary

One row per chosen role: *Linked to {learner}*, *Adviser of {section}*, *Subject Teacher · Grades
7, 8*, *Waiting for approval*, or *Didn't work* with **Try again**. **Continue** opens School mode
when the account has an active school assignment and no family link; otherwise Family mode.

An account that finishes with only pending requests still gets a profile and enters the app, so it
can see request status in Settings.

### Settings → Add a role

Opens the same chooser with held roles locked. Replaces `screens/settings/SchoolAccessPage.jsx`'s
request form; pending requests and Withdraw stay visible on that page. The broken "Request a
school role" link on Activate is removed.

### States to design

Camera permission prompt; camera denied (typing stays available); slip preview; DepEd refusal
with a one-tap switch to sending a request; pending; section already has an adviser; slip used or
revoked (generic message); offline; partial success on Summary.

### Craft notes (Operate mode)

- Built from `parent/src/components/ui.jsx` and the `--t-*` tokens in `shared/theme/theme.css`. No
  new visual language; light/dark and the contrast tests carry over.
- Role cards: whole-card hit area, at least 44px tall, `role="checkbox"` semantics, a visible
  check mark plus text state, never colour alone. Disabled cards state why in text.
- Phone-first single column; the same stack on desktop.
- All copy in `parent/src/strings.js`.
- Respect `prefers-reduced-motion` for step transitions.

## Server

### Collection `advisory_slips/{sha256(code)}`

```
{ sectionId, gradeLevel, sectionLabel, schoolYear,
  status: 'issued' | 'redeemed' | 'revoked',
  issuedBy, issuedAt, redeemedBy?, redeemedAt?, revokedBy?, revokedAt? }
```

- Codes reuse `functions/src/lib/activationCode.js` (8 characters, Crockford base32). Only the
  hash is stored; the raw code is returned once, for printing.
- At most one `issued` slip per section. Issuing again revokes the earlier unused slip.
- `endSchoolYear` revokes every `issued` advisory slip for that year, alongside learner slips.
- Firestore rules deny all client reads and writes, like `school_accounts`,
  `school_role_requests` and `school_adviser_locks`.

### Callables

- **`issueAdvisorySlipsFn({ sectionIds })`** — staff call. Administrators: any grade.
  Coordinators: only grades in `scopedGrades`. Each section must belong to the current school
  year, which must not be ended. Sections with a `school_adviser_locks` entry are skipped and
  reported. Returns `{ issued: [{ sectionId, sectionLabel, gradeLevel, code }], skipped:
  [{ sectionId, reason }] }`. Audit row `school.slipIssued` per slip.
- **`revokeAdvisorySlipFn({ sectionId })`** — same scope rules. Revokes the section's `issued`
  slip. Audit row `school.slipRevoked`.
- **`listAdvisoryStatusFn({ schoolYear })`** — same scope rules. Returns, per section in scope:
  adviser name and email if assigned, and the outstanding slip's `issuedAt` and `issuedBy`.
- **`previewAdvisorySlipFn({ code })`** — signed-in, verified account. Rate-limited with the
  activation limiter. Returns `{ sectionLabel, gradeLevel }` for an `issued` slip of the current
  year; otherwise the generic failure. Consumes nothing.
- **`redeemAdvisorySlipFn({ code, displayName, consentVersion })`**:
  1. Live, verified account with an `@deped.gov.ph` email. Otherwise fails `permission-denied`
     with "Advisory slips need a DepEd email. Request the role instead." This describes only the
     caller's own account, so it is safe to reveal.
  2. Rate-limited with the activation limiter.
  3. One transaction:
     - Slip is `issued`, its `schoolYear` is current, and the year is not ended.
     - `canHold` allows an adviser role for this account.
     - `prepareGrant` finds the section lock free.
     - `writeGrant` with `source: 'slip'`, `assignedBy` = the slip's `issuedBy`.
     - Slip → `redeemed`, with `redeemedBy` and `redeemedAt`.
     - Audit row `school.slipRedeemed`.
     - Creates `guardians/{uid}` if missing, with the same fields `acceptConsent` writes.
     - Pending adviser requests for the section: the caller's own becomes `fulfilled`; others
       become `superseded` with reason "Section adviser assigned by slip", each with an inbox
       note to the requester.
  4. Every other failure returns one generic message.

### Changes to existing code

- **`requestSchoolRoleFn`**
  - Subject Teacher takes `gradeLevels: number[]` (7–12, de-duplicated, at least one). DepEd
    accounts are granted each grade at once with `source: 'self'` and an audit row; other accounts
    create one pending request per grade.
  - Adviser keeps `sectionId` and always creates a request.
  - Checks `canHold` against active assignments and pending requests.
  - Creates `guardians/{uid}` if missing, so a teacher-only account enters the app.
  - Until the migration has run, a `subject_teacher` call with `sectionId` is accepted and stored
    as that section's grade.
- **`shared/schoolAccess.js`**
  - New `canHold(heldRoles, role)`: within one school year, `adviser` and `subject_teacher`
    exclude each other; `curriculum_adviser` and family links are unaffected.
  - New `pickableRoles(held, selected)` for the chooser, built on `canHold`.
  - `canApproveRoleRequest`: a Curriculum Adviser approves `adviser` and `subject_teacher` requests
    from any email whose `gradeLevel` is one of their assigned grades. Admins approve all. Nobody
    approves their own.
  - `assignmentFrom` accepts `subject_teacher` with `gradeLevel` and no section.
- **`canHold` is checked** on requests, approvals, slip redemption and admin direct assignment
  (`AssignRoleForm`), with the error "This teacher is already an {other role} this school year."
- **`shared/announcementAudience.js`**: a `subject_teacher` assignment matches by `gradeLevel`.
  When a notice is limited to `sectionIds`, it reaches subject teachers whose grade contains one
  of those sections, using the branch that already handles Curriculum Advisers.
- **`src/lib/schoolAssignments.js`** (Coverage): subject teachers count per grade, not per section.
- **Parent App `lib/qrScan.js`**: `extractCode` returns `{ kind: 'learner' | 'advisory', code }`.

### Migration `migrateSubjectTeachersFn` (admin call, safe to re-run)

- Each `school_accounts` assignment `{ role: 'subject_teacher', sectionId }` becomes
  `{ role: 'subject_teacher', gradeLevel }` for that section's grade; duplicates are merged and
  the earliest `assignedAt` is kept.
- Pending `school_role_requests` for `subject_teacher` with a `sectionId` are rewritten to the
  grade shape, keyed by the new request key; duplicates collapse.
- Accounts that hold or have pending both Adviser and Subject Teacher in the current year are
  returned in a conflict report. Nothing is removed automatically; an administrator resolves each.
- Returns `{ accountsChanged, requestsChanged, conflicts: [...] }` and writes one audit row.

## SIMS

### Sections page

- New **Adviser** column: adviser's name, *Slip issued · {date}*, or *No adviser*. Data from
  `listAdvisoryStatusFn`.
- Row actions, shown to Administrators and to coordinators for their grades:
  - **Print advisory slip** — only when the section has no adviser. If a slip is outstanding, the
    confirm dialog says "A new code will be printed. The old slip stops working."
  - **Revoke slip** — while a slip is outstanding.
- Toolbar: **Print slips for sections without an adviser**, limited to the caller's grades.
- School access → Coverage also shows outstanding slips per section for administrators.

### Printed advisory slip

Reuses `src/lib/slipLayout.js` paper sizes (Folio 2×8, A4 2×7) and print technique, with a
distinct face so it cannot be confused with a learner slip:

- Solid header band: **ADVISORY SLIP · Class Adviser**.
- Section in large type, for example **Grade 8 – Sampaguita**, then the school year.
- Code (`XXXX-XXXX`) and a QR of `${PORTAL_URL}/activate?a=CODE`.
- "For the class adviser only. Sign in with your DepEd email. Single use. Valid SY {year}. Keep
  private."
- No learner names or LRNs.

## Testing

- **Shared:** `canHold` for every pair; `pickableRoles` with held and selected roles; Curriculum
  Adviser approval for adviser and subject-teacher requests, DepEd and non-DepEd, own and other
  grades; subject-teacher audience matching by grade, including section-limited notices.
- **Functions (emulator):**
  - issue: own grade, other grade, section with adviser, reissue revokes the previous slip, ended
    year;
  - preview: valid, used, revoked, wrong year;
  - redeem: DepEd, non-DepEd, used, revoked, wrong year, ended year, section lock taken, `canHold`
    conflict, two concurrent redeems (one wins), profile created, requests `fulfilled` and
    `superseded` with inbox notes;
  - `requestSchoolRoleFn`: subject-teacher auto-grant versus per-grade requests, legacy
    `sectionId` input;
  - `endSchoolYear` revokes advisory slips;
  - migration: conversion, merge, idempotent second run, conflict report.
- **Firestore rules:** `advisory_slips` denied to every client.
- **Parent App:** chooser rules and disabled-card copy, Needs approval tag, step order, wrong-kind
  slip handling, Summary partial results, `?a=` and `?c=` deep links, Add a role with held roles.
- **SIMS:** Adviser column states and which roles see Print and Revoke.

## Rollout

1. Functions, accepting the old section-based subject-teacher input until the migration runs.
2. Run `migrateSubjectTeachersFn`; resolve reported conflicts.
3. SIMS Sections page.
4. Parent App.

Each step follows the existing release flow for its app; the SIMS step must respect the current
release-tree hold.

## Out of scope

- Replacing an adviser by slip.
- Day-based slip expiry.
- Limiting how many sections one adviser may hold.
- Curriculum Advisers issuing slips from the Parent App.
- Holding Adviser, Subject Teacher and Family at once.
