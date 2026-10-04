# Staff Accounts & Roles — Design

Date: 2026-10-04
Status: Approved (brainstorming session)

## Goal

Let an Administrator create and manage SIMS staff accounts, and introduce
grade-scoped coordinator roles that can view their grades' learners, sections
and attendance and take attendance — without being able to change learner
records or see the rest of the app.

Today there is exactly one role: anyone with a `users/{email}` profile is
"staff" with full access, and those profiles are created by hand.

## Roles

| Role | `role` value | Grades in scope | How the scope is set |
|---|---|---|---|
| Administrator | `admin` | All (7–12), all pages | — |
| JHS Academic Coordinator | `jhs_coord` | 7, 8, 9, 10 | Fixed by role |
| SHS Academic Coordinator | `shs_coord` | 11, 12 | Fixed by role |
| Grade Level Coordinator | `glc` | Exactly one (`gradeLevel`) | Admin picks 7–12 |

The three coordinator roles have identical capabilities; they differ only in
grade scope. "Coordinator" below means any of the three.

**Legacy rule:** a `users/{email}` profile with no `role` field is treated as
`admin` everywhere (app, rules, functions). This keeps the current registrar
account working through every deploy step.

## Data model

`users/{email}` (doc ID stays the lowercased email):

```
{
  name: string,
  role: 'admin' | 'jhs_coord' | 'shs_coord' | 'glc',
  gradeLevel: 7–12 when role == 'glc', otherwise null,
  disabled: bool,
  mustChangePassword: bool,
  uid: string,            // Firebase Auth uid
  createdBy: string,      // admin email
  createdAt, updatedAt: timestamp
}
```

Invariants (enforced by the callables, the only writers):
- `gradeLevel` is an integer 7–12 iff `role == 'glc'`; `null` otherwise.
- Changing `role` away from `glc` clears `gradeLevel`.
- Email is unique (it is the doc ID and the Auth email).

### Single source of truth for scope

`shared/staffRoles.js` (synced to `functions/shared/` by
`scripts/syncShared.mjs`) exports:

- `ROLES` — the four role values with display labels.
- `roleOf(profile)` — `profile.role ?? 'admin'`.
- `scopedGrades(profile)` — `null` for admin (= all grades), `[7,8,9,10]` for
  `jhs_coord`, `[11,12]` for `shs_coord`, `[profile.gradeLevel]` for `glc`.
- `roleLabel(profile)` — "Administrator", "JHS Academic Coordinator",
  "SHS Academic Coordinator", or "Grade N Coordinator".

No other client or function code compares role strings to decide grade scope.
`firestore.rules` mirrors the same mapping in `coversGrade()` (rules cannot
import JS); rules tests pin the two together.

## Cloud Functions

New file `functions/src/handlers/users.js`. New wrapper `adminCall` beside
`staffCall` in `functions/index.js`, using a new `adminIdentity(db, req)` in
`functions/src/callable.js`.

### Identity changes (`callable.js`)

- `staffIdentity()` additionally rejects profiles with `disabled == true`
  (`permission-denied`). It returns `{ uid, email, profile }`.
- `adminIdentity()` = `staffIdentity()` + `roleOf(profile) == 'admin'`, else
  `permission-denied` "Administrators only".
- Every existing `staffCall` export (activation codes, end school year,
  links, kiosks, reports, manual events) switches to `adminCall`, because the
  pages that use them (Guardians, Settings) are admin-only.

### New callables

| Export | Wrapper | Input | Behavior |
|---|---|---|---|
| `createStaffUserFn` | admin | `{ name, email, role, gradeLevel? }` | Validate; `auth.createUser({ email, password, displayName })` with a generated password; write profile with `mustChangePassword: true`; audit `staff.created`. Returns `{ email, password }` once. |
| `updateStaffUserFn` | admin | `{ email, name?, role?, gradeLevel? }` | Validate invariants; update profile; audit `staff.updated` (details: before/after role & grade). |
| `setStaffUserDisabledFn` | admin | `{ email, disabled }` | `auth.updateUser(uid, { disabled })`; profile `disabled`; on disable also `auth.revokeRefreshTokens(uid)`; audit `staff.disabled` / `staff.enabled`. |
| `resetStaffPasswordFn` | admin | `{ email }` | New generated password; `mustChangePassword: true`; `revokeRefreshTokens`; audit `staff.password_reset`. Returns `{ email, password }` once. |
| `deleteStaffUserFn` | admin | `{ email }` | Disable Auth user → delete profile → delete Auth user; audit `staff.deleted`. Audit entries are kept. |
| `changeOwnPasswordFn` | staff (incl. `mustChangePassword`) | `{ newPassword }` | Min 10 chars; `auth.updateUser(callerUid, { password })`; clear `mustChangePassword`; audit `staff.password_changed`. |

Password generation reuses the existing generator used by `provisionKiosk`
(`functions/src/handlers/kiosks.js`); move it to a shared lib if needed.

### Safeguards (checked inside the callables)

- An admin cannot disable, delete, or change the role of **their own**
  account (`failed-precondition`).
- Any operation that would leave **zero active admins** (demote, disable,
  delete) is refused (`failed-precondition`). Count = profiles where
  `roleOf == 'admin'` and `disabled != true`, read inside a transaction.
- Duplicate email → `already-exists` "An account with this email already
  exists." (from Auth `auth/email-already-exists` or an existing profile).
- Invalid role / missing or out-of-range `gradeLevel` for `glc` /
  `gradeLevel` supplied for a non-`glc` role → `invalid-argument`.

### Failure handling

- **Create:** if the profile write fails after the Auth user is created, delete
  the Auth user before rethrowing (no orphan logins).
- **Delete:** ordered disable → profile delete → Auth delete, so a partial
  failure leaves at worst a disabled Auth account that cannot sign in.
- Errors use `CallableError` → `toHttpsError`, matching existing handlers.

## Client app

### Permission module

New `src/lib/access.js`:
- `isAdmin(me)`
- `allowedPages(me)` — admin: every `NAV_ITEMS` key plus `accounts`;
  coordinators: `dashboard`, `students`, `sections`, `schedules`,
  `attendance`.
- `grades(me)` — wraps `scopedGrades`.
- `scopeRoster({ sections, enrollments, students }, grades, schoolYear)` —
  filters sections and enrollments by `gradeLevel ∈ grades`, and students to
  those with an in-scope enrollment for `schoolYear`. Identity when
  `grades == null`.

Pages consult this module; none check role strings directly.

### Shell & routing

- `Shell` renders only `NAV_ITEMS` in `allowedPages(me)`; the account footer
  shows `roleLabel(me)` instead of the fixed "Registrar".
- New nav item `accounts` ("Accounts"), admin-only.
- `App.jsx` guards rendering: a page not in `allowedPages(me)` falls back to
  `dashboard`.
- `App.jsx` subscribes to the signed-in user's profile (`onSnapshot`) instead
  of a one-time `getDoc`, so role/grade changes apply immediately; if the
  profile becomes disabled or is deleted, the app signs out and the login
  screen shows "This account has been disabled. Contact an administrator."

### Sign-in

- Login subtitle "Registrar sign-in" → "Staff sign-in".
- Disabled account → "This account has been disabled. Contact an
  administrator." (Auth `auth/user-disabled` or profile `disabled`.)
- If `mustChangePassword`, the app renders only a **Set a new password**
  screen (new + confirm fields, ≥10 chars, the two must match) that
  calls `changeOwnPasswordFn`; the app opens after success.

### Per-page behavior for coordinators

| Page | Coordinator behavior |
|---|---|
| Dashboard | Stats over scoped roster/attendance. "Enroll a learner" button and unassigned-learner panels hidden. |
| Students | Only learners enrolled this school year in scope. Import, Add learner, Edit, Delete hidden. "Unassigned" filter removed. |
| Sections | Only in-scope sections. Add/Edit/Delete hidden. Section detail roster viewable and printable; per-student Edit hidden. |
| Schedules | Read-only: Add/Edit/Delete hidden. |
| Attendance → Take | Section picker lists in-scope sections only. Save allowed. |
| Attendance → Monthly Summary / SF2 | In-scope sections only. Export allowed. |
| Enrollment, ID Cards, Guardians, Settings, Accounts | Not shown, not routable. |

Grade filter: `jhs_coord` / `shs_coord` get grade pills/dropdown limited to
their range; `glc` gets no grade control — the page header reads "Grade N".
Admins see today's UI unchanged.

### Accounts page (admin only)

New `src/pages/AccountsPage.jsx` + `src/data/staffUsers.js` (callable
wrappers in the style of `src/data/guardians.js`).

- Table: name, email, role label, grade, status (Active / Disabled / Must
  change password). Reads `users` collection (admin-readable).
- **Create account** dialog: name, email, role select; grade select (7–12)
  shown only for Grade Level Coordinator.
- Row actions: Change role/grade, Reset password, Disable / Enable, Delete
  (confirm by typing the account's email). Actions on the admin's own row that
  the safeguards forbid are disabled in the UI as well.
- **Show-once password dialog** after create / reset: email + temporary
  password, Copy button, warning that it cannot be shown again. Closing it
  discards the password from state.

## Firestore rules

New/changed helpers in `firestore.rules`:

```
function profile() { return get(/databases/$(database)/documents/users/$(request.auth.token.email.lower())).data; }
function isStaff() {
  return signedIn() && request.auth.token.email != null
    && exists(/databases/$(database)/documents/users/$(request.auth.token.email.lower()))
    && profile().get('disabled', false) != true;
}
function role() { return profile().get('role', 'admin'); }
function isAdmin() { return isStaff() && role() == 'admin'; }
function coversGrade(g) {           // mirrors shared/staffRoles.js scopedGrades()
  return isAdmin()
    || (isStaff() && role() == 'jhs_coord' && g in [7, 8, 9, 10])
    || (isStaff() && role() == 'shs_coord' && g in [11, 12])
    || (isStaff() && role() == 'glc' && g == profile().gradeLevel);
}
function coversSection(sectionId) {
  return coversGrade(get(/databases/$(database)/documents/sections/$(sectionId)).data.gradeLevel);
}
```

Rule changes:

| Path | Before | After |
|---|---|---|
| `students`, `enrollments`, `sections`, `schedules`, `settings/app` — write | `isStaff()` | `isAdmin()` |
| `settings/parent_portal` — write | `isStaff()` | `isAdmin()` |
| `student_attendance` — write | `isStaff()` ∥ kiosk ∥ TEMP `signedIn()` | `isAdmin()` ∥ (`isStaff()` ∧ `coversSection(request.resource.data.sectionId)` ∧ on update also `coversSection(resource.data.sectionId)`) ∥ kiosk ∥ TEMP `signedIn()` |
| `users` — read | `isStaff()` | `isAdmin()` ∥ own profile (`id == request.auth.token.email.lower()`) |
| `guardians`, `guardian_links`, `learners` (+`events`), `access_requests`, `reports`, `activation_codes`, `audit_log`, `kiosks`, `scan_events` — staff read clauses | `isStaff()` | `isAdmin()` (guardian/kiosk own-record clauses unchanged) |
| `users` — write | `false` | `false` (callables only) |

Roster reads (`students`, `enrollments`, `sections`, `schedules`,
`settings/app`, `student_attendance`) keep `isStaff() || isKiosk() ||
signedIn()`.

### What is and is not enforced server-side

- **Enforced now:** only admins mutate learners, enrollments, sections,
  schedules, settings; only admins read guardian/portal data, kiosks, scan
  log, audit log, and other users' profiles; disabled profiles are refused by
  rules and callables; account management is admin-only.
- **Written now, effective later:** coordinator attendance writes are
  grade-scoped by rule, but the TEMP(kiosk-v1-compat) `|| signedIn()` clause
  still admits any signed-in caller until K1/K2 are done.
- **UI-only in this feature:** coordinator *read* scoping of roster and
  attendance. Server-side read scoping needs (a) the kiosk TEMP clauses
  removed, (b) `gradeLevel` denormalized onto learner-facing docs, and (c)
  pages switched from whole-collection loads to `where('gradeLevel', 'in',
  grades)` queries. Add a comment next to the existing TEMP note in
  `firestore.rules` recording this follow-up.

## Testing

- **Unit (`npm test`, vitest):** `shared/staffRoles.test.js` — `roleOf`,
  `scopedGrades`, `roleLabel` for all four roles plus a role-less legacy
  profile; `src/lib/access.test.js` — `allowedPages` per role and
  `scopeRoster` (coordinators exclude unenrolled learners and other grades;
  admin is identity).
- **Functions (`npm run test:functions`, emulator):** new
  `functions/test/emulator/users.test.js` — each of the six callables; self
  disable/delete/demote refused; last-active-admin refused; duplicate email;
  `glc` grade validation; create rollback when profile write fails; audit
  entries written; coordinators refused by `adminCall`; a disabled profile
  refused by `staffCall`. Extend existing suites (or add one case) to show a
  coordinator is refused by a previously-`staffCall` export.
- **Rules (`npm run test:rules`):** new `tests/rules/roles.test.js` — role ×
  collection matrix: legacy profile acts as admin; disabled profile denied;
  coordinators denied writes to students/sections/enrollments/schedules/
  settings and reads of guardian/portal/audit/kiosk/scan collections and other
  users' profiles; own-profile read allowed; `coversSection` *allow* cases
  for each coordinator role. The out-of-scope *deny* cases cannot be observed
  while the TEMP `|| signedIn()` clause admits every signed-in caller, so they
  are written now as `it.skip` with a `TODO(K1/K2)` to un-skip when the TEMP
  clause is removed. Update `tests/rules/existing.test.js`
  where it assumes any staff can write.
- **Manual (emulator):** sign in as each of the four roles; verify sidebar,
  grade controls, hidden buttons, attendance save, SF2 export, forced password
  change, and that disabling a signed-in user signs them out live.

## Rollout

1. Deploy functions, then rules, then hosting. Order-safe: role-less profiles
   are admins, so the current registrar keeps full access throughout.
2. Run `scripts/backfillUserRoles.mjs` (Admin SDK; idempotent) to set
   `role: 'admin'`, `disabled: false`, `mustChangePassword: false` on profiles
   missing `role`.
3. Admin creates coordinator accounts from the Accounts page.

## Out of scope

- Server-side read scoping of roster/attendance (follow-up, above).
- Roles beyond these four; per-section adviser scoping.
- Email delivery of credentials; self-service "forgot password".
- Coordinators editing learners, sections, schedules, or enrollments.
- Multi-grade Grade Level Coordinators (a GLC has exactly one grade).
