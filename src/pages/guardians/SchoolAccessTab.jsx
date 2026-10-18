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
  const sectionRef = useRef(null);
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
  const prefillFromLegacy = (row) => {
    setAssignment(assignmentFromLegacy(row));
    setNotice(`Confirm ${row.name || row.email}'s class, then assign.`);
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    formRef.current?.scrollIntoView?.({ block: 'start', ...(calm ? {} : { behavior: 'smooth' }) });
    sectionRef.current?.focus({ preventScroll: true });
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
              : <Field label="Section"><Sel ref={sectionRef} required value={assignment.sectionId} onChange={(event) => setAssignment({ ...assignment, sectionId: event.target.value })}><option value="">Choose section</option>{(context.sections || []).map((section) => <option key={section.id} value={section.id}>{sectionLabel(section)}</option>)}</Sel></Field>}
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
        <LegacyAdvisers rows={legacyAdviserRows(context.legacyAdvisers, context.managedAssignments)} sections={context.sections || []} disabled={pending || context.ended} onUse={prefillFromLegacy} />
      </Card>
    </> : <p role="status">An administrator assigns school roles here in SIMS.</p>)}
  </div>;
}
