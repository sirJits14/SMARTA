import { useEffect } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase.js';
import S from '../strings.js';
import PageHeader from '../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../components/SettingsList.jsx';
import { useLinks } from '../hooks/useLinks.js';
import { useQuery, useDoc } from '../hooks/useDoc.js';
import { useTheme } from '../hooks/useTheme.js';
import { THEME_LABEL } from '../lib/themeLabels.js';
import { notificationState } from '../lib/notificationState.js';
import { useDeviceStatus } from '../lib/notifications.js';
import { isStandalone } from '../lib/device.js';
import { signOutNow } from '../lib/guardianWrites.js';
import { initials } from '../lib/format.js';
import { SECTIONS, sectionGroups, notificationValue, openReportCount } from '../lib/settingsSections.js';
import ProfilePage from './settings/ProfilePage.jsx';
import NotificationsPage from './settings/NotificationsPage.jsx';
import AppearancePage from './settings/AppearancePage.jsx';
import LearnersPage from './settings/LearnersPage.jsx';
import ReportsPage from './settings/ReportsPage.jsx';
import PrivacyPage from './settings/PrivacyPage.jsx';

// Sub-pages by route segment (/settings/<key>). A main-list row with no page
// here is hidden, and an unknown segment falls back to the list.
const PAGES = {
  profile: ProfilePage, notifications: NotificationsPage, appearance: AppearancePage,
  learners: LearnersPage, reports: ReportsPage, privacy: PrivacyPage,
};

// One mounted screen for the list and every sub-page (same route name), so
// the listeners below are set up once while the parent moves between them.
export default function Settings({ user, profile, route, navigate }) {
  const { links } = useLinks(user.uid);
  const device = useDeviceStatus(user.uid);
  const portal = useDoc('settings/parent_portal').data;
  const { rows: reports } = useQuery(() => query(collection(db, 'reports'), where('guardianUid', '==', user.uid), limit(10)), [user.uid]);
  const accountEnabled = profile?.notificationsEnabled !== false;
  const ctx = {
    user, profile, navigate, links, device, portal, reports, accountEnabled,
    announcementPush: profile?.announcementPushEnabled !== false,
    state: notificationState({ ...device, accountEnabled }),
    savedName: profile?.displayName || user.displayName || '',
  };
  const section = route.params.section;
  const Page = section ? PAGES[section] : null;
  useEffect(() => { if (section && !Page) navigate('/settings', { replace: true }); }, [section, Page, navigate]);
  if (Page) return <Page ctx={ctx} back={() => navigate('/settings')} />;
  return <SettingsHome ctx={ctx} />;
}

function SettingsHome({ ctx }) {
  const { user, navigate, links, reports, state, savedName } = ctx;
  const { pref } = useTheme();
  const hidden = SECTIONS.filter((s) => !PAGES[s.key] || (s.key === 'install' && isStandalone())).map((s) => s.key);
  const values = {
    notifications: notificationValue(state),
    appearance: THEME_LABEL[pref],
    learners: links ? String(links.length) : '',
    reports: openReportCount(reports) || '',
  };
  return (
    <>
      <PageHeader title={S.settingsTitle} />
      <SettingsGroup>
        <SettingsRow variant="profile" leading={<span className="settings-avatar" aria-hidden="true">{initials(savedName || user.email)}</span>}
          label={savedName || user.email} subtitle={savedName ? user.email : undefined} onClick={() => navigate('/settings/profile')} />
      </SettingsGroup>
      {sectionGroups(hidden).map((group) => (
        <SettingsGroup key={group[0].key}>
          {group.map((s) => <SettingsRow key={s.key} tile={s.tile} icon={s.icon} label={s.title} value={values[s.key]} onClick={() => navigate(`/settings/${s.key}`)} />)}
        </SettingsGroup>
      ))}
      <SettingsGroup>
        <SettingsRow variant="center" tone="danger" label={S.signOut} chevron={false} onClick={signOutNow} />
      </SettingsGroup>
    </>
  );
}
