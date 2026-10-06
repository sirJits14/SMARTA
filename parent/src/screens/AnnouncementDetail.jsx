import S from '../strings.js';
import { T } from '../styles.js';
import { Card, Spinner, EmptyState } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useDoc } from '../hooks/useDoc.js';
import { isVisibleToParents } from '../../../shared/announcements.js';
import { linkify, audienceText, postDateLabel } from '../lib/announcements.js';

export default function AnnouncementDetail({ navigate, id }) {
  const { data: post, error } = useDoc(`announcements/${id}`);
  const back = () => navigate('/announcements');
  if (post === undefined && !error) return <><PageHeader title={S.announcementsTitle} onBack={back} /><Spinner label={S.loading} /></>;
  // Denied (not theirs / unpublished) and missing look the same to a parent.
  if (!post || error || !isVisibleToParents(post, Date.now())) return <><PageHeader title={S.announcementsTitle} onBack={back} /><EmptyState hint={S.announcementGone} /></>;
  return (
    <>
      <PageHeader title={post.title} onBack={back} />
      <Card>
        <div style={{ fontSize: 12, color: T.inkMuted, marginBottom: 12 }}>
          {postDateLabel(post.publishedAt)} · {audienceText(post.audienceKeys)}{post.editedAt ? ` · ${S.announcementEdited}` : ''}
        </div>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.ink, margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {linkify(post.body).map((part, i) => (part.type === 'link'
            ? <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" style={{ color: T.primary }}>{part.value}</a>
            : <span key={i}>{part.value}</span>))}
        </p>
      </Card>
    </>
  );
}
