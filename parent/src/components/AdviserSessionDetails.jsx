import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { callable } from '../firebase.js';
import { manilaDate } from '../../../shared/dates.js';
import { schoolError } from '../lib/school.js';
import { flagAction, correctionInput, UNDO_REASON } from '../lib/classSession.js';
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
  const [notice, setNotice] = useState(null); // { key, date, text, undoable }
  const [actionError, setActionError] = useState(''); // survives reloads, unlike `error`
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

  const save = useCallback((day, key, absent, reason) => callable('setSessionAbsenceFn')(
    correctionInput({ sectionId, date: day, session: key, row: { studentId, revision: data.revision }, absent, reason, operationId: crypto.randomUUID() }),
  ), [sectionId, studentId, data]);

  // A different day starts clean: no stale rows, revision, notice or error.
  const changeDate = (value) => { setDate(value); setData(null); setNotice(null); setActionError(''); };

  const confirm = async (reason) => {
    if (!sheet || saveLock.current) return;
    saveLock.current = true; setSaving(true); setSheetError(''); setActionError('');
    const absent = sheet.mode === 'flag';
    try {
      await save(date, sheet.key, absent, reason);
      setNotice({ key: sheet.key, date, text: absent ? 'Flagged. Families are told after two minutes unless you undo.' : 'Restored.', undoable: absent });
      setSheet(null);
      setRetry(n => n + 1); onChanged?.();
    } catch (e) {
      setSheetError(schoolError(e));
      if (e?.code === 'functions/aborted') setRetry(n => n + 1);
    } finally { saveLock.current = false; setSaving(false); }
  };

  // Undo is offered only after the reload has brought back the new revision.
  const undo = async () => {
    const pending = notice; setNotice(null); setActionError('');
    try { await save(pending.date, pending.key, false, UNDO_REASON); }
    catch (e) { setActionError(schoolError(e)); setNotice(pending); }
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
    <Field label="School day · Manila"><Inp type="date" value={date} max={manilaDate()} onChange={e => changeDate(e.target.value)} /></Field>
    {loading && !data && <Spinner label="Loading session attendance" />}
    {error && <Banner tone="danger" action={<Btn variant="ghost" onClick={() => setRetry(n => n + 1)}>Try again</Btn>}>{error}</Banner>}
    {actionError && <Banner tone="danger">{actionError}</Banner>}
    {notice && <Banner tone="warn" action={notice.undoable ? <Btn variant="ghost" disabled={loading} onClick={undo}>Undo</Btn> : null}>{notice.text}</Banner>}
    {data && <SessionRows data={data} renderAction={renderAction} />}
    {data && !data.canCorrect && date !== manilaDate() && <p className="family-session-note">{S.adviserViewOnly}</p>}
    {sheet && <Suspense fallback={null}>
      <FlagSheet rows={[{ studentId, displayName }]} session={sheet.key} mode={sheet.mode} busy={saving} error={sheetError}
        onConfirm={confirm} onClose={() => { if (!saving) setSheet(null); }} />
    </Suspense>}
  </>;
}
