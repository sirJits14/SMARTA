import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../../firebase.js';
import { Btn, Card, Field, Inp, Sel } from '../../components/ui.jsx';
import { T, S } from '../../styles.js';
import { ROLE_LABELS, sectionLabel, schoolError } from '../../../parent/src/lib/school.js';

const invoke = async (name, data = {}) => (await httpsCallable(functions, name)(data)).data;

export default function SchoolAccessTab() {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const sequence = useRef(0);
  const [assignment, setAssignment] = useState({ email: '', role: 'adviser', sectionId: '', gradeLevel: '' });
  const [decision, setDecision] = useState(null);
  const [reason, setReason] = useState('');
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setContext(null); setError('');
    try { const data = await invoke('getSchoolContextFn'); if (request === sequence.current) setContext(data); }
    catch (e) { if (request === sequence.current) setError(schoolError(e)); }
    finally { if (request === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { refresh(); return () => { ++sequence.current; }; }, [refresh]);
  const run = async (name, payload, message) => {
    if (lock.current) return;
    lock.current = true; setPending(true); setError(''); setNotice('');
    try { await invoke(name, payload); setDecision(null); setReason(''); await refresh(); setNotice(message); }
    catch (e) { setError(schoolError(e)); }
    finally { lock.current = false; setPending(false); }
  };
  const scope = item => item.sectionId ? sectionLabel(context?.sections?.find(section => section.id === item.sectionId)) : `Grade ${item.gradeLevel}`;
  const decisionForm = (key) => decision?.key === key && <form onSubmit={event => {
    event.preventDefault(); if (!reason.trim()) return;
    const { action, item, approve } = decision;
    run(action === 'revoke' ? 'revokeSchoolRoleFn' : 'resolveSchoolRoleFn', action === 'revoke'
      ? { uid: item.uid, role: item.role, ...(item.sectionId ? { sectionId: item.sectionId } : { gradeLevel: item.gradeLevel }), reason: reason.trim() }
      : { requestId: item.id, approve, reason: reason.trim() }, action === 'revoke' ? 'Assignment revoked.' : approve ? 'Request approved.' : 'Request declined.');
  }} style={{ marginTop: 14 }}>
    <p style={{ fontSize: 13 }}>{decision.action === 'revoke' ? 'Revoke this assignment? Access ends immediately.' : decision.approve ? 'Approve this school role?' : 'Decline this school role request?'}</p>
    <Field label="Reason"><Inp autoFocus required maxLength={500} value={reason} disabled={pending} onChange={event => setReason(event.target.value)} /></Field>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><Btn type="submit" disabled={pending || !reason.trim()}>{pending ? 'Working…' : 'Confirm'}</Btn><Btn variant="ghost" type="button" disabled={pending} onClick={() => setDecision(null)}>Cancel</Btn></div>
  </form>;
  const start = (value) => { setDecision(value); setReason(''); setError(''); };
  return <div style={{ fontFamily: T.body }}>
    {error && <p role="alert" className="sims-feedback">{error}</p>}
    {notice && <p role="status" className="sims-feedback">{notice}</p>}
    {loading && <p role="status">Loading school access…</p>}
    <Btn variant="ghost" disabled={loading || pending} onClick={refresh}>Refresh school access</Btn>
    {context && (context.isAdmin ? <>
      <Card style={{ padding: 20, margin: '18px 0' }}><h2 style={S.h2}>Assign a school role</h2>
        <p style={{ fontSize: 13, color: T.inkMuted }}>School year {context.schoolYear}. Use an existing verified account's email. School assignments are separate from family links and SIMS coordinator accounts.</p>
        <form onSubmit={event => {
          event.preventDefault();
          const payload = { email: assignment.email.trim(), role: assignment.role, ...(assignment.role === 'curriculum_adviser' ? { gradeLevel: Number(assignment.gradeLevel) } : { sectionId: assignment.sectionId }) };
          run('assignSchoolRoleFn', payload, 'School role assigned.');
        }}><fieldset disabled={pending || context.ended} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '0 18px' }}>
            <Field label="Account email"><Inp type="email" autoComplete="email" required value={assignment.email} onChange={event => setAssignment({ ...assignment, email: event.target.value })} /></Field>
            <Field label="Responsibility"><Sel value={assignment.role} onChange={event => setAssignment({ ...assignment, role: event.target.value })}>{Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</Sel></Field>
            {assignment.role === 'curriculum_adviser' ? <Field label="Grade"><Sel required value={assignment.gradeLevel} onChange={event => setAssignment({ ...assignment, gradeLevel: event.target.value })}><option value="">Choose grade</option>{[...new Set((context.sections || []).map(section => Number(section.gradeLevel)))].sort((a, b) => a - b).map(grade => <option key={grade} value={grade}>Grade {grade}</option>)}</Sel></Field>
              : <Field label="Section"><Sel required value={assignment.sectionId} onChange={event => setAssignment({ ...assignment, sectionId: event.target.value })}><option value="">Choose section</option>{(context.sections || []).map(section => <option key={section.id} value={section.id}>{sectionLabel(section)}</option>)}</Sel></Field>}
          </div>
          <Btn type="submit" disabled={pending || context.ended}>{pending ? 'Working…' : 'Assign role'}</Btn>
        </fieldset></form>
      </Card>
      <Card style={{ padding: 20, marginBottom: 18 }}><h2 style={S.h2}>School role requests</h2>
        {!context.reviewRequests?.length && <p style={{ fontSize: 13, color: T.inkMuted }}>No requests awaiting review.</p>}
        {(context.reviewRequests || []).map(item => <section key={item.id} style={{ padding: '16px 0', borderTop: `1px solid ${T.border}` }}><strong>{item.displayName || item.email}</strong><p style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{item.email}<br />{ROLE_LABELS[item.role]} · {scope(item)}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><Btn disabled={pending || context.ended || item.uid === auth.currentUser?.uid} onClick={() => start({ key: item.id, action: 'review', item, approve: true })}>Approve</Btn><Btn variant="ghost" disabled={pending || context.ended || item.uid === auth.currentUser?.uid} onClick={() => start({ key: item.id, action: 'review', item, approve: false })}>Decline</Btn></div>
          {decisionForm(item.id)}
        </section>)}
      </Card>
      <Card style={{ padding: 20, marginBottom: 18 }}><h2 style={S.h2}>Active school assignments</h2>
        {!context.managedAssignments?.length && <p style={{ fontSize: 13, color: T.inkMuted }}>No active assignments for this school year.</p>}
        {(context.managedAssignments || []).map((item, index) => { const key = `assignment-${index}`; return <section key={`${item.uid}-${item.role}-${item.sectionId || item.gradeLevel}`} style={{ padding: '16px 0', borderTop: `1px solid ${T.border}` }}><strong>{item.displayName || item.email || item.uid}</strong><p style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{item.email}<br />{ROLE_LABELS[item.role]} · {scope(item)}</p><Btn variant="ghost" disabled={pending} onClick={() => start({ key, action: 'revoke', item })}>Revoke assignment</Btn>{decisionForm(key)}</section>; })}
      </Card>
      <Card style={{ padding: 20 }}><h2 style={S.h2}>Legacy adviser links to verify</h2><p style={{ fontSize: 13, color: T.inkMuted }}>Legacy links grant no school access. Verify each responsibility and use the assignment form above.</p>
        {!context.migrationCandidates?.length && <p style={{ fontSize: 13 }}>No legacy adviser links to verify.</p>}
        {(context.migrationCandidates || []).map((item, index) => <p key={item.id || index} style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{item.guardianEmail || item.email || item.guardianUid || item.uid} · Learner {item.studentId || item.learnerName || 'unavailable'}</p>)}
      </Card>
    </> : <p role="status">An administrator manages school assignments in SIMS. Use the School view in the parent portal to request or review eligible roles.</p>)}
  </div>;
}
