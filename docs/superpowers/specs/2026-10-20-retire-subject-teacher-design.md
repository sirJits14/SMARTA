# Retire Subject Teacher; rename Family Member to Parent/Guardian

Date: 2026-10-20. Status: approved design.
Builds on: `2026-10-19-role-based-registration-design.md`, which this partly reverses.

## Goal

The Parent App offers only two ways to register: **Parent/Guardian** and **Class Adviser**. The Subject Teacher role
is removed from the whole system:
- Parent App;
- server;
- SIMS School Access;
- announcement audiences.

The teachers who hold it now are cleaned up, and each gets a note. Curriculum Adviser, which is assigned in SIMS, is
unchanged.

## Decisions

| Question | Decision |
| --- | --- |
| How far to remove Subject Teacher | Everywhere: Parent App, server, SIMS School Access, announcement audiences. |
| Accounts that hold it now | Revoke the role, close pending requests, write an audit row, and send an inbox note. |
| Where "Family" becomes "Parent/Guardian" | All Parent App labels. Internal role id stays `family`; no stored data changes. SIMS wording is unchanged. |
| Chooser behaviour | Two cards; tick one or both. |
| Approach | Retire outright: delete the role and its code, and run a one-off admin cleanup callable. |

Production on 2026-10-20 (read-only count, 12:53 UTC):
- 54 `school_accounts` with 48 adviser rows;
- **9 `subject_teacher` rows held by 5 accounts**, all self-granted DepEd grade-level rows from the 2026-10-19 release;
- 0 Subject Teacher requests of any status.

## 1. Parent App

**"Who are you?" chooser** (`parent/src/screens/join/RoleChooser.jsx`, `parent/src/lib/join.js`)
- Two cards: **Parent/Guardian** ("I'm a parent or guardian of a BNHS learner.") and **Class Adviser**. Either or both may be ticked.
- `JOIN_ROLES` becomes `['family', 'adviser']`.
- The "not both" rule (`joinChooseOne`) and `toggleRole`'s exclusion logic are removed.
- A query of `role=subject_teacher` (old links or an old installed app) leads to the plain chooser with nothing ticked.
- `landingModeFor` no longer looks at `subject_teacher`.

**Steps** (`parent/src/screens/Join.jsx`)
- `STEPS` becomes `{ family: FamilyStep, adviser: AdviserStep }`.
- `parent/src/screens/join/SubjectTeacherStep.jsx` and its strings (`subject*`, `summarySubject*`) are deleted.
- The join summary lists linked learners and advisory sections only.

**Labels** (`parent/src/strings.js`)
- `joinFamily`: "Parent/Guardian".
- `modeFamily`: "Parent/Guardian". This is the Home/School mode switch; `modeFamilyHint` is unchanged.
- `addRoleRowHint`: "Parent/Guardian or Class Adviser".
- `schoolRequestsIntro`: "Class Adviser requests for your grades, from any verified email. Approving gives the teacher that role right away."
- `joinSubject`, `joinSubjectHint` and `joinChooseOne` are removed.
- Any other user-facing "Family Member" text becomes "Parent/Guardian".

**School labels** (`parent/src/lib/school.js`)
- `ROLE_LABELS` and `REQUESTABLE_ROLES` lose `subject_teacher`.
- `parent/src/screens/School.jsx` drops its subject-teacher comment and branch. Every school role now has a Class tab, or is a Curriculum Adviser.

**Accounts left with nothing:** if an account has no family link and no school role (for example a retired Subject
Teacher), its next visit opens `/join`, as for any new account. "Skip for now" still applies.

## 2. Server

**Shared lists** (`shared/schoolAccess.js`)
- `SCHOOL_ROLES = ['adviser', 'curriculum_adviser']`.
- `SCHOOL_ROLE_LABELS` loses `subject_teacher`.
- `REQUESTABLE_ROLES = ['adviser']`.
- `GRADE_ROLES = ['curriculum_adviser']`.
- `EXCLUSIVE`, `conflictingRole` and `canHold` are deleted, along with every caller (`assertCanHold` and `rolesHeld` in the handlers, and redeem in `advisorySlips.js`).
- `canApproveRoleRequest`: a Curriculum Adviser approves Class Adviser requests from verified emails in their own grades.

**Announcement lists** (`shared/announcementAudience.js`)
- `ANNOUNCEMENT_ROLES = ['family', 'adviser', 'curriculum_adviser']`, and the labels lose "Subject Teachers".

**Callables** (`functions/src/handlers/schoolAccess.js`)
- **`requestSchoolRole`:**
  - The `gradeLevels` path and the DepEd instant grant (`source: 'self'`) are removed, since they existed only for Subject Teacher.
  - Any role outside `REQUESTABLE_ROLES` fails with `invalid-argument`: "Subject Teacher is no longer offered. Choose Class Adviser, or Parent/Guardian to link a learner." The message names Subject Teacher only when that was the requested role; otherwise it uses the existing "Choose a school role." message.
- **`assignSchoolRole`, `revokeSchoolRole`, `replaceAdviser`:** these validate against `SCHOOL_ROLES`, so they refuse the role.
- **`assignmentFrom`:** the legacy section-to-grade conversion for Subject Teacher is deleted.
- **`getSchoolContext`:**
  - It returns only assignments whose role is in `SCHOOL_ROLES`.
  - Leftover `subject_teacher` rows are therefore invisible between the server deploy and the cleanup.
  - The review queue loses its Subject Teacher branch.
- **Announcements** (`portalAnnouncements.js`, `announcements.js`):
  - Reach, counts and push already filter by `ANNOUNCEMENT_ROLES`, so leftover rows receive nothing.
  - The comment at `portalAnnouncements.js:44` is updated.

**Cleanup: `retireSubjectTeachersFn`** (new `functions/src/handlers/retireSubjectTeachers.js`)
- **Who can call it:** administrators only, through `staffCall`, with `scopedGrades(profile) === null`. It runs with a 540-second timeout and is safe to re-run.
- **`{}` is a dry run:** it returns `{ dryRun: true, accounts, rows, requests }` and changes nothing.
- **`{ apply: true }` processes each `school_accounts` doc holding any `subject_teacher` row, in its own transaction.** All reads happen before writes. For each account it:
  - removes every `subject_teacher` row, in any school year;
  - writes an audit row: action `school.roleRetired`, target the uid, details `{ role: 'subject_teacher', removed: [rows], ...teacherOf(account) }`;
  - when a removed row belongs to the current school year, sets an inbox note through `inboxRef(db, uid, 'retired:subject_teacher')`:
    - `type: 'school_access'`;
    - title "Subject Teacher access has ended";
    - body "BNHS no longer uses the Subject Teacher role, so these notices stop. If you are a class adviser or a learner's parent or guardian, add that role in Settings → Add a role.";
    - `createdAt: serverTimestamp()`.
- **Pending `subject_teacher` requests** in `school_role_requests` are marked `status: 'rejected'` with reason "The Subject Teacher role was retired.", `reviewedBy` the admin uid and `reviewedAt`. Each also gets the existing rejection inbox note and a `school.requestRejected` audit row.
- **Return value:** `{ dryRun: false, accounts, rows, requests }`. A second run returns zeros.
- **Removed with it:**
  - `migrateSubjectTeachersFn`;
  - `functions/src/handlers/schoolMigration.js`;
  - `functions/src/lib/subjectTeacherMigration.js` and its tests.
- `functions/index.js` exports `retireSubjectTeachersFn` instead of `migrateSubjectTeachersFn`.

Firestore rules do not mention the role and do not change.

## 3. SIMS, docs, testing, release

**SIMS**
- **School Access, Assign form** (`AssignRoleForm.jsx`): offers `SCHOOL_ROLES`, which is Class Adviser and Curriculum Adviser.
- **School Access, Coverage** (`CoverageView.jsx`, `src/lib/schoolAssignments.js`):
  - drops "Subject Teachers: N" and `subjectTeachers`;
  - the CSV export drops the "Grade subject teachers" column.
- **School Access, Pending** (`PendingView.jsx`): drops its Subject Teacher handling.
- **Announcements** (`src/lib/announcements.js`, `AnnouncementForm.jsx`):
  - The recipient checkboxes come from `ANNOUNCEMENT_ROLES`.
  - When a saved announcement opens in the editor, roles outside `ANNOUNCEMENT_ROLES` are dropped.
  - The audience summary skips unknown roles.
  - If dropping leaves no role ticked, saving shows the existing "Choose at least one recipient role." message.
  - Announcements that are already live keep their stored audience. The server ignores the retired role when sending.
- **Release tree:** SIMS ships from the release tree (latest preparer `docs/releases/2026-10-20-ui-modules/`). A new overlay wraps that preparer and carries the touched files. Files whose tree copy differs from master are ported by hand, and each difference is listed in the release README.

**Docs**
- `docs/parent-portal-adviser-guide.md` and `docs/school-family-access-rollout.md`: remove Subject Teacher and use "Parent/Guardian".
- `2026-10-19-role-based-registration-design.md`: add a note at the top that Subject Teacher was retired on 2026-10-20, pointing to this spec.

**Testing**
- **Unit tests:**
  - shared lists and approval rules;
  - `join.js`: two roles, one or both, old `role=subject_teacher` queries, landing;
  - Parent App labels;
  - SIMS announcement editor dropping retired roles, and the summary;
  - Coverage view and CSV.
  - Subject Teacher tests are deleted, not skipped.
- **Emulator tests:**
  - A Subject Teacher request is refused, with and without `gradeLevels`, and so is a direct assignment.
  - `getSchoolContext` hides leftover rows.
  - `retireSubjectTeachersFn`:
    - a dry run changes nothing;
    - apply removes the rows and writes the audit row and inbox note;
    - a past-year-only row is removed without a note;
    - pending requests are rejected with a note;
    - a second run returns zeros;
    - non-admins and coordinators are refused.
  - Announcements never reach a leftover row.
  - Redeeming an advisory slip still works without the exclusion check.
- **Browser check against local emulators** (see the emulator harness):
  - the two-card chooser with Parent/Guardian, Class Adviser, and both;
  - the "Parent/Guardian" mode label;
  - SIMS School Access (Assign and Coverage) and the announcement form;
  - a seeded Subject Teacher sees the inbox note after the cleanup and lands on `/join`.

**Release order.** Each production write waits for the user's go-ahead in the releasing session.
1. **Baseline:** a read-only production count, and byte checks of live SIMS and the Parent App against their last records.
2. **Functions:** deploy by name from the backend preparer. The plan lists every function that imports `shared/schoolAccess.js` or `shared/announcementAudience.js`, plus `retireSubjectTeachersFn`.
3. **Delete** `migrateSubjectTeachersFn` by name.
4. **Cleanup:** dry-run `retireSubjectTeachersFn` (expected: 5 accounts, 9 rows, 0 requests, or the current count), then apply it, then dry-run again to confirm zeros.
5. **SIMS:** deploy from the new release tree and byte-verify.
6. **Parent App:** deploy from master and byte-verify.
7. **Record:** a deployment record PR with the counts, logs and verifications.

## Out of scope

- Renaming the `family` role id or SIMS "Families" wording.
- The consent notice text, which is still a separate open decision.
- Any change to Class Adviser slips or Curriculum Adviser.
