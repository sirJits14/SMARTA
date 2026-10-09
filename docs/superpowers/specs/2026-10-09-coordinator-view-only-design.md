# Coordinators are view-only for learners and sections

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
