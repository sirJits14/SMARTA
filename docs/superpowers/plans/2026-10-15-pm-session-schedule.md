# Optional PM Session on Schedules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a schedule optionally carry a PM arrival and PM departure (for split-day Grade 12 sections such as 8:00–12:00 and 13:00–16:00). Kiosk taps go into the morning or afternoon session; afternoon taps are stored separately, and "Late PM" / "Absent AM" notes are shown in SIMS and the parent app.

**Architecture:** One pure module, `shared/scheduleSessions.js`, holds the session rules: the split time, which session a tap belongs to, and the notes. SIMS, the parent app and Cloud Functions all import it; functions get it through the existing `scripts/syncShared.mjs` copy. The scan backend writes `pmTimeIn` / `pmTimeOut` / `latePm` / `absentAm` maps next to the existing `timeIn` / `timeOut` on `student_attendance` docs. The parent summary adds `today.notes`. The UI only reads these fields, and treats a missing field as "no PM data".

**Tech Stack:** React 18 + Vite (SIMS root, `parent/`), Firebase Firestore, Cloud Functions v2 (Node 22, `functions/`), Vitest 4, Firebase emulators for `functions/test/emulator`.

**Spec:** `docs/superpowers/specs/2026-10-15-pm-session-schedule-design.md`

## Global Constraints

- Times are zero-padded 24-hour `"HH:MM"` strings and are compared as strings. This is the existing convention for `schedules.timeIn` and kiosk `scannedTime`.
- A schedule has a PM session only when `timeOut`, `pmTimeIn` and `pmTimeOut` are all valid `HH:MM`. Anything else is treated as a single session, exactly as today.
- The split between sessions is the midpoint of AM departure and PM arrival, rounded down to the minute. A tap at or after the split is PM.
- Notes never change P/L/A marks, totals, or the SF2 export. The day mark stays as it is today: it is set only on the first tap-in of the day, and only if the mark is missing or `A`.
- A missing afternoon tap-in is never flagged. There is no "Absent PM".
- Note labels are exactly `Absent AM` and `Late PM`, in that order. Internal keys are `absentAm` and `latePm`.
- Sections whose schedule has no PM session must behave exactly as before. Existing tests must keep passing unchanged, except for the one `toEqual` noted in Task 3.
- Do not change the kiosk repo, push wording, or Firestore rules.
- **Never deploy as part of this plan.** Deploying needs the user's explicit go-ahead and follows the release-tree / by-name procedure in the spec's Rollout section.
- This worktree has no `node_modules` in the root or in `parent/`. Task 1 installs them.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File map

| File | Status | Responsibility |
|---|---|---|
| `shared/scheduleSessions.js` | create | Pure session rules: `hasPmSession`, `sessionSplit`, `sessionOf`, `sessionNotes` |
| `shared/scheduleSessions.test.js` | create | Unit tests for the above |
| `functions/src/handlers/scanAttendance.js` | modify | Route each tap to AM/PM fields; set the `absentAm` / `latePm` maps |
| `functions/test/emulator/scanAttendance.test.js` | modify | Emulator tests for split-day scans |
| `functions/src/lib/recomputeSummary.js` | modify | Add `today.notes` |
| `functions/src/lib/recomputeSummary.test.js` | modify | Tests for notes |
| `functions/src/handlers/scanEvent.js` | modify | Load the section's schedule and pass it to `recomputeSummary` |
| `functions/test/emulator/scanEvent.test.js` | modify | Emulator test that the learner summary carries notes |
| `src/lib/schedules.js` | create | `validateSchedule(form)` |
| `src/lib/schedules.test.js` | create | Validation tests |
| `src/data/schedules.js` | modify | Persist or clear the PM fields |
| `src/pages/SchedulesPage.jsx` | modify | PM checkbox, PM fields, PM table columns |
| `src/lib/attendance.js` | modify | `pmDetails`, `hasPmData`, `scanTitle` |
| `src/lib/attendance.test.js` | modify | Tests for the above |
| `src/pages/AttendanceTakePage.jsx` | modify | PM columns and note badges |
| `src/pages/AttendanceSummaryPage.jsx` | modify | Use `scanTitle` for the hover text |
| `parent/src/strings.js` | modify | `noteAbsentAm`, `noteLatePm` |
| `parent/src/lib/format.js` | modify | `todayNotes`; `latestScanToday` appends notes |
| `parent/src/lib/format.test.js` | modify | Tests |
| `parent/src/screens/Home.jsx` | modify | Row preview includes notes |

`parent/src/screens/History.jsx` needs no edit: its header already uses `latestScanToday`.

---

### Task 1: Shared session rules

**Files:**
- Create: `shared/scheduleSessions.js`
- Test: `shared/scheduleSessions.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (all named exports of `shared/scheduleSessions.js`):
  - `hasPmSession(schedule: object|undefined) => boolean`
  - `sessionSplit(schedule) => string|null`. Returns `"HH:MM"`, or `null` when there is no PM session.
  - `sessionOf(time: string, schedule) => 'am'|'pm'`
  - `sessionNotes({ inTimes: string[], schedule }) => Array<'absentAm'|'latePm'>`. Order is always `absentAm` first, then `latePm`.

- [ ] **Step 1: Install dependencies**

Run from the worktree root:
```bash
npm ci
```
```bash
npm --prefix parent ci
```
Expected: both finish without errors. `functions/node_modules` already exists.

- [ ] **Step 2: Write the failing test**

Create `shared/scheduleSessions.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { hasPmSession, sessionSplit, sessionOf, sessionNotes } from './scheduleSessions.js';

const split = { timeIn: '08:00', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:00' };
const single = { timeIn: '07:30', timeOut: '17:00' };

describe('hasPmSession', () => {
  it('needs AM departure and both PM times as valid HH:MM', () => {
    expect(hasPmSession(split)).toBe(true);
    expect(hasPmSession(single)).toBe(false);
    expect(hasPmSession({ ...split, pmTimeOut: undefined })).toBe(false);
    expect(hasPmSession({ ...split, pmTimeIn: '' })).toBe(false);
    expect(hasPmSession({ ...split, pmTimeIn: '1:00' })).toBe(false);
    expect(hasPmSession(undefined)).toBe(false);
    expect(hasPmSession(null)).toBe(false);
  });
});

describe('sessionSplit', () => {
  it('is the midpoint of the lunch break, rounded down to the minute', () => {
    expect(sessionSplit(split)).toBe('12:30');
    expect(sessionSplit({ ...split, pmTimeIn: '12:45' })).toBe('12:22');
    expect(sessionSplit({ ...split, timeOut: '11:30', pmTimeIn: '13:00' })).toBe('12:15');
  });
  it('is the shared time when there is no break', () => {
    expect(sessionSplit({ ...split, pmTimeIn: '12:00' })).toBe('12:00');
  });
  it('is null without a PM session', () => {
    expect(sessionSplit(single)).toBeNull();
    expect(sessionSplit(undefined)).toBeNull();
  });
});

describe('sessionOf', () => {
  it('puts taps at or after the split in the afternoon', () => {
    expect(sessionOf('07:55', split)).toBe('am');
    expect(sessionOf('12:05', split)).toBe('am');
    expect(sessionOf('12:29', split)).toBe('am');
    expect(sessionOf('12:30', split)).toBe('pm');
    expect(sessionOf('16:02', split)).toBe('pm');
  });
  it('is always am for a single-session or missing schedule', () => {
    expect(sessionOf('15:00', single)).toBe('am');
    expect(sessionOf('15:00', undefined)).toBe('am');
  });
});

describe('sessionNotes', () => {
  it('is empty for an on-time split day', () => {
    expect(sessionNotes({ inTimes: ['07:55', '12:55'], schedule: split })).toEqual([]);
  });
  it('flags a late afternoon return without touching the morning', () => {
    expect(sessionNotes({ inTimes: ['07:55', '13:15'], schedule: split })).toEqual(['latePm']);
  });
  it('flags a learner whose first tap-in is in the afternoon', () => {
    expect(sessionNotes({ inTimes: ['12:50'], schedule: split })).toEqual(['absentAm']);
    expect(sessionNotes({ inTimes: ['13:00'], schedule: split })).toEqual(['absentAm']);
  });
  it('can carry both notes, absentAm first', () => {
    expect(sessionNotes({ inTimes: ['13:20'], schedule: split })).toEqual(['absentAm', 'latePm']);
  });
  it('judges Late PM on the earliest afternoon tap-in, in any input order', () => {
    expect(sessionNotes({ inTimes: ['13:30', '07:50', '12:58'], schedule: split })).toEqual([]);
  });
  it('is empty with no tap-ins or no PM session', () => {
    expect(sessionNotes({ inTimes: [], schedule: split })).toEqual([]);
    expect(sessionNotes({ inTimes: undefined, schedule: split })).toEqual([]);
    expect(sessionNotes({ inTimes: ['13:20'], schedule: single })).toEqual([]);
    expect(sessionNotes({ inTimes: ['13:20'], schedule: undefined })).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run shared/scheduleSessions.test.js`
Expected: FAIL, because `./scheduleSessions.js` cannot be resolved.

- [ ] **Step 4: Write the implementation**

Create `shared/scheduleSessions.js`:

```js
// Split-day schedules (e.g. Grade 12: 08:00–12:00 and 13:00–16:00), shared
// by the SIMS, parent/ and functions/. Times are zero-padded "HH:MM", the
// format schedules and kiosk scans already use, so string order is time order.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const valid = (t) => typeof t === 'string' && HHMM.test(t);
const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const fromMinutes = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const hasPmSession = (schedule) =>
  valid(schedule?.timeOut) && valid(schedule?.pmTimeIn) && valid(schedule?.pmTimeOut);

// Halfway through the lunch break: a 12:05 tap-out is still the morning
// departure and a 12:50 tap-in is already the afternoon arrival.
export function sessionSplit(schedule) {
  if (!hasPmSession(schedule)) return null;
  return fromMinutes(Math.floor((toMinutes(schedule.timeOut) + toMinutes(schedule.pmTimeIn)) / 2));
}

export function sessionOf(time, schedule) {
  const split = sessionSplit(schedule);
  return split && time >= split ? 'pm' : 'am';
}

// Informational notes for one learner's day, from all of their tap-in times.
// A missing afternoon tap-in is not a note: some learners stay on campus at lunch.
export function sessionNotes({ inTimes, schedule }) {
  if (!hasPmSession(schedule) || !inTimes?.length) return [];
  const pm = inTimes.filter((t) => sessionOf(t, schedule) === 'pm').sort();
  const notes = [];
  if (pm.length === inTimes.length) notes.push('absentAm');
  if (pm.length && pm[0] > schedule.pmTimeIn) notes.push('latePm');
  return notes;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run shared/scheduleSessions.test.js`
Expected: PASS, every test green.

- [ ] **Step 6: Commit**

```bash
git add shared/scheduleSessions.js shared/scheduleSessions.test.js
git commit -m "Add shared AM/PM session rules for split-day schedules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Scan backend routes taps to AM/PM and records notes

**Files:**
- Modify: `functions/src/handlers/scanAttendance.js` (the schedule read and the mark block, currently lines 58–75)
- Test: `functions/test/emulator/scanAttendance.test.js`

**Interfaces:**
- Consumes: `sessionOf(time, schedule)` from `../../shared/scheduleSessions.js`. `functions/shared/` is generated by `scripts/syncShared.mjs`, which the `pretest` and `pretest:emulator` scripts run, so it never needs a manual copy.
- Produces: these optional maps on `student_attendance/{sectionId}_{date}`:
  - `pmTimeIn: { [studentId]: 'HH:MM' }`
  - `pmTimeOut: { [studentId]: 'HH:MM' }`
  - `latePm: { [studentId]: true }`
  - `absentAm: { [studentId]: true }`

- [ ] **Step 1: Write the failing tests**

Append this `describe` block at the end of `functions/test/emulator/scanAttendance.test.js`. The file's top-level `beforeEach` already seeds the school, sets `sections/SEC1.scheduleId = 'AM'`, and enrolls S1 and S2. `run`, `attendance`, `scanDoc` and `ts` are already defined or imported there.

```js
describe('split-day (PM session) schedules', () => {
  beforeEach(async () => {
    await db().doc('schedules/AM').set({ timeIn: '08:00', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:00' });
  });
  // A tap at HH:MM on 2026-09-21, received 10 s later, unless overridden.
  const at = (hhmm, over = {}) => scanDoc({
    scannedAt: ts(`2026-09-21T${hhmm}:00+08:00`), receivedAt: ts(`2026-09-21T${hhmm}:10+08:00`), scannedTime: hhmm, ...over,
  });

  it('still marks the morning arrival against the AM time in', async () => {
    await run('am_late', at('08:05'));
    const doc = (await attendance().get()).data();
    expect(doc).toMatchObject({ marks: { S1: 'L' }, timeIn: { S1: '08:05' } });
    expect(doc.pmTimeIn).toBeUndefined();
    expect(doc.absentAm).toBeUndefined();
  });
  it('keeps morning times when the learner taps out and back in at lunch', async () => {
    await run('d_in1', at('07:55'));
    await run('d_out1', at('12:05', { kind: 'out' }));
    await run('d_in2', at('12:55'));
    await run('d_out2', at('16:02', { kind: 'out' }));
    const doc = (await attendance().get()).data();
    expect(doc).toMatchObject({
      marks: { S1: 'P' },
      timeIn: { S1: '07:55' }, timeOut: { S1: '12:05' },
      pmTimeIn: { S1: '12:55' }, pmTimeOut: { S1: '16:02' },
    });
    expect(doc.latePm).toBeUndefined();
    expect(doc.absentAm).toBeUndefined();
  });
  it('notes a late afternoon return but keeps the day Present', async () => {
    await run('l_in1', at('07:55'));
    await run('l_in2', at('13:15'));
    const doc = (await attendance().get()).data();
    expect(doc).toMatchObject({ marks: { S1: 'P' }, latePm: { S1: true }, pmTimeIn: { S1: '13:15' } });
    expect((await db().doc('scan_events/l_in2').get()).data().attendanceResult).toMatchObject({ status: 'applied', mark: 'P' });
  });
  it('marks Present with an Absent AM note when the first tap-in is after lunch', async () => {
    await run('pm_first', at('12:50'));
    const doc = (await attendance().get()).data();
    expect(doc).toMatchObject({ marks: { S1: 'P', S2: 'A' }, absentAm: { S1: true }, pmTimeIn: { S1: '12:50' } });
    expect(doc.timeIn).toBeUndefined();
    expect(doc.latePm).toBeUndefined();
  });
  it('carries both notes for a learner who only arrives late in the afternoon', async () => {
    await run('pm_late_first', at('13:20'));
    expect((await attendance().get()).data()).toMatchObject({ marks: { S1: 'P' }, absentAm: { S1: true }, latePm: { S1: true } });
  });
  it('clears Absent AM when a delayed morning tap-in syncs later', async () => {
    await run('x_pm', at('13:05'));
    await run('x_am', at('07:50', { receivedAt: ts('2026-09-21T13:20:00+08:00') }));
    const doc = (await attendance().get()).data();
    expect(doc).toMatchObject({ marks: { S1: 'P' }, timeIn: { S1: '07:50' }, pmTimeIn: { S1: '13:05' }, latePm: { S1: true } });
    expect(doc.absentAm?.S1).toBeUndefined();
  });
  it('preserves a staff mark when the first tap-in is in the afternoon', async () => {
    await attendance().set({ sectionId: 'SEC1', gradeLevel: 7, schoolYear: '2026-2027', date: '2026-09-21', marks: { S1: 'E' } });
    await run('staff_e', at('13:10'));
    expect((await attendance().get()).data()).toMatchObject({ marks: { S1: 'E' }, absentAm: { S1: true }, latePm: { S1: true } });
  });
  it('treats a schedule with only one PM time as a single session', async () => {
    await db().doc('schedules/AM').set({ timeIn: '08:00', timeOut: '12:00', pmTimeIn: '13:00' });
    await run('half_pm', at('13:10'));
    const doc = (await attendance().get()).data();
    expect(doc).toMatchObject({ marks: { S1: 'L' }, timeIn: { S1: '13:10' } });
    expect(doc.pmTimeIn).toBeUndefined();
    expect(doc.absentAm).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:functions`. This needs the Firebase CLI and Java for the Firestore emulator.
Expected: the new split-day tests FAIL. For example, `pmTimeIn` is undefined and `timeIn` is `'12:55'`. All existing tests PASS.
If the emulator can't start on this machine, record that, run `npm --prefix functions test` (the non-emulator suite) at Step 4, and flag the unverified emulator tests in the task report.

- [ ] **Step 3: Implement**

In `functions/src/handlers/scanAttendance.js`, add this import below the existing `firebase-admin/firestore` import:

```js
import { sessionOf } from '../../shared/scheduleSessions.js';
```

Replace this existing block:

```js
    let scheduleTimeIn;
    if (section.data().scheduleId) {
      const schedule = await tx.get(db.doc(`schedules/${section.data().scheduleId}`));
      scheduleTimeIn = schedule.data()?.timeIn;
    }
    const update = { sectionId: data.sectionId, gradeLevel, schoolYear: data.schoolYear, date,
      marks, rosterInitialized: true, updatedAt: date };
    const field = data.kind === 'in' ? 'timeIn' : 'timeOut';
    const priorTime = attendance[field]?.[data.studentId];
    // Delayed/offline events must not move a later recorded time backwards.
    update[field] = { [data.studentId]: priorTime && priorTime > scanTime ? priorTime : scanTime };
    if (data.kind === 'in' && !attendance.timeIn?.[data.studentId]) {
      const existingMark = marks[data.studentId];
      if (!existingMark || existingMark === 'A') {
        marks[data.studentId] = scheduleTimeIn && scanTime > scheduleTimeIn ? 'L' : 'P';
      }
    }
```

with:

```js
    let schedule;
    if (section.data().scheduleId) {
      schedule = (await tx.get(db.doc(`schedules/${section.data().scheduleId}`))).data();
    }
    const update = { sectionId: data.sectionId, gradeLevel, schoolYear: data.schoolYear, date,
      marks, rosterInitialized: true, updatedAt: date };
    const id = data.studentId;
    // Split-day schedules keep afternoon taps apart, so a 1 PM tap-in cannot
    // overwrite the morning arrival. Single-session schedules are always 'am'.
    const pm = sessionOf(scanTime, schedule) === 'pm';
    const field = { in: pm ? 'pmTimeIn' : 'timeIn', out: pm ? 'pmTimeOut' : 'timeOut' }[data.kind];
    const priorTime = attendance[field]?.[id];
    // Delayed/offline events must not move a later recorded time backwards.
    update[field] = { [id]: priorTime && priorTime > scanTime ? priorTime : scanTime };
    if (data.kind === 'in') {
      const firstOfDay = !attendance.timeIn?.[id] && !attendance.pmTimeIn?.[id];
      if (firstOfDay && (!marks[id] || marks[id] === 'A')) {
        // An afternoon-only learner is Present; the Absent AM note says why.
        marks[id] = !pm && schedule?.timeIn && scanTime > schedule.timeIn ? 'L' : 'P';
      }
      // Notes are informational only and never change the mark.
      if (pm && firstOfDay) update.absentAm = { [id]: true };
      if (pm && !attendance.pmTimeIn?.[id] && scanTime > schedule.pmTimeIn) update.latePm = { [id]: true };
      // A delayed morning tap-in proves the learner did come in the morning.
      if (!pm && attendance.absentAm?.[id]) update.absentAm = { [id]: FieldValue.delete() };
    }
```

The existing `tx.set(attendanceRef, update, { merge: true })` merges these nested maps per learner. `FieldValue.delete()` is valid inside a merge set. The receipt code after this block still reads `marks[data.studentId]`, which is unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:functions`
Expected: PASS. Every test passes, both the new split-day tests and all the old ones.
Then run `npm --prefix functions test`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/scanAttendance.js functions/test/emulator/scanAttendance.test.js
git commit -m "Record afternoon taps and Late PM / Absent AM notes for split-day schedules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Parent summary carries today's notes

**Files:**
- Modify: `functions/src/lib/recomputeSummary.js`
- Modify: `functions/src/handlers/scanEvent.js` (the student/section load at about line 87, and the `recomputeSummary` call at about line 112)
- Test: `functions/src/lib/recomputeSummary.test.js`, `functions/test/emulator/scanEvent.test.js`

**Interfaces:**
- Consumes: `sessionNotes({ inTimes, schedule })` from Task 1.
- Produces: `recomputeSummary({ events, todayDate, schedule, recentLimit })`. Its result's `today` has a new field, `notes: Array<'absentAm'|'latePm'>`, always present and `[]` when there is nothing to note. `learners/{id}.today.notes` is what Task 6 reads.

- [ ] **Step 1: Write the failing unit tests**

In `functions/src/lib/recomputeSummary.test.js`, change the first test's expectation (line 8) to include `notes: []`:

```js
    expect(r.today).toEqual({ date: '2026-09-21', firstIn: null, lastOut: null, status: 'no_scan', events: [], notes: [] });
```

Then add these tests inside the existing `describe('recomputeSummary', ...)` block, before its closing `});`. The `ev` helper is defined at the top of the file.

```js
  const split = { timeIn: '08:00', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:00' };
  it('has no notes without a split-day schedule', () => {
    const r = recomputeSummary({ events: [ev('in1', 'in', '2026-09-21', '13:20', 1)], todayDate: '2026-09-21' });
    expect(r.today.notes).toEqual([]);
  });
  it('notes Absent AM and Late PM from today\'s tap-ins on a split-day schedule', () => {
    const r = recomputeSummary({ events: [ev('in1', 'in', '2026-09-21', '13:20', 1)], todayDate: '2026-09-21', schedule: split });
    expect(r.today.notes).toEqual(['absentAm', 'latePm']);
  });
  it('ignores voided taps, tap-outs and other days when working out notes', () => {
    const r = recomputeSummary({ events: [
      ev('old', 'in', '2026-09-20', '07:50', 1),
      ev('void', 'in', '2026-09-21', '07:55', 2, 'voided'),
      ev('out', 'out', '2026-09-21', '12:05', 3),
      ev('pm', 'in', '2026-09-21', '12:55', 4),
    ], todayDate: '2026-09-21', schedule: split });
    expect(r.today.notes).toEqual(['absentAm']);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix functions test -- recomputeSummary`
Expected: FAIL, because `today.notes` is undefined.

- [ ] **Step 3: Implement `recomputeSummary`**

In `functions/src/lib/recomputeSummary.js`, add at the top:

```js
import { sessionNotes } from '../../shared/scheduleSessions.js';
```

Change the signature line to:

```js
export function recomputeSummary({ events, todayDate, schedule, recentLimit = 10 }) {
```

and add `notes` as the last property of the returned `today` object, after `events: ...`:

```js
      events: [...today].reverse().map((e) => ({ kind: e.kind, time: e.scannedTime, eventId: e.id })),
      // Split-day schedules only: 'absentAm' / 'latePm', never a missing tap.
      notes: sessionNotes({ inTimes: ins.map((e) => e.scannedTime), schedule }),
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm --prefix functions test -- recomputeSummary`
Expected: PASS.

- [ ] **Step 5: Write the failing emulator test**

Add inside `describe('handleScanEvent', ...)` in `functions/test/emulator/scanEvent.test.js`. `run`, `deps`, `scanDoc` and `ts` are already in that file.

```js
  it('adds split-day session notes to the learner summary', async () => {
    await db().doc('sections/SEC1').update({ scheduleId: 'SPLIT' });
    await db().doc('schedules/SPLIT').set({ timeIn: '08:00', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:00' });
    const data = scanDoc({ scannedAt: ts('2026-09-21T12:50:00+08:00'), receivedAt: ts('2026-09-21T12:50:10+08:00'), scannedTime: '12:50' });
    expect((await run(deps(), 'k1_S1_202609211250', data)).outcome).toBe('processed');
    expect((await db().doc('learners/S1').get()).data().today.notes).toEqual(['absentAm']);
  });
```

Run: `npm run test:functions`
Expected: the new test FAILS, because `today.notes` is `[]` while no schedule is passed in.

- [ ] **Step 6: Implement the schedule load in `scanEvent.js`**

In `functions/src/handlers/scanEvent.js`, right after this line:

```js
  const [studentSnap, sectionSnap] = await Promise.all([db.doc(`students/${studentId}`).get(), db.doc(`sections/${enrollment.sectionId}`).get()]);
```

add:

```js
  const scheduleId = sectionSnap.data()?.scheduleId;
  const schedule = scheduleId ? (await db.doc(`schedules/${scheduleId}`).get()).data() : undefined;
```

and change:

```js
    const summary = recomputeSummary({ events: existing, todayDate });
```

to:

```js
    const summary = recomputeSummary({ events: existing, todayDate, schedule });
```

- [ ] **Step 7: Run to verify everything passes**

Run: `npm run test:functions`, then `npm --prefix functions test`.
Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add functions/src/lib/recomputeSummary.js functions/src/lib/recomputeSummary.test.js functions/src/handlers/scanEvent.js functions/test/emulator/scanEvent.test.js
git commit -m "Add split-day session notes to the parent learner summary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Schedules page — optional afternoon session

**Files:**
- Create: `src/lib/schedules.js`
- Test: `src/lib/schedules.test.js`
- Modify: `src/data/schedules.js`
- Modify: `src/pages/SchedulesPage.jsx`

**Interfaces:**
- Consumes: `hasPmSession(schedule)` from `shared/scheduleSessions.js` (Task 1).
- Produces: `validateSchedule(form) => string`. It returns an error message, or `''` when the form is valid. `form` is `{ name, timeIn, timeOut, pm: boolean, pmTimeIn, pmTimeOut }`. `createSchedule(form)` / `updateSchedule(id, form)` honor `form.pm`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/schedules.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { validateSchedule } from './schedules.js';

const single = { name: 'Morning Shift', timeIn: '07:30', timeOut: '17:00', pm: false };
const split = { name: 'Grade 12 Split', timeIn: '08:00', timeOut: '12:00', pm: true, pmTimeIn: '13:00', pmTimeOut: '16:00' };

describe('validateSchedule', () => {
  it('accepts a single-session and a split-day schedule', () => {
    expect(validateSchedule(single)).toBe('');
    expect(validateSchedule(split)).toBe('');
  });
  it('requires a name', () => {
    expect(validateSchedule({ ...single, name: '  ' })).toBe('Schedule name is required.');
  });
  it('keeps the original single-session messages', () => {
    expect(validateSchedule({ ...single, timeOut: '' })).toBe('Time in and time out are required.');
    expect(validateSchedule({ ...single, timeOut: '07:30' })).toBe('Time out must be later than time in.');
  });
  it('uses AM wording when the afternoon session is on', () => {
    expect(validateSchedule({ ...split, timeIn: '' })).toBe('AM arrival and AM departure are required.');
    expect(validateSchedule({ ...split, timeOut: '07:00' })).toBe('AM departure must be later than AM arrival.');
  });
  it('requires both PM times when the afternoon session is on', () => {
    expect(validateSchedule({ ...split, pmTimeOut: '' })).toBe('PM arrival and PM departure are required.');
    expect(validateSchedule({ ...split, pmTimeIn: undefined })).toBe('PM arrival and PM departure are required.');
  });
  it('keeps the times in order', () => {
    expect(validateSchedule({ ...split, pmTimeIn: '11:30' })).toBe('PM arrival cannot be earlier than AM departure.');
    expect(validateSchedule({ ...split, pmTimeIn: '12:00' })).toBe('');
    expect(validateSchedule({ ...split, pmTimeOut: '13:00' })).toBe('PM departure must be later than PM arrival.');
  });
  it('ignores leftover PM values when the afternoon session is off', () => {
    expect(validateSchedule({ ...single, pmTimeIn: '01:00', pmTimeOut: '' })).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/schedules.test.js`
Expected: FAIL, because `./schedules.js` cannot be resolved.

- [ ] **Step 3: Implement `validateSchedule`**

Create `src/lib/schedules.js`:

```js
// Schedule form rules. With the afternoon session on, times must run
// AM arrival < AM departure <= PM arrival < PM departure ("HH:MM" strings).
export function validateSchedule(f) {
  if (!f.name?.trim()) return 'Schedule name is required.';
  if (!f.timeIn || !f.timeOut) return f.pm ? 'AM arrival and AM departure are required.' : 'Time in and time out are required.';
  if (f.timeOut <= f.timeIn) return f.pm ? 'AM departure must be later than AM arrival.' : 'Time out must be later than time in.';
  if (!f.pm) return '';
  if (!f.pmTimeIn || !f.pmTimeOut) return 'PM arrival and PM departure are required.';
  if (f.pmTimeIn < f.timeOut) return 'PM arrival cannot be earlier than AM departure.';
  if (f.pmTimeOut <= f.pmTimeIn) return 'PM departure must be later than PM arrival.';
  return '';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/schedules.test.js`
Expected: PASS.

- [ ] **Step 5: Persist or clear the PM fields**

Replace the whole of `src/data/schedules.js` with:

```js
import { collection, addDoc, doc, setDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase.js';

// With the afternoon session off, an edit removes any saved PM times.
const shape = (f, { clearPm }) => ({
  name: f.name.trim(), timeIn: f.timeIn, timeOut: f.timeOut,
  ...(f.pm ? { pmTimeIn: f.pmTimeIn, pmTimeOut: f.pmTimeOut }
    : clearPm ? { pmTimeIn: deleteField(), pmTimeOut: deleteField() } : {}),
});
export const createSchedule = (f) => addDoc(collection(db, 'schedules'), { ...shape(f, { clearPm: false }), gradeLevels: [] });
export const updateSchedule = (id, f) => setDoc(doc(db, 'schedules', id), shape(f, { clearPm: true }), { merge: true });
export const deleteSchedule = (id) => deleteDoc(doc(db, 'schedules', id));
```

- [ ] **Step 6: Update the form and table in `SchedulesPage.jsx`**

Add these imports below the existing ones:

```js
import { validateSchedule } from '../lib/schedules.js';
import { hasPmSession } from '../../shared/scheduleSessions.js';
```

Replace the whole `ScheduleForm` function with:

```jsx
const check = { display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontFamily: T.body, fontSize: 'var(--sims-field-font, 13px)', color: T.ink, marginBottom: 12 };

function ScheduleForm({ editing, onClose }) {
  const action = useAsyncAction();
  const [f, setF] = useState(editing ? { ...editing, pm: hasPmSession(editing) } : { name: '', timeIn: '', timeOut: '', pm: false, pmTimeIn: '', pmTimeOut: '' });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    const problem = validateSchedule(f);
    if (problem) { setErr(problem); return; }
    await action.run('save', async () => {
      editing ? await updateSchedule(editing.id, f) : await createSchedule(f);
      onClose();
    });
  };
  return (
    <Modal labelledBy="schedule-form-title" onClose={onClose} dismissible={!action.busy}>
      <ActionFeedback action={action}/>
      <h2 id="schedule-form-title" style={{ fontFamily: T.display, color: T.ink, marginTop: 0, fontSize: 17, fontWeight: 600 }}>{editing ? 'Edit schedule' : 'New schedule'}</h2>
      {err && <div style={{ fontFamily: T.body, background: 'rgba(139,58,47,0.12)', color: T.absent, borderRadius: T.radius, padding: '8px 10px', fontSize: 12, marginBottom: 12 }}>{err}</div>}
      <Field label="Schedule name"><Inp value={f.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Morning Shift" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--sims-form-columns, 1fr 1fr)', gap: 10 }}>
        <Field label={f.pm ? 'AM arrival' : 'Time in'}><Inp type="time" value={f.timeIn || ''} onChange={(e) => set('timeIn', e.target.value)} /></Field>
        <Field label={f.pm ? 'AM departure' : 'Time out'}><Inp type="time" value={f.timeOut || ''} onChange={(e) => set('timeOut', e.target.value)} /></Field>
      </div>
      <label style={check}><input type="checkbox" checked={f.pm} onChange={(e) => set('pm', e.target.checked)} /> Add afternoon session (PM)</label>
      {f.pm && (
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--sims-form-columns, 1fr 1fr)', gap: 10 }}>
          <Field label="PM arrival"><Inp type="time" value={f.pmTimeIn || ''} onChange={(e) => set('pmTimeIn', e.target.value)} /></Field>
          <Field label="PM departure"><Inp type="time" value={f.pmTimeOut || ''} onChange={(e) => set('pmTimeOut', e.target.value)} /></Field>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="ghost" disabled={action.busy} onClick={onClose}>Cancel</Btn>
        <Btn disabled={action.busy} onClick={save}>{editing ? 'Save changes' : 'Add schedule'}</Btn>
      </div>
    </Modal>
  );
}
```

In the table, change the header list:

```jsx
              {['Name', 'Time In', 'Time Out', 'PM In', 'PM Out', ''].map((h) => <th key={h} style={S.th}>{h}</th>)}
```

and after the `Time Out` cell (`<td style={{ ...S.td, ...T.num }}>{s.timeOut}</td>`) add:

```jsx
                <td style={{ ...S.td, ...T.num }}>{hasPmSession(s) ? s.pmTimeIn : '—'}</td>
                <td style={{ ...S.td, ...T.num }}>{hasPmSession(s) ? s.pmTimeOut : '—'}</td>
```

- [ ] **Step 7: Run the SIMS suite and build**

Run: `npm test`
Expected: PASS.
Run: `npm run build`
Expected: the build succeeds with no unresolved import of `../../shared/scheduleSessions.js`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/schedules.js src/lib/schedules.test.js src/data/schedules.js src/pages/SchedulesPage.jsx
git commit -m "Add optional afternoon session to schedules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Take Attendance and Summary show PM taps and notes

**Files:**
- Modify: `src/lib/attendance.js`
- Test: `src/lib/attendance.test.js`
- Modify: `src/pages/AttendanceTakePage.jsx`
- Modify: `src/pages/AttendanceSummaryPage.jsx`

**Interfaces:**
- Consumes: `hasPmSession` (Task 1). Uses the attendance fields from Task 2: `pmTimeIn`, `pmTimeOut`, `absentAm`, `latePm`.
- Produces, all in `src/lib/attendance.js`:
  - `pmDetails(doc, studentId) => { pmTimeIn?: string, pmTimeOut?: string, notes: string[] }`. Notes are the labels `'Absent AM'` and `'Late PM'`, in that order.
  - `hasPmData(doc) => boolean`
  - `scanTitle(doc, studentId) => string|undefined`

- [ ] **Step 1: Write the failing tests**

In `src/lib/attendance.test.js`, change the import line to:

```js
import { markFor, summarizeMonth, formatScanTime, pmDetails, hasPmData, scanTitle } from './attendance.js';
```

and append:

```js
describe('pmDetails', () => {
  const doc = { pmTimeIn: { s1: '13:15' }, pmTimeOut: { s1: '16:02' }, latePm: { s1: true }, absentAm: { s2: true } };
  it('reads one learner\'s afternoon taps and note labels', () => {
    expect(pmDetails(doc, 's1')).toEqual({ pmTimeIn: '13:15', pmTimeOut: '16:02', notes: ['Late PM'] });
    expect(pmDetails(doc, 's2')).toEqual({ pmTimeIn: undefined, pmTimeOut: undefined, notes: ['Absent AM'] });
  });
  it('orders Absent AM before Late PM', () => {
    expect(pmDetails({ latePm: { s1: true }, absentAm: { s1: true } }, 's1').notes).toEqual(['Absent AM', 'Late PM']);
  });
  it('is empty for a missing record', () => {
    expect(pmDetails(null, 's1')).toEqual({ pmTimeIn: undefined, pmTimeOut: undefined, notes: [] });
  });
});

describe('hasPmData', () => {
  it('is true only when some learner has afternoon data', () => {
    expect(hasPmData({ pmTimeIn: { s1: '13:00' } })).toBe(true);
    expect(hasPmData({ absentAm: { s1: true } })).toBe(true);
    expect(hasPmData({ timeIn: { s1: '07:00' }, pmTimeIn: {} })).toBe(false);
    expect(hasPmData(null)).toBe(false);
  });
});

describe('scanTitle', () => {
  it('keeps the single-session wording', () => {
    expect(scanTitle({ timeIn: { s1: '07:12' } }, 's1')).toBe('Time in: 07:12 AM  ·  Time out: —');
  });
  it('adds afternoon taps and notes', () => {
    expect(scanTitle({ timeIn: { s1: '07:55' }, timeOut: { s1: '12:05' }, pmTimeIn: { s1: '13:15' }, latePm: { s1: true } }, 's1'))
      .toBe('Time in: 07:55 AM  ·  Time out: 12:05 PM  ·  PM in: 01:15 PM  ·  PM out: —  ·  Late PM');
    expect(scanTitle({ pmTimeIn: { s1: '12:50' }, absentAm: { s1: true } }, 's1'))
      .toBe('PM in: 12:50 PM  ·  PM out: —  ·  Absent AM');
  });
  it('is undefined with nothing recorded', () => {
    expect(scanTitle({}, 's1')).toBeUndefined();
    expect(scanTitle(undefined, 's1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/attendance.test.js`
Expected: FAIL, because `pmDetails`, `hasPmData` and `scanTitle` are not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/attendance.js`:

```js
// Split-day schedules: the backend stores afternoon taps and informational
// notes beside timeIn/timeOut. Notes never change the P/L/A mark.
const NOTE_LABELS = [['absentAm', 'Absent AM'], ['latePm', 'Late PM']];
const PM_FIELDS = ['pmTimeIn', 'pmTimeOut', 'absentAm', 'latePm'];

export function pmDetails(doc, studentId) {
  return {
    pmTimeIn: doc?.pmTimeIn?.[studentId],
    pmTimeOut: doc?.pmTimeOut?.[studentId],
    notes: NOTE_LABELS.filter(([key]) => doc?.[key]?.[studentId] === true).map(([, label]) => label),
  };
}

export const hasPmData = (doc) => PM_FIELDS.some((k) => doc?.[k] && Object.keys(doc[k]).length > 0);

// Hover text for one learner's day on the monthly summary grid.
export function scanTitle(doc, studentId) {
  const timeIn = doc?.timeIn?.[studentId];
  const timeOut = doc?.timeOut?.[studentId];
  const pm = pmDetails(doc, studentId);
  const parts = [];
  if (timeIn || timeOut) parts.push(`Time in: ${formatScanTime(timeIn)}  ·  Time out: ${formatScanTime(timeOut)}`);
  if (pm.pmTimeIn || pm.pmTimeOut) parts.push(`PM in: ${formatScanTime(pm.pmTimeIn)}  ·  PM out: ${formatScanTime(pm.pmTimeOut)}`);
  parts.push(...pm.notes);
  return parts.length ? parts.join('  ·  ') : undefined;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/attendance.test.js`
Expected: PASS.

- [ ] **Step 5: Use `scanTitle` on the Summary page**

In `src/pages/AttendanceSummaryPage.jsx`, change the attendance import to:

```js
import { markFor, summarizeMonth, scanTitle as dayScanTitle } from '../lib/attendance.js';
```

`formatScanTime` is no longer used in this file. Check with `grep -n formatScanTime src/pages/AttendanceSummaryPage.jsx`; it should show no matches after this step.

Replace:

```jsx
                      const timeIn = docsByDate[d]?.timeIn?.[s.id];
                      const timeOut = docsByDate[d]?.timeOut?.[s.id];
                      const scanTitle = timeIn || timeOut
                        ? `Time in: ${formatScanTime(timeIn)}  ·  Time out: ${formatScanTime(timeOut)}`
                        : undefined;
```

with:

```jsx
                      const scanTitle = dayScanTitle(docsByDate[d], s.id);
```

- [ ] **Step 6: Add PM columns and notes to Take Attendance**

In `src/pages/AttendanceTakePage.jsx`:

Change the attendance import and add the shared import:

```js
import { markFor, formatScanTime, pmDetails, hasPmData } from '../lib/attendance.js';
import { hasPmSession } from '../../shared/scheduleSessions.js';
```

After the `attendanceDoc` line, add the schedule lookup:

```js
  // PM columns are display-only, so schedules stay out of `resources`: a
  // schedule load problem must never block taking attendance.
  const schedulesResource = useStaffCollectionResource('schedules', { me, schoolYear });
  const sectionScheduleId = sectionsSY.find((s) => s.id === sectionId)?.scheduleId;
  const showPm = hasPmSession(schedulesResource.data.find((s) => s.id === sectionScheduleId)) || hasPmData(attendanceDoc);
```

Add this component above `function TallyChip`:

```jsx
function TimeCell({ time }) {
  return <span style={{ ...T.num, fontSize: 12, fontWeight: 600, color: time ? T.ink : T.inkMuted, width: 84, flexShrink: 0, textAlign: 'center', padding: '4px 0', borderRadius: 8, background: time ? 'rgba(0,122,114,0.06)' : 'transparent' }}>{formatScanTime(time)}</span>;
}
```

Replace the roster wrapper and header row:

```jsx
          <div className="sims-table-scroll" role="region" aria-label="Attendance roster" tabIndex={0}><div style={{ minWidth: 700 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 18px 8px' }}>
            <span style={{ ...S.th, width: 110, flexShrink: 0, padding: 0, borderBottom: 'none' }}>LRN</span>
            <span style={{ ...S.th, flex: '0 1 280px', minWidth: 140, padding: 0, borderBottom: 'none' }}>Name</span>
            <span style={{ ...S.th, width: 84, flexShrink: 0, textAlign: 'center', padding: 0, borderBottom: 'none' }}>Time In</span>
            <span style={{ ...S.th, width: 84, flexShrink: 0, textAlign: 'center', padding: 0, borderBottom: 'none' }}>Time Out</span>
            <span style={{ ...S.th, width: 90, flexShrink: 0, textAlign: 'center', padding: 0, borderBottom: 'none' }}>Status</span>
          </div>
```

with:

```jsx
          <div className="sims-table-scroll" role="region" aria-label="Attendance roster" tabIndex={0}><div style={{ minWidth: showPm ? 900 : 700 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 18px 8px' }}>
            <span style={{ ...S.th, width: 110, flexShrink: 0, padding: 0, borderBottom: 'none' }}>LRN</span>
            <span style={{ ...S.th, flex: '0 1 280px', minWidth: 140, padding: 0, borderBottom: 'none' }}>Name</span>
            {(showPm ? ['AM In', 'AM Out', 'PM In', 'PM Out'] : ['Time In', 'Time Out']).map((h) => (
              <span key={h} style={{ ...S.th, width: 84, flexShrink: 0, textAlign: 'center', padding: 0, borderBottom: 'none' }}>{h}</span>
            ))}
            <span style={{ ...S.th, width: 90, flexShrink: 0, textAlign: 'center', padding: 0, borderBottom: 'none' }}>Status</span>
          </div>
```

Inside `roster.map`, replace:

```jsx
              const timeIn = attendanceDoc?.timeIn?.[s.id];
              const timeOut = attendanceDoc?.timeOut?.[s.id];
              const scanLabel = `${timeIn ? ` Time in ${formatScanTime(timeIn)}.` : ''}${timeOut ? ` Time out ${formatScanTime(timeOut)}.` : ''}`;
```

with:

```jsx
              const timeIn = attendanceDoc?.timeIn?.[s.id];
              const timeOut = attendanceDoc?.timeOut?.[s.id];
              const pm = pmDetails(attendanceDoc, s.id);
              const amWord = showPm ? 'AM' : 'Time';
              const scanLabel = [
                timeIn && ` ${amWord} in ${formatScanTime(timeIn)}.`,
                timeOut && ` ${amWord} out ${formatScanTime(timeOut)}.`,
                pm.pmTimeIn && ` PM in ${formatScanTime(pm.pmTimeIn)}.`,
                pm.pmTimeOut && ` PM out ${formatScanTime(pm.pmTimeOut)}.`,
                ...pm.notes.map((n) => ` ${n}.`),
              ].filter(Boolean).join('');
```

Then replace the two time `<span>`s and the status `<span>`:

```jsx
                  <span style={{ ...T.num, fontSize: 12, fontWeight: 600, color: timeIn ? T.ink : T.inkMuted, width: 84, flexShrink: 0, textAlign: 'center', padding: '4px 0', borderRadius: 8, background: timeIn ? 'rgba(0,122,114,0.06)' : 'transparent' }}>{formatScanTime(timeIn)}</span>
                  <span style={{ ...T.num, fontSize: 12, fontWeight: 600, color: timeOut ? T.ink : T.inkMuted, width: 84, flexShrink: 0, textAlign: 'center', padding: '4px 0', borderRadius: 8, background: timeOut ? 'rgba(0,122,114,0.06)' : 'transparent' }}>{formatScanTime(timeOut)}</span>
                  <span style={{ width: 90, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                    <StatusPill mark={mark} />
                  </span>
```

with:

```jsx
                  <TimeCell time={timeIn} />
                  <TimeCell time={timeOut} />
                  {showPm && <><TimeCell time={pm.pmTimeIn} /><TimeCell time={pm.pmTimeOut} /></>}
                  <span style={{ width: 90, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <StatusPill mark={mark} />
                    {pm.notes.map((n) => <span key={n} style={{ fontFamily: T.body, fontSize: 11, fontWeight: 600, color: T.inkMuted, whiteSpace: 'nowrap' }}>{n}</span>)}
                  </span>
```

- [ ] **Step 7: Run tests and build**

Run: `npm test`
Expected: PASS.
Run: `npm run build`
Expected: the build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/lib/attendance.js src/lib/attendance.test.js src/pages/AttendanceTakePage.jsx src/pages/AttendanceSummaryPage.jsx
git commit -m "Show afternoon taps and Late PM / Absent AM notes on attendance pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Parent app shows today's notes

**Files:**
- Modify: `parent/src/strings.js`
- Modify: `parent/src/lib/format.js`
- Test: `parent/src/lib/format.test.js`
- Modify: `parent/src/screens/Home.jsx`

**Interfaces:**
- Consumes: `learners/{id}.today.notes` from Task 3. It can be missing on older summaries.
- Produces:
  - `todayNotes(today, todayDate) => string[]`. Returns the labels `S.noteAbsentAm` and `S.noteLatePm` in stored order, and `[]` for a stale or missing summary.
  - `latestScanToday` now appends ` · <note>` for each note.

- [ ] **Step 1: Write the failing tests**

In `parent/src/lib/format.test.js`, change the import to:

```js
import { eventTitle, initials, latestScanToday, nameCase, todayNotes } from './format.js';
```

and add inside `describe('format', ...)`:

```js
  it('lists today\'s split-day notes, and none for stale or older summaries', () => {
    expect(todayNotes({ date: '2026-09-21', notes: ['absentAm', 'latePm'] }, '2026-09-21')).toEqual(['Absent AM', 'Late PM']);
    expect(todayNotes({ date: '2026-09-21', notes: [] }, '2026-09-21')).toEqual([]);
    expect(todayNotes({ date: '2026-09-21' }, '2026-09-21')).toEqual([]);
    expect(todayNotes({ date: '2026-09-20', notes: ['latePm'] }, '2026-09-21')).toEqual([]);
    expect(todayNotes(null, '2026-09-21')).toEqual([]);
    expect(todayNotes({ date: '2026-09-21', notes: ['unknown'] }, '2026-09-21')).toEqual([]);
  });
  it('appends notes to today\'s latest scan', () => {
    expect(latestScanToday({ date: '2026-09-21', status: 'in', events: [{ kind: 'in', time: '12:50' }], notes: ['absentAm'] }, '2026-09-21'))
      .toBe('Entered 12:50 PM · Absent AM');
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix parent test -- format`
Expected: FAIL, because `todayNotes` is not exported.

- [ ] **Step 3: Add strings**

In `parent/src/strings.js`, add after `homeLeft: 'Left',`:

```js
  noteAbsentAm: 'Absent AM',
  noteLatePm: 'Late PM',
```

- [ ] **Step 4: Implement `todayNotes` and extend `latestScanToday`**

In `parent/src/lib/format.js`, replace the `latestScanToday` function with:

```js
// Split-day schedule notes for today ('absentAm' / 'latePm'), as labels.
const NOTE_LABEL = { absentAm: S.noteAbsentAm, latePm: S.noteLatePm };
export function todayNotes(today, todayDate) {
  if (!today || today.date !== todayDate) return [];
  return (today.notes || []).map((n) => NOTE_LABEL[n]).filter(Boolean);
}

export function latestScanToday(today, todayDate) {
  const latest = latestScan(today, todayDate);
  if (!latest) return S.homeTodayNone;
  return [`${latest.kind === 'in' ? S.homeEntered : S.homeLeft} ${formatScanTime(latest.time)}`, ...todayNotes(today, todayDate)].join(' · ');
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm --prefix parent test`
Expected: PASS. This includes `strings.test.js`: the new strings are non-empty and contain no forbidden words.

- [ ] **Step 6: Show notes in the Home row preview**

In `parent/src/screens/Home.jsx`, change the format import to:

```js
import { initials, latestScan, todayNotes } from '../lib/format.js';
```

and replace:

```jsx
          <span className="learner-row-preview">{[happened, data?.sectionLabel].filter(Boolean).join(' · ')}</span>
```

with:

```jsx
          <span className="learner-row-preview">{[happened, ...todayNotes(data?.today, localDate()), data?.sectionLabel].filter(Boolean).join(' · ')}</span>
```

The History header already uses `latestScanToday`, so it shows notes without an edit.

- [ ] **Step 7: Build the parent app**

Run: `npm --prefix parent run build`
Expected: the build succeeds.

- [ ] **Step 8: Commit**

```bash
git add parent/src/strings.js parent/src/lib/format.js parent/src/lib/format.test.js parent/src/screens/Home.jsx
git commit -m "Show Late PM / Absent AM notes in the parent app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification and in-app check

**Files:** none changed unless a check fails.

- [ ] **Step 1: Run every suite**

Run each and confirm PASS:
```bash
npm test
```
```bash
npm --prefix functions test
```
```bash
npm --prefix parent test
```
```bash
npm run test:rules
```
```bash
npm run test:functions
```
If the emulator suites can't run on this machine, say so explicitly in the final report rather than claiming they pass.

- [ ] **Step 2: Builds**

```bash
npm run build
```
```bash
npm --prefix parent run build
```
Expected: both succeed.

- [ ] **Step 3: In-app check (SIMS against the emulators)**

Start the emulators and the SIMS dev server as the project already does. Use `.claude/launch.json` / the `run` skill, and stop only the processes you started, by PID. As an admin:
1. On Schedules, add "Grade 12 Split" with AM 08:00–12:00, tick **Add afternoon session (PM)**, and set PM 13:00–16:00.
   - Check that the table shows PM In 13:00 and PM Out 16:00.
   - Check that a PM arrival of 11:30 is rejected with "PM arrival cannot be earlier than AM departure."
2. Edit it, untick the PM box, and save. Check that the PM columns show "—".
   Re-tick it, set PM 13:00–16:00 again, and save.
3. Assign it to a section. Seed a `student_attendance` doc for today with `timeIn`, `pmTimeIn`, `latePm` for one learner and `absentAm` for another.
   - Take Attendance shows AM In / AM Out / PM In / PM Out and the "Late PM" / "Absent AM" labels under the status pill.
   - The Summary hover text includes the PM times and notes.
4. Pick a section whose schedule has no PM times. Take Attendance looks exactly as before: Time In / Time Out, 700px minimum width.

- [ ] **Step 4: Report**

Report which suites ran and passed, which couldn't run and why, and what the in-app check showed. Do not deploy. Deployment follows the spec's Rollout section and needs the user's go-ahead.
