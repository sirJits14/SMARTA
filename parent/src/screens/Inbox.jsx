import { useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Spinner, EmptyState } from '../components/ui.jsx';
import { Bubble, DayDivider } from '../components/Bubble.jsx';
import { useQuery } from '../hooks/useDoc.js';
import { toFeed } from '../lib/thread.js';
import { formatScanTime, localDate } from '../../../shared/dates.js';

const KIND = { in: S.eventIn, out: S.eventOut, void: S.eventVoided };

export default function Inbox({ user, navigate, route }) {
  const { rows, error } = useQuery(() => query(collection(db, `guardians/${user.uid}/inbox`), orderBy('createdAt', 'desc'), limit(30)), [user.uid]);
  const endRef = useRef(null);
  // Which items were unread when this visit started. Opening the thread marks
  // everything read (like opening a chat), but these keep their "new" styling
  // until the guardian leaves, so they can still see what was new.
  const unreadAtOpen = useRef(null);
  if (rows && unreadAtOpen.current === null) unreadAtOpen.current = new Set(rows.filter((r) => !r.readAt).map((r) => r.id));

  const markRead = (item) => {
    if (!item.readAt) updateDoc(doc(db, `guardians/${user.uid}/inbox/${item.id}`), { readAt: serverTimestamp() }).catch(() => {});
  };
  const open = (item) => {
    markRead(item);
    if (item.type === 'attendance') navigate(`/learner/${item.studentId}?event=${item.eventId}`);
  };

  // Push deep link: /inbox?item=<inboxId>
  useEffect(() => { const target = rows?.find((r) => r.id === route.query.item); if (target) open(target); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [rows === undefined, route.query.item]);
  // Viewing the thread reads it.
  useEffect(() => { rows?.forEach(markRead); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [rows]);
  // Land on the newest message, at the bottom, like a text thread.
  useEffect(() => { if (rows?.length) endRef.current?.scrollIntoView({ block: 'end' }); }, [rows === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows === undefined) return <Spinner label={S.loading} />;
  if (error) return <EmptyState title={S.inboxTitle} hint={S.inboxError} />;
  if (rows.length === 0) return <EmptyState title={S.inboxTitle} hint={S.inboxEmpty} />;

  return (
    <>
      <h1 style={{ fontSize: 20 }}>{S.inboxTitle}</h1>
      {toFeed(rows, localDate()).map((day) => (
        <div key={day.date}>
          <DayDivider label={day.label} />
          {day.runs.map((run, ri) => (
            <div key={`${day.date}-${ri}`} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.inkMuted, margin: '0 0 4px 12px' }}>{run.learnerName || S.inboxFromSchool}</div>
              {run.items.map((item, i) => (
                <Bubble
                  key={item.id}
                  id={`msg-${item.id}`}
                  first={i === 0}
                  last={i === run.items.length - 1}
                  unread={unreadAtOpen.current?.has(item.id)}
                  title={item.type === 'attendance' ? (KIND[item.kind] || S.inboxNewEvent) : item.title}
                  body={item.type === 'attendance' ? null : item.body}
                  time={formatScanTime(item.time)}
                  onClick={item.type === 'attendance' ? () => open(item) : undefined}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
      <div ref={endRef} />
    </>
  );
}
