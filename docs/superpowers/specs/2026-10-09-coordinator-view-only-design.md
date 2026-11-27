# Coordinators are view-only for learners and sections

## 2026-10-15: approved Grade Level Coordinator exception

GLCs can now edit existing sections in their assigned grade for the configured
current school year and the immediately following school year. The window advances
with `settings/app.currentSchoolYear`; ended years are locked. Only `name`,
`adviserName`, and an existing `scheduleId` (or clearing the assignment) are editable.
Section creation/deletion, grade/year/track/strand changes, schedule definitions,
and all learner/enrollment edits remain Administrator-only. JHS/SHS coordinators
remain view-only for section metadata.

The Sections page offers current/next year selection for Administrators and GLCs;
next-year setup contains section metadata, while learner rosters remain in the
current-year view. The restricted editor loads existing shift labels through
`getCoordinatorSectionOptionsFn` and saves through `updateCoordinatorSectionFn`.
Both use the existing App Check/staff/session gate and transactionally recheck the
stored profile, section grade/year, current-year setting and ended-year marker.
The save rejects extra fields, maintains old/new schedule audiences atomically,
and audits the actor and changed field names. Direct Firestore writes stay
Administrator-only, including create/delete and shared schedule definitions.

Rollout requires deploying both new callables and SIMS hosting; no rule/index
changes or data migration are required. Deploy the callables before the UI.

The original view-only design below records the 2026-10-09 baseline.

## Goal

Only the Administrator creates, edits, or deletes learners, sections, and
enrollments. Coordinators (JHS, SHS, Grade Level) keep everything they can
see and search today.

## Current state

Most of this already holds on `master` (from the staff-roles feature,
`2026-10-04-staff-accounts-and-roles-design.md`):

- Students: Add learner, Import from Excel, Edit, Delete render for admins only.
- Sections: Add, Edit, Delete, and the per-student Edit in the section detail
  window render for admins only.
- Enrollment page: not in the coordinator page list.
- Dashboard: "Enroll a learner" is admin-only.
- `firestore.rules`: writes to `students`, `enrollments`, `sections`,
  `schedules` require `isAdmin()`; `tests/rules/roles.test.js` covers the
  coordinator denials.

The one gap: JHS and SHS coordinators can print a section's ID/QR sheet from
the section detail window (`canPrintSectionQr`).

## Change

| Area | Administrator | Coordinators |
|---|---|---|
| Section detail -> Print ID/QR sheet | yes | **no** (new) |
| Attendance take/save, Monthly Summary, SF2 export | yes | yes (unchanged) |
| Announcements | yes | yes (unchanged) |

- `src/pages/SectionsPage.jsx`: gate the print action and the hidden print
  sheet on `isAdmin(me)`, the same check as Edit/Delete.
- `src/lib/access.js`: remove `canPrintSectionQr` (no other caller).
- Staff-roles spec: the Sections row no longer says coordinators may print.

No rules change: printing writes nothing, and `id_card_batch` is already
admin-only.

## Tests

- `src/lib/access.test.js`: every coordinator role is not an administrator and
  cannot open `enroll`, `idcards`, `guardians`, `settings`, or `accounts`; a
  profile with no role is still an administrator (legacy behavior).
- `SectionDetailModal` render test: with no `onPrint` / `onEditStudent`, no
  Print or Edit button renders; with them, both render.
