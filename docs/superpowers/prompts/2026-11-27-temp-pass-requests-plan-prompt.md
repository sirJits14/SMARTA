# Prompt — Plan adviser requests for temporary ID passes, and the Logistic Operator role

Use **/superpowers:writing-plans**. The design was settled in brainstorming on 2026-11-27 and is
written in `docs/superpowers/specs/2026-11-27-temp-pass-requests-design.md`. Read it first and do
not reopen its decisions; if the code contradicts one, stop and ask.

Write the plan to `docs/superpowers/plans/2026-11-27-temp-pass-requests.md`, split into
independently testable tasks with TDD steps, exact file paths and a verification step each.

## What exists today (verify before relying on it)

The temporary ID pass feature (PR #107) went live on 2026-11-27. Its design and plan are in
`docs/superpowers/specs/2026-11-27-temp-student-id-pass-design.md` and
`docs/superpowers/plans/2026-11-27-temp-student-id-pass.md`.

- **Who may print and upload:** `passGrades()` / `canManagePasses()` in `shared/tempPass.js`
  (admin, `jhs_coord`, `shs_coord`). Used by `functions/src/handlers/tempPasses.js`,
  `functions/src/handlers/studentPhotos.js` (`photoAccess`), `src/lib/access.js`
  (`canManagePhotos`, `PASS_COORDINATOR_PAGES`), `src/lib/staffQueries.js`, and `firestore.rules`
  (`coordinatorMayReadPass`).
- **Roles:** `shared/staffRoles.js` (`ROLE_VALUES`, `roleOf`, `scopedGrades`, `ROLE_LABELS`);
  account creation validates with `roleAndGrade` in `functions/src/handlers/users.js`; the form is
  `src/pages/AccountsPage.jsx`; `firestore.rules` mirrors roles in `role()`, `isAdmin()`,
  `coordinatorGrades()`.
- **Eligibility:** `tempPassBlocker()` in `shared/tempPass.js` (currently returns `no-photo`).
- **Pass card and sheet:** `src/components/TempPassPrintable.jsx` (SVG `viewBox 0 0 591 937`, photo
  at 272 units), `src/pages/tempPassPrintLayout.js` (3 × 3 CR80 on A4), `src/lib/tempPass.js`
  (`passRowStatus`, `fitText`, `chunkSheets`), `src/pages/idCards/TempPassesTab.jsx`,
  `src/pages/IDCardsPage.jsx`.
- **Pattern to copy for requests:** adviser learner requests — `shared/learnerRequests.js`,
  `functions/src/handlers/learnerRequests.js` (callables, inbox notice `type: 'learner_request'`,
  `MAX_PENDING_PER_ADVISER`), Parent `parent/src/screens/school/ClassTab.jsx`, `ClassActions.jsx`,
  `RequestsSheet.jsx`, `parent/src/hooks/useLearnerRequests.js`, `parent/src/lib/school.js`
  (`inboxDestination`), SIMS `src/pages/LearnerRequestsPage.jsx`. Rules: the collection is
  `allow read, write: if false`.
- **Adviser identity:** `loadSchoolActor` in `functions/src/handlers/schoolAccess.js`; class
  adviser = an `adviser` assignment for the section in the current year.

## Work to plan

1. **Shared rules:** add role `logistic` (label "Logistic Operator", no grade) to
   `shared/staffRoles.js` without making it an administrator anywhere. `passGrades`: admin → null,
   `glc` → own grade, `logistic` → null, all others → []. Remove `no-photo` from `tempPassBlocker`.
   Add `shared/tempPassRequests.js` with request eligibility, reasons, limits and copy shared by
   Functions, SIMS and the Parent App.
2. **Accounts:** administrators can create, edit and disable Logistic Operator accounts.
3. **Functions:** the request callables and the `issueTempPassFn` change listed in the spec,
   following the learner-request pattern (transactions, audit rows, rate limits, inbox notices).
   Lost: revoke the old pass and issue a new code in one transaction. Damaged: keep the code.
4. **Rules:** `temp_pass_requests` closed to clients; `temp_passes` reads for admin, `glc` (own
   grade) and `logistic` (all) — no longer `jhs_coord`/`shs_coord`; whatever SIMS reads a Logistic
   Operator needs for the Temporary passes and Requests tabs, and nothing more.
5. **SIMS:** Logistic Operator navigation (Dashboard, ID Cards, nothing else) and Students photo
   access; Academic Coordinators lose ID Cards and the Photo button; a **Requests** tab in ID Cards
   with select, prepare, print, mark printed and decline; Settings field "Pass pick-up place"
   (`passPickupPlace`); passes without a photo.
6. **Pass layout:** four per A4 sheet (about 87 × 138 mm, 2 × 2, 4 mm gap, 8 mm margins), photo
   area exactly 1 × 1 inch for every pass, dashed 1 × 1 inch frame labelled "Attach 1×1 photo" when
   there is no photo, rebalanced name and QR. Check the QR still reads at the gate scanner's range
   and nothing clips with long Filipino names and long SHS section lines.
7. **Parent App:** "Request temporary pass" on the Class tab with multi-select, Lost/Damaged
   choice for learners with an active pass, optional note, statuses (Waiting, Printed, Declined),
   withdraw, inbox notices that open the Class tab. All copy in `parent/src/strings.js`.
8. **Release checklist** in `docs/releases/<date>-temp-pass-requests/README.md`.

## Constraints

- Production runs the **live bases**, not `master`, for rules and SIMS: rules =
  `docs/audits/deployments/2026-11-27-temp-id-pass/firestore.rules`; SIMS = the release tree from
  that record (`port-sims.mjs`). The plan must say how each change is ported onto them; never
  publish a root build.
- Functions deploy by name only; `onScanEventCreated` uses the preserved live scan handler plus
  `scanAttendance.diff`. The kiosk needs no change and must keep working.
- Order: Functions → rules → SIMS → Parent App. A Logistic Operator account must not be creatable
  before the rules and SIMS that limit it are live.
- No new dependencies; never `npm install` in a worktree; Parent initial load stays under 260 KB.
- Keep the Parent App's theme choice only in Settings > Appearance and the icon-only Sessions button.
- Academic Coordinators losing access is intended; list the existing tests that must change.

## Open items the plan must resolve (do not guess silently)

- Whether `scopedGrades('logistic')` should be `null`, given that `null` is treated as
  "administrator scope" in several places (`scopeRoster`, `staffQueries`, rules).
- How the Requests tab and the section tab share one prepare/print flow without duplicating it.
- What a Logistic Operator sees on the Dashboard (recommend: only a pending-request count).
