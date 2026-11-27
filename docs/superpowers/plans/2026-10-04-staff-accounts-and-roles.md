# Staff Accounts & Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an Administrator create and manage SIMS staff accounts, and add three grade-scoped coordinator roles that can view their grades' learners/sections/attendance and take attendance.

**Architecture:** Role and grade live on the existing `users/{email}` profile. One shared module (`shared/staffRoles.js`) maps role → grades for both the React app and Cloud Functions; `firestore.rules` mirrors it. All account writes go through admin-only callables in `functions/src/handlers/users.js`. The client scopes each page's already-loaded collections through one `scopeRoster()` helper and hides admin-only controls.

**Tech Stack:** React 19 + Vite, Firebase Web SDK 12 (Auth, Firestore, Functions), Cloud Functions v2 (Node 22, firebase-admin 13), Firestore security rules, Vitest 4, `@firebase/rules-unit-testing`.

**Spec:** `docs/superpowers/specs/2026-10-04-staff-accounts-and-roles-design.md`

## Global Constraints

- Role values exactly: `'admin' | 'jhs_coord' | 'shs_coord' | 'glc'`. Labels exactly: "Administrator", "JHS Academic Coordinator", "SHS Academic Coordinator", "Grade N Coordinator" (glc, N = its grade); the role-picker label for `glc` is "Grade Level Coordinator".
- Grade scope: `admin` = all (7–12); `jhs_coord` = 7, 8, 9, 10; `shs_coord` = 11, 12; `glc` = exactly one `gradeLevel` in 7–12.
- Legacy rule: `role` missing, `null`, `''`, or `'registrar'` ⇒ admin. Any other unknown value ⇒ no access.
- `gradeLevel` is an integer 7–12 iff `role == 'glc'`, else `null`.
- Temporary/new passwords: generated with the existing `randomBytes(18).toString('base64url')` generator; user-chosen passwords: 10–128 characters.
- Every account action writes one `audit_log` entry via the existing `audit()` helper; never log passwords.
- Coordinators: pages `dashboard`, `students`, `sections`, `schedules`, `attendance` only; view-only except attendance save and SF2 export.
- User-facing messages (exact): "An account with this email already exists." · "At least one active Administrator is required." · "Grade level is required for a Grade Level Coordinator." · "This account has been disabled. Contact an administrator." · "This account has no staff profile yet. Ask an administrator to add one."
- Match surrounding code style: terse JSX with inline styles from `src/styles.js` (`T`, `S`), components from `src/components/ui.jsx`, comment density like neighbors.
- Work in the worktree; never use bare `git stash`. Each commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Commands

| What | Command (repo root) | Needs |
|---|---|---|
| App + shared unit tests | `npm test` | nothing |
| Functions unit tests | `npm --prefix functions test` | nothing (runs `syncShared` first) |
| Functions emulator tests | `npm run test:functions` | Java + firebase-tools (emulators) |
| Rules tests | `npm run test:rules` | Java + firebase-tools (emulators) |
| Build | `npm run build` | nothing |

`functions/shared/` is a gitignored copy of `shared/`, refreshed by `node scripts/syncShared.mjs` (the functions test/deploy scripts run it automatically). Functions code imports shared code as `../../shared/<file>.js` from `functions/src/handlers/` and `../shared/<file>.js` from `functions/src/`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `shared/staffRoles.js` | Create | Role constants, `roleOf`, `scopedGrades`, `roleLabel` — the single role→grade mapping |
| `shared/staffRoles.test.js` | Create | Unit tests for the above |
| `functions/src/lib/password.js` | Create | `generatePassword()` (moved out of kiosks.js) |
| `functions/src/handlers/kiosks.js` | Modify | Import `generatePassword` from lib |
| `functions/src/callable.js` | Modify | `staffIdentity` rejects disabled/unknown-role profiles; new `adminIdentity` |
| `functions/src/callable.test.js` | Create | Unit tests for identity checks |
| `functions/src/handlers/users.js` | Create | Six account callables + validation + safeguards |
| `functions/src/handlers/users.test.js` | Create | Unit tests: validation helpers, create rollback |
| `functions/test/emulator/users.test.js` | Create | Emulator tests for the six callables |
| `functions/index.js` | Modify | `adminCall` wrapper; existing staff callables → admin; export new callables |
| `functions/src/lib/roleBackfill.js` (+ `.test.js`) | Create | Pure patch computation for legacy profiles |
| `functions/scripts/backfillUserRoles.mjs` | Create | One-off backfill runner (dry run by default) |
| `firestore.rules` | Modify | Role helpers; admin-only writes/reads; scoped attendance writes |
| `tests/rules/helpers.js` | Modify | Coordinator/disabled identities |
| `tests/rules/roles.test.js` | Create | Role × collection rules matrix |
| `src/lib/access.js` (+ `.test.js`) | Create | Client permission decisions + `scopeRoster` |
| `src/lib/password.js` (+ `.test.js`) | Create | `passwordProblem()` for the change-password form |
| `src/lib/navigation.js` | Modify | Add `accounts` nav item |
| `src/components/NavIcon.jsx` | Modify | `accounts` icon path |
| `src/data/staffUsers.js` | Create | Callable wrappers |
| `src/components/Login.jsx` | Modify | Sign-in only; shows App-provided notice; "Staff sign-in" |
| `src/components/ChangePassword.jsx` | Create | Forced "Set a new password" screen |
| `src/components/Shell.jsx` | Modify | Filter nav by role; role label |
| `src/App.jsx` | Modify | Live profile subscription, refusal handling, page guard, `me` to pages |
| `src/pages/StudentsPage.jsx` | Modify | Scope + hide admin controls |
| `src/pages/SectionsPage.jsx`, `SectionDetailModal.jsx` | Modify | Scope + hide admin controls |
| `src/pages/SchedulesPage.jsx` | Modify | Read-only for coordinators |
| `src/pages/AttendanceTakePage.jsx`, `AttendanceSummaryPage.jsx` | Modify | Scoped section lists |
| `src/pages/DashboardPage.jsx`, `src/components/dashboard/AttentionPanel.jsx` | Modify | Scoped stats; hide enroll/unassigned for coordinators |
| `src/pages/AccountsPage.jsx` | Create | Admin account management UI |
| `README.md` | Modify | First account uses `"role": "admin"`; point to Accounts page |

---

### Task 1: Shared role module

**Files:**
- Create: `shared/staffRoles.js`
- Test: `shared/staffRoles.test.js`

**Interfaces:**
- Produces:
  - `ALL_GRADES: number[]` = `[7, 8, 9, 10, 11, 12]`
  - `ROLE_VALUES: string[]` = `['admin', 'jhs_coord', 'shs_coord', 'glc']`
  - `ROLE_LABELS: Record<role, string>` (picker labels)
  - `roleOf(profile): 'admin'|'jhs_coord'|'shs_coord'|'glc'|null`
  - `scopedGrades(profile): number[] | null` (`null` = all grades)
  - `roleLabel(profile): string`

- [ ] **Step 1: Write the failing test**

`shared/staffRoles.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { ALL_GRADES, ROLE_VALUES, ROLE_LABELS, roleOf, scopedGrades, roleLabel } from './staffRoles.js';

describe('roleOf', () => {
  it('treats pre-roles profiles as admin', () => {
    expect(roleOf({})).toBe('admin');
    expect(roleOf({ role: null })).toBe('admin');
    expect(roleOf({ role: '' })).toBe('admin');
    expect(roleOf({ role: 'registrar' })).toBe('admin');
  });
  it('returns the four known roles as-is', () => {
    for (const r of ROLE_VALUES) expect(roleOf({ role: r })).toBe(r);
  });
  it('grants nothing for a missing profile or an unknown role', () => {
    expect(roleOf(null)).toBeNull();
    expect(roleOf(undefined)).toBeNull();
    expect(roleOf({ role: 'teacher' })).toBeNull();
  });
});

describe('scopedGrades', () => {
  it('admin sees every grade (null)', () => {
    expect(scopedGrades({ role: 'admin' })).toBeNull();
    expect(scopedGrades({ role: 'registrar' })).toBeNull();
  });
  it('academic coordinators get fixed ranges', () => {
    expect(scopedGrades({ role: 'jhs_coord' })).toEqual([7, 8, 9, 10]);
    expect(scopedGrades({ role: 'shs_coord' })).toEqual([11, 12]);
  });
  it('grade level coordinator gets exactly their grade', () => {
    expect(scopedGrades({ role: 'glc', gradeLevel: 8 })).toEqual([8]);
    expect(scopedGrades({ role: 'glc', gradeLevel: '11' })).toEqual([11]);
  });
  it('glc without a valid grade, or unknown roles, see nothing', () => {
    expect(scopedGrades({ role: 'glc' })).toEqual([]);
    expect(scopedGrades({ role: 'glc', gradeLevel: 13 })).toEqual([]);
    expect(scopedGrades({ role: 'teacher' })).toEqual([]);
    expect(scopedGrades(null)).toEqual([]);
  });
});

describe('roleLabel', () => {
  it('labels each role', () => {
    expect(roleLabel({ role: 'registrar' })).toBe('Administrator');
    expect(roleLabel({ role: 'jhs_coord' })).toBe('JHS Academic Coordinator');
    expect(roleLabel({ role: 'shs_coord' })).toBe('SHS Academic Coordinator');
    expect(roleLabel({ role: 'glc', gradeLevel: 9 })).toBe('Grade 9 Coordinator');
    expect(roleLabel({ role: 'teacher' })).toBe('No role');
  });
  it('exposes picker labels and grades', () => {
    expect(ROLE_LABELS.glc).toBe('Grade Level Coordinator');
    expect(ALL_GRADES).toEqual([7, 8, 9, 10, 11, 12]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- shared/staffRoles.test.js`
Expected: FAIL — cannot resolve `./staffRoles.js`.

- [ ] **Step 3: Write minimal implementation**

`shared/staffRoles.js`:
```js
// Staff roles for SIMS accounts (spec: docs/superpowers/specs/2026-10-04-staff-accounts-and-roles-design.md).
// The only place that maps a role to the grades it may see -- firestore.rules
// mirrors scopedGrades() in coversGrade(); keep the two in step.
export const ALL_GRADES = [7, 8, 9, 10, 11, 12];
export const ROLE_VALUES = ['admin', 'jhs_coord', 'shs_coord', 'glc'];
export const ROLE_LABELS = {
  admin: 'Administrator',
  jhs_coord: 'JHS Academic Coordinator',
  shs_coord: 'SHS Academic Coordinator',
  glc: 'Grade Level Coordinator',
};
const FIXED_GRADES = { jhs_coord: [7, 8, 9, 10], shs_coord: [11, 12] };
// Profiles hand-written before roles existed: no role, or the README's 'registrar'.
const LEGACY_ADMIN = [undefined, null, '', 'registrar'];

export function roleOf(profile) {
  if (!profile) return null;
  if (LEGACY_ADMIN.includes(profile.role)) return 'admin';
  return ROLE_VALUES.includes(profile.role) ? profile.role : null;
}

// null = every grade (admin); [] = nothing.
export function scopedGrades(profile) {
  const role = roleOf(profile);
  if (role === 'admin') return null;
  if (FIXED_GRADES[role]) return FIXED_GRADES[role];
  if (role === 'glc') {
    const g = Number(profile.gradeLevel);
    return ALL_GRADES.includes(g) ? [g] : [];
  }
  return [];
}

export function roleLabel(profile) {
  const role = roleOf(profile);
  if (!role) return 'No role';
  return role === 'glc' ? `Grade ${profile.gradeLevel} Coordinator` : ROLE_LABELS[role];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- shared/staffRoles.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add shared/staffRoles.js shared/staffRoles.test.js
git commit -m "feat(roles): shared role-to-grade mapping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Server identity checks (`staffIdentity` / `adminIdentity` / `adminCall`)

**Files:**
- Create: `functions/src/lib/password.js`
- Modify: `functions/src/handlers/kiosks.js` (lines 1 and 12–14)
- Modify: `functions/src/callable.js:21-28`
- Modify: `functions/index.js:52-79`
- Test: `functions/src/callable.test.js`

**Interfaces:**
- Consumes: `roleOf` from Task 1 (as `../shared/staffRoles.js`).
- Produces:
  - `generatePassword(): string` in `functions/src/lib/password.js`
  - `staffIdentity(db, req): Promise<{ uid, email, profile }>` — throws `permission-denied` for no profile, disabled, or unknown role
  - `adminIdentity(db, req): Promise<{ uid, email, profile }>` — additionally requires `roleOf(profile) === 'admin'`
  - `adminCall` wrapper in `functions/index.js` (same shape as `staffCall`)

- [ ] **Step 1: Write the failing test**

`functions/src/callable.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { staffIdentity, adminIdentity } from './callable.js';

const req = (email = 'a@bnhs.edu') => ({ app: {}, auth: { uid: 'u1', token: { email } } });
const dbWith = (profile) => ({
  doc: () => ({ get: async () => ({ exists: profile !== undefined, data: () => profile }) }),
});

describe('staffIdentity', () => {
  it('returns the caller and their profile', async () => {
    const r = await staffIdentity(dbWith({ role: 'glc', gradeLevel: 8 }), req('A@bnhs.edu'));
    expect(r).toEqual({ uid: 'u1', email: 'a@bnhs.edu', profile: { role: 'glc', gradeLevel: 8 } });
  });
  it('refuses a missing, disabled, or unknown-role profile', async () => {
    await expect(staffIdentity(dbWith(undefined), req())).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(staffIdentity(dbWith({ role: 'admin', disabled: true }), req())).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(staffIdentity(dbWith({ role: 'teacher' }), req())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('still requires App Check and a signed-in email', async () => {
    await expect(staffIdentity(dbWith({}), { auth: req().auth })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(staffIdentity(dbWith({}), { app: {}, auth: null })).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

describe('adminIdentity', () => {
  it('accepts admins, including legacy registrar profiles', async () => {
    await expect(adminIdentity(dbWith({ role: 'admin' }), req())).resolves.toMatchObject({ email: 'a@bnhs.edu' });
    await expect(adminIdentity(dbWith({ role: 'registrar' }), req())).resolves.toMatchObject({ email: 'a@bnhs.edu' });
    await expect(adminIdentity(dbWith({}), req())).resolves.toMatchObject({ email: 'a@bnhs.edu' });
  });
  it('refuses every coordinator role', async () => {
    for (const profile of [{ role: 'jhs_coord' }, { role: 'shs_coord' }, { role: 'glc', gradeLevel: 8 }]) {
      await expect(adminIdentity(dbWith(profile), req())).rejects.toMatchObject({ code: 'permission-denied', message: 'Administrators only' });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix functions test -- src/callable.test.js`
Expected: FAIL — `adminIdentity` is not exported; `staffIdentity` result lacks `profile`.

- [ ] **Step 3: Implement**

Create `functions/src/lib/password.js`:
```js
import { randomBytes } from 'node:crypto';

// base64url avoids characters that need escaping when copy-pasted into a
// plain <input> or a terminal; 18 random bytes -> 24 chars, ~144 bits.
export const generatePassword = () => randomBytes(18).toString('base64url');
```

In `functions/src/handlers/kiosks.js`: delete line 1 (`import { randomBytes } from 'node:crypto';`) and the comment + `const generatePassword = ...` (lines 12–14), and add after the other imports:
```js
import { generatePassword } from '../lib/password.js';
```

In `functions/src/callable.js` add the import at the top:
```js
import { roleOf } from '../shared/staffRoles.js';
```
and replace the whole `staffIdentity` function with:
```js
export async function staffIdentity(db, req) {
  if (!req.app) throw new CallableError('failed-precondition', 'App Check required');
  const email = req.auth?.token?.email?.toLowerCase();
  if (!email) throw new CallableError('unauthenticated', 'Sign in required');
  const staff = await db.doc(`users/${email}`).get();
  if (!staff.exists) throw new CallableError('permission-denied', 'Staff only');
  const profile = staff.data();
  if (profile.disabled === true) throw new CallableError('permission-denied', 'This account has been disabled');
  if (!roleOf(profile)) throw new CallableError('permission-denied', 'Staff only');
  return { uid: req.auth.uid, email, profile };
}

export async function adminIdentity(db, req) {
  const identity = await staffIdentity(db, req);
  if (roleOf(identity.profile) !== 'admin') throw new CallableError('permission-denied', 'Administrators only');
  return identity;
}
```

In `functions/index.js`:
- Change the import line to `import { guardianIdentity, staffIdentity, adminIdentity, toHttpsError } from './src/callable.js';`
- After the `staffCall` definition add:
```js
// Account management and every page behind it (Guardians, Settings) is
// administrator-only; coordinators reach none of these.
const adminCall = (fn) => onCall({ enforceAppCheck: true }, async (req) => {
  try { return await fn({ ...callDeps(), ...(await adminIdentity(db, req)) }, req.data || {}); } catch (e) { throw toHttpsError(e); }
});
```
- Replace `staffCall(` with `adminCall(` on every existing export: `issueActivationCodesFn`, `revokeCodeFn`, `endSchoolYearFn`, `resolveAccessRequestFn`, `revokeLinkFn`, `setActivationRestrictedFn`, `registerKioskFn`, `deactivateKioskFn`, `provisionKioskFn`, `resetKioskPasswordFn`, `resolveReportFn`, `correctEventFn`, `addManualEventFn`. (`staffCall` stays defined; Task 3 uses it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix functions test`
Expected: PASS — the new `callable.test.js` and the existing `kiosks.test.js` (password still 24 chars).

- [ ] **Step 5: Commit**

```bash
git add functions/src/lib/password.js functions/src/handlers/kiosks.js functions/src/callable.js functions/src/callable.test.js functions/index.js
git commit -m "feat(functions): admin-only callables and disabled-profile checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Account callables (`users.js`)

**Files:**
- Create: `functions/src/handlers/users.js`
- Modify: `functions/index.js` (imports + exports)
- Test: `functions/src/handlers/users.test.js` (unit), `functions/test/emulator/users.test.js` (emulator)

**Interfaces:**
- Consumes: `generatePassword` (Task 2), `ROLE_VALUES`, `roleOf` (Task 1), `str/oneOf/int/bool` from `functions/src/lib/validators.js`, `audit` from `functions/src/audit.js`, `CallableError`.
- Handler context: `ctx = { db, auth, now, uid, email, profile }` (from `adminCall`/`staffCall`).
- Produces (handlers, all `async (ctx, data)`):
  - `createStaffUser` — data `{ name, email, role, gradeLevel? }` → `{ email, password }`
  - `updateStaffUser` — data `{ email, name?, role?, gradeLevel? }` → `{ ok: true }`
  - `setStaffUserDisabled` — data `{ email, disabled: boolean }` → `{ ok: true }`
  - `resetStaffPassword` — data `{ email }` → `{ email, password }`
  - `deleteStaffUser` — data `{ email }` → `{ ok: true }`
  - `changeOwnPassword` — data `{ newPassword }` → `{ ok: true }`
  - helpers `staffEmail(v): string`, `roleAndGrade(role, gradeLevel): { role, gradeLevel }`
- Callable names exported from `functions/index.js`: `createStaffUserFn`, `updateStaffUserFn`, `setStaffUserDisabledFn`, `resetStaffPasswordFn`, `deleteStaffUserFn` (all `adminCall`), `changeOwnPasswordFn` (`staffCall`).

- [ ] **Step 1: Write the failing unit test**

`functions/src/handlers/users.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { createStaffUser, staffEmail, roleAndGrade } from './users.js';

vi.mock('../audit.js', () => ({ audit: vi.fn() }));

describe('staffEmail', () => {
  it('trims and lowercases a valid address', () => expect(staffEmail('  Ana@BNHS.edu ')).toBe('ana@bnhs.edu'));
  it('rejects junk', () => expect(() => staffEmail('nope')).toThrow(/valid email/));
});

describe('roleAndGrade', () => {
  it('requires a 7-12 grade for glc', () => {
    expect(roleAndGrade('glc', 8)).toEqual({ role: 'glc', gradeLevel: 8 });
    expect(() => roleAndGrade('glc', null)).toThrow('Grade level is required for a Grade Level Coordinator.');
    expect(() => roleAndGrade('glc', 13)).toThrow(/between 7 and 12/);
  });
  it('forbids a grade on every other role', () => {
    expect(roleAndGrade('jhs_coord', null)).toEqual({ role: 'jhs_coord', gradeLevel: null });
    expect(() => roleAndGrade('admin', 8)).toThrow(/only to a Grade Level Coordinator/);
  });
  it('rejects unknown roles', () => expect(() => roleAndGrade('registrar', null)).toThrow(/not a valid choice/));
});

describe('createStaffUser rollback', () => {
  it('deletes the new Auth user when the profile write fails', async () => {
    const deleteUser = vi.fn().mockResolvedValue(undefined);
    const auth = { createUser: vi.fn().mockResolvedValue({ uid: 'u1' }), deleteUser };
    const db = { doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ exists: false }), create: vi.fn().mockRejectedValue(new Error('boom')) })) };
    await expect(createStaffUser({ db, auth, email: 'admin@bnhs.edu' }, { name: 'Ana Cruz', email: 'glc8@bnhs.edu', role: 'glc', gradeLevel: 8 }))
      .rejects.toThrow('boom');
    expect(deleteUser).toHaveBeenCalledWith('u1');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix functions test -- src/handlers/users.test.js`
Expected: FAIL — cannot resolve `./users.js`.

- [ ] **Step 3: Implement `functions/src/handlers/users.js`**

```js
import { FieldValue } from 'firebase-admin/firestore';
import { audit } from '../audit.js';
import { CallableError } from '../errors.js';
import { str, oneOf, int, bool } from '../lib/validators.js';
import { generatePassword } from '../lib/password.js';
import { ROLE_VALUES, roleOf } from '../../shared/staffRoles.js';

// Staff account management (spec: 2026-10-04-staff-accounts-and-roles-design.md).
// users/{email} is written only here; generated passwords are returned to the
// caller exactly once and never stored or audited.
const MIN_PASSWORD = 10;
const MAX_PASSWORD = 128;
const userRef = (db, email) => db.doc(`users/${email}`);
const failed = (message) => new CallableError('failed-precondition', message);
const duplicate = () => new CallableError('already-exists', 'An account with this email already exists.');
const now = () => FieldValue.serverTimestamp();

export function staffEmail(v) {
  const email = str(v, { name: 'Email', min: 3, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CallableError('invalid-argument', 'Email is not a valid email address');
  return email;
}

// gradeLevel is required (7-12) for a Grade Level Coordinator and must be absent otherwise.
export function roleAndGrade(role, gradeLevel) {
  oneOf(role, ROLE_VALUES, 'Role');
  if (role === 'glc') {
    if (gradeLevel == null) throw new CallableError('invalid-argument', 'Grade level is required for a Grade Level Coordinator.');
    return { role, gradeLevel: int(gradeLevel, { name: 'Grade level', min: 7, max: 12 }) };
  }
  if (gradeLevel != null) throw new CallableError('invalid-argument', 'Grade level applies only to a Grade Level Coordinator.');
  return { role, gradeLevel: null };
}

async function loadTarget(tx, db, email) {
  const snap = await tx.get(userRef(db, email));
  if (!snap.exists) throw new CallableError('not-found', 'No such account.');
  return snap.data();
}

// Read in the same transaction as the write, so two admins demoting/disabling/
// deleting each other at once cannot both succeed. `next` is the target's
// profile after the change (null when deleting).
async function assertAdminRemains(tx, db, email, next) {
  const all = await tx.get(db.collection('users'));
  const active = all.docs.filter((d) => {
    const p = d.id === email ? next : d.data();
    return p && roleOf(p) === 'admin' && p.disabled !== true;
  });
  if (active.length === 0) throw failed('At least one active Administrator is required.');
}

// Profiles hand-made before this feature have no uid; fall back to the Auth email.
async function uidFor(auth, email, profile) {
  if (profile?.uid) return profile.uid;
  try { return (await auth.getUserByEmail(email)).uid; }
  catch (e) { if (e.code === 'auth/user-not-found') return null; throw e; }
}

const staffAudit = (db, action, actor, target, details = {}) =>
  audit(db, { action, actorType: 'staff', actorUid: actor, targetType: 'staff', targetId: target, details });

export async function createStaffUser(ctx, data) {
  const { db, auth, email: actor } = ctx;
  const name = str(data.name, { name: 'Name', min: 2, max: 80 });
  const email = staffEmail(data.email);
  const { role, gradeLevel } = roleAndGrade(data.role, data.gradeLevel);
  if ((await userRef(db, email).get()).exists) throw duplicate();
  const password = generatePassword();
  let user;
  try { user = await auth.createUser({ email, password, displayName: name }); }
  catch (e) { if (e.code === 'auth/email-already-exists') throw duplicate(); throw e; }
  try {
    await userRef(db, email).create({
      name, role, gradeLevel, disabled: false, mustChangePassword: true, uid: user.uid,
      createdBy: actor, createdAt: now(), updatedAt: now(),
    });
  } catch (e) {
    // Never leave a login behind without its profile.
    await auth.deleteUser(user.uid).catch(() => {});
    throw e;
  }
  await staffAudit(db, 'staff.created', actor, email, { role, gradeLevel });
  return { email, password };
}

export async function updateStaffUser(ctx, data) {
  const { db, email: actor } = ctx;
  const email = staffEmail(data.email);
  const name = data.name === undefined ? null : str(data.name, { name: 'Name', min: 2, max: 80 });
  const change = await db.runTransaction(async (tx) => {
    const current = await loadTarget(tx, db, email);
    const fromRole = roleOf(current);
    const nextRole = data.role === undefined ? fromRole : data.role;
    const gradeIn = 'gradeLevel' in data ? data.gradeLevel : (nextRole === 'glc' ? current.gradeLevel : null);
    const { role, gradeLevel } = roleAndGrade(nextRole, gradeIn);
    if (email === actor && role !== fromRole) throw failed("You can't change the role of your own account.");
    if (fromRole === 'admin' && role !== 'admin') await assertAdminRemains(tx, db, email, { ...current, role });
    tx.update(userRef(db, email), { role, gradeLevel, ...(name ? { name } : {}), updatedAt: now() });
    return { from: { role: fromRole, gradeLevel: current.gradeLevel ?? null }, to: { role, gradeLevel } };
  });
  await staffAudit(db, 'staff.updated', actor, email, change);
  return { ok: true };
}

export async function setStaffUserDisabled(ctx, data) {
  const { db, auth, email: actor } = ctx;
  const email = staffEmail(data.email);
  const disabled = bool(data.disabled, 'disabled');
  if (email === actor && disabled) throw failed("You can't disable your own account.");
  const profile = await db.runTransaction(async (tx) => {
    const current = await loadTarget(tx, db, email);
    if (disabled) await assertAdminRemains(tx, db, email, { ...current, disabled: true });
    tx.update(userRef(db, email), { disabled, updatedAt: now() });
    return current;
  });
  const uid = await uidFor(auth, email, profile);
  if (uid) {
    await auth.updateUser(uid, { disabled });
    if (disabled) await auth.revokeRefreshTokens(uid);
  }
  await staffAudit(db, disabled ? 'staff.disabled' : 'staff.enabled', actor, email);
  return { ok: true };
}

export async function resetStaffPassword(ctx, data) {
  const { db, auth, email: actor } = ctx;
  const email = staffEmail(data.email);
  if (email === actor) throw failed("You can't reset your own password here.");
  const snap = await userRef(db, email).get();
  if (!snap.exists) throw new CallableError('not-found', 'No such account.');
  const uid = await uidFor(auth, email, snap.data());
  if (!uid) throw new CallableError('not-found', 'This account has no sign-in. Delete it and create it again.');
  const password = generatePassword();
  await auth.updateUser(uid, { password });
  await auth.revokeRefreshTokens(uid);
  await userRef(db, email).update({ mustChangePassword: true, uid, updatedAt: now() });
  await staffAudit(db, 'staff.password_reset', actor, email);
  return { email, password };
}

export async function deleteStaffUser(ctx, data) {
  const { db, auth, email: actor } = ctx;
  const email = staffEmail(data.email);
  if (email === actor) throw failed("You can't delete your own account.");
  const profile = await db.runTransaction(async (tx) => {
    const current = await loadTarget(tx, db, email);
    await assertAdminRemains(tx, db, email, null);
    tx.delete(userRef(db, email));
    return current;
  });
  // The profile is already gone, so a leftover login is refused everywhere.
  const uid = await uidFor(auth, email, profile);
  if (uid) await auth.deleteUser(uid).catch((e) => { if (e.code !== 'auth/user-not-found') throw e; });
  await staffAudit(db, 'staff.deleted', actor, email, { role: roleOf(profile) });
  return { ok: true };
}

export async function changeOwnPassword(ctx, data) {
  const { db, auth, uid, email } = ctx;
  const pw = data.newPassword;
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD || pw.length > MAX_PASSWORD) {
    throw new CallableError('invalid-argument', `Password must be ${MIN_PASSWORD} to ${MAX_PASSWORD} characters.`);
  }
  await auth.updateUser(uid, { password: pw });
  await userRef(db, email).update({ mustChangePassword: false, uid, updatedAt: now() });
  await staffAudit(db, 'staff.password_changed', email, email);
  return { ok: true };
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npm --prefix functions test -- src/handlers/users.test.js`
Expected: PASS.

- [ ] **Step 5: Write the emulator tests**

`functions/test/emulator/users.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { db, auth, clearAll, clearAllAuthUsers } from './helpers.js';
import { createStaffUser, updateStaffUser, setStaffUserDisabled, resetStaffPassword, deleteStaffUser, changeOwnPassword } from '../../src/handlers/users.js';

const ADMIN = 'registrar@bnhs.edu';
const ctx = (email = ADMIN, uid = 'adminUid') => ({ db: db(), auth: auth(), email, uid });
const profile = async (email) => (await db().doc(`users/${email}`).get()).data();
const auditActions = async () => (await db().collection('audit_log').get()).docs.map((d) => d.data().action);
const glc8 = { name: 'Ana Cruz', email: 'Glc8@bnhs.edu', role: 'glc', gradeLevel: 8 };

beforeEach(async () => {
  await clearAll(); await clearAllAuthUsers();
  // Legacy hand-made profile: role 'registrar', no uid.
  await db().doc(`users/${ADMIN}`).set({ name: 'Registrar', role: 'registrar' });
});

describe('createStaffUser', () => {
  it('creates the login and profile and returns the password once', async () => {
    const r = await createStaffUser(ctx(), glc8);
    expect(r.email).toBe('glc8@bnhs.edu');
    expect(r.password).toHaveLength(24);
    const user = await auth().getUserByEmail('glc8@bnhs.edu');
    expect(user.displayName).toBe('Ana Cruz');
    expect(await profile('glc8@bnhs.edu')).toMatchObject({ name: 'Ana Cruz', role: 'glc', gradeLevel: 8, disabled: false, mustChangePassword: true, uid: user.uid, createdBy: ADMIN });
    const log = (await db().collection('audit_log').get()).docs.map((d) => d.data());
    expect(log).toEqual([expect.objectContaining({ action: 'staff.created', actorUid: ADMIN, targetId: 'glc8@bnhs.edu', details: { role: 'glc', gradeLevel: 8 } })]);
    expect(JSON.stringify(log)).not.toContain(r.password);
  });
  it('creates academic coordinators without a grade', async () => {
    await createStaffUser(ctx(), { name: 'Ben Dy', email: 'jhs@bnhs.edu', role: 'jhs_coord' });
    expect(await profile('jhs@bnhs.edu')).toMatchObject({ role: 'jhs_coord', gradeLevel: null });
  });
  it('rejects duplicates and bad role/grade combinations', async () => {
    await expect(createStaffUser(ctx(), { ...glc8, email: ADMIN })).rejects.toMatchObject({ code: 'already-exists' });
    await createStaffUser(ctx(), glc8);
    await expect(createStaffUser(ctx(), glc8)).rejects.toMatchObject({ code: 'already-exists', message: 'An account with this email already exists.' });
    await expect(createStaffUser(ctx(), { ...glc8, email: 'x@bnhs.edu', gradeLevel: undefined })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(createStaffUser(ctx(), { ...glc8, email: 'y@bnhs.edu', role: 'shs_coord' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('updateStaffUser', () => {
  beforeEach(async () => { await createStaffUser(ctx(), glc8); });
  it('moves a glc to another grade', async () => {
    await updateStaffUser(ctx(), { email: 'glc8@bnhs.edu', gradeLevel: 9 });
    expect(await profile('glc8@bnhs.edu')).toMatchObject({ role: 'glc', gradeLevel: 9 });
  });
  it('clears the grade when the role changes away from glc', async () => {
    await updateStaffUser(ctx(), { email: 'glc8@bnhs.edu', role: 'shs_coord' });
    expect(await profile('glc8@bnhs.edu')).toMatchObject({ role: 'shs_coord', gradeLevel: null });
    expect(await auditActions()).toContain('staff.updated');
  });
  it('lets an admin rename but not re-role themselves', async () => {
    await updateStaffUser(ctx(), { email: ADMIN, name: 'Head Registrar' });
    expect(await profile(ADMIN)).toMatchObject({ name: 'Head Registrar', role: 'admin' });
    await expect(updateStaffUser(ctx(), { email: ADMIN, role: 'jhs_coord' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('refuses to demote the last active admin', async () => {
    // A caller who has since lost admin (the race the transaction guards).
    await expect(updateStaffUser(ctx('ghost@bnhs.edu'), { email: ADMIN, role: 'jhs_coord' }))
      .rejects.toMatchObject({ code: 'failed-precondition', message: 'At least one active Administrator is required.' });
  });
});

describe('setStaffUserDisabled', () => {
  beforeEach(async () => { await createStaffUser(ctx(), glc8); });
  it('disables and re-enables both the login and the profile', async () => {
    await setStaffUserDisabled(ctx(), { email: 'glc8@bnhs.edu', disabled: true });
    expect((await auth().getUserByEmail('glc8@bnhs.edu')).disabled).toBe(true);
    expect((await profile('glc8@bnhs.edu')).disabled).toBe(true);
    await setStaffUserDisabled(ctx(), { email: 'glc8@bnhs.edu', disabled: false });
    expect((await auth().getUserByEmail('glc8@bnhs.edu')).disabled).toBe(false);
    expect(await auditActions()).toEqual(expect.arrayContaining(['staff.disabled', 'staff.enabled']));
  });
  it('refuses self-disable and disabling the last admin', async () => {
    await expect(setStaffUserDisabled(ctx(), { email: ADMIN, disabled: true })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(setStaffUserDisabled(ctx('ghost@bnhs.edu'), { email: ADMIN, disabled: true })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('resetStaffPassword / changeOwnPassword', () => {
  it('issues a new password, forces a change, and the change clears the flag', async () => {
    const created = await createStaffUser(ctx(), glc8);
    const uid = (await auth().getUserByEmail('glc8@bnhs.edu')).uid;
    await changeOwnPassword({ ...ctx('glc8@bnhs.edu', uid) }, { newPassword: 'a-new-password' });
    expect((await profile('glc8@bnhs.edu')).mustChangePassword).toBe(false);
    const reset = await resetStaffPassword(ctx(), { email: 'glc8@bnhs.edu' });
    expect(reset.password).not.toBe(created.password);
    expect((await profile('glc8@bnhs.edu')).mustChangePassword).toBe(true);
    expect(await auditActions()).toEqual(expect.arrayContaining(['staff.password_changed', 'staff.password_reset']));
  });
  it('refuses a self reset and a short new password', async () => {
    await expect(resetStaffPassword(ctx(), { email: ADMIN })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(changeOwnPassword(ctx(), { newPassword: 'short' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('deleteStaffUser', () => {
  it('removes the profile and the login, keeping the audit trail', async () => {
    await createStaffUser(ctx(), glc8);
    await deleteStaffUser(ctx(), { email: 'glc8@bnhs.edu' });
    expect((await db().doc('users/glc8@bnhs.edu').get()).exists).toBe(false);
    await expect(auth().getUserByEmail('glc8@bnhs.edu')).rejects.toMatchObject({ code: 'auth/user-not-found' });
    expect(await auditActions()).toEqual(expect.arrayContaining(['staff.created', 'staff.deleted']));
  });
  it('deletes a legacy profile that has no login', async () => {
    await db().doc('users/old@bnhs.edu').set({ name: 'Old', role: 'registrar' });
    await deleteStaffUser(ctx(), { email: 'old@bnhs.edu' });
    expect((await db().doc('users/old@bnhs.edu').get()).exists).toBe(false);
  });
  it('refuses self-delete and deleting the last admin', async () => {
    await expect(deleteStaffUser(ctx(), { email: ADMIN })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(deleteStaffUser(ctx('ghost@bnhs.edu'), { email: ADMIN })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
```

- [ ] **Step 6: Run the emulator tests**

Run: `npm run test:functions`
Expected: PASS — the new `users.test.js` and all existing emulator suites. If Java/emulators are unavailable on this machine, report that and continue; do not claim a pass.

- [ ] **Step 7: Export the callables**

In `functions/index.js` add the import:
```js
import { createStaffUser, updateStaffUser, setStaffUserDisabled, resetStaffPassword, deleteStaffUser, changeOwnPassword } from './src/handlers/users.js';
```
and after the existing exports (before `jobDeps`):
```js
export const createStaffUserFn = adminCall(createStaffUser);
export const updateStaffUserFn = adminCall(updateStaffUser);
export const setStaffUserDisabledFn = adminCall(setStaffUserDisabled);
export const resetStaffPasswordFn = adminCall(resetStaffPassword);
export const deleteStaffUserFn = adminCall(deleteStaffUser);
// Any active staff member, including one still on a temporary password.
export const changeOwnPasswordFn = staffCall(changeOwnPassword);
```

Run: `node -e "import('./functions/index.js').then(m => console.log(Object.keys(m).filter(k => k.includes('Staff') || k.includes('OwnPassword'))))"` from the repo root after `node scripts/syncShared.mjs`.
Expected: prints the six new export names. (If importing `index.js` fails only because no Firebase project/credentials are configured, instead confirm with `npm --prefix functions test` that nothing regressed.)

- [ ] **Step 8: Commit**

```bash
git add functions/src/handlers/users.js functions/src/handlers/users.test.js functions/test/emulator/users.test.js functions/index.js
git commit -m "feat(functions): admin callables to create and manage staff accounts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Firestore rules

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/rules/helpers.js` (add identities)
- Test: `tests/rules/roles.test.js`

**Interfaces:**
- Consumes: role semantics from Global Constraints (rules cannot import JS).
- Produces: rules helpers `profile()`, `isStaff()`, `role()`, `isAdmin()`, `coversGrade(g)`, `coversSection(id)`, `coordinatorMayWriteAttendance()`.

- [ ] **Step 1: Add test identities**

Append to `tests/rules/helpers.js` (after `ANON`):
```js
// Staff roles (spec 2026-10-04). Profiles are seeded per test in roles.test.js.
export const ADMIN_NEW = { uid: 'adm2', token: { email: 'admin2@bnhs.edu', email_verified: false, firebase: password } };
export const JHS = { uid: 'jhs1', token: { email: 'jhs@bnhs.edu', email_verified: false, firebase: password } };
export const SHS = { uid: 'shs1', token: { email: 'shs@bnhs.edu', email_verified: false, firebase: password } };
export const GLC8 = { uid: 'glc8', token: { email: 'glc8@bnhs.edu', email_verified: false, firebase: password } };
export const DISABLED_ADMIN = { uid: 'off1', token: { email: 'off@bnhs.edu', email_verified: false, firebase: password } };
```

- [ ] **Step 2: Write the failing rules test**

`tests/rules/roles.test.js`:
```js
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { setup, seed, seedBaseline, as, ok, denied, STAFF, ADMIN_NEW, JHS, SHS, GLC8, DISABLED_ADMIN } from './helpers.js';

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await seedBaseline(env);
  await seed(env, async (db) => {
    await db.doc('users/admin2@bnhs.edu').set({ name: 'Admin Two', role: 'admin', gradeLevel: null, disabled: false });
    await db.doc('users/jhs@bnhs.edu').set({ name: 'JHS', role: 'jhs_coord', gradeLevel: null, disabled: false });
    await db.doc('users/shs@bnhs.edu').set({ name: 'SHS', role: 'shs_coord', gradeLevel: null, disabled: false });
    await db.doc('users/glc8@bnhs.edu').set({ name: 'G8', role: 'glc', gradeLevel: 8, disabled: false });
    await db.doc('users/off@bnhs.edu').set({ name: 'Off', role: 'admin', gradeLevel: null, disabled: true });
    await db.doc('sections/SEC8').set({ name: 'Mabini', gradeLevel: 8, schoolYear: '2026-2027' });
    await db.doc('sections/SEC11').set({ name: 'Luna', gradeLevel: 11, schoolYear: '2026-2027' });
  });
});

const COORDS = [['jhs', JHS], ['shs', SHS], ['glc8', GLC8]];
const att = (sectionId) => ({ sectionId, date: '2026-09-21', schoolYear: '2026-2027', marks: { S1: 'A' } });

describe('administrators', () => {
  it('legacy registrar and role admin both write roster data', async () => {
    await ok(as(env, STAFF).doc('students/S3').set({ lrn: '100000000003' }));
    await ok(as(env, ADMIN_NEW).doc('sections/SEC9').set({ name: 'X', gradeLevel: 9, schoolYear: '2026-2027' }));
    await ok(as(env, ADMIN_NEW).collection('audit_log').get());
    await ok(as(env, ADMIN_NEW).collection('users').get());
  });
  it('a disabled admin is refused', async () => {
    await denied(as(env, DISABLED_ADMIN).doc('students/S3').set({ lrn: '100000000003' }));
    await denied(as(env, DISABLED_ADMIN).collection('audit_log').get());
  });
});

describe('coordinators', () => {
  for (const [name, who] of COORDS) {
    it(`${name}: cannot change roster, schedules, or settings`, async () => {
      const db = as(env, who);
      await denied(db.doc('students/S3').set({ lrn: '100000000003' }));
      await denied(db.doc('sections/SEC8').update({ name: 'Renamed' }));
      await denied(db.doc('enrollments/S2_2026-2027').set({ studentId: 'S2', sectionId: 'SEC8', schoolYear: '2026-2027', status: 'enrolled' }));
      await denied(db.doc('schedules/SCH1').set({ name: 'AM', timeIn: '07:00', timeOut: '12:00' }));
      await denied(db.doc('settings/app').set({ schoolName: 'x' }, { merge: true }));
      await denied(db.doc('settings/parent_portal').set({ notificationsPaused: true }, { merge: true }));
    });
    it(`${name}: cannot read admin-only data or other profiles, can read own profile`, async () => {
      const db = as(env, who);
      for (const col of ['guardians', 'guardian_links', 'audit_log', 'kiosks', 'scan_events', 'activation_codes', 'access_requests', 'reports', 'learners', 'users']) {
        await denied(db.collection(col).get());
      }
      await denied(db.doc('users/registrar@bnhs.edu').get());
      await ok(db.doc(`users/${who.token.email}`).get());
    });
    it(`${name}: still reads roster collections (UI scopes them until the kiosk TEMP is removed)`, async () => {
      await ok(as(env, who).collection('students').get());
      await ok(as(env, who).collection('student_attendance').get());
    });
  }
  it('take attendance for sections in their grades', async () => {
    await ok(as(env, GLC8).doc('student_attendance/SEC8_2026-09-21').set(att('SEC8'), { merge: true }));
    await ok(as(env, JHS).doc('student_attendance/SEC8_2026-09-22').set({ ...att('SEC8'), date: '2026-09-22' }, { merge: true }));
    await ok(as(env, SHS).doc('student_attendance/SEC11_2026-09-21').set(att('SEC11'), { merge: true }));
  });
  // TODO(K1/K2): the TEMP(kiosk-v1-compat) `|| signedIn()` on student_attendance
  // lets every signed-in caller write today, so these cannot fail yet.
  // Un-skip when that clause is removed from firestore.rules.
  it.skip('cannot take attendance outside their grades', async () => {
    await denied(as(env, GLC8).doc('student_attendance/SEC11_2026-09-21').set(att('SEC11'), { merge: true }));
    await denied(as(env, SHS).doc('student_attendance/SEC8_2026-09-21').set(att('SEC8'), { merge: true }));
    await seed(env, (db) => db.doc('student_attendance/SEC8_2026-09-23').set({ ...att('SEC8'), date: '2026-09-23' }));
    await denied(as(env, GLC8).doc('student_attendance/SEC8_2026-09-23').set({ sectionId: 'SEC11' }, { merge: true }));
  });
});
```

- [ ] **Step 3: Run the rules tests to verify they fail**

Run: `npm run test:rules`
Expected: FAIL in `roles.test.js` — coordinators can still write students/sections and read audit_log (current rules treat every profile as staff). If emulators are unavailable on this machine, report that and continue.

- [ ] **Step 4: Update `firestore.rules`**

Replace the `isStaff()` function (and its comment) with:
```
    // Staff = has an enabled users/{email} profile. Written only by the
    // account callables (functions/src/handlers/users.js).
    function profile() { return get(/databases/$(database)/documents/users/$(request.auth.token.email.lower())).data; }
    function isStaff() {
      return signedIn() && request.auth.token.email != null
        && exists(/databases/$(database)/documents/users/$(request.auth.token.email.lower()))
        && profile().get('disabled', false) != true;
    }
    // Mirrors shared/staffRoles.js -- keep the two in step. Profiles made
    // before roles existed (no role, or 'registrar') are administrators.
    function role() { return profile().get('role', 'admin'); }
    function isAdmin() { return isStaff() && (role() == null || role() in ['admin', 'registrar', '']); }
    function coversGrade(g) {
      return isAdmin()
        || (isStaff() && role() == 'jhs_coord' && g in [7, 8, 9, 10])
        || (isStaff() && role() == 'shs_coord' && g in [11, 12])
        || (isStaff() && role() == 'glc' && g == profile().gradeLevel);
    }
    function coversSection(sectionId) {
      return coversGrade(get(/databases/$(database)/documents/sections/$(sectionId)).data.gradeLevel);
    }
    // On update both the old and new section must be in scope, so a
    // coordinator can't move a record into or out of their grades.
    function coordinatorMayWriteAttendance() {
      return isStaff() && request.resource != null
        && coversSection(request.resource.data.sectionId)
        && (resource == null || coversSection(resource.data.sectionId));
    }
```

Then change these lines:

| Find | Replace with |
|---|---|
| `allow write: if isStaff(); }` on `students`, `enrollments`, `sections`, `schedules`, `settings/app` (5 lines) | `allow write: if isAdmin(); }` |
| `match /settings/parent_portal { allow read: if notAnonymous(); allow write: if isStaff(); }` | `match /settings/parent_portal { allow read: if notAnonymous(); allow write: if isAdmin(); }` |
| `match /users/{id}       { allow read: if isStaff(); allow write: if false; }` | `match /users/{id}       { allow read: if isAdmin() \|\| (signedIn() && request.auth.token.email != null && id == request.auth.token.email.lower()); allow write: if false; }` |
| in `student_attendance`: `allow write: if isStaff()` | `allow write: if isAdmin() \|\| coordinatorMayWriteAttendance()` |
| in `kiosks`: `allow read: if isStaff() \|\| (own(uid) ...` | `allow read: if isAdmin() \|\| (own(uid) ...` |
| in `scan_events`: `allow read: if isStaff();` | `allow read: if isAdmin();` |
| in `learners` and `learners/events`: every `isStaff()` | `isAdmin()` |
| in `guardians`: `allow read: if own(uid) \|\| isStaff();` | `allow read: if own(uid) \|\| isAdmin();` |
| in `guardian_links`, `access_requests`, `reports`: every `isStaff()` | `isAdmin()` |
| `activation_codes` / `audit_log`: `allow read: if isStaff();` | `allow read: if isAdmin();` |

Leave every roster **read** clause (`isStaff() || isKiosk() || signedIn()`) unchanged. In the big `TEMP(kiosk-v1-compat)` comment above the roster block, append:
```
    // Staff roles (2026-10-04): coordinators' read scoping of these
    // collections is UI-only for now. Closing it server-side also needs
    // gradeLevel denormalized onto learner docs and the pages switched to
    // where('gradeLevel','in',...) queries -- see the staff-roles spec.
    // Un-skip the TODO(K1/K2) case in tests/rules/roles.test.js then.
```

- [ ] **Step 5: Run the rules tests**

Run: `npm run test:rules`
Expected: PASS — `roles.test.js` (1 skipped), `existing.test.js`, `parent.test.js`, `scanEvents.test.js`. The baseline `STAFF` identity is a legacy `'registrar'` profile, so existing staff assertions still hold.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules tests/rules/helpers.js tests/rules/roles.test.js
git commit -m "feat(rules): admin-only writes and grade-scoped attendance for coordinators

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client permission module + nav item

**Files:**
- Create: `src/lib/access.js`, `src/lib/password.js`
- Modify: `src/lib/navigation.js`, `src/components/NavIcon.jsx`
- Test: `src/lib/access.test.js`, `src/lib/password.test.js`

**Interfaces:**
- Consumes: `roleOf`, `scopedGrades`, `ALL_GRADES` (Task 1) via `../../shared/staffRoles.js`; `NAV_ITEMS`.
- Produces:
  - `isAdmin(me): boolean`
  - `grades(me): number[] | null`
  - `allowedPages(me): string[]`, `canOpen(me, page): boolean`
  - `gradeOptions(me): number[]` (scoped grades, or `ALL_GRADES` for admin)
  - `singleGrade(me): number | null`
  - `profileRefusal(profile): string | null`, `DISABLED_MESSAGE: string`
  - `scopeRoster({ sections?, enrollments?, students?, attendance? }, scope, schoolYear) → { sections, enrollments, students, attendance }`
  - `passwordProblem(pw, confirm): string | null`, `MIN_PASSWORD = 10`
  - nav item `{ key: 'accounts', label: 'Accounts', icon: 'accounts' }`

- [ ] **Step 1: Write the failing tests**

`src/lib/access.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { isAdmin, allowedPages, canOpen, gradeOptions, singleGrade, profileRefusal, scopeRoster } from './access.js';

const admin = { role: 'registrar' }, jhs = { role: 'jhs_coord' }, glc8 = { role: 'glc', gradeLevel: 8 };

describe('pages', () => {
  it('admins open everything including Accounts', () => {
    expect(isAdmin(admin)).toBe(true);
    expect(allowedPages(admin)).toEqual(expect.arrayContaining(['dashboard', 'enroll', 'guardians', 'settings', 'accounts']));
  });
  it('coordinators open only the five shared pages', () => {
    expect(allowedPages(jhs)).toEqual(['dashboard', 'students', 'sections', 'schedules', 'attendance']);
    expect(canOpen(glc8, 'attendance')).toBe(true);
    expect(canOpen(glc8, 'enroll')).toBe(false);
    expect(canOpen({ role: 'teacher' }, 'dashboard')).toBe(false);
  });
});

describe('grade controls', () => {
  it('lists scoped grades and detects a single grade', () => {
    expect(gradeOptions(admin)).toEqual([7, 8, 9, 10, 11, 12]);
    expect(gradeOptions(jhs)).toEqual([7, 8, 9, 10]);
    expect(singleGrade(glc8)).toBe(8);
    expect(singleGrade(jhs)).toBeNull();
    expect(singleGrade(admin)).toBeNull();
  });
});

describe('profileRefusal', () => {
  it('explains why a signed-in user cannot enter', () => {
    expect(profileRefusal(null)).toBe('This account has no staff profile yet. Ask an administrator to add one.');
    expect(profileRefusal({ role: 'admin', disabled: true })).toBe('This account has been disabled. Contact an administrator.');
    expect(profileRefusal({ role: 'teacher' })).toMatch(/no valid role/);
    expect(profileRefusal(glc8)).toBeNull();
  });
});

describe('scopeRoster', () => {
  const SY = '2026-2027';
  const data = {
    sections: [{ id: 'A', gradeLevel: 8 }, { id: 'B', gradeLevel: 11 }],
    enrollments: [
      { studentId: 's1', sectionId: 'A', gradeLevel: 8, schoolYear: SY, status: 'enrolled' },
      { studentId: 's2', sectionId: 'B', gradeLevel: 11, schoolYear: SY, status: 'enrolled' },
      { studentId: 's3', sectionId: 'A', gradeLevel: 8, schoolYear: '2025-2026', status: 'enrolled' },
    ],
    students: [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }],
    attendance: [{ id: 'A_d', sectionId: 'A' }, { id: 'B_d', sectionId: 'B' }],
  };
  it('is the identity for admins', () => {
    expect(scopeRoster(data, null, SY)).toEqual(data);
  });
  it('keeps only in-grade sections, enrollments, current learners, and attendance', () => {
    const r = scopeRoster(data, [8], SY);
    expect(r.sections.map((s) => s.id)).toEqual(['A']);
    expect(r.enrollments.map((e) => e.studentId)).toEqual(['s1', 's3']);
    expect(r.students.map((s) => s.id)).toEqual(['s1']); // s3 not enrolled this year; s4 unassigned
    expect(r.attendance.map((d) => d.id)).toEqual(['A_d']);
  });
  it('defaults missing collections to empty', () => {
    expect(scopeRoster({ sections: data.sections }, [11], SY)).toEqual({ sections: [data.sections[1]], enrollments: [], students: [], attendance: [] });
  });
});
```

`src/lib/password.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { passwordProblem } from './password.js';

describe('passwordProblem', () => {
  it('accepts matching passwords of 10+ characters', () => expect(passwordProblem('abcdefghij', 'abcdefghij')).toBeNull());
  it('explains what is wrong', () => {
    expect(passwordProblem('short', 'short')).toBe('Use at least 10 characters.');
    expect(passwordProblem('x'.repeat(129), 'x'.repeat(129))).toBe('Use at most 128 characters.');
    expect(passwordProblem('abcdefghij', 'abcdefghik')).toBe('The two passwords do not match.');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/lib/access.test.js src/lib/password.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/lib/navigation.js` — add the last item:
```js
  { key: 'accounts', label: 'Accounts', icon: 'accounts' },
```

`src/components/NavIcon.jsx` — add to `paths` after `settings`:
```js
  accounts: 'M10 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M3 21v-1a7 7 0 0 1 10.5-6 M18 14v6 M15 17h6',
```

`src/lib/access.js`:
```js
import { roleOf, scopedGrades, ALL_GRADES } from '../../shared/staffRoles.js';
import { NAV_ITEMS } from './navigation.js';

// Every page/permission decision the SIMS app makes about the signed-in staff
// member. Pages ask here; nothing else compares role strings.
const COORDINATOR_PAGES = ['dashboard', 'students', 'sections', 'schedules', 'attendance'];
export const DISABLED_MESSAGE = 'This account has been disabled. Contact an administrator.';

export const isAdmin = (me) => roleOf(me) === 'admin';
export const grades = (me) => scopedGrades(me);
export function allowedPages(me) {
  if (!roleOf(me)) return [];
  return isAdmin(me) ? NAV_ITEMS.map((item) => item.key) : COORDINATOR_PAGES;
}
export const canOpen = (me, page) => allowedPages(me).includes(page);
export const gradeOptions = (me) => grades(me) ?? ALL_GRADES;
export function singleGrade(me) {
  const g = grades(me);
  return g && g.length === 1 ? g[0] : null;
}

export function profileRefusal(profile) {
  if (!profile) return 'This account has no staff profile yet. Ask an administrator to add one.';
  if (profile.disabled === true) return DISABLED_MESSAGE;
  if (!roleOf(profile)) return 'This account has no valid role. Ask an administrator to fix it.';
  return null;
}

// Narrows already-loaded collections to a coordinator's grades; identity for
// admins (scope null). Learners count as in scope only through a current
// enrolled enrollment, so unassigned learners never reach coordinators.
export function scopeRoster({ sections = [], enrollments = [], students = [], attendance = [] }, scope, schoolYear) {
  if (scope == null) return { sections, enrollments, students, attendance };
  const inScope = (g) => scope.includes(Number(g));
  const scopedSections = sections.filter((s) => inScope(s.gradeLevel));
  const sectionIds = new Set(scopedSections.map((s) => s.id));
  const scopedEnrollments = enrollments.filter((e) => inScope(e.gradeLevel));
  const studentIds = new Set(scopedEnrollments
    .filter((e) => e.schoolYear === schoolYear && e.status === 'enrolled')
    .map((e) => e.studentId));
  return {
    sections: scopedSections,
    enrollments: scopedEnrollments,
    students: students.filter((s) => studentIds.has(s.id)),
    attendance: attendance.filter((d) => sectionIds.has(d.sectionId)),
  };
}
```

`src/lib/password.js`:
```js
// Mirrors changeOwnPassword's limits in functions/src/handlers/users.js.
export const MIN_PASSWORD = 10;
const MAX_PASSWORD = 128;

export function passwordProblem(pw, confirm) {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (pw.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters.`;
  if (pw !== confirm) return 'The two passwords do not match.';
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — new tests plus all existing app tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/access.js src/lib/access.test.js src/lib/password.js src/lib/password.test.js src/lib/navigation.js src/components/NavIcon.jsx
git commit -m "feat(sims): client permission module and roster scoping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sign-in, forced password change, shell and routing

**Files:**
- Create: `src/data/staffUsers.js`, `src/components/ChangePassword.jsx`
- Modify: `src/components/Login.jsx`, `src/components/Shell.jsx`, `src/App.jsx`

**Interfaces:**
- Consumes: `canOpen`, `profileRefusal`, `DISABLED_MESSAGE` (Task 5); `passwordProblem`, `MIN_PASSWORD` (Task 5); `roleLabel` (Task 1); callable `changeOwnPasswordFn` (Task 3).
- Produces:
  - `staffUsers` = `{ create, update, setDisabled, resetPassword, remove, changeOwnPassword }`, each `async (data) => result`
  - `<Login notice onAttempt />`, `<ChangePassword me onLogout />`
  - `App` passes `me` to `DashboardPage`, `StudentsPage`, `SectionsPage`, `SchedulesPage`, `AttendanceTakePage`, `AttendanceSummaryPage` (those pages start using it in Tasks 7–8; an unused prop is harmless meanwhile).

- [ ] **Step 1: Callable wrappers**

`src/data/staffUsers.js`:
```js
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

const fn = (name) => async (data) => (await httpsCallable(functions, name)(data)).data;

// Every account change goes through a callable (functions/src/handlers/users.js),
// which validates, enforces the admin safeguards, and audits it.
export const staffUsers = {
  create: fn('createStaffUserFn'),
  update: fn('updateStaffUserFn'),
  setDisabled: fn('setStaffUserDisabledFn'),
  resetPassword: fn('resetStaffPasswordFn'),
  remove: fn('deleteStaffUserFn'),
  changeOwnPassword: fn('changeOwnPasswordFn'),
};
```

- [ ] **Step 2: Login — sign in only; App decides who may enter**

Replace `src/components/Login.jsx` with:
```jsx
import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase.js';
import { DISABLED_MESSAGE } from '../lib/access.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Field } from './ui.jsx';
import simsLogo from '../assets/sims-logo.png';

// Profile checks (missing, disabled, role) happen in App's live profile
// subscription, which signs the user back out and hands us `notice`.
export default function Login({ notice = '', onAttempt }) {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr(''); onAttempt?.();
    try { await signInWithEmailAndPassword(auth, email.trim(), pw); }
    catch (e) { setErr(e?.code === 'auth/user-disabled' ? DISABLED_MESSAGE : 'That email and password did not match.'); }
    setBusy(false);
  };
  const shown = err || notice;
  return (
    <div style={{ ...S.page, display: 'grid', placeItems: 'center' }}>
      <div style={{ ...S.card, width: 360 }}>
        <img src={simsLogo} alt="BNHS SIMS logo" width={40} height={40} style={{ marginBottom: 16 }} />
        <h1 style={{ fontFamily: T.display, color: T.ink, fontSize: 22, margin: '0 0 2px', fontWeight: 700 }}>BNHS SIMS</h1>
        <p style={{ fontFamily: T.body, color: T.inkMuted, fontSize: 12, marginTop: 0, marginBottom: 20 }}>Staff sign-in</p>
        {shown && <div role="alert" style={{ fontFamily: T.body, background: 'rgba(220,38,38,0.08)', color: T.absent, borderRadius: 10, padding: '9px 12px', fontSize: 12, marginBottom: 14 }}>{shown}</div>}
        <Field label="Email"><Inp type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></Field>
        <Field label="Password"><Inp type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} /></Field>
        <Btn onClick={go} disabled={busy} style={{ width: '100%', marginTop: 6, opacity: busy ? 0.6 : 1 }}>{busy ? 'Signing in…' : 'Sign in'}</Btn>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Forced password change screen**

`src/components/ChangePassword.jsx`:
```jsx
import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase.js';
import { staffUsers } from '../data/staffUsers.js';
import { passwordProblem, MIN_PASSWORD } from '../lib/password.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Field } from './ui.jsx';
import simsLogo from '../assets/sims-logo.png';

// Shown instead of the app while users/{email}.mustChangePassword is true
// (new account or admin reset). The live profile clears it on success.
export default function ChangePassword({ me, onLogout }) {
  const [pw, setPw] = useState(''); const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => {
    const problem = passwordProblem(pw, confirm);
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr('');
    try {
      await staffUsers.changeOwnPassword({ newPassword: pw });
      // A password change revokes the current session; sign straight back in.
      await signInWithEmailAndPassword(auth, me.email, pw);
    } catch (e) {
      setErr(e?.message || 'Could not change the password. Please try again.');
      setBusy(false);
    }
  };
  const enter = (e) => e.key === 'Enter' && go();
  return (
    <div style={{ ...S.page, display: 'grid', placeItems: 'center' }}>
      <div style={{ ...S.card, width: 380 }}>
        <img src={simsLogo} alt="BNHS SIMS logo" width={40} height={40} style={{ marginBottom: 16 }} />
        <h1 style={{ fontFamily: T.display, color: T.ink, fontSize: 20, margin: '0 0 2px', fontWeight: 700 }}>Set a new password</h1>
        <p style={{ fontFamily: T.body, color: T.inkMuted, fontSize: 12, marginTop: 0, marginBottom: 20 }}>
          {me.email} is using a temporary password. Choose your own ({MIN_PASSWORD}+ characters) to continue.
        </p>
        {err && <div role="alert" style={{ fontFamily: T.body, background: 'rgba(220,38,38,0.08)', color: T.absent, borderRadius: 10, padding: '9px 12px', fontSize: 12, marginBottom: 14 }}>{err}</div>}
        <Field label="New password"><Inp type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={enter} /></Field>
        <Field label="Confirm new password"><Inp type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={enter} /></Field>
        <Btn onClick={go} disabled={busy} style={{ width: '100%', marginTop: 6, opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save password'}</Btn>
        <Btn variant="ghost" onClick={onLogout} disabled={busy} style={{ width: '100%', marginTop: 8 }}>Sign out</Btn>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Shell — filtered nav and role label**

In `src/components/Shell.jsx`:
- Add imports: `import { canOpen } from '../lib/access.js';` and `import { roleLabel } from '../../shared/staffRoles.js';`
- After `const mobile = width < 768;` add: `const items = NAV_ITEMS.filter(item => canOpen(me, item.key));`
- In the `<nav>`, change `{NAV_ITEMS.map(item => ...` to `{items.map(item => ...`.
- Change `<div className="sims-account-role">Registrar</div>` to `<div className="sims-account-role">{roleLabel(me)}</div>`.
(The topbar title lookup `NAV_ITEMS.find(...)` stays as is.)

- [ ] **Step 5: App — live profile, refusal, guard, `me` to pages**

In `src/App.jsx`:
- Change the Firestore import to `import { doc, onSnapshot } from 'firebase/firestore';`
- Add imports: `import { canOpen, profileRefusal } from './lib/access.js';` and `import ChangePassword from './components/ChangePassword.jsx';`
- Change `function AttendanceArea({ schoolYear, entry })` to `function AttendanceArea({ me, schoolYear, entry })` and pass `me` through:
```jsx
        {tab === 'take'
          ? <AttendanceTakePage me={me} schoolYear={schoolYear} entry={entry} />
          : <AttendanceSummaryPage me={me} schoolYear={schoolYear} />}
```
- Replace the two lines `const [me, setMe] = useState(null);` and `const [ready, setReady] = useState(false);` with:
```jsx
  // authUser: undefined while Firebase Auth resolves, then a user or null.
  // me: undefined while that user's profile loads, then the profile or null.
  const [authUser, setAuthUser] = useState(undefined);
  const [me, setMe] = useState(undefined);
  const [notice, setNotice] = useState('');
```
(the existing `page`, `pageParams`, `navigationSequence`, `setPage`, `settings`, `schoolYear` lines stay where they are, so every hook still runs before any early return).
- Replace everything from `useEffect(() => onAuthStateChanged(auth, async (u) => {` down to and including the line `if (!me) return <>{reducedMotionGuard}<Login onSignedIn={setMe} /></>;` with:
```jsx
  useEffect(() => onAuthStateChanged(auth, setAuthUser), []);

  // Live profile: role/grade changes apply at once, and a disabled or deleted
  // profile signs the user out with an explanation on the login screen.
  useEffect(() => {
    if (authUser === undefined) return;
    if (!authUser) { setMe(null); return; }
    const email = authUser.email?.toLowerCase();
    const refuse = (message) => { setNotice(message); setMe(null); signOut(auth); };
    if (!email) { refuse('This account has no staff profile yet. Ask an administrator to add one.'); return; }
    setMe(undefined);
    return onSnapshot(doc(db, 'users', email), (snap) => {
      const profile = snap.exists() ? { email, ...snap.data() } : null;
      const refusal = profileRefusal(profile);
      if (refusal) refuse(refusal); else setMe(profile);
    }, () => refuse('Could not load your staff profile. Please sign in again.'));
  }, [authUser]);

  if (authUser === undefined || (authUser && me === undefined)) return <BootLoader />;

  const reducedMotionGuard = (
    <style>{'@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }'}</style>
  );
  const logout = () => { setNotice(''); signOut(auth); };

  if (!me) return <>{reducedMotionGuard}<Login notice={notice} onAttempt={() => setNotice('')} /></>;
  if (me.mustChangePassword) return <>{reducedMotionGuard}<ChangePassword me={me} onLogout={logout} /></>;

  // A page this role can't open (stale state, or a role change) falls back to the dashboard.
  const shown = canOpen(me, page) ? page : 'dashboard';
```
  (This replacement removes the old `if (!ready)` check and the old `reducedMotionGuard` declaration; both now live in the block above.)
- In the returned JSX: `Shell` gets `page={shown}` and `onLogout={logout}`; every `page==='x'` check becomes `shown==='x'`; pass `me={me}` to `DashboardPage`, `StudentsPage`, `SectionsPage`, `SchedulesPage`, and `AttendanceArea` (keep `me={me}` on `GuardiansPage`).

- [ ] **Step 6: Build and run tests**

Run: `npm run build`
Expected: build succeeds with no unresolved imports.
Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/data/staffUsers.js src/components/Login.jsx src/components/ChangePassword.jsx src/components/Shell.jsx src/App.jsx
git commit -m "feat(sims): live staff profile, role-filtered nav, forced password change

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Scope Students, Sections, Schedules

**Files:**
- Modify: `src/pages/StudentsPage.jsx`, `src/pages/SectionsPage.jsx`, `src/pages/SectionDetailModal.jsx`, `src/pages/SchedulesPage.jsx`

**Interfaces:**
- Consumes: `isAdmin`, `grades`, `gradeOptions`, `singleGrade`, `scopeRoster` (Task 5); `me` prop (Task 6).
- Produces: `SectionDetailModal` hides per-student Edit when `onEditStudent` is falsy.

- [ ] **Step 1: StudentsPage**

In `src/pages/StudentsPage.jsx`:
- Add import: `import { isAdmin, grades, gradeOptions, singleGrade, scopeRoster } from '../lib/access.js';`
- Signature: `export default function StudentsPage({ me, schoolYear, initialGradeFilter, initialStatus }) {`
- Replace the three lines `const students = studentsResource.data;`, `const sections = sectionsResource.data;`, `const enrollments = enrollmentsResource.data;` by deleting them and adding, right after `const enrollmentsResource = useCollectionResource('enrollments');`:
```js
  const admin = isAdmin(me);
  const oneGrade = singleGrade(me);
  const { students, sections, enrollments } = useMemo(() => scopeRoster(
    { students: studentsResource.data, sections: sectionsResource.data, enrollments: enrollmentsResource.data }, grades(me), schoolYear),
    [studentsResource.data, sectionsResource.data, enrollmentsResource.data, me, schoolYear]);
```
- Change the `sectionsForGradeFilter` memo so a single-grade coordinator gets their grade's sections without picking a grade:
```js
  const effectiveGrade = oneGrade ? String(oneGrade) : gradeFilter;
  const sectionsForGradeFilter = useMemo(() =>
    effectiveGrade && effectiveGrade !== UNASSIGNED ? sectionsSY.filter((s) => String(s.gradeLevel) === effectiveGrade) : [],
    [sectionsSY, effectiveGrade]);
```
- Heading: `<h1 style={S.h1}>{oneGrade ? `Grade ${oneGrade} Students` : 'Students'}</h1>` and wrap the two header buttons: `{admin && <div style={{ display: 'flex', gap: 8 }}>...</div>}`.
- Status select: `{admin && <option value={UNASSIGNED}>No Section Assigned</option>}`.
- Grade select: render the whole `<div style={{ minWidth: 140 }}>…</div>` only when `!oneGrade`; inside, map `gradeOptions(me)` instead of `GRADES`, and render the Unassigned option as `{admin && <option value={UNASSIGNED}>Unassigned</option>}`. Remove `GRADES` from the constants import if now unused.
- Section select: `disabled={!oneGrade && gradeFilter === UNASSIGNED}`; Unassigned option `{admin && <option value={UNASSIGNED}>No Section Assigned</option>}`.
- Empty state: `hint={admin ? 'Add your first learner with the button above.' : 'No learners are enrolled in your grade levels this school year.'}`.
- Row actions cell: wrap the Edit/Delete buttons in `{admin && <>…</>}` (keep the `<td>`).

- [ ] **Step 2: SectionsPage + SectionDetailModal**

In `src/pages/SectionsPage.jsx`:
- Add import: `import { isAdmin, grades, singleGrade, scopeRoster } from '../lib/access.js';`
- Signature: `export default function SectionsPage({ me, schoolYear }) {`
- Delete `const sections = sectionsResource.data;`, `const enrollments = enrollmentsResource.data;`, `const students = studentsResource.data;` and add after `const studentsResource = useCollectionResource('students');`:
```js
  const admin = isAdmin(me);
  const oneGrade = singleGrade(me);
  const { sections, enrollments, students } = useMemo(() => scopeRoster(
    { sections: sectionsResource.data, enrollments: enrollmentsResource.data, students: studentsResource.data }, grades(me), schoolYear),
    [sectionsResource.data, enrollmentsResource.data, studentsResource.data, me, schoolYear]);
```
(`schedules` stays unscoped.)
- Heading: `<h1 style={S.h1}>{oneGrade ? `Grade ${oneGrade} Sections` : 'Sections'}</h1>` and `{admin && <Btn onClick={() => setForm({ schoolYear })}>Add section</Btn>}`.
- Empty state hint: `hint={admin ? `Add your first section for SY ${schoolYear} with the button above.` : `No sections for your grade levels in SY ${schoolYear} yet.`}`.
- Row actions: wrap Edit/Delete in `{admin && <>…</>}`.
- Detail modal: `onEditStudent={admin ? (s) => setEditingStudent(s) : null}`.

In `src/pages/SectionDetailModal.jsx`, change the Edit cell to:
```jsx
                <td style={{ ...S.td, textAlign: 'right' }}>
                  {onEditStudent && <Btn variant="ghost" onClick={() => onEditStudent(s)}>Edit</Btn>}
                </td>
```

- [ ] **Step 3: SchedulesPage (read-only for coordinators)**

In `src/pages/SchedulesPage.jsx`:
- Add import: `import { isAdmin } from '../lib/access.js';`
- Signature: `export default function SchedulesPage({ me }) {` and first line inside: `const admin = isAdmin(me);`
- `{admin && <Btn onClick={() => setForm({})}>Add schedule</Btn>}`
- Empty state: `hint={admin ? 'Add your first shift schedule with the button above.' : 'No shift schedules have been set up yet.'}`
- Row actions: wrap Edit/Delete in `{admin && <>…</>}`.

- [ ] **Step 4: Build and test**

Run: `npm run build` → succeeds. Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/StudentsPage.jsx src/pages/SectionsPage.jsx src/pages/SectionDetailModal.jsx src/pages/SchedulesPage.jsx
git commit -m "feat(sims): grade-scoped, view-only Students/Sections/Schedules for coordinators

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Scope Attendance and Dashboard

**Files:**
- Modify: `src/pages/AttendanceTakePage.jsx`, `src/pages/AttendanceSummaryPage.jsx`, `src/pages/DashboardPage.jsx`, `src/components/dashboard/AttentionPanel.jsx`

**Interfaces:**
- Consumes: `isAdmin`, `grades`, `scopeRoster` (Task 5); `me` prop (Task 6).
- Produces: `AttentionPanel` prop `showUnassigned` (default `true`).

- [ ] **Step 1: Attendance pages**

In both `src/pages/AttendanceTakePage.jsx` and `src/pages/AttendanceSummaryPage.jsx`:
- Add import: `import { grades, scopeRoster } from '../lib/access.js';`
- Signatures: `export default function AttendanceTakePage({ me, schoolYear, entry }) {` / `export default function AttendanceSummaryPage({ me, schoolYear }) {`
- Replace `const sections = sectionsResource.data;` with:
```js
  // Coordinators pick only their grades' sections; an out-of-scope dashboard
  // deep link resolves as an unavailable section.
  const sections = useMemo(() => scopeRoster({ sections: sectionsResource.data }, grades(me), schoolYear).sections,
    [sectionsResource.data, me, schoolYear]);
```
Everything downstream (`sectionsSY`, `SectionPicker`, `resolveAttendanceEntry`, rosters, save, SF2 export) already derives from `sections`, so saving and exporting stay available within scope.

- [ ] **Step 2: Dashboard**

In `src/components/dashboard/AttentionPanel.jsx`:
- Signature: `export default function AttentionPanel({ unassigned, pendingSections, date, totalSections, onUnassigned, onSection, showUnassigned = true }) {`
- Wrap the first `<Card surface="summary" className="sims-attention-card">…</Card>` in `{showUnassigned && (…)}`.

In `src/pages/DashboardPage.jsx`:
- Add import: `import { isAdmin, grades, scopeRoster } from '../lib/access.js';`
- Signature: `export default function DashboardPage({ me, schoolYear, setPage }) {`
- Replace the line `const students = studentsResource.data, sections = sectionsResource.data, enrollments = enrollmentsResource.data, attendance = attendanceResource.data;` with:
```js
  const admin = isAdmin(me);
  const { students, sections, enrollments, attendance } = useMemo(() => scopeRoster({
    students: studentsResource.data, sections: sectionsResource.data,
    enrollments: enrollmentsResource.data, attendance: attendanceResource.data,
  }, grades(me), schoolYear), [studentsResource.data, sectionsResource.data, enrollmentsResource.data, attendanceResource.data, me, schoolYear]);
```
- Enroll button: `{admin && <Btn onClick={()=>setPage('enroll')}>Enroll a learner <NavIcon name="enroll" size={17}/></Btn>}`
- `AttentionPanel`: add `showUnassigned={admin}`.
- Chart caption: `<p>{admin ? 'Current school-year enrollment, across all sections' : 'Current school-year enrollment in your grade levels'}</p>`

- [ ] **Step 3: Build and test**

Run: `npm run build` → succeeds. Run: `npm test` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AttendanceTakePage.jsx src/pages/AttendanceSummaryPage.jsx src/pages/DashboardPage.jsx src/components/dashboard/AttentionPanel.jsx
git commit -m "feat(sims): grade-scoped attendance and dashboard for coordinators

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Accounts page

**Files:**
- Create: `src/pages/AccountsPage.jsx`
- Modify: `src/App.jsx` (lazy import + route)

**Interfaces:**
- Consumes: `staffUsers` (Task 6); `ROLE_VALUES`, `ROLE_LABELS`, `ALL_GRADES`, `roleOf`, `roleLabel` (Task 1); `users` collection (admin-readable per Task 4).
- Produces: `<AccountsPage me />`, route key `accounts`.

- [ ] **Step 1: Write the page**

`src/pages/AccountsPage.jsx`:
```jsx
import { useMemo, useState } from 'react';
import { useCollectionResource } from '../hooks/useCollection.js';
import { staffUsers } from '../data/staffUsers.js';
import { ROLE_VALUES, ROLE_LABELS, ALL_GRADES, roleOf, roleLabel } from '../../shared/staffRoles.js';
import { T, S } from '../styles.js';
import { Btn, Inp, Sel, Field, Card, Modal, EmptyState, ResourceState, EditorResources } from '../components/ui.jsx';

// Admin-only account management. Every change goes through a callable that
// enforces the safeguards (no self-demote/disable/reset/delete, at least one
// active admin) server-side; the disabled buttons here only mirror them.
const statusOf = (u) => u.disabled ? 'Disabled' : u.mustChangePassword ? 'Must change password' : 'Active';
const errorText = (e) => e?.message || 'The action could not be completed. Please try again.';
const displayName = (u) => u.name || u.id;
const actions = { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 };

function AccountForm({ editing, self, onClose, onCreated }) {
  const [f, setF] = useState(editing
    ? { name: editing.name || '', email: editing.id, role: roleOf(editing) || 'glc', gradeLevel: editing.gradeLevel ? String(editing.gradeLevel) : '' }
    : { name: '', email: '', role: 'glc', gradeLevel: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (f.role === 'glc' && !f.gradeLevel) { setErr('Grade level is required for a Grade Level Coordinator.'); return; }
    setBusy(true); setErr('');
    const payload = { name: f.name.trim(), email: f.email.trim(), role: f.role, gradeLevel: f.role === 'glc' ? Number(f.gradeLevel) : null };
    try {
      if (editing) { await staffUsers.update(payload); onClose(); }
      else onCreated(await staffUsers.create(payload));
    } catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  return (
    <Modal title={editing ? `Change ${displayName(editing)}` : 'Create account'} onClose={onClose} dismissible={!busy}>
      {err && <p role="alert" className="sims-feedback">{err}</p>}
      <Field label="Full name"><Inp value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Email"><Inp type="email" value={f.email} disabled={!!editing} onChange={(e) => set('email', e.target.value)} /></Field>
      <Field label="Role">
        <Sel value={f.role} disabled={self} onChange={(e) => set('role', e.target.value)}>
          {ROLE_VALUES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </Sel>
      </Field>
      {self && <p style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted, marginTop: -6 }}>You can't change the role of your own account.</p>}
      {f.role === 'glc' && (
        <Field label="Grade level">
          <Sel value={f.gradeLevel} onChange={(e) => set('gradeLevel', e.target.value)}>
            <option value="">Choose a grade</option>
            {ALL_GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
          </Sel>
        </Field>
      )}
      <div style={actions}>
        <Btn variant="ghost" disabled={busy} onClick={onClose}>Cancel</Btn>
        <Btn disabled={busy} onClick={save}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create account'}</Btn>
      </div>
    </Modal>
  );
}

// Shown once after create/reset; the password lives only in this component's
// props and is gone when the dialog closes.
function PasswordReveal({ result, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${result.email}\n${result.password}`); setCopied(true); }
    catch { setCopied(false); }
  };
  return (
    <Modal title="Temporary password" onClose={onClose}>
      <p style={{ fontFamily: T.body, color: T.ink, fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>
        Give these to the account owner now. <strong>This password can't be shown again.</strong> They'll be asked to choose their own when they sign in.
      </p>
      <Field label="Email"><Inp readOnly value={result.email} /></Field>
      <Field label="Temporary password"><Inp readOnly value={result.password} style={{ fontFamily: 'ui-monospace, monospace' }} /></Field>
      <div style={actions}>
        <Btn variant="ghost" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</Btn>
        <Btn onClick={onClose}>Done</Btn>
      </div>
    </Modal>
  );
}

function ActionConfirm({ title, message, label, danger = false, typeToConfirm, onYes, onClose }) {
  const [typed, setTyped] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const blocked = typeToConfirm && typed.trim().toLowerCase() !== typeToConfirm;
  const yes = async () => {
    setBusy(true); setErr('');
    try { await onYes(); } catch (e) { setErr(errorText(e)); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose} dismissible={!busy}>
      <p style={{ fontFamily: T.body, color: T.ink, fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>{message}</p>
      {typeToConfirm && <Field label={`Type ${typeToConfirm} to confirm`}><Inp value={typed} onChange={(e) => setTyped(e.target.value)} /></Field>}
      {err && <p role="alert" className="sims-feedback">{err}</p>}
      <div style={actions}>
        <Btn variant="ghost" disabled={busy} onClick={onClose}>Cancel</Btn>
        <Btn disabled={busy || blocked} onClick={yes} style={{ background: danger ? T.absent : T.primary }}>{busy ? 'Working…' : label}</Btn>
      </div>
    </Modal>
  );
}

export default function AccountsPage({ me }) {
  const usersResource = useCollectionResource('users');
  const rows = useMemo(() => [...usersResource.data].sort((a, b) => displayName(a).localeCompare(displayName(b))), [usersResource.data]);
  const [form, setForm] = useState(null);       // {} = create, user = change
  const [pending, setPending] = useState(null); // { kind, user }
  const [reveal, setReveal] = useState(null);   // { email, password }
  const resources = [usersResource];

  const confirmFor = ({ kind, user }) => {
    const name = displayName(user);
    const done = () => setPending(null);
    if (kind === 'reset') return { title: 'Reset password', label: 'Reset password',
      message: `Generate a new temporary password for ${name}? Their current password stops working and they'll be signed out.`,
      onYes: async () => { const r = await staffUsers.resetPassword({ email: user.id }); done(); setReveal(r); } };
    if (kind === 'disable') return { title: 'Disable account', label: 'Disable', danger: true,
      message: `Disable ${name}? They'll be signed out and can't sign in until the account is re-enabled.`,
      onYes: async () => { await staffUsers.setDisabled({ email: user.id, disabled: true }); done(); } };
    if (kind === 'enable') return { title: 'Re-enable account', label: 'Re-enable',
      message: `Re-enable ${name}? They'll be able to sign in again.`,
      onYes: async () => { await staffUsers.setDisabled({ email: user.id, disabled: false }); done(); } };
    return { title: 'Delete account', label: 'Delete permanently', danger: true, typeToConfirm: user.id,
      message: `Permanently delete ${name}'s account? This can't be undone. Their audit history is kept.`,
      onYes: async () => { await staffUsers.remove({ email: user.id }); done(); } };
  };

  return (
    <EditorResources resources={resources}><div>
      <ResourceState resources={resources} label="accounts">
        <div className="sims-heading" style={S.plate}>
          <h1 style={S.h1}>Accounts</h1>
          <Btn onClick={() => setForm({})}>Create account</Btn>
        </div>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {rows.length === 0 ? <EmptyState title="No accounts yet" hint="Create the first staff account with the button above." /> : (
            <div className="sims-table-scroll" role="region" aria-label="Accounts" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={S.thead}>{['Name', 'Email', 'Role', 'Status', ''].map((h) => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((u) => {
                const self = u.id === me.email;
                return (
                  <tr key={u.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{displayName(u)}{self && <span style={{ color: T.inkMuted, fontWeight: 400 }}> (you)</span>}</td>
                    <td style={S.td}>{u.id}</td>
                    <td style={S.td}>{roleLabel(u)}</td>
                    <td style={{ ...S.td, color: u.disabled ? T.absent : T.ink }}>{statusOf(u)}</td>
                    <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Btn variant="ghost" onClick={() => setForm(u)} style={{ marginRight: 6 }}>Change</Btn>
                      <Btn variant="ghost" disabled={self} onClick={() => setPending({ kind: 'reset', user: u })} style={{ marginRight: 6 }}>Reset password</Btn>
                      <Btn variant="ghost" disabled={self} onClick={() => setPending({ kind: u.disabled ? 'enable' : 'disable', user: u })} style={{ marginRight: 6 }}>{u.disabled ? 'Enable' : 'Disable'}</Btn>
                      <Btn variant="ghost" disabled={self} onClick={() => setPending({ kind: 'delete', user: u })} style={{ color: T.absent, borderColor: T.absent }}>Delete</Btn>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </Card>
      </ResourceState>
      {form && <AccountForm editing={form.id ? form : null} self={form.id === me.email} onClose={() => setForm(null)} onCreated={(r) => { setForm(null); setReveal(r); }} />}
      {pending && <ActionConfirm {...confirmFor(pending)} onClose={() => setPending(null)} />}
      {reveal && <PasswordReveal result={reveal} onClose={() => setReveal(null)} />}
    </div></EditorResources>
  );
}
```

- [ ] **Step 2: Route it**

In `src/App.jsx`:
- Add with the other lazy pages: `const AccountsPage = lazy(() => import('./pages/AccountsPage.jsx'));`
- Add inside `<Suspense>` after the settings line: `{shown==='accounts' && <AccountsPage me={me} />}`

- [ ] **Step 3: Build and test**

Run: `npm run build` → succeeds. Run: `npm test` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AccountsPage.jsx src/App.jsx
git commit -m "feat(sims): Accounts page for administrators

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Legacy role backfill + README

**Files:**
- Create: `functions/src/lib/roleBackfill.js`, `functions/src/lib/roleBackfill.test.js`, `functions/scripts/backfillUserRoles.mjs`
- Modify: `README.md` (step 3 users document)

**Interfaces:**
- Produces: `roleBackfill(profile): object | null` — the patch to write, or `null` if nothing changes.

- [ ] **Step 1: Write the failing test**

`functions/src/lib/roleBackfill.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { roleBackfill } from './roleBackfill.js';

describe('roleBackfill', () => {
  it('makes legacy registrar / role-less profiles explicit admins', () => {
    expect(roleBackfill({ name: 'R', role: 'registrar' })).toEqual({ role: 'admin', gradeLevel: null, disabled: false, mustChangePassword: false });
    expect(roleBackfill({ name: 'R' })).toEqual({ role: 'admin', gradeLevel: null, disabled: false, mustChangePassword: false });
  });
  it('only fills missing flags on new-style profiles', () => {
    expect(roleBackfill({ role: 'glc', gradeLevel: 8 })).toEqual({ disabled: false, mustChangePassword: false });
  });
  it('is idempotent', () => {
    expect(roleBackfill({ role: 'admin', gradeLevel: null, disabled: false, mustChangePassword: false })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix functions test -- src/lib/roleBackfill.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`functions/src/lib/roleBackfill.js`:
```js
// Patch that makes a pre-roles users/{email} profile explicit, or null when
// it already is. Legacy = no role or the README's old 'registrar'.
export function roleBackfill(profile) {
  const patch = {};
  if (profile.role == null || profile.role === '' || profile.role === 'registrar') {
    patch.role = 'admin';
    patch.gradeLevel = null;
  }
  if (profile.disabled === undefined) patch.disabled = false;
  if (profile.mustChangePassword === undefined) patch.mustChangePassword = false;
  return Object.keys(patch).length ? patch : null;
}
```

`functions/scripts/backfillUserRoles.mjs`:
```js
// One-off after deploying staff roles: give every pre-roles profile an
// explicit role. Dry run unless --apply. Needs Application Default
// Credentials for the project (e.g. `gcloud auth application-default login`).
//   node functions/scripts/backfillUserRoles.mjs <projectId>
//   node functions/scripts/backfillUserRoles.mjs <projectId> --apply
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { roleBackfill } from '../src/lib/roleBackfill.js';

const [projectId, flag] = process.argv.slice(2);
if (!projectId) { console.error('Usage: node functions/scripts/backfillUserRoles.mjs <projectId> [--apply]'); process.exit(1); }
initializeApp({ projectId });
const db = getFirestore();

const snap = await db.collection('users').get();
const changes = snap.docs.map((d) => ({ id: d.id, patch: roleBackfill(d.data()) })).filter((c) => c.patch);
for (const c of changes) console.log(`${c.id}: ${JSON.stringify(c.patch)}`);
if (flag !== '--apply') {
  console.log(`Dry run: ${changes.length} profile(s) would change. Re-run with --apply to write.`);
} else {
  for (const c of changes) await db.doc(`users/${c.id}`).update(c.patch);
  console.log(`Updated ${changes.length} profile(s).`);
}
```

In `README.md`, change the users document example in step 3 to:
```json
{ "name": "Registrar Name", "role": "admin" }
```
and add directly after that code block (same indentation as the list item):
```
     This first account is an Administrator. Create every other staff account
     (Administrators and coordinators) from the **Accounts** page in SIMS.
```

- [ ] **Step 4: Run tests**

Run: `npm --prefix functions test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/lib/roleBackfill.js functions/src/lib/roleBackfill.test.js functions/scripts/backfillUserRoles.mjs README.md
git commit -m "chore(roles): legacy profile backfill script and README update

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Full verification

- [ ] **Step 1: Run every suite**

Run: `npm run test:all`
Expected: all suites PASS (one skipped `TODO(K1/K2)` rules case). If the emulator suites can't run on this machine, run `npm test`, `npm --prefix functions test`, `npm --prefix parent test` and report the emulator suites as not run.

- [ ] **Step 2: Manual check against the emulators**

Start: `npm run emulators` (separate terminal), and the app with `VITE_USE_EMULATORS=true` in `.env.local`, then `npm run dev`.
Seed an admin profile in the Emulator UI (`users/<email>` = `{ "name": "Admin", "role": "registrar" }`, plus a matching Auth user), sign in, and verify:
1. Sidebar shows all pages plus **Accounts**; footer reads "Administrator".
2. Create one account per coordinator role; each shows the show-once password dialog.
3. Sign in as each: forced "Set a new password" screen first; then only Dashboard, Students, Sections, Schedules, Attendance; footer label matches the role.
4. GLC (Grade 8): headings read "Grade 8 Students"/"Grade 8 Sections", no grade dropdown, no Add/Edit/Delete/Import, attendance section picker lists only Grade 8, Save and SF2 export work.
5. JHS: grade dropdown lists 7–10 only; SHS: 11–12 only.
6. As admin, disable a signed-in coordinator in another browser profile → they're signed out with "This account has been disabled. Contact an administrator."
7. As admin, your own row has Reset/Disable/Delete disabled and the role select is locked.

- [ ] **Step 3: Report**

Summarize which suites ran and passed and what the manual check found. Then use superpowers:finishing-a-development-branch.
