import { describe, it, expect } from 'vitest';
import { NAV_TABS, activeTab, showsAppTitle } from './nav.js';
import { matchRoute } from './router.js';

describe('NAV_TABS', () => {
  it('lists Home, Notices, Inbox, Settings in order with their paths', () => {
    expect(NAV_TABS).toEqual([
      { key: 'home', path: '/' },
      { key: 'notices', path: '/announcements' },
      { key: 'inbox', path: '/inbox' },
      { key: 'settings', path: '/settings' },
    ]);
  });
});

describe('activeTab', () => {
  it('lights Home for the home screen and a learner page', () => {
    expect(activeTab('home')).toBe('home');
    expect(activeTab('learner')).toBe('home');
  });
  it('lights Notices for the list and a single announcement', () => {
    expect(activeTab('announcements')).toBe('notices');
    expect(activeTab('announcement')).toBe('notices');
  });
  it('lights Inbox for the inbox and a report opened from it', () => {
    expect(activeTab('inbox')).toBe('inbox');
    expect(activeTab('report')).toBe('inbox');
  });
  it('lights Settings for settings', () => {
    expect(activeTab('settings')).toBe('settings');
  });
  it('keeps Settings lit on a settings sub-page', () => {
    expect(activeTab(matchRoute('/settings/about').name)).toBe('settings');
  });
  it('lights nothing on onboarding and unknown screens', () => {
    for (const name of ['verify', 'consent', 'activate', 'requestAccess', 'notFound', undefined]) {
      expect(activeTab(name)).toBeNull();
    }
  });
});

describe('route drift guard', () => {
  it('lights the matching tab for every NAV_TABS path via the real router', () => {
    for (const tab of NAV_TABS) {
      expect(activeTab(matchRoute(tab.path).name)).toBe(tab.key);
    }
  });
});

describe('showsAppTitle', () => {
  it('hides the app title on screens with their own page header', () => {
    for (const name of ['home', 'learner', 'inbox', 'settings', 'announcements', 'announcement']) expect(showsAppTitle(name)).toBe(false);
  });
  it('keeps it on reports and onboarding', () => {
    for (const name of ['report', 'verify', 'consent', 'activate', 'requestAccess', 'notFound', undefined]) expect(showsAppTitle(name)).toBe(true);
  });
});
