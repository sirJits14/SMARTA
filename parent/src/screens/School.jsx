// Operate: extend the portal's existing teal controls and compact mobile rhythm.
// The first viewport identifies active school duties, then the attendance task.
// Requests and reviews remain explicit and never imply family learner access.
import { useEffect, useRef, useState } from 'react';
import { callable } from '../firebase.js';
import { useSchoolContext } from '../hooks/useSchoolContext.js';
import { attendanceSections, correctionError, ROLE_LABELS, schoolError, sectionLabel, sessionAction, correctionTime } from '../lib/school.js';
import { manilaDate, formatScanTime } from '../../../shared/dates.js';
import { nameCase } from '../lib/format.js';
import { Btn, Card, Field, Inp, Sel, Banner, Spinner, EmptyState } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import './School.css';

const statusLabel = (value) => ({ P: 'Present', L: 'Late', A: 'Absent', E: 'Excused' }[value] || 'No mark');

export default function School({ user, navigate }) {
  const resource = useSchoolContext(user.uid);
  const context = resource.data;
  const [request, setRequest] = useState({ role: 'adviser', sectionId: '' });
  const [pending, setPending] = useState(false);
  const actionLock = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [review, setReview] = useState(null);
  const [reviewReason, setReviewReason] = useState('');
  const run = async (operation, success) => {
    if (actionLock.current) return;
    actionLock.current = true; setPending(true); setError(''); setMessage('');
    try { await operation(); setMessage(success); setReview(null); setReviewReason(''); await resource.refresh(); }
    catch (e) { setError(schoolError(e)); }
    finally { actionLock.current = false; setPending(false); }
  };
  const submit = (event) => {
    event.preventDefault();
    const problem = request.sectionId ? '' : 'Choose a current school section.';
    if (problem) { setError(problem); return; }
    run(() => callable('requestSchoolRoleFn')(request), 'Request sent. School access starts after approval.');
  };
  return <>
    <PageHeader title="School" subtitle={context ? `School year ${context.schoolYear}` : 'School responsibilities'} />
    {resource.loading && <Spinner label="Loading school access" />}
    {resource.error && <Banner tone="danger" action={<Btn variant="ghost" onClick={resource.refresh}>Try again</Btn>}>{resource.error}</Banner>}
    {error && <Banner tone="danger">{error}</Banner>}
    {message && <Banner>{message}</Banner>}
    {context && <>
      {context.ended && <Banner tone="warn">This school year has ended. School access is available for review only.</Banner>}
      <section className="school-block" aria-labelledby="school-duties"><h2 id="school-duties">Your responsibilities</h2>
        {context.isAdmin && <p>Administrator · All sections</p>}
        {(context.assignments || []).map((assignment, index) => <p key={`${assignment.role}-${assignment.sectionId || assignment.gradeLevel}-${index}`}>
          <strong>{ROLE_LABELS[assignment.role] || assignment.role}</strong><br />
          {assignment.sectionId ? sectionLabel(context.sections?.find(section => section.id === assignment.sectionId)) : `Grade ${assignment.gradeLevel}`}
        </p>)}
        {!context.isAdmin && !context.assignments?.length && <p>No approved school responsibilities yet. Request your section below.</p>}
        <Btn variant="ghost" onClick={() => navigate('/announcements?view=school')}>School notices</Btn>
      </section>
      <AttendanceReview key={context.schoolYear} context={context} />
      <Card><h2 className="school-heading">Request a school role</h2>
        <p className="school-note">Use your own account, including a personal email address. Only an administrator approves requests; a DepEd email does not grant access on its own.</p>
        <form onSubmit={submit}><fieldset disabled={pending || context.ended} className="school-fieldset">
          <Field label="Responsibility"><Sel value={request.role} onChange={e => setRequest({ ...request, role: e.target.value })}><option value="adviser">Adviser</option><option value="subject_teacher">Subject Teacher · notices only</option></Sel></Field>
          <Field label="Section"><Sel required value={request.sectionId} onChange={e => setRequest({ ...request, sectionId: e.target.value })}><option value="">Choose section</option>{(context.sections || []).map(section => <option key={section.id} value={section.id}>{sectionLabel(section)}</option>)}</Sel></Field>
          <Btn type="submit" disabled={pending || context.ended || !request.sectionId}>{pending ? 'Working…' : 'Send request'}</Btn>
        </fieldset></form>
        <p className="school-note">Curriculum Advisers are assigned by an administrator. School roles use approval, without activation slips.</p>
      </Card>
      {(context.requests || []).length > 0 && <section className="school-block"><h2>Your requests</h2>{context.requests.map(item => <p key={item.id}><strong>{ROLE_LABELS[item.role]}</strong> · {sectionLabel(context.sections?.find(section => section.id === item.sectionId))}<br /><span className="school-note">{item.status}{item.reason ? ` · ${item.reason}` : ''}</span></p>)}</section>}
      {(context.reviewRequests || []).length > 0 && <section className="school-block"><h2>Requests to review</h2>
        {context.reviewRequests.map(item => <div className="school-review-row" key={item.id}><strong>{item.displayName || item.email}</strong><p>{item.email}<br />{ROLE_LABELS[item.role]} · {sectionLabel(context.sections?.find(section => section.id === item.sectionId))}</p>
          {review?.id === item.id ? <form onSubmit={event => { event.preventDefault(); if (!reviewReason.trim()) return; run(() => callable('resolveSchoolRoleFn')({ requestId: item.id, approve: review.approve, reason: reviewReason.trim() }), review.approve ? 'School role approved.' : 'Request declined.'); }}>
            <Field label={`${review.approve ? 'Approval' : 'Decline'} reason`}><Inp required maxLength={500} value={reviewReason} disabled={pending} onChange={e => setReviewReason(e.target.value)} /></Field>
            <div className="school-actions"><Btn disabled={pending || !reviewReason.trim()} type="submit">Confirm {review.approve ? 'approval' : 'decline'}</Btn><Btn variant="ghost" type="button" disabled={pending} onClick={() => setReview(null)}>Cancel</Btn></div>
          </form> : <div className="school-actions"><Btn disabled={pending || item.uid === user.uid} onClick={() => { setReview({ id: item.id, approve: true }); setReviewReason(''); }}>Approve</Btn><Btn variant="ghost" disabled={pending || item.uid === user.uid} onClick={() => { setReview({ id: item.id, approve: false }); setReviewReason(''); }}>Decline</Btn></div>}
        </div>)}
      </section>}
    </>}
  </>;
}

function AttendanceReview({ context }) {
  const sections = attendanceSections(context);
  const [sectionId, setSectionId] = useState(() => sections[0]?.id || '');
  const [date, setDate] = useState(manilaDate);
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [correction, setCorrection] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const sequence = useRef(0);
  const validSection = sections.some(section => section.id === sectionId) ? sectionId : sections[0]?.id || '';
  useEffect(() => {
    const request = ++sequence.current;
    setRoster(null); setError(''); setCorrection(null); setReason(''); setNotice('');
    if (!validSection || !date) { setLoading(false); return; }
    setLoading(true);
    callable('getSchoolRosterFn')({ sectionId: validSection, date }).then(result => {
      if (request === sequence.current) { setRoster(result.data); setLoading(false); }
    }).catch(e => { if (request === sequence.current) { setError(schoolError(e)); setLoading(false); } });
    return () => { ++sequence.current; };
  }, [context, validSection, date, revision]);
  const changeSession = async (event) => {
    event.preventDefault();
    if (saveLock.current || !correction || !roster?.canCorrect) return;
    const problem = correctionError({ ...correction, reason });
    if (problem) { setError(problem); return; }
    const request = sequence.current;
    saveLock.current = true; setSaving(true); setError('');
    try {
      await callable('setSessionAbsenceFn')({ sectionId: validSection, studentId: correction.row.studentId, date, session: correction.session,
        absent: !correction.row[correction.session]?.overrideActive, reason: reason.trim(), expectedRevision: correction.row.revision, operationId: correction.operationId });
      if (request === sequence.current) { setCorrection(null); setReason(''); setRevision(value => value + 1); }
    } catch (e) {
      if (request === sequence.current) {
        setError(schoolError(e));
        if (String(e.code).endsWith('aborted')) { setCorrection(null); setRoster(current => current ? { ...current, canCorrect: false } : current); setNotice('Attendance changed while you were reviewing it. Reload before making another change.'); }
      }
    } finally { saveLock.current = false; setSaving(false); }
  };
  if (!sections.length) return null;
  const broadAccess = context.isAdmin || context.assignments?.some(a => a.role === 'curriculum_adviser');
  return <section className="school-block" aria-labelledby="attendance-review"><h2 id="attendance-review">{broadAccess ? 'Attendance Review' : 'My Advisory'}</h2>
    <div className="school-filters"><Field label="Section"><Sel disabled={saving} value={validSection} onChange={e => setSectionId(e.target.value)}>{sections.map(section => <option key={section.id} value={section.id}>{sectionLabel(section)}</option>)}</Sel></Field>
      <Field label="School day · Manila"><Inp type="date" max={manilaDate()} disabled={saving} value={date} onChange={e => setDate(e.target.value)} /></Field></div>
    <p className="school-note">{broadAccess ? 'Review AM and PM separately, including earlier school days.' : 'You can correct your advisory attendance on the same Manila school day.'} Gate records stay available as evidence.</p>
    {loading && <Spinner label="Loading section attendance" />}
    {error && <Banner tone="danger">{error}</Banner>}{notice && <Banner>{notice}</Banner>}
    <Btn variant="ghost" disabled={loading || saving || !validSection || !date} onClick={() => setRevision(value => value + 1)}>Reload attendance</Btn>
    {roster && !roster.canCorrect && <p className="school-note">This day is available for review only.</p>}
    {roster?.rows?.length === 0 && <EmptyState title="No learners in this section" hint="Check the section and school day." />}
    {roster?.rows?.map(row => <article key={row.studentId} className="school-learner"><h3>{nameCase(row.displayName) || row.studentId}</h3>
      <p className="school-note">Gate AM: {formatScanTime(row.gate?.timeIn)} – {formatScanTime(row.gate?.timeOut)}<br />Gate PM: {formatScanTime(row.gate?.pmTimeIn)} – {formatScanTime(row.gate?.pmTimeOut)}</p>
      <div className="school-sessions">{['am', 'pm'].map(session => <div key={session}><strong>{session.toUpperCase()} · {statusLabel(row[session]?.status)}</strong>
        {row[session]?.reason && <p className="school-note">{row[session].reason}</p>}
        {(row[session]?.actorName || row[session]?.changedAt) && <p className="school-note">{[row[session].actorName && `Updated by ${row[session].actorName}`, correctionTime(row[session].changedAt)].filter(Boolean).join(' · ')}</p>}
        {roster.canCorrect && (sessionAction(row[session]) ? <Btn variant="ghost" disabled={saving} aria-label={`${row[session]?.overrideActive ? 'Restore' : 'Mark absent'} ${session.toUpperCase()} for ${row.displayName}`} onClick={() => { setCorrection({ row, session, operationId: crypto.randomUUID() }); setReason(''); setError(''); }}>{row[session]?.overrideActive ? 'Restore session' : 'Mark absent'}</Btn> : <p className="school-note">Already absent in the base record</p>)}
      </div>)}</div>
      {correction?.row.studentId === row.studentId && <form className="school-correction" onSubmit={changeSession}>
        <h4>{row[correction.session]?.overrideActive ? 'Restore underlying attendance' : 'Mark absent'} · {correction.session.toUpperCase()}</h4>
        <p className="school-note">{row.displayName} · {date}. Approved family accounts receive an attendance update.</p>
        <Field label="Reason"><Inp autoFocus required maxLength={500} value={reason} disabled={saving} onChange={e => setReason(e.target.value)} /></Field>
        <div className="school-actions"><Btn type="submit" disabled={saving || !reason.trim()}>{saving ? 'Saving…' : 'Confirm change'}</Btn><Btn variant="ghost" type="button" disabled={saving} onClick={() => setCorrection(null)}>Cancel</Btn></div>
      </form>}
    </article>)}
  </section>;
}
