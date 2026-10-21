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

// Same scan line as the guardian's History.
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
export default function LearnerHistory({ sectionId, studentId, navigate }) {
  const [learner, setLearner] = useState(undefined);
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null); // opaque; passed back unchanged
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); // fatal: nothing loaded yet
  const [warning, setWarning] = useState(null); // { text, after }: a refresh or older page failed
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const keepFromBottom = useRef(null);
  const sequence = useRef(0);
  const loaded = useRef(false);

  const load = useCallback(async (after) => {
    const request = ++sequence.current;
    setBusy(true);
    try {
      const { data } = await callable('getSchoolLearnerHistoryFn')({ sectionId, studentId, cursor: after });
      if (request !== sequence.current) { keepFromBottom.current = null; return; }
      loaded.current = true;
      setLearner(data.learner);
      setRows((current) => (after ? [...current, ...data.events] : data.events));
      setCursor(data.nextCursor);
      setError('');
      setWarning(null);
    } catch (e) {
      keepFromBottom.current = null;
      if (request === sequence.current) {
        const text = ['functions/permission-denied', 'functions/not-found'].includes(e?.code) ? S.adviserNotInClass : schoolError(e);
        if (loaded.current) setWarning({ text, after });
        else { setError(text); setLearner(null); }
      }
    }
    finally { if (request === sequence.current) setBusy(false); }
  }, [sectionId, studentId]);
  useEffect(() => {
    loaded.current = false; keepFromBottom.current = null;
    setLearner(undefined); setRows([]); setCursor(null); setError(''); setWarning(null);
    load(null); return () => { ++sequence.current; };
  }, [load]);

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
            {warning && <Banner tone="warn" action={<Btn variant="ghost" disabled={busy} onClick={() => load(warning.after)}>Retry</Btn>}>{warning.text}</Banner>}
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
