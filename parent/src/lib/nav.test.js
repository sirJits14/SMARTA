import { describe, it, expect } from 'vitest';
import { NAV_TABS, activeTab } from './nav.js';

describe('NAV_TABS', () => {
  it('lists Home, Inbox, Settings in order with their paths', () => {
    expect(NAV_TABS).toEqual([
      { key: 'home', path: '/' },
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
  it('lights Inbox for the inbox and a report opened from it', () => {
    expect(activeTab('inbox')).toBe('inbox');
    expect(activeTab('report')).toBe('inbox');
  });
  it('lights Settings for settings', () => {
    expect(activeTab('settings')).toBe('settings');
  });
  it('lights nothing on onboarding and unknown screens', () => {
    for (const name of ['verify', 'consent', 'activate', 'requestAccess', 'notFound', undefined]) {
      expect(activeTab(name)).toBeNull();
    }
  });
});
