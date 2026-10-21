# Adviser Student History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A class adviser taps a learner in the Parent app's Class tab and sees the same history a guardian sees (scan bubbles + Sessions calendar), and can flag or restore today's AM/PM attendance from there.

**Architecture:** Two new `schoolCall` callables (`getSchoolLearnerHistoryFn`, `getSchoolLearnerAttendanceFn`) authorize through `loadSchoolActor` + `canReviewSection` and return data in the same shapes the guardian screens already consume. A new Parent screen reuses `historyThread`, `Bubble`, `SessionSheet`, `SessionRows`, `FlagSheet` and the existing `setSessionAbsenceFn`. No Firestore rule changes.

**Tech Stack:** Firebase Functions (Node, ESM), Firestore emulator + vitest (`functions/test/emulator`), React + Vite + vitest (`parent/`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-21-adviser-student-history-design.md`.
- Flagging is today only; past days are view-only (existing `canCorrectSession`/`correctionAllowed`).
- Advisers get no direct Firestore read on `learners`, `student_attendance`, `scan_events`; no change to `firestore.rules`.
- No guardian link is created for advisers (adviser links stay inert).
- History pages are 30 events, newest first.
- Callable payloads must be JSON-safe: no Firestore `Timestamp` objects leave the server.
- Parent-only UI change deploys only `hosting:parent` via `npm run deploy:parent` from fresh `origin/master`; PR #74 UI (theme only in Settings > Appearance, icon-only Sessions calendar button) must be preserved.
- Match surrounding code: terse comments, existing helper names, no new dependencies.

## File Structure

| File | Responsibility |
|---|---|
| `functions/src/handlers/sessionAttendance.js` (modify) | Extract `dayAttendance` helper; add `getSchoolLearnerAttendance`, `getSchoolLearnerHistory`; `learnerFor` auth helper |
| `functions/index.js` (modify) | Export the two new callables |
| `functions/test/emulator/sessionAttendance.test.js` (modify) | Tests for both callables |
| `parent/src/lib/router.js` (modify) | Route `schoolLearner` |
| `parent/src/lib/nav.js` (modify) | Tab/header/portal-view mapping for the new route |
| `parent/src/lib/thread.js` (modify) | `effectiveMs` accepts `effectiveAtMs` from callables |
| `parent/src/components/SessionRows.jsx` (modify) | Optional per-session action slot |
| `parent/src/components/AdviserSessionDetails.jsx` (create) | Date picker + `SessionRows` + Flag/Restore for an adviser |
| `parent/src/screens/school/LearnerHistory.jsx` (create) | The history screen |
| `parent/src/App.jsx` (modify) | Render the new route |
| `parent/src/screens/School.jsx`, `parent/src/screens/school/ClassTab.jsx`, `ClassTab.css` (modify) | Row tap opens history; selection via checkbox button |
| `parent/src/strings.js` (modify) | New copy |

---

### Task 1: Server — adviser attendance-for-a-day callable

**Files:**
- Modify: `functions/src/handlers/sessionAttendance.js`
- Modify: `functions/index.js:120-121` (add exports)
- Test: `functions/test/emulator/sessionAttendance.test.js`

**Interfaces:**
- Consumes: `loadSchoolActor`, `sectionFor`, `correctionAllowed`, `validAttendance`, `historicalScope`, `projection`, `bellTimes`, `validateSectionDate`, `identifier`, `fail` (all already in the file).
- Produces: `getSchoolLearnerAttendance(deps, { sectionId, studentId, date })` returning `{ studentId, gate, am, pm, revision, date, sectionId, schoolYear, schedule, canCorrect }` (the `getFamilyAttendance` shape plus `canCorrect`). Internal helper `dayAttendance(tx, deps, section, studentId, date)` returning the shared part. Internal helper `enrolledLearner(deps, tx, section, studentId)` that fails `permission-denied` unless enrolled in that section; returns the student snapshot.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('session corrections', …)` area as a new `describe` at the end of the file:

```js
describe('adviser learner attendance', () => {
  const day = (uid = 'teacher', over = {}) => getSchoolLearnerAttendance(deps(uid), { sectionId: 'SEC1', studentId: 'S1', date: '2026-09-21', ...over });
  it('returns the family shape plus canCorrect for the section adviser', async () => {
    const result = await day();
    expect(result).toMatchObject({ studentId: 'S1', date: '2026-09-21', sectionId: 'SEC1', schoolYear: '2026-2027', gate: { timeIn: '08:12' }, am: { status: 'L' }, canCorrect: true, revision: 0 });
  });
  it('is view-only for past days and shows an active flag with its actor', async () => {
    await setSessionAbsence(deps(), input());
    const today = await day();
    expect(today.am).toMatchObject({ status: 'A', overrideActive: true, reason: 'Left class after arrival' });
    expect(today.revision).toBe(1);
    await db().doc('student_attendance/SEC1_2026-09-20').set({ sectionId: 'SEC1', schoolYear: '2026-2027', gradeLevel: 7, date: '2026-09-20', marks: { S1: 'P' } });
    expect((await day('teacher', { date: '2026-09-20' })).canCorrect).toBe(false);
  });
  it('rejects advisers of other sections, subject accounts and learners not enrolled in the section', async () => {
    for (const uid of ['other', 'subject']) await expect(day(uid)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(day('teacher', { studentId: 'S2' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(day('teacher', { studentId: 'bad id' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('lets admins and the grade curriculum adviser read it', async () => {
    expect((await day('admin')).studentId).toBe('S1');
    expect((await day('curriculum')).studentId).toBe('S1');
  });
  it('matches the guardian projection for the same learner and day', async () => {
    const { canCorrect, ...adviser } = await day();
    expect(adviser).toEqual(await getFamilyAttendance(deps('gA'), { studentId: 'S1', date: '2026-09-21' }));
  });
});
```

Update the import on line 3 to add `getSchoolLearnerAttendance`:

```js
import { getSchoolRoster, setSessionAbsence, getFamilyAttendance, getSchoolLearnerAttendance, handleAttendanceCorrection, sendDueAttendanceUpdates } from '../../src/handlers/sessionAttendance.js';
```

- [ ] **Step 2: Run to verify failure**

Run (from repo root): `npx firebase emulators:exec --only firestore,auth "npm --prefix functions exec vitest -- run test/emulator/sessionAttendance.test.js --no-file-parallelism"`
Expected: FAIL — `getSchoolLearnerAttendance is not a function` / import error.

- [ ] **Step 3: Extract the shared helper and add the callable**

In `functions/src/handlers/sessionAttendance.js`, add after `historicalScope` (line ~56):

```js
// Both the family and the adviser screens read a day the same way, so they cannot drift.
async function dayAttendance(tx, deps, section, studentId, date) {
  const [attendanceSnap, scheduleSnap] = await Promise.all([
    tx.get(deps.db.doc(`student_attendance/${section.id}_${date}`)),
    identifier(section.scheduleId) ? tx.get(deps.db.doc(`schedules/${section.scheduleId}`)) : null,
  ]);
  const attendance = attendanceSnap.data();
  validAttendance(attendance, section, date);
  return { attendance, body: { ...projection(attendance, studentId), date, sectionId: section.id, schoolYear: section.schoolYear, schedule: bellTimes(scheduleSnap?.data()) } };
}
async function enrolledLearner(deps, tx, section, studentId) {
  const [enrollment, student] = await Promise.all([
    tx.get(deps.db.doc(`enrollments/${studentId}_${section.schoolYear}`)), tx.get(deps.db.doc(`students/${studentId}`)),
  ]);
  if (!student.exists || enrollment.data()?.status !== 'enrolled' || enrollment.data()?.sectionId !== section.id) fail('permission-denied', 'Learner is not enrolled in this section.');
  return student;
}
```

Replace the tail of `getFamilyAttendance` (the `const [attendanceSnap, scheduleSnap] = …` through its `return`) with:

```js
    const { body } = await dayAttendance(tx, deps, section, studentId, date);
    // Families get the bell times so the Parent app can label AM/PM or the shift.
    return body;
```

Add after `getFamilyAttendance`:

```js
export async function getSchoolLearnerAttendance(deps, input) {
  validateSectionDate(input);
  if (!identifier(input.studentId)) fail('invalid-argument', 'Choose a learner.');
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    const section = await sectionFor(deps, tx, input.sectionId, actor);
    await enrolledLearner(deps, tx, section, input.studentId);
    const { attendance, body } = await dayAttendance(tx, deps, section, input.studentId, input.date);
    historicalScope(actor, section, attendance);
    const canCorrect = await correctionAllowed(deps, tx, actor, section, input.date);
    return { ...body, revision: attendance?.sessionOverrides?.[input.studentId]?.revision || 0, canCorrect };
  });
}
```

Note: `projection()` spreads `sessionAttendance(...)`; if that result already contains `revision` (roster rows read `revision` from it), the explicit `revision` above is identical. In the test "matches the guardian projection" the family result then also carries `revision`; if `projection` does not include it, drop `revision` from the destructure in that test and compare `{ canCorrect, revision, ...adviser }`. Check by running Step 4.

In `functions/index.js` after line 121 add:

```js
export const getSchoolLearnerAttendanceFn = schoolCall(getSchoolLearnerAttendance);
```

and add `getSchoolLearnerAttendance` to the existing import from `./src/handlers/sessionAttendance.js` (find it with `grep -n "sessionAttendance.js" functions/index.js`).

- [ ] **Step 4: Run to verify pass, including existing tests**

Run: same command as Step 2.
Expected: all tests in the file PASS (existing family test `gives families only the bell times…` still passes, proving the extraction did not change the guardian output).

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/sessionAttendance.js functions/index.js functions/test/emulator/sessionAttendance.test.js
git commit -m "feat(functions): adviser per-learner day attendance callable"
```

---

### Task 2: Server — adviser learner history callable

**Files:**
- Modify: `functions/src/handlers/sessionAttendance.js`
- Modify: `functions/index.js`
- Test: `functions/test/emulator/sessionAttendance.test.js`

**Interfaces:**
- Consumes: `sectionFor`, `enrolledLearner`, `fullName` (already imported), `loadSchoolActor`.
- Produces: `getSchoolLearnerHistory(deps, { sectionId, studentId, cursor })` → `{ learner: { displayName, sectionLabel, today, recent }, events: [{ id, kind, scannedDate, scannedTime, status, voidReason, deviceLabel, delayedSync, source, effectiveAtMs }], nextCursor: number|null }`. `cursor` is the `effectiveAtMs` of the last event of the previous page (client passes `nextCursor`). Page size constant `HISTORY_PAGE = 30`.

- [ ] **Step 1: Write the failing tests**

Add to the test file (import `getSchoolLearnerHistory`):

```js
describe('adviser learner history', () => {
  const ts = ms => Timestamp.fromMillis(ms);
  const history = (uid = 'teacher', over = {}) => getSchoolLearnerHistory(deps(uid), { sectionId: 'SEC1', studentId: 'S1', ...over });
  const event = (i, over = {}) => db().doc(`learners/S1/events/e${String(i).padStart(3, '0')}`).set({
    kind: i % 2 ? 'out' : 'in', scannedDate: '2026-09-21', scannedTime: '07:00', status: 'recorded', deviceLabel: 'Main Gate',
    delayedSync: false, source: 'kiosk', effectiveAt: ts(Date.UTC(2026, 8, 21, 0, 0, 0) + i * 60000), ...over });
  beforeEach(async () => {
    await db().doc('learners/S1').set({ displayName: 'CRUZ, ANA B.', sectionLabel: 'Grade 7 - Rizal', today: { date: '2026-09-21', events: [] }, recent: [], updatedAt: ts(Date.now()) });
  });
  it('pages newest first with JSON-safe fields', async () => {
    for (let i = 0; i < 35; i++) await event(i);
    const first = await history();
    expect(first.events).toHaveLength(30);
    expect(first.events[0].id).toBe('e034');
    expect(typeof first.events[0].effectiveAtMs).toBe('number');
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(first.learner).toMatchObject({ displayName: 'CRUZ, ANA B.', sectionLabel: 'Grade 7 - Rizal' });
    const second = await history('teacher', { cursor: first.nextCursor });
    expect(second.events.map(e => e.id)).toEqual(['e004', 'e003', 'e002', 'e001', 'e000']);
    expect(second.nextCursor).toBeNull();
  });
  it('keeps voided scans visible with their reason', async () => {
    await event(1, { status: 'voided', voidReason: 'Wrong learner' });
    expect((await history()).events[0]).toMatchObject({ status: 'voided', voidReason: 'Wrong learner' });
  });
  it('falls back to the student and section when there is no learner summary yet', async () => {
    await db().doc('learners/S1').delete();
    expect((await history()).learner).toMatchObject({ displayName: expect.stringContaining('Cruz'), sectionLabel: expect.stringContaining('Rizal') });
  });
  it('rejects other sections, subjects, non-enrolled learners and bad cursors', async () => {
    for (const uid of ['other', 'subject']) await expect(history(uid)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(history('teacher', { studentId: 'S2' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(history('teacher', { cursor: 'x' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
```

Add `import { Timestamp } from 'firebase-admin/firestore';` at the top if not present.

- [ ] **Step 2: Run to verify failure**

Run: the Task 1 Step 2 command.
Expected: FAIL — `getSchoolLearnerHistory is not a function`.

- [ ] **Step 3: Implement**

Add to `functions/src/handlers/sessionAttendance.js` (extend the firebase import to already include `Timestamp`; it does):

```js
const HISTORY_PAGE = 30;
// Callable payloads are JSON: Firestore timestamps become epoch milliseconds.
const plain = value => value?.toMillis ? value.toMillis()
  : Array.isArray(value) ? value.map(plain)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)])) : value;

export async function getSchoolLearnerHistory(deps, { sectionId, studentId, cursor }) {
  if (!identifier(sectionId) || !identifier(studentId)) fail('invalid-argument', 'Choose a learner.');
  if (cursor !== undefined && cursor !== null && !Number.isSafeInteger(cursor)) fail('invalid-argument', 'Choose a valid page.');
  const { section, student } = await deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    const section = await sectionFor(deps, tx, sectionId, actor);
    return { section, student: await enrolledLearner(deps, tx, section, studentId) };
  });
  const learnerRef = deps.db.doc(`learners/${studentId}`);
  let events = deps.db.collection(`learners/${studentId}/events`).orderBy('effectiveAt', 'desc');
  if (cursor) events = events.startAfter(Timestamp.fromMillis(cursor));
  const [learnerSnap, eventsSnap] = await Promise.all([learnerRef.get(), events.limit(HISTORY_PAGE).get()]);
  const summary = learnerSnap.data() || {};
  const rows = eventsSnap.docs.map(d => {
    const e = d.data();
    return { id: d.id, kind: e.kind, scannedDate: e.scannedDate, scannedTime: e.scannedTime, status: e.status || 'recorded',
      voidReason: e.voidReason || '', deviceLabel: e.deviceLabel || '', delayedSync: e.delayedSync === true, source: e.source || 'kiosk',
      effectiveAtMs: e.effectiveAt?.toMillis?.() ?? 0 };
  });
  return {
    learner: { displayName: summary.displayName || fullName(student.data()), sectionLabel: summary.sectionLabel || section.name || '',
      today: plain(summary.today) || null, recent: plain(summary.recent) || [] },
    events: rows,
    nextCursor: rows.length === HISTORY_PAGE ? rows[rows.length - 1].effectiveAtMs : null,
  };
}
```

The authorization reads run inside a transaction because `loadSchoolActor` and `sectionFor` take a transaction (they call `reader.get(ref)`), as in the other handlers.

In the test the section has no `name`-based label expectation beyond `Rizal`; the fallback `section.name` yields `'Rizal'`, which satisfies `stringContaining('Rizal')`.

In `functions/index.js` add (and import the function):

```js
export const getSchoolLearnerHistoryFn = schoolCall(getSchoolLearnerHistory);
```

- [ ] **Step 4: Run to verify pass**

Run: the Task 1 Step 2 command, then the full functions emulator suite:
`npm run test:functions`
Expected: PASS. If the Firestore emulator rejects `startAfter(Timestamp)` with the descending order, confirm `effectiveAt` is stored as a Timestamp in the test fixture (it is, via `ts()`).

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/sessionAttendance.js functions/index.js functions/test/emulator/sessionAttendance.test.js
git commit -m "feat(functions): adviser learner scan history callable"
```

---

### Task 3: Parent — route, nav mapping and thread ordering

**Files:**
- Modify: `parent/src/lib/router.js:6-9`
- Modify: `parent/src/lib/nav.js:14,17-27`
- Modify: `parent/src/lib/thread.js:56`
- Test: `parent/src/lib/router.test.js`, `parent/src/lib/nav.test.js`, `parent/src/lib/thread.test.js`

**Interfaces:**
- Produces: route name `schoolLearner` with params `{ sectionId, studentId }` for `/school/learner/:sectionId/:studentId`; `portalView` returns `'school'` for it; `activeTab('schoolLearner') === 'class'`; `showsAppTitle('schoolLearner') === false`. `stackDay` orders by `effectiveAtMs` when present.

- [ ] **Step 1: Write failing tests**

`router.test.js`, add inside the "matches static and param routes" test:

```js
    expect(matchRoute('/school/learner/SEC1/S1', '')).toEqual({ name: 'schoolLearner', params: { sectionId: 'SEC1', studentId: 'S1' }, query: {} });
    expect(matchRoute('/school', '').name).toBe('school');
```

`nav.test.js` (read it first to match its import style) add:

```js
  it('treats the adviser learner history as part of the Class tab', () => {
    expect(portalView({ name: 'schoolLearner', query: {} })).toBe('school');
    expect(activeTab('schoolLearner')).toBe('class');
    expect(showsAppTitle('schoolLearner')).toBe(false);
  });
```

`thread.test.js` add:

```js
  it('orders a day by effectiveAtMs from callables as well as Firestore timestamps', () => {
    const day = stackDay([
      { id: 'b', scannedTime: '07:00', effectiveAtMs: 2 },
      { id: 'a', scannedTime: '07:00', effectiveAtMs: 1 },
    ]);
    expect(day.map(e => e.id)).toEqual(['a', 'b']);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix parent test -- router nav thread`
Expected: FAIL (route is `notFound`, nav mapping `null`, order unchanged).

- [ ] **Step 3: Implement**

`router.js`, add before the `learner` entry (more specific first is not needed since patterns are anchored, but keep it adjacent):

```js
  ['schoolLearner', /^\/school\/learner\/([^/]+)\/([^/]+)$/, ['sectionId', 'studentId']],
```

`nav.js`:

```js
export const portalView = (route) => route.name === 'school' || route.name === 'schoolLearner' || (['announcements', 'announcement', 'settings'].includes(route.name) && route.query?.view === 'school') ? 'school' : 'family';
```

add `schoolLearner: 'class',` to `ROUTE_TAB`, and `'schoolLearner'` to the `OWN_HEADER` set.

`thread.js` line 56:

```js
const effectiveMs = (e) => (e.effectiveAtMs ?? (e.effectiveAt?.toMillis ? e.effectiveAt.toMillis() : 0));
```

- [ ] **Step 4: Run to verify pass**

Run: `npm --prefix parent test -- router nav thread`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add parent/src/lib/router.js parent/src/lib/nav.js parent/src/lib/thread.js parent/src/lib/router.test.js parent/src/lib/nav.test.js parent/src/lib/thread.test.js
git commit -m "feat(parent): route and nav mapping for adviser learner history"
```

---

### Task 4: Parent — adviser history screen with day flagging

**Files:**
- Create: `parent/src/screens/school/LearnerHistory.jsx`
- Create: `parent/src/components/AdviserSessionDetails.jsx`
- Modify: `parent/src/components/SessionRows.jsx` (optional action slot)
- Modify: `parent/src/App.jsx:161` (route case), plus the lazy import list at the top of `App.jsx`
- Modify: `parent/src/strings.js`
- Modify: `parent/src/lib/classSession.js` (pure helper + test in `classSession.test.js`)

**Interfaces:**
- Consumes: callables `getSchoolLearnerHistoryFn`, `getSchoolLearnerAttendanceFn`, `setSessionAbsenceFn`; `correctionInput({ sectionId, date, session, row, absent, reason, operationId })` where `row = { studentId, revision }`; `FlagSheet({ rows, session, mode, busy, error, onConfirm, onClose })` with `rows[i].displayName`; `reasonText`; `schoolError`; `historyThread`; `Bubble`; `DayDivider`; `SessionSheet`; `sessionRows(schedule)` returns `[{ key, label }]`.
- Produces: `flagAction(data, key)` in `classSession.js` → `'flag' | 'restore' | null` (null when `!data.canCorrect`); `SessionRows` accepts an optional `renderAction(key)` prop rendered under each session group.

- [ ] **Step 1: Write the failing test for the pure helper**

`parent/src/lib/classSession.test.js`, add (import `flagAction`):

```js
describe('flagAction', () => {
  const data = (over = {}) => ({ canCorrect: true, am: { status: 'P' }, pm: { status: 'A', overrideActive: true }, ...over });
  it('offers Flag for a normal session and Restore for an active flag', () => {
    expect(flagAction(data(), 'am')).toBe('flag');
    expect(flagAction(data(), 'pm')).toBe('restore');
  });
  it('offers nothing when the day cannot be corrected', () => {
    expect(flagAction(data({ canCorrect: false }), 'am')).toBeNull();
    expect(flagAction(null, 'am')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix parent test -- classSession`
Expected: FAIL — `flagAction` is not exported.

- [ ] **Step 3: Implement**

`classSession.js`, add:

```js
// What the adviser can do to one session of a learner's day: Flag it, Restore a flag, or nothing.
export const flagAction = (data, key) => (!data?.canCorrect ? null : data[key]?.overrideActive ? 'restore' : 'flag');
```

`strings.js`: add under the History strings (near `historyLoadOlder`)

```js
  adviserNotInClass: 'This learner is not in your class.',
  adviserFlag: 'Flag as not in class',
  adviserRestore: 'Restore',
  adviserViewOnly: 'Past days are view-only. Your coordinator corrects earlier days in SIMS.',
```

`SessionRows.jsx`: change the signature and render the slot after the Gate line:

```jsx
export default function SessionRows({ data, requestedSession, renderAction }) {
```
```jsx
        <p className="family-session-note">Gate: {formatScanTime(data.gate?.[inKey])} – {formatScanTime(data.gate?.[outKey])}</p>
        {renderAction?.(key)}
```

`AdviserSessionDetails.jsx`:

```jsx
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { callable } from '../firebase.js';
import { manilaDate } from '../../../shared/dates.js';
import { schoolError } from '../lib/school.js';
import { flagAction, correctionInput, reasonText, UNDO_REASON } from '../lib/classSession.js';
import { Field, Inp, Banner, Btn, Spinner } from './ui.jsx';
import SessionRows from './SessionRows.jsx';
import S from '../strings.js';
import './FamilySessionDetails.css';

const FlagSheet = lazy(() => import('../screens/school/FlagSheet.jsx'));

// The Sessions sheet for an adviser: the same rows a family sees, with Flag or
// Restore on today's sessions. Past days have no actions.
export default function AdviserSessionDetails({ sectionId, studentId, displayName, onChanged }) {
  const [date, setDate] = useState(manilaDate());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [sheet, setSheet] = useState(null); // { key, mode }
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [notice, setNotice] = useState(null); // { key, text, undoable }
  const sequence = useRef(0);
  const saveLock = useRef(false);
  useEffect(() => {
    const request = ++sequence.current;
    setError('');
    if (!date) { setData(null); setLoading(false); return undefined; }
    setLoading(true);
    callable('getSchoolLearnerAttendanceFn')({ sectionId, studentId, date }).then(result => {
      if (request === sequence.current) { setData(result.data); setLoading(false); }
    }).catch(e => { if (request === sequence.current) { setError(schoolError(e)); setLoading(false); } });
    return () => { ++sequence.current; };
  }, [sectionId, studentId, date, retry]);

  const save = useCallback((key, absent, reason) => callable('setSessionAbsenceFn')(
    correctionInput({ sectionId, date, session: key, row: { studentId, revision: data.revision }, absent, reason, operationId: crypto.randomUUID() }),
  ), [sectionId, studentId, date, data]);

  const confirm = async (reason) => {
    if (!sheet || saveLock.current) return;
    saveLock.current = true; setSaving(true); setSheetError('');
    const absent = sheet.mode === 'flag';
    try {
      await save(sheet.key, absent, reason);
      setNotice({ key: sheet.key, text: absent ? 'Flagged. Families are told after two minutes unless you undo.' : 'Restored.', undoable: absent });
      setSheet(null);
      setRetry(n => n + 1); onChanged?.();
    } catch (e) {
      setSheetError(schoolError(e));
      if (e?.code === 'functions/aborted') setRetry(n => n + 1);
    } finally { saveLock.current = false; setSaving(false); }
  };

  // Undo is offered only after the reload has brought back the new revision.
  const undo = async () => {
    const key = notice.key; setNotice(null);
    try { await save(key, false, UNDO_REASON); } catch (e) { setError(schoolError(e)); }
    setRetry(n => n + 1); onChanged?.();
  };

  const renderAction = (key) => {
    const action = flagAction(data, key);
    if (!action) return null;
    return <Btn variant="ghost" onClick={() => { setSheetError(''); setSheet({ key, mode: action }); }}>
      {action === 'flag' ? S.adviserFlag : S.adviserRestore}
    </Btn>;
  };

  return <>
    <Field label="School day · Manila"><Inp type="date" value={date} max={manilaDate()} onChange={e => setDate(e.target.value)} /></Field>
    {loading && !data && <Spinner label="Loading session attendance" />}
    {error && <Banner tone="danger" action={<Btn variant="ghost" onClick={() => setRetry(n => n + 1)}>Try again</Btn>}>{error}</Banner>}
    {notice && <Banner tone="warn" action={notice.undoable ? <Btn variant="ghost" disabled={loading} onClick={undo}>Undo</Btn> : null}>{notice.text}</Banner>}
    {data && <SessionRows data={data} renderAction={renderAction} />}
    {data && !data.canCorrect && date !== manilaDate() && <p className="family-session-note">{S.adviserViewOnly}</p>}
    {sheet && <Suspense fallback={null}>
      <FlagSheet rows={[{ studentId, displayName }]} session={sheet.key} mode={sheet.mode} busy={saving} error={sheetError}
        onConfirm={confirm} onClose={() => { if (!saving) setSheet(null); }} />
    </Suspense>}
  </>;
}
```

Implementation notes for the engineer: (a) `Banner` tones — confirm `tone="info"` exists in `parent/src/components/ui.jsx`; if not use `tone="warn"`. (b) `lastKey` is declared after `undo` uses it only at call time, which is fine, but move the `useRef` above `undo` for readability. (c) Undo after Flag must send the new revision: `data.revision` is refreshed by the `setRetry` reload, and `undo` runs after the reload only if the user waits; to be safe have `undo` call `getSchoolLearnerAttendanceFn` first — simpler: disable the Undo button while `loading` (`disabled={loading}`), and render it only when `data.revision` has advanced. Use `disabled={loading}` on the Undo `Btn`.

`LearnerHistory.jsx`:

```jsx
import { useCallback, useLayoutEffect, useEffect, useRef, useState } from 'react';
import { callable } from '../../firebase.js';
import S from '../../strings.js';
import { Btn, Banner, Spinner, EmptyState } from '../../components/ui.jsx';
import { Bubble, DayDivider } from '../../components/Bubble.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SessionSheet from '../../components/SessionSheet.jsx';
import Icon from '../../components/Icon.jsx';
import AdviserSessionDetails from '../../components/AdviserSessionDetails.jsx';
import { eventTitle, latestScanToday, nameCase } from '../../lib/format.js';
import { historyThread } from '../../lib/thread.js';
import { schoolError } from '../../lib/school.js';
import { formatScanTime, localDate } from '../../../../shared/dates.js';

// Same as the parent's scan line, without the parent-only "late sync"/"added" wording changes.
function eventMeta(ev) {
  const voided = ev.status === 'voided';
  return [
    ev.deviceLabel,
    ev.delayedSync && S.eventLate,
    ev.source === 'staff' && !voided && S.eventManual,
    voided && `${S.eventVoided}${ev.voidReason ? `: ${ev.voidReason}` : ''}`,
  ].filter(Boolean).join(' · ');
}

// What a guardian sees for a learner, for the class adviser: scan history and
// the Sessions sheet, where today's sessions can be flagged.
export default function LearnerHistory({ sectionId, studentId, navigate, route }) {
  const [learner, setLearner] = useState(undefined);
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const keepFromBottom = useRef(null);
  const sequence = useRef(0);

  const load = useCallback(async (after) => {
    const request = ++sequence.current;
    setBusy(true);
    try {
      const { data } = await callable('getSchoolLearnerHistoryFn')({ sectionId, studentId, cursor: after });
      if (request !== sequence.current) return;
      setLearner(data.learner);
      setRows((current) => (after ? [...current, ...data.events] : data.events));
      setCursor(data.nextCursor);
      setError('');
    } catch (e) {
      if (request === sequence.current) {
        setError(['functions/permission-denied', 'functions/not-found'].includes(e?.code) ? S.adviserNotInClass : schoolError(e));
        setLearner(null);
      }
    }
    finally { if (request === sequence.current) setBusy(false); }
  }, [sectionId, studentId]);
  useEffect(() => { setLearner(undefined); setRows([]); load(null); return () => { ++sequence.current; }; }, [load]);

  const loadOlder = () => { keepFromBottom.current = document.documentElement.scrollHeight - window.scrollY; load(cursor); };
  useLayoutEffect(() => {
    const page = document.documentElement;
    if (keepFromBottom.current !== null) { window.scrollTo(0, page.scrollHeight - keepFromBottom.current); keepFromBottom.current = null; return; }
    window.scrollTo(0, page.scrollHeight);
  }, [rows]);

  const today = localDate();
  const back = () => navigate('/school');
  return (
    <>
      <PageHeader title={nameCase(learner?.displayName)} avatarName={learner?.displayName} subtitle={learner && `${learner.sectionLabel} · ${S.historyTitle}`}
        status={learner && latestScanToday(learner.today, today)} onBack={back}
        action={learner && (
          <button type="button" className="page-header-icon-btn" aria-label={S.sessionButton} title={S.sessionButton}
            aria-haspopup="dialog" aria-expanded={sessionsOpen} onClick={() => setSessionsOpen(true)}>
            <Icon name="calendar" size={22} />
          </button>
        )} />
      {sessionsOpen && learner && (
        <SessionSheet onClose={() => setSessionsOpen(false)}>
          <AdviserSessionDetails key={studentId} sectionId={sectionId} studentId={studentId} displayName={nameCase(learner.displayName)} onChanged={() => load(null)} />
        </SessionSheet>
      )}
      {error ? <Banner tone="warn" action={<Btn variant="ghost" onClick={back}>Back to class</Btn>}>{error}</Banner>
        : learner === undefined ? <Spinner label={S.loading} />
          : <div className="learner-history">
            {cursor && rows.length > 0 && <Btn variant="ghost" disabled={busy} onClick={loadOlder} style={{ width: '100%' }}>{S.historyLoadOlder}</Btn>}
            {rows.length === 0 && !busy && <EmptyState title={S.historyEmpty} />}
            {historyThread(rows, today).map((day) => (
              <div key={day.date}>
                <DayDivider label={day.label} />
                <div className="bubble-group">
                  {day.items.map((ev, i) => {
                    const voided = ev.status === 'voided';
                    return (
                      <Bubble key={ev.id} id={`ev-${ev.id}`} first={i === 0} last={i === day.items.length - 1}
                        tone={ev.kind === 'in' && !voided ? 'in' : 'out'} struck={voided} title={eventTitle(ev)}
                        time={formatScanTime(ev.scannedTime)} meta={eventMeta(ev)} />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>}
    </>
  );
}
```

`Bubble` without `onClick` renders as a non-button (History already passes `undefined` for voided scans), so scans here are not tappable.

`App.jsx`: add near the other lazy screen imports:

```jsx
const LearnerHistory = lazy(() => import('./screens/school/LearnerHistory.jsx'));
```

(use the same `lazy` pattern as `History`; check how `History` is imported with `grep -n "History" parent/src/App.jsx`) and add the case beside `learner`:

```jsx
    case 'schoolLearner': screen = <LearnerHistory {...props} sectionId={route.params.sectionId} studentId={route.params.studentId} />; break;
```

- [ ] **Step 4: Run to verify pass**

Run: `npm --prefix parent test` then `npm --prefix parent run build`
Expected: all vitest suites PASS and the build completes.

- [ ] **Step 5: Manual check in the emulator browser**

Follow the project memory note "Emulator browser check" (demo project, App Check placeholder, functions/.env.local PORTAL_URL). Seed an adviser, a section, an enrolled learner with events and a `student_attendance` doc for today. Verify: `/school/learner/SEC1/S1` shows bubbles; the calendar icon opens Sessions; Flag on today's AM row opens the sheet, saves, row shows "Absent" with reason and "Updated by"; Undo restores; picking a past date hides the buttons. Do not kill node processes by name.

- [ ] **Step 6: Commit**

```bash
git add parent/src
git commit -m "feat(parent): adviser learner history with Sessions flagging"
```

---

### Task 5: Parent — Class tab row opens the history

**Files:**
- Modify: `parent/src/screens/School.jsx:28` (pass `navigate`)
- Modify: `parent/src/screens/school/ClassTab.jsx` (props, `ClassRow`, `RowGroup`)
- Modify: `parent/src/screens/school/ClassTab.css`
- Test: `parent/src/lib/classSession.test.js` (pure helper) — the row behavior is covered by the manual check below because the repo has no component test harness.

**Interfaces:**
- Consumes: `navigate(path)` from `School` props; route `/school/learner/:sectionId/:studentId` from Task 3.
- Produces: `learnerPath(sectionId, studentId)` in `parent/src/lib/school.js`; `ClassTab({ sections, ended, navigate })`.

Behavior being implemented (from the spec): tapping a row anywhere opens the learner history. Single-learner flagging stays available through a trailing flag button on the row (and the existing Select/multi-select mode, whose row tap toggles the checkbox exactly as today).

- [ ] **Step 1: Write the failing test**

`parent/src/lib/school.test.js`, add (import `learnerPath`):

```js
  it('builds the adviser learner history path with encoded ids', () => {
    expect(learnerPath('SEC1', 'S1')).toBe('/school/learner/SEC1/S1');
    expect(learnerPath('a b', 'c/d')).toBe('/school/learner/a%20b/c%2Fd');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix parent test -- school`
Expected: FAIL — `learnerPath` not exported.

- [ ] **Step 3: Implement**

`school.js`:

```js
export const learnerPath = (sectionId, studentId) => `/school/learner/${encodeURIComponent(sectionId)}/${encodeURIComponent(studentId)}`;
```

`School.jsx` line 28: pass `navigate={navigate}`.

`ClassTab.jsx`:
- Signature: `export default function ClassTab({ sections, ended, navigate })` and import `learnerPath`.
- Pass `onOpen` to every group: `onOpen={(row) => navigate(learnerPath(validSection, row.studentId))}`.
- `RowGroup({ …, onPick, onOpen })` passes both to `ClassRow`.
- Replace the `pick`-on-tap contract: in `ClassRow`, when `selecting && onPick` the row stays a toggle button (unchanged). Otherwise the row body is a button that calls `onOpen`, and when `onPick` exists a second trailing button flags/restores:

```jsx
function ClassRow({ row, session, selecting, checked, onPick, onOpen, flagLabel }) {
  // …status/preview/lead/body exactly as today…
  if (selecting && onPick) {
    return <li><button type="button" className="learner-row" aria-pressed={checked} onClick={onPick}>{body}</button></li>;
  }
  return (
    <li className="class-row">
      <button type="button" className="learner-row" onClick={onOpen} aria-label={`${row.displayName} history`}>{body}</button>
      {onPick && <button type="button" className="class-row-flag" onClick={onPick} aria-label={`${flagLabel} ${row.displayName}`}><Icon name="flag" size={20} /></button>}
    </li>
  );
}
```

  `RowGroup` passes `flagLabel` (`'Flag'` for In school, `'Restore'` for Flagged). Confirm an icon named `flag` exists in `parent/src/components/Icon.jsx`; if not, use the text "Flag"/"Restore" in a `class-link` button instead of an icon.
- Update the group hint: replace `'Tap a learner who isn’t in class.'` with `'Tap a learner for history, or Flag one who isn’t in class.'`.

`ClassTab.css` — add:

```css
.class-row { display: flex; align-items: stretch; gap: 4px; }
.class-row > .learner-row { flex: 1 1 auto; min-width: 0; }
.class-row-flag { flex: 0 0 auto; min-width: 44px; min-height: 44px; border: 0; background: transparent; color: var(--t-text-secondary, inherit); border-radius: 12px; cursor: pointer; }
.class-row-flag:focus-visible { outline: 2px solid var(--t-primary); outline-offset: 2px; }
```

Use the token names already used elsewhere in `ClassTab.css`/`app.css`; grep for the real names before committing (`grep -n "var(--t-" parent/src/screens/school/ClassTab.css`).

- [ ] **Step 4: Run to verify pass**

Run: `npm --prefix parent test` and `npm --prefix parent run build`
Expected: PASS and build OK.

- [ ] **Step 5: Manual check**

In the emulator browser: tap a row → history opens, back returns to Class tab with the same session; trailing flag button opens `FlagSheet` as before; Select mode still toggles rows and does not navigate; Flagged group row opens history and its trailing button restores; past-day roster shows rows that open history but no flag buttons.

- [ ] **Step 6: Commit**

```bash
git add parent/src
git commit -m "feat(parent): Class tab rows open the learner history"
```

---

### Task 6: Full verification and release notes

**Files:**
- Create: `docs/audits/deployments/2026-10-21-adviser-student-history/README.md` (written at deploy time, not now)

- [ ] **Step 1: Run the whole suite**

Run: `npm run test:all`
Expected: all green. Report any failure with its output; do not claim success otherwise.

- [ ] **Step 2: Lint/build**

Run: `npm --prefix parent run build`
Expected: build succeeds.

- [ ] **Step 3: Open a PR (only when the user asks)**

Push the branch and open a PR against `master`. Do not deploy from this worktree.

- [ ] **Step 4: Deployment (only with explicit user approval, per project rules)**

- Functions: `getSchoolLearnerHistoryFn` and `getSchoolLearnerAttendanceFn` are new, and `getFamilyAttendanceFn` changes by refactor. SIMS functions deploy only through the documented release preparer (latest: `docs/releases/2026-10-21-advisory-toggle`; prior notes say live `sessionAttendance.js` differs from root by a gradeLevel fallback, so never deploy these from root `functions/`). Port this change into a new release-tree preparer, adapt `validAttendance` the same way the live tree does, deploy only the new/changed function names, and grep the output to confirm.
- Parent hosting: fetch `origin/master`, then `npm run deploy:parent` with `PARENT_ENV_DIR` pointing at the main checkout's `parent/`; deploy only `hosting:parent`. Verify live HTML and all asset bytes against the new build and record the revision and result under `docs/audits/deployments/2026-10-21-adviser-student-history/`.
- Order: functions first, then hosting, so the screen never calls a missing function.

---

## Self-Review

- **Spec coverage:** callables for history and attendance (Tasks 1–2), shared projection extraction + parity test (Task 1), route and guard (Tasks 3–4; the screen shows "Not in your class" on permission/not-found), history UI reuse and calendar sheet (Task 4), Flag/Restore on today only with undo (Task 4), Class tab row tap and selection preserved (Task 5), no rules change (no task touches `firestore.rules`), tests (Tasks 1–5), deployment notes (Task 6). The route guard that redirects non-school users to Home is covered by the callable's `permission-denied` → "Not in your class" banner; add an explicit redirect only if `School.jsx`'s access check is needed, which the spec lists under access — see Task 4 notes.
- **Things to confirm against real files while implementing (not undefined work):** the `flag` icon name and CSS token names in Task 5, and whether `projection()` already includes `revision` (Task 1 Step 4 shows it).
- **Type consistency:** `canCorrect`, `revision`, `effectiveAtMs`, `nextCursor`, `flagAction`, `learnerPath`, `renderAction` are used with the same names across tasks.
