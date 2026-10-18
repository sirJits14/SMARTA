// Bottom-nav tabs and which one a route lights up. Pulled out of Shell so
// the mapping is testable without rendering.
export const NAV_TABS = [
  { key: 'home', path: '/' },
  { key: 'notices', path: '/announcements' },
  { key: 'inbox', path: '/inbox' },
  { key: 'settings', path: '/settings' },
];
export const navTabs = (view, hasClass = true) => view === 'school' ? [
  ...(hasClass ? [{ key: 'class', path: '/school' }] : []),
  { key: 'notices', path: '/announcements?view=school' },
  { key: 'settings', path: '/settings?view=school' },
] : NAV_TABS;
export const portalView = (route) => route.name === 'school' || (['announcements', 'announcement', 'settings'].includes(route.name) && route.query?.view === 'school') ? 'school' : 'family';
export const notificationDestination = (data) => data?.announcementId ? `/announcements/${encodeURIComponent(data.announcementId)}${data.view === 'school' ? '?view=school' : ''}` : '/inbox';

const ROUTE_TAB = {
  home: 'home', school: 'class', learner: 'home', report: 'home', // a report is opened from a learner's history
  announcements: 'notices', announcement: 'notices',
  inbox: 'inbox',
  settings: 'settings',
};

export const activeTab = (routeName) => ROUTE_TAB[routeName] ?? null;

// Screens that draw their own PageHeader drop the app-name line above it.
const OWN_HEADER = new Set(['home', 'school', 'learner', 'inbox', 'settings', 'announcements', 'announcement']);
export const showsAppTitle = (routeName) => !OWN_HEADER.has(routeName);
