// Bottom-nav tabs and which one a route lights up. Pulled out of Shell so
// the mapping is testable without rendering.
export const NAV_TABS = [
  { key: 'home', path: '/' },
  { key: 'notices', path: '/announcements' },
  { key: 'inbox', path: '/inbox' },
  { key: 'settings', path: '/settings' },
];

const ROUTE_TAB = {
  home: 'home', learner: 'home', report: 'home', // a report is opened from a learner's history
  announcements: 'notices', announcement: 'notices',
  inbox: 'inbox',
  settings: 'settings',
};

export const activeTab = (routeName) => ROUTE_TAB[routeName] ?? null;

// Screens that draw their own PageHeader drop the app-name line above it.
const OWN_HEADER = new Set(['home', 'learner', 'inbox', 'settings', 'announcements', 'announcement']);
export const showsAppTitle = (routeName) => !OWN_HEADER.has(routeName);
