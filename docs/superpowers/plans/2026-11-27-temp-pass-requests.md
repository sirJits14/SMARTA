# Adviser Temporary Pass Requests and Logistic Operator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Advisers request temporary ID passes from the Parent App; administrators, Grade Level Coordinators and a new Logistic Operator print them four to an A4 sheet, with or without a photo.

**Architecture:** One shared rules module decides who may request, print and upload. Requests live in a callable-only `temp_pass_requests` collection, following the existing adviser learner-request pattern. SIMS gets a Requests tab that shares one prepare-and-print hook with the existing section tab; the pass card is redrawn for 85 × 134.8 mm.

**Tech Stack:** React 19, Vite, Firebase (Firestore, Functions v2), Vitest, `qrcode`.

Spec: `docs/superpowers/specs/2026-11-27-temp-pass-requests-design.md` (read first). Earlier feature this builds on: `docs/superpowers/specs/2026-11-27-temp-student-id-pass-design.md` and its plan. Core logic is given as code; screens are given as contracts (props, behaviour, exact copy, required test assertions) so they follow neighbouring files.

## Global Constraints

- Pass printers and SIMS photo uploaders: `admin` (all grades), `glc` (own grade), `logistic` (all grades). `jhs_coord` and `shs_coord`: none. Advisers keep Parent App photo upload.
- `scopedGrades({ role: 'logistic' })` returns `[]`. Only `passGrades()` and the pass-related reads use all-grade scope for `logistic`.
- Logistic Operator SIMS pages: exactly `['idcards', 'students']`, in that order; Students shows only the Photo action.
- Request reasons: `new`, `lost`, `damaged`. Statuses: `pending`, `printed`, `declined`, `withdrawn`. At most `40` pending requests per adviser; note at most `500` characters; decline reason `1`–`300` characters.
- Card: 85 × 134.8 mm, viewBox `0 0 591 937` unchanged, four per A4 sheet (2 × 2, 4 mm gap, `@page` A4 margin 8 mm). Photo area exactly 1 inch = `177` viewBox units, at `x=209 y=190`.
- No photo: dashed square at the photo area, label `Attach 1×1 photo`.
- Copy (exact): adviser notice title `Temporary pass ready`, body `Temporary pass for {name} is ready for pick-up at {place}.` (no place: `Temporary pass for {name} is ready for pick-up.`); declined title `Temporary pass request declined`, body `{name}: {reason}`.
- `temp_pass_requests` is closed to all clients in Firestore rules.
- Production rules and SIMS are NOT `master`: rules base is `docs/audits/deployments/2026-11-27-temp-id-pass/firestore.rules`; SIMS base is the release tree recorded there. Never deploy, push or edit `firebase.*-release.json`.
- No new dependencies; never `npm install` (worktree `node_modules` are junctions). Parent initial load stays under 260 KB.
- Parent App copy goes in `parent/src/strings.js` and must not contain "location", "tracking" or "live". Theme choice stays only in Settings > Appearance; the Sessions button stays icon-only.
- React components are not shared between apps; `shared/` holds plain JavaScript only.

## Test commands

| What | Command (worktree root, Git Bash) |
|---|---|
| SIMS + shared unit | `npx vitest run [files]` |
| Functions unit | `node scripts/syncShared.mjs && (cd functions && npx vitest run src)` |
| Functions emulator, chosen files | `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/<a>.test.js --no-file-parallelism"` |
| Rules (master file) | `npm run test:rules` |
| Rules (live-based file) | `SIMS_RULES_PATH=<file> npx firebase emulators:exec --only firestore "vitest run -c vitest.rules.config.js tests/rules/tempPasses.test.js tests/rules/tempPassRequests.test.js"` |
| Parent | `(cd parent && npx vitest run)` |
| Builds | SIMS: dummy `VITE_FIREBASE_*` env and `npx vite build --outDir <scratch>`; Parent: `(cd parent && npx vite build && node scripts/checkSize.mjs)` |

Run `git -c gc.auto=0 -c maintenance.auto=false commit …` for commits: OneDrive locks old worktree folders and Git's auto-cleanup otherwise prompts forever.

---

### Task 1: Roles and shared request rules

**Files:**
- Modify: `shared/staffRoles.js`, `shared/staffRoles.test.js`, `shared/tempPass.js`, `shared/tempPass.test.js`
- Create: `shared/tempPassRequests.js`, `shared/tempPassRequests.test.js`

**Interfaces — Produces:**
- `ROLE_VALUES` includes `'logistic'`; `ROLE_LABELS.logistic === 'Logistic Operator'`; `scopedGrades({role:'logistic'})` → `[]`.
- `passGrades(profile)`: admin → `null`; glc → `scopedGrades(profile)`; logistic → `null`; else `[]`. `canManagePasses` unchanged in shape.
- `tempPassBlocker` no longer returns `'no-photo'`.
- From `shared/tempPassRequests.js`: `PASS_REQUEST_REASONS`, `REPLACE_REASONS`, `PASS_REQUEST_STATUSES`, `MAX_PENDING_PASS_REQUESTS`, `PASS_NOTE_MAX`, `DECLINE_REASON_MAX`, `isActivePassFor(pass, student, schoolYear)`, `passRequestBlocker({...})`, `reasonError(reason, hasActivePass)`, `cleanPassText(value, max)`, `readyNotice({name, place})`, `declinedNotice({name, reason})`, `canPrintGrade(profile, grade)`.

- [ ] **Step 1: Write failing tests.** In `shared/tempPass.test.js`, replace the pass-staff test and the `no-photo` expectation:

```js
describe('pass staff', () => {
  it('covers administrators, grade level coordinators for their grade, and logistic operators', () => {
    expect(passGrades({ role: 'admin' })).toBeNull();
    expect(passGrades({ role: 'registrar' })).toBeNull();
    expect(passGrades({ role: 'logistic' })).toBeNull();
    expect(passGrades({ role: 'glc', gradeLevel: 8 })).toEqual([8]);
    expect(passGrades({ role: 'jhs_coord' })).toEqual([]);
    expect(passGrades({ role: 'shs_coord' })).toEqual([]);
    expect(passGrades(null)).toEqual([]);
    expect(canManagePasses({ role: 'jhs_coord' })).toBe(false);
    expect(canManagePasses({ role: 'glc', gradeLevel: 11 })).toBe(true);
    expect(canManagePasses({ role: 'logistic' })).toBe(true);
  });
});
```

and in the eligibility block replace `expect(blocker({ student: { ...base().student, photo: undefined } })).toBe('no-photo');` with `expect(blocker({ student: { ...base().student, photo: undefined } })).toBeNull();`.

In `shared/staffRoles.test.js` add:

```js
it('knows the Logistic Operator, who covers no grades for general staff access', () => {
  expect(ROLE_VALUES).toContain('logistic');
  expect(roleOf({ role: 'logistic' })).toBe('logistic');
  expect(ROLE_LABELS.logistic).toBe('Logistic Operator');
  expect(roleLabel({ role: 'logistic' })).toBe('Logistic Operator');
  expect(scopedGrades({ role: 'logistic' })).toEqual([]);
});
```

Create `shared/tempPassRequests.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { passRequestBlocker, reasonError, isActivePassFor, cleanPassText, readyNotice, declinedNotice, canPrintGrade,
  MAX_PENDING_PASS_REQUESTS, PASS_NOTE_MAX } from './tempPassRequests.js';

const year = '2026-2027';
const student = { lrn: '100000000001', status: 'active' };
const enrollment = { status: 'enrolled', sectionId: 'SEC1', schoolYear: year };
const blocker = (over = {}) => passRequestBlocker({ student, enrollment, sectionId: 'SEC1', schoolYear: year, pendingRequest: false, ...over });

describe('who can be requested', () => {
  it('allows an enrolled learner of the class with or without a photo', () => {
    expect(blocker()).toBeNull();
    expect(blocker({ student: { ...student, photo: { path: 'p' } } })).toBeNull();
  });
  it('names what blocks a request', () => {
    expect(blocker({ student: undefined })).toBe('not-in-class');
    expect(blocker({ enrollment: { ...enrollment, sectionId: 'OTHER' } })).toBe('not-in-class');
    expect(blocker({ enrollment: { ...enrollment, status: 'dropped' } })).toBe('not-in-class');
    expect(blocker({ enrollment: { ...enrollment, schoolYear: '2025-2026' } })).toBe('not-in-class');
    expect(blocker({ student: { ...student, status: 'transferred' } })).toBe('inactive');
    expect(blocker({ student: { ...student, lrn: ' ' } })).toBe('no-lrn');
    expect(blocker({ student: { ...student, idCard: { printedAt: 1, lrn: student.lrn } } })).toBe('official-printed');
    expect(blocker({ pendingRequest: true })).toBe('already-requested');
  });
});

describe('reasons', () => {
  it('needs Lost or Damaged only when a pass is active', () => {
    expect(reasonError('new', false)).toBe('');
    expect(reasonError('lost', true)).toBe('');
    expect(reasonError('damaged', true)).toBe('');
    expect(reasonError('new', true)).toMatch(/Lost or Damaged/);
    expect(reasonError('lost', false)).toMatch(/no temporary pass/);
    expect(reasonError('stolen', false)).toMatch(/reason/);
  });
  it('treats only this year’s active pass for the current LRN as active', () => {
    const pass = { status: 'active', lrn: student.lrn, schoolYear: year };
    expect(isActivePassFor(pass, student, year)).toBe(true);
    expect(isActivePassFor({ ...pass, status: 'revoked' }, student, year)).toBe(false);
    expect(isActivePassFor({ ...pass, lrn: '2' }, student, year)).toBe(false);
    expect(isActivePassFor({ ...pass, schoolYear: '2025-2026' }, student, year)).toBe(false);
    expect(isActivePassFor(undefined, student, year)).toBe(false);
  });
});

describe('text and notices', () => {
  it('cleans and limits free text', () => {
    expect(cleanPassText('  a\u0000b  ', 10)).toBe('a b');
    expect(cleanPassText('x'.repeat(PASS_NOTE_MAX + 5), PASS_NOTE_MAX)).toHaveLength(PASS_NOTE_MAX);
    expect(cleanPassText(null, 10)).toBe('');
  });
  it('words the notices', () => {
    expect(readyNotice({ name: 'Ana Cruz', place: 'Logistics Office' }))
      .toEqual({ title: 'Temporary pass ready', body: 'Temporary pass for Ana Cruz is ready for pick-up at Logistics Office.' });
    expect(readyNotice({ name: 'Ana Cruz', place: ' ' }).body).toBe('Temporary pass for Ana Cruz is ready for pick-up.');
    expect(declinedNotice({ name: 'Ana Cruz', reason: 'Has an official ID' }))
      .toEqual({ title: 'Temporary pass request declined', body: 'Ana Cruz: Has an official ID' });
  });
  it('decides grade scope for printers', () => {
    expect(canPrintGrade({ role: 'logistic' }, 12)).toBe(true);
    expect(canPrintGrade({ role: 'glc', gradeLevel: 8 }, 8)).toBe(true);
    expect(canPrintGrade({ role: 'glc', gradeLevel: 8 }, 9)).toBe(false);
    expect(canPrintGrade({ role: 'jhs_coord' }, 8)).toBe(false);
    expect(MAX_PENDING_PASS_REQUESTS).toBe(40);
  });
});
```

- [ ] **Step 2:** `npx vitest run shared/` — expect the new and changed tests to fail.
- [ ] **Step 3: Implement.** `shared/staffRoles.js`: add `'logistic'` to `ROLE_VALUES` and `logistic: 'Logistic Operator'` to `ROLE_LABELS`; `scopedGrades` needs no change (it already returns `[]` for unknown fixed roles — confirm by test). Update the header comment: "`logistic` prints passes and uploads photos for every grade through `passGrades()` in `tempPass.js`; it has no general grade scope."

`shared/tempPass.js`:

```js
// null = every grade; [] = no pass or photo management (spec 2026-11-27 requests).
export function passGrades(profile) {
  const role = roleOf(profile);
  if (role === 'admin' || role === 'logistic') return null;
  return role === 'glc' ? scopedGrades(profile) : [];
}
```

and delete the line `if (!student.photo?.path) return 'no-photo';` from `tempPassBlocker`.

`shared/tempPassRequests.js`:

```js
// Adviser requests for temporary ID passes (spec 2026-11-27 requests). Functions, SIMS and the
// Parent App import this file so they agree on who can be requested and how notices read.
import { isOfficialCardPrinted, passGrades } from './tempPass.js';

export const PASS_REQUEST_REASONS = ['new', 'lost', 'damaged'];
export const REPLACE_REASONS = ['lost', 'damaged'];
export const PASS_REQUEST_STATUSES = ['pending', 'printed', 'declined', 'withdrawn'];
export const MAX_PENDING_PASS_REQUESTS = 40;
export const PASS_NOTE_MAX = 500;
export const DECLINE_REASON_MAX = 300;

export const isActivePassFor = (pass, student, schoolYear) =>
  pass?.status === 'active' && pass.schoolYear === schoolYear && pass.lrn === student?.lrn;

export function passRequestBlocker({ student, enrollment, sectionId, schoolYear, pendingRequest }) {
  if (!student || !enrollment || enrollment.status !== 'enrolled' || enrollment.sectionId !== sectionId
      || enrollment.schoolYear !== schoolYear) return 'not-in-class';
  if ((student.status ?? 'active') !== 'active') return 'inactive';
  if (!String(student.lrn ?? '').trim()) return 'no-lrn';
  if (isOfficialCardPrinted(student)) return 'official-printed';
  if (pendingRequest) return 'already-requested';
  return null;
}

export function reasonError(reason, hasActivePass) {
  if (!PASS_REQUEST_REASONS.includes(reason)) return 'Choose a reason for this request.';
  if (hasActivePass && reason === 'new') return 'This learner already has a temporary pass. Choose Lost or Damaged.';
  if (!hasActivePass && reason !== 'new') return 'This learner has no temporary pass to replace.';
  return '';
}

export const cleanPassText = (value, max) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/[\u0080-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, '')
  .replace(/\s+/g, ' ').trim().slice(0, max);

export function readyNotice({ name, place }) {
  const where = String(place ?? '').trim();
  return { title: 'Temporary pass ready',
    body: where ? `Temporary pass for ${name} is ready for pick-up at ${where}.` : `Temporary pass for ${name} is ready for pick-up.` };
}
export const declinedNotice = ({ name, reason }) => ({ title: 'Temporary pass request declined', body: `${name}: ${reason}` });

export function canPrintGrade(profile, grade) {
  const grades = passGrades(profile);
  return grades === null || grades.includes(Number(grade));
}
```

- [ ] **Step 4:** `npx vitest run` (whole SIMS + shared suite). Shared tests must pass. SIMS tests that encode the old permissions or the no-photo row (`src/lib/access.test.js`, `src/pages/idCards/TempPassesTab.test.js`, `src/components/StudentPhotoDialog.test.js`, `src/lib/tempPass.test.js`) may now fail: do not change them here; list each failing test in your report. Tasks 5 and 6 update them.
- [ ] **Step 5:** Commit `feat(shared): logistic operator role and pass request rules`.

---

### Task 2: Functions — printers, photos and issuing without a photo

**Files:**
- Modify: `functions/src/handlers/tempPasses.js`, `functions/test/emulator/tempPasses.test.js`, `functions/test/emulator/studentPhotos.test.js`, `functions/src/handlers/users.test.js` (or the emulator users test that covers `roleAndGrade`)

**Interfaces — Consumes:** Task 1 `passGrades`, `tempPassBlocker`. **Produces:**
- `export async function issueInTransaction(db, tx, { studentId, schoolYear, grades, email, newCode = false })` → `{ code, replaced: boolean } | { skip: reason }`. Performs all its reads before any write; the caller may write after it but must not read.
- `issueTempPasses` unchanged in shape; permission message becomes `'Temporary passes are for administrators, grade level coordinators and logistic operators.'`.

- [ ] **Step 1: Failing tests.** In `tempPasses.test.js` change the staff fixtures: add `glc7 = { uid:'glc7', email:'glc7@x.test', profile:{ uid:'glc7', role:'glc', gradeLevel:7 } }`, `logistic = { uid:'log', email:'log@x.test', profile:{ uid:'log', role:'logistic' } }`. Required cases:
  1. JHS coordinator gets `permission-denied`; GLC 7 issues for S1 (grade 7) and gets `out-of-scope` for a grade 11 learner; Logistic issues for both.
  2. A learner without a photo is issued (no `no-photo` skip).
  3. `issueInTransaction` with `newCode: true` on an active pass returns a different code, `replaced: true`, writes audit action `tempPass.replaced` with `details.previousCode` absent (never store old codes in the audit), and the old code no longer equals `temp_passes/S1.code`.
  4. Same call with `newCode: false` returns the existing code, `replaced: false`.
  In `studentPhotos.test.js`: JHS coordinator save is now `permission-denied`; GLC (grade 7) can save S1 and is denied S11; a Logistic Operator can save both and read both.
  In the users test: `roleAndGrade('logistic', null)` → `{ role: 'logistic', gradeLevel: null }`; `roleAndGrade('logistic', 8)` throws `invalid-argument`.
- [ ] **Step 2:** Run the three emulator files and the functions unit tests — expect failures.
- [ ] **Step 3: Implement.** Replace the transaction body inside `issueTempPasses` with a call to the new helper:

```js
export async function issueInTransaction(db, tx, { studentId, schoolYear, grades, email, newCode = false }) {
  const passRef = db.doc(`temp_passes/${studentId}`);
  const [student, enrollment, pass] = await Promise.all([
    tx.get(db.doc(`students/${studentId}`)), tx.get(db.doc(`enrollments/${studentId}_${schoolYear}`)), tx.get(passRef),
  ]);
  const sectionId = enrollment.data()?.sectionId;
  const section = identifier(sectionId) ? (await tx.get(db.doc(`sections/${sectionId}`))).data() : undefined;
  const blocker = tempPassBlocker({ student: student.data(), enrollment: enrollment.data(), section, schoolYear });
  // Scope is checked before the learner's own details are described.
  if (grades !== null && section && !grades.includes(section.gradeLevel)) return { skip: 'out-of-scope' };
  if (blocker) return { skip: blocker };
  // An incomplete section record skips its learner instead of failing the whole batch.
  if (!validGrade(section.gradeLevel)) return { skip: 'not-enrolled' };
  // Reads end here.
  const placement = { sectionId, gradeLevel: section.gradeLevel };
  const current = pass.data();
  const lrn = student.data().lrn;
  const live = current?.status === 'active' && current.lrn === lrn && current.schoolYear === schoolYear;
  if (live && !newCode) {
    if (current.sectionId !== sectionId || current.gradeLevel !== section.gradeLevel) tx.update(passRef, placement);
    return { code: current.code, replaced: false };
  }
  const code = makePassCode(randomInt);
  tx.set(passRef, { code, status: 'active', lrn, ...placement, schoolYear, issuedBy: email, issuedAt: FieldValue.serverTimestamp() });
  tx.set(db.collection('audit_log').doc(), audit(email, live ? 'tempPass.replaced' : 'tempPass.issued', studentId, placement));
  return { code, replaced: live };
}
```

and in `issueTempPasses`: `const result = await db.runTransaction(tx => issueInTransaction(db, tx, { studentId, schoolYear, grades, email }));`. `studentPhotos.js` needs no code change (it uses `passGrades`); update only its comment if it names Academic Coordinators. `users.js` needs no code change (`roleAndGrade` uses `ROLE_VALUES`).
- [ ] **Step 4:** Run `tempPasses`, `studentPhotos`, `users` emulator tests and the functions unit tests — all pass.
- [ ] **Step 5:** Commit `feat(functions): pass printing for grade level coordinators and logistic operators`.

---

### Task 3: Functions — request callables

**Files:**
- Create: `functions/src/handlers/tempPassRequests.js`, `functions/test/emulator/tempPassRequests.test.js`
- Modify: `functions/index.js`, `functions/src/callable.js` (LIMITS)

**Interfaces — Consumes:** Task 1 module; Task 2 `issueInTransaction`; `loadSchoolActor`, `inboxRef` from `./schoolAccess.js`; `currentYear` from `./advisorySlips.js`; `isSectionAdviser` from `../../shared/learnerRequests.js`; `fullName` from `../lib/format.js`.
**Produces (callable data, all JSON):**
- `requestTempPasses(deps, { sectionId, items: [{ studentId, reason }], note })` → `{ created: [{ requestId, studentId }], skipped: [{ studentId, reason }] }` (school call, class adviser only)
- `withdrawTempPassRequest(deps, { requestId })` → `{ ok: true }`
- `getTempPassRequests(deps, { sectionId })` → `{ learners: [{ studentId, displayName, hasPhoto, hasActivePass, blocker }], requests: [{ id, studentId, displayName, reason, note, status, declineReason, createdAt, decidedAt }] }`
- `listTempPassRequests(deps, { status = 'pending' })` → `{ requests: [{ id, studentId, displayName, lrn, sectionId, sectionName, gradeLevel, reason, note, requestedByName, createdAt, status, hasPhoto, blocker }] }` (staff call, printers only, scoped by `passGrades`)
- `fulfilTempPassRequests(deps, { requestIds })` → `{ issued: [{ requestId, studentId, code }], skipped: [{ requestId, studentId, reason }] }`
- `markTempPassRequestsPrinted(deps, { requestIds })` → `{ printed: number }`
- `declineTempPassRequest(deps, { requestId, reason })` → `{ ok: true }`
- Exports in `functions/index.js`: `requestTempPassesFn`, `withdrawTempPassRequestFn`, `getTempPassRequestsFn` (schoolCall); `listTempPassRequestsFn`, `fulfilTempPassRequestsFn` (staffCall, `timeoutSeconds: 120`), `markTempPassRequestsPrintedFn`, `declineTempPassRequestFn` (staffCall).

Behaviour (each line needs a test):
1. `requestTempPasses`: actor from `loadSchoolActor`; `failed-precondition` if the year ended; `permission-denied` unless `isSectionAdviser(actor, sectionId)`; 1–40 distinct items, valid ids and reasons else `invalid-argument`; note via `cleanPassText(note, PASS_NOTE_MAX)`; rate limit `LIMITS.tempPassRequest` (`{ windowMs: 3600000, max: 60 }`); one transaction per item reading student, enrollment, pass, and the learner's pending request (`where('studentId','==',id).where('status','==','pending').limit(1)`), plus a count of the adviser's pending requests (fail the whole call with `resource-exhausted` and message `You already have 40 requests waiting. Wait for some to be printed.` when it would exceed 40). Skips with `passRequestBlocker` or `reasonError` (as `reason: 'reason'`). Writes `{ studentId, sectionId, sectionName, gradeLevel, schoolYear, reason, note, status: 'pending', displayName: fullName(student), requestedByUid, requestedByName: actor.displayName, requestedByEmail: actor.email, createdAt }` and an audit row (`targetType: 'temp_pass_request'`, action `tempPassRequest.created`, details `{ studentId, sectionId, gradeLevel, reason }` — never the note).
2. `withdrawTempPassRequest`: own pending request only (else `not-found` / `failed-precondition`), sets `withdrawn`, `decidedAt`, audit.
3. `getTempPassRequests`: adviser of the section; `learners` from the section's enrolled learners this year with `hasPhoto: !!student.photo?.path`, `hasActivePass` via `isActivePassFor`, and `blocker` from `passRequestBlocker`; `requests` = the caller's requests for the section, newest first, at most 50; timestamps as milliseconds.
4. Printer callables: `canManagePasses(profile)` else `permission-denied`; every request outside `canPrintGrade(profile, request.gradeLevel)` is treated as not found (list omits it; others skip `out-of-scope` or fail `not-found` for single-item calls).
5. `listTempPassRequests`: `status` in `pending|printed|declined` (default `pending`); current school year only; ordered by `createdAt`; at most 200; for `logistic`/admin all grades, for `glc` `where('gradeLevel','==',grade)`. Adds `lrn` and `hasPhoto` read from `students/{id}` in batches with `db.getAll`.
6. `fulfilTempPassRequests`: 1–200 ids; per request one transaction: read request (must be `pending`, this year, in scope), then `issueInTransaction(db, tx, { studentId, schoolYear, grades, email, newCode })`, where `newCode` is true only for a `lost` request that has not already produced the current code: read `temp_passes/{studentId}` first and use `request.reason === 'lost' && !(request.passCode && request.passCode === currentPass?.code)`, so preparing again after a paper jam does not kill the sheet just printed (test: fulfilling a Lost request twice returns the same replacement code); on skip, return the skip and leave the request pending; on success write `passCode` onto the request (status stays `pending`). Rate limit `LIMITS.tempPass`.
7. `markTempPassRequestsPrinted`: 1–200 ids; per request transaction: pending, in scope, and `passCode` equals the learner's current active `temp_passes` code (else skip, request stays pending); sets `printed`, `decidedBy`, `decidedAt`; inbox item `inboxRef(db, requestedByUid, 'tempPass:' + requestId)` with `{ type: 'temp_pass_request', requestId, status: 'printed', ...readyNotice({ name: displayName, place: settings/app.passPickupPlace }), createdAt }`; audit `tempPassRequest.printed`.
8. `declineTempPassRequest`: reason via `cleanPassText(reason, DECLINE_REASON_MAX)`, must be non-empty; pending and in scope; sets `declined`, `declineReason`, `decidedBy`, `decidedAt`; inbox with `declinedNotice`; audit `tempPassRequest.declined` without the reason text.
9. No trigger closes requests. When a request can no longer be met (official card printed, learner inactive or out of the class), `listTempPassRequests` returns it with `blocker` set from `passRequestBlocker` (computed with `pendingRequest: false`), and the SIMS Requests tab shows it as "Decline suggested" (Task 6).

- [ ] **Step 1:** Write `tempPassRequests.test.js` with one `it` per numbered behaviour above, using `seedSchool`, a `school_accounts/adv` adviser of `SEC1`, staff fixtures (admin, glc7, glc8, logistic, jhs), and `fakeMessaging` is not needed. Include: a Lost request yields a new code and the old one stops matching `temp_passes/S1.code`; Damaged keeps the code; mark-printed refuses a request whose pass changed after fulfilment; the inbox item uses `passPickupPlace` from `settings/app`; a declined request notifies with the reason; an adviser of another section is denied; the 41st pending request fails.
- [ ] **Step 2:** Run it — expect failure (module missing).
- [ ] **Step 3:** Implement the handler file following `functions/src/handlers/learnerRequests.js` conventions (`fail`, `identifier`, `auditRow` with `targetType: 'temp_pass_request'`, `clock(deps)`, all transaction reads before writes), add LIMITS `tempPassRequest: { windowMs: 60 * 60 * 1000, max: 60 }`, and wire the exports.
- [ ] **Step 4:** Run `tempPassRequests`, `tempPasses`, `learnerRequests` emulator tests and the functions unit tests — all pass.
- [ ] **Step 5:** Commit `feat(functions): adviser temporary pass requests`.

---

### Task 4: Firestore rules (master and live-based)

**Files:**
- Modify: `firestore.rules`, `tests/rules/tempPasses.test.js`, `tests/rules/helpers.js` (add `LOGISTIC` identity `{ uid: 'log1', token: { email: 'logistic@bnhs.edu', email_verified: false, firebase: { sign_in_provider: 'password' } } }` and seed `staff_profiles/log1`)
- Create: `tests/rules/tempPassRequests.test.js`, `docs/releases/2026-11-27-temp-pass-requests/build-rules.mjs`

**Interfaces — Produces:** rule functions `isLogistic()` and the new `coordinatorMayReadPass()`; the script writes `docs/releases/2026-11-27-temp-pass-requests/firestore.rules` from the live record.

Master `firestore.rules` changes:

```
    function isLogistic() { return isStaff() && role() == 'logistic'; }
    // Mirrors passGrades() in shared/tempPass.js.
    function coordinatorMayReadPass() {
      return isStaff() && role() == 'glc' && coordinatorCoversGrade(resource.data.get('gradeLevel', null));
    }
```

- `students`: `allow read: if isAdmin() || isKiosk() || isLogistic() || coordinatorMayReadStudent();`
- `enrollments` and `sections` read: add `|| isLogistic()`.
- `temp_passes` read: `isAdmin() || isLogistic() || coordinatorMayReadPass() || (isKiosk() && resource.data.status == 'active')`.
- A Logistic Operator reads nothing beyond that, `students`, `enrollments`, `sections` and `settings/app`: `announcements` get/list becomes `isStaff() && role() != 'logistic'`.
- Add `match /temp_pass_requests/{id} { allow read, write: if false; }` beside `learner_change_requests`.

Live-based rules (`build-rules.mjs`, modelled on `.superpowers/releases/temp-pass/rules/build-rules.mjs` in the record folder): read `docs/audits/deployments/2026-11-27-temp-id-pass/firestore.rules`; insert `isLogistic()` after `isAdmin()`; change `coordinatorMayReadPass` to `role() == 'glc' && coversGrade(...)`; add `|| isLogistic()` to the `temp_passes` read; add the `temp_pass_requests` match. Students, enrollments, sections and `settings/app` there already allow `isStaff()`, so leave them. There `schedules`, `student_attendance` and `announcements` reads also allow any staff: change each `isStaff()` in those three read rules to `(isStaff() && role() != 'logistic')`, keeping `isKiosk()` branches as they are, so a Logistic Operator cannot read attendance, schedules or announcements. Each insertion must find its anchor exactly once or throw.

- [ ] **Step 1: Failing tests.** `tests/rules/tempPasses.test.js`: JHS and SHS coordinators are now denied `temp_passes` reads; GLC 8 reads `where('gradeLevel','in',[8])` and is denied grade 7; Logistic lists all `temp_passes`, reads students/enrollments/sections/`settings/app`, and is denied `student_attendance`, `schedules`, `announcements`, `guardian_links`, `users` list and any write to `students`. Kiosk reads of `schedules` and `student_attendance`, and other staff reads of `announcements`, still succeed. `tempPassRequests.test.js`: every identity (admin, logistic, glc, adviser-guardian, kiosk) is denied read and write of `temp_pass_requests`. Keep the existing `refused()` helper that rejects rules-limit errors.
- [ ] **Step 2:** `npm run test:rules` — new cases fail.
- [ ] **Step 3:** Edit `firestore.rules`; write and run `node docs/releases/2026-11-27-temp-pass-requests/build-rules.mjs`.
- [ ] **Step 4:** `npm run test:rules` passes. Run the live-based command from the Test commands table on the generated file for the two pass test files; record its result. Every Logistic case must pass on both files.
- [ ] **Step 5:** Commit `feat(rules): logistic operator and pass request rules`.

---

### Task 5: SIMS access, accounts, settings and photos

**Files:**
- Modify: `src/lib/access.js`, `src/lib/access.test.js`, `src/App.jsx`, `src/lib/staffQueries.js`, `src/lib/staffQueries.test.js`, `src/pages/AccountsPage.jsx` (only if a test shows the role list or labels need code), `src/pages/SettingsPage.jsx`, `src/pages/SettingsPage.test.js`, `src/data/settings.js`, `src/data/settings.test.js`, `src/pages/StudentsPage.jsx`, `src/components/StudentPhotoDialog.test.js`

**Interfaces — Produces:**
- `allowedPages(me)`: admin → all `NAV_ITEMS`; `logistic` → `['idcards', 'students']`; `glc` → `['dashboard','students','learnerRequests','sections','schedules','attendance','idcards','announcements']`; `jhs_coord`/`shs_coord` → `COORDINATOR_PAGES` (no `idcards`).
- `homePage(me)` → first of `allowedPages(me)` (`'dashboard'` when allowed).
- `staffCollectionQuery(path, { me, schoolYear })` for `logistic`: `sections`, `enrollments`, `temp_passes` → whole collection query; `students` → `where('scopeSchoolYear','==',schoolYear)`; every other path → `null`.
- `updateSettings` shape adds `passPickupPlace` (trimmed, max 120 characters).

Behaviour:
1. `App.jsx`: initial page and the fallback become `homePage(me)` instead of `'dashboard'` (`const shown = canOpen(me, page) ? page : homePage(me);`).
2. Students page for `logistic`: heading "Students", list and filters as for admins (its roster scope and grade options are all grades: pass `null` to `scopeRoster` and use `ALL_GRADES`, because `grades(me)` is `[]` for this role; without that the list is empty), only the Photo action per row; no Import, Add, Edit or Delete. Academic Coordinators no longer see Photo (follows `canManagePhotos`).
3. Settings: field "Pass pick-up place" (placeholder `Logistics Office, Admin Building`), hint `Shown to advisers when their requested passes are ready.`
4. Accounts: the role select lists "Logistic Operator"; no grade field for it; the list labels it.

- [ ] **Step 1:** Tests: `access.test.js` — the exact page lists above, `homePage({role:'logistic'}) === 'idcards'`, `canManagePhotos` true for admin/glc/logistic and false for jhs/shs; `staffQueries.test.js` — the logistic queries and `null` for `student_attendance`, `schedules`, `announcements`; settings shape; Settings page renders the new field; StudentsPage static render: logistic row has `>Photo<` and not `>Edit<`, jhs has neither; AccountsPage static render lists `Logistic Operator`.
- [ ] **Step 2:** Run — fail. **Step 3:** Implement. **Step 4:** `npx vitest run` and the SIMS build pass.
- [ ] **Step 5:** Commit `feat(sims): logistic operator access and pass pick-up place`.

---

### Task 6: SIMS — card redesign, shared print flow and Requests tab

**Files:**
- Modify: `src/components/TempPassPrintable.jsx`, `src/components/TempPassPrintable.test.js`, `src/pages/tempPassPrintLayout.js`, `src/lib/tempPass.js`, `src/lib/tempPass.test.js`, `src/pages/idCards/TempPassesTab.jsx`, `src/pages/idCards/TempPassesTab.test.js`, `src/pages/IDCardsPage.jsx`, `src/data/tempPasses.js`, `src/data/tempPasses.test.js`
- Create: `src/pages/idCards/usePassPrinting.js`, `src/pages/idCards/usePassPrinting.test.js`, `src/pages/idCards/PassRequestsTab.jsx`, `src/pages/idCards/PassRequestsTab.test.js`

**Interfaces — Consumes:** Task 3 callables; Task 5 access. **Produces:**
- `src/data/tempPasses.js` adds `listTempPassRequests(status)`, `fulfilTempPassRequests(requestIds)` (timeout 125000), `markTempPassRequestsPrinted(requestIds)`, `declineTempPassRequest(requestId, reason)`.
- `PASSES_PER_SHEET = 4`; `passRowStatus` without the `no-photo` row; ready rows without a photo get label `Ready · no photo` (tone `info`, printable).
- `usePassPrinting({ principalName, principalTitle, passesById, selectionKey })` → `{ preview, prepare(targets), printReady, waiting, confirmTimedOut, notice, preparing, action, markPrinted() }` where `targets = [{ studentId, requestId?, student, section }]`. `prepare` issues through `fulfilTempPassRequests` for targets with `requestId` and `issueTempPasses` for the rest, then builds cards exactly as today's `preparePasses` except: a learner whose record has no `photo.path` gets `photoSrc: null` (no fetch); a learner with a photo that fails to load is still skipped `photo-unavailable`. `markPrinted()` calls `markTempPassRequestsPrinted` with the prepared items' request ids and is offered only when at least one prepared item has one.
- `TempPassCard` accepts `photoSrc: null` and then draws the frame.

Card coordinates (viewBox 591 × 937 unchanged; 1 unit = 85/591 mm):
- Header, logo, school name and vertical `BNHS ID PASS`: unchanged.
- Photo: `x=209 y=190 width=177 height=177`. No photo: `<rect x="209" y="190" width="177" height="177" fill="#FFFFFF" stroke="#555555" strokeWidth="2" strokeDasharray="8 6"/>` and centred text `Attach 1×1 photo` at `x=297.5 y=284` font 16.
- Name `y=430` font 46 max width 551; section line `y=474` font 25 letter-spacing 5 max 540; `LRN: …` `y=522` font 32.
- Caption `STUDENT'S TEMPORARY QR CODE:` at `x=18 y=598` font 14; white rect and QR `x=19 y=610 size 250`.
- Principal name centred `x=430 y=680` font 30 max 280; title `x=430 y=704` font 14 max 280.
- Note: four lines from `x=284`, first baseline `y=790`, step 20, font 16, `maxWidth 290`.
Render with a long name (`MACARAEG-VILLANUEVA, MARIA CRISTINA JOY D.`) and a long SHS section line, with and without a photo; adjust only if text overlaps or clips, and report every change.

Print layout: `grid-template-columns: repeat(2, 85mm); grid-auto-rows: 134.8mm; gap: 4mm`, card `width: 85mm; height: 134.8mm`, everything else as today.

Requests tab (`PassRequestsTab`):
- Tabs in ID Cards: admins `By section`, `Saved batch`, `Recently approved` (release tree only), `Requests`, `Temporary passes`; glc and logistic `Requests`, `Temporary passes`. Tab label `Requests · {n}` when n pending > 0.
- Filter buttons `Waiting`, `Printed`, `Declined`. Waiting rows: checkbox, Name, LRN, Section, Reason (`New pass` / `Lost` / `Damaged`), Requested by, Note, Photo (`Yes` / `No photo`), actions `Decline`. Rows whose `blocker` is set show badge `Decline suggested` and the blocker text, and cannot be ticked.
- Decline opens a dialog titled `Decline request?` with a required reason field (`Reason`, max 300) and buttons `Decline` / `Cancel`.
- `Prepare passes (n)`, `Print`, then `Mark as printed (n)`; after marking, a status line `{n} advisers notified.`
- The section tab shows a `Requested` badge for learners with a pending request and routes them through their request (`requestId`) when prepared.

- [ ] **Step 1:** Tests: card with `photoSrc: null` contains `stroke-dasharray="8 6"` and `Attach 1×1 photo`, and no `<image` at y=190; `chunkSheets` makes 4 per sheet; `passRowStatus` for a learner without a photo is printable with `Ready · no photo`; the print styles contain `repeat(2, 85mm)` and `134.8mm`; `usePassPrinting` target splitting (pure helper `splitTargets(targets)` → `{ requestIds, studentIds }`) and that a no-photo learner never calls `getStudentPhoto`; Requests tab static render for logistic and glc lists only `Requests` and `Temporary passes` tabs and the reason labels; data functions call the right callable names and timeout.
- [ ] **Step 2:** Run — fail. **Step 3:** Implement; move `preparePasses` and the preview/confirm logic out of `TempPassesTab.jsx` into `usePassPrinting.js` so both tabs use one copy. **Step 4:** `npx vitest run` and the SIMS build pass; render the card in a temporary browser harness (removed before commit) and save `.superpowers/sdd/requests-card.png` with and without a photo.
- [ ] **Step 5:** Commit `feat(sims): pass requests tab and four-per-sheet passes`.

---

### Task 7: Parent App — request passes

**Files:**
- Create: `parent/src/screens/school/PassRequestSheet.jsx`, `parent/src/screens/school/PassRequestSheet.test.js`, `parent/src/hooks/usePassRequests.js`, `parent/src/lib/passRequests.js`, `parent/src/lib/passRequests.test.js`
- Modify: `parent/src/screens/school/ClassActions.jsx` + test, `parent/src/screens/school/ClassTab.jsx`, `parent/src/strings.js`, `parent/src/lib/school.js` + test (`inboxDestination`)

**Interfaces — Consumes:** Task 3 school callables; Task 1 `PASS_NOTE_MAX`, `REPLACE_REASONS`. **Produces:** `usePassRequests(sectionId, enabled)` → `{ learners, requests, loading, error, refresh }` (same shape and focus-refresh behaviour as `useLearnerRequests`); `blockerText(blocker)` in `parent/src/lib/passRequests.js`.

Behaviour:
1. `ClassActions` gains `onPassRequest` → ghost button `S.passRequestButton`, shown only when given; ClassTab passes it when the year has not ended and the roster belongs to the class on screen; it opens `PassRequestSheet` (lazy).
2. Sheet list: each learner with a checkbox; disabled with its blocker text when blocked; a `No photo` chip when `hasPhoto` is false; learners with an active pass show a choice `Lost` / `Damaged` that must be picked before they count as selected. Optional note (500 max, counter). Button `Send request ({n})`. A second view `Sent requests` lists requests with status chips `Waiting` / `Printed` / `Declined` / `Withdrawn`, the decline reason, and `Withdraw` for waiting ones.
3. While the sheet is open the roster does not reload on focus (add to `sheetOpen.current`).
4. `inboxDestination({ type: 'temp_pass_request' })` → `'/school'`.

Strings (exact): `passRequestButton: 'Request temporary pass'`, `passRequestTitle: 'Request temporary passes'`, `passRequestHint: 'Choose learners who need a temporary ID pass. Learners without a photo can be included.'`, `passRequestNoPhoto: 'No photo'`, `passRequestLost: 'Lost'`, `passRequestDamaged: 'Damaged'`, `passRequestReplaceHint: 'Already has a pass. Why is a new one needed?'`, `passRequestNote: 'Note (optional)'`, `passRequestSend: 'Send request'`, `passRequestSent: 'Request sent.'`, `passRequestHistory: 'Sent requests'`, `passRequestWaiting: 'Waiting'`, `passRequestPrinted: 'Printed'`, `passRequestDeclined: 'Declined'`, `passRequestWithdrawn: 'Withdrawn'`, `passRequestWithdraw: 'Withdraw'`, `passRequestEmpty: 'No temporary pass requests yet.'`, `passBlockedOfficial: 'Has an official ID'`, `passBlockedRequested: 'Request already waiting'`, `passBlockedNoLrn: 'No LRN on record'`, `passBlockedInactive: 'Not active'`, `passBlockedNotInClass: 'Not in this class'`.

- [ ] **Step 1:** Tests: `blockerText` for every blocker; ClassActions shows the button only with `onPassRequest`; a static render of the exported `PassRequestList` (like `Sf2Form`) shows the No photo chip, disabled blocked rows, the Lost/Damaged choice and the send count; `inboxDestination`; strings test still passes.
- [ ] **Step 2:** Run — fail. **Step 3:** Implement. **Step 4:** `(cd parent && npx vitest run)`, Parent build and `checkSize.mjs` (under 260 KB; the sheet must be in a lazy chunk). Check the sheet at 375 px wide in a temporary browser harness, removed before commit.
- [ ] **Step 5:** Commit `feat(parent): advisers request temporary passes`.

---

### Task 8: Release checklist

**Files:** Create `docs/releases/2026-11-27-temp-pass-requests/README.md`.

Contents (nothing is executed):
1. Base everything on production, not master: rules from `docs/releases/2026-11-27-temp-pass-requests/firestore.rules` (Task 4 script; regenerate if production rules changed since 2026-11-27); SIMS from the release tree recorded in `docs/audits/deployments/2026-11-27-temp-id-pass/` (`port-sims.mjs`), porting this feature's SIMS files. The release tree has no `staffQueries`; there, `TempPassesPanel` and the Requests tab read whole collections, which live rules allow for all staff.
2. Order: functions (new: the seven request callables; changed: `issueTempPassFn`, `saveStudentPhotoFn`, `getStudentPhotoFn` — they read the new `passGrades`), then rules, then SIMS, then Parent. Functions by name only, from a prepared backend tree whose `shared/` includes `tempPassRequests.js`.
3. Do not create a Logistic Operator account until SIMS is live: the account-creation callable accepts the role as soon as functions deploy.
4. Tell Academic Coordinators before release that ID Cards and the Photo button move to Grade Level Coordinators and the Logistic Operator.
5. After release: set "Pass pick-up place"; create one Logistic Operator; as an adviser request one learner without a photo; print it (dashed frame) and one with a photo on paper at 100% scale; check the 2 × 2 layout and that the gate scans both; mark printed and confirm the adviser's notice; request a Lost replacement and confirm the old pass is refused at the gate.
6. Record the release under `docs/audits/deployments/`.

- [ ] Write it, then commit `docs: release checklist for temporary pass requests`.
