// The adviser's one job in the app: spot learners who came through the gate
// but aren't in class, and flag them in two taps. Earlier days belong to
// coordinators in SIMS, so past days are view-only here.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth, callable } from '../../firebase.js';
import { recall, remember } from '../../hooks/useDoc.js';
import { manilaDate, manilaTime, formatScanTime, formatDateLabel } from '../../../../shared/dates.js';
import { learnerPath, schoolError, sectionLabel } from '../../lib/school.js';
import { groupRoster, enteredFor, sessionNow, hasTwoSessions, rosterSummary, runLimited, correctionInput, UNDO_REASON } from '../../lib/classSession.js';
import { initials } from '../../lib/format.js';
import { Banner, Btn, Inp, Sel, Spinner, EmptyState } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import UndoToast from './UndoToast.jsx';
import './ClassTab.css';

const FlagSheet = lazy(() => import('./FlagSheet.jsx'));
const STATUS = { P: 'Present', L: 'Late', E: 'Excused', A: 'Absent' };
const DAY = 86400000;
const rosterKey = (sectionId, date) => `roster:${auth.currentUser?.uid || ''}:${sectionId}:${date}`;

export default function ClassTab({ sections, ended, navigate }) {
  const today = manilaDate();
  const [sectionId, setSectionId] = useState(sections[0]?.id || '');
  const [date, setDate] = useState(today);
  const [pickedSession, setPickedSession] = useState(null);
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [sheet, setSheet] = useState(null); // { rows, mode: 'flag' | 'restore' }
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [toast, setToast] = useState(null); // { message, undo }
  const [reload, setReload] = useState(0);
  const sequence = useRef(0);
  const saveLock = useRef(false);
  const sheetOpen = useRef(false);
  sheetOpen.current = Boolean(sheet);
  const validSection = sections.some((s) => s.id === sectionId) ? sectionId : sections[0]?.id || '';

  useEffect(() => {
    if (!validSection) return undefined;
    const request = ++sequence.current;
    setLoading(true); setError('');
    // The last roster for this section and day (this sign-in) shows while the server refreshes it.
    const key = rosterKey(validSection, date);
    setRoster((current) => (current && current.date === date && current.section?.id === validSection ? current : recall(key) || null));
    callable('getSchoolRosterFn')({ sectionId: validSection, date }).then((result) => {
      remember(key, result.data);
      if (request === sequence.current) { setRoster(result.data); setLoading(false); }
    }).catch((e) => { if (request === sequence.current) { setError(schoolError(e)); setLoading(false); } });
    return () => { ++sequence.current; };
  }, [validSection, date, reload]);

  // Coming back to the app (focus or tab visible) picks up changes made elsewhere, unless a save or sheet is in progress.
  useEffect(() => {
    const onReturn = () => { if (document.visibilityState === 'visible' && !saveLock.current && !sheetOpen.current) setReload((n) => n + 1); };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => { window.removeEventListener('focus', onReturn); document.removeEventListener('visibilitychange', onReturn); };
  }, []);

  const isToday = date === today;
  const schedule = roster?.schedule || null;
  const twoSessions = hasTwoSessions(schedule);
  const session = twoSessions ? (pickedSession || (isToday ? sessionNow(schedule, manilaTime()) : 'am')) : 'am';
  const groups = useMemo(() => groupRoster(roster?.rows || [], session), [roster, session]);
  const canCorrect = Boolean(roster?.canCorrect) && !ended && isToday;
  const refresh = () => setReload((n) => n + 1);

  useEffect(() => { import('./FlagSheet.jsx').catch(() => {}); }, []);
  useEffect(() => {
    if (!canCorrect || !groups.inSchool.length) { setSelecting(false); setSelected(new Set()); }
  }, [validSection, date, canCorrect, groups.inSchool.length]);

  const save = useCallback(async (rows, absent, reason) => {
    const results = await runLimited(rows, 3, (row) => callable('setSessionAbsenceFn')(
      correctionInput({ sectionId: validSection, date, session, row, absent, reason, operationId: crypto.randomUUID() }),
    ).then((result) => ({ row, revision: result.data.revision })));
    return { done: results.filter((r) => r.ok).map((r) => r.value), failures: results.filter((r) => !r.ok).map((r) => r.error) };
  }, [validSection, date, session]);

  const undo = useCallback(async (done) => {
    setToast(null);
    const { failures } = await save(done.map(({ row, revision }) => ({ ...row, revision })), false, UNDO_REASON);
    setToast({ id: Date.now(), message: failures.length ? schoolError(failures[0]) : 'Flag undone. Families were not notified.', undo: null });
    refresh();
  }, [save]);

  const confirm = async (reason) => {
    if (!sheet || saveLock.current) return;
    saveLock.current = true;
    setSaving(true); setSheetError('');
    const absent = sheet.mode === 'flag';
    let outcome;
    try { outcome = await save(sheet.rows, absent, reason); }
    finally { saveLock.current = false; setSaving(false); }
    const { done, failures } = outcome;
    // Nothing saved (often a stale revision): close, explain, and reload fresh rows.
    if (!done.length) { setSheet(null); setToast({ id: Date.now(), message: schoolError(failures[0]), undo: null }); refresh(); return; }
    setSheet(null); setSelecting(false); setSelected(new Set());
    const count = done.length === 1 ? (absent ? 'Flagged' : 'Restored') : `${done.length} ${absent ? 'flagged' : 'restored'}`;
    setToast({ id: Date.now(), message: failures.length ? `${count} · ${failures.length} not saved. Try those again.` : count, undo: absent ? () => undo(done) : null });
    refresh();
  };

  const pick = (row, mode) => {
    if (selecting && mode === 'flag') {
      setSelected((current) => { const next = new Set(current); if (next.has(row.studentId)) next.delete(row.studentId); else next.add(row.studentId); return next; });
      return;
    }
    setSheetError(''); setSheet({ rows: [row], mode });
  };

  const open = (row) => navigate(learnerPath(validSection, row.studentId));

  if (!validSection) return <EmptyState title="No advisory class yet" hint="An administrator assigns your class in SIMS." />;
  return (
    <div className="class-tab">
      {sections.length > 1 && (
        <Sel aria-label="Class" value={validSection} onChange={(e) => { setSectionId(e.target.value); setPickedSession(null); }} style={{ marginBottom: 12 }}>
          {sections.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
        </Sel>
      )}
      <section className="class-summary card" aria-labelledby="class-session">
        <div className="class-summary-top">
          <h2 id="class-session">{session.toUpperCase()} · {isToday ? 'Today' : formatDateLabel(date)}</h2>
          {twoSessions && (
            <div className="class-session-switch" role="group" aria-label="Session">
              {['am', 'pm'].map((key) => <button key={key} type="button" aria-pressed={session === key} onClick={() => setPickedSession(key)}>{key.toUpperCase()}</button>)}
            </div>
          )}
        </div>
        {roster && <p className="class-summary-line">{rosterSummary(groups)}</p>}
        <div className="class-summary-actions">
          {canCorrect && groups.inSchool.length > 0 && (
            <button type="button" className="class-link" aria-pressed={selecting} onClick={() => { setSelecting((v) => !v); setSelected(new Set()); }}>{selecting ? 'Cancel selection' : 'Select'}</button>
          )}
          <button type="button" className="class-link" onClick={() => { setDate(isToday ? manilaDate(new Date(Date.now() - DAY)) : today); setPickedSession(null); setSelecting(false); }}>
            {isToday ? 'Past days' : 'Back to today'}
          </button>
          {!isToday && <Inp type="date" aria-label="School day" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 'auto', minHeight: 44 }} />}
        </div>
      </section>
      {error && <Banner tone="danger" action={<Btn variant="ghost" onClick={refresh}>Try again</Btn>}>{error}</Banner>}
      {loading && !roster && <Spinner label="Loading your class" />}
      {roster && !isToday && <p className="class-note">Past days are view-only. Your coordinator corrects earlier days in SIMS.</p>}
      {roster && ended && <p className="class-note">This school year has ended. Attendance is view-only.</p>}
      {roster && (
        <>
          <RowGroup title="In school" hint={groups.inSchool.length ? (canCorrect ? (selecting ? 'Tick each learner who isn’t in class, then Flag.' : 'Tap a learner for history, or Flag one who isn’t in class.') : null) : 'No gate entries yet for this session.'}
            rows={groups.inSchool} session={session} selecting={selecting} selected={selected} onPick={canCorrect ? (row) => pick(row, 'flag') : null} onOpen={open} flagLabel="Flag" />
          <RowGroup title="Flagged" rows={groups.flagged} session={session} onPick={canCorrect ? (row) => pick(row, 'restore') : null} onOpen={open} flagLabel="Restore" collapsible />
          <RowGroup title="Absent or no gate entry" rows={groups.noEntry} session={session} onOpen={open} collapsible />
        </>
      )}
      {selecting && (
        <div className="class-select-bar" role="region" aria-label="Selected learners">
          <span>{selected.size} selected</span>
          <Btn disabled={!selected.size} onClick={() => { setSheetError(''); setSheet({ rows: groups.inSchool.filter((r) => selected.has(r.studentId)), mode: 'flag' }); }}>Flag</Btn>
        </div>
      )}
      {sheet && (
        <Suspense fallback={null}>
          <FlagSheet rows={sheet.rows} session={session} mode={sheet.mode} busy={saving} error={sheetError} onConfirm={confirm} onClose={() => { if (!saving) setSheet(null); }} />
        </Suspense>
      )}
      {toast && <UndoToast key={toast.id} message={toast.message} onUndo={toast.undo} onDone={() => setToast(null)} />}
    </div>
  );
}

function RowGroup({ title, hint, rows, session, selecting = false, selected, onPick, onOpen, flagLabel, collapsible = false }) {
  if (collapsible && !rows.length) return null;
  const list = (
    <ul className="learner-list class-list" aria-label={title}>
      {rows.map((row) => <ClassRow key={row.studentId} row={row} session={session} selecting={selecting} checked={Boolean(selected?.has(row.studentId))} onPick={onPick ? () => onPick(row) : null} onOpen={() => onOpen(row)} flagLabel={flagLabel} />)}
    </ul>
  );
  if (collapsible) {
    return <details className="class-group"><summary><span>{title}</span><span className="class-count">{rows.length}</span></summary>{list}</details>;
  }
  return (
    <section className="class-group" aria-label={title}>
      <h3 className="class-group-title"><span>{title}</span><span className="class-count">{rows.length}</span></h3>
      {hint && <p className="class-note">{hint}</p>}
      {rows.length > 0 && list}
    </section>
  );
}

const flagReason = (reason) => (reason || '').replace(/^Not in class(?::\s*|$)/, '');

function ClassRow({ row, session, selecting, checked, onPick, onOpen, flagLabel }) {
  const status = row[session] || {};
  const entered = enteredFor(row, session);
  const preview = status.overrideActive
    ? ['Not in class', flagReason(status.reason), status.actorName && `by ${status.actorName}`].filter(Boolean).join(' · ')
    : entered ? (STATUS[status.status] || 'Present') : (status.status && status.status !== 'P' ? STATUS[status.status] : 'No gate entry');
  const lead = selecting && onPick
    ? <span className={`class-check${checked ? ' class-check--on' : ''}`} aria-hidden="true">{checked && <Icon name="check" size={18} strokeWidth={2.6} />}</span>
    : <span className="learner-avatar" aria-hidden="true">{initials(row.displayName)}</span>;
  const body = (
    <>
      {lead}
      <span className="learner-row-body">
        <span className="learner-row-top">
          <span className="learner-row-name">{row.displayName}</span>
          {entered && !status.overrideActive && <span className="learner-row-time">{formatScanTime(entered)}</span>}
        </span>
        <span className={`learner-row-preview${status.overrideActive ? ' class-preview--flagged' : ''}`}>{preview}</span>
      </span>
    </>
  );
  // Selecting: the row toggles. Otherwise it opens the history, with a trailing single-learner Flag/Restore.
  if (selecting && onPick) return <li><button type="button" className="learner-row" aria-pressed={checked} onClick={onPick}>{body}</button></li>;
  return (
    <li className="class-row">
      <button type="button" className="learner-row" onClick={onOpen}>{body}</button>
      {onPick && <button type="button" className="class-link class-row-flag" onClick={onPick} aria-label={`${flagLabel} ${row.displayName}`}>{flagLabel}</button>}
    </li>
  );
}
