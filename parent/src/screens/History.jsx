import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { collection, query, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn, Banner, Spinner, EmptyState } from '../components/ui.jsx';
import { Bubble, DayDivider } from '../components/Bubble.jsx';
import { useDoc } from '../hooks/useDoc.js';
import { eventTitle } from '../lib/format.js';
import { historyThread } from '../lib/thread.js';
import { formatScanTime, localDate } from '../../../shared/dates.js';

const PAGE = 30;

function eventMeta(ev) {
  const voided = ev.status === 'voided';
  return `${ev.deviceLabel || ''}${ev.delayedSync ? ` · ${S.eventLate}` : ''}${ev.source === 'staff' && !voided ? ` · ${S.eventManual}` : ''}`
    + `${voided ? ` · ${S.eventVoided}${ev.voidReason ? `: ${ev.voidReason}` : ''}` : ''}`;
}

export default function History({ studentId, navigate, route }) {
  const { data: learner, error } = useDoc(`learners/${studentId}`);
  const [rows, setRows] = useState([]); const [last, setLast] = useState(null); const [more, setMore] = useState(true); const [busy, setBusy] = useState(false);

  const load = async (cursor) => {
    setBusy(true);
    const base = [collection(db, `learners/${studentId}/events`), orderBy('effectiveAt', 'desc'), limit(PAGE)];
    const q = cursor ? query(...base, startAfter(cursor)) : query(...base);
    const snap = await getDocs(q);
    setRows((r) => (cursor ? [...r, ...snap.docs.map((d) => ({ id: d.id, ...d.data() }))] : snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    setLast(snap.docs[snap.docs.length - 1] || null); setMore(snap.size === PAGE); setBusy(false);
  };
  useEffect(() => { load(null).catch(() => setMore(false)); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [studentId, learner?.updatedAt?.seconds]);
  // Distance from the bottom of the page to hold while older scans are added
  // above, so loading them doesn't yank the parent away from where they were.
  const keepFromBottom = useRef(null);
  const loadOlder = () => { keepFromBottom.current = document.documentElement.scrollHeight - window.scrollY; load(last).catch(() => { keepFromBottom.current = null; setBusy(false); }); };
  // Land on the latest scan, at the bottom, like a text thread -- or on the
  // scan a notification pointed at.
  useLayoutEffect(() => {
    const page = document.documentElement;
    if (keepFromBottom.current !== null) { window.scrollTo(0, page.scrollHeight - keepFromBottom.current); keepFromBottom.current = null; return; }
    const target = route.query.event && document.getElementById(`ev-${route.query.event}`);
    if (target) target.scrollIntoView({ block: 'center' });
    else window.scrollTo(0, page.scrollHeight);
  }, [rows, route.query.event, learner === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error === 'permission-denied') return <Banner tone="warn">{S.accessEnded}</Banner>;
  if (learner === undefined) return <Spinner label={S.loading} />;
  const today = localDate();
  return (
    <>
      <h1 style={{ fontSize: 20, margin: '4px 0 0' }}>{learner?.displayName}</h1>
      <div style={{ color: T.inkMuted, fontSize: 13, marginBottom: 12 }}>{learner?.sectionLabel} · {S.historyTitle}</div>
      {more && rows.length > 0 && <Btn variant="ghost" disabled={busy} onClick={loadOlder} style={{ width: '100%' }}>{S.historyLoadOlder}</Btn>}
      {rows.length === 0 && !busy && <EmptyState title={S.historyEmpty} />}
      {historyThread(rows, today).map((day) => (
        <div key={day.date}>
          <DayDivider label={day.label} />
          {day.items.map((ev, i) => {
            const voided = ev.status === 'voided';
            return (
              <Bubble
                key={ev.id}
                id={`ev-${ev.id}`}
                first={i === 0}
                last={i === day.items.length - 1}
                highlight={route.query.event === ev.id}
                struck={voided}
                title={eventTitle(ev)}
                time={formatScanTime(ev.scannedTime)}
                meta={eventMeta(ev)}
              >
                {!voided && (
                  <button type="button" onClick={() => navigate(`/report/${ev.id}?student=${studentId}`)}
                    style={{ background: 'none', border: 'none', color: T.primary, padding: '4px 0 0', minHeight: T.tap, fontFamily: T.font, fontSize: 13, cursor: 'pointer' }}>
                    {S.reportThis}
                  </button>
                )}
              </Bubble>
            );
          })}
        </div>
      ))}
    </>
  );
}
