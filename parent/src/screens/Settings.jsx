import { useEffect } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase.js';
import S from '../strings.js';
import PageHeader from '../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../components/SettingsList.jsx';
import { useLinks } from '../hooks/useLinks.js';
import { useQuery, useDoc } from '../hooks/useDoc.js';
import { useTheme } from '../hooks/useTheme.js';
import { useSchoolContext } from '../hooks/useSchoolContext.js';
import { canUseSchool, hasClass, schoolHome } from '../lib/portalMode.js';
import { THEME_LABEL } from '../lib/themeLabels.js';
import { notificationState } from '../lib/notificationState.js';
import { useDeviceStatus } from '../lib/notifications.js';
import { isStandalone } from '../lib/device.js';
import { signOutNow } from '../lib/guardianWrites.js';
import { initials, nameCase } from '../lib/format.js';
import { SECTIONS, sectionGroups, notificationValue, openReportCount } from '../lib/settingsSections.js';
import ProfilePage from './settings/ProfilePage.jsx';
import NotificationsPage from './settings/NotificationsPage.jsx';
import AppearancePage from './settings/AppearancePage.jsx';
import LearnersPage from './settings/LearnersPage.jsx';
import ReportsPage from './settings/ReportsPage.jsx';
import PrivacyPage from './settings/PrivacyPage.jsx';
import InstallPage from './settings/InstallPage.jsx';
import HelpPage from './settings/HelpPage.jsx';
import AboutPage from './settings/AboutPage.jsx';
import DevelopersPage from './settings/DevelopersPage.jsx';
import SchoolModePage from './settings/SchoolModePage.jsx';
import SchoolAccessPage from './settings/SchoolAccessPage.jsx';
import SchoolRequestsPage from './settings/SchoolRequestsPage.jsx';
import { BUILD } from '../lib/buildInfo.js';

// Sub-pages by route segment (/settings/<key>). A main-list row with no page
// here is hidden, and an unknown segment falls back to the list.
const PAGES = {
  profile: ProfilePage, notifications: NotificationsPage, appearance: AppearancePage, install: InstallPage,
  learners: LearnersPage, reports: ReportsPage, help: HelpPage, privacy: PrivacyPage, about: AboutPage,
  developers: DevelopersPage, mode: SchoolModePage, 'school-access': SchoolAccessPage, 'school-requests': SchoolRequestsPage,
};

// One mounted screen for the list and every sub-page (same route name), so
// the listeners below are set up once while the parent moves between them.
export default function Settings({ user, profile, route, navigate, mode, setMode }) {
  const { links } = useLinks(user.uid);
  const device = useDeviceStatus(user.uid);
  const portal = useDoc('settings/parent_portal').data;
  const { rows: reports } = useQuery(() => query(collection(db, 'reports'), where('guardianUid', '==', user.uid), limit(10)), [user.uid], `reports:${user.uid}`);
  const accountEnabled = profile?.notificationsEnabled !== false;
  const school = useSchoolContext(user.uid);
  const allowed = canUseSchool(school.data);
  const chooseMode = (view) => {
    const next = view === 'school' ? { view: 'school', hasClass: hasClass(school.data) } : { view: 'family', hasClass: false };
    setMode(next);
    navigate(view === 'school' ? schoolHome(next) : '/', { replace: true });
  };
  const ctx = {
    user, profile, navigate, links, device, portal, reports, accountEnabled,
    mode, chooseMode, schoolAllowed: allowed, schoolContext: school.data,
    announcementPush: profile?.announcementPushEnabled !== false,
    state: notificationState({ ...device, accountEnabled }),
    savedName: profile?.displayName || user.displayName || '',
  };
  const section = route.params.section;
  // School-only pages wait for the school answer before deciding.
  const gated = { mode: allowed, 'school-requests': Array.isArray(school.data?.reviewQueue) };
  const Page = section && gated[section] !== false ? PAGES[section] : null;
  useEffect(() => { if (section && !Page && !(section in gated && school.loading)) navigate('/settings', { replace: true }); }, [section, Page, school.loading, navigate]);
  if (Page) return <Page ctx={ctx} back={() => navigate('/settings')} />;
  return <SettingsHome ctx={ctx} />;
}

function SettingsHome({ ctx }) {
  const { user, navigate, links, reports, state, savedName, mode, schoolAllowed, schoolContext } = ctx;
  const { pref } = useTheme();
  const hidden = SECTIONS.filter((s) => !PAGES[s.key] || (s.key === 'install' && isStandalone())).map((s) => s.key);
  const values = {
    notifications: notificationValue(state),
    appearance: THEME_LABEL[pref],
    learners: links ? String(links.length) : '',
    reports: openReportCount(reports) || '',
    about: BUILD.date,
  };
  return (
    <>
      <PageHeader title={S.settingsTitle} />
      <SettingsGroup>
        <SettingsRow variant="profile" leading={<span className="settings-avatar" aria-hidden="true">{initials(savedName || user.email)}</span>}
          label={nameCase(savedName) || user.email} subtitle={savedName ? user.email : undefined} onClick={() => navigate('/settings/profile')} />
      </SettingsGroup>
      <SettingsGroup>
        {schoolAllowed && <SettingsRow tile="teal" icon="class" label={S.modeTitle} value={mode.view === 'school' ? S.modeSchool : S.modeFamily} onClick={() => navigate('/settings/mode')} />}
        {Array.isArray(schoolContext?.reviewQueue) && <SettingsRow tile="teal" icon="class" label={S.schoolRequestsTitle}
          value={schoolContext.reviewQueue.length ? String(schoolContext.reviewQueue.length) : ''} onClick={() => navigate('/settings/school-requests')} />}
        <SettingsRow tile="teal" icon="class" label={S.addRoleRow} subtitle={S.addRoleRowHint} onClick={() => navigate('/join')} />
        {schoolContext?.myRequests?.length > 0 && <SettingsRow tile="teal" icon="class" label={S.schoolRequestsRow}
          value={schoolContext.myRequests.some((r) => r.status === 'pending') ? S.requestPending : undefined} onClick={() => navigate('/settings/school-access')} />}
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
