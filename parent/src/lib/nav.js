// Bottom-nav tabs and which one a route lights up. Pulled out of Shell so
// the mapping is testable without rendering.
export const NAV_TABS = [
  { key: 'home', path: '/' },
  { key: 'inbox', path: '/inbox' },
  { key: 'settings', path: '/settings' },
];

const ROUTE_TAB = {
  home: 'home', learner: 'home',
  inbox: 'inbox', report: 'inbox', // a report is opened from an inbox item or its push
  settings: 'settings',
};

export const activeTab = (routeName) => ROUTE_TAB[routeName] ?? null;
