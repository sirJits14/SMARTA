import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn, Card, Banner, Spinner, EmptyState } from '../components/ui.jsx';
import { Bubble } from '../components/Bubble.jsx';
import { useDoc } from '../hooks/useDoc.js';
import { groupByDate, eventTitle } from '../lib/format.js';
import { stackDay, dayLabel } from '../lib/thread.js';
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
  useEffect(() => { const id = route.query.event; if (id) document.getElementById(`ev-${id}`)?.scrollIntoView({ block: 'center' }); }, [rows, route.query.event]);

  if (error === 'permission-denied') return <Banner tone="warn">{S.accessEnded}</Banner>;
  if (learner === undefined) return <Spinner label={S.loading} />;
  const today = localDate();
  return (
    <>
      <h1 style={{ fontSize: 20, margin: '4px 0 0' }}>{learner?.displayName}</h1>
      <div style={{ color: T.inkMuted, fontSize: 13, marginBottom: 12 }}>{learner?.sectionLabel} · {S.historyTitle}</div>
      {rows.length === 0 && !busy && <EmptyState title={S.historyEmpty} />}
      {groupByDate(rows).map((g) => {
        const target = g.items.some((ev) => ev.id === route.query.event);
        const stack = stackDay(g.items);
        return (
          <Card key={g.date} style={target ? { border: `1.5px solid ${T.primary}` } : undefined}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.inkMuted, marginBottom: 8 }}>{dayLabel(g.date, today)}</div>
            {stack.map((ev, i) => {
              const voided = ev.status === 'voided';
              return (
                <Bubble
                  key={ev.id}
                  id={`ev-${ev.id}`}
                  first={i === 0}
                  last={i === stack.length - 1}
                  highlight={route.query.event === ev.id}
                  struck={voided}
                  title={eventTitle(ev)}
                  time={formatScanTime(ev.scannedTime)}
                  meta={eventMeta(ev)}
                >
                  {!voided && (
                    <button type="button" onClick={() => navigate(`/report/${ev.id}?student=${studentId}`)}
                      style={{ background: 'none', border: 'none', color: T.primary, padding: '4px 0 0', minHeight: 32, fontFamily: T.font, fontSize: 13, cursor: 'pointer' }}>
                      {S.reportThis}
                    </button>
                  )}
                </Bubble>
              );
            })}
          </Card>
        );
      })}
      {more && <Btn variant="ghost" disabled={busy} onClick={() => load(last)} style={{ width: '100%' }}>{S.historyLoadMore}</Btn>}
    </>
  );
}
