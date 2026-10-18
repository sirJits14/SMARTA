# SIMS School Access and Session Review Implementation Plan (Plan C of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SIMS the only place school roles are managed and earlier-day attendance is corrected. The approval queue goes away, legacy advisers show as one row per teacher with a one-click "Use in form", and a new **Session review** tab gives admins and coordinators grade-wide AM/PM review.

**Architecture:** Two SIMS surfaces change. `src/pages/guardians/SchoolAccessTab.jsx` (admin only) drops requests and uses `legacyAdvisers` from `getSchoolContextFn`. `App.jsx`'s `AttendanceArea` gains a third tab that renders the new `src/pages/SessionReviewPage.jsx`, which calls the existing `getSchoolRosterFn` / `setSessionAbsenceFn` callables. Pure logic lives in `src/lib/` with unit tests. Components are tested with `renderToStaticMarkup`, like `src/pages/SectionsPage.test.js`.

**Tech Stack:** React 19, Vite, Vitest 4, Firebase callables.

## Global Constraints

- Depends on Plan A (`docs/superpowers/plans/2026-10-18-school-mode-backend.md`) being merged: `getSchoolContextFn` returns `legacyAdvisers` and no `reviewRequests`, and coordinators (`jhs_coord`, `shs_coord`, `glc`) are authorized for their grades by the backend. Plan B's `parent/src/lib/classSession.js` must exist; this plan imports `FLAG_REASONS`, `RESTORE_REASONS`, `reasonText`, `correctionInput` and `enteredFor` from it. If Plan B isn't merged yet, implement Plan B Task 1 first.
- Wording: a flagged session reads `Not in class`. Reasons are verbatim `Not in class`, `Left during class`, `Other reason…`, `Was in class`, `Flagged by mistake`.
- SIMS design system (`DESIGN.md`): working surfaces are calm and nearly opaque; tables scroll inside named regions; 44px hit areas; visible labels; colors only through `T` or `var(--t-*)`.
- **Production SIMS is not built from master** while the coordinator rollout is held. Shipping this needs a port onto the release tree (`docs/releases/2026-10-18-school-family/prepareSims.mjs` plus an overlay) and a byte check. That is outside this plan, and it needs the user's approval.
- No deployment in this plan.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/schoolAssignments.js` (create) | Legacy adviser rows and form prefill. |
| `src/lib/schoolAssignments.test.js` (create) | Unit tests. |
| `src/pages/guardians/LegacyAdvisers.jsx` (create) | One row per legacy adviser with "Use in form". |
| `src/pages/guardians/LegacyAdvisers.test.js` (create) | Static render tests. |
| `src/pages/guardians/SchoolAccessTab.jsx` (rewrite) | Assign, active assignments, legacy advisers. No requests. |
| `src/lib/sessionReview.js` (create) | Reviewer section scope and cell labels. |
| `src/lib/sessionReview.test.js` (create) | Unit tests. |
| `src/pages/SessionReviewPage.jsx` (create) | Section/date picker, AM/PM table, correction form. |
| `src/pages/SessionReviewPage.test.js` (create) | Static render tests. |
| `src/App.jsx` (modify) | Third attendance tab "Session Review". |

---

### Task 1: Legacy advisers per teacher and no approval queue

**Files:**
- Create: `src/lib/schoolAssignments.js`, `src/lib/schoolAssignments.test.js`, `src/pages/guardians/LegacyAdvisers.jsx`, `src/pages/guardians/LegacyAdvisers.test.js`
- Rewrite: `src/pages/guardians/SchoolAccessTab.jsx`

**Interfaces:**
- Consumes: `context.legacyAdvisers: Array<{ guardianUid, email, name, learnerCount, suggestedSectionId }>`, `context.managedAssignments: Array<{ uid, role, sectionId?, gradeLevel?, email, displayName }>`, `context.sections`.
- Produces: `legacyAdviserRows(advisers, managedAssignments) → Array<adviser & { assigned: boolean }>`, `assignmentFromLegacy(adviser) → { email, role: 'adviser', sectionId, gradeLevel: '' }`, `LegacyAdvisers({ rows, sections, disabled, onUse })`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/schoolAssignments.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { legacyAdviserRows, assignmentFromLegacy } from './schoolAssignments.js';

const adviser = { guardianUid: 't1', email: 't1@deped.gov.ph', name: 'Ana Cruz', learnerCount: 38, suggestedSectionId: 'MABINI' };

describe('legacy adviser rows', () => {
  it('marks teachers who already hold an adviser assignment', () => {
    expect(legacyAdviserRows([adviser, { ...adviser, guardianUid: 't2' }], [{ uid: 't1', role: 'adviser' }, { uid: 't2', role: 'subject_teacher' }]))
      .toEqual([{ ...adviser, assigned: true }, { ...adviser, guardianUid: 't2', assigned: false }]);
  });
  it('tolerates a missing list', () => {
    expect(legacyAdviserRows(undefined, undefined)).toEqual([]);
  });
  it('prefills the assignment form with the suggested section', () => {
    expect(assignmentFromLegacy(adviser)).toEqual({ email: 't1@deped.gov.ph', role: 'adviser', sectionId: 'MABINI', gradeLevel: '' });
    expect(assignmentFromLegacy({ ...adviser, suggestedSectionId: null }).sectionId).toBe('');
  });
});
```

Create `src/pages/guardians/LegacyAdvisers.test.js`:

```js
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LegacyAdvisers from './LegacyAdvisers.jsx';

const h = React.createElement;
const sections = [{ id: 'MABINI', name: 'Mabini', gradeLevel: 8 }];
const row = { guardianUid: 't1', email: 't1@deped.gov.ph', name: 'Ana Cruz', learnerCount: 38, suggestedSectionId: 'MABINI', assigned: false };

describe('LegacyAdvisers', () => {
  it('shows one row per teacher with the likely section and a form shortcut', () => {
    const html = renderToStaticMarkup(h(LegacyAdvisers, { rows: [row], sections, disabled: false, onUse: () => {} }));
    expect(html).toContain('Ana Cruz');
    expect(html).toContain('38 learner links');
    expect(html).toContain('Likely Grade 8 · Mabini');
    expect(html).toContain('Use in form');
  });
  it('shows Assigned instead of the shortcut once assigned', () => {
    const html = renderToStaticMarkup(h(LegacyAdvisers, { rows: [{ ...row, assigned: true }], sections, disabled: false, onUse: () => {} }));
    expect(html).toContain('Assigned');
    expect(html).not.toContain('Use in form');
  });
  it('says when nothing is left to verify', () => {
    expect(renderToStaticMarkup(h(LegacyAdvisers, { rows: [], sections, disabled: false, onUse: () => {} }))).toContain('No legacy adviser links to verify.');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/schoolAssignments.test.js src/pages/guardians/LegacyAdvisers.test.js`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the helpers and the list**

Create `src/lib/schoolAssignments.js`:

```js
// Legacy adviser rows for Guardians → School access: one per teacher, marked
// once that teacher already holds an adviser assignment this year.
export function legacyAdviserRows(advisers = [], managedAssignments = []) {
  const assigned = new Set((managedAssignments || []).filter((a) => a.role === 'adviser').map((a) => a.uid));
  return (advisers || []).map((adviser) => ({ ...adviser, assigned: assigned.has(adviser.guardianUid) }));
}

export const assignmentFromLegacy = (adviser) => ({ email: adviser.email || '', role: 'adviser', sectionId: adviser.suggestedSectionId || '', gradeLevel: '' });
```

Create `src/pages/guardians/LegacyAdvisers.jsx`:

```jsx
import { Btn } from '../../components/ui.jsx';
import { T } from '../../styles.js';
import { sectionLabel } from '../../../parent/src/lib/school.js';

// Old adviser slips grant nothing now. Each teacher who used one appears once,
// with the class most of their learners are in, so an administrator can
// confirm and assign in one pass.
export default function LegacyAdvisers({ rows, sections, disabled, onUse }) {
  if (!rows.length) return <p style={{ fontSize: 13 }}>No legacy adviser links to verify.</p>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {rows.map((row) => {
        const section = sections.find((s) => s.id === row.suggestedSectionId);
        const details = [row.email, `${row.learnerCount} learner link${row.learnerCount === 1 ? '' : 's'}`, section ? `Likely ${sectionLabel(section)}` : 'Section unknown'];
        return (
          <li key={row.guardianUid} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 0', borderTop: `1px solid ${T.border}` }}>
            <span style={{ minWidth: 0 }}>
              <strong>{row.name || row.email || 'Unnamed account'}</strong><br />
              <span style={{ fontSize: 13, color: T.inkMuted, overflowWrap: 'anywhere' }}>{details.filter(Boolean).join(' · ')}</span>
            </span>
            {row.assigned
              ? <span style={{ fontSize: 13, fontWeight: 600, color: T.inkMuted }}>Assigned</span>
              : <Btn variant="ghost" disabled={disabled || !row.email} onClick={() => onUse(row)}>Use in form</Btn>}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/schoolAssignments.test.js src/pages/guardians/LegacyAdvisers.test.js`
Expected: PASS.

- [ ] **Step 5: Rewrite SchoolAccessTab without requests**

Replace the whole of `src/pages/guardians/SchoolAccessTab.jsx` with:

```jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { Btn, Card, Field, Inp, Sel } from '../../components/ui.jsx';
import { T, S } from '../../styles.js';
import { ROLE_LABELS, sectionLabel, schoolError } from '../../../parent/src/lib/school.js';
import { legacyAdviserRows, assignmentFromLegacy } from '../../lib/schoolAssignments.js';
import LegacyAdvisers from './LegacyAdvisers.jsx';

const invoke = async (name, data = {}) => (await httpsCallable(functions, name)(data)).data;
const EMPTY = { email: '', role: 'adviser', sectionId: '', gradeLevel: '' };

// School roles are assigned here, by administrators only. Teachers no longer
// request access in the parent app; an assignment sends them an inbox note.
export default function SchoolAccessTab() {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const sequence = useRef(0);
  const formRef = useRef(null);
  const [assignment, setAssignment] = useState(EMPTY);
  const [revoking, setRevoking] = useState(null);
  const [reason, setReason] = useState('');
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError('');
    try { const data = await invoke('getSchoolContextFn'); if (request === sequence.current) setContext(data); }
    catch (e) { if (request === sequence.current) setError(schoolError(e)); }
    finally { if (request === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { refresh(); return () => { ++sequence.current; }; }, [refresh]);
  const run = async (name, payload, message, after = () => {}) => {
    if (lock.current) return;
    lock.current = true; setPending(true); setError(''); setNotice('');
    try { await invoke(name, payload); after(); await refresh(); setNotice(message); }
    catch (e) { setError(schoolError(e)); }
    finally { lock.current = false; setPending(false); }
  };
  const scope = (item) => (item.sectionId ? sectionLabel(context?.sections?.find((section) => section.id === item.sectionId)) : `Grade ${item.gradeLevel}`);
  const useLegacy = (row) => {
    setAssignment(assignmentFromLegacy(row));
    setNotice(`Confirm ${row.name || row.email}'s class, then assign.`);
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  return <div style={{ fontFamily: T.body }}>
    {error && <p role="alert" className="sims-feedback">{error}</p>}
    {notice && <p role="status" className="sims-feedback">{notice}</p>}
    {loading && <p role="status">Loading school access…</p>}
    <Btn variant="ghost" disabled={loading || pending} onClick={refresh}>Refresh school access</Btn>
    {context && (context.isAdmin ? <>
      <Card style={{ padding: 20, margin: '18px 0' }}><h2 style={S.h2} ref={formRef}>Assign a school role</h2>
        <p style={{ fontSize: 13, color: T.inkMuted }}>School year {context.schoolYear}. Use the teacher's verified app account email. They switch to School in the app's Settings. School roles are separate from family links and SIMS coordinator accounts.</p>
        <form onSubmit={(event) => {
          event.preventDefault();
          const payload = { email: assignment.email.trim(), role: assignment.role, ...(assignment.role === 'curriculum_adviser' ? { gradeLevel: Number(assignment.gradeLevel) } : { sectionId: assignment.sectionId }) };
          run('assignSchoolRoleFn', payload, 'School role assigned. The teacher gets an inbox note in the app.', () => setAssignment(EMPTY));
        }}><fieldset disabled={pending || context.ended} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '0 18px' }}>
            <Field label="Account email"><Inp type="email" autoComplete="email" required value={assignment.email} onChange={(event) => setAssignment({ ...assignment, email: event.target.value })} /></Field>
            <Field label="Responsibility"><Sel value={assignment.role} onChange={(event) => setAssignment({ ...assignment, role: event.target.value })}>{Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</Sel></Field>
            {assignment.role === 'curriculum_adviser'
              ? <Field label="Grade"><Sel required value={assignment.gradeLevel} onChange={(event) => setAssignment({ ...assignment, gradeLevel: event.target.value })}><option value="">Choose grade</option>{[...new Set((context.sections || []).map((section) => Number(section.gradeLevel)))].sort((a, b) => a - b).map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</Sel></Field>
              : <Field label="Section"><Sel required value={assignment.sectionId} onChange={(event) => setAssignment({ ...assignment, sectionId: event.target.value })}><option value="">Choose section</option>{(context.sections || []).map((section) => <option key={section.id} value={section.id}>{sectionLabel(section)}</option>)}</Sel></Field>}
          </div>
          <Btn type="submit" disabled={pending || context.ended}>{pending ? 'Working…' : 'Assign role'}</Btn>
        </fieldset></form>
      </Card>
      <Card style={{ padding: 20, marginBottom: 18 }}><h2 style={S.h2}>Active school assignments</h2>
        {!context.managedAssignments?.length && <p style={{ fontSize: 13, color: T.inkMuted }}>No active assignments for this school year.</p>}
        {(context.managedAssignments || []).map((item) => {
          const key = `${item.uid}-${item.role}-${item.sectionId || item.gradeLevel}`;
          return <section key={key} style={{ padding: '16px 0', borderTop: `1px solid ${T.border}` }}>
            <strong>{item.displayName || item.email || item.uid}</strong>
            <p style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{item.email}<br />{ROLE_LABELS[item.role]} · {scope(item)}</p>
            {revoking?.key === key ? <form onSubmit={(event) => {
              event.preventDefault(); if (!reason.trim()) return;
              run('revokeSchoolRoleFn', { uid: item.uid, role: item.role, ...(item.sectionId ? { sectionId: item.sectionId } : { gradeLevel: item.gradeLevel }), reason: reason.trim() },
                'Assignment revoked.', () => { setRevoking(null); setReason(''); });
            }} style={{ marginTop: 14 }}>
              <p style={{ fontSize: 13 }}>Revoke this assignment? Access ends immediately.</p>
              <Field label="Reason"><Inp autoFocus required maxLength={500} value={reason} disabled={pending} onChange={(event) => setReason(event.target.value)} /></Field>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><Btn type="submit" disabled={pending || !reason.trim()}>{pending ? 'Working…' : 'Confirm'}</Btn><Btn variant="ghost" type="button" disabled={pending} onClick={() => setRevoking(null)}>Cancel</Btn></div>
            </form> : <Btn variant="ghost" disabled={pending} onClick={() => { setRevoking({ key }); setReason(''); setError(''); }}>Revoke assignment</Btn>}
          </section>;
        })}
      </Card>
      <Card style={{ padding: 20 }}><h2 style={S.h2}>Teachers with old adviser slips</h2>
        <p style={{ fontSize: 13, color: T.inkMuted }}>Old adviser links grant no school access. Confirm each teacher's class, then assign them with the form above.</p>
        <LegacyAdvisers rows={legacyAdviserRows(context.legacyAdvisers, context.managedAssignments)} sections={context.sections || []} disabled={pending || context.ended} onUse={useLegacy} />
      </Card>
    </> : <p role="status">An administrator assigns school roles here in SIMS.</p>)}
  </div>;
}
```

`useLegacy` is a plain function named like a hook. If the lint config flags `use*` names, rename it to `prefillFromLegacy`.

- [ ] **Step 6: Run the SIMS suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schoolAssignments.js src/lib/schoolAssignments.test.js src/pages/guardians/LegacyAdvisers.jsx src/pages/guardians/LegacyAdvisers.test.js src/pages/guardians/SchoolAccessTab.jsx
git commit -m "Manage school roles only in SIMS and list old adviser slips per teacher"
```

---

### Task 2: Session review for administrators and coordinators

**Files:**
- Create: `src/lib/sessionReview.js`, `src/lib/sessionReview.test.js`, `src/pages/SessionReviewPage.jsx`, `src/pages/SessionReviewPage.test.js`
- Modify: `src/App.jsx` (`AttendanceArea`)

**Interfaces:**
- Consumes: `useStaffCollectionResource('sections', { me, schoolYear }) → { data, loading, error }`; `grades(me)` from `src/lib/access.js` (`null` = every grade); callables `getSchoolRosterFn`, `setSessionAbsenceFn`; Plan B's `classSession.js` exports.
- Produces: `reviewSections(sections, me, schoolYear)`, `sessionCell(row, session) → { gate, flagged, label, reason, by }`, `SessionReviewPage({ me, schoolYear })`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sessionReview.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { reviewSections, sessionCell } from './sessionReview.js';

const sections = [
  { id: 'b', name: 'Luna', gradeLevel: 8, schoolYear: '2026-2027' },
  { id: 'a', name: 'Rizal', gradeLevel: 7, schoolYear: '2026-2027' },
  { id: 'c', name: 'Old', gradeLevel: 7, schoolYear: '2025-2026' },
];

describe('session review', () => {
  it('shows administrators every current section and coordinators their grades', () => {
    expect(reviewSections(sections, { role: 'admin' }, '2026-2027').map(s => s.id)).toEqual(['a', 'b']);
    expect(reviewSections(sections, { role: 'glc', gradeLevel: 8 }, '2026-2027').map(s => s.id)).toEqual(['b']);
    expect(reviewSections(sections, { role: 'nobody' }, '2026-2027')).toEqual([]);
  });
  it('labels a flagged session neutrally with its reason and author', () => {
    const row = { gate: { timeIn: '07:12' }, am: { status: 'A', overrideActive: true, reason: 'Not in class', actorName: 'Ms. Reyes' }, pm: { status: 'L' } };
    expect(sessionCell(row, 'am')).toEqual({ gate: '07:12', flagged: true, label: 'Not in class', reason: 'Not in class', by: 'Ms. Reyes' });
    expect(sessionCell(row, 'pm')).toEqual({ gate: '07:12', flagged: false, label: 'Late', reason: '', by: '' });
    expect(sessionCell({ gate: {}, am: {} }, 'am')).toEqual({ gate: null, flagged: false, label: 'No mark', reason: '', by: '' });
  });
});
```

Create `src/pages/SessionReviewPage.test.js`:

```js
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ sections: [] }));
vi.mock('../hooks/useCollection.js', () => ({
  useStaffCollectionResource: () => ({ data: fixture.sections, loading: false, error: null }),
}));
vi.mock('../firebase.js', () => ({ functions: {} }));

import SessionReviewPage from './SessionReviewPage.jsx';

const h = React.createElement;
beforeEach(() => {
  fixture.sections = [
    { id: 'a', name: 'Rizal', gradeLevel: 7, schoolYear: '2026-2027' },
    { id: 'b', name: 'Luna', gradeLevel: 8, schoolYear: '2026-2027' },
  ];
});

describe('SessionReviewPage', () => {
  it('offers a coordinator only the sections in their grades', () => {
    const html = renderToStaticMarkup(h(SessionReviewPage, { me: { role: 'glc', gradeLevel: 8 }, schoolYear: '2026-2027' }));
    expect(html).toContain('Session review');
    expect(html).toContain('Grade 8 · Luna');
    expect(html).not.toContain('Grade 7 · Rizal');
  });
  it('explains when no sections are in scope', () => {
    const html = renderToStaticMarkup(h(SessionReviewPage, { me: { role: 'glc', gradeLevel: 12 }, schoolYear: '2026-2027' }));
    expect(html).toContain('No sections in your grades for 2026-2027.');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/sessionReview.test.js src/pages/SessionReviewPage.test.js`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/sessionReview.js`:

```js
import { grades } from './access.js';
import { enteredFor } from '../../parent/src/lib/classSession.js';

const STATUS = { P: 'Present', L: 'Late', E: 'Excused', A: 'Absent' };

// Administrators review every current section; coordinators their grades.
export function reviewSections(sections, me, schoolYear) {
  const scope = grades(me);
  return (sections || [])
    .filter((s) => s.schoolYear === schoolYear && (scope === null || scope.includes(Number(s.gradeLevel))))
    .sort((a, b) => a.gradeLevel - b.gradeLevel || String(a.name || '').localeCompare(String(b.name || '')));
}

export function sessionCell(row, session) {
  const status = row?.[session] || {};
  const flagged = status.overrideActive === true;
  return {
    gate: enteredFor(row, session),
    flagged,
    label: flagged ? 'Not in class' : STATUS[status.status] || 'No mark',
    reason: flagged ? status.reason || '' : '',
    by: flagged ? status.actorName || '' : '',
  };
}
```

- [ ] **Step 4: Implement the page**

Create `src/pages/SessionReviewPage.jsx`:

```jsx
// Grade-wide AM/PM review for SIMS administrators and coordinators. Advisers
// flag same-day absences in the parent app; earlier days and grade-wide
// corrections happen here, through the same audited callables.
import { useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import { useStaffCollectionResource } from '../hooks/useCollection.js';
import { Btn, Card, Field, Inp, Sel } from '../components/ui.jsx';
import { T, S } from '../styles.js';
import { manilaDate, formatScanTime } from '../../shared/dates.js';
import { sectionLabel, schoolError } from '../../parent/src/lib/school.js';
import { FLAG_REASONS, RESTORE_REASONS, reasonText, correctionInput } from '../../parent/src/lib/classSession.js';
import { reviewSections, sessionCell } from '../lib/sessionReview.js';

const invoke = async (name, data) => (await httpsCallable(functions, name)(data)).data;
const cellStyle = { padding: '12px 16px', verticalAlign: 'top', borderBottom: `1px solid ${T.border}` };

export default function SessionReviewPage({ me, schoolYear }) {
  const sectionsResource = useStaffCollectionResource('sections', { me, schoolYear });
  const sections = useMemo(() => reviewSections(sectionsResource.data, me, schoolYear), [sectionsResource.data, me, schoolYear]);
  const today = manilaDate();
  const [sectionId, setSectionId] = useState('');
  const [date, setDate] = useState(today);
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [edit, setEdit] = useState(null); // { row, session, absent }
  const [reason, setReason] = useState(FLAG_REASONS[0]);
  const [other, setOther] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const sequence = useRef(0);
  const activeSection = sections.some((s) => s.id === sectionId) ? sectionId : sections[0]?.id || '';

  useEffect(() => {
    if (!activeSection) return undefined;
    const request = ++sequence.current;
    setLoading(true); setError('');
    invoke('getSchoolRosterFn', { sectionId: activeSection, date })
      .then((data) => { if (request === sequence.current) { setRoster(data); setLoading(false); } })
      .catch((e) => { if (request === sequence.current) { setRoster(null); setError(schoolError(e)); setLoading(false); } });
    return () => { ++sequence.current; };
  }, [activeSection, date, reload]);

  const open = (row, session, absent) => {
    setEdit({ row, session, absent }); setReason(absent ? FLAG_REASONS[0] : RESTORE_REASONS[0]);
    setOther(''); setNote(''); setNotice(''); setError('');
  };
  const submit = async (event) => {
    event.preventDefault();
    const chosen = reason === 'other' ? other : reason;
    if (!edit || saving || !chosen.trim()) return;
    setSaving(true); setError('');
    try {
      await invoke('setSessionAbsenceFn', correctionInput({ sectionId: activeSection, date, session: edit.session, row: edit.row, absent: edit.absent,
        reason: reasonText(chosen, note), operationId: crypto.randomUUID() }));
      setNotice(`${edit.row.displayName} · ${edit.session.toUpperCase()} ${edit.absent ? 'marked not in class' : 'restored'}. Families get a neutral update in two minutes.`);
      setEdit(null); setReload((n) => n + 1);
    } catch (e) { setError(schoolError(e)); } finally { setSaving(false); }
  };

  if (sectionsResource.loading && !sections.length) return <p role="status">Loading sections…</p>;
  if (!sections.length) return <Card style={{ padding: 20 }}><p>No sections in your grades for {schoolYear}.</p></Card>;
  const canCorrect = Boolean(roster?.canCorrect);
  return <div style={{ fontFamily: T.body }}>
    <Card style={{ padding: 20, marginBottom: 18 }}>
      <h2 style={S.h2}>Session review</h2>
      <p style={{ fontSize: 13, color: T.inkMuted, margin: '0 0 14px' }}>Review AM and PM attendance by section, including earlier days. Gate scans stay as evidence; each change is audited, and families get a neutral update.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '0 18px' }}>
        <Field label="Section"><Sel value={activeSection} onChange={(e) => { setSectionId(e.target.value); setEdit(null); }}>{sections.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}</Sel></Field>
        <Field label="School day"><Inp type="date" value={date} max={today} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setEdit(null); } }} /></Field>
      </div>
    </Card>
    {error && <p role="alert" className="sims-feedback">{error}</p>}
    {notice && <p role="status" className="sims-feedback">{notice}</p>}
    {loading && <p role="status">Loading attendance…</p>}
    {roster && <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div role="region" aria-label="Session attendance" tabIndex={0} style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr>{['Learner', 'AM', 'PM'].map((label) => <th key={label} scope="col" style={{ ...cellStyle, textAlign: 'left', fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.inkMuted }}>{label}</th>)}</tr></thead>
          <tbody>{roster.rows.map((row) => <tr key={row.studentId}>
            <th scope="row" style={{ ...cellStyle, textAlign: 'left', fontWeight: 600 }}>{row.displayName}</th>
            {['am', 'pm'].map((session) => {
              const cell = sessionCell(row, session);
              const canChange = canCorrect && (cell.flagged || row[session]?.status !== 'A');
              return <td key={session} style={cellStyle}>
                <strong style={{ color: cell.flagged ? 'var(--t-warn-text)' : T.ink }}>{cell.label}</strong>
                <div style={{ fontSize: 12, color: T.inkMuted }}>{[cell.gate ? `Gate ${formatScanTime(cell.gate)}` : 'No gate entry', cell.reason, cell.by && `by ${cell.by}`].filter(Boolean).join(' · ')}</div>
                {canChange && <Btn variant="ghost" style={{ marginTop: 8 }} disabled={saving} onClick={() => open(row, session, !cell.flagged)}>{cell.flagged ? 'Restore' : 'Not in class'}</Btn>}
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
    </Card>}
    {edit && <Card style={{ padding: 20, marginTop: 18 }}>
      <form onSubmit={submit} aria-labelledby="session-edit-title">
        <h3 id="session-edit-title" style={{ margin: '0 0 12px' }}>{edit.row.displayName} · {edit.session.toUpperCase()} · {edit.absent ? 'Not in class' : 'Restore'}</h3>
        <Field label="Reason"><Sel value={reason} onChange={(e) => setReason(e.target.value)}>{(edit.absent ? FLAG_REASONS : RESTORE_REASONS).map((r) => <option key={r} value={r}>{r}</option>)}<option value="other">Other reason…</option></Sel></Field>
        {reason === 'other' && <Field label="Other reason"><Inp autoFocus required maxLength={200} value={other} onChange={(e) => setOther(e.target.value)} /></Field>}
        <Field label="Note (optional)"><Inp maxLength={250} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Btn type="submit" disabled={saving || (reason === 'other' && !other.trim())}>{saving ? 'Saving…' : 'Save change'}</Btn>
          <Btn type="button" variant="ghost" disabled={saving} onClick={() => setEdit(null)}>Cancel</Btn>
        </div>
      </form>
    </Card>}
  </div>;
}
```

- [ ] **Step 5: Add the tab**

In `src/App.jsx`:
1. Add with the other lazy pages: `const SessionReviewPage = lazy(() => import('./pages/SessionReviewPage.jsx'));`
2. In `AttendanceArea`, change the tab list to `[['take', 'Take Attendance'], ['summary', 'Monthly Summary'], ['review', 'Session Review']]`.
3. Replace the ternary that renders the tab body with:

```jsx
          {tab === 'take' ? <AttendanceTakePage me={me} schoolYear={schoolYear} entry={entry} />
            : tab === 'summary' ? <AttendanceSummaryPage me={me} schoolYear={schoolYear} />
              : <SessionReviewPage me={me} schoolYear={schoolYear} />}
```

Coordinators already reach the Attendance page (`COORDINATOR_PAGES` in `src/lib/access.js`), so the tab needs no extra gate. The backend enforces grades.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/lib/sessionReview.test.js src/pages/SessionReviewPage.test.js` → PASS.
Run: `npx vitest run` → PASS (including `shared/theme/literals.test.js`; `var(--t-warn-text)` is allowed).

- [ ] **Step 7: Commit**

```bash
git add src/lib/sessionReview.js src/lib/sessionReview.test.js src/pages/SessionReviewPage.jsx src/pages/SessionReviewPage.test.js src/App.jsx
git commit -m "Add grade-wide AM/PM session review in SIMS for admins and coordinators"
```

---

### Task 3: Visual check and build

- [ ] **Step 1: Build**

In Bash from the worktree root, with the main checkout's `.env` loaded for the build only:

```bash
(set -a; . "/c/Users/jitsb/OneDrive - Department of Education/Desktop/APPS/bnhs-sims/.env"; set +a; npm run build)
```

Expected: build succeeds. If root `node_modules` is missing in the worktree, junction the main checkout's `node_modules` first (`New-Item -ItemType Junction -Path node_modules -Target "<main>\node_modules"` in PowerShell), and remove it afterwards with `(Get-Item node_modules).Delete()`.

- [ ] **Step 2: Look at both screens**

Extend the existing browser harness pattern (`tests/browser/registrar.config.mjs`, port 5187; see `tests/browser/README.md`) or render the pages in a scratch harness with mocked callables. Check at 1280px and 375px, in light and dark:
- Guardians → School access: no request card; teacher rows with "Use in form" prefill the form and scroll to it.
- Attendance → Session Review: section and date pickers, a table that scrolls in its own region on mobile, and a correction form that requires a reason.

Stop any server you start with TaskStop, or `taskkill /PID <pid> /T /F` for the PID on its port. **Never** `taskkill /IM node.exe`.

- [ ] **Step 3: Run the design detector**

Run: `node C:/Users/jitsb/.claude/skills/impeccable/scripts/detect.mjs --json src/pages/SessionReviewPage.jsx src/pages/guardians/SchoolAccessTab.jsx src/pages/guardians/LegacyAdvisers.jsx`
Fix applicable findings and re-run the tests.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A src
git commit -m "Polish SIMS school access and session review"
```

(Skip if nothing changed.)
