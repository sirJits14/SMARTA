import { describe, it, expect } from 'vitest';
import S from '../strings.js';
import { SECTIONS, sectionGroups, notificationValue, openReportCount, contactRows } from './settingsSections.js';

const keys = (groups) => groups.map((g) => g.map((s) => s.key));

describe('sectionGroups', () => {
  it('lists the rows in three groups, top to bottom', () => {
    expect(keys(sectionGroups())).toEqual([
      ['notifications', 'appearance', 'install'],
      ['learners', 'reports'],
      ['help', 'privacy', 'about'],
    ]);
  });
  it('drops hidden rows and any group left empty', () => {
    expect(keys(sectionGroups(['install', 'learners', 'reports']))).toEqual([['notifications', 'appearance'], ['help', 'privacy', 'about']]);
  });
  it('gives every row a title, tile and icon', () => {
    for (const s of SECTIONS) {
      expect(s.title, s.key).toBeTruthy();
      expect(s.tile, s.key).toBeTruthy();
      expect(s.icon, s.key).toBeTruthy();
    }
  });
});

describe('notificationValue', () => {
  it('has a short label for every notificationState result', () => {
    expect(notificationValue('on')).toBe(S.notifShortOn);
    expect(notificationValue('off')).toBe(S.notifShortOff);
    expect(notificationValue('account_off')).toBe(S.notifShortOff);
    expect(notificationValue('blocked')).toBe(S.notifShortBlocked);
    expect(notificationValue('unsupported')).toBe(S.notifShortUnsupported);
    expect(notificationValue('ios_needs_install')).toBe(S.notifShortInstall);
    expect(notificationValue(undefined)).toBe('');
  });
});

describe('openReportCount', () => {
  it('counts only open reports', () => {
    expect(openReportCount([{ status: 'open' }, { status: 'resolved' }, { status: 'open' }])).toBe(2);
    expect(openReportCount(undefined)).toBe(0);
  });
});

describe('contactRows', () => {
  const portal = { contactPhone: ' +63 (44) 815-1234 ', contactEmail: 'registrar@example.test', contactFacebookUrl: 'https://www.facebook.com/example.school', officeHours: 'Mon–Fri, 7:30 AM – 4:30 PM' };
  it('builds tappable rows in a fixed order', () => {
    expect(contactRows(portal)).toEqual([
      { key: 'phone', label: S.helpPhone, value: '+63 (44) 815-1234', href: 'tel:+63448151234', tile: 'green', icon: 'phone' },
      { key: 'email', label: S.helpEmail, value: 'registrar@example.test', href: 'mailto:registrar@example.test', tile: 'blue', icon: 'envelope' },
      { key: 'facebook', label: S.helpFacebook, value: 'facebook.com/example.school', href: 'https://www.facebook.com/example.school', external: true, tile: 'indigo', icon: 'globe' },
      { key: 'hours', label: S.helpHours, value: 'Mon–Fri, 7:30 AM – 4:30 PM', tile: 'grey', icon: 'clock' },
    ]);
  });
  it('skips blank, missing and non-https values', () => {
    expect(contactRows({ contactPhone: '  ', contactEmail: '', contactFacebookUrl: 'http://facebook.com/x' })).toEqual([]);
    expect(contactRows(null)).toEqual([]);
    expect(contactRows(undefined)).toEqual([]);
  });
  it('shows a phone with no digits as plain text', () => {
    expect(contactRows({ contactPhone: 'Ask the guard' })[0].href).toBeUndefined();
  });
});
