import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { collection, query, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';
import S from '../strings.js';
import { Btn, Banner, Spinner, EmptyState } from '../components/ui.jsx';
import { Bubble, DayDivider } from '../components/Bubble.jsx';
import { useDoc } from '../hooks/useDoc.js';
import { eventTitle, latestScanToday, nameCase } from '../lib/format.js';
import { historyThread } from '../lib/thread.js';
import { formatScanTime, localDate } from '../../../shared/dates.js';
import PageHeader from '../components/PageHeader.jsx';
import FamilySessionDetails from '../components/FamilySessionDetails.jsx';
import SessionSheet from '../components/SessionSheet.jsx';
import Icon from '../components/Icon.jsx';
import RelationshipRow from '../components/RelationshipRow.jsx';
import { ADVISER, isDepedEmail } from '../lib/relationships.js';
import { useRelationshipSheet } from '../hooks/useRelationshipSheet.jsx';

const PAGE = 30;

// The gate, plus a note only when one applies (late, added or corrected).
function eventMeta(ev) {
  const voided = ev.status === 'voided';
  return [
    ev.deviceLabel,
    ev.delayedSync && S.eventLate,
    ev.source === 'staff' && !voided && S.eventManual,
    voided && `${S.eventVoided}${ev.voidReason ? `: ${ev.voidReason}` : ''}`,
  ].filter(Boolean).join(' · ');
}

export default function History({ user, studentId, navigate, route }) {
  const { data: learner, error } = useDoc(`learners/${studentId}`);
  // Session attendance opens on request, or straight away from an
  // "Attendance updated" notification (?date=…&session=…).
  const [sessionsOpen, setSessionsOpen] = useState(Boolean(route.query.date));
  useEffect(() => { if (route.query.date) setSessionsOpen(true); }, [studentId, route.query.date]);
  // Only DepEd accounts can change their own relationship, so only they read
  // their own link here; everyone else's screen is unchanged (spec 2026-10-17).
  const deped = isDepedEmail(user?.email);
  const { data: link } = useDoc(deped && user ? `guardian_links/${user.uid}_${studentId}` : null);
  // An Adviser link is not a family link, so this screen stops working for
  // it: go Home and say why.
  const relationship = useRelationshipSheet({ onSaved: (r) => { if (r === ADVISER) navigate('/?changed=adviser', { replace: true }); } });
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

  const today = localDate();
  return (
    <>
      <PageHeader title={nameCase(learner?.displayName)} avatarName={learner?.displayName} subtitle={learner && `${learner.sectionLabel} · ${S.historyTitle}`}
        status={learner && latestScanToday(learner.today, today)} onBack={() => navigate('/')}
        action={learner && !error && (
          <button type="button" className="page-header-pill" aria-haspopup="dialog" aria-expanded={sessionsOpen} onClick={() => setSessionsOpen(true)}>
            <Icon name="calendar" size={18} />{S.sessionButton}
          </button>
        )} />
      {deped && learner && <RelationshipRow link={link} onChange={() => relationship.show(link)} />}
      {relationship.err && <Banner tone="danger">{relationship.err}</Banner>}
      {relationship.sheet}
      {sessionsOpen && learner && !error && (
        <SessionSheet onClose={() => setSessionsOpen(false)}>
          <FamilySessionDetails key={studentId} studentId={studentId} requestedDate={route.query.date} requestedSession={route.query.session} />
        </SessionSheet>
      )}
      {error === 'permission-denied' ? <Banner tone="warn">{S.accessEnded}</Banner>
        : learner === undefined ? <Spinner label={S.loading} />
          : <div className="learner-history">
            {more && rows.length > 0 && <Btn variant="ghost" disabled={busy} onClick={loadOlder} style={{ width: '100%' }}>{S.historyLoadOlder}</Btn>}
            {rows.length === 0 && !busy && <EmptyState title={S.historyEmpty} />}
            {historyThread(rows, today).map((day) => (
              <div key={day.date}>
                <DayDivider label={day.label} />
                <div className="bubble-group">
                  {day.items.map((ev, i) => {
                    const voided = ev.status === 'voided';
                    // Tapping a scan reports it; corrected scans can't be reported.
                    return (
                      <Bubble
                        key={ev.id}
                        id={`ev-${ev.id}`}
                        first={i === 0}
                        last={i === day.items.length - 1}
                        tone={ev.kind === 'in' && !voided ? 'in' : 'out'}
                        highlight={route.query.event === ev.id}
                        struck={voided}
                        title={eventTitle(ev)}
                        time={formatScanTime(ev.scannedTime)}
                        meta={eventMeta(ev)}
                        onClick={voided ? undefined : () => navigate(`/report/${ev.id}?student=${studentId}`)}
                        actionLabel={S.reportThis}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
            {rows.length > 0 && <p className="bubble-hint">{S.historyTapHint}</p>}
          </div>}
    </>
  );
}
