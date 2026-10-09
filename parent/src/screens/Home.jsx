import S from '../strings.js';
import { Btn, Banner, Spinner, EmptyState } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useLinks } from '../hooks/useLinks.js';
import { useDocs } from '../hooks/useDoc.js';
import { initials, latestScan } from '../lib/format.js';
import { orderLearners, listName } from '../lib/learnerOrder.js';
import { formatScanTime, localDate } from '../../../shared/dates.js';
import { notificationState } from '../lib/notificationState.js';
import { useDeviceStatus } from '../lib/notifications.js';

// A Messages-style row: name and today's latest scan time on top, then what
// happened and the learner's section as the muted preview. The dot in the
// margin marks a learner who has entered and not yet left today.
function LearnerRow({ link, data, error, navigate }) {
  const name = listName(data, link.learnerName);
  const avatar = <span className="learner-avatar" aria-hidden="true">{initials(data?.displayName || link.learnerName)}</span>;
  if (error === 'permission-denied') {
    return (
      <li className="learner-row">
        {avatar}
        <span className="learner-row-body">
          <span className="learner-row-top"><span className="learner-row-name">{name}</span></span>
          <span className="learner-row-preview learner-row-preview--warn">{S.accessEnded}</span>
        </span>
      </li>
    );
  }
  const latest = latestScan(data?.today, localDate());
  const happened = latest ? (latest.kind === 'in' ? S.eventIn : S.eventOut) : S.homeNoEntryShort;
  return (
    <li>
      <button type="button" className="learner-row" onClick={() => navigate(`/learner/${link.studentId}`)}>
        {latest?.kind === 'in' && <span className="learner-row-dot" aria-hidden="true" />}
        {avatar}
        <span className="learner-row-body">
          <span className="learner-row-top">
            <span className="learner-row-name">{name}</span>
            {latest && <span className="learner-row-time">{formatScanTime(latest.time)}</span>}
            <span className="learner-row-chevron" aria-hidden="true"><Icon name="chevron" size={16} /></span>
          </span>
          <span className="learner-row-preview">{[happened, data?.sectionLabel].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="sr-only">{S.homeViewHistory}</span>
      </button>
    </li>
  );
}

export default function Home({ user, profile, navigate }) {
  const { links } = useLinks(user.uid);
  const docs = useDocs((links || []).map((l) => `learners/${l.studentId}`));
  const device = useDeviceStatus(user.uid);
  const notif = notificationState({ ...device, accountEnabled: profile?.notificationsEnabled !== false });
  const header = <PageHeader title={S.homeTitle} logo="/icons/icon-192.png" />;
  // Wait for every learner doc so the list appears once, already in order.
  const entries = links?.map((link) => ({ link, data: undefined, ...docs[`learners/${link.studentId}`] }));
  if (!entries || entries.some((e) => e.data === undefined)) return <>{header}<Spinner label={S.loading} /></>;
  return (
    <>
      {header}
      {notif === 'off' && <Banner action={<Btn onClick={() => navigate('/settings')} style={{ padding: '6px 12px', minHeight: 36 }}>{S.notifBannerButton}</Btn>}>{S.notifBannerTitle}</Banner>}
      {entries.length === 0 && <EmptyState title={S.homeNoLinks} hint={S.activateBody} />}
      {entries.length === 0 && <Btn onClick={() => navigate('/activate')} style={{ width: '100%' }}>{S.activateTitle}</Btn>}
      {entries.length > 0 && (
        <ul className="learner-list" aria-label={S.homeLearnersLabel}>
          {orderLearners(entries).map((e) => <LearnerRow key={e.link.id} {...e} navigate={navigate} />)}
        </ul>
      )}
    </>
  );
}
