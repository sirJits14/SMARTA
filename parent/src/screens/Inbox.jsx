import { useEffect } from 'react';
import { collection, query, orderBy, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Card, Spinner, EmptyState } from '../components/ui.jsx';
import { useQuery } from '../hooks/useDoc.js';
import { formatDateLabel, formatScanTime } from '../../../shared/dates.js';

const KIND = { in: S.eventIn, out: S.eventOut, void: S.eventVoided };

export default function Inbox({ user, navigate, route }) {
  const { rows } = useQuery(() => query(collection(db, `guardians/${user.uid}/inbox`), orderBy('createdAt', 'desc'), limit(30)), [user.uid]);
  const open = async (item) => {
    if (!item.readAt) updateDoc(doc(db, `guardians/${user.uid}/inbox/${item.id}`), { readAt: serverTimestamp() }).catch(() => {});
    if (item.type === 'attendance') navigate(`/learner/${item.studentId}?event=${item.eventId}`);
  };
  useEffect(() => { const target = rows?.find((r) => r.id === route.query.item); if (target) open(target); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [rows === undefined, route.query.item]);

  if (rows === undefined) return <Spinner label={S.loading} />;
  if (rows.length === 0) return <EmptyState title={S.inboxTitle} hint={S.inboxEmpty} />;
  return (
    <>
      <h1 style={{ fontSize: 20 }}>{S.inboxTitle}</h1>
      {rows.map((item) => (
        <Card key={item.id} role="button" tabIndex={0} onClick={() => open(item)} onKeyDown={(e) => e.key === 'Enter' && open(item)} style={{ cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span aria-label={item.readAt ? undefined : 'Unread'} style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, background: item.readAt ? 'transparent' : T.primary, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{item.type === 'attendance' ? `${item.learnerName}: ${KIND[item.kind] || S.inboxNewEvent}` : item.title}</div>
            <div style={{ fontSize: 13, color: T.inkMuted }}>
              {item.type === 'attendance' ? `${formatDateLabel(item.scannedDate)} · ${formatScanTime(item.scannedTime)}` : item.body}
            </div>
          </div>
        </Card>
      ))}
    </>
  );
}
