import S from '../strings.js';
import { T } from '../styles.js';
import { Btn, Card, Banner, Spinner, EmptyState } from '../components/ui.jsx';
import { useLinks } from '../hooks/useLinks.js';
import { useDoc } from '../hooks/useDoc.js';
import { describeToday } from '../lib/format.js';
import { localDate } from '../../../shared/dates.js';
import { notificationState } from '../lib/notificationState.js';
import { useDeviceStatus } from '../lib/notifications.js';

function LearnerCard({ link, navigate }) {
  const { data, error } = useDoc(`learners/${link.studentId}`);
  if (error === 'permission-denied') return <Card><Banner tone="warn">{S.accessEnded}</Banner></Card>;
  if (data === undefined) return <Card><Spinner label={S.loading} /></Card>;
  const today = describeToday(data?.today, localDate());
  return (
    <Card>
      <div style={{ fontWeight: 800, fontSize: 18 }}>{data?.displayName || '—'}</div>
      <div style={{ color: T.inkMuted, fontSize: 13, marginBottom: 10 }}>{data?.sectionLabel}</div>
      <div style={{ fontSize: 16, marginBottom: 4 }}>{today.entered}</div>
      {today.left && <div style={{ fontSize: 16, marginBottom: 10 }}>{today.left}</div>}
      <Btn variant="ghost" onClick={() => navigate(`/learner/${link.studentId}`)}>{S.homeViewHistory}</Btn>
    </Card>
  );
}

export default function Home({ user, profile, navigate }) {
  const { links } = useLinks(user.uid);
  const device = useDeviceStatus(user.uid);
  const notif = notificationState({ ...device, accountEnabled: profile?.notificationsEnabled !== false });
  if (links === undefined) return <Spinner label={S.loading} />;
  return (
    <>
      {notif === 'off' && <Banner action={<Btn onClick={() => navigate('/settings')} style={{ padding: '6px 12px', minHeight: 36 }}>{S.notifBannerButton}</Btn>}>{S.notifBannerTitle}</Banner>}
      {links.length === 0 && <EmptyState title={S.homeNoLinks} hint={S.activateBody} />}
      {links.length === 0 && <Btn onClick={() => navigate('/activate')} style={{ width: '100%' }}>{S.activateTitle}</Btn>}
      {links.map((l) => <LearnerCard key={l.id} link={l} navigate={navigate} />)}
    </>
  );
}
