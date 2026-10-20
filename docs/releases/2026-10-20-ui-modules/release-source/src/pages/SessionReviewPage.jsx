// Grade-wide AM/PM review for SIMS administrators and coordinators. Advisers
// flag same-day absences in the parent app; earlier days and grade-wide
// corrections happen here, through the same audited callables.
import { useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import { useCollectionResource } from '../hooks/useCollection.js';
import { Btn, Card, Field, Inp, Sel } from '../components/ui.jsx';
import { T, S } from '../styles.js';
import { manilaDate, formatScanTime, schoolYearStartDate } from '../../shared/dates.js';
import { sectionLabel, schoolError } from '../../parent/src/lib/school.js';
import { FLAG_REASONS, RESTORE_REASONS, reasonText, correctionInput } from '../../parent/src/lib/classSession.js';
import { reasonDetail, reviewSections, reviewSessions, sessionCell, sessionName } from '../lib/sessionReview.js';

const invoke = async (name, data) => (await httpsCallable(functions, name)(data)).data;
const cellStyle = { padding: '12px 16px', verticalAlign: 'top', borderBottom: `1px solid ${T.border}` };

export default function SessionReviewPage({ me, schoolYear }) {
  const sectionsResource = useCollectionResource('sections');
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
  const loadedKey = useRef('');
  const formCard = useRef(null);
  const activeSection = sections.some((s) => s.id === sectionId) ? sectionId : sections[0]?.id || '';

  useEffect(() => {
    if (!activeSection) return undefined;
    const request = ++sequence.current;
    setRoster((current) => (current && current.section?.id === activeSection && current.date === date ? current : null));
    // A reload after a failed save keeps its message; a new section or day clears it.
    const key = `${activeSection}|${date}`;
    if (loadedKey.current !== key) { loadedKey.current = key; setError(''); }
    setLoading(true);
    invoke('getSchoolRosterFn', { sectionId: activeSection, date })
      .then((data) => { if (request === sequence.current) { setRoster(data); setLoading(false); } })
      .catch((e) => { if (request === sequence.current) { setRoster(null); setError(schoolError(e)); setLoading(false); } });
    return () => { ++sequence.current; };
  }, [activeSection, date, reload]);

  // The form opens below a long table: bring it into view and start at its first field.
  useEffect(() => {
    if (!edit || !formCard.current) return;
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    formCard.current.scrollIntoView({ block: 'nearest', ...(calm ? {} : { behavior: 'smooth' }) });
    formCard.current.querySelector('select')?.focus({ preventScroll: true });
  }, [edit]);

  const sessions = reviewSessions(roster?.schedule);
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
      setNotice(`${edit.row.displayName} · ${sessionName(edit.session, sessions)} ${edit.absent ? 'marked not in class' : 'restored'}. If the change stands, families get a neutral update after two minutes.`);
      setEdit(null); setReload((n) => n + 1);
    } catch (e) { setError(schoolError(e)); setEdit(null); setReload((n) => n + 1); } finally { setSaving(false); }
  };

  if (sectionsResource.loading && !sections.length) return <p role="status">Loading sections…</p>;
  if (sectionsResource.error && !sections.length) return <p role="alert" className="sims-feedback">Could not load sections. Refresh the page and try again.</p>;
  if (!sections.length) return <Card style={{ padding: 20 }}><p>No sections in your grades for {schoolYear}.</p></Card>;
  const canCorrect = Boolean(roster?.canCorrect);
  return <div style={{ fontFamily: T.body }}>
    <Card style={{ padding: 20, marginBottom: 18 }}>
      <h2 style={S.h2}>Session review</h2>
      <p style={{ fontSize: 13, color: T.inkMuted, margin: '0 0 14px' }}>Review AM and PM attendance by section, including earlier days. Gate scans stay as evidence; each change is audited, and families get a neutral update.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '0 18px' }}>
        <Field label="Section"><Sel value={activeSection} onChange={(e) => { setSectionId(e.target.value); setEdit(null); setNotice(''); }}>{sections.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}</Sel></Field>
        <Field label="School day"><Inp type="date" value={date} min={schoolYearStartDate(schoolYear)} max={today} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setEdit(null); setNotice(''); } }} /></Field>
      </div>
    </Card>
    {error && <p role="alert" className="sims-feedback">{error}</p>}
    {notice && <p role="status" className="sims-feedback">{notice}</p>}
    {loading && <p role="status">Loading attendance…</p>}
    {roster && <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div role="region" aria-label="Session attendance" tabIndex={0} style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr>{['Learner', ...sessions.map((session) => sessionName(session, sessions))].map((label) => <th key={label} scope="col" style={{ ...cellStyle, textAlign: 'left', fontSize: 12, fontWeight: 500, color: T.inkMuted }}>{label}</th>)}</tr></thead>
          <tbody>{roster.rows.map((row) => <tr key={row.studentId}>
            <th scope="row" style={{ ...cellStyle, textAlign: 'left', fontWeight: 500 }}>{row.displayName}</th>
            {sessions.map((session) => {
              const cell = sessionCell(row, session);
              const canChange = canCorrect && (cell.flagged || row[session]?.status !== 'A');
              return <td key={session} style={cellStyle}>
                <strong style={{ color: cell.flagged ? 'var(--t-warn-text)' : T.ink }}>{cell.label}</strong>
                <div style={{ fontSize: 12, color: T.inkMuted }}>{[cell.gate ? `Gate ${formatScanTime(cell.gate)}` : 'No gate entry', reasonDetail(cell.reason), cell.by && `by ${cell.by}`].filter(Boolean).join(' · ')}</div>
                {canChange && <Btn variant="ghost" style={{ marginTop: 8, whiteSpace: 'nowrap' }} disabled={saving || loading} onClick={() => open(row, session, !cell.flagged)}>{cell.flagged ? 'Restore' : 'Not in class'}</Btn>}
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
    </Card>}
    {edit && <Card ref={formCard} style={{ padding: 20, marginTop: 18 }}>
      <form onSubmit={submit} aria-labelledby="session-edit-title">
        <h3 id="session-edit-title" style={{ margin: '0 0 12px' }}>{edit.row.displayName} · {sessionName(edit.session, sessions)} · {edit.absent ? 'Not in class' : 'Restore'}</h3>
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
