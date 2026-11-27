import { describe, it, expect } from 'vitest';
import { matchRoute } from './router.js';
import { navDirection, routeDepth } from './navMotion.js';

const r = (path) => { const [p, q = ''] = path.split('?'); return matchRoute(p, q ? `?${q}` : ''); };
const dir = (from, to) => navDirection(r(from), r(to));

describe('routeDepth', () => {
  it('puts tab roots at 0, what they open at 1, and a report at 2', () => {
    expect(['/', '/inbox', '/announcements', '/settings'].map((p) => routeDepth(r(p)))).toEqual([0, 0, 0, 0]);
    expect(['/learner/S1', '/announcements/a1', '/settings/profile', '/request-access'].map((p) => routeDepth(r(p)))).toEqual([1, 1, 1, 1]);
    expect(routeDepth(r('/report/e1?student=S1'))).toBe(2);
  });
});

describe('navDirection', () => {
  it('goes forward into a learner, a report, a post, or a settings page', () => {
    expect(dir('/', '/learner/S1')).toBe('forward');
    expect(dir('/learner/S1', '/report/e1?student=S1')).toBe('forward');
    expect(dir('/announcements', '/announcements/a1')).toBe('forward');
    expect(dir('/settings', '/settings/profile')).toBe('forward');
    expect(dir('/inbox', '/learner/S1?event=e1')).toBe('forward');
  });
  it('goes back out to where it came from', () => {
    expect(dir('/learner/S1', '/')).toBe('back');
    expect(dir('/report/e1?student=S1', '/learner/S1')).toBe('back');
    expect(dir('/settings/profile', '/settings')).toBe('back');
  });
  it('fades between tabs and between screens at the same depth', () => {
    expect(dir('/', '/inbox')).toBe('fade');
    expect(dir('/settings', '/announcements')).toBe('fade');
    expect(dir('/learner/S1', '/learner/S2')).toBe('fade');
  });
  it('does not animate when only the query changes', () => {
    expect(dir('/inbox', '/inbox?item=x')).toBe(null);
    expect(dir('/learner/S1', '/learner/S1?event=e1')).toBe(null);
    expect(navDirection(null, r('/'))).toBe(null);
  });
});
