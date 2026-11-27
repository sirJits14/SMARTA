# Temporary Student ID Pass and Student Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff and advisers upload learner photos; SIMS prints a temporary ID pass whose QR works at the kiosk only until the official ID card is issued.

**Architecture:** Pure rules shared by all apps live in `shared/`. Callables own every write of photos and passes; two Firestore triggers reconcile a pass with the learner's current records. The kiosk gets pass codes in its offline roster and tags its scan events; rules and the scan handler re-check the pass.

**Tech Stack:** React 19, Vite, Firebase (Firestore, Functions v2, Storage via Admin SDK), Vitest, `qrcode`.

Spec: `docs/superpowers/specs/2026-11-27-temp-student-id-pass-design.md`. Card reference: `docs/superpowers/specs/assets/2026-11-27-temp-id-pass-reference.png`.

Core logic is given as code. Screens are given as contracts (props, behaviour, exact copy, required test assertions) so they follow the neighbouring files' style.

## Global Constraints

- Photo: 600×600 JPEG, at most `204800` bytes, square, replaces the previous one. Path `student_photos/{studentId}.jpg`.
- Pass code: `BNHS-TP-` + 10 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`.
- Pass statuses: `active`, `superseded`, `revoked`. Reasons: `learner_removed`, `official_id_printed`, `lrn_changed`, `learner_inactive`, `enrollment_ended`, `revoked`.
- Pass staff: administrators (all grades), `jhs_coord` (7–10), `shs_coord` (11–12). `glc` none.
- Photo write: administrator; `jhs_coord`/`shs_coord` for the learner's current section grade; class adviser of the learner's current section while the school year is not ended. Photo read: those, plus an active family guardian link.
- The official LRN QR flow must not change. Scan events without `credential`/`passCode` behave exactly as before.
- No new npm dependencies. Never run `npm install` (worktree `node_modules` are junctions to the main checkout).
- Parent App: all user-visible strings go in `parent/src/strings.js`; they must not contain "location", "tracking" or "live". Keep theme selection only in Settings > Appearance and the icon-only Sessions calendar button.
- React components are not shared between apps; `shared/` holds plain JavaScript only.
- Do not deploy, push, or edit any `firebase.*-release.json`.

## Test commands

| What | Command (repo root, Git Bash) |
|---|---|
| SIMS + shared unit | `npx vitest run [files]` |
| Functions unit | `node scripts/syncShared.mjs && (cd functions && npx vitest run src)` |
| Functions emulator, chosen files | `npx firebase emulators:exec --only firestore,auth "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/<a>.test.js test/emulator/<b>.test.js --no-file-parallelism"` |
| Rules | `npm run test:rules` |
| Parent | `(cd parent && npx vitest run)` |
| Builds | `VITE_FIREBASE_API_KEY=x VITE_FIREBASE_AUTH_DOMAIN=x VITE_FIREBASE_PROJECT_ID=demo-x VITE_FIREBASE_STORAGE_BUCKET=x VITE_FIREBASE_MESSAGING_SENDER_ID=x VITE_FIREBASE_APP_ID=x npx vite build` and, in `parent/`, `npx vite build && node scripts/checkSize.mjs` |

Baseline on 2026-11-27: functions unit 182, parent 258, rules 139 (+7 skipped), all passing.

---

### Task 1: Shared photo and pass rules

**Files:**
- Create: `shared/studentPhoto.js`, `shared/studentPhoto.test.js`, `shared/tempPass.js`, `shared/tempPass.test.js`

**Interfaces — Produces:**
- `PHOTO_SIZE = 600`, `PHOTO_MAX_BYTES = 204800`, `PHOTO_QUALITIES`, `photoPath(studentId)`
- `initialView({width,height}) -> {zoom,cx,cy}`, `clampView(dim, view) -> {zoom,cx,cy}`, `cropRect(dim, view) -> {sx,sy,size}`, `dragView(dim, view, dx, dy, viewportPx) -> view`
- `compressToLimit(encode, maxBytes?) -> Promise<Blob-like>` where `encode(quality) -> Promise<{size}>`
- `photoBytesError(bytes: Uint8Array) -> string` (`''` when valid)
- `PASS_PREFIX`, `PASS_ALPHABET`, `PASS_LENGTH = 10`, `isTempPassCode(text)`, `makePassCode(randomInt)` where `randomInt(max) -> 0..max-1`
- `passGrades(profile) -> null | number[]` (null = all grades), `canManagePasses(profile) -> boolean`
- `isOfficialCardPrinted(student)`, `tempPassBlocker({student,enrollment,section,schoolYear}) -> null | 'not-found' | 'not-enrolled' | 'inactive' | 'no-lrn' | 'official-printed' | 'no-photo'`

- [ ] **Step 1: Write failing tests.** `shared/studentPhoto.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { PHOTO_MAX_BYTES, photoPath, initialView, clampView, cropRect, dragView, compressToLimit, photoBytesError } from './studentPhoto.js';

// Smallest bytes that pass the header checks: SOI, one SOF0 segment, EOI.
const jpeg = (width, height, padding = 0) => Uint8Array.from([
  0xff, 0xd8,
  0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x01, 0x01, 0x11, 0x00,
  ...new Array(padding).fill(0),
  0xff, 0xd9,
]);

describe('crop geometry', () => {
  const wide = { width: 800, height: 400 };
  it('starts centred on the largest square', () => {
    expect(cropRect(wide, initialView(wide))).toEqual({ sx: 200, sy: 0, size: 400 });
  });
  it('keeps the square inside the image', () => {
    expect(cropRect(wide, clampView(wide, { zoom: 1, cx: -50, cy: 9999 }))).toEqual({ sx: 0, sy: 0, size: 400 });
    expect(clampView(wide, { zoom: 99, cx: 400, cy: 200 }).zoom).toBe(4);
    expect(clampView(wide, { zoom: 0, cx: 400, cy: 200 }).zoom).toBe(1);
  });
  it('dragging moves the image with the finger', () => {
    const view = dragView(wide, initialView(wide), 140, 0, 280);
    expect(cropRect(wide, view)).toEqual({ sx: 0, sy: 0, size: 400 });
  });
});

describe('compression', () => {
  it('returns the first quality within the limit', async () => {
    const tried = [];
    const out = await compressToLimit(async q => { tried.push(q); return { size: tried.length < 3 ? PHOTO_MAX_BYTES + 1 : 10 }; });
    expect(out).toEqual({ size: 10 });
    expect(tried).toHaveLength(3);
  });
  it('fails when nothing fits', async () => {
    await expect(compressToLimit(async () => ({ size: PHOTO_MAX_BYTES + 1 }))).rejects.toThrow(/too large/i);
  });
});

describe('server photo check', () => {
  it('accepts a square JPEG', () => { expect(photoBytesError(jpeg(600, 600))).toBe(''); });
  it('refuses other formats, non-square, oversized pixels and oversized files', () => {
    expect(photoBytesError(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toMatch(/JPEG/);
    expect(photoBytesError(jpeg(600, 400))).toMatch(/square/);
    expect(photoBytesError(jpeg(900, 900))).toMatch(/600/);
    expect(photoBytesError(jpeg(100, 100))).toMatch(/too small/i);
    expect(photoBytesError(jpeg(600, 600, PHOTO_MAX_BYTES))).toMatch(/200 KB/);
  });
  it('names the file after the learner', () => { expect(photoPath('S1')).toBe('student_photos/S1.jpg'); });
});
```

`shared/tempPass.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { PASS_ALPHABET, isTempPassCode, makePassCode, passGrades, canManagePasses, isOfficialCardPrinted, tempPassBlocker } from './tempPass.js';

describe('pass codes', () => {
  it('is prefix plus ten unambiguous characters', () => {
    const code = makePassCode(() => 0);
    expect(code).toBe('BNHS-TP-2222222222');
    expect(isTempPassCode(code)).toBe(true);
    expect(PASS_ALPHABET).not.toMatch(/[01OIL]/);
  });
  it('uses the random source across the alphabet', () => {
    let i = 0;
    expect(makePassCode(max => i++ % max)).toBe(`BNHS-TP-${PASS_ALPHABET.slice(0, 10)}`);
  });
  it('rejects LRNs and malformed codes', () => {
    for (const bad of ['100000000001', 'BNHS-TP-222', 'BNHS-TP-OOOOOOOOOO', 'bnhs-tp-2222222222', '', null]) expect(isTempPassCode(bad)).toBe(false);
  });
});

describe('pass staff', () => {
  it('covers administrators and JHS/SHS coordinators only', () => {
    expect(passGrades({ role: 'admin' })).toBeNull();
    expect(passGrades({ role: 'registrar' })).toBeNull();
    expect(passGrades({ role: 'jhs_coord' })).toEqual([7, 8, 9, 10]);
    expect(passGrades({ role: 'shs_coord' })).toEqual([11, 12]);
    expect(passGrades({ role: 'glc', gradeLevel: 8 })).toEqual([]);
    expect(passGrades(null)).toEqual([]);
    expect(canManagePasses({ role: 'glc', gradeLevel: 8 })).toBe(false);
    expect(canManagePasses({ role: 'shs_coord' })).toBe(true);
  });
});

describe('eligibility', () => {
  const base = () => ({
    schoolYear: '2026-2027',
    student: { lrn: '100000000001', status: 'active', photo: { path: 'p' } },
    enrollment: { status: 'enrolled', schoolYear: '2026-2027', sectionId: 'SEC1' },
    section: { gradeLevel: 7, schoolYear: '2026-2027' },
  });
  const blocker = over => tempPassBlocker({ ...base(), ...over });
  it('allows an enrolled learner with a photo and no printed card', () => { expect(blocker({})).toBeNull(); });
  it('names what blocks a pass', () => {
    expect(blocker({ student: undefined })).toBe('not-found');
    expect(blocker({ enrollment: undefined })).toBe('not-enrolled');
    expect(blocker({ enrollment: { ...base().enrollment, status: 'dropped' } })).toBe('not-enrolled');
    expect(blocker({ section: { gradeLevel: 7, schoolYear: '2025-2026' } })).toBe('not-enrolled');
    expect(blocker({ student: { ...base().student, status: 'transferred' } })).toBe('inactive');
    expect(blocker({ student: { ...base().student, lrn: ' ' } })).toBe('no-lrn');
    expect(blocker({ student: { ...base().student, idCard: { printedAt: 1, lrn: '100000000001' } } })).toBe('official-printed');
    expect(blocker({ student: { ...base().student, photo: undefined } })).toBe('no-photo');
  });
  it('treats a card printed for an old LRN as not printed', () => {
    expect(isOfficialCardPrinted({ lrn: '2', idCard: { printedAt: 1, lrn: '1' } })).toBe(false);
  });
});
```

- [ ] **Step 2:** `npx vitest run shared/studentPhoto.test.js shared/tempPass.test.js` — expect failure (modules missing).

- [ ] **Step 3: Implement.** `shared/studentPhoto.js`:

```js
// Learner photo rules shared by SIMS, the Parent App and Functions (spec 2026-11-27).
export const PHOTO_SIZE = 600;
export const PHOTO_MIN_SIZE = 300;
export const PHOTO_MAX_BYTES = 200 * 1024;
export const PHOTO_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.4];
export const MAX_ZOOM = 4;
export const photoPath = (studentId) => `student_photos/${studentId}.jpg`;

const between = (n, low, high) => Math.min(high, Math.max(low, n));
const side = (dim, zoom) => Math.min(dim.width, dim.height) / zoom;

export const initialView = (dim) => ({ zoom: 1, cx: dim.width / 2, cy: dim.height / 2 });

// A view is a zoom plus the centre of the square, in image pixels.
export function clampView(dim, view) {
  const zoom = between(view.zoom, 1, MAX_ZOOM);
  const half = side(dim, zoom) / 2;
  return { zoom, cx: between(view.cx, half, dim.width - half), cy: between(view.cy, half, dim.height - half) };
}

export function cropRect(dim, view) {
  const { zoom, cx, cy } = clampView(dim, view);
  const size = side(dim, zoom);
  return { sx: cx - size / 2, sy: cy - size / 2, size };
}

// (dx, dy) is how far the pointer moved on a square preview viewportPx wide.
export function dragView(dim, view, dx, dy, viewportPx) {
  const scale = side(dim, clampView(dim, view).zoom) / viewportPx;
  return clampView(dim, { ...view, cx: view.cx - dx * scale, cy: view.cy - dy * scale });
}

export async function compressToLimit(encode, maxBytes = PHOTO_MAX_BYTES) {
  for (const quality of PHOTO_QUALITIES) {
    const out = await encode(quality);
    if (out && out.size <= maxBytes) return out;
  }
  throw new Error('This photo is too large to save. Try another one.');
}

// Reads the frame size from a JPEG's start-of-frame segment; null if absent.
function jpegSize(bytes) {
  let at = 2;
  while (at + 8 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) { at += 1; continue; }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: (bytes[at + 5] << 8) | bytes[at + 6], width: (bytes[at + 7] << 8) | bytes[at + 8] };
    }
    at += 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
  }
  return null;
}

export function photoBytesError(bytes) {
  if (bytes.length > PHOTO_MAX_BYTES) return 'The photo must be 200 KB or smaller.';
  const isJpeg = bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const size = isJpeg ? jpegSize(bytes) : null;
  if (!size) return 'The photo must be a JPEG image.';
  if (size.width !== size.height) return 'The photo must be square.';
  if (size.width > PHOTO_SIZE) return 'The photo must be at most 600 pixels wide.';
  if (size.width < PHOTO_MIN_SIZE) return 'The photo is too small. Use a clearer picture.';
  return '';
}
```

`shared/tempPass.js`:

```js
// Temporary ID Pass rules shared by SIMS and Functions (spec 2026-11-27).
// The kiosk repository keeps its own copy of the code pattern: keep in step.
import { roleOf, scopedGrades } from './staffRoles.js';

export const PASS_PREFIX = 'BNHS-TP-';
export const PASS_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const PASS_LENGTH = 10;
const PATTERN = new RegExp(`^${PASS_PREFIX}[${PASS_ALPHABET}]{${PASS_LENGTH}}$`);

export const isTempPassCode = (text) => typeof text === 'string' && PATTERN.test(text);

// randomInt(max) returns a uniform integer in [0, max).
export const makePassCode = (randomInt) =>
  PASS_PREFIX + Array.from({ length: PASS_LENGTH }, () => PASS_ALPHABET[randomInt(PASS_ALPHABET.length)]).join('');

// null = every grade (administrator); [] = no pass or photo management.
export function passGrades(profile) {
  const role = roleOf(profile);
  if (role === 'admin') return null;
  return role === 'jhs_coord' || role === 'shs_coord' ? scopedGrades(profile) : [];
}
export function canManagePasses(profile) {
  const grades = passGrades(profile);
  return grades === null || grades.length > 0;
}

// Same test as the official card queue: printed, and for the present LRN.
export const isOfficialCardPrinted = (student) => !!student?.idCard?.printedAt && student.idCard.lrn === student.lrn;

export function tempPassBlocker({ student, enrollment, section, schoolYear }) {
  if (!student) return 'not-found';
  if (!enrollment || enrollment.status !== 'enrolled' || enrollment.schoolYear !== schoolYear
      || !section || section.schoolYear !== schoolYear) return 'not-enrolled';
  if ((student.status ?? 'active') !== 'active') return 'inactive';
  if (!String(student.lrn ?? '').trim()) return 'no-lrn';
  if (isOfficialCardPrinted(student)) return 'official-printed';
  if (!student.photo?.path) return 'no-photo';
  return null;
}
```

- [ ] **Step 4:** Re-run Step 2 — expect pass. In `src/lib/idCardQueue.js`, replace the body of `isIdCardPrinted` by re-exporting the shared function (keep its comment):
```js
import { isOfficialCardPrinted } from '../../shared/tempPass.js';
export const isIdCardPrinted = isOfficialCardPrinted;
```
Run `npx vitest run` — expect all pass.
- [ ] **Step 5:** Commit `feat(shared): photo and temporary pass rules`.

---

### Task 2: Photo storage callables

**Files:**
- Create: `functions/src/handlers/studentPhotos.js`, `functions/test/emulator/studentPhotos.test.js`, `storage.rules`
- Modify: `functions/src/admin.js`, `functions/index.js`, `functions/src/callable.js` (LIMITS), `functions/src/lib/format.js` (`learnerIdentity`), `functions/src/handlers/sessionAttendance.js` (`getSchoolRoster`), `firebase.json` (storage rules entry, storage emulator port 9199)

**Interfaces — Consumes:** Task 1 `photoPath`, `photoBytesError`, `passGrades`.
**Produces:**
- `saveStudentPhoto(deps, {studentId, contentBase64}) -> {ok: true, updatedAt: <ms>}`
- `getStudentPhoto(deps, {studentId}) -> {photo: null | {contentBase64, updatedAt: <ms|null>}}`
- `deletePhotoFile(bucket, studentId) -> Promise<void>`
- `deps` = `{ db, bucket, uid, email, displayName?, authTime?, now }`
- `bucket()` exported by `functions/src/admin.js`
- Exports `saveStudentPhotoFn`, `getStudentPhotoFn`
- `getSchoolRoster` rows gain `photoUpdatedAt` (ms, only when the learner has a photo); the result gains `canEditPhotos: boolean`
- `learnerIdentity(...)` includes `photoUpdatedAt: student.photo.updatedAt` only when present

- [ ] **Step 1: Write failing emulator test** `functions/test/emulator/studentPhotos.test.js`. Use `db, clearAll, seedSchool` from `./helpers.js`. Fake bucket:

```js
export function fakeBucket() {
  const files = new Map();
  return {
    files,
    file: (path) => ({
      async save(bytes, options) { files.set(path, { bytes: Buffer.from(bytes), options }); },
      async download() {
        const f = files.get(path);
        if (!f) throw Object.assign(new Error('missing'), { code: 404 });
        return [f.bytes];
      },
      async delete() { files.delete(path); },
    }),
  };
}
const jpeg = (w = 600, h = 600) => Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]).toString('base64');
```

Seed on top of `seedSchool`: `sections/SEC11` (grade 11) and `students/S11` + enrollment; `users/admin@x` `{uid:'admin',role:'admin'}`, `users/jhs@x` `{uid:'jhs',role:'jhs_coord'}`, `users/glc@x` `{uid:'glc',role:'glc',gradeLevel:7}`, `users/off@x` `{uid:'off',role:'admin',disabled:true}`; `school_accounts/adv` `{assignments:[{role:'adviser',schoolYear:'2026-2027',sectionId:'SEC1',gradeLevel:7}]}`; `school_accounts/cur` with a `curriculum_adviser` grade 7 assignment. Caller `deps(uid)` = `{db: db(), bucket, uid, email: uid+'@x', now: () => new Date('2026-11-27T08:00:00+08:00')}`.

Required cases, each a real assertion:
1. Admin, JHS coordinator and the SEC1 adviser can each save S1's photo: file at `student_photos/S1.jpg` with contentType `image/jpeg`; `students/S1.photo` = `{path:'student_photos/S1.jpg', updatedAt: <Timestamp>, updatedBy: <email>}`; an `audit_log` row with `action:'student.photoSaved'`.
2. `learners/S1.photoUpdatedAt` is set when that doc exists; no `learners/S1` doc is created when it does not.
3. `permission-denied` on save: JHS coordinator for S11; GLC for S1; curriculum adviser for S1; adviser for S11; guardian `gA` for S1; disabled admin; any non-admin for a learner id that does not exist or is not enrolled.
4. Adviser cannot save once `school_years/2026-2027.endedAt` is set; admin still can.
5. `invalid-argument` for missing studentId, an id containing `/`, non-base64 text, a non-square JPEG; nothing written.
6. Read: admin, JHS coordinator, adviser and guardian `gA` (active link) get `{photo:{contentBase64, updatedAt}}`; `gC` (revoked link), a guardian link with `relationship:'Adviser'`, GLC, and curriculum adviser get `permission-denied`.
7. A learner with no photo returns `{photo: null}`; a `photo` field whose file is gone also returns `{photo: null}`.
8. `getSchoolRoster` for the adviser returns `canEditPhotos: true` and S1's row `photoUpdatedAt` as a number after a save; the curriculum adviser gets `canEditPhotos: false`.

- [ ] **Step 2:** Run the file with the emulator command — expect failure.

- [ ] **Step 3: Implement** `functions/src/handlers/studentPhotos.js`:

```js
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { loadSchoolActor } from './schoolAccess.js';
import { roleOf } from '../../shared/staffRoles.js';
import { isFamilyLink } from '../../shared/schoolAccess.js';
import { photoPath, photoBytesError, PHOTO_MAX_BYTES } from '../../shared/studentPhoto.js';
import { passGrades } from '../../shared/tempPass.js';

// Learner photos (spec 2026-11-27). Storage rules deny every client, so this
// file is the only door: it decides who may see or replace a photo.
const fail = (code, message) => { throw new CallableError(code, message); };
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const DENIED = 'You do not have access to this learner’s photo.';
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

async function photoAccess(deps, studentId) {
  const { db, uid } = deps;
  const actor = await loadSchoolActor(deps);
  const [profileSnap, studentSnap, enrollmentSnap, linkSnap] = await Promise.all([
    db.doc(`users/${actor.email}`).get(),
    db.doc(`students/${studentId}`).get(),
    db.doc(`enrollments/${studentId}_${actor.schoolYear}`).get(),
    db.doc(`guardian_links/${uid}_${studentId}`).get(),
  ]);
  const profile = profileSnap.data();
  const staff = profile && profile.disabled !== true && (!profile.uid || profile.uid === uid) && roleOf(profile) ? profile : null;
  const enrollment = enrollmentSnap.data();
  const section = enrollment?.status === 'enrolled' && identifier(enrollment.sectionId)
    ? (await db.doc(`sections/${enrollment.sectionId}`).get()).data() : null;
  const grades = staff ? passGrades(staff) : [];
  const advises = Boolean(section) && section.schoolYear === actor.schoolYear
    && actor.assignments.some(a => a.role === 'adviser' && a.sectionId === enrollment.sectionId);
  const canWrite = grades === null || (Boolean(section) && grades.includes(section.gradeLevel)) || advises;
  const link = linkSnap.data();
  const guardian = isFamilyLink(link) && link.guardianUid === uid;
  return { actor, student: studentSnap.exists ? studentSnap.data() : null, canWrite, canRead: canWrite || guardian };
}

export async function saveStudentPhoto(deps, input) {
  const { db, bucket, uid } = deps;
  const { studentId, contentBase64 } = input;
  if (!identifier(studentId)) fail('invalid-argument', 'Choose a learner.');
  if (typeof contentBase64 !== 'string' || contentBase64.length > Math.ceil(PHOTO_MAX_BYTES * 4 / 3) + 4
      || !BASE64.test(contentBase64)) fail('invalid-argument', 'The photo must be a JPEG of 200 KB or less.');
  const bytes = Buffer.from(contentBase64, 'base64');
  const problem = photoBytesError(bytes);
  if (problem) fail('invalid-argument', problem);
  const access = await photoAccess(deps, studentId);
  if (!access.canWrite || !access.student) fail('permission-denied', DENIED);
  await enforceRateLimit(db, uid, 'studentPhoto', LIMITS.studentPhoto, deps.now().getTime());
  const path = photoPath(studentId);
  await bucket.file(path).save(bytes, { resumable: false, contentType: 'image/jpeg', metadata: { cacheControl: 'private, max-age=0, no-store' } });
  const updatedAt = Timestamp.fromDate(deps.now());
  const studentRef = db.doc(`students/${studentId}`);
  const learnerRef = db.doc(`learners/${studentId}`);
  await db.runTransaction(async tx => {
    const [student, learner] = await Promise.all([tx.get(studentRef), tx.get(learnerRef)]);
    if (!student.exists) fail('not-found', 'Learner not found.');
    tx.update(studentRef, { photo: { path, updatedAt, updatedBy: access.actor.email } });
    if (learner.exists) tx.update(learnerRef, { photoUpdatedAt: updatedAt });
    tx.set(db.collection('audit_log').doc(), { action: 'student.photoSaved', actorType: 'staff', actorUid: access.actor.email,
      targetType: 'student', targetId: studentId, details: {}, at: FieldValue.serverTimestamp() });
  });
  return { ok: true, updatedAt: updatedAt.toMillis() };
}

export async function getStudentPhoto(deps, input) {
  if (!identifier(input.studentId)) fail('invalid-argument', 'Choose a learner.');
  const access = await photoAccess(deps, input.studentId);
  if (!access.canRead) fail('permission-denied', DENIED);
  if (!access.student?.photo?.path) return { photo: null };
  try {
    const [bytes] = await deps.bucket.file(photoPath(input.studentId)).download();
    return { photo: { contentBase64: bytes.toString('base64'), updatedAt: access.student.photo.updatedAt?.toMillis?.() ?? null } };
  } catch (e) {
    if (e?.code === 404) return { photo: null };
    throw e;
  }
}

export const deletePhotoFile = (bucket, studentId) => bucket.file(photoPath(studentId)).delete({ ignoreNotFound: true });
```

`functions/src/admin.js`: add `import { getStorage } from 'firebase-admin/storage';` and `export const bucket = () => getStorage().bucket();` (a function, so a project without a bucket only fails photo calls).

`functions/src/callable.js` LIMITS add:
```js
  // Learner photos: an adviser may photograph a whole class, with retakes.
  studentPhoto: { windowMs: 60 * 60 * 1000, max: 300 },
```

`functions/index.js`:
```js
const photoCall = (fn) => schoolCall((deps, input) => fn({ ...deps, bucket: bucket() }, input));
export const saveStudentPhotoFn = photoCall(saveStudentPhoto);
export const getStudentPhotoFn = photoCall(getStudentPhoto);
```

`learnerIdentity`: append `...(student.photo?.updatedAt ? { photoUpdatedAt: student.photo.updatedAt } : {}),`.

`getSchoolRoster`: row map becomes
```js
const rows = students.filter(s => s.exists).map(s => {
  const photoUpdatedAt = s.data().photo?.updatedAt?.toMillis?.();
  return { ...projection(attendance, s.id), displayName: fullName(s.data()), ...(photoUpdatedAt ? { photoUpdatedAt } : {}) };
});
```
and the return adds `canEditPhotos: actor.isAdmin === true || actor.assignments.some(a => a.role === 'adviser' && a.sectionId === section.id)`.

`storage.rules`:
```
rules_version = '2';
// Learner photos are read and written only by Cloud Functions (spec 2026-11-27).
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} { allow read, write: if false; }
  }
}
```
`firebase.json`: add top-level `"storage": { "rules": "storage.rules" },` and in `emulators` `"storage": { "port": 9199 },`.

- [ ] **Step 4:** Run `studentPhotos.test.js sessionAttendance.test.js codes.test.js scanEvent.test.js` with the emulator command, and functions unit tests — expect pass.
- [ ] **Step 5:** Commit `feat(functions): learner photo upload and viewing`.

---

### Task 3: Temporary pass functions and scan validation

**Files:**
- Create: `functions/src/handlers/tempPasses.js`, `functions/test/emulator/tempPasses.test.js`
- Modify: `functions/index.js`, `functions/src/callable.js` (LIMITS), `functions/src/handlers/scanAttendance.js`, `functions/test/emulator/scanAttendance.test.js`

**Interfaces — Consumes:** Task 1 `makePassCode`, `passGrades`, `canManagePasses`, `tempPassBlocker`, `isOfficialCardPrinted`; Task 2 `deletePhotoFile`, `bucket`.
**Produces:**
- `issueTempPasses(deps, {studentIds}) -> {issued: [{studentId, code}], skipped: [{studentId, reason}]}`; reasons are the blocker values plus `'out-of-scope'`
- `revokeTempPass(deps, {studentId}) -> {revoked: 0|1}`
- `reconcileTempPass(db, studentId) -> Promise<'none'|'kept'|'moved'|'superseded'|'revoked'>`
- Exports `issueTempPassFn` (staffCall), `revokeTempPassFn` (adminCall), `onStudentWritten`, `onEnrollmentWritten`

- [ ] **Step 1: Write failing tests** `tempPasses.test.js` (seedSchool; give S1 `photo:{path:'student_photos/S1.jpg'}`; staff `deps` as in `advisorySlips.test.js`, plus `uid`). Required cases:
1. Admin issues for S1: `temp_passes/S1` = `{code, status:'active', lrn:'100000000001', sectionId:'SEC1', gradeLevel:7, schoolYear:'2026-2027', issuedBy, issuedAt}`; `isTempPassCode(code)`; audit row `tempPass.issued`.
2. Issuing again returns the same code and writes no new audit row.
3. A section change before reissue keeps the code and updates `sectionId`/`gradeLevel`.
4. Skips with exact reasons: unknown id `not-found`; S2 (not enrolled) `not-enrolled`; no photo `no-photo`; printed card `official-printed`; dropped status `inactive`; JHS coordinator on a grade 11 learner `out-of-scope`.
5. GLC gets `permission-denied`; empty, over-200 and malformed `studentIds` get `invalid-argument`; ended school year `failed-precondition`.
6. Revoke: sets `status:'revoked', endedReason:'revoked', endedBy`; second call `{revoked:0}`; issuing afterwards yields a different code with `status:'active'` and no `ended*` fields.
7. `reconcileTempPass`: each row of the spec table (delete student → revoked/`learner_removed`; set `idCard {printedAt, lrn}` → superseded/`official_id_printed`; change LRN → superseded/`lrn_changed`; status `transferred` → revoked/`learner_inactive`; enrollment `dropped` and enrollment deleted → revoked/`enrollment_ended`; section change → `'moved'`, still active, new section and grade; unrelated edit → `'kept'`; no pass or already ended → `'none'`, unchanged).

Add to `scanAttendance.test.js`:
8. A scan with `credential:'temp_pass'` and the matching active code applies like a normal scan.
9. `rejected:temp_pass_inactive` and no attendance doc for: no pass; wrong code; `superseded`; `revoked`; other school year; `credential` without `passCode`; unknown credential value; active pass but the learner's official card already printed.
10. A scan with neither field still applies when a revoked pass exists for the learner (official card regression).

- [ ] **Step 2:** Run both files — expect failure.

- [ ] **Step 3: Implement** `functions/src/handlers/tempPasses.js`:

```js
import { randomInt } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { currentYear } from './advisorySlips.js';
import { makePassCode, passGrades, canManagePasses, tempPassBlocker, isOfficialCardPrinted } from '../../shared/tempPass.js';

// Temporary ID Passes (spec 2026-11-27). temp_passes/{studentId} is written only here.
const fail = (code, message) => { throw new CallableError(code, message); };
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const audit = (actorUid, action, studentId, details) => ({ action, actorType: 'staff', actorUid,
  targetType: 'temp_pass', targetId: studentId, details, at: FieldValue.serverTimestamp() });

export async function issueTempPasses(deps, input) {
  const { db, uid, email, profile, now } = deps;
  if (!canManagePasses(profile)) fail('permission-denied', 'Temporary passes are for administrators and academic coordinators.');
  const ids = Array.isArray(input.studentIds) ? [...new Set(input.studentIds)] : [];
  if (!ids.length || ids.length > 200 || !ids.every(identifier)) fail('invalid-argument', 'Choose 1–200 learners.');
  await enforceRateLimit(db, uid, 'tempPass', LIMITS.tempPass, now().getTime());
  const { schoolYear, ended } = await currentYear(db);
  if (ended) fail('failed-precondition', `The ${schoolYear} school year has ended.`);
  const grades = passGrades(profile);
  const issued = []; const skipped = [];
  for (const studentId of ids) {
    const result = await db.runTransaction(async tx => {
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
      const placement = { sectionId, gradeLevel: section.gradeLevel };
      const current = pass.data();
      const lrn = student.data().lrn;
      if (current?.status === 'active' && current.lrn === lrn && current.schoolYear === schoolYear) {
        if (current.sectionId !== sectionId || current.gradeLevel !== section.gradeLevel) tx.update(passRef, placement);
        return { code: current.code };
      }
      const code = makePassCode(randomInt);
      tx.set(passRef, { code, status: 'active', lrn, ...placement, schoolYear, issuedBy: email, issuedAt: FieldValue.serverTimestamp() });
      tx.set(db.collection('audit_log').doc(), audit(email, 'tempPass.issued', studentId, placement));
      return { code };
    });
    if (result.code) issued.push({ studentId, code: result.code }); else skipped.push({ studentId, reason: result.skip });
  }
  return { issued, skipped };
}

export async function revokeTempPass(deps, input) {
  const { db, email } = deps;
  if (!identifier(input.studentId)) fail('invalid-argument', 'Choose a learner.');
  return db.runTransaction(async tx => {
    const ref = db.doc(`temp_passes/${input.studentId}`);
    const pass = (await tx.get(ref)).data();
    if (pass?.status !== 'active') return { revoked: 0 };
    tx.update(ref, { status: 'revoked', endedReason: 'revoked', endedBy: email, endedAt: FieldValue.serverTimestamp() });
    tx.set(db.collection('audit_log').doc(), audit(email, 'tempPass.revoked', input.studentId, { gradeLevel: pass.gradeLevel }));
    return { revoked: 1 };
  });
}

function ending(pass, student, enrollment) {
  if (!student) return ['revoked', 'learner_removed'];
  if (isOfficialCardPrinted(student)) return ['superseded', 'official_id_printed'];
  if (student.lrn !== pass.lrn) return ['superseded', 'lrn_changed'];
  if ((student.status ?? 'active') !== 'active') return ['revoked', 'learner_inactive'];
  if (!enrollment || enrollment.status !== 'enrolled') return ['revoked', 'enrollment_ended'];
  return null;
}

// Re-reads current records, so repeated or out-of-order triggers settle the same way.
export async function reconcileTempPass(db, studentId) {
  const ref = db.doc(`temp_passes/${studentId}`);
  // Most learners have no pass: skip the transaction for them (imports write thousands).
  if ((await ref.get()).data()?.status !== 'active') return 'none';
  return db.runTransaction(async tx => {
    const pass = (await tx.get(ref)).data();
    if (pass?.status !== 'active') return 'none';
    const [student, enrollment] = await Promise.all([
      tx.get(db.doc(`students/${studentId}`)), tx.get(db.doc(`enrollments/${studentId}_${pass.schoolYear}`)),
    ]);
    const end = ending(pass, student.data(), enrollment.data());
    if (end) {
      const [status, endedReason] = end;
      tx.update(ref, { status, endedReason, endedBy: 'system', endedAt: FieldValue.serverTimestamp() });
      tx.set(db.collection('audit_log').doc(), { ...audit('system', `tempPass.${status}`, studentId, { reason: endedReason }), actorType: 'system' });
      return status;
    }
    const { sectionId } = enrollment.data();
    if (sectionId === pass.sectionId) return 'kept';
    const section = (await tx.get(db.doc(`sections/${sectionId}`))).data();
    if (!section) return 'kept';
    tx.update(ref, { sectionId, gradeLevel: section.gradeLevel });
    return 'moved';
  });
}
```

LIMITS add:
```js
  // Temporary passes: one call per print batch (up to 200 learners each).
  tempPass: { windowMs: 60 * 60 * 1000, max: 300 },
```

`functions/index.js` (import `onDocumentWritten` is already there):
```js
export const issueTempPassFn = staffCall(issueTempPasses, { timeoutSeconds: 120 });
export const revokeTempPassFn = adminCall(revokeTempPass);
export const onStudentWritten = onDocumentWritten({ document: 'students/{studentId}', retry: true }, async (event) => {
  const { studentId } = event.params;
  await reconcileTempPass(db, studentId);
  const before = event.data?.before?.data();
  if (before?.photo && !event.data?.after?.exists) await deletePhotoFile(bucket(), studentId);
});
export const onEnrollmentWritten = onDocumentWritten({ document: 'enrollments/{id}', retry: true }, async (event) => {
  const data = event.data?.after?.data() || event.data?.before?.data();
  if (typeof data?.studentId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(data.studentId)) await reconcileTempPass(db, data.studentId);
});
```

`scanAttendance.js`: inside `applyScanAttendance`, after reading the four documents:
```js
const usesPass = data.credential !== undefined || data.passCode !== undefined;
const pass = usesPass ? (await tx.get(db.doc(`temp_passes/${data.studentId}`))).data() : null;
```
and directly after the `enrollment` rejection:
```js
// A temporary pass works only while it is active and no official card is out.
if (usesPass && (data.credential !== 'temp_pass' || pass?.status !== 'active' || pass.code !== data.passCode
    || pass.schoolYear !== data.schoolYear || isOfficialCardPrinted(student.data()))) return reject('temp_pass_inactive');
```
All reads must stay before the first write.

- [ ] **Step 4:** Run `tempPasses.test.js scanAttendance.test.js scanEvent.test.js` and functions unit tests — expect pass.
- [ ] **Step 5:** Commit `feat(functions): temporary ID passes and pass-aware scans`.

---

### Task 4: Firestore rules

**Files:** Modify `firestore.rules`; create `tests/rules/tempPasses.test.js`.

**Interfaces — Produces:** read rules for `temp_passes`; `scan_events` accepts the optional pair `credential`, `passCode`.

- [ ] **Step 1: Failing tests** in `tests/rules/tempPasses.test.js` (use `helpers.js`; seed `users/*` role profiles as `roles.test.js` does). Cases:
1. No client can create, update or delete `temp_passes` (admin, coordinator, kiosk, guardian).
2. Admin gets and lists all. JHS lists `where('gradeLevel','in',[7,8,9,10])` and is denied an unfiltered list and a grade 11 doc. SHS the mirror. GLC8 denied even for grade 8.
3. Active kiosk lists `where('status','==','active').where('schoolYear','==','2026-2027')`; denied an unfiltered list and a revoked doc. Inactive kiosk, guardian, anonymous denied.
4. Kiosk creates a scan event with `credential:'temp_pass'` + matching `passCode` for an active pass.
5. Denied: only one of the two fields; wrong `credential`; non-string or wrong `passCode`; `superseded` and `revoked` pass; pass of another school year; no pass doc; another learner's code.
6. A plain scan event still succeeds, also when the learner has a revoked pass.
Also confirm `students/{id}` stays admin-write only (coordinator cannot write `photo`) and `learners` stays read-only for clients.

- [ ] **Step 2:** `npm run test:rules` — expect the new file to fail.
- [ ] **Step 3: Implement.** Near `coordinatorMayReadGrade`:
```
    // Mirrors passGrades() in shared/tempPass.js: GLCs do not handle passes.
    function coordinatorMayReadPass() {
      return isStaff() && role() in ['jhs_coord', 'shs_coord'] && coordinatorCoversGrade(resource.data.get('gradeLevel', null));
    }
```
After the `id_card_batch` match:
```
    // Temporary ID passes (spec 2026-11-27). Functions write them.
    match /temp_passes/{studentId} {
      allow read: if isAdmin() || coordinatorMayReadPass() || (isKiosk() && resource.data.status == 'active');
      allow write: if false;
    }
```
Beside `validScanEnrollment`:
```
    // Official cards send neither field. A temporary pass sends both and must still be active.
    function validScanCredential(d) {
      return !d.keys().hasAny(['credential', 'passCode'])
        || (d.keys().hasAll(['credential', 'passCode']) && d.credential == 'temp_pass' && d.passCode is string
          && activePass(get(/databases/$(database)/documents/temp_passes/$(d.studentId)).data, d));
    }
    function activePass(p, d) {
      return p.status == 'active' && p.code == d.passCode && p.schoolYear == d.schoolYear;
    }
```
In the create rule add `'credential', 'passCode'` to `hasOnly` (not to `hasAll`) and append `&& validScanCredential(request.resource.data)` after `validScanEnrollment(...)`.
Add `staffQueries` need no index: single-field filters and two equalities.
- [ ] **Step 4:** `npm run test:rules` — all pass (existing 139 plus new). If a coordinator or kiosk case fails with an expression-limit error, reduce repeated `profile()` evaluation in the new function only.
- [ ] **Step 5:** Commit `feat(rules): temporary pass reads and pass scan events`.

---

### Task 5: SIMS photo upload

**Files:**
- Create: `src/data/photos.js`, `src/lib/photoCanvas.js`, `src/components/PhotoCropper.jsx`, `src/components/StudentPhotoDialog.jsx`, `src/components/StudentPhotoDialog.test.js`
- Modify: `src/lib/access.js` + `access.test.js`, `src/pages/StudentsPage.jsx`, `firebase.json` (SIMS `Permissions-Policy` → `geolocation=(), camera=(self), microphone=()`), `src/registrar.css`

**Interfaces — Consumes:** Task 1 geometry and `compressToLimit`; Task 2 callables.
**Produces:**
- `src/data/photos.js`: `getStudentPhoto(studentId) -> Promise<{photo}>`, `saveStudentPhoto(studentId, contentBase64)`, `photoDataUrl(photo) -> 'data:image/jpeg;base64,…' | ''`
- `access.js`: `canManagePhotos(me)` = `canManagePasses(me)` from shared
- `src/lib/photoCanvas.js`: `drawCrop(canvas, image, view)`, `exportPhoto(image, view) -> Promise<string base64>` (600×600, white background, `compressToLimit` over `canvas.toBlob('image/jpeg', q)`, FileReader to base64 without the data-URL prefix)
- `<PhotoCropper onReady={(base64 | '') => …} disabled />`

Behaviour:
- `PhotoCropper`: buttons "Choose a file" (hidden `input type=file accept="image/jpeg,image/png,image/webp"`) and "Use camera". Camera: `getUserMedia({video:{facingMode:'environment', width:{ideal:1280}}, audio:false})` into a `<video playsInline muted>`; buttons "Capture" and "Cancel"; every track is stopped on capture, cancel and unmount, including when the stream arrives after unmount. If unavailable or refused show "The camera is not available. Choose a file instead." A file that cannot be decoded shows "That file could not be opened as a picture." Object URLs are revoked. With a picture: a 280px square canvas preview that can be dragged (pointer events, `touch-action:none`) and moved with arrow keys (focusable, `aria-label="Photo crop. Drag or use the arrow keys to position."`), and a range input "Zoom" 1–4 step 0.01. "Use this crop" is not needed: call `onReady(base64)` after each settled change (debounce ~200ms) and `onReady('')` while changing.
- `StudentPhotoDialog({ student, onClose })`: `Modal` titled `Photo · {fullName(student)}`; loads the current photo (`getStudentPhoto`) showing it at 160px, or "No photo yet." Save button "Save photo" (disabled until `onReady` gave base64) runs through `useAsyncAction`, then closes. Errors surface with `ActionFeedback`; load failure shows "Could not load the current photo." and still allows upload.
- `StudentsPage`: when `canManagePhotos(me)`, each row's actions include a ghost button "Photo" opening the dialog (admins keep Edit and the menu; JHS/SHS coordinators get only Photo; GLC nothing).

- [ ] **Step 1:** Failing tests: `access.test.js` — `canManagePhotos` true for admin/jhs/shs, false for glc. `StudentPhotoDialog.test.js` (static render with `vi.mock` of `../data/photos.js` and `../firebase.js`, as `SectionsPage.test.js` does) — title contains the learner's capitals name, "Choose a file", "Use camera", and a disabled "Save photo". A StudentsPage static render test: row has "Photo" for admin and `jhs_coord`, not for `glc`. `photoDataUrl(null) === ''`.
- [ ] **Step 2:** run them, expect failure. **Step 3:** implement. **Step 4:** `npx vitest run` and the SIMS build command pass.
- [ ] **Step 5:** Commit `feat(sims): upload learner photos from the student list`.

---

### Task 6: SIMS temporary pass printing

**Files:**
- Create: `src/lib/tempPass.js` + `.test.js`, `src/data/tempPasses.js`, `src/components/TempPassPrintable.jsx` + `.test.js`, `src/pages/idCards/TempPassesTab.jsx` + `.test.js`, `src/pages/tempPassPrintLayout.js`
- Modify: `src/pages/IDCardsPage.jsx`, `src/lib/access.js` + test, `src/lib/staffQueries.js` + test, `src/pages/SettingsPage.jsx`, `src/data/settings.js`

**Interfaces — Consumes:** Task 1 `tempPassBlocker`, `canManagePasses`; Task 3 `issueTempPassFn`, `revokeTempPassFn`; Task 5 `getStudentPhoto`, `photoDataUrl`.
**Produces:**
- `src/data/tempPasses.js`: `issueTempPasses(studentIds)`, `revokeTempPass(studentId)` (callable data returned)
- `src/lib/tempPass.js`: `passRowStatus({student, enrollment, section, schoolYear, pass}) -> {key, label, tone, printable}`; `fitText(text, maxWidth, fontSize) -> {fontSize, textLength?}`; `chunkSheets(items) ` (9 per sheet); `passSectionLine(section) -> 'GRADE 11 – RIZAL · STEM'`

Status table (first match wins): official card printed → `official` "Official ID issued" (neutral, not printable); blocker `inactive` → "Not active"; `no-lrn` → "No LRN"; active pass with matching lrn and schoolYear and no blocker → `active` "Active" (success, printable); `no-photo` → "Missing photo" (warning, not printable); pass `revoked` for this year → "Revoked" (danger, printable); pass `superseded` for this year → "Superseded" (neutral, printable); otherwise `ready` "Ready" (info, printable).

`fitText`: estimated width = `text.length * fontSize * 0.66`; if it fits return `{fontSize}`; else shrink to `max(fontSize*0.6, maxWidth/(text.length*0.66))` and also return `textLength: maxWidth` (so SVG guarantees the fit).

**Card** (`TempPassCard({ name, sectionLine, lrn, photoSrc, qrSrc, principalName, principalTitle })`): one `<svg className="temp-pass-card" viewBox="0 0 591 937" role="img" aria-label="Temporary ID pass for {name}">`, font family `Arial, Helvetica, sans-serif`:
- background rect `#FFF8F1`; green path `M0 0H473V40C473 130 450 175 415 215V300H0Z` fill `#00BF63`
- logo `src/assets/bnhs_logo.png` (import `?url`): x17 y38 82×82
- "BUKIDNON NATIONAL" (x122 y75) and "HIGH SCHOOL" (x122 y104), 28 bold, `#0A0A0A`
- vertical "BNHS ID PASS": `transform="translate(519 25) rotate(90)"`, 60 bold, `textLength=411 lengthAdjust="spacingAndGlyphs"`
- photo: x169 y172 272×272, `preserveAspectRatio="xMidYMid slice"`
- name: centred x297 y505, 40 bold, fitted to 551
- section line: centred x297 y548, 23, letter-spacing 5, fitted to 540
- `LRN: {lrn}`: centred x297 y596, 28
- "STUDENT'S TEMPORARY QR CODE:" x18 y695, 13
- white rect x19 y707 210×210, QR image the same box (generate with `QRCode.toDataURL(code, { errorCorrectionLevel: 'M', margin: 2, width: 420 })`)
- principal name centred x411 y760, 32 bold, capitals, fitted to 300; title centred x411 y783, 13, capitals
- red note `#E53935` 16 bold at x263, lines at y 856, 874, 892, 910: "Note: This temporary ID pass is issued" / "only to students without an official ID" / "card and expires once the official ID is" / "issued." each of the first three with `textLength` ≤ 305 if needed.

`TempPassSheets({ passes })` renders `.temp-pass-sheet` groups of 9 and a `<style>` with `TEMP_PASS_PRINT_STYLES`: screen — wrapping grid of cards 200px wide; print — `@page { size: A4; margin: 8mm }`, hide `.app-sidebar, .app-topbar, .id-cards-controls, .id-cards-heading`, reset `.app-shell`/`main` exactly as `idCardPrintLayout.js` does, sheet `display:grid; grid-template-columns: repeat(3, 54mm); grid-auto-rows: 85.6mm; gap: 4mm; justify-content:center`, `break-after: page` except last, card `width:54mm; height:85.6mm; outline: 0.2mm dashed #999; print-color-adjust: exact; -webkit-print-color-adjust: exact`.

**Tab** `TempPassesTab({ me, schoolYear, sections, enrollments, students, passes })`:
- Section picker limited to this school year and `passGrades(me)`. Learner table (DepEd order, `depedSort`): checkbox, Name, LRN, status `Badge`, actions (admin only, when pass active: ghost-danger "Revoke" → `Confirm` title "Revoke pass?" message "The QR on this learner's temporary pass will stop working." label "Revoke").
- Summary line "{n} missing a photo". Toggle button "Select all printable"/"Clear selection". Disabled checkbox when not printable.
- Settings from `useDocResource('settings/app')`; if `principalName` or `principalTitle` is blank show "Add the principal's name and title in Settings before printing." and disable preparing.
- "Prepare passes (n)" → `issueTempPasses(ids)` in chunks of 200 → for each issued learner `getStudentPhoto` (4 at a time) and QR data URL; decode every image (logo included) with `new Image()` + `decode()` → render `TempPassSheets` preview and a "Print" button (`window.print()`). Learners skipped by the server or without a loadable photo are listed: "Not prepared: {name} — {reason text}". Changing the section or selection, or a prepared learner's pass ceasing to be active with that code in the live `passes`, discards the preview. A stale asynchronous result (section changed meanwhile) is ignored. Errors show through `ActionFeedback`.
- All controls and the table wear `id-cards-controls` so only sheets print.

`IDCardsPage`: admins see tabs "By section", "Saved batch", "Temporary passes" (key `temp`); `jhs_coord`/`shs_coord` see only "Temporary passes" and must not subscribe to `id_card_batch` or unscoped collections — use `useStaffCollectionResource(path, {me, schoolYear})` for `sections`, `enrollments`, `students`, `temp_passes` on the temp tab (split into an inner component so hooks stay unconditional). `access.js`: coordinator pages for jhs/shs include `'idcards'`; GLC's do not. `staffQueries.js`: `temp_passes` → admin whole collection; others `where('gradeLevel','in',passGrades(me))`, null if empty.

**Settings:** `shape` adds `principalName` and `principalTitle` (trimmed); page adds fields "Principal's name" (placeholder "PAUL O. ORONG") and "Principal's title" (placeholder "Secondary Principal IV") with hint "Printed on temporary ID passes."

- [ ] **Step 1:** Failing tests: `passRowStatus` every row; `fitText` short and long; `chunkSheets(20)` → 9,9,2; card static render contains the name, section line, `LRN: …`, principal, the note's first line, `BNHS ID PASS`, and `textLength` for a 60-character name; tab static render shows the principal warning, "Revoke" for admin only; `access.test.js` updated expectations (jhs includes `idcards`, glc not); `staffQueries` cases; settings shape includes the two fields.
- [ ] **Step 2:** run, expect failure. **Step 3:** implement. **Step 4:** `npx vitest run` and the SIMS build pass.
- [ ] **Step 5:** Commit `feat(sims): print temporary ID passes`.

---

### Task 7: Parent App — adviser photos and guardian view

**Files:**
- Create: `parent/src/lib/photoCanvas.js`, `parent/src/components/PhotoCropper.jsx`, `parent/src/screens/school/PhotosSheet.jsx` + `.css` additions + `PhotosSheet.test.js`, `parent/src/hooks/useStudentPhoto.js`, `parent/src/lib/studentPhoto.js` + `.test.js`
- Modify: `parent/src/screens/school/ClassTab.jsx`, `ClassActions.jsx` + test, `parent/src/strings.js`, `parent/src/screens/History.jsx`, `parent/src/components/PageHeader.jsx`, `parent/src/app.css`

**Interfaces — Consumes:** Task 1 shared geometry; Task 2 callables, roster `canEditPhotos` and row `photoUpdatedAt`.
**Produces:** `parent/src/lib/studentPhoto.js`: `createPhotoCache(fetchPhoto)` → `load(studentId, version) -> Promise<dataUrl | ''>` (same key shares one request; failures are not cached) and `clear()`.

Behaviour:
- `photoCanvas.js` and `PhotoCropper.jsx` behave as specified for SIMS in Task 5 (same copy, taken from `strings.js`), with Parent `Btn` classes. Camera tracks always stopped.
- `ClassActions` gains `onPhotos`: ghost button `S.photosButton` ("Learner photos"). `ClassTab` passes it only when `roster?.canEditPhotos && !ended`; the component still renders when only `onPhotos` is given.
- `PhotosSheet({ rows, onSaved, onClose })` (lazy loaded, uses `Sheet`): list sorted as given, each with name, `S.photoAdded`/`S.photoMissing`, and button `S.photoAdd`/`S.photoReplace`; a count "{n} of {total} have a photo". Picking one shows the current photo (if any), `PhotoCropper`, "Save photo", "Back". Save calls `callable('saveStudentPhotoFn')({studentId, contentBase64})`, shows errors via `schoolError`, then returns to the list and calls `onSaved()` (ClassTab refreshes the roster). Sheet cannot close while saving. While it is open, ClassTab must not reload on focus (add to `sheetOpen.current`).
- `useStudentPhoto(studentId, version)` returns the data URL or `''`; cache cleared on sign-out (call `clear()` where `forgetSchoolContext` is called in `useAuth.js`).
- `History.jsx`: `const version = learner?.photoUpdatedAt?.seconds`; when set, load the photo and pass `avatarSrc` to `PageHeader`; `Mark` renders `<img class="page-header-avatar …" src alt="">` instead of initials when `avatarSrc`. No request when there is no version or the learner read was denied. The Sessions button stays icon-only.
- Strings (exact): `photosButton: 'Learner photos'`, `photosTitle: 'Learner photos'`, `photosHint: 'Used on temporary and official school ID cards.'`, `photoAdded: 'Photo added'`, `photoMissing: 'No photo yet'`, `photoAdd: 'Add photo'`, `photoReplace: 'Replace photo'`, `photoSave: 'Save photo'`, `photoSaving: 'Saving…'`, `photoChooseFile: 'Choose a file'`, `photoUseCamera: 'Use camera'`, `photoCapture: 'Capture'`, `photoCameraUnavailable: 'The camera is not available. Choose a file instead.'`, `photoBadFile: 'That file could not be opened as a picture.'`, `photoCropLabel: 'Photo crop. Drag or use the arrow keys to position.'`, `photoZoom: 'Zoom'`, `photoSaveFailed: 'Could not save the photo. Check your connection and try again.'`. Reuse existing `S.cancel`/`S.back`.

- [ ] **Step 1:** Failing tests: cache (shared request, new version refetches, failure retries, clear); `ClassActions` shows the button only with `onPhotos`; `PhotosSheet` content (export a `PhotosList` for static render, like `Sf2Form`) shows count, statuses and button labels; PageHeader renders an img when `avatarSrc`.
- [ ] **Step 2:** run, expect failure. **Step 3:** implement. **Step 4:** parent tests pass; parent build + `checkSize.mjs` pass (limit 260 KB; sheet and cropper must be in lazy chunks).
- [ ] **Step 5:** Commit `feat(parent): adviser photo upload and guardian photo view`.

---

### Task 8: Kiosk accepts temporary passes (separate repository)

**Repository:** `C:/Users/jitsb/OneDrive - Department of Education/Desktop/APPS/bnhs-student-kiosk`. Work only in a new worktree `.claude/worktrees/temp-id-pass` on branch `claude/temp-id-pass` from `origin/master`; junction its `node_modules` to the main checkout's (PowerShell `New-Item -ItemType Junction`). Do not touch the main checkout's files, do not push, do not deploy.

**Files:** Create `src/lib/tempPass.js` + `.test.js`; modify `src/lib/rosterIndex.js` + test, `src/lib/scanEvent.js` + test, `src/data/attendance.js`, `src/lib/scanErrors.js` + test, `src/App.jsx`.

**Interfaces:**
- `tempPass.js`: `normalizeScan(raw) -> string` (trim; upper-cased only when the upper-case form starts with `BNHS-TP-`), `isTempPassScan(text)` (starts with `BNHS-TP-`), `indexPasses(passes) -> Map<code, pass>` (only `status === 'active'` with a string code), `scanFailure(error, passCode) -> 'passInactive' | 'offline'` — `passInactive` only when `passCode` and (`error.code === 'permission-denied'` or the message contains `temp_pass_inactive`).
- `lookupScan` gains `passByCode`, `studentById`, `passesReady`. Pass scan: `!passesReady` → `{error:'offline'}`; unknown code, other school year, or `studentById` miss → `{error:'passInactive'}`; then the same enrollment checks, returning `{student, enrollment, section, passCode}`. LRN scans are unchanged and never depend on `passesReady`.
- `indexById(students) -> Map`.
- `buildScanEvent({... , passCode})` adds `credential:'temp_pass', passCode` only when `passCode` is given.
- `recordScan({..., passCode})` passes it through; the local duplicate check `matches` also compares `credential` and `passCode` only when the new event has them.
- `SCAN_ERRORS.passInactive`; copy headline `[{text:'Temporary '},{text:'pass',highlight:true},{text:' expired.'}]`, sub `'Please use your official ID.'`.
- `App.jsx`: subscribe `query(collection(db,'temp_passes'), where('status','==','active'), where('schoolYear','==',schoolYear))` with an error callback that leaves `passesReady` false (so kiosks keep working if the rules are not deployed yet); reset readiness when the year changes. Use `normalizeScan`. In the `recordScan` catch and the late-sync failure, use `scanFailure(error, passCode)`; late-sync receives no error object, so have `recordScan` include `reason` in its `'failed'` result (`reason: error?.message`, and `code: error?.code`) and call `scanFailure({message: reason, code}, passCode)`. A scan refused because the pass ended does not count in the "failed to sync" counter.

- [ ] **Step 1:** Failing tests for every contract above, including: an LRN lookup works with `passesReady:false`; `buildScanEvent` without `passCode` yields exactly `SCAN_EVENT_KEYS`.
- [ ] **Step 2:** `npx vitest run` fails. **Step 3:** implement. **Step 4:** `npx vitest run` and `npx vite build` pass (the build may need dummy `VITE_*` values).
- [ ] **Step 5:** Commit in the kiosk repo `feat(kiosk): accept temporary ID passes`.

---

### Task 9: Release notes

**Files:** Create `docs/releases/2026-11-27-temp-id-pass/README.md`.

Contents, as a checklist for the person releasing (nothing is executed):
1. Prerequisites: enable Cloud Storage in the Firebase console for `bnhs-sims` (creates the default bucket); confirm the Functions service account can read and write it.
2. Rules: live Firestore rules differ from root `firestore.rules` history (see earlier deployment records); diff the live ruleset and port only this feature's three rule changes; deploy `storage` rules.
3. Functions by name only, never bare `--only functions`: `saveStudentPhotoFn`, `getStudentPhotoFn`, `issueTempPassFn`, `revokeTempPassFn`, `onStudentWritten`, `onEnrollmentWritten`, `onScanEventCreated` (the live scan handler differs from master — port the pass check onto the live source, see 2026-10-15 PM session record), `getSchoolRosterFn` (from the prepared backend tree, same reason).
4. Kiosk: merge `claude/temp-id-pass`, `npm run deploy` from the kiosk main checkout; reload each kiosk.
5. SIMS: port onto the current release tree; never publish the root build; `Permissions-Policy` must carry `camera=(self)` in the release hosting config; grep the bundle for the reCAPTCHA site key.
6. Parent: `npm run deploy:parent` only; byte-verify.
7. Post-release checks: set the principal's name and title; upload one photo as adviser and view as guardian; print one pass on paper and scan it with the gate scanner (minimum-size check); print the official card for a test learner and confirm the pass is refused.
8. Known limitation from the spec (offline scans synced after a pass ends).

- [ ] Write, then commit `docs: release checklist for temporary ID passes`.
