# Parent Session Attendance Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Learner History in the Parent app opens on the gate-scan bubbles. A **Sessions** button in the top bar opens a bottom sheet whose rows follow the learner's SIMS schedule (AM + PM, Morning shift, Afternoon shift, or none).

**Architecture:** `getFamilyAttendanceFn` adds the section's bell times (`schedule`) to its response. A pure function `sessionRows(schedule)` turns them into row keys and labels. A Firebase-free `SessionRows` component renders them, and `FamilySessionDetails` keeps the fetching. A generic `SessionSheet` portal shows it. `PageHeader` gets an `action` slot for the button. History opens the sheet on request, or automatically for `?date=` notification links.

**Tech Stack:** React 19, Vite 8, Vitest 4 (node env, `src/**/*.test.js` in `parent/`), Firebase Functions + Firestore emulator tests (`functions/test/emulator`).

**Spec:** `docs/superpowers/specs/2026-10-18-parent-session-sheet-design.md`

## Global Constraints

- Work only in this worktree. Run Parent commands from `parent/` and functions commands from the worktree root.
- Parent strings live in `parent/src/strings.js`. No string may contain `location`, `tracking` or `live` (`FORBIDDEN`). That includes words like "delivered".
- Times show as `formatScanTime` from `shared/dates.js` (`"07:30" → "07:30 AM"`). Ranges join with an en dash `–` and no spaces. Name and range are joined by ` · `.
- Morning vs Afternoon shift: single-session schedule, `timeIn < "12:00"` → Morning shift, `timeIn >= "12:00"` → Afternoon shift.
- Single-session schedules use the `am` data slot (`data.am`, gate `timeIn` / `timeOut`).
- `schedule === undefined` (old server) → legacy rows `AM`, `PM` with no times. `schedule === null` → one `Attendance` row.
- Only bell times leave the server (`bellTimes()` in `functions/src/handlers/sessionAttendance.js`). Never the schedule name or ID.
- Tap targets ≥ 44 px. The sheet closes on Close, backdrop tap and Escape. Focus returns to the opener.
- Do not deploy anything. Do not change SIMS (`src/`) files.
- If a task starts a dev or preview server, stop only that server's own process or task. Never kill `node` by name.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `parent/src/lib/sessionRows.js` | Create | `sessionRows(schedule)`, `sessionFootnote(rows)`: schedule → rows |
| `parent/src/lib/sessionRows.test.js` | Create | Unit tests for the above |
| `parent/src/strings.js` | Modify | New `session*` strings |
| `parent/src/lib/strings.test.js` | Modify | Assert the new strings exist |
| `functions/src/handlers/sessionAttendance.js` | Modify | `getFamilyAttendance` returns `schedule` |
| `functions/test/emulator/sessionAttendance.test.js` | Modify | Test the `schedule` field |
| `parent/src/components/SessionRows.jsx` | Create | Firebase-free rows + footnote |
| `parent/src/components/FamilySessionDetails.jsx` | Modify | Date field + fetch, renders `SessionRows`, no Card/h2 |
| `parent/src/components/SessionSheet.jsx` | Create | Portal bottom sheet: title, Close, children |
| `parent/src/components/Icon.jsx` | Modify | Add `calendar` icon |
| `parent/src/components/PageHeader.jsx` | Modify | Optional `action` node in the sticky bar |
| `parent/src/glass.css` | Modify | `.page-header-bar--action`, `.page-header-action`, `.page-header-pill` |
| `parent/src/screens/History.jsx` | Modify | Sessions pill, sheet state, auto-open, drop inline card |
| `parent/tests/browser/session-sheet.config.mjs`, `session-sheet-preview.html`, `session-sheet-preview.jsx` | Create | Synthetic visual preview |

---

### Task 1: Schedule → session rows

**Files:**
- Create: `parent/src/lib/sessionRows.js`
- Create: `parent/src/lib/sessionRows.test.js`
- Modify: `parent/src/strings.js` (append before the closing `};`)
- Modify: `parent/src/lib/strings.test.js`

**Interfaces:**
- Consumes: `hasPmSession(schedule)` from `shared/scheduleSessions.js`. `formatScanTime(hhmm)` from `shared/dates.js`.
- Produces:
  - `sessionRows(schedule: {timeIn,timeOut,pmTimeIn,pmTimeOut}|null|undefined): Array<{ key: 'am'|'pm', label: string }>`
  - `sessionFootnote(rows): string`
  - Strings `S.sessionButton`, `S.sessionTitle`, `S.sessionClose`, `S.sessionAm`, `S.sessionPm`, `S.sessionMorningShift`, `S.sessionAfternoonShift`, `S.sessionWholeDay`, `S.sessionNoMark`, `S.sessionSplitNote`, `S.sessionSingleNote`

- [ ] **Step 1: Write the failing tests**

Create `parent/src/lib/sessionRows.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { sessionRows, sessionFootnote } from './sessionRows.js';

const none = { pmTimeIn: null, pmTimeOut: null };

describe('sessionRows', () => {
  it('shows AM and PM with bell times for a split day', () => {
    expect(sessionRows({ timeIn: '07:30', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:30' })).toEqual([
      { key: 'am', label: 'AM · 07:30 AM–12:00 PM' },
      { key: 'pm', label: 'PM · 01:00 PM–04:30 PM' },
    ]);
  });
  it('calls a single session starting before noon the morning shift', () => {
    expect(sessionRows({ timeIn: '11:59', timeOut: '17:00', ...none })).toEqual([{ key: 'am', label: 'Morning shift · 11:59 AM–05:00 PM' }]);
  });
  it('calls a single session starting at noon or later the afternoon shift', () => {
    expect(sessionRows({ timeIn: '12:00', timeOut: '18:00', ...none })).toEqual([{ key: 'am', label: 'Afternoon shift · 12:00 PM–06:00 PM' }]);
  });
  it('shows one Attendance row without a schedule or a valid time in', () => {
    expect(sessionRows(null)).toEqual([{ key: 'am', label: 'Attendance' }]);
    expect(sessionRows({ timeIn: null, timeOut: '12:00', ...none })).toEqual([{ key: 'am', label: 'Attendance' }]);
  });
  it('drops the times when an end is missing', () => {
    expect(sessionRows({ timeIn: '06:00', timeOut: null, ...none })).toEqual([{ key: 'am', label: 'Morning shift' }]);
  });
  it('falls back to AM and PM when the server sent no schedule', () => {
    expect(sessionRows(undefined)).toEqual([{ key: 'am', label: 'AM' }, { key: 'pm', label: 'PM' }]);
  });
});

describe('sessionFootnote', () => {
  it('explains separate sessions only when there are two rows', () => {
    expect(sessionFootnote(sessionRows(undefined))).toBe('AM and PM attendance are recorded separately. Original gate scans are in the history.');
    expect(sessionFootnote(sessionRows(null))).toBe('Original gate scans are in the history.');
  });
});
```

Append to the end of `parent/src/lib/strings.test.js`, inside the top-level `describe('strings', …)` block (before its closing `});`):

```js
  it('has the session attendance strings', () => {
    for (const k of ['sessionButton', 'sessionTitle', 'sessionClose', 'sessionAm', 'sessionPm', 'sessionMorningShift', 'sessionAfternoonShift',
      'sessionWholeDay', 'sessionNoMark', 'sessionSplitNote', 'sessionSingleNote'])
      expect(typeof S[k], k).toBe('string');
  });
```

- [ ] **Step 2: Run the tests and see them fail**

Run (in `parent/`): `npx vitest run src/lib/sessionRows.test.js src/lib/strings.test.js`
Expected: FAIL. `sessionRows.js` can't be resolved, and the strings test reports `sessionButton` as `undefined`.

- [ ] **Step 3: Add the strings**

In `parent/src/strings.js`, add before the final `};` (after `notFound: …,`):

```js
  sessionButton: 'Sessions',
  sessionTitle: 'Session attendance',
  sessionClose: 'Close',
  sessionAm: 'AM',
  sessionPm: 'PM',
  sessionMorningShift: 'Morning shift',
  sessionAfternoonShift: 'Afternoon shift',
  sessionWholeDay: 'Attendance',
  sessionNoMark: 'No attendance mark',
  sessionSplitNote: 'AM and PM attendance are recorded separately. Original gate scans are in the history.',
  sessionSingleNote: 'Original gate scans are in the history.',
```

- [ ] **Step 4: Implement `sessionRows`**

Create `parent/src/lib/sessionRows.js`:

```js
import { hasPmSession } from '../../../shared/scheduleSessions.js';
import { formatScanTime } from '../../../shared/dates.js';
import S from '../strings.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const valid = (t) => typeof t === 'string' && HHMM.test(t);
const label = (name, from, to) => (valid(from) && valid(to) ? `${name} · ${formatScanTime(from)}–${formatScanTime(to)}` : name);

// The session rows a learner's SIMS schedule calls for. Single-session
// schedules (Morning or Afternoon shift) keep their mark and gate times in the
// `am` slot. `undefined` is a server from before schedules were sent.
export function sessionRows(schedule) {
  if (schedule === undefined) return [{ key: 'am', label: S.sessionAm }, { key: 'pm', label: S.sessionPm }];
  if (hasPmSession(schedule)) {
    return [
      { key: 'am', label: label(S.sessionAm, schedule.timeIn, schedule.timeOut) },
      { key: 'pm', label: label(S.sessionPm, schedule.pmTimeIn, schedule.pmTimeOut) },
    ];
  }
  if (!valid(schedule?.timeIn)) return [{ key: 'am', label: S.sessionWholeDay }];
  const name = schedule.timeIn < '12:00' ? S.sessionMorningShift : S.sessionAfternoonShift;
  return [{ key: 'am', label: label(name, schedule.timeIn, schedule.timeOut) }];
}

export const sessionFootnote = (rows) => (rows.length === 2 ? S.sessionSplitNote : S.sessionSingleNote);
```

- [ ] **Step 5: Run the tests and see them pass**

Run (in `parent/`): `npx vitest run src/lib/sessionRows.test.js src/lib/strings.test.js`
Expected: PASS (all tests in both files).

- [ ] **Step 6: Commit**

```bash
git add parent/src/lib/sessionRows.js parent/src/lib/sessionRows.test.js parent/src/strings.js parent/src/lib/strings.test.js
git commit -m "Derive Parent session rows from the SIMS schedule"
```

(End the commit message with the session's `Co-Authored-By` attribution line.)

---

### Task 2: Family attendance returns the section's bell times

**Files:**
- Modify: `functions/src/handlers/sessionAttendance.js:150-152` (inside `getFamilyAttendance`)
- Test: `functions/test/emulator/sessionAttendance.test.js` (inside `describe('session corrections', …)`)

**Interfaces:**
- Consumes: existing `bellTimes(schedule)` and `identifier(value)` in the same file.
- Produces: `getFamilyAttendance` result gains `schedule: { timeIn, timeOut, pmTimeIn, pmTimeOut } | null` (each value `"HH:MM"` or `null`). Task 3 reads `data.schedule`.

- [ ] **Step 1: Write the failing test**

Add this `it` inside `describe('session corrections', () => { … })` in `functions/test/emulator/sessionAttendance.test.js`, after the `'rejects subjects, …'` test:

```js
  it('gives families only the bell times of the section schedule', async () => {
    const family = () => getFamilyAttendance(deps('gA'), { studentId: 'S1', date: '2026-09-21' });
    expect((await family()).schedule).toBeNull();
    await db().doc('schedules/SCH1').set({ name: 'Afternoon Shift', timeIn: '12:30', timeOut: '18:00', gradeLevels: [7] });
    await db().doc('sections/SEC1').update({ scheduleId: 'SCH1' });
    expect((await family()).schedule).toEqual({ timeIn: '12:30', timeOut: '18:00', pmTimeIn: null, pmTimeOut: null });
    await db().doc('sections/SEC1').update({ scheduleId: 'GONE' });
    expect((await family()).schedule).toBeNull();
  });
```

- [ ] **Step 2: Run it and see it fail**

Run (worktree root):
`NODE_OPTIONS=--dns-result-order=ipv4first node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --project demo-school-access --only firestore,auth "npm --prefix functions run test:emulator -- test/emulator/sessionAttendance.test.js"`
Expected: FAIL. The new test gets `undefined` where it expected `null`.

- [ ] **Step 3: Implement**

In `getFamilyAttendance`, replace:

```js
    const attendance = (await tx.get(deps.db.doc(`student_attendance/${sectionId}_${date}`))).data();
    validAttendance(attendance, section, date);
    return { ...projection(attendance, studentId), date, sectionId, schoolYear };
```

with:

```js
    const [attendanceSnap, scheduleSnap] = await Promise.all([
      tx.get(deps.db.doc(`student_attendance/${sectionId}_${date}`)),
      identifier(section.scheduleId) ? tx.get(deps.db.doc(`schedules/${section.scheduleId}`)) : null,
    ]);
    const attendance = attendanceSnap.data();
    validAttendance(attendance, section, date);
    // Families get the bell times so the Parent app can label AM/PM or the shift.
    return { ...projection(attendance, studentId), date, sectionId, schoolYear, schedule: bellTimes(scheduleSnap?.data()) };
```

(`bellTimes(undefined)` is `null`, which covers a missing or deleted schedule.)

- [ ] **Step 4: Run it and see it pass**

Run the same command as Step 2.
Expected: PASS. Every test in `sessionAttendance.test.js` passes, including the existing `getFamilyAttendance` assertions.

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/sessionAttendance.js functions/test/emulator/sessionAttendance.test.js
git commit -m "Send the section bell times with family session attendance"
```

---

### Task 3: Session rows, sheet and calendar icon

**Files:**
- Create: `parent/src/components/SessionRows.jsx`
- Modify: `parent/src/components/FamilySessionDetails.jsx` (whole file)
- Create: `parent/src/components/SessionSheet.jsx`
- Modify: `parent/src/components/Icon.jsx` (add one line after the `clock` icon)
- Create: `parent/tests/browser/session-sheet.config.mjs`, `parent/tests/browser/session-sheet-preview.html`, `parent/tests/browser/session-sheet-preview.jsx`

**Interfaces:**
- Consumes: `sessionRows`, `sessionFootnote`, `S.session*` (Task 1). `data.schedule` (Task 2).
- Produces:
  - `<SessionRows data={getFamilyAttendanceFn result} requestedSession={'am'|'pm'|undefined} />`
  - `<FamilySessionDetails studentId requestedDate requestedSession />`: same props as today. It now renders a fragment (date field + rows), not a Card.
  - `<SessionSheet onClose={() => void}>{children}</SessionSheet>`
  - `<Icon name="calendar" />`

- [ ] **Step 1: Create `SessionRows.jsx`**

```jsx
import { formatScanTime } from '../../../shared/dates.js';
import { correctionTime } from '../lib/school.js';
import { sessionRows, sessionFootnote } from '../lib/sessionRows.js';
import S from '../strings.js';

const MARKS = { P: 'Present', L: 'Late', A: 'Absent', E: 'Excused' };
const GATE = { am: ['timeIn', 'timeOut'], pm: ['pmTimeIn', 'pmTimeOut'] };

// One row per session in the learner's SIMS schedule, from a
// getFamilyAttendanceFn result. No Firebase here, so previews can render it.
export default function SessionRows({ data, requestedSession }) {
  const rows = sessionRows(data.schedule);
  // A single-session day keeps its data in `am`, so any requested session is that row.
  const highlight = requestedSession && rows.length === 1 ? 'am' : requestedSession;
  return <>
    {rows.map(({ key, label }) => {
      const session = data[key];
      const [inKey, outKey] = GATE[key];
      return <div key={key} aria-label={`${label} attendance`} style={{ padding: '12px 0', borderTop: '1px solid var(--t-border)', fontWeight: highlight === key ? 600 : 400 }}>
        <strong style={{ display: 'block' }}>{label}</strong>
        <p style={{ margin: '4px 0 0', fontSize: 15 }}>{MARKS[session?.status] || S.sessionNoMark}</p>
        {session?.reason && <p style={{ margin: '8px 0', fontSize: 14 }}>{session.reason}</p>}
        {(session?.actorName || session?.changedAt) && <p className="family-session-note">{[session.actorName && `Updated by ${session.actorName}`, correctionTime(session.changedAt)].filter(Boolean).join(' · ')}</p>}
        <p className="family-session-note">Gate: {formatScanTime(data.gate?.[inKey])} – {formatScanTime(data.gate?.[outKey])}</p>
      </div>;
    })}
    <p className="family-session-note">{sessionFootnote(rows)}</p>
  </>;
}
```

- [ ] **Step 2: Slim `FamilySessionDetails.jsx` down to date + fetch**

Replace the whole file with:

```jsx
import { useEffect, useRef, useState } from 'react';
import { callable } from '../firebase.js';
import { manilaDate } from '../../../shared/dates.js';
import { schoolError } from '../lib/school.js';
import { Field, Inp, Banner, Btn, Spinner } from './ui.jsx';
import SessionRows from './SessionRows.jsx';
import './FamilySessionDetails.css';

// The body of the Session attendance sheet: a school day picker and that day's rows.
export default function FamilySessionDetails({ studentId, requestedDate, requestedSession }) {
  const [date, setDate] = useState(requestedDate || manilaDate());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const sequence = useRef(0);
  useEffect(() => { setDate(requestedDate || manilaDate()); }, [studentId, requestedDate]);
  useEffect(() => {
    const request = ++sequence.current;
    setData(null); setError('');
    if (!date) { setLoading(false); return; }
    setLoading(true);
    callable('getFamilyAttendanceFn')({ studentId, date }).then(result => {
      if (request === sequence.current) { setData(result.data); setLoading(false); }
    }).catch(e => { if (request === sequence.current) { setError(schoolError(e)); setLoading(false); } });
    return () => { ++sequence.current; };
  }, [studentId, date, retry]);
  return <>
    <Field label="School day · Manila"><Inp type="date" value={date} max={manilaDate()} onChange={e => setDate(e.target.value)} /></Field>
    {loading && <Spinner label="Loading session attendance" />}
    {error && <Banner tone="danger" action={<Btn variant="ghost" onClick={() => setRetry(value => value + 1)}>Try again</Btn>}>{error}</Banner>}
    {data && <SessionRows data={data} requestedSession={date === requestedDate ? requestedSession : undefined} />}
  </>;
}
```

(`requestedSession` only highlights on the notification's own date. When the parent picks another day, nothing is bold.)

- [ ] **Step 3: Create `SessionSheet.jsx`**

```jsx
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn } from './ui.jsx';

// Bottom sheet for a learner's session attendance. Portalled to <body> so no
// .glass-card backdrop-filter traps the fixed overlay (see ScanSheet).
export default function SessionSheet({ onClose, children }) {
  const dialog = useRef(null);
  // Focus moves into the sheet on open and back to the Sessions button on close.
  useEffect(() => {
    const opener = document.activeElement;
    dialog.current?.focus();
    return () => { if (opener instanceof HTMLElement) opener.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'grid', alignItems: 'end', justifyItems: 'center' }}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="session-sheet-title"
        style={{ width: 'min(100%, 480px)', boxSizing: 'border-box', maxHeight: '85dvh', overflowY: 'auto', background: T.surface, color: T.ink, fontFamily: T.font,
          borderRadius: `${T.radius}px ${T.radius}px 0 0`, padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))', outline: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <h2 id="session-sheet-title" style={{ fontSize: 18, margin: 0 }}>{S.sessionTitle}</h2>
          <Btn variant="ghost" onClick={onClose} style={{ padding: '6px 16px' }}>{S.sessionClose}</Btn>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Add the calendar icon**

In `parent/src/components/Icon.jsx`, after the `clock` line add:

```jsx
      {name === 'calendar' && <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>}
```

- [ ] **Step 5: Build the browser preview**

Create `parent/tests/browser/session-sheet.config.mjs`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renders SessionSheet + SessionRows and the History header pill with synthetic
// attendance. None of them import Firebase, so nothing needs stubbing.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5193, strictPort: true },
  cacheDir: 'node_modules/.vite-session-sheet-preview',
});
```

Create `parent/tests/browser/session-sheet-preview.html`:

```html
<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Session sheet preview</title></head><body><div id="root"></div><script type="module" src="/tests/browser/session-sheet-preview.jsx"></script></body></html>
```

Create `parent/tests/browser/session-sheet-preview.jsx` (the header part is added in Task 4, Step 5):

```jsx
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../shared/theme/theme.css';
import '../../src/glass.css';
import '../../src/components/FamilySessionDetails.css';
import SessionSheet from '../../src/components/SessionSheet.jsx';
import SessionRows from '../../src/components/SessionRows.jsx';

const mark = (status, extra = {}) => ({ status, absent: status === 'A', overrideActive: false, reason: '', actorName: '', changedAt: null, ...extra });
const CASES = [
  { id: 'split', title: 'AM + PM day, PM corrected (notification)', requested: 'pm', data: {
    schedule: { timeIn: '07:30', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:30' },
    gate: { timeIn: '07:12', timeOut: '12:03', pmTimeIn: null, pmTimeOut: null },
    am: mark('P'), pm: mark('A', { overrideActive: true, reason: 'Left after lunch', actorName: 'Ms. Reyes', changedAt: '2026-10-18T06:10:00Z' }) } },
  { id: 'morning', title: 'Morning shift', data: {
    schedule: { timeIn: '06:00', timeOut: '12:00', pmTimeIn: null, pmTimeOut: null },
    gate: { timeIn: '06:21', timeOut: '12:01', pmTimeIn: null, pmTimeOut: null }, am: mark('L'), pm: mark('L') } },
  { id: 'afternoon', title: 'Afternoon shift', data: {
    schedule: { timeIn: '12:30', timeOut: '18:00', pmTimeIn: null, pmTimeOut: null },
    gate: { timeIn: '12:24', timeOut: '18:02', pmTimeIn: null, pmTimeOut: null }, am: mark('P'), pm: mark('P') } },
  { id: 'none', title: 'No schedule assigned', data: { schedule: null, gate: {}, am: mark('no_scan'), pm: mark('no_scan') } },
  { id: 'legacy', title: 'Old server (no schedule key)', data: { gate: {}, am: mark('P'), pm: mark('P') } },
];

function Case({ c }) {
  const [open, setOpen] = useState(false);
  return (
    <section data-case={c.id} style={{ padding: 16, borderBottom: '1px solid var(--t-border)' }}>
      <button type="button" onClick={() => setOpen(true)} style={{ minHeight: 44 }}>{c.title}</button>
      {open && <SessionSheet onClose={() => setOpen(false)}><SessionRows data={c.data} requestedSession={c.requested} /></SessionSheet>}
    </section>
  );
}

createRoot(document.getElementById('root')).render(<main style={{ maxWidth: 480, margin: '0 auto', position: 'relative' }}>
  <aside style={{ padding: 12, textAlign: 'center', fontSize: 12 }}>Synthetic attendance · no Firebase access</aside>
  {CASES.map((c) => <Case key={c.id} c={c} />)}
</main>);
```

- [ ] **Step 6: Check the preview**

Start it in the background from `parent/`: `npx vite --config tests/browser/session-sheet.config.mjs`. Open `http://127.0.0.1:5193/tests/browser/session-sheet-preview.html` at 375 × 812, light and dark. For each case, open the sheet and confirm:
- `split`: rows `AM · 07:30 AM–12:00 PM` and `PM · 01:00 PM–04:30 PM`. PM is bold and shows the reason and "Updated by Ms. Reyes · … Manila". The footnote mentions AM and PM.
- `morning`: one row `Morning shift · 06:00 AM–12:00 PM` · Late · Gate 06:21 AM – 12:01 PM.
- `afternoon`: one row `Afternoon shift · 12:30 PM–06:00 PM`.
- `none`: one row `Attendance` · No attendance mark · Gate: — – —.
- `legacy`: rows `AM` and `PM`.
- Close, backdrop tap and Escape each close it. Focus returns to the case button. Nothing scrolls sideways.

Stop only the preview server you started.

- [ ] **Step 7: Run the Parent unit tests**

Run (in `parent/`): `npm test`
Expected: PASS (all files).

- [ ] **Step 8: Commit**

```bash
git add parent/src/components/SessionRows.jsx parent/src/components/FamilySessionDetails.jsx parent/src/components/SessionSheet.jsx parent/src/components/Icon.jsx parent/tests/browser/session-sheet.config.mjs parent/tests/browser/session-sheet-preview.html parent/tests/browser/session-sheet-preview.jsx
git commit -m "Add the Parent session attendance sheet and schedule-aware rows"
```

---

### Task 4: Sessions button in the History header

**Files:**
- Modify: `parent/src/components/PageHeader.jsx:21,50-61`
- Modify: `parent/src/glass.css` (after the `.page-header-back:focus-visible` rule, line ~141)
- Modify: `parent/src/screens/History.jsx`
- Modify: `parent/tests/browser/session-sheet-preview.jsx`

**Interfaces:**
- Consumes: `SessionSheet`, `FamilySessionDetails` (Task 3). `Icon name="calendar"`. `S.sessionButton`.
- Produces: `PageHeader` prop `action?: ReactNode`.

- [ ] **Step 1: Add the `action` slot to `PageHeader`**

Change the signature and comment:

```jsx
// Large title that scrolls away with the page, plus a sticky bar that picks
// the title up once it has scrolled under it (iOS "large title" pattern).
// `logo` (an image src) or `avatarName` (initials) adds a mark beside the
// title; `onBack` adds a back button; `action` sits at the bar's right end.
export default function PageHeader({ title, subtitle, status, logo, avatarName, onBack, action }) {
```

Replace the bar's opening tag and add the action after the compact title:

```jsx
      <div ref={barRef} className={`page-header-bar${collapsed ? ' page-header-bar--collapsed' : ''}${action ? ' page-header-bar--action' : ''}`}>
        {onBack && (
          <button type="button" className="page-header-back" aria-label={S.back} onClick={onBack}>
            <Icon name="back" size={22} />
          </button>
        )}
        {title && (
          <div className="page-header-compact" aria-hidden="true">
            <Mark logo={logo} avatarName={avatarName} compact />
            <span className="page-header-compact-title">{title}</span>
          </div>
        )}
        {action && <div className="page-header-action">{action}</div>}
      </div>
```

- [ ] **Step 2: Style the slot and the pill**

In `parent/src/glass.css`, after `.page-header-back:focus-visible { … }` add:

```css
/* The Shell's theme button sits at the top right (right: 16px, 44px wide), so a
   bar with an action keeps that corner clear: 16 + 44 + 8px gap. */
.page-header-bar--action { padding-right: 68px; }
.page-header-action { margin-left: auto; flex: 0 0 auto; }
.page-header-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid var(--t-glass-edge);
  border-radius: 999px;
  background: rgba(var(--t-glass-rgb), 0.72);
  color: var(--t-primary);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.page-header-pill:focus-visible { outline: 2px solid var(--t-focus); outline-offset: 2px; }
```

- [ ] **Step 3: Wire History**

In `parent/src/screens/History.jsx`:

1. Add imports:

```jsx
import SessionSheet from '../components/SessionSheet.jsx';
import Icon from '../components/Icon.jsx';
```

(Keep the existing `FamilySessionDetails` import.)

2. Inside `History`, after the `useDoc` line, add:

```jsx
  // Session attendance opens on request, or straight away from an
  // "Attendance updated" notification (?date=…&session=…).
  const [sessionsOpen, setSessionsOpen] = useState(Boolean(route.query.date));
  useEffect(() => { if (route.query.date) setSessionsOpen(true); }, [studentId, route.query.date]);
```

3. In the `useLayoutEffect`, delete the line:

```jsx
    else if (route.query.date) document.getElementById('session-details')?.scrollIntoView({ block: 'start' });
```

4. Replace the `PageHeader` element and the inline `FamilySessionDetails` line with:

```jsx
      <PageHeader title={nameCase(learner?.displayName)} avatarName={learner?.displayName} subtitle={learner && `${learner.sectionLabel} · ${S.historyTitle}`}
        status={learner && latestScanToday(learner.today, today)} onBack={() => navigate('/')}
        action={learner && !error && (
          <button type="button" className="page-header-pill" aria-haspopup="dialog" aria-expanded={sessionsOpen} onClick={() => setSessionsOpen(true)}>
            <Icon name="calendar" size={18} />{S.sessionButton}
          </button>
        )} />
      {sessionsOpen && learner && !error && (
        <SessionSheet onClose={() => setSessionsOpen(false)}>
          <FamilySessionDetails key={studentId} studentId={studentId} requestedDate={route.query.date} requestedSession={route.query.session} />
        </SessionSheet>
      )}
```

`onClose` is a fresh function each render. `SessionSheet` only re-subscribes its Escape listener on change, so that is fine.

- [ ] **Step 4: Build to catch import and JSX errors**

Run (in `parent/`): `npm run build`
Expected: the build succeeds. If it fails on `jsqr`, see the memory note on worktree Parent builds: temporarily junction the main checkout's `parent/node_modules/jsqr`, then remove the junction afterwards.

Then: `npm run size`
Expected: the eager bundle is reported under the 260 KB limit (History is route-split, so it should be unchanged).

- [ ] **Step 5: Add the header to the preview and check it**

In `parent/tests/browser/session-sheet-preview.jsx`, add imports:

```jsx
import PageHeader from '../../src/components/PageHeader.jsx';
import Icon from '../../src/components/Icon.jsx';
```

and render this as the first child of `<main>` (before the `<aside>`). It mimics the Shell's theme button position:

```jsx
  <div style={{ position: 'relative', padding: '14px 16px 0' }}>
    <div aria-hidden="true" style={{ position: 'absolute', top: 14, right: 16, width: 44, height: 44, borderRadius: 999, border: '1px solid var(--t-glass-edge)' }} />
    <PageHeader title="Ella Marie Austral Dela Cruz" avatarName="Ella Marie Austral Dela Cruz" subtitle="Grade 7 – AMIABLE · Gate scans" status="No entry recorded today"
      onBack={() => {}} action={<button type="button" className="page-header-pill"><Icon name="calendar" size={18} />Sessions</button>} />
  </div>
```

Start the preview again (`npx vite --config tests/browser/session-sheet.config.mjs` in `parent/`). At 375 px, light and dark, confirm:
- The pill sits right of the back arrow and left of the theme-button circle, with no overlap.
- The pill is at least 44 px tall.
- The long name wraps below.
- Nothing scrolls sideways.

Stop only the preview server you started.

- [ ] **Step 6: Run the Parent unit tests**

Run (in `parent/`): `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add parent/src/components/PageHeader.jsx parent/src/glass.css parent/src/screens/History.jsx parent/tests/browser/session-sheet-preview.jsx
git commit -m "Open session attendance from a Sessions button on Learner History"
```

---

### Task 5: Final verification

**Files:** none changed (fix-ups only if a check fails).

- [ ] **Step 1: Parent tests + build + size**

Run (in `parent/`): `npm test && npm run build && npm run size`
Expected: all pass. Size is under the limit.

- [ ] **Step 2: Functions unit + emulator tests**

Run (worktree root): `npm --prefix functions test`
Then: `NODE_OPTIONS=--dns-result-order=ipv4first node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --project demo-school-access --only firestore,auth "npm --prefix functions run test:emulator"`
Expected: all pass.

- [ ] **Step 3: Behavior read-through against the spec**

Confirm by reading `History.jsx`:
- With no `?date=`, the sheet is closed. Bubbles render, and the page lands at the bottom.
- With `?date=…&session=…`, the sheet is open on that date and that row is bold.
- `?event=…` still scrolls to and highlights that bubble, with the sheet closed.
- The pill is not rendered while the learner is loading or access is denied.

- [ ] **Step 4: Release notes for the deploy**

No commit needed unless the user asks. Report that the release needs **both** the `getFamilyAttendanceFn` functions deploy and the Parent `hosting:parent` deploy, in either order. Before the functions deploy, the sheet shows legacy AM/PM rows.

Functions release path (read `docs/releases/2026-10-18-school-family/README.md` first):

- Do **not** deploy `getFamilyAttendanceFn` from the root `functions/` on master. The root `validAttendance` requires `attendance.gradeLevel`, and live `onScanEventCreated` never writes it, so every live attendance doc would fail with "Attendance record requires administrator repair".
- Prepare the backend: `node docs/releases/2026-10-18-school-family/prepareBackend.mjs --copy-dependencies`. It writes to `.superpowers/releases/school-family/backend` (must not already exist) and applies `adaptSessionAttendance`.
- Deploy only that function from the prepared tree: `firebase deploy --config firebase.school-family-release.json --project bnhs-sims --only functions:getFamilyAttendanceFn`. Supply `PORTAL_URL` in the prepared `.env.bnhs-sims`, and use the IPv4-first and longer-discovery-timeout settings for this machine.
- Parent side: Parent App release flow (`hosting:parent` only, then byte-check).
