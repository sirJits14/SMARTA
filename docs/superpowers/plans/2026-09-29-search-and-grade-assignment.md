# Search and Grade Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared prefix-word search, atomic learner/enrollment saves, reusable grade/section controls, and the approved search/filter flows across Sections, Students, Attendance, and Guardians.

**Architecture:** Keep matching and enrollment decisions in pure helpers, keep Firestore atomicity in the student data module, and keep grade/section interaction in two shared components. Pages consume those units without changing queries, rules, indexes, Cloud Functions, import, Enroll, or the existing Students-tab search behavior.

**Tech Stack:** React 19, Vite, Firebase/Firestore, Vitest, existing `T`/`S` tokens and shared UI components.

**Spec:** `docs/superpowers/specs/2026-09-29-search-and-grade-assignment-design.md`

## Global Constraints

- Matching is live, case/accent-insensitive, and requires every query word to prefix-match some field word.
- Use no new dependencies and preserve the existing Students-tab substring search.
- Do not change Firestore rules, indexes, Cloud Functions, Enroll, or the import wizard.
- Preserve save guards, disabled-while-saving behavior, resource loading/error states, and the unavailable-section alert.
- Changed screens must avoid horizontal page scroll at 375px; dense tables may retain their named internal scroll regions.
- Follow existing tokens and UI primitives from `src/styles.js` and `src/components/ui.jsx`.

## Review Focus

- Punctuation, accents, nulls, and numeric LRNs must normalize without throwing; Task 1 pins these inputs with literal expectations.
- A dropped current-school-year record must lead to a fresh enrollment write, while an enrolled record must produce a field-limited transfer; Task 2 pins both branches.
- External section selection (including QR entry) must move `SectionPicker` to the selected section's grade, while an unavailable id must remain visibly unselected; Task 4 covers this through controlled-state behavior and Task 6 verifies the QR consumer.
- Guardian rows with no matching learner record must count as Unassigned, not disappear or crash; Task 7 verifies this branch in each filter computation.
- Empty datasets and filtered-to-empty datasets must retain distinct copy and resource states; Tasks 5-7 verify both render branches while preserving existing loading/error wrappers.

---

### Task 1: Shared search helpers

**Files:**
- Create: `src/lib/search.js`
- Create: `src/lib/search.test.js`

**Interfaces:**
- Produces: `normalize(text)`, `words(text)`, `matchesWords(query, ...fields)`, `learnerMatches(query, student, { includeLrn = false } = {})`, and `sectionMatches(query, section)`.

- [ ] **Step 1: Write the failing search tests**
  Cover empty/whitespace queries; case and accent folding (`Nuñez`, `nunez`, `NUÑ`); prefix-only matching (`riz` yes, `iza` no); multi-token all-match semantics; learner first/last name matching; opt-in LRN prefix matching; punctuation tokenization; and null/undefined fields.
- [ ] **Step 2: Run `npm test -- src/lib/search.test.js` and verify failure because `search.js` does not exist.**
- [ ] **Step 3: Implement the five exact exports from the spec using NFD plus `\p{Diacritic}` stripping and word-prefix matching.**
- [ ] **Step 4: Run `npm test -- src/lib/search.test.js`, then `npm test`; expect all tests to pass.**
- [ ] **Step 5: Commit with message `feat: add shared prefix search helpers`.**

### Task 2: Enrollment change planning helpers

**Files:**
- Create: `src/lib/enrollmentChange.js`
- Create: `src/lib/enrollmentChange.test.js`

**Interfaces:**
- Produces: `currentEnrollmentByStudent(enrollments, schoolYear) -> Map` and `planEnrollmentChange({ current, section, schoolYear, type }) -> { kind, data? }`.
- Consumes: `localDate()` from `src/lib/dates.js`.

- [ ] **Step 1: Write the failing enrollment tests**
  Cover ignoring other school years and non-enrolled statuses; `none` for null/unchanged section; transfer data containing only grade/section/track/strand; JHS null track/strand; enroll default and explicit types; enrolled status/today date; and a dropped-only record resulting in enroll.
- [ ] **Step 2: Run `npm test -- src/lib/enrollmentChange.test.js` and verify failure because the module does not exist.**
- [ ] **Step 3: Implement both helpers exactly as specified, ensuring transfer data omits `dateEnrolled`, `type`, and `status`.**
- [ ] **Step 4: Run `npm test -- src/lib/enrollmentChange.test.js`, then `npm test`; expect all tests to pass.**
- [ ] **Step 5: Commit with message `feat: plan learner enrollment changes`.**

### Task 3: Atomic student and enrollment persistence

**Files:**
- Modify: `src/data/students.js`
- Consume unchanged export from: `src/data/enrollments.js`

**Interfaces:**
- Consumes: `enrollmentId(studentId, schoolYear)` and plans returned by `planEnrollmentChange`.
- Produces: existing `createStudent`, `updateStudent`, `deleteStudent`, plus `saveStudentWithEnrollment({ id, form, isNew, enrollmentPlan, schoolYear }) -> Promise<string>`.

- [ ] **Step 1: Extract local `studentShape(form)` and route both existing student writes through it without changing their stored fields.**
- [ ] **Step 2: Add `saveStudentWithEnrollment` with `writeBatch`, a pre-generated new student ref, merge semantics for updates/transfers, replacement semantics for new enrollment, and no enrollment write for `none`.**
- [ ] **Step 3: Run `npm test` and `npm run build`; expect both to pass before committing.**
- [ ] **Step 4: Commit with message `feat: save learners and enrollments atomically`.**

### Task 4: Shared grade and section controls

**Files:**
- Create: `src/components/GradePills.jsx`
- Create: `src/components/SectionPicker.jsx`
- Modify: `src/pages/SectionsPage.jsx` (replace only the inline pill row in this task)

**Interfaces:**
- Consumes: `sectionMatches`, `Inp`, and `T`.
- Produces: `GradePills({ options, value, onChange, label, disabled })` and `SectionPicker({ sections, value, onChange, disabled, label })`.

- [ ] **Step 1: Implement `GradePills` with the exact extracted visual style, labelled `role="group"`, native buttons, `type="button"`, `aria-pressed`, wrapping, optional counts, and disabled state.**
- [ ] **Step 2: Replace the Sections page's inline pills with `GradePills`, preserving group/count/selection behavior.**
- [ ] **Step 3: Implement `SectionPicker` with controlled external selection, remembered grade, persistent search, grade-scoped prefix matches, selected summary, wrapping rows, disabled controls, and the exact empty-state copy.**
- [ ] **Step 4: Run `npm test` and `npm run build`; expect both to pass.**
- [ ] **Step 5: Commit with message `feat: add shared grade and section pickers`.**

### Task 5: Sections learner search and learner grade assignment

**Files:**
- Modify: `src/pages/SectionsPage.jsx`
- Modify: `src/pages/StudentForm.jsx`
- Modify: `src/pages/StudentsPage.jsx`

**Interfaces:**
- Consumes: Task 1 search helpers, Task 2 enrollment helpers, Task 3 atomic save, Task 4 `GradePills`, `GRADES`, and `ENROLL_TYPE`.
- Produces: `StudentForm({ students, editing, sections, enrollments, schoolYear, onClose })` and per-grade learner search on Sections.

- [ ] **Step 1: Replace StudentsPage's inline current-enrollment map with `currentEnrollmentByStudent` and pass sections/enrollments/schoolYear to `StudentForm` without changing its existing search.**
- [ ] **Step 2: Add StudentForm grade, section, conditional enrollment type, enrolled-learner helper text, no-unassign semantics, no-sections hint, and the exact section validation error.**
- [ ] **Step 3: Route StudentForm save through `planEnrollmentChange` and `saveStudentWithEnrollment` after existing validation/duplicate checks and within the existing action guard.**
- [ ] **Step 4: Add SectionsPage grade-scoped learner search, polite result count, DepEd-sorted result table, View section/Edit actions, empty state, and updated StudentForm props.**
- [ ] **Step 5: Run `npm test` and `npm run build`; expect both to pass.**
- [ ] **Step 6: Commit with message `feat: search learners and assign sections from forms`.**

### Task 6: Attendance and activation-slip section pickers

**Files:**
- Modify: `src/pages/AttendanceTakePage.jsx`
- Modify: `src/pages/AttendanceSummaryPage.jsx`
- Modify: `src/pages/guardians/CodesTab.jsx`

**Interfaces:**
- Consumes: Task 4 `SectionPicker`.

- [ ] **Step 1: Replace Attendance Take's section select with a full-width `SectionPicker`, preserving save disabling, message reset, mark-clearing effects, QR-driven section selection, and the unavailable-section alert.**
- [ ] **Step 2: Replace Attendance Summary's select with `SectionPicker` on its own row while keeping month/export controls and SF2 behavior.**
- [ ] **Step 3: Replace CodesTab's select with `SectionPicker`, preserving busy disabling, result reset, issue guard, loading/error handling, and print readiness.**
- [ ] **Step 4: Run `npm test` and `npm run build`; expect both to pass.**
- [ ] **Step 5: Commit with message `feat: use searchable section pickers`.**

### Task 7: Guardian learner and loaded-row filters

**Files:**
- Modify: `src/pages/GuardiansPage.jsx`
- Modify: `src/pages/guardians/LinksTab.jsx`
- Modify: `src/pages/guardians/RequestsTab.jsx`
- Modify: `src/pages/guardians/ReportsTab.jsx`
- Modify: `src/pages/guardians/ScanLogTab.jsx`

**Interfaces:**
- Consumes: Task 1 search helpers, Task 2 `currentEnrollmentByStudent`, Task 4 `GradePills`, `GRADES`, and `UNASSIGNED`.

- [ ] **Step 1: Add enrollments, grade pills, and improved live name/LRN search to LinksTab, including the 20-result cap/copy and enrolled/unassigned labels.**
- [ ] **Step 2: Add loaded-row search/grade filters and the exact 50-item hint/empty copy to RequestsTab, matching recorded or typed learner names.**
- [ ] **Step 3: Pass `schoolYear` from GuardiansPage and add enrollment-backed loaded-row filters/hints/empty copy to ReportsTab.**
- [ ] **Step 4: Pass `schoolYear` from GuardiansPage and add enrollment-backed filters inside ScanLog's existing filter card, preserving the raw count and appending shown count only while active.**
- [ ] **Step 5: Confirm unmatched learner records pass Unassigned and active filters never replace the original no-data empty states.**
- [ ] **Step 6: Run `npm test` and `npm run build`; expect both to pass.**
- [ ] **Step 7: Commit with message `feat: filter guardian records by learner and grade`.**

### Task 8: Responsive, accessibility, and final verification

**Files:**
- Modify only changed UI files if verification exposes a spec regression.
- Create execution-only evidence under the git-ignored Superpowers workspace.

**Interfaces:**
- Consumes: all prior tasks.

- [ ] **Step 1: Inspect changed controls for visible/accessible labels, `aria-pressed`, polite counts, wrapping at 375px, and internal-only table overflow.**
- [ ] **Step 2: Run the Impeccable detector once over all changed UI targets and resolve in-scope findings.**
- [ ] **Step 3: Run the spec's full commands fresh: `npm test` and `npm run build`; read complete outputs and require exit code 0.**
- [ ] **Step 4: Perform every manual checklist item available without Firebase/emulator state and record which items still require a human browser/emulator check.**
- [ ] **Step 5: Commit any final in-scope fixes with message `fix: harden search and grade assignment flows`.**
- [ ] **Step 6: Request a fresh whole-branch review against this plan and the approved spec; fix Critical/Important findings with RED-GREEN evidence and rerun the full suite/build.**
