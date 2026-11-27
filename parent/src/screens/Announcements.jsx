import { useEffect, useRef } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Card, Spinner, EmptyState } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useAnnouncements } from '../hooks/useAnnouncements.js';
import { splitForList, isNewSince, audienceText, postDateLabel } from '../lib/announcements.js';

function PostCard({ post, isNew, onOpen }) {
  return (
    <Card style={{ padding: 0 }}>
      <button type="button" className="notice-card" onClick={onOpen} style={{ background: 'none', border: 0, margin: 0, textAlign: 'left', color: 'inherit', font: 'inherit', display: 'block', width: '100%', boxSizing: 'border-box', padding: 16, cursor: 'pointer', borderRadius: T.radius, fontFamily: T.font }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 16, fontWeight: 600, color: T.ink }}>{post.title}</strong>
          {isNew && <span className="p-badge">{S.announcementsNew}</span>}
        </span>
        <span style={{ display: '-webkit-box', fontSize: 14, color: T.ink, marginTop: 6, WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{post.body}</span>
        <span style={{ display: 'block', fontSize: 12, color: T.inkMuted, marginTop: 8 }}>{postDateLabel(post.publishedAt)} · {audienceText(post.audienceKeys, post.audience)}</span>
      </button>
    </Card>
  );
}

export default function Announcements({ user, profile, navigate, view = 'family' }) {
  const { rows, error } = useAnnouncements(profile, 50, view);
  // "New" compares against the last visit as it was when this screen
  // opened; the seen-at write below must not clear the markers mid-visit.
  const seenAtOpen = useRef(undefined);
  if (seenAtOpen.current === undefined && profile) seenAtOpen.current = profile.announcementsSeenAt ?? null;
  const marked = useRef(false);
  useEffect(() => {
    if (!rows || error || marked.current || view === 'school') return;
    marked.current = true;
    updateDoc(doc(db, 'guardians', user.uid), { announcementsSeenAt: serverTimestamp() }).catch(() => {});
  }, [rows, error, user.uid, view]);

  const header = <PageHeader title={view === 'school' ? 'School notices' : S.announcementsTitle} />;
  if (rows === undefined) return <>{header}<Spinner label={S.loading} /></>;
  if (error) return <>{header}<EmptyState hint={S.announcementsError} /></>;
  const { pinned, rest } = splitForList(rows, Date.now());
  if (!pinned.length && !rest.length) return <>{header}<EmptyState hint={view === 'school' ? S.announcementsEmptySchool : S.announcementsEmpty} /></>;
  const card = (p) => <PostCard key={p.id} post={p} isNew={view === 'family' && isNewSince(p, seenAtOpen.current)} onOpen={() => navigate(`/announcements/${p.id}${view === 'school' ? '?view=school' : ''}`)} />;
  return (
    <>
      {header}
      {pinned.length > 0 && <h2 className="p-section-title">{S.announcementsPinned}</h2>}
      {pinned.map(card)}
      {pinned.length > 0 && rest.length > 0 && <div style={{ height: 8 }} />}
      {rest.map(card)}
    </>
  );
}
