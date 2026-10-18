# Family and School access rollout

This change is implemented for local review. It does not deploy services or migrate live accounts.

## Local verification (2026-10-18)

- SIMS/shared unit tests: 574 passed.
- Functions unit tests: 161 passed.
- Parent app unit tests: 112 passed.
- Firestore rules: 134 passed; 6 existing password-only release compatibility tests skipped under the normal rules configuration.
- Functions with local Auth/Firestore emulators: 283 passed across 18 suites.
- Both application builds passed; parent initial JavaScript is 259.9 KB gzip, within the 260 KB limit.
- Independent review findings were fixed and re-reviewed. Browser checks with synthetic data covered the adviser AM correction/restoration, unaffected PM status, mobile Family details, administrator management and subject-teacher view without a roster. Real notification delivery and production rollout are not part of these local checks.

## Account management

The parent app has separate Family and School views on the same account. Approved family relationships have equal access to their linked learners. School roles are approved assignments for the current school year:

| Role | Scope | Capabilities |
| --- | --- | --- |
| Adviser | Assigned section | Announcements, roster, AM/PM absence corrections on the same Manila school day |
| Subject Teacher | Assigned teaching sections | Announcements; no learner tracking |
| Curriculum Adviser | Assigned grades | Announcements, attendance review and corrections including earlier dates; no role approvals |
| SIMS Administrator | School-wide | Assign and revoke school roles; attendance review and corrections |

Administrators assign school roles directly under **Guardians → School access** in SIMS, using the teacher's verified app account email. Teachers no longer request roles in the parent app; the assignment adds an inbox note telling them to switch to School in Settings. SIMS JHS/SHS Academic Coordinators and Grade Level Coordinators review and correct session attendance for their grades in SIMS, with the same authority as a Curriculum Adviser.

Only an administrator assigns school roles, directly in SIMS, using the teacher's verified app account email, including a personal one; a `@deped.gov.ph` email grants nothing by itself. Curriculum Advisers and SIMS coordinators review and correct attendance in their grades but cannot assign roles. Nobody assigns themselves a role. Replace a section adviser by explicitly revoking the old assignment first.

Existing SIMS coordinator roles do not automatically become Curriculum Advisers. School assignments must be renewed for a new school year.

## Attendance behavior

**My Advisory** shows an adviser's section; **Attendance Review** covers the grades or sections the reviewer may manage. Select a date and mark AM or PM absent with a required reason. Restore a flagged session to its underlying attendance status when correcting a mistake. Gate scans and underlying marks are retained, including lateness. Later kiosk taps do not clear an absence flag.

Each correction is revision-checked and recorded in both the correction history and SIMS audit log. Family accounts receive a neutral inbox update; details are available after signing in. Push respects notification settings. Delivery uses an at-most-once claim, so a crash after claiming a push can leave an inbox item without a push; the persisted attendance and inbox remain authoritative.

Family notifications wait two minutes after a correction. Undoing a flag inside that window sends nothing; a later reversal sends a second neutral update. A scheduled job (`sendAttendanceUpdatesJob`, every minute) drains the `attendance_notifications` outbox.

Deploy `setSessionAbsenceFn`, `onAttendanceCorrectionCreated` and `sendAttendanceUpdatesJob` together: corrections made by the new `setSessionAbsenceFn` are only delivered by the scheduled job, so shipping one without the others either silences family updates or sends a stale backlog.

AM and PM corrections are independent. Reports count one absent session as half a day absent; SF2 displays `½A` with AM/PM details in the cell note. Future dates and ended years cannot be corrected. Session details distinguish an unrecorded learner from a recorded present mark; existing report defaults remain compatible with prior reports.

## Announcements

Authors choose Families, Advisers, Subject Teachers and Curriculum Advisers independently, then optionally narrow by grade or section. Existing author grade restrictions still apply. Recipient access uses current approved links and assignments. An account qualifying through multiple roles receives one notification. Existing announcements without explicit roles remain Family notices.

The new app reads all notices through authenticated callables. The new rules deny direct guardian announcement reads because cached audience keys can outlive approved access. Older installed clients need to refresh after rollout.

## Release preparation

1. Reconcile this worktree with the actual release baseline. Production already includes optional PM support from commit `4acf334` (PR #31), while this worktree started at `6ddaf30`. Relevant PM behavior is preserved here. Review the separately held coordinator rollout before choosing a release commit; do not publish an unrelated held rollout with this feature.
2. Run the unit suites, Firestore rules tests, Functions emulator tests, both application builds, and the parent bundle-size check on the final release commit. Use a demo Firebase project for tests.
3. Deploy the required Firestore indexes and wait for readiness. New indexes cover school-role requests and family attendance link lookup.
4. Deploy the new Functions, including school-role callables, attendance callables and the correction trigger, before clients that invoke them. Shared files are copied by `scripts/syncShared.mjs` during the Functions predeploy step.
5. Coordinate the rules and both app releases in a controlled release window. Deploy restrictive rules before enabling staff-targeted announcements, then publish the clients immediately; old notice queries will be unavailable until users refresh. Avoid publishing new role-targeted posts while old rules remain active.
6. In SIMS, inspect **Legacy adviser links to verify**. Independently verify each teacher and section, then explicitly assign school roles. Old adviser slips/links grant neither family learner access nor School access. Preserve genuine family relationships and do not convert legacy adviser links into family access as a migration shortcut.
7. In the release environment, with designated test accounts, verify: an administrator assigning an adviser to a personal-email account; a subject-teacher notice; an AM correction and restoration, including that undoing within two minutes sends families nothing; and that an unrelated teacher cannot read the roster.

## Recovery

Keep access-denying rules in place if an application release needs to be rolled back. Restore the compatible app and Functions release together; rolling back only the callable feed breaks notices, and restoring old rules can expose role-targeted notices. Preserve school assignments, section locks and correction audit records. Correct assignments through the admin interface and attendance through the correction workflow rather than deleting audit or gate data.
