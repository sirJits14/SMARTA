# Learner Add/Remove Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Class Adviser can ask, from the Parent App, to add a learner to their advisory or to remove one with a reason. Nothing changes in SIMS until an Administrator, or someone who covers the learner's grade, approves the request in SIMS.

**Architecture:** A callable-only Firestore collection, `learner_change_requests`, holds the requests. Seven `schoolCall` callables file, withdraw, list, count and decide them, using the existing `loadSchoolActor` authority (an administrator, a SIMS coordinator scope, or a Curriculum Adviser assignment). Approval writes the learner and enrollment in one audited transaction. The Parent App gets three lazy sheets (Add learner, Remove from class, Requests) on the Class tab and learner history; SIMS gets a "Learner requests" page with a count badge.

**Tech Stack:** Firebase Functions v2 (Node 22) with Admin SDK transactions, Firestore, React 19 with Vite, Vitest with the Firestore emulator.

**Spec:** `docs/superpowers/specs/2026-10-22-parent-learner-requests-design.md`. Refinements already reflected in the spec: filing and re-checking use the adviser's `school_accounts` assignment (no section-lock check); deleting an adviser's account withdraws their pending requests; after the school year ends Waiting is empty and Decided is readable to Administrators only (a coordinator's or Curriculum Adviser's grade scope ends with the year); the Class tab link reads "N requests waiting for approval" or "Past requests".

**Prerequisite:** the SF2 plan (`2026-10-22-parent-sf2-export.md`) must be done first, all of it. It creates `parent/src/components/Sheet.jsx` and `parent/src/screens/school/ClassActions.jsx`, and several diffs below are written against files as that plan leaves them: `functions/index.js`, `functions/src/callable.js`, `parent/src/strings.js`, `parent/src/lib/strings.test.js`, `parent/src/screens/school/ClassTab.css`, `ClassTab.jsx`, `ClassActions.jsx` and `ClassActions.test.js`.

## Global Constraints

- **Approvers:** Administrators, and anyone covering the request's grade: a SIMS coordinator whose scope includes it, or a Curriculum Adviser assigned to it (`reviewGrades`). Nobody decides their own request. Only the section's Class Adviser files.
- **Add fields** (the Excel import's columns, minus grade and section): LRN (exactly 12 digits), last name, first name, middle name, ext, sex (M or F), birthdate (a real date, not in the future), address, guardian name, relationship and contact, contact number, enrollment type (`new`, `returning`, `transferee`; default `new`). Required: LRN, last name, first name, sex, birthdate. Names 60 characters at most, address 200.
- **Removal:** one of `transferred_out`, `dropped_out`, `moved_section`, plus a note of 1 to 500 characters. Nothing is erased. Transferred out sets the enrollment and learner to `transferred`; Dropped out sets both to `dropped`; Moved to another section sets the enrollment to `dropped` (as Enrollment → Withdraw does) and leaves the learner Active and Unassigned.
- **An LRN already in SIMS** is flagged for the approver. Approving enrolls or moves that learner and leaves the details SIMS already has. A learner already in the same section is refused at once. A learner who is not currently enrolled in a grade the approver covers (Unassigned, Dropped, Transferred, or another grade) can be approved only by an Administrator; other approvers see "Needs an administrator" without the name.
- **Decisions:** rejecting needs a reason of 1 to 500 characters; approving's reason is optional (stored as "Approved"). The adviser gets an Inbox note (`type: 'learner_request'`) either way.
- **Limits:** one pending request per learner per section, 20 pending per adviser, 30 requests per hour per adviser (`LIMITS.learnerRequest`).
- **Privacy:** when a request is decided or withdrawn its `address`, `guardianContact` and `contactNumber` are removed. Audit rows (`targetType: 'learner_request'`) carry only the LRN and name.
- **Rules:** `learner_change_requests` is closed to every client. Production needs no rules deploy.
- **Parent App budget:** first-load JavaScript under 260 KB gzip; the three sheets load on demand. Keep the PR #74 UI untouched.
- **DESIGN.md:** new CSS uses only the documented radii (8, 10, 12, 999px) and type sizes (12 to 16px).
- **SIMS:** the Students page, Import wizard and admin Add/Delete do not change.

## Before you start

Run everything from the repository root in PowerShell. Set this once per terminal (it avoids IPv6 flakiness on this machine):

```powershell
$env:NODE_OPTIONS = '--dns-result-order=ipv4first'
```

A fresh worktree has no dependencies. Link them from the main checkout (directory junctions; skip any that already exist):

```powershell
$main = 'C:\Users\jitsb\OneDrive - Department of Education\Desktop\APPS\bnhs-sims'
foreach ($d in 'node_modules', 'functions\node_modules', 'parent\node_modules') {
  if (-not (Test-Path $d)) { New-Item -ItemType Junction -Path $d -Target (Join-Path $main $d) | Out-Null }
}
```

Command forms used below (each was run in this repository while writing the plan):

| What | Command |
|---|---|
| SIMS and shared unit tests | `npx vitest run <files>` |
| Parent unit tests | `npm --prefix parent test -- <files>` (no files = the whole Parent suite) |
| Functions unit tests | `node scripts/syncShared.mjs` then `cd functions; npx vitest run <files>; cd ..` |
| Functions emulator tests | `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run --no-file-parallelism <test files>"` |
| Firestore rules tests | `npx firebase emulators:exec --only firestore "vitest run -c vitest.rules.config.js <files>"` |

Emulator runs need Java (installed) and take 15 to 40 seconds. Always pass `--no-file-parallelism` when you name more than one emulator file: the files wipe the shared database and would break each other.

Builds need the production `VITE_*` values. Load them from the main checkout into the current process only; never copy the `.env` files into the worktree and never print their values:

```powershell
$main = 'C:\Users\jitsb\OneDrive - Department of Education\Desktop\APPS\bnhs-sims'
# Parent App
Get-Content (Join-Path $main 'parent\.env') | ForEach-Object { if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $_ -notmatch '^\s*#') { Set-Item -Path ("Env:" + $Matches[1]) -Value $Matches[2].Trim('"') } }
npm --prefix parent run build
npm --prefix parent run size
# SIMS (use a fresh terminal, or clear the Parent values first)
Get-Content (Join-Path $main '.env') | ForEach-Object { if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$' -and $_ -notmatch '^\s*#') { Set-Item -Path ("Env:" + $Matches[1]) -Value $Matches[2].Trim('"') } }
Remove-Item Env:VITE_APPCHECK_DEBUG_TOKEN -ErrorAction SilentlyContinue
$env:VITE_USE_EMULATORS = 'false'
npm run build
```

`dist` and `parent/dist` are gitignored. SIMS prints a chunk-size warning about two large chunks; it is long-standing and harmless.

Commits: end each commit message with the attribution line your session was given, and never commit `.env` files. Do not commit anything under `.impeccable/` or `.superpowers/`.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `shared/learnerRequests.js` | create | field rules, removal reasons, keys, who may file and decide |
| `shared/schoolAccess.js` | modify | export `reviewGrades` |
| `functions/src/handlers/learnerRequests.js` | create | the seven callables |
| `functions/src/lib/learnerRequestCleanup.js` | create | clearing contact fields, withdrawing pending requests |
| `functions/src/handlers/schoolAccess.js`, `functions/src/callable.js`, `functions/index.js` | modify | account deletion hook, the rate limit, the exports |
| `firestore.rules`, `firestore.indexes.json` | modify | explicit deny, five indexes |
| `parent/src/lib/learnerRequests.js`, `parent/src/hooks/useLearnerRequests.js` | create | form checks, payloads, request lists, the loader |
| `parent/src/screens/school/AddLearnerSheet.jsx`, `RemoveLearnerSheet.jsx`, `RequestsSheet.jsx` | create | the three sheets |
| `parent/src/screens/school/ClassActions.jsx`, `ClassTab.jsx`, `LearnerHistory.jsx`, `ClassTab.css`, `parent/src/strings.js`, `parent/src/lib/school.js` | modify | wiring, copy, Inbox destination |
| `src/lib/learnerRequests.js` | create | SIMS wording helpers |
| `src/pages/LearnerRequestsPage.jsx`, `src/pages/learnerRequests/*` | create | the SIMS page, cards and data hook |
| `src/hooks/useLearnerRequestCount.js` | create | sidebar badge count |
| `src/lib/navigation.js`, `src/lib/access.js`, `src/components/Shell.jsx`, `src/App.jsx` | modify | nav item, page access, badge, lazy page |

### Task 1: Shared rules for learner requests

**Files:**
- Create: `shared/learnerRequests.js`
- Modify: `shared/schoolAccess.js`
- Test: `shared/learnerRequests.test.js`

**Interfaces:**
- Consumes: `currentAssignments`, `reviewGrades` from `shared/schoolAccess.js`.
- Produces: `validateLearnerFields(input, { today })` → `{ ok, errors, value }`; `validateEnrollType(value)`; `validateRemoval({ reasonCode, note })`; `REMOVAL_REASONS`, `REASON_CODES`, `reasonLabel(code)`; `ENROLL_TYPES`, `ENROLL_TYPE_LABELS`; `CONTACT_FIELDS`; `MAX_PENDING_PER_ADVISER`, `NOTE_MAX`; `cleanText`; `addKey`, `removeKey`; `isSectionAdviser(actor, sectionId)`, `coversGrade(actor, grade)`, `canDecideLearnerRequest(actor, request)`.

- [ ] **Step 1: Write the failing test**

It also proves the field rules agree with the Excel import's `validateStudent`.

```js
import { describe, expect, it } from 'vitest';
import { validateStudent } from '../src/lib/validation.js';
import {
  CONTACT_FIELDS, ENROLL_TYPES, REASON_CODES, REMOVAL_REASONS, addKey, canDecideLearnerRequest, cleanText, coversGrade,
  isSectionAdviser, reasonLabel, removeKey, validateEnrollType, validateLearnerFields, validateRemoval,
} from './learnerRequests.js';

const year = '2026-2027';
const good = {
  lrn: '123456789012', lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos', extName: 'Jr', sex: 'M',
  birthdate: '2012-05-01', address: '123 Rizal St.', guardianName: 'Maria Dela Cruz', guardianRelationship: 'Mother',
  guardianContact: '09171234567', contactNumber: '09181234567',
};

describe('validateLearnerFields', () => {
  it('accepts the import template example and returns cleaned values', () => {
    const result = validateLearnerFields({ ...good, lastName: '  Dela   Cruz ', sex: 'm' }, { today: '2026-10-22' });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.value).toMatchObject({ lastName: 'Dela Cruz', sex: 'M', lrn: '123456789012' });
  });
  it('requires the same fields as the import', () => {
    const result = validateLearnerFields({}, { today: '2026-10-22' });
    expect(Object.keys(result.errors).sort()).toEqual(['birthdate', 'firstName', 'lastName', 'lrn', 'sex']);
    expect(result.errors.lrn).toBe('LRN must be exactly 12 digits.');
    expect(result.errors.sex).toBe('Choose a sex.');
  });
  it('agrees with the import validator on every field the import checks', () => {
    const rows = [good, { ...good, lrn: '12345' }, { ...good, lastName: ' ' }, { ...good, firstName: '' }, { ...good, sex: 'X' }, { ...good, birthdate: '' }, {}];
    for (const row of rows) {
      const ours = Object.keys(validateLearnerFields(row, { today: '2026-10-22' }).errors).sort();
      const theirs = Object.keys(validateStudent(row).errors).sort();
      expect(ours, JSON.stringify(row)).toEqual(theirs);
    }
  });
  it('rejects impossible and future birthdates', () => {
    expect(validateLearnerFields({ ...good, birthdate: '2012-02-30' }, { today: '2026-10-22' }).errors.birthdate).toBe('Enter the birthdate as a real date.');
    expect(validateLearnerFields({ ...good, birthdate: '05/01/2012' }, { today: '2026-10-22' }).errors.birthdate).toBe('Enter the birthdate as a real date.');
    expect(validateLearnerFields({ ...good, birthdate: '2027-01-01' }, { today: '2026-10-22' }).errors.birthdate).toBe('Birthdate cannot be in the future.');
    expect(validateLearnerFields({ ...good, birthdate: '2026-10-22' }, { today: '2026-10-22' }).ok).toBe(true);
  });
  it('limits text length and strips control characters', () => {
    expect(validateLearnerFields({ ...good, address: 'x'.repeat(201) }, {}).errors.address).toBe('Keep Address within 200 characters.');
    expect(validateLearnerFields({ ...good, lastName: 'y'.repeat(61) }, {}).errors.lastName).toBe('Keep Last name within 60 characters.');
    expect(validateLearnerFields({ ...good, firstName: 'Ju\u0000an\n' }, {}).value.firstName).toBe('Ju an');
    expect(cleanText(null)).toBe('');
  });
  it('treats the contact fields as the ones cleared after a decision', () => {
    expect(CONTACT_FIELDS).toEqual(['address', 'guardianContact', 'contactNumber']);
  });
});

describe('validateEnrollType', () => {
  it('defaults to new and accepts the import types', () => {
    expect(validateEnrollType('')).toEqual({ ok: true, value: 'new' });
    expect(validateEnrollType(undefined)).toEqual({ ok: true, value: 'new' });
    expect(validateEnrollType(' Returning ')).toEqual({ ok: true, value: 'returning' });
    expect(ENROLL_TYPES).toEqual(['new', 'returning', 'transferee']);
  });
  it('refuses anything else', () => {
    expect(validateEnrollType('visitor')).toMatchObject({ ok: false, error: 'Enrollment type must be new, returning, or transferee.' });
  });
});

describe('validateRemoval', () => {
  it('needs a known reason and a note of up to 500 characters', () => {
    expect(validateRemoval({ reasonCode: 'dropped_out', note: ' Stopped coming in August ' })).toEqual({
      ok: true, errors: {}, value: { reasonCode: 'dropped_out', note: 'Stopped coming in August' } });
    expect(validateRemoval({ reasonCode: 'left', note: 'x' }).errors).toEqual({ reasonCode: 'Choose a reason.' });
    expect(validateRemoval({ reasonCode: 'dropped_out', note: '  ' }).errors).toEqual({ note: 'Add a short note.' });
    expect(validateRemoval({ reasonCode: 'dropped_out', note: 'n'.repeat(501) }).errors.note).toBe('Keep the note within 500 characters.');
    expect(validateRemoval(null).ok).toBe(false);
  });
  it('maps each reason to the outcome in the spec', () => {
    expect(REASON_CODES).toEqual(['transferred_out', 'dropped_out', 'moved_section']);
    expect(REMOVAL_REASONS.transferred_out).toMatchObject({ enrollment: 'transferred', learner: 'transferred' });
    expect(REMOVAL_REASONS.dropped_out).toMatchObject({ enrollment: 'dropped', learner: 'dropped' });
    expect(REMOVAL_REASONS.moved_section).toMatchObject({ enrollment: 'dropped', learner: null });
    expect(reasonLabel('moved_section')).toBe('Moved to another section');
    expect(reasonLabel('nope')).toBe('');
  });
});

describe('request keys', () => {
  it('are distinct for adds and removals', () => {
    expect(addKey('SEC1', '123456789012')).toBe('add:SEC1:123456789012');
    expect(removeKey('SEC1', 'S1')).toBe('remove:SEC1:S1');
  });
});

describe('who may file and decide', () => {
  const request = { status: 'pending', schoolYear: year, gradeLevel: 7, requestedByUid: 'teacher', sectionId: 'SEC1' };
  const admin = { uid: 'admin', schoolYear: year, isAdmin: true, assignments: [], simsGrades: [] };
  const curriculum = (grade) => ({ uid: 'ca', schoolYear: year, isAdmin: false, simsGrades: [], assignments: [{ role: 'curriculum_adviser', schoolYear: year, gradeLevel: grade }] });
  const coordinator = (grades) => ({ uid: 'coord', schoolYear: year, isAdmin: false, assignments: [], simsGrades: grades });
  const adviser = { uid: 'teacher', schoolYear: year, isAdmin: false, simsGrades: [], assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 }] };

  it('lets only the section adviser file', () => {
    expect(isSectionAdviser(adviser, 'SEC1')).toBe(true);
    expect(isSectionAdviser(adviser, 'SEC2')).toBe(false);
    expect(isSectionAdviser({ ...adviser, schoolYear: '2027-2028' }, 'SEC1')).toBe(false);
    expect(isSectionAdviser(curriculum(7), 'SEC1')).toBe(false);
    expect(isSectionAdviser(admin, 'SEC1')).toBe(false);
  });
  it('lets administrators, in-grade coordinators and in-grade Curriculum Advisers decide', () => {
    for (const actor of [admin, coordinator([7, 8]), curriculum(7), { ...coordinator([9]), assignments: curriculum(7).assignments }]) {
      expect(canDecideLearnerRequest(actor, request)).toBe(true);
    }
  });
  it('refuses other grades, other years, finished requests, the requester and plain advisers', () => {
    expect(canDecideLearnerRequest(coordinator([8]), request)).toBe(false);
    expect(canDecideLearnerRequest(curriculum(8), request)).toBe(false);
    expect(canDecideLearnerRequest(admin, { ...request, schoolYear: '2025-2026' })).toBe(false);
    for (const status of ['approved', 'rejected', 'withdrawn']) expect(canDecideLearnerRequest(admin, { ...request, status })).toBe(false);
    expect(canDecideLearnerRequest(admin, { ...request, requestedByUid: 'admin' })).toBe(false);
    expect(canDecideLearnerRequest(coordinator([7]), { ...request, requestedByUid: 'coord' })).toBe(false);
    expect(canDecideLearnerRequest(adviser, { ...request, requestedByUid: 'someone' })).toBe(false);
    expect(canDecideLearnerRequest(null, request)).toBe(false);
  });
  it('knows which grades an actor covers', () => {
    expect(coversGrade(admin, 12)).toBe(true);
    expect(coversGrade(coordinator([7]), 7)).toBe(true);
    expect(coversGrade(coordinator([7]), 8)).toBe(false);
    expect(coversGrade(curriculum(10), 10)).toBe(true);
    expect(coversGrade(null, 7)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```powershell
npx vitest run shared/learnerRequests.test.js
```

Expected: FAIL (`Failed to resolve import "./learnerRequests.js"`).

- [ ] **Step 3: Write the module and export `reviewGrades`**

```js
// Rules for adviser learner requests (spec 2026-10-22): which fields a request carries, how they are
// checked, what a removal does, and who may decide one. Cloud Functions, the Parent App and SIMS all
// import this file, so a phone and the server always agree.
import { currentAssignments, reviewGrades } from './schoolAccess.js';

export const ENROLL_TYPES = ['new', 'returning', 'transferee'];
export const ENROLL_TYPE_LABELS = { new: 'New', returning: 'Returning', transferee: 'Transferee' };

// What an approved removal does to the enrollment and to the learner. Nothing is ever erased.
// `moved_section` leaves the learner Active (Unassigned), exactly like SIMS Enrollment → Withdraw.
export const REMOVAL_REASONS = {
  transferred_out: { label: 'Transferred out', enrollment: 'transferred', learner: 'transferred' },
  dropped_out: { label: 'Dropped out', enrollment: 'dropped', learner: 'dropped' },
  moved_section: { label: 'Moved to another section', enrollment: 'dropped', learner: null },
};
export const REASON_CODES = Object.keys(REMOVAL_REASONS);
export const reasonLabel = (code) => REMOVAL_REASONS[code]?.label || '';

export const MAX_PENDING_PER_ADVISER = 20;
export const NOTE_MAX = 500;

// Removed from a request once it is decided or withdrawn; the rest of the form stays so a
// rejected add can be sent again with most of it filled in.
export const CONTACT_FIELDS = ['address', 'guardianContact', 'contactNumber'];

export const LEARNER_TEXT_FIELDS = ['lastName', 'firstName', 'middleName', 'extName', 'address',
  'guardianName', 'guardianRelationship', 'guardianContact', 'contactNumber'];
const TEXT_LIMITS = { lastName: 60, firstName: 60, middleName: 60, extName: 60, address: 200,
  guardianName: 60, guardianRelationship: 60, guardianContact: 60, contactNumber: 60 };
const TEXT_LABELS = { lastName: 'Last name', firstName: 'First name', middleName: 'Middle name', extName: 'Ext',
  address: 'Address', guardianName: 'Guardian name', guardianRelationship: 'Guardian relationship',
  guardianContact: 'Guardian contact', contactNumber: 'Contact number' };

// Trim, drop control characters and collapse runs of spaces.
export const cleanText = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

function birthdateError(text, today) {
  if (!text) return 'Birthdate is required.';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return 'Enter the birthdate as a real date.';
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return 'Enter the birthdate as a real date.';
  if (today && text > today) return 'Birthdate cannot be in the future.';
  return '';
}

// The Excel import's rules (src/lib/validation.js) plus length limits. `value` is the cleaned form,
// ready to store whether or not it passed; `today` is a YYYY-MM-DD in school time.
export function validateLearnerFields(input, { today } = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const value = { lrn: cleanText(source.lrn), sex: cleanText(source.sex).toUpperCase(), birthdate: cleanText(source.birthdate) };
  for (const key of LEARNER_TEXT_FIELDS) value[key] = cleanText(source[key]);
  const errors = {};
  if (!/^\d{12}$/.test(value.lrn)) errors.lrn = 'LRN must be exactly 12 digits.';
  if (!value.lastName) errors.lastName = 'Last name is required.';
  if (!value.firstName) errors.firstName = 'First name is required.';
  if (value.sex !== 'M' && value.sex !== 'F') errors.sex = 'Choose a sex.';
  const birthdate = birthdateError(value.birthdate, today);
  if (birthdate) errors.birthdate = birthdate;
  for (const key of LEARNER_TEXT_FIELDS) {
    if (!errors[key] && value[key].length > TEXT_LIMITS[key]) errors[key] = `Keep ${TEXT_LABELS[key]} within ${TEXT_LIMITS[key]} characters.`;
  }
  return { ok: Object.keys(errors).length === 0, errors, value };
}

// A blank enrollment type means "new", as in the import; anything else must be a known type.
export function validateEnrollType(input) {
  const value = cleanText(input).toLowerCase() || 'new';
  return ENROLL_TYPES.includes(value) ? { ok: true, value } : { ok: false, value, error: 'Enrollment type must be new, returning, or transferee.' };
}

export function validateRemoval(input) {
  const source = input && typeof input === 'object' ? input : {};
  const errors = {};
  const reasonCode = REASON_CODES.includes(source.reasonCode) ? source.reasonCode : '';
  if (!reasonCode) errors.reasonCode = 'Choose a reason.';
  const note = cleanText(source.note);
  if (!note) errors.note = 'Add a short note.';
  else if (note.length > NOTE_MAX) errors.note = `Keep the note within ${NOTE_MAX} characters.`;
  return { ok: Object.keys(errors).length === 0, errors, value: { reasonCode, note } };
}

export const addKey = (sectionId, lrn) => `add:${sectionId}:${lrn}`;
export const removeKey = (sectionId, studentId) => `remove:${sectionId}:${studentId}`;

// The section's Class Adviser for the actor's current school year.
export const isSectionAdviser = (actor, sectionId) =>
  currentAssignments(actor).some((a) => a.role === 'adviser' && a.sectionId === sectionId);

// Administrators, plus Curriculum Advisers and SIMS coordinators whose grades include `grade`.
export const coversGrade = (actor, grade) => actor?.isAdmin === true || reviewGrades(actor).includes(grade);

// Nobody decides their own request; nobody decides another school year's.
export function canDecideLearnerRequest(actor, request) {
  if (!actor || request?.status !== 'pending' || request.schoolYear !== actor.schoolYear) return false;
  return request.requestedByUid !== actor.uid && coversGrade(actor, request.gradeLevel);
}
```

`reviewGrades` already merges Curriculum Adviser assignments with SIMS coordinator scopes; it only needs to be exported:

```diff
--- a/shared/schoolAccess.js
+++ b/shared/schoolAccess.js
@@ -14,7 +14,7 @@ export const currentAssignments = actor => (actor?.assignments || []).filter(a =
 
 // Curriculum Adviser assignments and SIMS coordinator scopes both grant
 // grade-wide review; class advisers only reach their own section.
-const reviewGrades = actor => [
+export const reviewGrades = actor => [
   ...currentAssignments(actor).filter(a => a.role === 'curriculum_adviser').map(a => a.gradeLevel),
   ...(Array.isArray(actor?.simsGrades) ? actor.simsGrades : []),
 ];
```

- [ ] **Step 4: Run the tests to see them pass**

```powershell
npx vitest run shared/learnerRequests.test.js shared/schoolAccess.test.js
```

Expected: PASS, 2 test files and 24 tests.

- [ ] **Step 5: Commit**

```powershell
git add shared/learnerRequests.js shared/learnerRequests.test.js shared/schoolAccess.js
git commit -m "feat(shared): rules for adviser learner requests"
```

### Task 2: Backend, the adviser's calls

Filing an add, filing a removal, withdrawing, and the adviser's own list, plus the account-deletion hook.

**Files:**
- Create: `functions/src/lib/learnerRequestCleanup.js`, `functions/src/handlers/learnerRequests.js`, `functions/test/emulator/learnerRequests.test.js`
- Modify: `functions/src/callable.js`, `functions/src/handlers/schoolAccess.js`

**Interfaces:**
- Consumes: Task 1; `loadSchoolActor`, `inboxRef` from `schoolAccess.js`; `enforceRateLimit`, `LIMITS` from `callable.js`; `fullName` from `functions/src/lib/format.js`.
- Produces: `requestLearnerAdd(deps, { sectionId, student, enrollType })`, `requestLearnerRemoval(deps, { sectionId, studentId, reasonCode, note })`, `withdrawLearnerRequest(deps, { requestId })`, `getLearnerRequests(deps, { sectionId })` (each `deps` is `{ db, uid, email, displayName, now }`); `contactCleared(request)`, `pendingLearnerRequests(db, uid)`, `withdrawLearnerRequests(tx, snaps, reason)`; `LIMITS.learnerRequest`.

- [ ] **Step 1: Write the failing test**

It seeds a school with advisers, coordinators and learners, and covers filing, limits, withdrawing and account deletion. Later tasks append to it.

```js
import { beforeEach, describe, expect, it } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { requestLearnerAdd, requestLearnerRemoval, withdrawLearnerRequest, getLearnerRequests } from '../../src/handlers/learnerRequests.js';
import { deleteSchoolAccess } from '../../src/handlers/schoolAccess.js';

const year = '2026-2027';
const now = () => new Date('2026-10-22T09:00:00+08:00');
const people = {
  teacher: { email: 'teacher@deped.gov.ph', displayName: 'Tina Teacher' }, // Class Adviser of SEC1 (Grade 7 Rizal)
  other: { email: 'other@deped.gov.ph', displayName: 'Omar Other' }, // Class Adviser of SEC2 (Grade 7 Mabini)
  eight: { email: 'eight@deped.gov.ph', displayName: 'Eli Eight' }, // Class Adviser of SEC8 (Grade 8)
  admin: { email: 'admin@school.test', displayName: 'Ada Admin' },
  coord7: { email: 'coord7@school.test', displayName: 'Cora Seven' }, // SIMS Grade Level Coordinator, Grade 7
  coord8: { email: 'coord8@school.test', displayName: 'Carl Eight' }, // SIMS Grade Level Coordinator, Grade 8
  ca7: { email: 'ca7@deped.gov.ph', displayName: 'Cleo Curriculum' }, // Curriculum Adviser, Grade 7
};
const deps = (uid) => ({ db: db(), now, uid, email: people[uid].email, displayName: people[uid].displayName, authTime: 1792195200 });
const form = (over = {}) => ({
  lrn: '200000000001', lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos', extName: 'Jr', sex: 'M', birthdate: '2012-05-01',
  address: '123 Rizal St.', guardianName: 'Maria Dela Cruz', guardianRelationship: 'Mother', guardianContact: '09171234567', contactNumber: '09181234567', ...over,
});
const addInput = (over = {}) => ({ sectionId: 'SEC1', student: form(), enrollType: 'new', ...over });
const removal = (over = {}) => ({ sectionId: 'SEC1', studentId: 'S1', reasonCode: 'dropped_out', note: 'Stopped attending in September', ...over });
const file = (uid = 'teacher', over = {}) => requestLearnerAdd(deps(uid), addInput(over));
const get = async (path) => (await db().doc(path).get()).data();
const allRequests = async () => (await db().collection('learner_change_requests').get()).docs.map((d) => ({ id: d.id, ...d.data() }));

beforeEach(async () => {
  await clearAll(); await seedSchool();
  const d = db();
  await d.doc('sections/SEC2').set({ name: 'Mabini', gradeLevel: 7, schoolYear: year });
  await d.doc('sections/SEC8').set({ name: 'Eight', gradeLevel: 8, schoolYear: year });
  // S1 Ana Cruz (SEC1) and S2 Ben Dy (SEC2) are enrolled Grade 7 learners; S3 is Unassigned; S4 is in Grade 8.
  await d.doc('students/S1').update({ status: 'active', gradeLevel: 7, scopeSchoolYear: year });
  await d.doc('students/S2').update({ status: 'active', gradeLevel: 7, scopeSchoolYear: year });
  await d.doc('enrollments/S1_2026-2027').update({ gradeLevel: 7, type: 'new', dateEnrolled: '2026-06-01' });
  await d.doc('enrollments/S2_2026-2027').set({ studentId: 'S2', sectionId: 'SEC2', schoolYear: year, gradeLevel: 7, type: 'returning', dateEnrolled: '2026-06-02', status: 'enrolled' });
  await d.doc('students/S3').set({ lrn: '100000000003', firstName: 'Cara', lastName: 'Lim', sex: 'F', status: 'active', gradeLevel: null, scopeSchoolYear: null });
  await d.doc('students/S4').set({ lrn: '100000000004', firstName: 'Dan', lastName: 'Ong', sex: 'M', status: 'active', gradeLevel: 8, scopeSchoolYear: year });
  await d.doc('enrollments/S4_2026-2027').set({ studentId: 'S4', sectionId: 'SEC8', schoolYear: year, gradeLevel: 8, type: 'new', dateEnrolled: '2026-06-03', status: 'enrolled' });
  await d.doc('school_accounts/teacher').set({ assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 }] });
  await d.doc('school_accounts/other').set({ assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC2', gradeLevel: 7 }] });
  await d.doc('school_accounts/eight').set({ assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC8', gradeLevel: 8 }] });
  await d.doc('school_accounts/ca7').set({ assignments: [{ role: 'curriculum_adviser', schoolYear: year, gradeLevel: 7 }] });
  await d.doc('users/admin@school.test').set({ uid: 'admin', role: 'admin' });
  await d.doc('users/coord7@school.test').set({ uid: 'coord7', role: 'glc', gradeLevel: 7, name: 'Cora Seven' });
  await d.doc('users/coord8@school.test').set({ uid: 'coord8', role: 'glc', gradeLevel: 8, name: 'Carl Eight' });
});

describe('filing an add', () => {
  it('records a pending add with cleaned fields and an audit row, and creates no learner', async () => {
    const result = await requestLearnerAdd(deps('teacher'), addInput({ student: form({ lastName: '  Dela   Cruz ' }) }));
    expect(result.status).toBe('pending');
    const saved = await get(`learner_change_requests/${result.id}`);
    expect(saved).toMatchObject({
      kind: 'add', status: 'pending', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7, sectionName: 'Rizal', requestedByUid: 'teacher',
      requestedByEmail: 'teacher@deped.gov.ph', requestedByName: 'Tina Teacher', dedupeKey: 'add:SEC1:200000000001', enrollType: 'new',
      displayName: 'Juan Santos Dela Cruz Jr', student: expect.objectContaining({ lastName: 'Dela Cruz', address: '123 Rizal St.' }),
    });
    expect(saved.createdAt.toMillis()).toBeGreaterThan(0);
    expect((await db().collection('students').where('lrn', '==', '200000000001').get()).size).toBe(0);
    const audit = (await db().collection('audit_log').get()).docs.map((d) => d.data());
    expect(audit).toEqual([expect.objectContaining({ action: 'learner.addRequested', targetType: 'learner_request', targetId: result.id,
      details: { sectionId: 'SEC1', gradeLevel: 7, lrn: '200000000001', name: 'Juan Santos Dela Cruz Jr' } })]);
  });
  it("refuses anyone who is not this class's adviser", async () => {
    for (const uid of ['other', 'admin', 'coord7', 'ca7']) {
      await expect(requestLearnerAdd(deps(uid), addInput())).rejects.toMatchObject({ code: 'permission-denied' });
    }
    expect(await allRequests()).toEqual([]);
  });
  it('names the first problem with the form', async () => {
    const ask = (over) => requestLearnerAdd(deps('teacher'), over);
    await expect(ask(addInput({ student: form({ lrn: '123' }) }))).rejects.toMatchObject({ code: 'invalid-argument', message: 'LRN must be exactly 12 digits.' });
    await expect(ask(addInput({ student: form({ birthdate: '2099-01-01' }) }))).rejects.toMatchObject({ message: 'Birthdate cannot be in the future.' });
    await expect(ask(addInput({ enrollType: 'visitor' }))).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(ask({ student: form() })).rejects.toMatchObject({ code: 'invalid-argument', message: 'Choose a class.' });
  });
  it('refuses an LRN already in the class but quietly accepts one that lives elsewhere', async () => {
    await expect(requestLearnerAdd(deps('teacher'), addInput({ student: form({ lrn: '100000000001' }) })))
      .rejects.toMatchObject({ code: 'already-exists', message: 'This LRN is already in your class.' });
    // S2 is enrolled in another section: the adviser is not told whose record it is.
    const elsewhere = await requestLearnerAdd(deps('teacher'), addInput({ student: form({ lrn: '100000000002' }) }));
    expect(elsewhere.status).toBe('pending');
  });
  it('returns the waiting request when the same learner is sent twice', async () => {
    const first = await file();
    expect(await file()).toEqual(first);
    expect(await allRequests()).toHaveLength(1);
  });
  it('stops at 20 pending requests', async () => {
    for (let i = 0; i < 20; i++) await file('teacher', { student: form({ lrn: `3000000000${String(i).padStart(2, '0')}` }) });
    await expect(file('teacher', { student: form({ lrn: '300000000099' }) })).rejects.toMatchObject({ code: 'resource-exhausted' });
  }, 30000);
  it('limits how many requests one adviser can send in an hour', async () => {
    for (let i = 0; i < 30; i++) await file(); // repeats return the waiting request but still use the budget
    await expect(file()).rejects.toMatchObject({ code: 'resource-exhausted' });
  }, 30000);
  it('is blocked once the school year has ended', async () => {
    await db().doc(`school_years/${year}`).set({ endedAt: new Date() });
    await expect(file()).rejects.toMatchObject({ code: 'failed-precondition', message: 'This school year has ended.' });
  });
});

describe('filing a removal', () => {
  it('records a pending removal with the reason and an audit row', async () => {
    const { id } = await requestLearnerRemoval(deps('teacher'), removal());
    expect(await get(`learner_change_requests/${id}`)).toMatchObject({
      kind: 'remove', status: 'pending', sectionId: 'SEC1', gradeLevel: 7, studentId: 'S1', lrn: '100000000001', displayName: 'Ana B. Cruz',
      reasonCode: 'dropped_out', note: 'Stopped attending in September', dedupeKey: 'remove:SEC1:S1', requestedByUid: 'teacher',
    });
    const audit = (await db().collection('audit_log').where('action', '==', 'learner.removalRequested').get()).docs.map((d) => d.data());
    expect(audit[0].details).toMatchObject({ lrn: '100000000001', name: 'Ana B. Cruz', reasonCode: 'dropped_out' });
  });
  it('needs a learner in this class, a known reason and a note', async () => {
    await expect(requestLearnerRemoval(deps('teacher'), removal({ studentId: 'S2' }))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(requestLearnerRemoval(deps('teacher'), removal({ reasonCode: 'left' }))).rejects.toMatchObject({ code: 'invalid-argument', message: 'Choose a reason.' });
    await expect(requestLearnerRemoval(deps('teacher'), removal({ note: '  ' }))).rejects.toMatchObject({ code: 'invalid-argument', message: 'Add a short note.' });
    await expect(requestLearnerRemoval(deps('other'), removal())).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await allRequests()).toEqual([]);
  });
  it('returns the waiting request when the same learner is sent twice', async () => {
    const first = await requestLearnerRemoval(deps('teacher'), removal());
    expect(await requestLearnerRemoval(deps('teacher'), removal({ note: 'Typed again' }))).toEqual(first);
    expect(await allRequests()).toHaveLength(1);
  });
});

describe('withdrawing and listing as the adviser', () => {
  it('lets the adviser withdraw while waiting and clears the address and phone numbers', async () => {
    const { id } = await file();
    await withdrawLearnerRequest(deps('teacher'), { requestId: id });
    const saved = await get(`learner_change_requests/${id}`);
    expect(saved).toMatchObject({ status: 'withdrawn', decisionReason: 'Withdrawn by the adviser' });
    for (const field of ['address', 'guardianContact', 'contactNumber']) expect(saved.student).not.toHaveProperty(field);
    expect(saved.student).toMatchObject({ lrn: '200000000001', birthdate: '2012-05-01', guardianName: 'Maria Dela Cruz' });
    await expect(withdrawLearnerRequest(deps('teacher'), { requestId: id })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it("hides other people's requests", async () => {
    const { id } = await file();
    await expect(withdrawLearnerRequest(deps('other'), { requestId: id })).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('account deletion', () => {
  it('withdraws pending requests and clears the address when an adviser deletes their account', async () => {
    const { id } = await file();
    await deleteSchoolAccess(db(), 'teacher');
    const saved = await get(`learner_change_requests/${id}`);
    expect(saved).toMatchObject({ status: 'withdrawn', decisionReason: 'Account deleted' });
    expect(saved.student).not.toHaveProperty('address');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```powershell
npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/learnerRequests.test.js"
```

Expected: FAIL (`Failed to resolve import "../../src/handlers/learnerRequests.js"`).

- [ ] **Step 3: Add the rate limit and the cleanup helpers**

```diff
--- a/functions/src/callable.js
+++ b/functions/src/callable.js
@@ -19,6 +19,8 @@ export const LIMITS = {
   relationshipChange: { windowMs: 60 * 60 * 1000, max: 60 },
   // Preview and redeem of advisory slips share one budget per account.
   advisorySlip: { windowMs: 60 * 60 * 1000, max: 10 },
+  // Adviser requests to add or remove a learner (spec 2026-10-22).
+  learnerRequest: { windowMs: 60 * 60 * 1000, max: 30 },
   // SF2 downloads from the Class tab (spec 2026-10-22). Each builds a workbook, so keep it modest.
   sf2Export: { windowMs: 60 * 60 * 1000, max: 20 },
 };
```

```js
import { FieldValue } from 'firebase-admin/firestore';
import { CONTACT_FIELDS } from '../../shared/learnerRequests.js';

// An add keeps most of its form for "Send again", but its address and phone numbers go as soon
// as the request is decided or withdrawn (spec 2026-10-22).
export const contactCleared = (request) => (request?.kind === 'add'
  ? Object.fromEntries(CONTACT_FIELDS.map((field) => [`student.${field}`, FieldValue.delete()]))
  : {});

export const pendingLearnerRequests = (db, uid) =>
  db.collection('learner_change_requests').where('requestedByUid', '==', uid).where('status', '==', 'pending');

// `snaps` are document snapshots read earlier in the same transaction.
export function withdrawLearnerRequests(tx, snaps, reason) {
  for (const snap of snaps) {
    tx.update(snap.ref, { status: 'withdrawn', withdrawnAt: FieldValue.serverTimestamp(), decisionReason: reason, ...contactCleared(snap.data()) });
  }
}
```

Deleting an adviser's account withdraws their pending learner requests, as it already does for school role requests:

```diff
--- a/functions/src/handlers/schoolAccess.js
+++ b/functions/src/handlers/schoolAccess.js
@@ -5,6 +5,7 @@ import { roleOf, scopedGrades } from '../../shared/staffRoles.js';
 import { SCHOOL_ROLES, REQUESTABLE_ROLES, assignmentKey, canApproveRoleRequest, isGradeRole, isDepedEmail } from '../../shared/schoolAccess.js';
 import { enforceRateLimit } from '../callable.js';
 import { groupLegacyAdvisers, sampleStudentIds } from '../lib/legacyAdvisers.js';
+import { pendingLearnerRequests, withdrawLearnerRequests } from '../lib/learnerRequestCleanup.js';
 
 const fail = (code, message) => { throw new CallableError(code, message); };
 const DEPED_ONLY = 'Class Adviser requests need a @deped.gov.ph account.';
@@ -318,8 +319,9 @@ const row = snap => ({ id: snap.id, ...snap.data() });
 export async function deleteSchoolAccess(db, uid) {
   return db.runTransaction(async tx => {
     const ref = db.doc(`school_accounts/${uid}`);
-    const [account, pending] = await Promise.all([
+    const [account, pending, learnerRequests] = await Promise.all([
       tx.get(ref), tx.get(db.collection('school_role_requests').where('uid', '==', uid).where('status', '==', 'pending')),
+      tx.get(pendingLearnerRequests(db, uid)),
     ]);
     const advisers = (account.data()?.assignments || []).filter(a => a.role === 'adviser');
     const locks = await Promise.all(advisers.map(a => tx.get(lockRef(db, a))));
@@ -327,6 +329,7 @@ export async function deleteSchoolAccess(db, uid) {
     for (const lock of locks) if (lock.data()?.uid === uid) tx.delete(lock.ref);
     for (const section of sections) if (section.data()?.schoolAdviserUid === uid) tx.update(section.ref, { schoolAdviserUid: FieldValue.delete() });
     for (const request of pending.docs) tx.update(request.ref, { status: 'withdrawn', reason: 'Account deleted', reviewedAt: FieldValue.serverTimestamp() });
+    withdrawLearnerRequests(tx, learnerRequests.docs, 'Account deleted');
     tx.delete(ref);
   });
 }
```

- [ ] **Step 4: Write the handler**

The header declares everything the module will need; Tasks 3 and 4 add functions that use the rest.

```js
// Adviser requests to add or remove a learner, decided in SIMS (spec 2026-10-22).
// Advisers file from the Parent App; an Administrator, or whoever covers the grade, decides. Every
// call is a schoolCall, so authority comes from loadSchoolActor: an administrator, a Curriculum
// Adviser assignment or a SIMS coordinator scope. Nothing here is readable by clients directly.
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { loadSchoolActor, inboxRef } from './schoolAccess.js';
import { reviewGrades } from '../../shared/schoolAccess.js';
import { manilaDate } from '../../shared/dates.js';
import {
  MAX_PENDING_PER_ADVISER, NOTE_MAX, REMOVAL_REASONS, addKey, canDecideLearnerRequest, cleanText, coversGrade, isSectionAdviser,
  reasonLabel, removeKey, validateEnrollType, validateLearnerFields, validateRemoval,
} from '../../shared/learnerRequests.js';
import { fullName } from '../lib/format.js';
import { contactCleared, pendingLearnerRequests, withdrawLearnerRequests } from '../lib/learnerRequestCleanup.js';

const fail = (code, message) => { throw new CallableError(code, message); };
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const cursorId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 1500 && !value.includes('/');
const millis = (value) => (value?.toMillis ? value.toMillis() : null);
const clock = (deps) => (deps.now || (() => new Date()))();
const requestsOf = (db) => db.collection('learner_change_requests');
const classLabel = (section) => `Grade ${section.gradeLevel} · ${section.name || section.sectionName || section.id}`;
const TOO_MANY = () => 'Too many learner requests. Try again in a little while.';

const REQUEST_LIMIT = 200; // pending requests read per school year, filtered in code
const DECIDED_PAGE = 50;
const ADVISER_LIST = 50;
// Matches DOCS_DEFAULT in src/data/students.js: no paperwork on file yet.
const NEW_LEARNER_DOCUMENTS = { form137: false, birthCert: false, goodMoral: false, form138: false };
const STUDENT_FIELDS = ['lrn', 'lastName', 'firstName', 'middleName', 'extName', 'sex', 'birthdate', 'address',
  'guardianName', 'guardianRelationship', 'guardianContact', 'contactNumber'];
const scopeFor = (gradeLevel, schoolYear) => ({ gradeLevel, scopeSchoolYear: schoolYear });
const NO_SCOPE = { gradeLevel: null, scopeSchoolYear: null };

// School access audit rows use targetType 'school_assignment', which its History tab lists; learner
// requests have their own so they never show there.
const auditRow = (actor, action, targetId, details) => ({ action, actorType: 'staff', actorUid: actor.email,
  targetType: 'learner_request', targetId, details, at: FieldValue.serverTimestamp() });

function requireAdviser(actor, sectionId) {
  if (actor.ended) fail('failed-precondition', 'This school year has ended.');
  if (!isSectionAdviser(actor, sectionId)) fail('permission-denied', "Only this class's adviser can send learner requests.");
}

async function sectionOf(deps, tx, sectionId, actor) {
  const snap = await tx.get(deps.db.doc(`sections/${sectionId}`));
  const section = snap.exists ? { ...snap.data(), id: snap.id } : null;
  if (!section || section.schoolYear !== actor.schoolYear || !Number.isInteger(section.gradeLevel) || section.gradeLevel < 7 || section.gradeLevel > 12) {
    fail('failed-precondition', 'This section is unavailable for the current school year.');
  }
  return section;
}

const filing = (actor, deps, section, extra) => ({
  status: 'pending', schoolYear: section.schoolYear, sectionId: section.id, gradeLevel: section.gradeLevel, sectionName: section.name || '',
  requestedByUid: deps.uid, requestedByEmail: actor.email, requestedByName: actor.displayName, createdAt: FieldValue.serverTimestamp(), ...extra,
});

export async function requestLearnerAdd(deps, input) {
  if (!identifier(input?.sectionId)) fail('invalid-argument', 'Choose a class.');
  const fields = validateLearnerFields(input.student, { today: manilaDate(clock(deps)) });
  if (!fields.ok) fail('invalid-argument', Object.values(fields.errors)[0]);
  const type = validateEnrollType(input.enrollType);
  if (!type.ok) fail('invalid-argument', type.error);
  const student = fields.value;
  await enforceRateLimit(deps.db, deps.uid, 'learnerRequest', LIMITS.learnerRequest, clock(deps).getTime(), TOO_MANY);
  return deps.db.runTransaction(async (tx) => {
    const actor = await loadSchoolActor(deps, tx);
    requireAdviser(actor, input.sectionId);
    const section = await sectionOf(deps, tx, input.sectionId, actor);
    const key = addKey(section.id, student.lrn);
    const [same, mine, matches] = await Promise.all([
      tx.get(requestsOf(deps.db).where('dedupeKey', '==', key).where('status', '==', 'pending').limit(1)),
      tx.get(pendingLearnerRequests(deps.db, deps.uid)),
      tx.get(deps.db.collection('students').where('lrn', '==', student.lrn).limit(2)),
    ]);
    // A second tap, or a second device, finds the request already waiting.
    if (same.size) return { id: same.docs[0].id, status: 'pending' };
    if (matches.size === 1) {
      const enrollment = (await tx.get(deps.db.doc(`enrollments/${matches.docs[0].id}_${section.schoolYear}`))).data();
      if (enrollment?.status === 'enrolled' && enrollment.sectionId === section.id) fail('already-exists', 'This LRN is already in your class.');
    }
    if (mine.size >= MAX_PENDING_PER_ADVISER) fail('resource-exhausted', 'Wait for your pending requests to be decided.');
    const ref = requestsOf(deps.db).doc();
    tx.set(ref, filing(actor, deps, section, { kind: 'add', dedupeKey: key, student, enrollType: type.value, displayName: fullName(student) }));
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'learner.addRequested', ref.id,
      { sectionId: section.id, gradeLevel: section.gradeLevel, lrn: student.lrn, name: fullName(student) }));
    return { id: ref.id, status: 'pending' };
  });
}

export async function requestLearnerRemoval(deps, input) {
  if (!identifier(input?.sectionId) || !identifier(input?.studentId)) fail('invalid-argument', 'Choose a learner.');
  const removal = validateRemoval(input);
  if (!removal.ok) fail('invalid-argument', Object.values(removal.errors)[0]);
  await enforceRateLimit(deps.db, deps.uid, 'learnerRequest', LIMITS.learnerRequest, clock(deps).getTime(), TOO_MANY);
  return deps.db.runTransaction(async (tx) => {
    const actor = await loadSchoolActor(deps, tx);
    requireAdviser(actor, input.sectionId);
    const section = await sectionOf(deps, tx, input.sectionId, actor);
    const key = removeKey(section.id, input.studentId);
    const [same, mine, enrollment, student] = await Promise.all([
      tx.get(requestsOf(deps.db).where('dedupeKey', '==', key).where('status', '==', 'pending').limit(1)),
      tx.get(pendingLearnerRequests(deps.db, deps.uid)),
      tx.get(deps.db.doc(`enrollments/${input.studentId}_${section.schoolYear}`)),
      tx.get(deps.db.doc(`students/${input.studentId}`)),
    ]);
    if (!student.exists || enrollment.data()?.status !== 'enrolled' || enrollment.data().sectionId !== section.id) {
      fail('permission-denied', 'Learner is not enrolled in this section.');
    }
    if (same.size) return { id: same.docs[0].id, status: 'pending' };
    if (mine.size >= MAX_PENDING_PER_ADVISER) fail('resource-exhausted', 'Wait for your pending requests to be decided.');
    const name = fullName(student.data());
    const ref = requestsOf(deps.db).doc();
    tx.set(ref, filing(actor, deps, section, { kind: 'remove', dedupeKey: key, studentId: input.studentId, lrn: student.data().lrn || '',
      displayName: name, reasonCode: removal.value.reasonCode, note: removal.value.note }));
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'learner.removalRequested', ref.id,
      { sectionId: section.id, gradeLevel: section.gradeLevel, lrn: student.data().lrn || '', name, reasonCode: removal.value.reasonCode, note: removal.value.note }));
    return { id: ref.id, status: 'pending' };
  });
}

export async function withdrawLearnerRequest(deps, input) {
  if (!identifier(input?.requestId)) fail('invalid-argument', 'Choose a request.');
  const ref = requestsOf(deps.db).doc(input.requestId);
  return deps.db.runTransaction(async (tx) => {
    const actor = await loadSchoolActor(deps, tx);
    const snap = await tx.get(ref);
    const request = snap.data();
    if (!request || request.requestedByUid !== deps.uid) fail('not-found', 'Request not found.');
    if (request.status !== 'pending') fail('failed-precondition', 'This request was already decided.');
    withdrawLearnerRequests(tx, [snap], 'Withdrawn by the adviser');
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'learner.requestWithdrawn', ref.id,
      { sectionId: request.sectionId, gradeLevel: request.gradeLevel, lrn: request.kind === 'add' ? request.student?.lrn || '' : request.lrn || '', name: request.displayName || '' }));
    return { ok: true };
  });
}

const adviserRow = (snap) => {
  const r = snap.data();
  return {
    id: snap.id, kind: r.kind, status: r.status, displayName: r.displayName || '',
    lrn: r.kind === 'add' ? r.student?.lrn || '' : r.lrn || '', studentId: r.studentId || '', enrollType: r.enrollType || '',
    reasonCode: r.reasonCode || '', note: r.note || '', decisionReason: r.status === 'rejected' ? r.decisionReason || '' : '',
    createdAt: millis(r.createdAt), decidedAt: millis(r.decidedAt) ?? millis(r.withdrawnAt),
    // Only a rejected add is sent again, so only it hands the form back.
    student: r.kind === 'add' && r.status === 'rejected' ? r.student : undefined,
  };
};

export async function getLearnerRequests(deps, input) {
  if (!identifier(input?.sectionId)) fail('invalid-argument', 'Choose a class.');
  const actor = await loadSchoolActor(deps);
  requireAdviser(actor, input.sectionId);
  const snap = await requestsOf(deps.db).where('requestedByUid', '==', deps.uid).where('sectionId', '==', input.sectionId)
    .orderBy('createdAt', 'desc').limit(ADVISER_LIST).get();
  return { requests: snap.docs.map(adviserRow) };
}
```

- [ ] **Step 5: Run the tests to see them pass**

```powershell
npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run --no-file-parallelism test/emulator/learnerRequests.test.js test/emulator/schoolAccess.test.js"
```

Expected: PASS, 2 test files and 45 tests (14 new, plus the 31 existing School access tests, which proves the deletion hook broke nothing).

- [ ] **Step 6: Commit**

```powershell
git add functions/src/lib/learnerRequestCleanup.js functions/src/handlers/learnerRequests.js functions/test/emulator/learnerRequests.test.js functions/src/callable.js functions/src/handlers/schoolAccess.js
git commit -m "feat(functions): advisers file, withdraw and list learner requests"
```

### Task 3: Backend, what reviewers see

The Waiting list (with the "already in SIMS" flag), the Decided list with paging, and the badge count.

**Files:**
- Modify: `functions/src/handlers/learnerRequests.js`, `functions/test/emulator/learnerRequests.test.js`

**Interfaces:**
- Consumes: Task 2.
- Produces: `listLearnerRequests(deps, { view: 'waiting' | 'decided', cursor })` → `{ schoolYear, ended, requests, nextCursor }`, where each waiting add carries `existing` (`null` or `{ exists, needsAdmin, enrolledHere, displayName?, learnerStatus?, currentGrade?, currentSection?, ambiguous? }`) and every row carries `decidable`; `getLearnerRequestCount(deps)` → `{ count }` (only requests the caller can decide).

- [ ] **Step 1: Add the failing tests**

Change the test's imports and helpers, and append the new block at the end:

```diff
--- a/functions/test/emulator/learnerRequests.test.js
+++ b/functions/test/emulator/learnerRequests.test.js
@@ -1,6 +1,9 @@
 import { beforeEach, describe, expect, it } from 'vitest';
+import { FieldValue, Timestamp } from 'firebase-admin/firestore';
 import { db, clearAll, seedSchool } from './helpers.js';
-import { requestLearnerAdd, requestLearnerRemoval, withdrawLearnerRequest, getLearnerRequests } from '../../src/handlers/learnerRequests.js';
+import {
+  requestLearnerAdd, requestLearnerRemoval, withdrawLearnerRequest, getLearnerRequests, listLearnerRequests, getLearnerRequestCount,
+} from '../../src/handlers/learnerRequests.js';
 import { deleteSchoolAccess } from '../../src/handlers/schoolAccess.js';
 
 const year = '2026-2027';
@@ -24,6 +27,7 @@ const removal = (over = {}) => ({ sectionId: 'SEC1', studentId: 'S1', reasonCode
 const file = (uid = 'teacher', over = {}) => requestLearnerAdd(deps(uid), addInput(over));
 const get = async (path) => (await db().doc(path).get()).data();
 const allRequests = async () => (await db().collection('learner_change_requests').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
+const waitingIds = async (uid) => (await listLearnerRequests(deps(uid), { view: 'waiting' })).requests.map((r) => r.id);
 
 beforeEach(async () => {
   await clearAll(); await seedSchool();
@@ -151,3 +155,56 @@ describe('account deletion', () => {
     expect(saved.student).not.toHaveProperty('address');
   });
 });
+
+describe('what reviewers see', () => {
+  it('scopes the waiting list and the count to the grades a reviewer covers', async () => {
+    const grade7 = await file('teacher');
+    const grade8 = await requestLearnerAdd(deps('eight'), addInput({ sectionId: 'SEC8', student: form({ lrn: '200000000002' }) }));
+    expect(await waitingIds('admin')).toEqual([grade7.id, grade8.id]);
+    expect(await waitingIds('coord7')).toEqual([grade7.id]);
+    expect(await waitingIds('ca7')).toEqual([grade7.id]);
+    expect(await waitingIds('coord8')).toEqual([grade8.id]);
+    expect(await waitingIds('teacher')).toEqual([]);
+    expect(await getLearnerRequestCount(deps('admin'))).toEqual({ count: 2 });
+    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 1 });
+    expect(await getLearnerRequestCount(deps('teacher'))).toEqual({ count: 0 });
+  });
+  it('flags an LRN already in SIMS and shows whose it is only to reviewers who may see it', async () => {
+    const inOtherSection = await file('teacher', { student: form({ lrn: '100000000002' }) }); // S2, Grade 7, Mabini
+    const unassigned = await file('teacher', { student: form({ lrn: '100000000003' }) }); // S3, no enrollment
+    const find = (rows, id) => rows.find((r) => r.id === id);
+    const coordinator = (await listLearnerRequests(deps('coord7'), { view: 'waiting' })).requests;
+    expect(find(coordinator, inOtherSection.id)).toMatchObject({ decidable: true,
+      existing: { exists: true, needsAdmin: false, displayName: 'Ben Dy', currentGrade: 7, currentSection: 'Mabini', learnerStatus: 'active' } });
+    expect(find(coordinator, unassigned.id)).toMatchObject({ decidable: false, existing: { exists: true, needsAdmin: true } });
+    expect(find(coordinator, unassigned.id).existing).not.toHaveProperty('displayName');
+    const admin = (await listLearnerRequests(deps('admin'), { view: 'waiting' })).requests;
+    expect(find(admin, unassigned.id)).toMatchObject({ decidable: true,
+      existing: { needsAdmin: false, displayName: 'Cara Lim', currentGrade: null, learnerStatus: 'active' } });
+    expect(await getLearnerRequestCount(deps('coord7'))).toEqual({ count: 1 });
+    expect(await getLearnerRequestCount(deps('admin'))).toEqual({ count: 2 });
+  });
+  it('pages through decided requests for the reviewer’s grades, newest first', async () => {
+    const decided = (id, over) => db().doc(`learner_change_requests/${id}`).set({ kind: 'add', status: 'approved', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7,
+      displayName: id, student: { lrn: '400000000000' }, requestedByUid: 'teacher', requestedByName: 'Tina Teacher', decidedByName: 'Ada Admin', decisionReason: 'Approved',
+      createdAt: Timestamp.fromMillis(Date.UTC(2026, 8, 1)), decidedAt: Timestamp.fromMillis(Date.UTC(2026, 9, 1)), ...over });
+    const base = Date.UTC(2026, 9, 1);
+    for (let i = 0; i < 52; i++) await decided(`d${String(i).padStart(2, '0')}`, { decidedAt: Timestamp.fromMillis(base + i * 1000) });
+    await decided('g8', { gradeLevel: 8, sectionId: 'SEC8', decidedAt: Timestamp.fromMillis(base + 60000) });
+    await decided('w1', { status: 'withdrawn', withdrawnAt: Timestamp.fromMillis(base + 61000) });
+    await db().doc('learner_change_requests/w1').update({ decidedAt: FieldValue.delete() }); // withdrawn requests have none
+    const first = await listLearnerRequests(deps('coord7'), { view: 'decided' });
+    expect(first.requests).toHaveLength(50);
+    expect(first.requests[0].id).toBe('d51');
+    expect(first.requests[49].id).toBe('d02');
+    expect(first.nextCursor).toEqual({ ms: base + 2000, id: 'd02' });
+    const second = await listLearnerRequests(deps('coord7'), { view: 'decided', cursor: first.nextCursor });
+    expect(second.requests.map((r) => r.id)).toEqual(['d01', 'd00']);
+    expect(second.nextCursor).toBeNull();
+    const admin = (await listLearnerRequests(deps('admin'), { view: 'decided' })).requests.map((r) => r.id);
+    expect(admin[0]).toBe('g8');
+    expect(admin).not.toContain('w1');
+    expect((await listLearnerRequests(deps('coord8'), { view: 'decided' })).requests.map((r) => r.id)).toEqual(['g8']);
+    expect((await listLearnerRequests(deps('teacher'), { view: 'decided' })).requests).toEqual([]);
+  }, 30000);
+});
```

- [ ] **Step 2: Run them to see them fail**

```powershell
npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/learnerRequests.test.js"
```

Expected: FAIL. The three new tests fail because `listLearnerRequests` and `getLearnerRequestCount` are not exported yet (`is not a function`); the 14 earlier tests still pass.

- [ ] **Step 3: Add the reviewer functions**

Append to `functions/src/handlers/learnerRequests.js`:

```diff
--- a/functions/src/handlers/learnerRequests.js
+++ b/functions/src/handlers/learnerRequests.js
@@ -158,3 +158,72 @@ export async function getLearnerRequests(deps, input) {
     .orderBy('createdAt', 'desc').limit(ADVISER_LIST).get();
   return { requests: snap.docs.map(adviserRow) };
 }
+
+// What a reviewer needs to know about an LRN that is already in SIMS. A learner counts as inside an
+// approver's grades only through a current enrolled enrollment (the rule scopeRoster applies), so an
+// Unassigned, Dropped or Transferred learner, or one in another grade, is for Administrators.
+async function existingLearner(deps, actor, request) {
+  const found = await deps.db.collection('students').where('lrn', '==', request.student?.lrn || '').limit(2).get();
+  if (found.empty) return null;
+  if (found.size > 1) return { exists: true, ambiguous: true, needsAdmin: !actor.isAdmin };
+  const student = found.docs[0];
+  const enrollment = (await deps.db.doc(`enrollments/${student.id}_${request.schoolYear}`).get()).data();
+  const enrolled = enrollment?.status === 'enrolled';
+  const inScope = enrolled && coversGrade(actor, enrollment.gradeLevel);
+  const flag = { exists: true, needsAdmin: !actor.isAdmin && !inScope, enrolledHere: enrolled && enrollment.sectionId === request.sectionId };
+  if (actor.isAdmin || inScope) {
+    const section = enrolled ? (await deps.db.doc(`sections/${enrollment.sectionId}`).get()).data() : null;
+    Object.assign(flag, { displayName: fullName(student.data()), learnerStatus: student.data().status || 'active',
+      currentGrade: enrolled ? enrollment.gradeLevel : null, currentSection: section?.name || '' });
+  }
+  return flag;
+}
+
+const reviewerRow = (snap, flag, actor) => {
+  const r = snap.data();
+  const row = {
+    id: snap.id, kind: r.kind, status: r.status, schoolYear: r.schoolYear, gradeLevel: r.gradeLevel, sectionId: r.sectionId,
+    sectionName: r.sectionName || '', requestedByName: r.requestedByName || r.requestedByEmail || '', requestedByEmail: r.requestedByEmail || '',
+    displayName: r.displayName || '', lrn: r.kind === 'add' ? r.student?.lrn || '' : r.lrn || '', createdAt: millis(r.createdAt),
+    decidedAt: millis(r.decidedAt), decidedByName: r.decidedByName || '', decisionReason: r.decisionReason || '',
+  };
+  if (r.kind === 'add') Object.assign(row, { student: r.student, enrollType: r.enrollType, existing: flag || null });
+  else Object.assign(row, { studentId: r.studentId, reasonCode: r.reasonCode, note: r.note });
+  row.decidable = r.status === 'pending' && (actor.isAdmin || !flag?.needsAdmin);
+  return row;
+};
+
+async function waitingRows(deps, actor) {
+  if (actor.ended || (!actor.isAdmin && !reviewGrades(actor).length)) return [];
+  const snap = await requestsOf(deps.db).where('status', '==', 'pending').where('schoolYear', '==', actor.schoolYear)
+    .orderBy('createdAt', 'asc').limit(REQUEST_LIMIT).get();
+  const mine = snap.docs.filter((d) => canDecideLearnerRequest(actor, d.data()));
+  return Promise.all(mine.map(async (d) => reviewerRow(d, d.data().kind === 'add' ? await existingLearner(deps, actor, d.data()) : null, actor)));
+}
+
+export async function listLearnerRequests(deps, input) {
+  const view = input?.view ?? 'waiting';
+  if (!['waiting', 'decided'].includes(view)) fail('invalid-argument', 'Choose waiting or decided requests.');
+  const cursor = input?.cursor ?? null;
+  if (cursor != null && !(typeof cursor === 'object' && !Array.isArray(cursor) && Number.isSafeInteger(cursor.ms) && cursorId(cursor.id))) fail('invalid-argument', 'Choose a valid page.');
+  const actor = await loadSchoolActor(deps);
+  const base = { schoolYear: actor.schoolYear, ended: actor.ended };
+  if (view === 'waiting') return { ...base, requests: await waitingRows(deps, actor), nextCursor: null };
+  const grades = [...new Set(reviewGrades(actor))];
+  if (!actor.isAdmin && !grades.length) return { ...base, requests: [], nextCursor: null };
+  let query = requestsOf(deps.db).where('schoolYear', '==', actor.schoolYear);
+  if (!actor.isAdmin) query = query.where('gradeLevel', 'in', grades);
+  // Withdrawn requests have no decidedAt, so only approved and rejected ones appear here.
+  query = query.orderBy('decidedAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
+  if (cursor) query = query.startAfter(Timestamp.fromMillis(cursor.ms), cursor.id);
+  const snap = await query.limit(DECIDED_PAGE).get();
+  const requests = snap.docs.map((d) => reviewerRow(d, null, actor));
+  const last = snap.docs[snap.docs.length - 1];
+  return { ...base, requests, nextCursor: snap.size === DECIDED_PAGE ? { ms: millis(last.data().decidedAt), id: last.id } : null };
+}
+
+export async function getLearnerRequestCount(deps) {
+  const actor = await loadSchoolActor(deps);
+  const rows = await waitingRows(deps, actor);
+  return { count: rows.filter((r) => r.decidable).length };
+}
```

- [ ] **Step 4: Run the tests to see them pass**

```powershell
npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/learnerRequests.test.js"
```

Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```powershell
git add functions/src/handlers/learnerRequests.js functions/test/emulator/learnerRequests.test.js
git commit -m "feat(functions): reviewers list and count learner requests"
```

### Task 4: Backend, decisions

Approve or reject, in one transaction: create or move the learner, end an enrollment, write the audit row and the adviser's Inbox note.

**Files:**
- Modify: `functions/src/handlers/learnerRequests.js`, `functions/test/emulator/learnerRequests.test.js`

**Interfaces:**
- Consumes: Tasks 2 and 3.
- Produces: `resolveLearnerRequest(deps, { requestId, approve, reason })` → `{ ok: true }`. Failures use these codes and messages: `permission-denied` "You cannot review this request." / "An administrator must approve this request."; `failed-precondition` "Already decided.", "This school year has ended.", "The adviser no longer holds this class. Reject this request.", "This section changed. Reject this request and ask for a new one.", "<name> is no longer in this class. Reject this request.", "This LRN matches more than one learner. An administrator must fix the records first."; `already-exists` "<name> is already in this class. Reject this request."; `invalid-argument` when a rejection has no reason.

- [ ] **Step 1: Add the failing tests**

```diff
--- a/functions/test/emulator/learnerRequests.test.js
+++ b/functions/test/emulator/learnerRequests.test.js
@@ -2,7 +2,8 @@ import { beforeEach, describe, expect, it } from 'vitest';
 import { FieldValue, Timestamp } from 'firebase-admin/firestore';
 import { db, clearAll, seedSchool } from './helpers.js';
 import {
-  requestLearnerAdd, requestLearnerRemoval, withdrawLearnerRequest, getLearnerRequests, listLearnerRequests, getLearnerRequestCount,
+  requestLearnerAdd, requestLearnerRemoval, withdrawLearnerRequest, getLearnerRequests, listLearnerRequests,
+  resolveLearnerRequest, getLearnerRequestCount,
 } from '../../src/handlers/learnerRequests.js';
 import { deleteSchoolAccess } from '../../src/handlers/schoolAccess.js';
 
@@ -27,6 +28,7 @@ const removal = (over = {}) => ({ sectionId: 'SEC1', studentId: 'S1', reasonCode
 const file = (uid = 'teacher', over = {}) => requestLearnerAdd(deps(uid), addInput(over));
 const get = async (path) => (await db().doc(path).get()).data();
 const allRequests = async () => (await db().collection('learner_change_requests').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
+const inboxOf = async (uid) => (await db().collection(`guardians/${uid}/inbox`).get()).docs.map((d) => d.data());
 const waitingIds = async (uid) => (await listLearnerRequests(deps(uid), { view: 'waiting' })).requests.map((r) => r.id);
 
 beforeEach(async () => {
@@ -208,3 +210,157 @@ describe('what reviewers see', () => {
     expect((await listLearnerRequests(deps('teacher'), { view: 'decided' })).requests).toEqual([]);
   }, 30000);
 });
+
+describe('approving an add', () => {
+  it('creates the learner and enrollment, clears the contact fields and tells the adviser', async () => {
+    const { id } = await file();
+    await resolveLearnerRequest(deps('admin'), { requestId: id, approve: true });
+    const [created] = (await db().collection('students').where('lrn', '==', '200000000001').get()).docs;
+    expect(created.data()).toEqual({
+      lrn: '200000000001', lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos', extName: 'Jr', sex: 'M', birthdate: '2012-05-01',
+      address: '123 Rizal St.', guardianName: 'Maria Dela Cruz', guardianRelationship: 'Mother', guardianContact: '09171234567', contactNumber: '09181234567',
+      status: 'active', documents: { form137: false, birthCert: false, goodMoral: false, form138: false }, createdAt: '2026-10-22',
+      gradeLevel: 7, scopeSchoolYear: year,
+    });
+    expect(await get(`enrollments/${created.id}_${year}`)).toEqual({ studentId: created.id, schoolYear: year, gradeLevel: 7, sectionId: 'SEC1',
+      track: null, strand: null, type: 'new', dateEnrolled: '2026-10-22', status: 'enrolled' });
+    const request = await get(`learner_change_requests/${id}`);
+    expect(request).toMatchObject({ status: 'approved', decidedByUid: 'admin', decidedByName: 'Ada Admin', decisionReason: 'Approved' });
+    for (const field of ['address', 'guardianContact', 'contactNumber']) expect(request.student).not.toHaveProperty(field);
+    expect(await inboxOf('teacher')).toEqual([expect.objectContaining({ type: 'learner_request', requestId: id, title: 'Learner added',
+      body: 'Juan Santos Dela Cruz Jr was added to Grade 7 · Rizal.' })]);
+    const audit = (await db().collection('audit_log').where('action', '==', 'learner.addApproved').get()).docs.map((d) => d.data());
+    expect(audit[0]).toMatchObject({ targetType: 'learner_request', targetId: id, actorUid: 'admin@school.test', details: { lrn: '200000000001', mode: 'new', sectionId: 'SEC1' } });
+  });
+  it('lets a coordinator and a Curriculum Adviser for the grade approve', async () => {
+    const a = await file('teacher');
+    await resolveLearnerRequest(deps('coord7'), { requestId: a.id, approve: true, reason: 'Checked the papers' });
+    expect(await get(`learner_change_requests/${a.id}`)).toMatchObject({ status: 'approved', decidedByUid: 'coord7', decisionReason: 'Checked the papers' });
+    const b = await file('teacher', { student: form({ lrn: '200000000002' }) });
+    await resolveLearnerRequest(deps('ca7'), { requestId: b.id, approve: true });
+    expect((await get(`learner_change_requests/${b.id}`)).status).toBe('approved');
+  });
+  it('refuses a coordinator for another grade, an adviser and the requester', async () => {
+    const { id } = await file();
+    for (const uid of ['coord8', 'other', 'teacher']) {
+      await expect(resolveLearnerRequest(deps(uid), { requestId: id, approve: true })).rejects.toMatchObject({ code: 'permission-denied' });
+    }
+    expect((await get(`learner_change_requests/${id}`)).status).toBe('pending');
+  });
+  it('moves a learner enrolled in another section, keeping their details and enrollment date', async () => {
+    const { id } = await file('teacher', { student: form({ lrn: '100000000002', lastName: 'Typed Differently' }) });
+    await resolveLearnerRequest(deps('coord7'), { requestId: id, approve: true });
+    expect(await get('enrollments/S2_2026-2027')).toMatchObject({ sectionId: 'SEC1', gradeLevel: 7, type: 'returning', dateEnrolled: '2026-06-02', status: 'enrolled' });
+    expect(await get('students/S2')).toMatchObject({ lastName: 'Dy', status: 'active', gradeLevel: 7, scopeSchoolYear: year });
+    expect((await db().collection('students').where('lrn', '==', '100000000002').get()).size).toBe(1);
+    const audit = (await db().collection('audit_log').where('action', '==', 'learner.addApproved').get()).docs.map((d) => d.data());
+    expect(audit[0].details).toMatchObject({ mode: 'moved', previousSectionId: 'SEC2' });
+  });
+  it('enrolls an Unassigned learner only when an Administrator approves', async () => {
+    const { id } = await file('teacher', { student: form({ lrn: '100000000003' }), enrollType: 'returning' });
+    await expect(resolveLearnerRequest(deps('coord7'), { requestId: id, approve: true }))
+      .rejects.toMatchObject({ code: 'permission-denied', message: 'An administrator must approve this request.' });
+    await resolveLearnerRequest(deps('admin'), { requestId: id, approve: true });
+    expect(await get('enrollments/S3_2026-2027')).toMatchObject({ sectionId: 'SEC1', gradeLevel: 7, type: 'returning', dateEnrolled: '2026-10-22', status: 'enrolled' });
+    expect(await get('students/S3')).toMatchObject({ status: 'active', gradeLevel: 7, scopeSchoolYear: year, firstName: 'Cara' });
+  });
+  it('brings a Dropped learner back for an Administrator', async () => {
+    await db().doc('students/S3').update({ status: 'dropped' });
+    const { id } = await file('teacher', { student: form({ lrn: '100000000003' }) });
+    await resolveLearnerRequest(deps('admin'), { requestId: id, approve: true });
+    expect(await get('students/S3')).toMatchObject({ status: 'active', gradeLevel: 7 });
+  });
+  it('leaves a learner from another grade to an Administrator', async () => {
+    const { id } = await file('teacher', { student: form({ lrn: '100000000004' }) });
+    await expect(resolveLearnerRequest(deps('coord7'), { requestId: id, approve: true })).rejects.toMatchObject({ code: 'permission-denied' });
+    await resolveLearnerRequest(deps('admin'), { requestId: id, approve: true });
+    expect(await get('enrollments/S4_2026-2027')).toMatchObject({ sectionId: 'SEC1', gradeLevel: 7 });
+    expect(await get('students/S4')).toMatchObject({ gradeLevel: 7, scopeSchoolYear: year });
+  });
+  it('refuses a learner who joined this class meanwhile and leaves the request waiting', async () => {
+    const { id } = await file('teacher', { student: form({ lrn: '100000000002' }) });
+    await db().doc('enrollments/S2_2026-2027').update({ sectionId: 'SEC1' });
+    await expect(resolveLearnerRequest(deps('admin'), { requestId: id, approve: true })).rejects.toMatchObject({ code: 'already-exists' });
+    expect((await get(`learner_change_requests/${id}`)).status).toBe('pending');
+  });
+  it('refuses two learners that share an LRN', async () => {
+    await db().doc('students/D1').set({ lrn: '200000000001', firstName: 'A', lastName: 'One', sex: 'M' });
+    await db().doc('students/D2').set({ lrn: '200000000001', firstName: 'B', lastName: 'Two', sex: 'M' });
+    const { id } = await file();
+    await expect(resolveLearnerRequest(deps('admin'), { requestId: id, approve: true })).rejects.toMatchObject({ code: 'failed-precondition' });
+  });
+  it('blocks approval when the adviser has lost the class, but a rejection still works', async () => {
+    const { id } = await file();
+    await db().doc('school_accounts/teacher').set({ assignments: [] });
+    await expect(resolveLearnerRequest(deps('admin'), { requestId: id, approve: true }))
+      .rejects.toMatchObject({ code: 'failed-precondition', message: 'The adviser no longer holds this class. Reject this request.' });
+    await resolveLearnerRequest(deps('admin'), { requestId: id, approve: false, reason: 'No longer your class' });
+    expect((await get(`learner_change_requests/${id}`)).status).toBe('rejected');
+  });
+  it('blocks approval when the section changed grade', async () => {
+    const { id } = await file();
+    await db().doc('sections/SEC1').update({ gradeLevel: 8 });
+    await expect(resolveLearnerRequest(deps('admin'), { requestId: id, approve: true })).rejects.toMatchObject({ code: 'failed-precondition' });
+  });
+  it('cannot be decided twice or after the school year ended', async () => {
+    const { id } = await file();
+    await resolveLearnerRequest(deps('admin'), { requestId: id, approve: true });
+    await expect(resolveLearnerRequest(deps('admin'), { requestId: id, approve: true })).rejects.toMatchObject({ code: 'failed-precondition', message: 'Already decided.' });
+    const next = await file('teacher', { student: form({ lrn: '200000000005' }) });
+    await db().doc(`school_years/${year}`).set({ endedAt: new Date() });
+    await expect(resolveLearnerRequest(deps('admin'), { requestId: next.id, approve: true })).rejects.toMatchObject({ code: 'failed-precondition', message: 'This school year has ended.' });
+  });
+});
+
+describe('approving a removal', () => {
+  it.each([
+    ['transferred_out', 'transferred', 'transferred'],
+    ['dropped_out', 'dropped', 'dropped'],
+    ['moved_section', 'dropped', 'active'],
+  ])('%s ends the enrollment and sets the learner status', async (reasonCode, enrollmentStatus, learnerStatus) => {
+    const { id } = await requestLearnerRemoval(deps('teacher'), removal({ reasonCode }));
+    await resolveLearnerRequest(deps('coord7'), { requestId: id, approve: true });
+    expect(await get('enrollments/S1_2026-2027')).toMatchObject({ status: enrollmentStatus, sectionId: 'SEC1' });
+    expect(await get('students/S1')).toMatchObject({ status: learnerStatus, gradeLevel: null, scopeSchoolYear: null, firstName: 'Ana' });
+    const [note] = await inboxOf('teacher');
+    expect(note).toMatchObject({ type: 'learner_request', title: 'Learner removed' });
+    expect(note.body).toContain('Ana B. Cruz was removed from Grade 7 · Rizal');
+    const audit = (await db().collection('audit_log').where('action', '==', 'learner.removalApproved').get()).docs.map((d) => d.data());
+    expect(audit[0].details).toMatchObject({ reasonCode, note: 'Stopped attending in September' });
+  });
+  it('refuses when the learner has already left the class', async () => {
+    const { id } = await requestLearnerRemoval(deps('teacher'), removal());
+    await db().doc('enrollments/S1_2026-2027').update({ status: 'dropped' });
+    await expect(resolveLearnerRequest(deps('admin'), { requestId: id, approve: true }))
+      .rejects.toMatchObject({ code: 'failed-precondition', message: 'Ana B. Cruz is no longer in this class. Reject this request.' });
+  });
+});
+
+describe('rejecting', () => {
+  it('needs a reason, then tells the adviser and changes nothing', async () => {
+    const { id } = await file();
+    await expect(resolveLearnerRequest(deps('admin'), { requestId: id, approve: false })).rejects.toMatchObject({ code: 'invalid-argument' });
+    await resolveLearnerRequest(deps('coord7'), { requestId: id, approve: false, reason: 'Birthdate does not match the birth certificate' });
+    const request = await get(`learner_change_requests/${id}`);
+    expect(request).toMatchObject({ status: 'rejected', decisionReason: 'Birthdate does not match the birth certificate' });
+    for (const field of ['address', 'guardianContact', 'contactNumber']) expect(request.student).not.toHaveProperty(field);
+    expect(await inboxOf('teacher')).toEqual([expect.objectContaining({ type: 'learner_request', rejected: true, title: 'Request not approved',
+      body: 'Adding Juan Santos Dela Cruz Jr was not approved. Reason: Birthdate does not match the birth certificate' })]);
+    expect((await db().collection('students').where('lrn', '==', '200000000001').get()).size).toBe(0);
+  });
+});
+
+describe('the adviser’s list after a decision', () => {
+  it('lists own requests newest first and hands back the form only for a rejected add', async () => {
+    const first = await file('teacher', { student: form({ lrn: '200000000001' }) });
+    const second = await requestLearnerRemoval(deps('teacher'), removal());
+    await resolveLearnerRequest(deps('admin'), { requestId: first.id, approve: false, reason: 'LRN looks wrong' });
+    const { requests } = await getLearnerRequests(deps('teacher'), { sectionId: 'SEC1' });
+    expect(requests.map((r) => r.id)).toEqual([second.id, first.id]);
+    expect(requests[0]).toMatchObject({ kind: 'remove', status: 'pending', reasonCode: 'dropped_out', studentId: 'S1' });
+    expect(requests[0].student).toBeUndefined();
+    expect(requests[1]).toMatchObject({ kind: 'add', status: 'rejected', decisionReason: 'LRN looks wrong', student: expect.objectContaining({ lrn: '200000000001', firstName: 'Juan' }) });
+    expect(requests[1].student).not.toHaveProperty('address');
+    await expect(getLearnerRequests(deps('other'), { sectionId: 'SEC1' })).rejects.toMatchObject({ code: 'permission-denied' });
+  });
+});
```

- [ ] **Step 2: Run them to see them fail**

```powershell
npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/learnerRequests.test.js"
```

Expected: FAIL. The new decision tests fail (`resolveLearnerRequest is not a function`); the 17 earlier tests still pass.

- [ ] **Step 3: Add the decision function**

Append the outcome wording and `resolveLearnerRequest` to `functions/src/handlers/learnerRequests.js`:

```diff
--- a/functions/src/handlers/learnerRequests.js
+++ b/functions/src/handlers/learnerRequests.js
@@ -227,3 +227,104 @@ export async function getLearnerRequestCount(deps) {
   const rows = await waitingRows(deps, actor);
   return { count: rows.filter((r) => r.decidable).length };
 }
+
+const OUTCOME_TEXT = { add: 'Learner added', remove: 'Learner removed' };
+
+export async function resolveLearnerRequest(deps, input) {
+  if (!identifier(input?.requestId) || typeof input.approve !== 'boolean') fail('invalid-argument', 'Choose a request and a decision.');
+  const text = typeof input.reason === 'string' ? cleanText(input.reason) : '';
+  if (text.length > NOTE_MAX) fail('invalid-argument', `Keep the reason within ${NOTE_MAX} characters.`);
+  if (!input.approve && !text) fail('invalid-argument', 'Tell the adviser why. Enter a reason of 1–500 characters.');
+  const approve = input.approve;
+  const reason = text || 'Approved';
+  const db = deps.db;
+  const ref = requestsOf(db).doc(input.requestId);
+  return db.runTransaction(async (tx) => {
+    const actor = await loadSchoolActor(deps, tx);
+    if (actor.ended) fail('failed-precondition', 'This school year has ended.');
+    const snap = await tx.get(ref);
+    const request = snap.data();
+    if (!request) fail('not-found', 'Request not found.');
+    if (request.status !== 'pending') fail('failed-precondition', 'Already decided.');
+    if (!canDecideLearnerRequest(actor, request)) fail('permission-denied', 'You cannot review this request.');
+    const decision = { status: approve ? 'approved' : 'rejected', decidedAt: FieldValue.serverTimestamp(), decidedByUid: actor.uid,
+      decidedByEmail: actor.email, decidedByName: actor.displayName, decisionReason: reason, ...contactCleared(request) };
+    const name = request.displayName || '';
+    let note;
+    let audit;
+
+    if (!approve) {
+      note = { title: 'Request not approved', body: `${request.kind === 'add' ? 'Adding' : 'Removing'} ${name} was not approved. Reason: ${reason}`, rejected: true };
+      audit = { action: 'learner.requestRejected', details: { kind: request.kind, lrn: request.kind === 'add' ? request.student.lrn : request.lrn, name, reason } };
+    } else {
+      // Everything is read before the first write.
+      const [sectionSnap, accountSnap, matches, enrollmentSnap, studentSnap] = await Promise.all([
+        tx.get(db.doc(`sections/${request.sectionId}`)),
+        tx.get(db.doc(`school_accounts/${request.requestedByUid}`)),
+        request.kind === 'add' ? tx.get(db.collection('students').where('lrn', '==', request.student.lrn).limit(2)) : null,
+        request.kind === 'remove' ? tx.get(db.doc(`enrollments/${request.studentId}_${request.schoolYear}`)) : null,
+        request.kind === 'remove' ? tx.get(db.doc(`students/${request.studentId}`)) : null,
+      ]);
+      const section = sectionSnap.exists ? { ...sectionSnap.data(), id: sectionSnap.id } : null;
+      if (!section || section.schoolYear !== request.schoolYear || section.gradeLevel !== request.gradeLevel) {
+        fail('failed-precondition', 'This section changed. Reject this request and ask for a new one.');
+      }
+      if (!isSectionAdviser({ schoolYear: actor.schoolYear, assignments: accountSnap.data()?.assignments || [] }, request.sectionId)) {
+        fail('failed-precondition', 'The adviser no longer holds this class. Reject this request.');
+      }
+      const today = manilaDate(clock(deps));
+      const target = { gradeLevel: section.gradeLevel, sectionId: section.id, track: section.track || null, strand: section.strand || null };
+      const where = classLabel(section);
+
+      if (request.kind === 'add') {
+        if (matches.size > 1) fail('failed-precondition', 'This LRN matches more than one learner. An administrator must fix the records first.');
+        let mode = 'new';
+        let previousSectionId = null;
+        if (matches.empty) {
+          const studentRef = db.collection('students').doc();
+          tx.set(studentRef, { ...Object.fromEntries(STUDENT_FIELDS.map((field) => [field, request.student[field] ?? ''])),
+            status: 'active', documents: { ...NEW_LEARNER_DOCUMENTS }, createdAt: today, ...scopeFor(section.gradeLevel, request.schoolYear) });
+          tx.set(db.doc(`enrollments/${studentRef.id}_${request.schoolYear}`), { studentId: studentRef.id, schoolYear: request.schoolYear, ...target,
+            type: request.enrollType, dateEnrolled: today, status: 'enrolled' });
+        } else {
+          const found = matches.docs[0];
+          const enrollmentRef = db.doc(`enrollments/${found.id}_${request.schoolYear}`);
+          const enrollment = (await tx.get(enrollmentRef)).data();
+          const enrolled = enrollment?.status === 'enrolled';
+          const existingName = fullName(found.data());
+          if (enrolled && enrollment.sectionId === section.id) fail('already-exists', `${existingName} is already in this class. Reject this request.`);
+          if (!actor.isAdmin && !(enrolled && coversGrade(actor, enrollment.gradeLevel))) fail('permission-denied', 'An administrator must approve this request.');
+          if (enrolled) {
+            // A move keeps the original enrollment date and type, as the SIMS learner form does.
+            tx.update(enrollmentRef, target);
+            if ((found.data().status ?? 'active') === 'active') tx.update(found.ref, scopeFor(section.gradeLevel, request.schoolYear));
+            mode = 'moved';
+            previousSectionId = enrollment.sectionId;
+          } else {
+            tx.update(found.ref, { status: 'active', ...scopeFor(section.gradeLevel, request.schoolYear) });
+            tx.set(enrollmentRef, { studentId: found.id, schoolYear: request.schoolYear, ...target, type: request.enrollType, dateEnrolled: today, status: 'enrolled' });
+            mode = 'enrolled';
+          }
+        }
+        note = { title: OUTCOME_TEXT.add, body: `${name} was added to ${where}.` };
+        audit = { action: 'learner.addApproved', details: { lrn: request.student.lrn, name, mode, sectionId: section.id, gradeLevel: section.gradeLevel, previousSectionId, reason } };
+      } else {
+        const enrollment = enrollmentSnap.data();
+        if (!studentSnap.exists || enrollment?.status !== 'enrolled' || enrollment.sectionId !== request.sectionId) {
+          fail('failed-precondition', `${name} is no longer in this class. Reject this request.`);
+        }
+        const outcome = REMOVAL_REASONS[request.reasonCode];
+        if (!outcome) fail('failed-precondition', 'This request has an unknown reason. Reject it and ask for a new one.');
+        tx.update(enrollmentSnap.ref, { status: outcome.enrollment });
+        tx.update(studentSnap.ref, { ...(outcome.learner ? { status: outcome.learner } : {}), ...NO_SCOPE });
+        note = { title: OUTCOME_TEXT.remove, body: `${name} was removed from ${where}: ${reasonLabel(request.reasonCode)}.` };
+        audit = { action: 'learner.removalApproved', details: { lrn: request.lrn, name, reasonCode: request.reasonCode, note: request.note, sectionId: section.id, gradeLevel: section.gradeLevel, reason } };
+      }
+    }
+
+    tx.update(ref, decision);
+    tx.set(db.collection('audit_log').doc(), auditRow(actor, audit.action, ref.id, audit.details));
+    tx.set(inboxRef(db, request.requestedByUid, `learner:${ref.id}`), { type: 'learner_request', requestId: ref.id, ...note, createdAt: FieldValue.serverTimestamp() });
+    return { ok: true };
+  });
+}
```

- [ ] **Step 4: Run the tests to see them pass**

```powershell
npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run --no-file-parallelism test/emulator/learnerRequests.test.js test/emulator/schoolAccess.test.js"
npm --prefix functions test
```

Expected: the emulator run passes with 2 test files and 66 tests (35 new, 31 existing). The functions unit suite passes with 23 test files and 171 tests.

- [ ] **Step 5: Commit**

```powershell
git add functions/src/handlers/learnerRequests.js functions/test/emulator/learnerRequests.test.js
git commit -m "feat(functions): approve or reject learner requests"
```

### Task 5: Expose the callables, close the collection, add indexes

**Files:**
- Modify: `functions/index.js`, `firestore.rules`, `firestore.indexes.json`
- Test: `tests/rules/learnerRequests.test.js`

- [ ] **Step 1: Write the rules test**

```js
import { beforeAll, afterAll, beforeEach, it } from 'vitest';
import { setup, seedBaseline, seed, as, denied, STAFF, ADMIN_NEW, GLC8, GUARDIAN_A } from './helpers.js';
let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await seedBaseline(env);
  await seed(env, db => db.doc('learner_change_requests/r1').set({ kind: 'add', status: 'pending', sectionId: 'SEC1', gradeLevel: 7, requestedByUid: 'gA' }));
});
it('keeps learner requests closed to every signed-in role, including the requester', async () => {
  for (const who of [STAFF, ADMIN_NEW, GLC8, GUARDIAN_A]) {
    const db = as(env, who);
    await denied(db.doc('learner_change_requests/r1').get());
    await denied(db.collection('learner_change_requests').get());
    await denied(db.doc('learner_change_requests/r2').set({ kind: 'add', status: 'approved' }));
    await denied(db.doc('learner_change_requests/r1').update({ status: 'approved' }));
    await denied(db.doc('learner_change_requests/r1').delete());
  }
});
```

- [ ] **Step 2: Run it**

```powershell
npx firebase emulators:exec --only firestore "vitest run -c vitest.rules.config.js tests/rules/learnerRequests.test.js"
```

Expected: PASS already. The rules have no catch-all, so a new collection is denied by default. The explicit rule below is for the record and keeps the intent visible; this test would catch anyone who later adds a broad allow.

- [ ] **Step 3: Add the explicit deny, the indexes and the exports**

```diff
--- a/firestore.rules
+++ b/firestore.rules
@@ -355,6 +355,8 @@ service cloud.firestore {
     // by client-provided roles or cached account metadata.
     match /school_accounts/{id} { allow read, write: if false; }
     match /school_role_requests/{id} { allow read, write: if false; }
+    // Adviser requests to add or remove a learner (spec 2026-10-22). Callables only.
+    match /learner_change_requests/{id} { allow read, write: if false; }
     match /school_adviser_locks/{id} { allow read, write: if false; }
     match /advisory_slips/{id} { allow read, write: if false; }
     match /attendance_corrections/{id} { allow read, write: if false; }
```

Five composite indexes serve the adviser's list, the Waiting list (administrators, and coordinators and Curriculum Advisers scoped by grade), and the Decided list for administrators and for coordinators (the emulator does not enforce indexes, so these are only exercised in production). The fifth, (status, schoolYear, gradeLevel, createdAt), was added after review; the diff below shows all five. In the committed `firestore.indexes.json` they sit before the `audit_log` entry, which must stay last because `docs/releases/2026-10-18-school-family/prepareRules.mjs` expects it there:

```diff
--- a/firestore.indexes.json
+++ b/firestore.indexes.json
@@ -55,7 +55,15 @@
     { "collectionGroup": "announcements", "queryScope": "COLLECTION", "fields": [
       { "fieldPath": "pushResult.status", "order": "ASCENDING" }, { "fieldPath": "pushResult.claimedAt", "order": "ASCENDING" } ] },
     { "collectionGroup": "audit_log", "queryScope": "COLLECTION", "fields": [
-      { "fieldPath": "targetType", "order": "ASCENDING" }, { "fieldPath": "at", "order": "DESCENDING" } ] }
+      { "fieldPath": "targetType", "order": "ASCENDING" }, { "fieldPath": "at", "order": "DESCENDING" } ] },
+    { "collectionGroup": "learner_change_requests", "queryScope": "COLLECTION", "fields": [
+      { "fieldPath": "requestedByUid", "order": "ASCENDING" }, { "fieldPath": "sectionId", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" } ] },
+    { "collectionGroup": "learner_change_requests", "queryScope": "COLLECTION", "fields": [
+      { "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "schoolYear", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "ASCENDING" } ] },
+    { "collectionGroup": "learner_change_requests", "queryScope": "COLLECTION", "fields": [
+      { "fieldPath": "schoolYear", "order": "ASCENDING" }, { "fieldPath": "decidedAt", "order": "DESCENDING" } ] },
+    { "collectionGroup": "learner_change_requests", "queryScope": "COLLECTION", "fields": [
+      { "fieldPath": "schoolYear", "order": "ASCENDING" }, { "fieldPath": "gradeLevel", "order": "ASCENDING" }, { "fieldPath": "decidedAt", "order": "DESCENDING" } ] },
+    { "collectionGroup": "learner_change_requests", "queryScope": "COLLECTION", "fields": [
+      { "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "schoolYear", "order": "ASCENDING" }, { "fieldPath": "gradeLevel", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "ASCENDING" } ] }
   ],
   "fieldOverrides": [
     { "collectionGroup": "devices", "fieldPath": "refreshedAt", "indexes": [
```

Register the seven callables:

```diff
--- a/functions/index.js
+++ b/functions/index.js
@@ -24,6 +24,7 @@ import { getSchoolContext, requestSchoolRole, setAdvisoryRequestsEnabled, withdr
 import { retireSubjectTeachers } from './src/handlers/retireSubjectTeachers.js';
 import { getSchoolRoster, setSessionAbsence, getFamilyAttendance, getSchoolLearnerAttendance, getSchoolLearnerHistory, handleAttendanceCorrection, sendDueAttendanceUpdates } from './src/handlers/sessionAttendance.js';
 import { getPortalAnnouncements, getPortalAnnouncement, savePortalAnnouncement } from './src/handlers/portalAnnouncements.js';
+import { requestLearnerAdd, requestLearnerRemoval, withdrawLearnerRequest, getLearnerRequests, listLearnerRequests, resolveLearnerRequest, getLearnerRequestCount } from './src/handlers/learnerRequests.js';
 import { exportSchoolSf2 } from './src/handlers/sf2Export.js';
 
 setGlobalOptions({ region: 'asia-southeast1', minInstances: 0, maxInstances: 10, memory: '256MiB' });
@@ -125,6 +126,14 @@ export const getSchoolLearnerHistoryFn = schoolCall(getSchoolLearnerHistory);
 export const getPortalAnnouncementsFn = schoolCall(getPortalAnnouncements);
 export const getPortalAnnouncementFn = schoolCall(getPortalAnnouncement);
 export const savePortalAnnouncementFn = staffCall(savePortalAnnouncement);
+// Advisers ask from the Parent App; an Administrator or whoever covers the grade decides in SIMS (spec 2026-10-22).
+export const requestLearnerAddFn = schoolCall(requestLearnerAdd);
+export const requestLearnerRemovalFn = schoolCall(requestLearnerRemoval);
+export const withdrawLearnerRequestFn = schoolCall(withdrawLearnerRequest);
+export const getLearnerRequestsFn = schoolCall(getLearnerRequests);
+export const listLearnerRequestsFn = schoolCall(listLearnerRequests);
+export const resolveLearnerRequestFn = schoolCall(resolveLearnerRequest);
+export const getLearnerRequestCountFn = schoolCall(getLearnerRequestCount);
 // The SF2 workbook for a section and month, built on the server so phones never load ExcelJS (spec 2026-10-22).
 export const exportSchoolSf2Fn = schoolCall(exportSchoolSf2, { memory: '512MiB', timeoutSeconds: 60 });
 export const onAttendanceCorrectionCreated = onDocumentCreated(
```

- [ ] **Step 4: Check the files**

```powershell
npx firebase emulators:exec --only firestore "vitest run -c vitest.rules.config.js tests/rules/learnerRequests.test.js tests/rules/schoolPortal.test.js"
node --check functions/index.js
node -e "const j=JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8')); console.log(j.indexes.filter(i=>i.collectionGroup==='learner_change_requests').length)"
```

Expected: the rules run passes with 2 test files; `node --check` prints nothing; the last command prints `4`.

- [ ] **Step 5: Commit**

```powershell
git add functions/index.js firestore.rules firestore.indexes.json tests/rules/learnerRequests.test.js
git commit -m "feat(functions): expose learner request callables, close the collection, add indexes"
```

### Task 6: Parent helpers and copy

**Files:**
- Create: `parent/src/lib/learnerRequests.js`
- Modify: `parent/src/strings.js`, `parent/src/lib/strings.test.js`, `parent/src/lib/school.js`, `parent/src/lib/school.test.js`
- Test: `parent/src/lib/learnerRequests.test.js`

**Interfaces:**
- Consumes: Task 1 (`validateLearnerFields`, `validateEnrollType`, `validateRemoval`, `REMOVAL_REASONS`, `ENROLL_TYPE_LABELS`, `reasonLabel`).
- Produces: `emptyLearnerForm()`, `checkLearnerForm(form, today?)` → `{ ok, errors }`, `checkRemoval(input)`, `addPayload(sectionId, form)`, `removalPayload(sectionId, studentId, { reasonCode, note })`, `prefillFrom(request)`, `REASON_OPTIONS`, `ENROLL_OPTIONS`, `STATUS_LABEL`, `pendingRequests(list)`, `pendingRemovalIds(list)` (a Set of student ids), `removalFor(list, studentId)`, `requestTitle(request)`, `requestDetail(request)`; `inboxDestination({ type: 'learner_request' })` → `'/school'`.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest';
import S from '../strings.js';
import {
  ENROLL_OPTIONS, REASON_OPTIONS, STATUS_LABEL, addPayload, checkLearnerForm, checkRemoval, emptyLearnerForm, pendingRemovalIds, pendingRequests,
  prefillFrom, removalFor, removalPayload, requestDetail, requestTitle,
} from './learnerRequests.js';

const filled = () => ({ ...emptyLearnerForm(), lrn: '123456789012', lastName: 'Dela Cruz', firstName: 'Juan', sex: 'M', birthdate: '2012-05-01', address: '123 Rizal St.' });

describe('checkLearnerForm', () => {
  it('starts empty with the enrollment type set to new', () => {
    expect(emptyLearnerForm()).toMatchObject({ lrn: '', enrollType: 'new', address: '' });
    const result = checkLearnerForm(emptyLearnerForm(), '2026-10-22');
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(['birthdate', 'firstName', 'lastName', 'lrn', 'sex']);
  });
  it('accepts a complete form and checks the enrollment type', () => {
    expect(checkLearnerForm(filled(), '2026-10-22')).toEqual({ ok: true, errors: {} });
    expect(checkLearnerForm({ ...filled(), enrollType: 'visitor' }, '2026-10-22').errors.enrollType).toBe('Enrollment type must be new, returning, or transferee.');
  });
  it('rejects a birthdate after today', () => {
    expect(checkLearnerForm({ ...filled(), birthdate: '2026-10-23' }, '2026-10-22').errors.birthdate).toBe('Birthdate cannot be in the future.');
  });
});

describe('payloads', () => {
  it('splits the enrollment type from the learner details', () => {
    expect(addPayload('SEC1', { ...filled(), enrollType: 'returning' })).toEqual({
      sectionId: 'SEC1', enrollType: 'returning', student: expect.objectContaining({ lrn: '123456789012', lastName: 'Dela Cruz' }) });
    expect(addPayload('SEC1', filled()).student).not.toHaveProperty('enrollType');
    expect(removalPayload('SEC1', 'S1', { reasonCode: 'dropped_out', note: 'Stopped coming' })).toEqual({ sectionId: 'SEC1', studentId: 'S1', reasonCode: 'dropped_out', note: 'Stopped coming' });
  });
  it('checks a removal the way the server does', () => {
    expect(checkRemoval({ reasonCode: '', note: '' }).errors).toEqual({ reasonCode: 'Choose a reason.', note: 'Add a short note.' });
    expect(checkRemoval({ reasonCode: 'dropped_out', note: 'Moved away' }).ok).toBe(true);
  });
  it('offers the three reasons and the three enrollment types', () => {
    expect(REASON_OPTIONS.map((o) => o.label)).toEqual(['Transferred out', 'Dropped out', 'Moved to another section']);
    expect(ENROLL_OPTIONS.map((o) => o.label)).toEqual(['New', 'Returning', 'Transferee']);
  });
  it('fills "Send again" from a not-approved add without the cleared contact details', () => {
    const request = { kind: 'add', status: 'rejected', enrollType: 'transferee', student: { lrn: '123456789012', lastName: 'Dela Cruz', firstName: 'Juan', sex: 'M', birthdate: '2012-05-01', guardianName: 'Maria' } };
    expect(prefillFrom(request)).toMatchObject({ lrn: '123456789012', guardianName: 'Maria', enrollType: 'transferee', address: '', contactNumber: '', guardianContact: '' });
  });
});

describe('request lists', () => {
  const requests = [
    { id: 'a', kind: 'remove', status: 'pending', studentId: 'S1', displayName: 'ANA CRUZ', reasonCode: 'dropped_out', note: 'Stopped coming' },
    { id: 'b', kind: 'remove', status: 'approved', studentId: 'S2', displayName: 'Ben Dy', reasonCode: 'transferred_out', note: 'Moved' },
    { id: 'c', kind: 'add', status: 'pending', displayName: 'Juan Dela Cruz', lrn: '123456789012' },
  ];
  it('counts what is waiting and finds pending removals by learner', () => {
    expect(pendingRequests(requests).map((r) => r.id)).toEqual(['a', 'c']);
    expect(pendingRequests(null)).toEqual([]);
    expect([...pendingRemovalIds(requests)]).toEqual(['S1']);
    expect(removalFor(requests, 'S1').id).toBe('a');
    expect(removalFor(requests, 'S2')).toBeNull();
  });
  it('titles and describes each kind in plain words', () => {
    expect(requestTitle(requests[0])).toBe('Remove Ana Cruz');
    expect(requestTitle(requests[2])).toBe('Add Juan Dela Cruz');
    expect(requestDetail(requests[0])).toBe('Dropped out · Stopped coming');
    expect(requestDetail(requests[2])).toBe('LRN 123456789012');
  });
  it('labels each status', () => {
    expect(STATUS_LABEL).toEqual({ pending: S.learnerStatusPending, approved: S.learnerStatusApproved, rejected: S.learnerStatusRejected, withdrawn: S.learnerStatusWithdrawn });
    expect(S.learnerStatusPending).toBe('Waiting for approval');
    expect(S.learnerStatusRejected).toBe('Not approved');
  });
});
```

The copy check and the Inbox destination:

```diff
--- a/parent/src/lib/strings.test.js
+++ b/parent/src/lib/strings.test.js
@@ -61,6 +61,17 @@ describe('strings', () => {
     for (const k of ['classActions', 'sf2Button', 'sf2Title', 'sf2Hint', 'sf2Month', 'sf2Download', 'sf2Preparing', 'sf2Close', 'sf2NoLearners', 'sf2NoMonths'])
       expect(typeof S[k], k).toBe('string');
   });
+  it('has the learner request strings', () => {
+    for (const k of ['addLearnerButton', 'addLearnerTitle', 'addLearnerHint', 'learnerSectionLearner', 'learnerLrn', 'learnerLastName', 'learnerFirstName',
+      'learnerMiddleName', 'learnerExt', 'learnerSex', 'learnerMale', 'learnerFemale', 'learnerChoose', 'learnerBirthdate', 'learnerEnrollType',
+      'learnerSectionContact', 'learnerAddress', 'learnerGuardianName', 'learnerGuardianRelationship', 'learnerGuardianContact', 'learnerContactNumber',
+      'learnerSend', 'learnerSending', 'learnerCancel', 'learnerSent', 'removeFromClass', 'removeHint', 'removeReason', 'removeNote', 'removeNoteHint',
+      'removePending', 'withdrawRequest', 'requestWithdrawn', 'requestsTitle', 'requestsEmpty', 'requestsClose', 'requestsWaitingOne', 'requestsWaitingMany',
+      'requestsPast', 'requestReasonLabel', 'requestSendAgain', 'learnerAddVerb', 'learnerRemoveVerb', 'learnerStatusPending', 'learnerStatusApproved',
+      'learnerStatusRejected', 'learnerStatusWithdrawn'])
+      expect(typeof S[k], k).toBe('string');
+    expect(S.learnerSent).toBe('Sent for approval. You get an Inbox note when it is decided.');
+  });
   it('calls the family role Parent/Guardian and drops Subject Teacher copy', () => {
     expect(S.joinFamily).toBe('Parent/Guardian');
     expect(S.modeFamily).toBe('Parent/Guardian');
```

```diff
--- a/parent/src/lib/school.test.js
+++ b/parent/src/lib/school.test.js
@@ -26,6 +26,10 @@ describe('school access presentation', () => {
     expect(inboxDestination({ type: 'school_access' })).toBe('/settings');
     expect(inboxDestination({ type: 'school_access', rejected: true })).toBe('/settings/school-access');
   });
+  it('sends a learner request note to the Class tab', () => {
+    expect(inboxDestination({ type: 'learner_request' })).toBe('/school');
+    expect(inboxDestination({ type: 'learner_request', rejected: true })).toBe('/school');
+  });
   it('offers requestable roles and sections grouped by grade', () => {
     expect(REQUESTABLE_ROLES).toEqual(['adviser']);
     expect(ROLE_LABELS).toEqual({ adviser: 'Adviser', curriculum_adviser: 'Curriculum Adviser' });
```

- [ ] **Step 2: Run them to see them fail**

```powershell
npm --prefix parent test -- src/lib/learnerRequests.test.js src/lib/strings.test.js src/lib/school.test.js
```

Expected: FAIL (`learnerRequests.js` is missing, the strings are undefined, and `/school` is not returned yet).

- [ ] **Step 3: Write the implementation**

```js
import S from '../strings.js';
import { nameCase } from './format.js';
import { manilaDate } from '../../../shared/dates.js';
import {
  ENROLL_TYPES, ENROLL_TYPE_LABELS, REASON_CODES, REMOVAL_REASONS, reasonLabel, validateEnrollType, validateLearnerFields, validateRemoval,
} from '../../../shared/learnerRequests.js';

export const REASON_OPTIONS = REASON_CODES.map((value) => ({ value, label: REMOVAL_REASONS[value].label }));
export const ENROLL_OPTIONS = ENROLL_TYPES.map((value) => ({ value, label: ENROLL_TYPE_LABELS[value] }));

export const emptyLearnerForm = () => ({
  lrn: '', lastName: '', firstName: '', middleName: '', extName: '', sex: '', birthdate: '', enrollType: 'new',
  address: '', guardianName: '', guardianRelationship: '', guardianContact: '', contactNumber: '',
});

// The same rules the server applies, so most mistakes are caught before anything is sent.
export function checkLearnerForm(form, today = manilaDate()) {
  const fields = validateLearnerFields(form, { today });
  const type = validateEnrollType(form.enrollType);
  const errors = { ...fields.errors, ...(type.ok ? {} : { enrollType: type.error }) };
  return { ok: Object.keys(errors).length === 0, errors };
}

export const checkRemoval = (input) => validateRemoval(input);

// What requestLearnerAddFn takes: the class, the enrollment type, and the learner's details.
export function addPayload(sectionId, form) {
  const { enrollType, ...student } = form;
  return { sectionId, enrollType, student };
}

export const removalPayload = (sectionId, studentId, { reasonCode, note }) => ({ sectionId, studentId, reasonCode, note });

// "Send again" on a not-approved add: the form comes back without the address and phone numbers,
// which the school clears once a request is decided.
export const prefillFrom = (request) => ({ ...emptyLearnerForm(), ...(request.student || {}), enrollType: request.enrollType || 'new' });

export const STATUS_LABEL = {
  pending: S.learnerStatusPending, approved: S.learnerStatusApproved, rejected: S.learnerStatusRejected, withdrawn: S.learnerStatusWithdrawn,
};
export const pendingRequests = (requests) => (requests || []).filter((r) => r.status === 'pending');
export const pendingRemovalIds = (requests) => new Set(pendingRequests(requests).filter((r) => r.kind === 'remove').map((r) => r.studentId));
export const removalFor = (requests, studentId) => pendingRequests(requests).find((r) => r.kind === 'remove' && r.studentId === studentId) || null;

export const requestTitle = (request) => `${request.kind === 'add' ? S.learnerAddVerb : S.learnerRemoveVerb} ${nameCase(request.displayName)}`;
export const requestDetail = (request) => (request.kind === 'remove' ? `${reasonLabel(request.reasonCode)} · ${request.note}` : `LRN ${request.lrn}`);
```

```diff
--- a/parent/src/strings.js
+++ b/parent/src/strings.js
@@ -328,6 +328,53 @@ const S = {
   sf2Close: 'Close',
   sf2NoLearners: 'No learners in this class yet.',
   sf2NoMonths: 'There are no school months to download yet.',
+  addLearnerButton: 'Add learner',
+  addLearnerTitle: 'Add a learner',
+  addLearnerHint: 'An administrator or your grade coordinator approves this before the learner joins your class.',
+  learnerSectionLearner: 'Learner',
+  learnerLrn: 'LRN',
+  learnerLastName: 'Last name',
+  learnerFirstName: 'First name',
+  learnerMiddleName: 'Middle name',
+  learnerExt: 'Ext (Jr/III)',
+  learnerSex: 'Sex',
+  learnerMale: 'Male',
+  learnerFemale: 'Female',
+  learnerChoose: 'Choose',
+  learnerBirthdate: 'Birthdate',
+  learnerEnrollType: 'Enrollment type',
+  learnerSectionContact: 'Contact (optional)',
+  learnerAddress: 'Address',
+  learnerGuardianName: 'Guardian name',
+  learnerGuardianRelationship: 'Guardian relationship',
+  learnerGuardianContact: 'Guardian contact',
+  learnerContactNumber: 'Contact number',
+  learnerSend: 'Send for approval',
+  learnerSending: 'Sending…',
+  learnerCancel: 'Cancel',
+  learnerSent: 'Sent for approval. You get an Inbox note when it is decided.',
+  removeFromClass: 'Remove from class',
+  removeHint: 'stays in your class until an administrator or your grade coordinator approves this.',
+  removeReason: 'Reason',
+  removeNote: 'Note',
+  removeNoteHint: 'Tell the approver what happened.',
+  removePending: 'Removal pending',
+  withdrawRequest: 'Withdraw request',
+  requestWithdrawn: 'Request withdrawn.',
+  requestsTitle: 'Learner requests',
+  requestsEmpty: 'No requests yet.',
+  requestsClose: 'Close',
+  requestsWaitingOne: 'request waiting for approval',
+  requestsWaitingMany: 'requests waiting for approval',
+  requestsPast: 'Past requests',
+  requestReasonLabel: 'Reason',
+  requestSendAgain: 'Send again',
+  learnerAddVerb: 'Add',
+  learnerRemoveVerb: 'Remove',
+  learnerStatusPending: 'Waiting for approval',
+  learnerStatusApproved: 'Approved',
+  learnerStatusRejected: 'Not approved',
+  learnerStatusWithdrawn: 'Withdrawn',
   notFound: 'That page does not exist.',
   sessionButton: 'Sessions',
   sessionTitle: 'Session attendance',
```

```diff
--- a/parent/src/lib/school.js
+++ b/parent/src/lib/school.js
@@ -32,6 +32,7 @@ export function correctionError({ session, reason }) {
 }
 export function inboxDestination(item) {
   if (item.type === 'school_access') return item.rejected ? '/settings/school-access' : '/settings';
+  if (item.type === 'learner_request') return '/school';
   if (!item.studentId) return null;
   const path = `/learner/${encodeURIComponent(item.studentId)}`;
   if (item.type === 'attendance_correction') return `${path}?${new URLSearchParams({ date: item.date || '', session: item.session || '' })}`;
```

- [ ] **Step 4: Run the tests to see them pass**

```powershell
npm --prefix parent test -- src/lib/learnerRequests.test.js src/lib/strings.test.js src/lib/school.test.js
```

Expected: PASS, 3 test files.

- [ ] **Step 5: Commit**

```powershell
git add parent/src/lib/learnerRequests.js parent/src/lib/learnerRequests.test.js parent/src/strings.js parent/src/lib/strings.test.js parent/src/lib/school.js parent/src/lib/school.test.js
git commit -m "feat(parent): learner request helpers and copy"
```

### Task 7: The three Parent sheets

**Files:**
- Create: `parent/src/hooks/useLearnerRequests.js`, `parent/src/screens/school/AddLearnerSheet.jsx`, `RemoveLearnerSheet.jsx`, `RequestsSheet.jsx`
- Modify: `parent/src/screens/school/ClassTab.css`
- Test: `AddLearnerSheet.test.js`, `RemoveLearnerSheet.test.js`, `RequestsSheet.test.js` (all in `parent/src/screens/school/`)

**Interfaces:**
- Consumes: `Sheet` (SF2 plan, Task 5); Task 6.
- Produces: `useLearnerRequests(sectionId, enabled)` → `{ requests (null until loaded), loading, error, refresh }`; `AddLearnerForm({ initial, busy, error, today, onSubmit(form), onClose })` and the default `AddLearnerSheet({ classLabel, initial, busy, error, onSubmit, onClose })`; `RemoveLearnerForm({ busy, error, onSubmit({ reasonCode, note }), onClose })` and default `RemoveLearnerSheet({ displayName, busy, error, onSubmit, onClose })`; `RequestsList({ requests, busy, error, onWithdraw(id), onSendAgain(request), onClose })` and default `RequestsSheet`.

- [ ] **Step 1: Write the failing tests**

The sheets are portalled, so the tests render their inner forms and list.

```js
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../../strings.js';
import { emptyLearnerForm } from '../../lib/learnerRequests.js';
import { AddLearnerForm } from './AddLearnerSheet.jsx';

const render = (props) => renderToStaticMarkup(createElement(AddLearnerForm, { busy: false, error: '', today: '2026-10-22', onSubmit() {}, onClose() {}, ...props }));

describe('AddLearnerForm', () => {
  it('asks for the import template’s learner and contact fields, without grade and section', () => {
    const html = render();
    for (const label of [S.learnerLrn, S.learnerLastName, S.learnerFirstName, S.learnerMiddleName, S.learnerExt, S.learnerSex, S.learnerBirthdate,
      S.learnerEnrollType, S.learnerAddress, S.learnerGuardianName, S.learnerGuardianRelationship, S.learnerGuardianContact, S.learnerContactNumber]) {
      expect(html, label).toContain(label);
    }
    expect(html).toContain(S.learnerSend);
    expect(html).toContain('max="2026-10-22"'); // no birthdate in the future
    expect(html).toContain('maxLength="12"'); // an LRN is 12 digits
    expect(html).not.toContain('aria-invalid'); // nothing is wrong until the form is sent
    expect(html).not.toContain('Grade');
  });
  it('starts with the enrollment type set to New', () => {
    expect(render()).toContain('<option value="new" selected="">New</option>');
  });
  it('fills from a previous request', () => {
    const html = render({ initial: { ...emptyLearnerForm(), lrn: '123456789012', lastName: 'Dela Cruz' } });
    expect(html).toContain('value="123456789012"');
    expect(html).toContain('value="Dela Cruz"');
  });
  it('shows the server’s answer and locks the form while sending', () => {
    const html = render({ error: 'This LRN is already in your class.', busy: true });
    expect(html).toContain('This LRN is already in your class.');
    expect(html).toContain(S.learnerSending);
    expect(html.match(/disabled=""/g).length).toBeGreaterThan(10);
  });
});
```

```js
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../../strings.js';
import { RemoveLearnerForm } from './RemoveLearnerSheet.jsx';

const render = (props) => renderToStaticMarkup(createElement(RemoveLearnerForm, { busy: false, error: '', onSubmit() {}, onClose() {}, ...props }));

describe('RemoveLearnerForm', () => {
  it('offers the three reasons and a note', () => {
    const html = render();
    for (const reason of ['Transferred out', 'Dropped out', 'Moved to another section']) expect(html).toContain(reason);
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toContain(S.removeNote);
    expect(html).toContain('<textarea');
    expect(html).toContain(S.learnerSend);
  });
  it('shows an error and locks the form while sending', () => {
    const html = render({ error: 'Learner is not enrolled in this section.', busy: true });
    expect(html).toContain('Learner is not enrolled in this section.');
    expect(html).toContain(S.learnerSending);
    expect(html).toContain('<fieldset class="remove-reasons" disabled=""');
  });
});
```

```js
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../../strings.js';
import { RequestsList } from './RequestsSheet.jsx';

const requests = [
  { id: 'a', kind: 'remove', status: 'pending', studentId: 'S1', displayName: 'ANA CRUZ', reasonCode: 'dropped_out', note: 'Stopped coming' },
  { id: 'b', kind: 'add', status: 'rejected', displayName: 'Juan Dela Cruz', lrn: '123456789012', decisionReason: 'LRN looks wrong', student: { lrn: '123456789012' } },
  { id: 'c', kind: 'add', status: 'approved', displayName: 'Maria Santos', lrn: '123456789013' },
  { id: 'd', kind: 'add', status: 'withdrawn', displayName: 'Pedro Reyes', lrn: '123456789014' },
];
const render = (props) => renderToStaticMarkup(createElement(RequestsList, { requests, busy: false, error: '', onWithdraw() {}, onSendAgain() {}, onClose() {}, ...props }));

describe('RequestsList', () => {
  it('names each request, its status and its detail', () => {
    const html = render();
    expect(html).toContain('Remove Ana Cruz');
    expect(html).toContain('Dropped out · Stopped coming');
    expect(html).toContain('Add Juan Dela Cruz');
    expect(html).toContain('LRN 123456789012');
    for (const status of [S.learnerStatusPending, S.learnerStatusRejected, S.learnerStatusApproved, S.learnerStatusWithdrawn]) expect(html).toContain(status);
    expect(html).toContain(`${S.requestReasonLabel}: LRN looks wrong`);
  });
  it('offers Withdraw only while waiting and Send again only for a not-approved add', () => {
    const html = render();
    expect(html.match(new RegExp(S.withdrawRequest, 'g'))).toHaveLength(1);
    expect(html.match(new RegExp(S.requestSendAgain, 'g'))).toHaveLength(1);
  });
  it('says so when there are no requests, and locks the actions while busy', () => {
    expect(render({ requests: [] })).toContain(S.requestsEmpty);
    expect(render({ busy: true })).toContain('disabled=""');
    expect(render({ error: 'Request not found.' })).toContain('Request not found.');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```powershell
npm --prefix parent test -- src/screens/school/AddLearnerSheet.test.js src/screens/school/RemoveLearnerSheet.test.js src/screens/school/RequestsSheet.test.js
```

Expected: FAIL (the three components do not exist).

- [ ] **Step 3: Write the hook and the components**

```js
import { useCallback, useEffect, useRef, useState } from 'react';
import { callable } from '../firebase.js';
import { schoolError } from '../lib/school.js';

// The adviser's own learner requests for one class, reloaded whenever the app comes back into view.
// `requests` is null until the first answer arrives.
export function useLearnerRequests(sectionId, enabled = true) {
  const active = Boolean(sectionId && enabled);
  const [state, setState] = useState({ requests: null, loading: active, error: '' });
  const sequence = useRef(0);
  const load = useCallback(async () => {
    if (!active) return;
    const request = ++sequence.current;
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const { data } = await callable('getLearnerRequestsFn')({ sectionId });
      if (request === sequence.current) setState({ requests: data.requests, loading: false, error: '' });
    } catch (e) {
      if (request === sequence.current) setState((current) => ({ ...current, loading: false, error: schoolError(e) }));
    }
  }, [sectionId, active]);
  useEffect(() => {
    setState({ requests: null, loading: active, error: '' });
    load();
    return () => { ++sequence.current; };
  }, [load, active]);
  useEffect(() => {
    const onReturn = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => { window.removeEventListener('focus', onReturn); document.removeEventListener('visibilitychange', onReturn); };
  }, [load]);
  return { ...state, refresh: load };
}
```

```jsx
import { useRef, useState } from 'react';
import S from '../../strings.js';
import { manilaDate } from '../../../../shared/dates.js';
import { Banner, Btn, Inp, Sel } from '../../components/ui.jsx';
import Sheet from '../../components/Sheet.jsx';
import { ENROLL_OPTIONS, checkLearnerForm, emptyLearnerForm } from '../../lib/learnerRequests.js';

function FormField({ label, error, wide = false, children }) {
  return (
    <label className={`p-field learner-field${wide ? ' learner-field--wide' : ''}`}>
      <span className="p-field-label">{label}</span>
      {children}
      {error && <span className="learner-field-error" role="alert">{error}</span>}
    </label>
  );
}

// A new learner's details: the Excel import's columns, minus grade and section (they are this class).
// Kept apart from the portal so it can be rendered on its own in tests.
export function AddLearnerForm({ initial, busy, error, today = manilaDate(), onSubmit, onClose }) {
  const [form, setForm] = useState(() => initial || emptyLearnerForm());
  const [errors, setErrors] = useState({});
  const element = useRef(null);
  const set = (key) => (event) => { const value = event.target.value; setForm((current) => ({ ...current, [key]: value })); };
  const bad = (key) => (errors[key] ? true : undefined); // omit the attribute unless the field is wrong
  const submit = (event) => {
    event.preventDefault();
    const result = checkLearnerForm(form, today);
    setErrors(result.errors);
    if (result.ok) onSubmit(form);
    else setTimeout(() => element.current?.querySelector('[aria-invalid="true"]')?.focus(), 0);
  };
  const text = (key, label, extra = {}, wide = false) => (
    <FormField label={label} error={errors[key]} wide={wide}>
      <Inp value={form[key]} onChange={set(key)} disabled={busy} aria-invalid={bad(key)} autoComplete="off" {...extra} />
    </FormField>
  );
  return (
    <form ref={element} className="learner-form" onSubmit={submit} noValidate>
      {error && <div className="learner-form-wide"><Banner tone="danger">{error}</Banner></div>}
      <h3 className="learner-form-title">{S.learnerSectionLearner}</h3>
      {text('lrn', S.learnerLrn, { inputMode: 'numeric', maxLength: 12 }, true)}
      {text('lastName', S.learnerLastName)}
      {text('firstName', S.learnerFirstName)}
      {text('middleName', S.learnerMiddleName)}
      {text('extName', S.learnerExt)}
      <FormField label={S.learnerSex} error={errors.sex}>
        <Sel value={form.sex} onChange={set('sex')} disabled={busy} aria-invalid={bad('sex')}>
          <option value="">{S.learnerChoose}</option>
          <option value="M">{S.learnerMale}</option>
          <option value="F">{S.learnerFemale}</option>
        </Sel>
      </FormField>
      {text('birthdate', S.learnerBirthdate, { type: 'date', max: today })}
      <FormField label={S.learnerEnrollType} error={errors.enrollType} wide>
        <Sel value={form.enrollType} onChange={set('enrollType')} disabled={busy} aria-invalid={bad('enrollType')}>
          {ENROLL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Sel>
      </FormField>
      <h3 className="learner-form-title">{S.learnerSectionContact}</h3>
      {text('address', S.learnerAddress, {}, true)}
      {text('guardianName', S.learnerGuardianName)}
      {text('guardianRelationship', S.learnerGuardianRelationship)}
      {text('guardianContact', S.learnerGuardianContact, { inputMode: 'tel' })}
      {text('contactNumber', S.learnerContactNumber, { inputMode: 'tel' })}
      <div className="learner-form-wide">
        <Btn type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? S.learnerSending : S.learnerSend}</Btn>
        <Btn type="button" variant="ghost" disabled={busy} onClick={onClose} style={{ width: '100%', marginTop: 10 }}>{S.learnerCancel}</Btn>
      </div>
    </form>
  );
}

export default function AddLearnerSheet({ classLabel, initial, busy, error, onSubmit, onClose }) {
  return (
    <Sheet title={S.addLearnerTitle} hint={`${classLabel} · ${S.addLearnerHint}`} busy={busy} onClose={onClose}>
      <AddLearnerForm initial={initial} busy={busy} error={error} onSubmit={onSubmit} onClose={onClose} />
    </Sheet>
  );
}
```

```jsx
import { useState } from 'react';
import S from '../../strings.js';
import { nameCase } from '../../lib/format.js';
import { Banner, Btn } from '../../components/ui.jsx';
import Sheet from '../../components/Sheet.jsx';
import { REASON_OPTIONS, checkRemoval } from '../../lib/learnerRequests.js';

// Why a learner leaves the class: one of three reasons and a short note. Kept apart from the portal for tests.
export function RemoveLearnerForm({ busy, error, onSubmit, onClose }) {
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const submit = (event) => {
    event.preventDefault();
    const result = checkRemoval({ reasonCode, note });
    setErrors(result.errors);
    if (result.ok) onSubmit(result.value);
  };
  return (
    <form onSubmit={submit} noValidate>
      {error && <Banner tone="danger">{error}</Banner>}
      <fieldset className="remove-reasons" disabled={busy}>
        <legend className="p-field-label">{S.removeReason}</legend>
        {REASON_OPTIONS.map((option) => (
          <label key={option.value} className="remove-reason">
            <input type="radio" name="remove-reason" value={option.value} checked={reasonCode === option.value} onChange={() => setReasonCode(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
        {errors.reasonCode && <span className="learner-field-error" role="alert">{errors.reasonCode}</span>}
      </fieldset>
      <label className="p-field">
        <span className="p-field-label">{S.removeNote}</span>
        <textarea className="p-input" rows={3} maxLength={500} value={note} disabled={busy} aria-invalid={errors.note ? true : undefined} onChange={(e) => setNote(e.target.value)} />
        <span className="p-field-hint">{S.removeNoteHint}</span>
        {errors.note && <span className="learner-field-error" role="alert">{errors.note}</span>}
      </label>
      <Btn type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? S.learnerSending : S.learnerSend}</Btn>
      <Btn type="button" variant="ghost" disabled={busy} onClick={onClose} style={{ width: '100%', marginTop: 10 }}>{S.learnerCancel}</Btn>
    </form>
  );
}

export default function RemoveLearnerSheet({ displayName, busy, error, onSubmit, onClose }) {
  return (
    <Sheet title={S.removeFromClass} hint={`${nameCase(displayName)} ${S.removeHint}`} busy={busy} onClose={onClose}>
      <RemoveLearnerForm busy={busy} error={error} onSubmit={onSubmit} onClose={onClose} />
    </Sheet>
  );
}
```

```jsx
import S from '../../strings.js';
import { Banner, Btn } from '../../components/ui.jsx';
import Sheet from '../../components/Sheet.jsx';
import { STATUS_LABEL, requestDetail, requestTitle } from '../../lib/learnerRequests.js';

// The adviser's requests for this class, newest first. Kept apart from the portal for tests.
export function RequestsList({ requests, busy, error, onWithdraw, onSendAgain, onClose }) {
  return (
    <>
      {error && <Banner tone="danger">{error}</Banner>}
      {requests.length === 0 ? <p className="class-note">{S.requestsEmpty}</p> : (
        <ul className="request-list" aria-label={S.requestsTitle}>
          {requests.map((request) => (
            <li key={request.id} className="request-row">
              <div className="request-row-top">
                <span className="request-row-title">{requestTitle(request)}</span>
                <span className={`class-chip class-chip--${request.status}`}>{STATUS_LABEL[request.status]}</span>
              </div>
              <div className="request-row-detail">{requestDetail(request)}</div>
              {request.status === 'rejected' && request.decisionReason && <div className="request-row-reason">{S.requestReasonLabel}: {request.decisionReason}</div>}
              {request.status === 'pending' && (
                <button type="button" className="class-link" disabled={busy} onClick={() => onWithdraw(request.id)}>{S.withdrawRequest}</button>
              )}
              {request.status === 'rejected' && request.kind === 'add' && request.student && (
                <button type="button" className="class-link" disabled={busy} onClick={() => onSendAgain(request)}>{S.requestSendAgain}</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Btn variant="ghost" onClick={onClose} style={{ width: '100%', marginTop: 10 }}>{S.requestsClose}</Btn>
    </>
  );
}

export default function RequestsSheet({ requests, busy, error, onWithdraw, onSendAgain, onClose }) {
  return (
    <Sheet title={S.requestsTitle} busy={busy} onClose={onClose}>
      <RequestsList requests={requests} busy={busy} error={error} onWithdraw={onWithdraw} onSendAgain={onSendAgain} onClose={onClose} />
    </Sheet>
  );
}
```

Styles (chips, the two-column form, the reason cards, the request list). They use only documented radii and sizes:

```diff
--- a/parent/src/screens/school/ClassTab.css
+++ b/parent/src/screens/school/ClassTab.css
@@ -15,6 +15,25 @@
 .class-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: -6px 0 16px; }
 .class-actions .class-note { margin: 0; }
 .class-sheet { max-height: 92dvh; overflow-y: auto; overscroll-behavior: contain; }
+.class-chip { display: inline-flex; flex: 0 0 auto; align-items: center; padding: 2px 10px; border-radius: 999px; background: var(--t-tint); color: var(--t-primary-deep); font-size: 12px; font-weight: 500; white-space: nowrap; }
+.class-chip--rejected { background: var(--t-feedback-bg); color: var(--t-feedback-ink); }
+.class-chip--withdrawn { background: var(--t-disabled-bg); color: var(--t-disabled-ink); }
+.class-link--quiet { color: var(--t-muted); }
+.learner-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 12px; }
+.learner-form-wide, .learner-form-title, .learner-field--wide { grid-column: 1 / -1; }
+.learner-form-title { margin: 4px 0 10px; color: var(--t-muted); font-size: 13px; font-weight: 600; }
+.learner-field-error { display: block; margin-top: 6px; color: var(--t-feedback-ink); font-size: 13px; line-height: 1.4; }
+.remove-reasons { display: grid; gap: 8px; margin: 0 0 16px; padding: 0; border: 0; }
+.remove-reason { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 16px; border: 1px solid var(--t-border); border-radius: 12px; background: var(--t-surface); font-size: 16px; font-weight: 600; cursor: pointer; }
+.remove-reason input { width: 20px; height: 20px; accent-color: var(--t-primary); }
+.remove-reason:focus-within { outline: 2px solid var(--t-focus); outline-offset: 2px; }
+.request-list { margin: 0 0 12px; padding: 0; list-style: none; }
+.request-row { padding: 12px 0; border-top: 1px solid var(--t-border); }
+.request-row:first-child { border-top: 0; }
+.request-row-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
+.request-row-title { font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
+.request-row-detail, .request-row-reason { margin-top: 4px; color: var(--t-muted); font-size: 14px; line-height: 1.45; overflow-wrap: anywhere; }
+.learner-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; margin: 20px 0 8px; }
 .class-group { margin: 0 0 20px; }
 .class-group-title, .class-group > summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 36px; margin: 0 0 4px; color: var(--t-muted); font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
 .class-group > summary { min-height: 44px; cursor: pointer; list-style: none; }
```

- [ ] **Step 4: Run the tests to see them pass**

```powershell
npm --prefix parent test -- src/screens/school/AddLearnerSheet.test.js src/screens/school/RemoveLearnerSheet.test.js src/screens/school/RequestsSheet.test.js
```

Expected: PASS, 3 test files.

- [ ] **Step 5: Commit**

```powershell
git add parent/src/hooks/useLearnerRequests.js parent/src/screens/school/AddLearnerSheet.jsx parent/src/screens/school/AddLearnerSheet.test.js parent/src/screens/school/RemoveLearnerSheet.jsx parent/src/screens/school/RemoveLearnerSheet.test.js parent/src/screens/school/RequestsSheet.jsx parent/src/screens/school/RequestsSheet.test.js parent/src/screens/school/ClassTab.css
git commit -m "feat(parent): add, remove and requests sheets"
```

### Task 8: Wire the Parent screens

The Class tab gains Add learner, the requests link and a "Removal pending" chip on rows; the learner history gains Remove from class (or Withdraw request while one is pending).

**Files:**
- Modify: `parent/src/screens/school/ClassActions.jsx`, `ClassActions.test.js`, `ClassTab.jsx`, `LearnerHistory.jsx`
- Test: `parent/src/screens/school/ClassActions.test.js`, `LearnerHistory.test.js`

**Interfaces:**
- Consumes: Tasks 6 and 7; the callables `requestLearnerAddFn`, `requestLearnerRemovalFn`, `withdrawLearnerRequestFn`, `getLearnerRequestsFn`.
- Produces: `ClassActions({ onAddLearner, onSf2, sf2Hint, requestTotal, requestWaiting, onOpenRequests })`; the Class tab behavior described above.

- [ ] **Step 1: Update the failing test for `ClassActions`**

The row now also offers Add learner and the requests link:

```js
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../../strings.js';
import ClassActions from './ClassActions.jsx';

const render = (props) => renderToStaticMarkup(createElement(ClassActions, props));

describe('ClassActions', () => {
  it('shows nothing when no action is available', () => {
    expect(render({})).toBe('');
  });
  it('offers Download SF2', () => {
    const html = render({ onSf2() {} });
    expect(html).toContain(S.sf2Button);
    expect(html).toContain(`aria-label="${S.classActions}"`);
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain(S.addLearnerButton);
  });
  it('disables the SF2 button and says why', () => {
    const html = render({ onSf2() {}, sf2Hint: S.sf2NoLearners });
    expect(html).toContain('disabled=""');
    expect(html).toContain(S.sf2NoLearners);
  });
  it('offers Add learner beside SF2', () => {
    const html = render({ onAddLearner() {}, onSf2() {} });
    expect(html.indexOf(S.addLearnerButton)).toBeGreaterThan(-1);
    expect(html.indexOf(S.addLearnerButton)).toBeLessThan(html.indexOf(S.sf2Button));
  });
  it('counts the requests waiting for approval, singular and plural', () => {
    expect(render({ requestTotal: 1, requestWaiting: 1, onOpenRequests() {} })).toContain('1 request waiting for approval');
    expect(render({ requestTotal: 3, requestWaiting: 2, onOpenRequests() {} })).toContain('2 requests waiting for approval');
  });
  it('links to past requests once none are waiting, and hides the link when there are none', () => {
    expect(render({ requestTotal: 2, requestWaiting: 0, onOpenRequests() {} })).toContain(S.requestsPast);
    expect(render({ onAddLearner() {}, requestTotal: 0 })).not.toContain(S.requestsPast);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```powershell
npm --prefix parent test -- src/screens/school/ClassActions.test.js
```

Expected: FAIL (no Add learner button and no requests link yet).

- [ ] **Step 3: Replace `ClassActions`**

```jsx
import S from '../../strings.js';
import { Btn } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';

// The Class tab's secondary actions, under the summary card. A button appears only when its handler is
// given. `sf2Hint` disables the SF2 button and says why. The requests link shows how many learner requests
// are waiting for approval, or "Past requests" once every request has been decided.
export default function ClassActions({ onAddLearner, onSf2, sf2Hint = '', requestTotal = 0, requestWaiting = 0, onOpenRequests }) {
  if (!onAddLearner && !onSf2 && !requestTotal) return null;
  const waitingText = `${requestWaiting} ${requestWaiting === 1 ? S.requestsWaitingOne : S.requestsWaitingMany}`;
  return (
    <div className="class-actions" role="group" aria-label={S.classActions}>
      {onAddLearner && <Btn variant="ghost" onClick={onAddLearner}><Icon name="plusSquare" size={18} />{S.addLearnerButton}</Btn>}
      {onSf2 && <Btn variant="ghost" disabled={Boolean(sf2Hint)} onClick={onSf2}><Icon name="download" size={18} />{S.sf2Button}</Btn>}
      {sf2Hint && <span className="class-note">{sf2Hint}</span>}
      {requestTotal > 0 && <button type="button" className="class-link" onClick={onOpenRequests}>{requestWaiting > 0 ? waitingText : S.requestsPast}</button>}
    </div>
  );
}
```

- [ ] **Step 4: Run it to see it pass**

```powershell
npm --prefix parent test -- src/screens/school/ClassActions.test.js
```

Expected: PASS.

- [ ] **Step 5: Add the learner history smoke test**

`LearnerHistory` pulls in Firebase, so this stubs it and checks the screen still loads after the edit below:

```js
import { describe, expect, it, vi } from 'vitest';

// Smoke test: LearnerHistory pulls in Firebase, so stub it and check the module still loads and exports a screen.
vi.mock('../../firebase.js', () => ({
  app: {},
  db: {},
  auth: { currentUser: null },
  callable: () => async () => ({ data: {} }),
}));

describe('LearnerHistory', () => {
  it('loads and exports a component', async () => {
    const mod = await import('./LearnerHistory.jsx');
    expect(typeof mod.default).toBe('function');
  });
});
```

- [ ] **Step 6: Wire the Class tab and the learner history**

The Class tab: requests loader, the Add learner and Requests sheets, and the "Removal pending" chip on rows:

```diff
--- a/parent/src/screens/school/ClassTab.jsx
+++ b/parent/src/screens/school/ClassTab.jsx
@@ -13,11 +13,15 @@ import Icon from '../../components/Icon.jsx';
 import UndoToast from './UndoToast.jsx';
 import ClassActions from './ClassActions.jsx';
 import { sf2MonthOptions, base64ToFile, saveFile } from '../../lib/sf2.js';
+import { useLearnerRequests } from '../../hooks/useLearnerRequests.js';
+import { addPayload, pendingRemovalIds, pendingRequests, prefillFrom } from '../../lib/learnerRequests.js';
 import S from '../../strings.js';
 import './ClassTab.css';
 
 const FlagSheet = lazy(() => import('./FlagSheet.jsx'));
 const Sf2Sheet = lazy(() => import('./Sf2Sheet.jsx'));
+const AddLearnerSheet = lazy(() => import('./AddLearnerSheet.jsx'));
+const RequestsSheet = lazy(() => import('./RequestsSheet.jsx'));
 const STATUS = { P: 'Present', L: 'Late', E: 'Excused', A: 'Absent' };
 const DAY = 86400000;
 const rosterKey = (sectionId, date) => `roster:${auth.currentUser?.uid || ''}:${sectionId}:${date}`;
@@ -90,6 +94,31 @@ export default function ClassTab({ sections, ended, navigate }) {
     finally { sf2Lock.current = false; setSf2Busy(false); }
   };
 
+  // Learner requests: the adviser asks and SIMS decides, so the roster changes only after approval.
+  const requests = useLearnerRequests(validSection, !ended);
+  const [addForm, setAddForm] = useState(null); // { initial } while the Add learner sheet is open
+  const [requestsOpen, setRequestsOpen] = useState(false);
+  const [requestBusy, setRequestBusy] = useState(false);
+  const [requestError, setRequestError] = useState('');
+  const requestLock = useRef(false);
+  const removalIds = useMemo(() => pendingRemovalIds(requests.requests), [requests.requests]);
+  const runRequest = async (work) => {
+    if (requestLock.current) return false;
+    requestLock.current = true; setRequestBusy(true); setRequestError('');
+    try { await work(); requests.refresh(); return true; }
+    catch (e) { setRequestError(schoolError(e)); return false; }
+    finally { requestLock.current = false; setRequestBusy(false); }
+  };
+  const submitAdd = async (form) => {
+    if (await runRequest(() => callable('requestLearnerAddFn')(addPayload(validSection, form)))) {
+      setAddForm(null);
+      setToast({ id: Date.now(), message: S.learnerSent, undo: null });
+    }
+  };
+  const withdrawRequest = async (requestId) => {
+    if (await runRequest(() => callable('withdrawLearnerRequestFn')({ requestId }))) setToast({ id: Date.now(), message: S.requestWithdrawn, undo: null });
+  };
+
   useEffect(() => { import('./FlagSheet.jsx').catch(() => {}); }, []);
   useEffect(() => {
     if (!canCorrect || !groups.inSchool.length) { setSelecting(false); setSelected(new Set()); }
@@ -164,7 +193,10 @@ export default function ClassTab({ sections, ended, navigate }) {
           {!isToday && <Inp type="date" aria-label="School day" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 'auto', minHeight: 44 }} />}
         </div>
       </section>
-      <ClassActions onSf2={ended ? undefined : () => { setSf2Error(''); setSf2Open(true); }} sf2Hint={roster && !roster.rows?.length ? S.sf2NoLearners : ''} />
+      <ClassActions onAddLearner={ended ? undefined : () => { setRequestError(''); setAddForm({ initial: null }); }}
+        onSf2={ended ? undefined : () => { setSf2Error(''); setSf2Open(true); }} sf2Hint={roster && !roster.rows?.length ? S.sf2NoLearners : ''}
+        requestTotal={(requests.requests || []).length} requestWaiting={pendingRequests(requests.requests).length}
+        onOpenRequests={() => { setRequestError(''); setRequestsOpen(true); }} />
       {error && <Banner tone="danger" action={<Btn variant="ghost" onClick={refresh}>Try again</Btn>}>{error}</Banner>}
       {loading && !roster && <Spinner label="Loading your class" />}
       {roster && !isToday && <p className="class-note">Past days are view-only. Your coordinator corrects earlier days in SIMS.</p>}
@@ -172,9 +204,9 @@ export default function ClassTab({ sections, ended, navigate }) {
       {roster && (
         <>
           <RowGroup title="In school" hint={groups.inSchool.length ? (canCorrect ? (selecting ? 'Tick each learner who isn’t in class, then Flag.' : 'Tap a learner for history, or Flag one who isn’t in class.') : null) : 'No gate entries yet for this session.'}
-            rows={groups.inSchool} session={session} selecting={selecting} selected={selected} onPick={canCorrect ? (row) => pick(row, 'flag') : null} onOpen={open} flagLabel="Flag" />
-          <RowGroup title="Flagged" rows={groups.flagged} session={session} onPick={canCorrect ? (row) => pick(row, 'restore') : null} onOpen={open} flagLabel="Restore" collapsible />
-          <RowGroup title="Absent or no gate entry" rows={groups.noEntry} session={session} onOpen={open} collapsible />
+            rows={groups.inSchool} session={session} selecting={selecting} selected={selected} onPick={canCorrect ? (row) => pick(row, 'flag') : null} onOpen={open} flagLabel="Flag" removalIds={removalIds} />
+          <RowGroup title="Flagged" rows={groups.flagged} session={session} onPick={canCorrect ? (row) => pick(row, 'restore') : null} onOpen={open} flagLabel="Restore" collapsible removalIds={removalIds} />
+          <RowGroup title="Absent or no gate entry" rows={groups.noEntry} session={session} onOpen={open} collapsible removalIds={removalIds} />
         </>
       )}
       {selecting && (
@@ -194,16 +226,29 @@ export default function ClassTab({ sections, ended, navigate }) {
             onDownload={downloadSf2} onClose={() => setSf2Open(false)} />
         </Suspense>
       )}
+      {addForm && (
+        <Suspense fallback={null}>
+          <AddLearnerSheet classLabel={sectionLabel(section)} initial={addForm.initial} busy={requestBusy} error={requestError}
+            onSubmit={submitAdd} onClose={() => setAddForm(null)} />
+        </Suspense>
+      )}
+      {requestsOpen && (
+        <Suspense fallback={null}>
+          <RequestsSheet requests={requests.requests || []} busy={requestBusy} error={requestError || requests.error}
+            onWithdraw={withdrawRequest} onClose={() => setRequestsOpen(false)}
+            onSendAgain={(request) => { setRequestsOpen(false); setRequestError(''); setAddForm({ initial: prefillFrom(request) }); }} />
+        </Suspense>
+      )}
       {toast && <UndoToast key={toast.id} message={toast.message} onUndo={toast.undo} onDone={() => setToast(null)} />}
     </div>
   );
 }
 
-function RowGroup({ title, hint, rows, session, selecting = false, selected, onPick, onOpen, flagLabel, collapsible = false }) {
+function RowGroup({ title, hint, rows, session, selecting = false, selected, onPick, onOpen, flagLabel, collapsible = false, removalIds }) {
   if (collapsible && !rows.length) return null;
   const list = (
     <ul className="learner-list class-list" aria-label={title}>
-      {rows.map((row) => <ClassRow key={row.studentId} row={row} session={session} selecting={selecting} checked={Boolean(selected?.has(row.studentId))} onPick={onPick ? () => onPick(row) : null} onOpen={() => onOpen(row)} flagLabel={flagLabel} />)}
+      {rows.map((row) => <ClassRow key={row.studentId} row={row} session={session} selecting={selecting} checked={Boolean(selected?.has(row.studentId))} onPick={onPick ? () => onPick(row) : null} onOpen={() => onOpen(row)} flagLabel={flagLabel} removalPending={Boolean(removalIds?.has(row.studentId))} />)}
     </ul>
   );
   if (collapsible) {
@@ -220,7 +265,7 @@ function RowGroup({ title, hint, rows, session, selecting = false, selected, onP
 
 const flagReason = (reason) => (reason || '').replace(/^Not in class(?::\s*|$)/, '');
 
-function ClassRow({ row, session, selecting, checked, onPick, onOpen, flagLabel }) {
+function ClassRow({ row, session, selecting, checked, onPick, onOpen, flagLabel, removalPending = false }) {
   const status = row[session] || {};
   const entered = enteredFor(row, session);
   const preview = status.overrideActive
@@ -235,6 +280,7 @@ function ClassRow({ row, session, selecting, checked, onPick, onOpen, flagLabel
       <span className="learner-row-body">
         <span className="learner-row-top">
           <span className="learner-row-name">{row.displayName}</span>
+          {removalPending && <span className="class-chip">{S.removePending}</span>}
           {entered && !status.overrideActive && <span className="learner-row-time">{formatScanTime(entered)}</span>}
         </span>
         <span className={`learner-row-preview${status.overrideActive ? ' class-preview--flagged' : ''}`}>{preview}</span>
```

The learner history: the Remove from class link at the bottom of the thread, the sheet, and Withdraw while a removal is pending:

```diff
--- a/parent/src/screens/school/LearnerHistory.jsx
+++ b/parent/src/screens/school/LearnerHistory.jsx
@@ -1,5 +1,7 @@
-import { useCallback, useLayoutEffect, useEffect, useRef, useState } from 'react';
+import { lazy, Suspense, useCallback, useLayoutEffect, useEffect, useRef, useState } from 'react';
 import { callable } from '../../firebase.js';
+import { useLearnerRequests } from '../../hooks/useLearnerRequests.js';
+import { removalFor, removalPayload } from '../../lib/learnerRequests.js';
 import S from '../../strings.js';
 import { Btn, Banner, Spinner, EmptyState } from '../../components/ui.jsx';
 import { Bubble, DayDivider } from '../../components/Bubble.jsx';
@@ -12,6 +14,8 @@ import { historyThread } from '../../lib/thread.js';
 import { schoolError } from '../../lib/school.js';
 import { formatScanTime, localDate } from '../../../../shared/dates.js';
 
+const RemoveLearnerSheet = lazy(() => import('./RemoveLearnerSheet.jsx'));
+
 // Same scan line as the guardian's History.
 function eventMeta(ev) {
   const voided = ev.status === 'voided';
@@ -65,6 +69,25 @@ export default function LearnerHistory({ sectionId, studentId, navigate }) {
     load(null); return () => { ++sequence.current; };
   }, [load]);
 
+  // Asking to take the learner out of the class: SIMS approves it, and the learner stays until then.
+  const requests = useLearnerRequests(sectionId);
+  const removal = requests.requests ? removalFor(requests.requests, studentId) : null;
+  const [removeOpen, setRemoveOpen] = useState(false);
+  const [requestBusy, setRequestBusy] = useState(false);
+  const [requestError, setRequestError] = useState('');
+  const requestLock = useRef(false);
+  const runRequest = async (work) => {
+    if (requestLock.current) return false;
+    requestLock.current = true; setRequestBusy(true); setRequestError('');
+    try { await work(); requests.refresh(); return true; }
+    catch (e) { setRequestError(schoolError(e)); return false; }
+    finally { requestLock.current = false; setRequestBusy(false); }
+  };
+  const sendRemoval = async (input) => {
+    if (await runRequest(() => callable('requestLearnerRemovalFn')(removalPayload(sectionId, studentId, input)))) setRemoveOpen(false);
+  };
+  const withdrawRemoval = () => runRequest(() => callable('withdrawLearnerRequestFn')({ requestId: removal.id }));
+
   const loadOlder = () => { keepFromBottom.current = document.documentElement.scrollHeight - window.scrollY; load(cursor); };
   useLayoutEffect(() => {
     const page = document.documentElement;
@@ -110,7 +133,23 @@ export default function LearnerHistory({ sectionId, studentId, navigate }) {
                 </div>
               </div>
             ))}
+            {requests.requests && (
+              <div className="learner-actions">
+                {removal ? (
+                  <>
+                    <span className="class-chip">{S.removePending}</span>
+                    <button type="button" className="class-link" disabled={requestBusy} onClick={withdrawRemoval}>{S.withdrawRequest}</button>
+                  </>
+                ) : <button type="button" className="class-link class-link--quiet" onClick={() => { setRequestError(''); setRemoveOpen(true); }}>{S.removeFromClass}</button>}
+                {requestError && !removeOpen && <span className="learner-field-error">{requestError}</span>}
+              </div>
+            )}
           </div>}
+      {removeOpen && learner && (
+        <Suspense fallback={null}>
+          <RemoveLearnerSheet displayName={learner.displayName} busy={requestBusy} error={requestError} onSubmit={sendRemoval} onClose={() => setRemoveOpen(false)} />
+        </Suspense>
+      )}
     </>
   );
 }
```

- [ ] **Step 7: Run the Parent suite, then build and check the size**

```powershell
npm --prefix parent test
```

Expected: PASS, 33 test files and 231 tests.

Load the build environment as shown in "Before you start", then:

```powershell
npm --prefix parent run build
npm --prefix parent run size
```

Expected: the build finishes and the size check ends with `initial-load total: 219.8 KB gz (limit 260 KB)`. `AddLearnerSheet`, `RemoveLearnerSheet` and `RequestsSheet` appear as separate small chunks.

- [ ] **Step 8: Commit**

```powershell
git add parent/src/screens/school/ClassActions.jsx parent/src/screens/school/ClassActions.test.js parent/src/screens/school/ClassTab.jsx parent/src/screens/school/LearnerHistory.jsx parent/src/screens/school/LearnerHistory.test.js
git commit -m "feat(parent): add and remove learners from the Class tab and learner history"
```

### Task 9: SIMS wording helpers and request cards

**Files:**
- Create: `src/lib/learnerRequests.js`, `src/pages/learnerRequests/RequestCard.jsx`, `WaitingList.jsx`, `DecidedList.jsx`
- Test: `src/lib/learnerRequests.test.js`, `src/pages/learnerRequests/lists.test.js`

**Interfaces:**
- Consumes: Task 1 (`ENROLL_TYPE_LABELS`, `reasonLabel`); `capsName`, `fullName` from `src/lib/roster.js`; `Badge`, `Btn`, `Card`, `EmptyState`, `Field`, `Inp` from `components/ui.jsx`; `relativeAge` from `src/lib/schoolAssignments.js`.
- Produces: `kindLabel`, `classText`, `nameText`, `placeText`, `existingFlag(request)`, `approveEffect(request)`, `detailRows(request)`, `removalText`, `whenText`, `outcomeText`, `orderWaiting`, `decidableCount`; `RequestCard({ request, disabled, failure, onApprove(request), onReject(request, reason) → Promise<boolean> })`; `WaitingList({ requests, ended, pending, failures, onApprove, onReject })`; `DecidedList({ decided, loading, onMore })`.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest';
import {
  approveEffect, classText, decidableCount, detailRows, existingFlag, kindLabel, orderWaiting, outcomeText, placeText, removalText, whenText,
} from './learnerRequests.js';

const add = {
  id: 'a', kind: 'add', status: 'pending', gradeLevel: 7, sectionName: 'Rizal', displayName: 'Juan Santos Dela Cruz Jr', enrollType: 'transferee', decidable: true, existing: null,
  student: { lrn: '123456789012', lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos', extName: 'Jr', sex: 'M', birthdate: '2012-05-01', address: '123 Rizal St.', guardianName: 'Maria', guardianRelationship: 'Mother', guardianContact: '', contactNumber: '' },
};
const remove = (reasonCode) => ({ id: 'r', kind: 'remove', status: 'pending', gradeLevel: 7, sectionName: 'Rizal', displayName: 'Ana B. Cruz', reasonCode, note: 'Stopped attending', decidable: true });

describe('request wording', () => {
  it('labels the kind and the class', () => {
    expect(kindLabel(add)).toBe('Add');
    expect(kindLabel(remove('dropped_out'))).toBe('Remove');
    expect(classText(add)).toBe('Grade 7 · Rizal');
  });
  it('says what approving a new learner does', () => {
    expect(approveEffect(add)).toBe('Adds JUAN SANTOS DELA CRUZ JR to Grade 7 · Rizal as Transferee.');
  });
  it('says what approving each removal does', () => {
    expect(approveEffect(remove('transferred_out'))).toBe('Marks ANA B. CRUZ as transferred and ends the enrollment.');
    expect(approveEffect(remove('dropped_out'))).toBe('Marks ANA B. CRUZ as dropped and ends the enrollment.');
    expect(approveEffect(remove('moved_section'))).toBe('Ends the enrollment of ANA B. CRUZ. They stay Active and show as Unassigned.');
    expect(removalText(remove('dropped_out'))).toBe('Dropped out · Stopped attending');
  });
  it('lists only the details the adviser filled in', () => {
    expect(detailRows(add)).toEqual([
      ['Name', 'DELA CRUZ, JUAN S. JR'], ['LRN', '123456789012'], ['Sex', 'Male'], ['Birthdate', '2012-05-01'], ['Enrollment type', 'Transferee'],
      ['Address', '123 Rizal St.'], ['Guardian', 'Maria'], ['Relationship', 'Mother'],
    ]);
  });
});

describe('an LRN that is already in SIMS', () => {
  const existing = (over) => ({ ...add, existing: { exists: true, needsAdmin: false, displayName: 'Ben Dy', learnerStatus: 'active', currentGrade: 7, currentSection: 'Mabini', ...over } });
  it('has no flag for a new LRN', () => {
    expect(existingFlag(add)).toBe('');
  });
  it('names a learner in another section and says approving moves them', () => {
    expect(existingFlag(existing({}))).toBe('Already in SIMS: BEN DY, currently Grade 7 · Mabini. Approving moves them here.');
    expect(approveEffect(existing({}))).toBe('');
  });
  it('says where an Unassigned, Dropped or Transferred learner stands, and that approving enrolls them', () => {
    expect(existingFlag(existing({ currentGrade: null, currentSection: '' }))).toBe('Already in SIMS: BEN DY, currently Unassigned. Approving enrolls them here.');
    expect(placeText({ currentGrade: null, learnerStatus: 'dropped' })).toBe('Dropped');
    expect(placeText({ currentGrade: null, learnerStatus: 'transferred' })).toBe('Transferred');
  });
  it('hides the learner from approvers who may not see them', () => {
    expect(existingFlag({ ...add, existing: { exists: true, needsAdmin: true } })).toBe('Needs an administrator');
    expect(existingFlag({ ...add, existing: { exists: true, ambiguous: true, needsAdmin: false } })).toBe('This LRN matches more than one learner. Fix the records first.');
  });
});

describe('lists', () => {
  it('puts requests the person can decide before the ones that need an administrator', () => {
    const rows = [{ id: 'x', decidable: false }, { id: 'y', decidable: true }, { id: 'z', decidable: false }, { id: 'w', decidable: true }];
    expect(orderWaiting(rows).map((r) => r.id)).toEqual(['y', 'w', 'x', 'z']);
    expect(decidableCount(rows)).toBe(2);
  });
  it('words a decision and its time in Manila', () => {
    expect(outcomeText({ status: 'approved', decidedByName: 'Ada Admin' })).toBe('Approved by Ada Admin');
    expect(outcomeText({ status: 'rejected', decidedByName: '' })).toBe('Not approved by staff');
    expect(whenText(Date.UTC(2026, 9, 22, 1, 5))).toContain('Oct 22, 2026');
    expect(whenText(null)).toBe('');
  });
});
```

```js
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RequestCard from './RequestCard.jsx';
import WaitingList from './WaitingList.jsx';
import DecidedList from './DecidedList.jsx';

const h = React.createElement;
const noop = async () => true;
const base = { gradeLevel: 7, sectionId: 'SEC1', sectionName: 'Rizal', requestedByName: 'Tina Teacher', createdAt: Date.now(), decidable: true };
const add = { ...base, id: 'a1', kind: 'add', status: 'pending', displayName: 'Juan Dela Cruz', lrn: '123456789012', enrollType: 'new', existing: null,
  student: { lrn: '123456789012', lastName: 'Dela Cruz', firstName: 'Juan', sex: 'M', birthdate: '2012-05-01', address: '123 Rizal St.' } };
const remove = { ...base, id: 'r1', kind: 'remove', status: 'pending', displayName: 'Ana Cruz', lrn: '100000000001', studentId: 'S1', reasonCode: 'dropped_out', note: 'Stopped attending in September' };
const card = (request, extra = {}) => renderToStaticMarkup(h('ul', null, h(RequestCard, { request, disabled: false, failure: '', onApprove: noop, onReject: noop, ...extra })));

describe('RequestCard', () => {
  it('shows a new learner with what approving does, the details, and both actions', () => {
    const html = card(add);
    expect(html).toContain('JUAN DELA CRUZ');
    expect(html).toContain('LRN 123456789012');
    expect(html).toContain('Grade 7 · Rizal · requested by Tina Teacher');
    expect(html).toContain('Adds JUAN DELA CRUZ to Grade 7 · Rizal as New.');
    expect(html).toContain('<summary');
    expect(html).toContain('123 Rizal St.');
    expect(html).toContain('>Approve<');
    expect(html).toContain('>Reject<');
  });
  it('flags an LRN already in SIMS instead of repeating the effect', () => {
    const html = card({ ...add, existing: { exists: true, needsAdmin: false, displayName: 'Ben Dy', learnerStatus: 'active', currentGrade: 7, currentSection: 'Mabini' } });
    expect(html).toContain('Already in SIMS: BEN DY, currently Grade 7 · Mabini. Approving moves them here.');
    expect(html).not.toContain('Adds JUAN');
  });
  it('shows a request that needs an administrator without actions', () => {
    const html = card({ ...add, decidable: false, existing: { exists: true, needsAdmin: true } });
    expect(html).toContain('Needs an administrator');
    expect(html).not.toContain('>Approve<');
    expect(html).not.toContain('>Reject<');
  });
  it('shows a removal with the reason, the note and what approving does', () => {
    const html = card(remove);
    expect(html).toContain('Dropped out · Stopped attending in September');
    expect(html).toContain('Marks ANA CRUZ as dropped and ends the enrollment.');
    expect(html).not.toContain('<summary');
  });
  it('shows a failed decision on the card and locks the actions while one is running', () => {
    const html = card(add, { failure: 'Already decided.', disabled: true });
    expect(html).toContain('Already decided.');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});

describe('WaitingList', () => {
  it('explains where requests come from when none wait', () => {
    const html = renderToStaticMarkup(h(WaitingList, { requests: [], ended: false, pending: false, failures: {}, onApprove: noop, onReject: noop }));
    expect(html).toContain('No requests waiting');
    expect(html).toContain('Class tab of the parent app');
  });
  it('lists what the person can decide before what needs an administrator', () => {
    const needs = { ...add, id: 'a2', decidable: false, displayName: 'Cara Lim', existing: { exists: true, needsAdmin: true } };
    const html = renderToStaticMarkup(h(WaitingList, { requests: [needs, remove], ended: false, pending: false, failures: {}, onApprove: noop, onReject: noop }));
    expect(html.indexOf('ANA CRUZ')).toBeGreaterThan(-1);
    expect(html.indexOf('ANA CRUZ')).toBeLessThan(html.indexOf('CARA LIM'));
  });
  it('disables every action once the school year has ended', () => {
    const html = renderToStaticMarkup(h(WaitingList, { requests: [add], ended: true, pending: false, failures: {}, onApprove: noop, onReject: noop }));
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});

describe('DecidedList', () => {
  const decided = (over) => ({ ...base, id: 'd1', kind: 'add', status: 'approved', displayName: 'Maria Santos', lrn: '123456789013', decidedAt: Date.UTC(2026, 9, 22, 1, 5), decidedByName: 'Ada Admin', decisionReason: 'Approved', ...over });
  it('shows the outcome, who decided, when, and the reason', () => {
    const html = renderToStaticMarkup(h(DecidedList, { decided: { requests: [decided({}), decided({ id: 'd2', status: 'rejected', kind: 'remove', displayName: 'Ben Dy', reasonCode: 'transferred_out', note: 'Moved', decisionReason: 'Wrong learner' })], nextCursor: null }, loading: false, onMore() {} }));
    expect(html).toContain('Approved by Ada Admin · Oct 22, 2026');
    expect(html).toContain('Not approved');
    expect(html).toContain('Remove BEN DY');
    expect(html).toContain('Reason: Wrong learner');
    expect(html).not.toContain('Load more');
  });
  it('offers more when the server has another page, and says so when nothing is decided', () => {
    expect(renderToStaticMarkup(h(DecidedList, { decided: { requests: [decided({})], nextCursor: { ms: 1, id: 'x' } }, loading: false, onMore() {} }))).toContain('Load more');
    expect(renderToStaticMarkup(h(DecidedList, { decided: { requests: [], nextCursor: null }, loading: false, onMore() {} }))).toContain('Nothing decided yet');
    expect(renderToStaticMarkup(h(DecidedList, { decided: null, loading: true, onMore() {} }))).toContain('Loading decided requests');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

```powershell
npx vitest run src/lib/learnerRequests.test.js src/pages/learnerRequests/lists.test.js
```

Expected: FAIL (the modules do not exist).

- [ ] **Step 3: Write the helpers and components**

```js
import { ENROLL_TYPE_LABELS, reasonLabel } from '../../shared/learnerRequests.js';
import { capsName, fullName } from './roster.js';

// Words the Learner requests page shows. The server decides who may act; this file only phrases it.
export const kindLabel = (request) => (request.kind === 'add' ? 'Add' : 'Remove');
export const classText = (request) => `Grade ${request.gradeLevel} · ${request.sectionName || request.sectionId}`;
export const nameText = (request) => capsName(request.displayName);

const STATUS_WORD = { dropped: 'Dropped', transferred: 'Transferred' };

// Where an existing learner is now, in words an approver can act on.
export function placeText(existing) {
  if (existing.currentGrade != null) return `Grade ${existing.currentGrade} · ${existing.currentSection}`;
  return STATUS_WORD[existing.learnerStatus] || 'Unassigned';
}

// The flag under an Add whose LRN is already in SIMS; '' when the LRN is new.
export function existingFlag(request) {
  const existing = request.existing;
  if (!existing) return '';
  if (existing.needsAdmin) return 'Needs an administrator';
  if (existing.ambiguous) return 'This LRN matches more than one learner. Fix the records first.';
  const effect = existing.currentGrade != null ? 'Approving moves them here.' : 'Approving enrolls them here.';
  return `Already in SIMS: ${capsName(existing.displayName)}, currently ${placeText(existing)}. ${effect}`;
}

// What approving a request will do, in a sentence. Adds for a learner already in SIMS say it in the flag instead.
export function approveEffect(request) {
  const name = nameText(request);
  if (request.kind === 'remove') {
    if (request.reasonCode === 'transferred_out') return `Marks ${name} as transferred and ends the enrollment.`;
    if (request.reasonCode === 'dropped_out') return `Marks ${name} as dropped and ends the enrollment.`;
    return `Ends the enrollment of ${name}. They stay Active and show as Unassigned.`;
  }
  return request.existing ? '' : `Adds ${name} to ${classText(request)} as ${ENROLL_TYPE_LABELS[request.enrollType] || 'New'}.`;
}

// The "Details" of an Add: everything the adviser typed, skipping what was left blank.
export function detailRows(request) {
  const student = request.student || {};
  return [
    ['Name', fullName(student)], ['LRN', student.lrn], ['Sex', student.sex === 'F' ? 'Female' : student.sex === 'M' ? 'Male' : ''],
    ['Birthdate', student.birthdate], ['Enrollment type', ENROLL_TYPE_LABELS[request.enrollType]], ['Address', student.address],
    ['Guardian', student.guardianName], ['Relationship', student.guardianRelationship], ['Guardian contact', student.guardianContact],
    ['Contact number', student.contactNumber],
  ].filter(([, value]) => value);
}

// One line under a removal: why the adviser asked.
export const removalText = (request) => `${reasonLabel(request.reasonCode)} · ${request.note}`;

export const whenText = (ms) => (ms ? new Date(ms).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '');

export const outcomeText = (request) => `${request.status === 'approved' ? 'Approved' : 'Not approved'} by ${request.decidedByName || 'staff'}`;

// Requests the signed-in person can decide come first, then the ones that need an administrator.
export const orderWaiting = (requests) => [...requests.filter((r) => r.decidable), ...requests.filter((r) => !r.decidable)];
export const decidableCount = (requests) => requests.filter((r) => r.decidable).length;
```

```jsx
import { useState } from 'react';
import { Badge, Btn, Field, Inp } from '../../components/ui.jsx';
import { T } from '../../styles.js';
import { relativeAge } from '../../lib/schoolAssignments.js';
import { approveEffect, classText, detailRows, existingFlag, kindLabel, nameText, removalText } from '../../lib/learnerRequests.js';

const muted = { fontSize: 13, color: T.inkMuted };

// One waiting request. Approve is one tap; Reject asks for a reason first. A request that needs an
// administrator is shown without actions to everyone else.
export default function RequestCard({ request, disabled, failure, onApprove, onReject }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const flag = existingFlag(request);
  const effect = approveEffect(request);
  const submitReject = (event) => {
    event.preventDefault();
    const text = reason.trim();
    if (text) onReject(request, text).then((ok) => { if (ok) { setRejecting(false); setReason(''); } });
  };
  return <li id={`learner-request-${request.id}`} style={{ padding: '16px 0', borderTop: `1px solid ${T.border}` }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px' }}>
      <Badge tone={request.kind === 'add' ? 'info' : 'warning'}>{kindLabel(request)}</Badge>
      <strong>{nameText(request)}</strong>
      <span style={muted}>LRN {request.lrn}</span>
      <span style={muted}>{relativeAge(request.createdAt)}</span>
    </div>
    <div style={{ marginTop: 4 }}>{classText(request)} · requested by {request.requestedByName}</div>
    {flag && <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
      <li className={`sims-flag${request.decidable ? '' : ' sims-flag--conflict'}`}>{flag}</li></ul>}
    {request.kind === 'remove' && <p style={{ margin: '8px 0 0' }}>{removalText(request)}</p>}
    {effect && <p style={{ ...muted, margin: '8px 0 0' }}>{effect}</p>}
    {request.kind === 'add' && <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13 }}>Details</summary>
      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0,1fr)', gap: '4px 16px', margin: '8px 0 0', fontSize: 13 }}>
        {detailRows(request).map(([label, value]) => <div key={label} style={{ display: 'contents' }}><dt style={muted}>{label}</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{value}</dd></div>)}
      </dl>
    </details>}
    {failure && <p role="alert" className="sims-feedback" style={{ marginTop: 10 }}>{failure}</p>}
    {request.decidable && (rejecting
      ? <form onSubmit={submitReject} style={{ marginTop: 12 }}>
        <p style={{ fontSize: 13, margin: '0 0 8px' }}>Tell the adviser why. They see this in the parent app.</p>
        <Field label="Reason"><Inp autoFocus required maxLength={500} value={reason} disabled={disabled} onChange={e => setReason(e.target.value)} /></Field>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Btn type="submit" disabled={disabled || !reason.trim()}>{disabled ? 'Working…' : 'Reject request'}</Btn>
          <Btn variant="ghost" type="button" disabled={disabled} onClick={() => setRejecting(false)}>Cancel</Btn>
        </div>
      </form>
      : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <Btn disabled={disabled} onClick={() => onApprove(request)}>Approve</Btn>
        <Btn variant="ghost" disabled={disabled} onClick={() => setRejecting(true)}>Reject</Btn>
      </div>)}
  </li>;
}
```

```jsx
import { Card, EmptyState } from '../../components/ui.jsx';
import { orderWaiting } from '../../lib/learnerRequests.js';
import RequestCard from './RequestCard.jsx';

// Oldest first, with the ones that need an administrator after the ones this person can decide.
export default function WaitingList({ requests, ended, pending, failures, onApprove, onReject }) {
  return <Card style={{ padding: 20 }}>
    {requests.length === 0
      ? <EmptyState title="No requests waiting" hint="Class advisers send requests from the Class tab of the parent app." />
      : <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{orderWaiting(requests).map(request => (
        <RequestCard key={request.id} request={request} disabled={pending || ended} failure={failures[request.id]} onApprove={onApprove} onReject={onReject} />))}</ul>}
  </Card>;
}
```

```jsx
import { Badge, Btn, Card, EmptyState } from '../../components/ui.jsx';
import { T } from '../../styles.js';
import { classText, kindLabel, nameText, outcomeText, removalText, whenText } from '../../lib/learnerRequests.js';

const muted = { fontSize: 13, color: T.inkMuted };

// Newest decision first, 50 at a time.
export default function DecidedList({ decided, loading, onMore }) {
  if (!decided) return <p role="status">Loading decided requests…</p>;
  return <Card style={{ padding: 20 }}>
    {decided.requests.length === 0
      ? <EmptyState title="Nothing decided yet" hint="Approved and rejected requests appear here." />
      : <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{decided.requests.map(request => (
        <li key={request.id} style={{ padding: '14px 0', borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px' }}>
            <Badge tone={request.status === 'approved' ? 'success' : 'danger'}>{request.status === 'approved' ? 'Approved' : 'Not approved'}</Badge>
            <strong>{kindLabel(request)} {nameText(request)}</strong>
            <span style={muted}>LRN {request.lrn}</span>
          </div>
          <div style={{ marginTop: 4 }}>{classText(request)} · requested by {request.requestedByName}</div>
          {request.kind === 'remove' && <div style={muted}>{removalText(request)}</div>}
          <div style={muted}>{outcomeText(request)} · {whenText(request.decidedAt)}</div>
          {request.decisionReason && <div style={muted}>Reason: {request.decisionReason}</div>}
        </li>))}</ul>}
    {decided.nextCursor && <Btn variant="ghost" disabled={loading} onClick={onMore} style={{ marginTop: 12 }}>Load more</Btn>}
  </Card>;
}
```

- [ ] **Step 4: Run the tests to see them pass**

```powershell
npx vitest run src/lib/learnerRequests.test.js src/pages/learnerRequests/lists.test.js
```

Expected: PASS, 2 test files.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/learnerRequests.js src/lib/learnerRequests.test.js src/pages/learnerRequests
git commit -m "feat(sims): learner request wording and cards"
```

### Task 10: The SIMS page, the badge and the navigation

**Files:**
- Create: `src/hooks/useLearnerRequestCount.js`, `src/pages/learnerRequests/useLearnerRequestLists.js`, `src/pages/LearnerRequestsPage.jsx`
- Modify: `src/lib/navigation.js`, `src/lib/access.js`, `src/components/Shell.jsx`, `src/App.jsx`
- Test: `src/pages/LearnerRequestsPage.test.js`, `src/lib/access.test.js`

**Interfaces:**
- Consumes: Task 9; the callables `listLearnerRequestsFn`, `resolveLearnerRequestFn`, `getLearnerRequestCountFn`; `SubTabs` from `src/pages/guardians/school/SubTabs.jsx`.
- Produces: `useLearnerRequestCount(enabled)` → number; `refreshLearnerRequestCount()`; `useLearnerRequestLists()` → `{ waiting, decided, loading, loadedAt, error, notice, pending, failures, refresh, loadDecided(more), decide(request, approve, reason, message) → Promise<boolean> }`; the default `LearnerRequestsPage({ schoolYear })`; the nav key `learnerRequests`, open to every staff role.

- [ ] **Step 1: Write the failing tests**

The page renders its heading before any answer arrives (the callables are not called during a static render):

```js
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../firebase.js', () => ({ functions: {} }));

import LearnerRequestsPage from './LearnerRequestsPage.jsx';

const h = React.createElement;

describe('LearnerRequestsPage', () => {
  it('renders its heading and school year before any answer arrives', () => {
    const html = renderToStaticMarkup(h(LearnerRequestsPage, { schoolYear: '2026-2027' }));
    expect(html).toContain('Learner requests');
    expect(html).toContain('SY 2026-2027');
    expect(html).toContain('Refresh');
  });
});
```

Every staff role gets the new page:

```diff
--- a/src/lib/access.test.js
+++ b/src/lib/access.test.js
@@ -54,10 +54,11 @@ describe('staff data startup', () => {
 describe('pages', () => {
   it('admins open everything including Accounts', () => {
     expect(isAdmin(admin)).toBe(true);
-    expect(allowedPages(admin)).toEqual(expect.arrayContaining(['dashboard', 'enroll', 'guardians', 'announcements', 'settings', 'accounts']));
+    expect(allowedPages(admin)).toEqual(expect.arrayContaining(['dashboard', 'enroll', 'guardians', 'announcements', 'settings', 'accounts', 'learnerRequests']));
   });
-  it('coordinators open the shared pages, including Announcements', () => {
-    expect(allowedPages(jhs)).toEqual(['dashboard', 'students', 'sections', 'schedules', 'attendance', 'announcements']);
+  it('coordinators open the shared pages, including Announcements and Learner requests', () => {
+    expect(allowedPages(jhs)).toEqual(['dashboard', 'students', 'learnerRequests', 'sections', 'schedules', 'attendance', 'announcements']);
+    expect(canOpen(glc8, 'learnerRequests')).toBe(true);
     expect(canOpen(glc8, 'attendance')).toBe(true);
     expect(canOpen(glc8, 'enroll')).toBe(false);
     expect(canOpen({ role: 'teacher' }, 'dashboard')).toBe(false);
```

- [ ] **Step 2: Run them to see them fail**

```powershell
npx vitest run src/pages/LearnerRequestsPage.test.js src/lib/access.test.js
```

Expected: FAIL (the page does not exist, and `learnerRequests` is not an allowed page yet).

- [ ] **Step 3: Write the hooks and the page**

```js
import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

// One shared count for the sidebar badge; concurrent refreshes share a call. It counts only the learner
// requests the signed-in person can decide, and refreshes on load, on window focus and after each decision.
let count = 0;
let inflight = null;
const listeners = new Set();
export function refreshLearnerRequestCount() {
  inflight ??= httpsCallable(functions, 'getLearnerRequestCountFn')({})
    .then(result => { count = Number(result.data?.count) || 0; listeners.forEach(listener => listener(count)); })
    .catch(() => { /* the badge simply keeps its last value */ })
    .finally(() => { inflight = null; });
  return inflight;
}
export function useLearnerRequestCount(enabled) {
  const [value, setValue] = useState(count);
  useEffect(() => {
    if (!enabled) return undefined;
    listeners.add(setValue);
    refreshLearnerRequestCount();
    const onFocus = () => refreshLearnerRequestCount();
    window.addEventListener('focus', onFocus);
    return () => { listeners.delete(setValue); window.removeEventListener('focus', onFocus); };
  }, [enabled]);
  return enabled ? value : 0;
}
```

```js
import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { schoolError } from '../../../parent/src/lib/school.js';
import { refreshLearnerRequestCount } from '../../hooks/useLearnerRequestCount.js';

const invoke = async (name, data = {}) => (await httpsCallable(functions, name)(data)).data;

// The Waiting and Decided lists and one decision lock shared by every card. The server filters both lists to
// what this person may see; a failed decision is kept per card so it shows where the person is looking.
export function useLearnerRequestLists() {
  const [waiting, setWaiting] = useState(null); // { requests, ended }
  const [decided, setDecided] = useState(null); // { requests, nextCursor }
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [failures, setFailures] = useState({});
  const lock = useRef(false);
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError('');
    try {
      const data = await invoke('listLearnerRequestsFn', { view: 'waiting' });
      if (request === sequence.current) { setWaiting({ requests: data.requests, ended: data.ended }); setDecided(null); setLoadedAt(Date.now()); }
    } catch (e) { if (request === sequence.current) setError(schoolError(e)); }
    finally { if (request === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { refresh(); return () => { ++sequence.current; }; }, [refresh]);

  const loadDecided = useCallback(async (more = false) => {
    setLoading(true); setError('');
    try {
      const data = await invoke('listLearnerRequestsFn', { view: 'decided', cursor: more ? decided?.nextCursor : undefined });
      setDecided((current) => ({ requests: more ? [...(current?.requests || []), ...data.requests] : data.requests, nextCursor: data.nextCursor }));
    } catch (e) { setError(schoolError(e)); }
    finally { setLoading(false); }
  }, [decided?.nextCursor]);

  // Approve, or reject with a reason. Resolves true when the server accepted the decision.
  const decide = useCallback(async (request, approve, reason, message) => {
    if (lock.current) return false;
    lock.current = true; setPending(true); setError(''); setNotice('');
    setFailures((current) => { const { [request.id]: _gone, ...rest } = current; return rest; });
    try {
      await invoke('resolveLearnerRequestFn', { requestId: request.id, approve, reason });
      setNotice(message);
      await refresh();
      refreshLearnerRequestCount();
      return true;
    } catch (e) {
      setFailures((current) => ({ ...current, [request.id]: schoolError(e) }));
      await refresh(); // the card reloads, so a request someone else decided disappears
      return false;
    } finally { lock.current = false; setPending(false); }
  }, [refresh]);

  return { waiting, decided, loading, loadedAt, error, notice, pending, failures, refresh, loadDecided, decide };
}
```

```jsx
import { useEffect, useState } from 'react';
import { Btn } from '../components/ui.jsx';
import { T, S } from '../styles.js';
import { relativeAge } from '../lib/schoolAssignments.js';
import { decidableCount, nameText } from '../lib/learnerRequests.js';
import SubTabs from './guardians/school/SubTabs.jsx';
import WaitingList from './learnerRequests/WaitingList.jsx';
import DecidedList from './learnerRequests/DecidedList.jsx';
import { useLearnerRequestLists } from './learnerRequests/useLearnerRequestLists.js';

// Advisers ask in the parent app to add or remove a learner; an Administrator, or whoever covers the grade,
// decides here (spec 2026-10-22). The server filters both lists to what this person may see.
export default function LearnerRequestsPage({ schoolYear }) {
  const lists = useLearnerRequestLists();
  const { waiting, decided, loading, loadedAt, error, notice, pending, failures } = lists;
  const [view, setView] = useState('waiting');
  const [, tick] = useState(0);
  const count = waiting ? decidableCount(waiting.requests) : 0;
  const ended = Boolean(waiting?.ended);
  useEffect(() => { if (view === 'decided' && !decided && !loading) lists.loadDecided(false); }, [view, decided]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(timer); }, []);
  const tabs = [['waiting', `Waiting${count ? ` (${count})` : ''}`], ['decided', 'Decided']];
  return <div style={{ fontFamily: T.body }}>
    <div className="sims-heading" style={S.plate}>
      <h1 style={S.h1}>Learner requests</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: T.inkMuted }}>{loading ? 'Updating…' : loadedAt ? `Updated ${relativeAge(loadedAt)}` : ''}</span>
        <Btn variant="ghost" disabled={loading || pending} onClick={lists.refresh}>Refresh</Btn>
      </div>
    </div>
    <p style={{ margin: '12px 0 16px', fontSize: 13, color: T.inkMuted }}>SY {schoolYear}{ended ? ' · ended, read only' : ''}</p>
    {error && <p role="alert" className="sims-feedback">{error}</p>}
    {notice && <p role="status" className="sims-feedback is-success">{notice}</p>}
    {!waiting && loading && <p role="status">Loading learner requests…</p>}
    {waiting && <>
      <SubTabs id="learner-requests" label="Learner request views" tabs={tabs} value={view} onChange={setView} />
      <div role="tabpanel" id="learner-requests-panel" aria-labelledby={`learner-requests-tab-${view}`}>
        {view === 'waiting'
          ? <WaitingList requests={waiting.requests} ended={ended} pending={pending} failures={failures}
            onApprove={request => lists.decide(request, true, '', `Approved ${nameText(request)}. The adviser gets an inbox note.`)}
            onReject={(request, reason) => lists.decide(request, false, reason, 'Rejected. The adviser sees your reason.')} />
          : <DecidedList decided={decided} loading={loading} onMore={() => lists.loadDecided(true)} />}
      </div>
    </>}
  </div>;
}
```

- [ ] **Step 4: Wire the navigation, access, badge and route**

```diff
--- a/src/lib/navigation.js
+++ b/src/lib/navigation.js
@@ -1,6 +1,7 @@
 export const NAV_ITEMS = [
   { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
   { key: 'students', label: 'Students', icon: 'students' },
+  { key: 'learnerRequests', label: 'Learner requests', icon: 'enroll' },
   { key: 'sections', label: 'Sections', icon: 'sections' },
   { key: 'schedules', label: 'Schedules', icon: 'calendar' },
   { key: 'enroll', label: 'Enrollment', icon: 'enroll' },
```

```diff
--- a/src/lib/access.js
+++ b/src/lib/access.js
@@ -5,7 +5,7 @@ export { sectionEditSchoolYears } from '../../shared/sectionEditing.js';
 
 // Every page/permission decision the SIMS app makes about the signed-in staff
 // member. Pages ask here; nothing else compares role strings.
-const COORDINATOR_PAGES = ['dashboard', 'students', 'sections', 'schedules', 'attendance', 'announcements'];
+const COORDINATOR_PAGES = ['dashboard', 'students', 'learnerRequests', 'sections', 'schedules', 'attendance', 'announcements'];
 export const DISABLED_MESSAGE = 'This account has been disabled. Contact an administrator.';
 
 export const isAdmin = (me) => roleOf(me) === 'admin';
```

```diff
--- a/src/components/Shell.jsx
+++ b/src/components/Shell.jsx
@@ -6,6 +6,7 @@ import NavIcon from './NavIcon.jsx';
 import { NAV_ITEMS } from '../lib/navigation.js';
 import { canOpen, isAdmin } from '../lib/access.js';
 import { useSchoolPendingCount } from '../hooks/useSchoolPendingCount.js';
+import { useLearnerRequestCount } from '../hooks/useLearnerRequestCount.js';
 import smartaWordmark from '../assets/smarta-wordmark-sidebar.png';
 import smartaWordmarkDark from '../assets/smarta-wordmark-sidebar-dark.png';
 import smartaMark from '../assets/smarta-mark.png';
@@ -22,8 +23,11 @@ export default function Shell({ me, page, setPage, schoolYear, onLogout, childre
   const mobile = width < 768;
   const items = NAV_ITEMS.filter(item => canOpen(me, item.key));
   const pendingSchool = useSchoolPendingCount(isAdmin(me));
-  const badgeLabel = 'pending school access requests';
-  const navLabel = item => (item.key === 'guardians' && pendingSchool ? `${item.label}, ${pendingSchool} ${badgeLabel}` : item.label);
+  const waitingLearners = useLearnerRequestCount(canOpen(me, 'learnerRequests'));
+  // Counts on nav items: pending school access requests (administrators) and learner requests this person can decide.
+  const badgeFor = item => item.key === 'guardians' ? { count: pendingSchool, label: 'pending school access requests' }
+    : item.key === 'learnerRequests' ? { count: waitingLearners, label: 'learner requests waiting' } : null;
+  const navLabel = item => { const badge = badgeFor(item); return badge?.count ? `${item.label}, ${badge.count} ${badge.label}` : item.label; };
   const collapsed = !mobile && (preference ?? width < 1024);
   useEffect(() => {
     const resize = () => { setWidth(window.innerWidth); setTooltip(null); if (window.innerWidth >= 768) setDrawer(false); };
@@ -53,7 +57,7 @@ export default function Shell({ me, page, setPage, schoolYear, onLogout, childre
       {items.map(item => <button key={item.key} className="sims-nav-item" aria-current={page === item.key ? 'page' : undefined}
         aria-label={collapsed ? navLabel(item) : undefined} onClick={() => navigate(item.key)} {...hint(item.label)}>
         <NavIcon name={item.icon} size={18}/><span className={collapsed ? 'sims-nav-tooltip' : ''}>{item.label}</span>
-        {item.key === 'guardians' && pendingSchool > 0 && <CountBadge count={pendingSchool} label={badgeLabel} />}
+        {badgeFor(item)?.count > 0 && <CountBadge count={badgeFor(item).count} label={badgeFor(item).label} />}
       </button>)}
     </nav>
     <AccountMenu me={me} collapsed={collapsed} onLogout={onLogout} hint={hint} />
```

```diff
--- a/src/App.jsx
+++ b/src/App.jsx
@@ -19,6 +19,7 @@ import loadingGif from './assets/loading.gif';
 // the single initial bundle.
 const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
 const StudentsPage = lazy(() => import('./pages/StudentsPage.jsx'));
+const LearnerRequestsPage = lazy(() => import('./pages/LearnerRequestsPage.jsx'));
 const SectionsPage = lazy(() => import('./pages/SectionsPage.jsx'));
 const SchedulesPage = lazy(() => import('./pages/SchedulesPage.jsx'));
 const EnrollPage = lazy(() => import('./pages/EnrollPage.jsx'));
@@ -160,6 +161,7 @@ export default function App() {
         <Suspense fallback={<PageFallback />}>
           {shown==='dashboard' && <DashboardPage me={me} schoolYear={schoolYear} setPage={setPage} />}
           {shown==='students' && <StudentsPage me={me} schoolYear={schoolYear} initialGradeFilter={pageParams?.gradeFilter} initialStatus={pageParams?.status} />}
+          {shown==='learnerRequests' && <LearnerRequestsPage schoolYear={schoolYear} />}
           {shown==='sections' && <SectionsPage me={me} schoolYear={schoolYear} />}
           {shown==='schedules' && <SchedulesPage me={me} schoolYear={schoolYear} />}
           {shown==='enroll' && <EnrollPage me={me} schoolYear={schoolYear} />}
```

- [ ] **Step 5: Run the tests to see them pass, then the suites and the build**

```powershell
npx vitest run src/pages/LearnerRequestsPage.test.js src/lib/access.test.js
npx vitest run
```

Expected: the first run passes (2 test files). The full run passes with 77 test files and 764 tests.

Build SIMS as shown in "Before you start". Expected: `✓ built`. The Learner requests page appears as its own lazy chunk.

- [ ] **Step 6: Commit**

```powershell
git add src/hooks/useLearnerRequestCount.js src/pages/learnerRequests/useLearnerRequestLists.js src/pages/LearnerRequestsPage.jsx src/pages/LearnerRequestsPage.test.js src/lib/navigation.js src/lib/access.js src/lib/access.test.js src/components/Shell.jsx src/App.jsx
git commit -m "feat(sims): Learner requests page, badge and navigation"
```

### Task 11: Adviser guide, release notes and final verification

**Files:**
- Modify: `docs/parent-portal-adviser-guide.md`
- Create: `docs/releases/2026-10-22-learner-requests/README.md`

- [ ] **Step 1: Document the feature for advisers**

Append this section to the end of `docs/parent-portal-adviser-guide.md`:

```markdown

## Adding or removing a learner

You ask; an administrator or your grade's coordinator decides in SIMS. Nothing changes in your class until it is approved.

**Add a learner.** On **Class**, tap **Add learner**. Enter the learner's details, the same ones the registrar imports from Excel. LRN, name, sex and birthdate are required; the enrollment type starts as New; address and guardian details are optional. Your class and grade are filled in for you. Tap **Send for approval**.

**Remove a learner.** Open the learner from the Class tab, scroll to the bottom and tap **Remove from class**. Choose why (Transferred out, Dropped out, or Moved to another section), add a short note and send it. The learner stays in your class, marked *Removal pending*, until it is approved. Nothing is deleted: the learner's record and past attendance stay in SIMS.

**Follow up.** The Class tab shows how many requests are waiting. Open it to withdraw a request, or to send a not-approved add again with the form filled in. Re-enter the address and phone numbers, because the school clears them once a request is decided. You get an Inbox note when a request is approved or not approved, with the reason.

If the LRN you enter already belongs to a learner in SIMS, your request still goes through: the approver sees it and decides whether to enroll or move that learner.
```

- [ ] **Step 2: Write the release notes**

Create `docs/releases/2026-10-22-learner-requests/README.md`:

```markdown
# Learner add/remove requests (2026-10-22)

Spec: `docs/superpowers/specs/2026-10-22-parent-learner-requests-design.md`
Plan: `docs/superpowers/plans/2026-10-22-parent-learner-requests.md`
Builds on: `docs/releases/2026-10-22-sf2-export/README.md` (the shared `Sheet` component and the Class actions row).

## What ships

- **Functions (7 callables):** `requestLearnerAddFn`, `requestLearnerRemovalFn`, `withdrawLearnerRequestFn`, `getLearnerRequestsFn`, `listLearnerRequestsFn`, `resolveLearnerRequestFn`, `getLearnerRequestCountFn`. Also the `learnerRequest` rate limit in `callable.js` and the `deleteSchoolAccess` change in `schoolAccess.js` (withdraws an adviser's pending learner requests).
- **Firestore:** five composite indexes on `learner_change_requests`. Deploy them and wait until they are READY before the SIMS page is used. The rules gain an explicit deny; production already denies the collection by default, so no rules deploy is needed.
- **SIMS:** the Learner requests page, the sidebar badge, and the access and navigation changes.
- **Parent App:** the Add learner, Remove from class and Requests sheets on the Class tab and learner history.

## Order

1. Functions and indexes. The production backend is deployed by name from a prepared tree, not from `master` (see `docs/releases/2026-10-18-school-family/prepareBackend.mjs` and the later preparers). Confirm that tree's `schoolAccess.js` exports `loadSchoolActor` and `inboxRef`, and add the `deleteSchoolAccess` change to it. The tree also needs `shared/learnerRequests.js`, the `reviewGrades` export in `shared/schoolAccess.js`, `functions/src/handlers/learnerRequests.js` and `functions/src/lib/learnerRequestCleanup.js`.
2. SIMS, through the release-tree process: a new preparer that wraps `docs/releases/2026-10-21-caps-names/prepare.mjs` and overlays the files below. Each ported file is the tree's own copy with this change applied.
3. Parent App last (`npm run deploy:parent` from a fresh `origin/master`, see `AGENTS.md`), so requests cannot arrive before approvers have a page.

## SIMS overlay

- New: `src/pages/LearnerRequestsPage.jsx`, `src/pages/learnerRequests/*`, `src/hooks/useLearnerRequestCount.js`, `src/lib/learnerRequests.js`, `shared/learnerRequests.js`.
- Ported onto the tree's copy: `src/App.jsx`, `src/components/Shell.jsx`, `src/lib/access.js`, `src/lib/navigation.js`, and `shared/schoolAccess.js` (only `reviewGrades` becomes an export).
- Not part of this release: the SF2 refactor (`src/lib/sf2*.js`, `AttendanceSummaryPage.jsx`).

## Checks

- As a Grade Level Coordinator, confirm the Learner requests item and its badge appear and only your grade's requests are listed.
- As a class adviser, add a learner and remove a learner; approve both in SIMS and confirm the roster, the learner's status in SIMS, and the Inbox notes.
- Add a learner whose LRN already exists and confirm an Administrator sees the "Already in SIMS" flag and a coordinator sees "Needs an administrator" for an Unassigned learner.
- Record the deployment under `docs/audits/deployments/`.
```

- [ ] **Step 3: Run the complete verification**

```powershell
npx vitest run
npm --prefix parent test
npm --prefix functions test
npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run --no-file-parallelism test/emulator/learnerRequests.test.js test/emulator/schoolAccess.test.js test/emulator/sf2Export.test.js"
npx firebase emulators:exec --only firestore "vitest run -c vitest.rules.config.js tests/rules/learnerRequests.test.js"
```

Expected: root 77 files and 764 tests; Parent 33 files and 231 tests; functions 23 files and 171 tests; emulator 3 files and 74 tests; rules 1 file and 1 test. Then build SIMS and the Parent App as shown in "Before you start": both finish, and the size check ends with `initial-load total: 219.8 KB gz (limit 260 KB)`.

- [ ] **Step 4: Optional browser check**

With the emulators running (a `demo-` project id, an App Check placeholder, and `functions/.env.local` containing `PORTAL_URL`), seed an adviser, a coordinator and an administrator. As the adviser, add a learner and remove another; as the coordinator, open **Learner requests** in SIMS, approve one and reject one; confirm the Class tab, the learner history and the Inbox update. This was not part of the automated checks.

- [ ] **Step 5: Commit**

```powershell
git add docs/parent-portal-adviser-guide.md docs/releases/2026-10-22-learner-requests/README.md
git commit -m "docs: learner request guide and release notes"
```

## Self-review notes

- **Spec coverage:** approvers and self-approval (Tasks 1, 4); add fields and the import's rules (Tasks 1, 6, 7); removal reasons and outcomes (Tasks 1, 4); existing-LRN flag and Administrator-only cases (Tasks 3, 4, 9); rejection reason, Inbox notes, audit rows, minimal retention (Tasks 2, 4); limits and dedupe (Task 2); collection closed, indexes (Task 5); Parent sheets, chip, requests link, Send again (Tasks 6 to 8); SIMS page, tabs, badge, scope on the server (Tasks 3, 9, 10); account deletion (Task 2); guide and rollout (Task 11). Bulk approve, approver edits, push to approvers, Excel upload from the Parent App and permanent deletion are out of scope, as in the spec.
- **Names used across tasks:** `learner_change_requests`; the seven callables and their `Fn` exports; `REMOVAL_REASONS` codes `transferred_out`, `dropped_out`, `moved_section`; `decidable` and `existing.needsAdmin` on reviewer rows; `ClassActions({ onAddLearner, onSf2, sf2Hint, requestTotal, requestWaiting, onOpenRequests })`; `useLearnerRequests` (Parent) versus `useLearnerRequestLists`/`useLearnerRequestCount` (SIMS).
