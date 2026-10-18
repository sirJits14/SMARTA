# Family and School access implementation plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans. The user approved the design and authorized implementation in this chat.

**Goal:** Deliver approved role-based Family/School access, staff announcements and audited AM/PM attendance corrections.
**Architecture:** Server-owned year-scoped school assignments; callable authorization for school data; immutable base gate evidence and separate session overrides. Preserve existing family accounts and SIMS authoring scope.
**Tech stack:** React, Vite, Firebase Auth, Firestore, Cloud Functions, Vitest.
**Spec:** docs/superpowers/specs/2026-10-17-school-family-access-design.md

## Global constraints
- No deployment or production mutation. Reuse this isolated worktree.
- Curriculum approval only for verified DepEd advisers in the approver's grade; no self-approval.
- All family roles equal; school roles never grant family rights.
- Asia/Manila date boundary; independent AM and PM; preserve base marks/scans.
- Use existing UI tokens. Keep new views lazy loaded.

## Review focus
1. Concurrent approval/revocation and stale clients: transaction reads, assignment locks and revision checks.
2. Personal-email advisers and spoofed DepEd domains: trusted verified Auth identity only.
3. Existing adviser links and dual family/staff identities: no residual authorization bypass.
4. A late/offline kiosk event after an absence flag: preserve override and underlying scan evidence.
5. Multi-role notices and role revocation: no duplicate push or out-of-scope content.

## Task 1: School authorization and assignment lifecycle (root)
Files: shared/schoolAccess.js and tests; functions/src/handlers/schoolAccess.js; functions/src/callable.js; functions/index.js; firestore.rules; functions/test/emulator/schoolAccess.test.js; tests/rules.
Produces: loadSchoolActor(deps, reader=deps.db) -> {uid,email,isAdmin,schoolYear,assignments}; shared canReviewSection(actor,section), canCorrectSession(actor,section,date,today); roles adviser, subject_teacher, curriculum_adviser. Sections passed as {id,gradeLevel,schoolYear,name}.
Callables: getSchoolContextFn({}) -> {schoolYear,isAdmin,assignments,sections,requests,reviewRequests}; requestSchoolRoleFn({role,sectionId?,gradeLevel?}); resolveSchoolRoleFn({requestId,approve,reason}); assignSchoolRoleFn({email,role,sectionId?,gradeLevel?}); revokeSchoolRoleFn({uid,role,sectionId?,gradeLevel?,reason}). Context sections are metadata only. Requests carry id,uid,email,displayName,role,sectionId,gradeLevel,schoolYear,status. Reject curriculum self-requests; assignment by admin only. own requests and approvable requests are separate.
- [x] Write and run failing permission and approval tests.
- [x] Implement validation, transaction authorization, locks, audit and callable bindings.
- [x] Test emulator races, personal-email approvers, same-user rejection and year rollover.
- [x] Remove legacy adviser-link authorization paths; document admin migration candidates.

## Task 2: Session attendance (attendance implementer)
Files: shared/sessionAttendance.js and tests; functions/src/handlers/sessionAttendance.js and emulator tests; existing scanAttendance.js/scanEvent.js/recomputeSummary.js and PM helpers from 4acf334; src/lib/attendance.js/sf2Template.js and relevant attendance views.
Consumes Task 1 helpers. Produces getSchoolRoster(deps,{sectionId,date}) -> {section,date,rows:[{studentId,displayName,gate,am,pm,revision}],canCorrect}; setSessionAbsence(deps,{sectionId,studentId,date,session,absent,reason,expectedRevision,operationId}); getFamilyAttendance(deps,{studentId,date}) -> authenticated session detail; handleAttendanceCorrection(deps,{id,data}) notification outbox handler. Export callable handlers only; root wires functions/index.js.
Store sessionOverrides[studentId] on student_attendance, base marks untouched. Audit/outbox atomic with correction, repeat operationId idempotent. Each session object exposes absent, reason, actorName, changedAt, status; revision is per learner/day. No client writes to sessionOverrides. Family detail endpoint validates active family link and year. Backend-sourced notifications to family only, neutral message, settings respected.
- [x] Add failing tests for scopes, dates, separate sessions, restoring late, retries and later kiosk scans.
- [x] Implement backend correction, family projection/outbox and tests.
- [x] Integrate effective attendance into reports/SF2, retaining historical behavior without overrides.
- [x] Restore already-released PM behavior in owned files from 4acf334 without unrelated changes.

## Task 3: Announcement audiences (announcement implementer)
Files: shared/announcementAudience.js and tests; functions/src/handlers/announcements.js/new portalAnnouncements.js; parent/src/hooks/useAnnouncements.js and announcement screens; src/pages/announcements/AnnouncementForm.jsx; src/data/announcements.js; corresponding tests.
Consumes Task 1 assignments via loadSchoolActor; school account assignments shape above. Add audience.roles and audience.sectionIds to current audience object. Legacy posts without roles retain family behavior. New role-targeted posts use server-authorized feed/detail callables, not cached audienceKeys for authorization. Keep grade audienceKeys for existing SIMS writer scope; validate section-to-grade mappings server-side for reads and authoring. Roles: family, adviser, subject_teacher, curriculum_adviser. Root adds rules rejecting direct guardian reads of role-targeted posts and wires exports. Send one push per account/device; match active current-year links and assignments at send/read time. Family and School feed filtering accepts view parameter.
- [x] Add failing role/grade/section matching tests and revocation tests.
- [x] Implement author form, feed/detail callables and push/count integration.
- [x] Verify legacy notices and deduplication with tests.

## Task 4: Family/School and administration UI (UI implementer)
Files: parent App/Shell/nav/router, new school screens/hooks/styles, Family Home/History/Inbox as necessary, src/pages/GuardiansPage.jsx/new SchoolAccessTab.jsx. Avoid announcement screens/hooks and attendance report files owned by other tasks.
Consumes Task 1 callable contract and Task 2 roster/correction/family attendance contract. Add explicit Family/School view switch, school roles/request screen, My Advisory/Attendance Review and approval queue. SIMS administrator tab supports direct assignment, requests and revocation. New roles don't use activation slips. Keep family link views filtered to family links (root owns useLinks.js filtering). History shows session details separately from scans. Neutral correction inbox entries route to learner/session detail. Existing tabs/theme/mobile styles retained.
- [x] Test routing, role visibility and request/correction form validation.
- [x] Implement lazy screens, loading/error/empty states, accessible controls and stale-response protection.
- [x] Build apps; visually inspect mobile and desktop where environment allows.

## Task 5: Integration, verification, documentation (root)
- [x] Wire all callable/trigger exports and rules/indexes; audit every legacy authorization path.
- [x] Run root/functions/parent tests, rules/functions emulator suites, both builds and parent size check.
- [x] Independent code review; fix security/functional findings and rerun affected checks.
- [x] Document migration, production divergence, deployment order and verified limitations. No deployment.
