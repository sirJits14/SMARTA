# School Mode Backend Implementation Plan (Plan A of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Parent app redesign and the SIMS session review the backend they need: coordinator grade authority, a deferred family notification that Undo can cancel, the bell schedule on the class roster, admin-only role assignment with a School access inbox notice, and legacy advisers grouped per teacher.

**Architecture:** All changes are in `functions/` and `shared/`. Family notifications move from the immediate `onAttendanceCorrectionCreated` trigger to a per-learner-session outbox (`attendance_notifications/{studentId}_{date}_{session}`) drained every minute by a new scheduled job. The existing trigger stays deployed and becomes a no-op for new corrections. Coordinator authority is derived from the bound SIMS staff profile (`users/{email}`) inside `loadSchoolActor`, so no separate assignment is needed.

**Tech Stack:** Firebase Functions v2 (Node 22), firebase-admin Firestore, Vitest 4 (unit and emulator suites).

## Global Constraints

- Base branch: `master` **after** PR sirJits14/SMARTA#43 (admin-only approvals) is merged. Start with `git fetch origin && git switch -c <branch> origin/master` and confirm `shared/schoolAccess.js` `canApproveRoleRequest` returns true only for admins.
- Family push text stays exactly: `An attendance update is available for your learner.`
- Undo window: `NOTIFY_DELAY_MS = 120000` (2 minutes).
- Coordinator roles that gain grade review: `jhs_coord`, `shs_coord`, `glc`, using `scopedGrades()` from `shared/staffRoles.js`. Admins keep school-wide access.
- Never edit `functions/src/handlers/scanAttendance.js` (production runs a preserved copy).
- These four strings in `functions/src/handlers/sessionAttendance.js` must stay byte-identical because the release adapter `docs/releases/2026-10-18-school-family/backend-source/adaptSessionAttendance.mjs` replaces them: `function validAttendance(attendance, section, date) {`, the two-line `if (attendance && (attendance.sectionId !== section.id ...` condition, `canReviewSection(actor, { ...section, gradeLevel: attendance.gradeLevel })`, `gradeLevel: attendance?.gradeLevel ?? section.gradeLevel,`.
- No deployment in this plan. Production deploys are by function name only, approved by the user in the deploying session.
- Emulator suites use a demo project. Command template (repo root, Bash):
  `NODE_OPTIONS=--dns-result-order=ipv4first node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --project demo-school-access --only firestore,auth "npm --prefix functions run test:emulator -- <files>"`

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/schoolAccess.js` (modify) | Section review/correct authority, now including `actor.simsGrades`. |
| `shared/schoolAccess.test.js` (modify) | Unit tests for coordinator authority. |
| `functions/src/handlers/schoolAccess.js` (modify) | `loadSchoolActor` adds `simsGrades`; requests retired; context slimmed; grant writes an inbox notice; legacy advisers grouped. |
| `functions/src/lib/attendanceNotice.js` (create) | Pure outbox decision `nextNotice()` and `NOTIFY_DELAY_MS`. |
| `functions/src/lib/attendanceNotice.test.js` (create) | Unit tests for `nextNotice()`. |
| `functions/src/lib/legacyAdvisers.js` (create) | Pure grouping of legacy adviser links per teacher. |
| `functions/src/lib/legacyAdvisers.test.js` (create) | Unit tests for grouping. |
| `functions/src/handlers/sessionAttendance.js` (modify) | Roster returns schedule; corrections write the outbox; `notifyFamilies()` and `sendDueAttendanceUpdates()`. |
| `functions/index.js` (modify) | Export `sendAttendanceUpdatesJob`. |
| `functions/test/emulator/sessionAttendance.test.js` (modify) | Coordinator, schedule and deferred-notification tests. |
| `functions/test/emulator/schoolAccess.test.js` (modify) | Retired requests, slim context, inbox notice, grouped legacy advisers. |

---

### Task 1: Coordinator grade authority

**Files:**
- Modify: `shared/schoolAccess.js` (functions `canReviewSection`, `canCorrectSession`)
- Modify: `functions/src/handlers/schoolAccess.js` (`loadSchoolActor`)
- Test: `shared/schoolAccess.test.js`, `functions/test/emulator/sessionAttendance.test.js`

**Interfaces:**
- Produces: `loadSchoolActor()` result gains `simsGrades: number[]` (grades from the bound coordinator profile; `[]` for admins, families, unbound profiles and ended years). `canReviewSection(actor, section)` and `canCorrectSession(actor, section, date, today)` treat `simsGrades` like Curriculum Adviser grades.

- [ ] **Step 1: Write the failing unit tests**

Append to `shared/schoolAccess.test.js`:

```js
describe('SIMS coordinator grades', () => {
  const coordinator = { uid: 'c1', schoolYear: '2026-2027', isAdmin: false, assignments: [], simsGrades: [7, 8] };
  const g7 = { id: 'S7', gradeLevel: 7, schoolYear: '2026-2027' };
  const g9 = { id: 'S9', gradeLevel: 9, schoolYear: '2026-2027' };
  it('reviews and corrects earlier days within coordinator grades only', () => {
    expect(canReviewSection(coordinator, g7)).toBe(true);
    expect(canCorrectSession(coordinator, g7, '2026-09-20', '2026-09-21')).toBe(true);
    expect(canReviewSection(coordinator, g9)).toBe(false);
    expect(canCorrectSession(coordinator, g7, '2026-09-22', '2026-09-21')).toBe(false);
  });
  it('ignores coordinator grades from another school year', () => {
    expect(canReviewSection(coordinator, { ...g7, schoolYear: '2025-2026' })).toBe(false);
  });
});
```

Make sure `canReviewSection` and `canCorrectSession` are in the file's import line from `./schoolAccess.js`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run shared/schoolAccess.test.js`
Expected: FAIL in "SIMS coordinator grades" (`canReviewSection` returns false for `g7`).

- [ ] **Step 3: Implement shared authority**

In `shared/schoolAccess.js`, replace `canReviewSection` and `canCorrectSession` with:

```js
// Curriculum Adviser assignments and SIMS coordinator scopes both grant
// grade-wide review; class advisers only reach their own section.
const reviewGrades = actor => [
  ...currentAssignments(actor).filter(a => a.role === 'curriculum_adviser').map(a => a.gradeLevel),
  ...(Array.isArray(actor?.simsGrades) ? actor.simsGrades : []),
];

export function canReviewSection(actor, section) {
  if (!actor || !section || section.schoolYear !== actor.schoolYear) return false;
  return actor.isAdmin === true || reviewGrades(actor).includes(section.gradeLevel)
    || currentAssignments(actor).some(a => a.role === 'adviser' && a.sectionId === section.id && a.gradeLevel === section.gradeLevel);
}
export function canCorrectSession(actor, section, date, today) {
  if (!canReviewSection(actor, section) || !date || date > today) return false;
  return actor.isAdmin === true || date === today || reviewGrades(actor).includes(section.gradeLevel);
}
```

- [ ] **Step 4: Run unit tests**

Run: `npx vitest run shared/schoolAccess.test.js`
Expected: PASS (all tests, including the earlier ones).

- [ ] **Step 5: Write the failing emulator test**

Append inside `describe('session corrections', ...)` in `functions/test/emulator/sessionAttendance.test.js`:

```js
  it('lets SIMS coordinators review and correct earlier days within their grades only', async () => {
    await auth().createUser({ uid: 'glc7', email: 'glc7@example.com' });
    await db().doc('users/glc7@example.com').set({ uid: 'glc7', role: 'glc', gradeLevel: 7 });
    await auth().createUser({ uid: 'glc8', email: 'glc8@example.com' });
    await db().doc('users/glc8@example.com').set({ uid: 'glc8', role: 'glc', gradeLevel: 8 });
    expect((await getSchoolRoster(deps('glc7'), { sectionId: 'SEC1', date: '2026-09-20' })).canCorrect).toBe(true);
    await setSessionAbsence(deps('glc7'), input({ date: '2026-09-20' }));
    await expect(getSchoolRoster(deps('glc8'), { sectionId: 'SEC1', date: '2026-09-21' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
```

- [ ] **Step 6: Run to verify failure**

Run (template above) with `test/emulator/sessionAttendance.test.js`.
Expected: the new test FAILS with `permission-denied` for `glc7`.

- [ ] **Step 7: Implement `simsGrades` in `loadSchoolActor`**

In `functions/src/handlers/schoolAccess.js`, change the staff-roles import to:

```js
import { roleOf, scopedGrades } from '../../shared/staffRoles.js';
```

Replace the final `return { uid, email: ... }` of `loadSchoolActor` with:

```js
  const role = bound ? roleOf(profile) : null;
  // SIMS coordinators review their grades' sessions without a separate school assignment.
  const simsGrades = !ended && role && role !== 'admin' ? (scopedGrades(profile) || []) : [];
  return { uid, email: email.toLowerCase(), displayName: deps.displayName || account.data()?.displayName || profile?.name || email,
    isAdmin: role === 'admin', schoolYear, ended: Boolean(ended), assignments, simsGrades };
```

(`isAdmin: role === 'admin'` is equivalent to the old `Boolean(bound && roleOf(profile) === 'admin')`.)

- [ ] **Step 8: Run both suites**

Run: `npx vitest run shared/schoolAccess.test.js` → PASS.
Run the emulator template with `test/emulator/sessionAttendance.test.js test/emulator/schoolAccess.test.js` → PASS.

- [ ] **Step 9: Commit**

```bash
git add shared/schoolAccess.js shared/schoolAccess.test.js functions/src/handlers/schoolAccess.js functions/test/emulator/sessionAttendance.test.js
git commit -m "Let SIMS coordinators review session attendance in their grades"
```

---

### Task 2: Bell schedule on the class roster

**Files:**
- Modify: `functions/src/handlers/sessionAttendance.js` (`getSchoolRoster`)
- Test: `functions/test/emulator/sessionAttendance.test.js`

**Interfaces:**
- Produces: `getSchoolRoster()` result gains `schedule: { timeIn, timeOut, pmTimeIn, pmTimeOut } | null` (zero-padded `HH:MM` strings or `null` per field). Plan B uses it to choose AM or PM.

- [ ] **Step 1: Write the failing test**

Append inside `describe('session corrections', ...)`:

```js
  it('returns the section bell schedule with the roster', async () => {
    await db().doc('schedules/SPLIT').set({ timeIn: '07:30', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:30', name: 'Split' });
    await db().doc('sections/SEC1').update({ scheduleId: 'SPLIT' });
    expect((await getSchoolRoster(deps(), { sectionId: 'SEC1', date: '2026-09-21' })).schedule)
      .toEqual({ timeIn: '07:30', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:30' });
    await db().doc('sections/SEC1').update({ scheduleId: 'MISSING' });
    expect((await getSchoolRoster(deps(), { sectionId: 'SEC1', date: '2026-09-21' })).schedule).toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

Run the emulator template with `test/emulator/sessionAttendance.test.js`.
Expected: FAIL, `schedule` is `undefined`.

- [ ] **Step 3: Implement**

In `functions/src/handlers/sessionAttendance.js`, add below `const nowDate = ...`:

```js
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
// Only the bell times leave the server; clients pick AM or PM from them.
const bellTimes = (schedule) => schedule ? Object.fromEntries(['timeIn', 'timeOut', 'pmTimeIn', 'pmTimeOut']
  .map(key => [key, HHMM.test(schedule[key] || '') ? schedule[key] : null])) : null;
```

In `getSchoolRoster`, change the `Promise.all` and return to:

```js
    const [enrollments, snap, scheduleSnap] = await Promise.all([
      tx.get(deps.db.collection('enrollments').where('sectionId', '==', section.id).where('schoolYear', '==', section.schoolYear).where('status', '==', 'enrolled')),
      tx.get(deps.db.doc(`student_attendance/${section.id}_${input.date}`)),
      identifier(section.scheduleId) ? tx.get(deps.db.doc(`schedules/${section.scheduleId}`)) : null,
    ]);
```

and

```js
    return { section, date: input.date, rows, canCorrect, schedule: bellTimes(scheduleSnap?.data()) };
```

- [ ] **Step 4: Run tests**

Run the emulator template with `test/emulator/sessionAttendance.test.js`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/sessionAttendance.js functions/test/emulator/sessionAttendance.test.js
git commit -m "Return the bell schedule with the class roster"
```

---

### Task 3: Deferred family notification with undo

**Files:**
- Create: `functions/src/lib/attendanceNotice.js`, `functions/src/lib/attendanceNotice.test.js`
- Modify: `functions/src/handlers/sessionAttendance.js` (`setSessionAbsence`, `handleAttendanceCorrection`, new `notifyFamilies`, new `sendDueAttendanceUpdates`)
- Modify: `functions/index.js`
- Test: `functions/test/emulator/sessionAttendance.test.js`

**Interfaces:**
- Produces: `NOTIFY_DELAY_MS` (number) and `nextNotice(existing, { previousAbsent, absent }) → { status: 'pending' | 'cancelled', baselineAbsent: boolean }` in `functions/src/lib/attendanceNotice.js`. `sendDueAttendanceUpdates(deps) → { processed: number }` in `sessionAttendance.js`. Scheduled export `sendAttendanceUpdatesJob`.
- Outbox doc `attendance_notifications/{studentId}_{date}_{session}`: `{ studentId, sectionId, schoolYear, date, session, absent, revision, learnerName, correctionId, status, baselineAbsent, notifyAfter (Timestamp), updatedAt }`. Status moves `pending → sending → done`, or `pending → cancelled`.

- [ ] **Step 1: Write the failing unit test**

Create `functions/src/lib/attendanceNotice.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { nextNotice, NOTIFY_DELAY_MS } from './attendanceNotice.js';

describe('nextNotice', () => {
  it('waits two minutes before telling families', () => {
    expect(NOTIFY_DELAY_MS).toBe(120000);
  });
  it('queues a first flag against the state families already saw', () => {
    expect(nextNotice(undefined, { previousAbsent: false, absent: true })).toEqual({ status: 'pending', baselineAbsent: false });
  });
  it('cancels a flag undone before it was sent', () => {
    const queued = { status: 'pending', baselineAbsent: false, absent: true };
    expect(nextNotice(queued, { previousAbsent: true, absent: false })).toEqual({ status: 'cancelled', baselineAbsent: false });
  });
  it('queues a reversal after the earlier update was sent', () => {
    const sent = { status: 'done', baselineAbsent: false, absent: true };
    expect(nextNotice(sent, { previousAbsent: true, absent: false })).toEqual({ status: 'pending', baselineAbsent: true });
  });
  it('treats an update being sent as already seen', () => {
    const sending = { status: 'sending', baselineAbsent: false, absent: true };
    expect(nextNotice(sending, { previousAbsent: true, absent: false })).toEqual({ status: 'pending', baselineAbsent: true });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix functions test -- src/lib/attendanceNotice.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the pure decision**

Create `functions/src/lib/attendanceNotice.js`:

```js
// Families get one neutral update per settled change. An update still
// waiting to be sent keeps the state families last saw as its baseline, so
// flagging and then undoing inside the window sends nothing at all.
export const NOTIFY_DELAY_MS = 120000;

export function nextNotice(existing, { previousAbsent, absent }) {
  const baselineAbsent = existing?.status === 'pending' ? existing.baselineAbsent === true : previousAbsent === true;
  return { status: absent === baselineAbsent ? 'cancelled' : 'pending', baselineAbsent };
}
```

- [ ] **Step 4: Run unit test**

Run: `npm --prefix functions test -- src/lib/attendanceNotice.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing emulator tests**

In `functions/test/emulator/sessionAttendance.test.js`, change the handler import line to:

```js
import { getSchoolRoster, setSessionAbsence, getFamilyAttendance, handleAttendanceCorrection, sendDueAttendanceUpdates } from '../../src/handlers/sessionAttendance.js';
```

Replace the whole test `it('only active current-year family links can read correction details and receive neutral notifications once', ...)` with:

```js
  it('only active current-year family links get one neutral notification after the undo window', async () => {
    let clock = now();
    const d = { ...deps(), now: () => clock };
    await setSessionAbsence(d, input());
    const out = (await db().collection('attendance_corrections').get()).docs[0];
    expect((await handleAttendanceCorrection(d, { id: out.id, data: out.data() })).outcome).toBe('duplicate');
    await sendDueAttendanceUpdates(d);
    expect(d.messaging.sent).toHaveLength(0);
    clock = new Date(now().getTime() + 121000);
    await sendDueAttendanceUpdates(d);
    await sendDueAttendanceUpdates(d);
    expect(d.messaging.sent).toHaveLength(1);
    expect(d.messaging.sent[0].notification.body).toBe('An attendance update is available for your learner.');
    expect((await db().collection('guardians/gA/inbox').get()).size).toBe(1);
    expect((await db().collection('guardians/gC/inbox').get()).size).toBe(0);
    expect(await getFamilyAttendance(deps('gA'), { studentId: 'S1', date: '2026-09-21' })).toMatchObject({ am: { status: 'A', reason: 'Left class after arrival' } });
    await db().doc('guardian_links/gA_S1').update({ relationship: 'Adviser' });
    await expect(getFamilyAttendance(deps('gA'), { studentId: 'S1', date: '2026-09-21' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('sends nothing when a flag is undone inside the window', async () => {
    let clock = now();
    const d = { ...deps(), now: () => clock };
    await setSessionAbsence(d, input());
    clock = new Date(now().getTime() + 30000);
    await setSessionAbsence(d, input({ absent: false, expectedRevision: 1, operationId: 'undo1', reason: 'Undone right after flagging' }));
    clock = new Date(now().getTime() + 300000);
    await sendDueAttendanceUpdates(d);
    expect(d.messaging.sent).toHaveLength(0);
    expect((await db().collection('guardians/gA/inbox').get()).size).toBe(0);
    expect((await db().doc('attendance_notifications/S1_2026-09-21_am').get()).data().status).toBe('cancelled');
  });
  it('sends a second update when a sent flag is reversed later', async () => {
    let clock = now();
    const d = { ...deps(), now: () => clock };
    await setSessionAbsence(d, input());
    clock = new Date(now().getTime() + 121000);
    await sendDueAttendanceUpdates(d);
    await setSessionAbsence(d, input({ absent: false, expectedRevision: 1, operationId: 'restore1', reason: 'Was in class' }));
    clock = new Date(now().getTime() + 242000);
    await sendDueAttendanceUpdates(d);
    expect(d.messaging.sent).toHaveLength(2);
    expect((await db().collection('guardians/gA/inbox').get()).size).toBe(2);
  });
  it('still notifies corrections created before the outbox existed', async () => {
    const d = deps();
    await db().doc('attendance_corrections/legacy1').set({ studentId: 'S1', schoolYear: '2026-2027', date: '2026-09-21', session: 'am',
      absent: true, revision: 1, learnerName: 'Cruz, Ana', status: 'pending' });
    await handleAttendanceCorrection(d, { id: 'legacy1' });
    expect(d.messaging.sent).toHaveLength(1);
  });
```

- [ ] **Step 6: Run to verify failure**

Run the emulator template with `test/emulator/sessionAttendance.test.js`.
Expected: FAIL. `sendDueAttendanceUpdates` is not exported, and the first test sends immediately.

- [ ] **Step 7: Implement the outbox write in `setSessionAbsence`**

At the top of `functions/src/handlers/sessionAttendance.js`, add:

```js
import { nextNotice, NOTIFY_DELAY_MS } from '../lib/attendanceNotice.js';
```

Inside `setSessionAbsence`'s transaction, replace the four-read `Promise.all` with:

```js
    const noticeRef = deps.db.doc(`attendance_notifications/${studentId}_${date}_${session}`);
    const [operation, snap, enrollment, student, notice] = await Promise.all([
      tx.get(operationRef), tx.get(attendanceRef), tx.get(deps.db.doc(`enrollments/${studentId}_${section.schoolYear}`)), tx.get(deps.db.doc(`students/${studentId}`)),
      tx.get(noticeRef),
    ]);
```

Replace the final `tx.create(operationRef, ...)` line with:

```js
    const learnerName = fullName(student.data());
    tx.set(noticeRef, { studentId, sectionId, schoolYear: section.schoolYear, date, session, absent, revision: override.revision, learnerName,
      correctionId: id, ...nextNotice(notice.data(), { previousAbsent: current[session]?.absent === true, absent }),
      notifyAfter: Timestamp.fromMillis(changedAt.toMillis() + NOTIFY_DELAY_MS), updatedAt: FieldValue.serverTimestamp() });
    // Families hear about it from the outbox after the undo window, not from this record.
    tx.create(operationRef, { ...audit, fingerprint, result, learnerName, status: 'done', deferred: true });
```

- [ ] **Step 8: Split the recipient loop out and add the sweep**

Replace the whole `handleAttendanceCorrection` function (and its leading comment) with:

```js
// Per-recipient claims are at most once: the inbox item is created in the
// same transaction that decides to push, so a retry never pushes twice.
async function notifyFamilies(deps, data, inboxId) {
  const links = await deps.db.collection('guardian_links').where('studentId', '==', data.studentId).where('status', '==', 'active').get();
  const recipients = new Map(links.docs.filter(l => activeFamily(l.data(), l.data().guardianUid, data.studentId, data.schoolYear)).map(l => [l.data().guardianUid, l]));
  for (const [uid, link] of recipients) {
    const inboxRef = deps.db.doc(`guardians/${uid}/inbox/${inboxId}`);
    const claim = await deps.db.runTransaction(async tx => {
      const [existing, liveLink, settings, portal, guardian, enrollment, devices] = await Promise.all([
        tx.get(inboxRef), tx.get(link.ref), tx.get(deps.db.doc('settings/app')), tx.get(deps.db.doc('settings/parent_portal')),
        tx.get(deps.db.doc(`guardians/${uid}`)), tx.get(deps.db.doc(`enrollments/${data.studentId}_${data.schoolYear}`)),
        tx.get(deps.db.collection(`guardians/${uid}/devices`).where('enabled', '==', true)),
      ]);
      if (existing.exists || settings.data()?.currentSchoolYear !== data.schoolYear || enrollment.data()?.status !== 'enrolled'
          || !activeFamily(liveLink.data(), uid, data.studentId, data.schoolYear)) return null;
      const pushStatus = portal.data()?.notificationsPaused === true ? 'skipped_paused'
        : guardian.data()?.notificationsEnabled === false ? 'skipped_disabled'
          : !devices.size ? 'skipped_no_device' : 'sending';
      tx.create(inboxRef, { type: 'attendance_correction', studentId: data.studentId, learnerName: data.learnerName,
        date: data.date, scannedDate: data.date, session: data.session, absent: data.absent, revision: data.revision,
        title: 'Attendance updated', body: 'School staff updated a session attendance record. Open the learner history to review.',
        createdAt: FieldValue.serverTimestamp(), pushStatus });
      return pushStatus === 'sending' ? devices.docs : null;
    });
    if (claim) {
      const result = await sendToGuardian(deps, { inboxId, studentId: data.studentId, devDocs: claim, correction: true });
      await inboxRef.update({ pushStatus: result.status, pushSentAt: FieldValue.serverTimestamp() });
    }
  }
}

// Corrections made before the outbox existed still notify from this trigger.
// New corrections are created already done and are sent by the sweep below.
export async function handleAttendanceCorrection(deps, { id }) {
  const ref = deps.db.doc(`attendance_corrections/${id}`);
  const data = (await ref.get()).data();
  if (!data || data.status === 'done') return { outcome: 'duplicate' };
  await notifyFamilies(deps, data, `correction_${id}`);
  await ref.update({ status: 'done', completedAt: FieldValue.serverTimestamp() });
  return { outcome: 'processed' };
}

// Runs every minute. 'sending' is retried because inbox claims are idempotent.
export async function sendDueAttendanceUpdates(deps) {
  const now = (deps.now || (() => new Date()))().getTime();
  const due = await deps.db.collection('attendance_notifications').where('status', 'in', ['pending', 'sending']).limit(200).get();
  let processed = 0;
  for (const doc of due.docs) {
    const claimed = await deps.db.runTransaction(async tx => {
      const live = (await tx.get(doc.ref)).data();
      if (!live || !['pending', 'sending'].includes(live.status) || live.notifyAfter.toMillis() > now) return null;
      tx.update(doc.ref, { status: 'sending', claimedAt: FieldValue.serverTimestamp() });
      return live;
    });
    if (!claimed) continue;
    await notifyFamilies(deps, claimed, `correction_${claimed.correctionId}`);
    await deps.db.runTransaction(async tx => {
      const live = (await tx.get(doc.ref)).data();
      // A newer correction may have re-queued this session while we were sending.
      if (live?.status === 'sending' && live.correctionId === claimed.correctionId) tx.update(doc.ref, { status: 'done', completedAt: FieldValue.serverTimestamp() });
    });
    processed++;
  }
  return { processed };
}
```

- [ ] **Step 9: Export the scheduled job**

In `functions/index.js`, change the session attendance import to:

```js
import { getSchoolRoster, setSessionAbsence, getFamilyAttendance, handleAttendanceCorrection, sendDueAttendanceUpdates } from './src/handlers/sessionAttendance.js';
```

and add below `publishAnnouncementsJob`:

```js
export const sendAttendanceUpdatesJob = onSchedule({ schedule: '* * * * *', ...SCHED }, () => sendDueAttendanceUpdates(jobDeps()));
```

- [ ] **Step 10: Run all affected suites**

Run: `npm --prefix functions test` → PASS.
Run the emulator template with `test/emulator/sessionAttendance.test.js test/emulator/scanAttendance.test.js` → PASS.
Run: `node -e "import('./docs/releases/2026-10-18-school-family/backend-source/adaptSessionAttendance.mjs').then(m=>{m.adaptSessionAttendance(require('fs').readFileSync('functions/src/handlers/sessionAttendance.js','utf8').replace(/\r\n/g,'\n'));console.log('adapter ok')})"`
Expected: `adapter ok`.

- [ ] **Step 11: Commit**

```bash
git add functions/src/lib/attendanceNotice.js functions/src/lib/attendanceNotice.test.js functions/src/handlers/sessionAttendance.js functions/index.js functions/test/emulator/sessionAttendance.test.js
git commit -m "Hold family attendance updates for a two-minute undo window"
```

---

### Task 4: Admin-only school roles, inbox notice, grouped legacy advisers

**Files:**
- Create: `functions/src/lib/legacyAdvisers.js`, `functions/src/lib/legacyAdvisers.test.js`
- Modify: `functions/src/handlers/schoolAccess.js` (`requestSchoolRole`, `writeGrant`, `getSchoolContext`)
- Test: `functions/test/emulator/schoolAccess.test.js`

**Interfaces:**
- Produces: `groupLegacyAdvisers(links, sectionByStudent) → Array<{ guardianUid, email, name, learnerCount, suggestedSectionId: string | null }>` and `sampleStudentIds(links) → string[]`.
- `getSchoolContext()` result: `{ schoolYear, ended, isAdmin, assignments, sections }` for everyone; admins also get `managedAssignments`, `migrationCandidates` (unchanged, kept until Plan C ships) and `legacyAdvisers`. `requests` and `reviewRequests` are removed.
- `requestSchoolRole()` always fails `permission-denied` with `An administrator assigns school roles in SIMS.`
- A grant creates `guardians/{uid}/inbox/school_<32 hex>`: `{ type: 'school_access', title: 'School access approved', body: 'You can now use the app for school work. Switch to School in Settings.', createdAt }`. Plan B routes this inbox type to `/settings`.

- [ ] **Step 1: Write the failing unit test**

Create `functions/src/lib/legacyAdvisers.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { groupLegacyAdvisers, sampleStudentIds } from './legacyAdvisers.js';

const link = (guardianUid, studentId, extra = {}) => ({ guardianUid, studentId, guardianEmail: `${guardianUid}@x.ph`, guardianName: guardianUid.toUpperCase(), ...extra });

describe('legacy adviser grouping', () => {
  it('groups links per teacher and suggests the most common section', () => {
    const links = [link('t1', 'a'), link('t1', 'b'), link('t1', 'c'), link('t2', 'd')];
    expect(groupLegacyAdvisers(links, { a: 'MABINI', b: 'MABINI', c: 'RIZAL', d: 'LUNA' })).toEqual([
      { guardianUid: 't1', email: 't1@x.ph', name: 'T1', learnerCount: 3, suggestedSectionId: 'MABINI' },
      { guardianUid: 't2', email: 't2@x.ph', name: 'T2', learnerCount: 1, suggestedSectionId: 'LUNA' },
    ]);
  });
  it('samples at most five learners per teacher and tolerates unknown sections', () => {
    const links = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => link('t1', id));
    expect(sampleStudentIds(links)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(groupLegacyAdvisers(links, {})[0]).toMatchObject({ learnerCount: 7, suggestedSectionId: null });
  });
  it('skips links without an account', () => {
    expect(groupLegacyAdvisers([{ studentId: 'a' }], {})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix functions test -- src/lib/legacyAdvisers.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement grouping**

Create `functions/src/lib/legacyAdvisers.js`:

```js
// One row per legacy adviser account, so an administrator verifies each
// teacher once rather than once per learner. The suggestion is the most
// common current section among a small sample of that teacher's learners.
export const SAMPLE = 5;

function byTeacher(links) {
  const groups = new Map();
  for (const link of links) {
    if (!link?.guardianUid) continue;
    const group = groups.get(link.guardianUid) || { guardianUid: link.guardianUid, email: link.guardianEmail || '', name: link.guardianName || '', studentIds: [] };
    group.studentIds.push(link.studentId);
    groups.set(link.guardianUid, group);
  }
  return [...groups.values()];
}

export const sampleStudentIds = links => [...new Set(byTeacher(links).flatMap(g => g.studentIds.slice(0, SAMPLE)))];

export function groupLegacyAdvisers(links, sectionByStudent = {}) {
  return byTeacher(links).map(group => {
    const counts = new Map();
    for (const id of group.studentIds.slice(0, SAMPLE)) {
      const sectionId = sectionByStudent[id];
      if (sectionId) counts.set(sectionId, (counts.get(sectionId) || 0) + 1);
    }
    const suggestedSectionId = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
    return { guardianUid: group.guardianUid, email: group.email, name: group.name, learnerCount: group.studentIds.length, suggestedSectionId };
  }).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
}
```

- [ ] **Step 4: Run unit test**

Run: `npm --prefix functions test -- src/lib/legacyAdvisers.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing emulator tests**

Open `functions/test/emulator/schoolAccess.test.js`. It uses a fake `auth` object with `users.teacher` (`teacher@deped.gov.ph`), `users.personal`, `users.curriculum` and `users.admin`, plus `deps(uid)`. Sections `SEC1` (grade 7) and `SEC8` (grade 8) are seeded.

1. Below `const deps = ...`, add a helper that seeds a pending request directly. `requestSchoolRole` can no longer create one.

```js
const seedRequest = async (uid, role, sectionId) => {
  const id = `${uid}_${role}_${sectionId}`;
  const gradeLevel = sectionId === 'SEC8' ? 8 : 7;
  await db().doc(`school_role_requests/${id}`).set({ uid, email: users[uid].email, emailVerified: true, displayName: uid,
    role, schoolYear: year, sectionId, gradeLevel, status: 'pending', createdAt: new Date() });
  return { id };
};
```

2. In every remaining test, replace `await requestSchoolRole(deps('<uid>'), { role: '<role>', sectionId: '<id>' ... })` with `await seedRequest('<uid>', '<role>', '<id>')`.
3. In `does not allow self-approval or client-supplied email proof`, delete the two lines that create request `p` and check its email (request creation no longer exists).
4. In `removes old-year access and refuses ended-year changes`, change the `requestSchoolRole(...)` expectation to `.rejects.toMatchObject({ code: 'permission-denied' })`.
5. Delete the test `returns only scoped approvable requests to curriculum advisers` (`reviewRequests` no longer exists).
6. Append these tests inside `describe('school request lifecycle', ...)`:

```js
  it('retires in-app role requests', async () => {
    await expect(requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC1' }))
      .rejects.toMatchObject({ code: 'permission-denied', message: 'An administrator assigns school roles in SIMS.' });
  });
  it('tells a newly assigned teacher where to switch to School', async () => {
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1' });
    const inbox = (await db().collection('guardians/teacher/inbox').get()).docs.map(d => d.data());
    expect(inbox).toEqual([expect.objectContaining({ type: 'school_access', title: 'School access approved',
      body: 'You can now use the app for school work. Switch to School in Settings.' })]);
  });
  it('omits request queues and groups legacy advisers for administrators', async () => {
    await db().doc('guardian_links/tLegacy_S1').set({ guardianUid: 'tLegacy', guardianEmail: 'legacy@example.com', guardianName: 'Legacy Teacher',
      studentId: 'S1', status: 'active', schoolYear: '2026-2027', slot: 'adviser', relationship: 'Adviser' });
    const context = await getSchoolContext(deps('admin'));
    expect(context).not.toHaveProperty('requests');
    expect(context).not.toHaveProperty('reviewRequests');
    expect(context.legacyAdvisers).toEqual([{ guardianUid: 'tLegacy', email: 'legacy@example.com', name: 'Legacy Teacher', learnerCount: 1, suggestedSectionId: 'SEC1' }]);
    expect((await getSchoolContext(deps('teacher')))).not.toHaveProperty('legacyAdvisers');
  });
```

- [ ] **Step 6: Run to verify failure**

Run the emulator template with `test/emulator/schoolAccess.test.js`.
Expected: the three new tests FAIL.

- [ ] **Step 7: Implement**

In `functions/src/handlers/schoolAccess.js`:

1. Add the import:

```js
import { groupLegacyAdvisers, sampleStudentIds } from '../lib/legacyAdvisers.js';
```

2. Replace the entire `requestSchoolRole` function with:

```js
// School roles are assigned by an administrator in SIMS; the app no longer asks.
export async function requestSchoolRole() {
  fail('permission-denied', 'An administrator assigns school roles in SIMS.');
}
```

3. Delete `requestKey` and the `enforceRateLimit` import, since nothing else uses them. Keep `fingerprint` and `createHash`, which step 4 uses.

4. In `writeGrant`, after the `tx.set(prepared.accountRef, ...)` line, add:

```js
  tx.set(prepared.accountRef.firestore.doc(`guardians/${user.uid}/inbox/school_${fingerprint(assignmentKey(assignment)).slice(0, 32)}`), {
    type: 'school_access', title: 'School access approved',
    body: 'You can now use the app for school work. Switch to School in Settings.', createdAt: FieldValue.serverTimestamp() });
```

5. Replace the whole `getSchoolContext` function with:

```js
export async function getSchoolContext(deps) {
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    const sections = await tx.get(deps.db.collection('sections').where('schoolYear', '==', actor.schoolYear));
    const result = { schoolYear: actor.schoolYear, ended: actor.ended, isAdmin: actor.isAdmin, assignments: actor.assignments,
      sections: sections.docs.map(s => ({ id: s.id, name: s.data().name || '', gradeLevel: s.data().gradeLevel, schoolYear: s.data().schoolYear }))
        .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)) };
    if (actor.isAdmin) {
      const [accounts, legacy] = await Promise.all([
        tx.get(deps.db.collection('school_accounts')),
        tx.get(deps.db.collection('guardian_links').where('status', '==', 'active')),
      ]);
      result.managedAssignments = accounts.docs.flatMap(s => (s.data().assignments || []).filter(a => a.schoolYear === actor.schoolYear)
        .map(a => ({ uid: s.id, email: s.data().email || '', displayName: s.data().displayName || '', ...a })));
      const candidates = legacy.docs.map(row).filter(l => l.schoolYear === actor.schoolYear && (l.slot === 'adviser' || l.relationship === 'Adviser'));
      result.migrationCandidates = candidates;
      const enrollments = await Promise.all(sampleStudentIds(candidates).map(id => tx.get(deps.db.doc(`enrollments/${id}_${actor.schoolYear}`))));
      const sectionByStudent = Object.fromEntries(enrollments.filter(s => s.data()?.status === 'enrolled').map(s => [s.data().studentId, s.data().sectionId]));
      result.legacyAdvisers = groupLegacyAdvisers(candidates, sectionByStudent);
    }
    return result;
  });
}
```

`canApproveRoleRequest` may now be unused in this file except by `resolveSchoolRole`. Keep `resolveSchoolRole` and its import unchanged.

- [ ] **Step 8: Run tests**

Run: `npm --prefix functions test` → PASS.
Run the emulator template with `test/emulator/schoolAccess.test.js test/emulator/sessionAttendance.test.js` → PASS.

- [ ] **Step 9: Commit**

```bash
git add functions/src/lib/legacyAdvisers.js functions/src/lib/legacyAdvisers.test.js functions/src/handlers/schoolAccess.js functions/test/emulator/schoolAccess.test.js
git commit -m "Assign school roles only in SIMS and group legacy advisers per teacher"
```

---

### Task 5: Full verification and release note

**Files:**
- Modify: `docs/school-family-access-rollout.md`

- [ ] **Step 1: Run every suite**

```bash
npx vitest run
npm --prefix functions test
NODE_OPTIONS=--dns-result-order=ipv4first node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --project demo-school-access --only firestore,auth "npm --prefix functions run test:emulator"
```

Expected: all PASS. If a suite unrelated to these files fails, compare with `origin/master` before changing anything.

- [ ] **Step 2: Update the rollout doc**

In `docs/school-family-access-rollout.md`, replace the paragraph that begins `Administrators manage assignments under` with:

```markdown
Administrators assign school roles directly under **Guardians → School access** in SIMS, using the teacher's verified app account email. Teachers no longer request roles in the parent app; the assignment adds an inbox note telling them to switch to School in Settings. SIMS JHS/SHS Academic Coordinators and Grade Level Coordinators review and correct session attendance for their grades in SIMS, with the same authority as a Curriculum Adviser.
```

and add under **Attendance behavior**:

```markdown
Family notifications wait two minutes after a correction. Undoing a flag inside that window sends nothing; a later reversal sends a second neutral update. A scheduled job (`sendAttendanceUpdatesJob`, every minute) drains the `attendance_notifications` outbox.
```

- [ ] **Step 3: Commit**

```bash
git add docs/school-family-access-rollout.md
git commit -m "Document SIMS-only role assignment and the notification undo window"
```

**Release (not part of this plan; needs the user's approval):** the by-name functions list for this plan is `getSchoolContextFn`, `requestSchoolRoleFn`, `assignSchoolRoleFn`, `getSchoolRosterFn`, `setSessionAbsenceFn`, `onAttendanceCorrectionCreated`, `sendAttendanceUpdatesJob`. Prepare it with `docs/releases/2026-10-18-school-family/prepareBackend.mjs` after adding `sendAttendanceUpdatesJob` to its `functionsToDeploy`. Never run a bare `--only functions` from master.
