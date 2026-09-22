import { describe, it, expect } from 'vitest';
import { matchRoute } from './router.js';
describe('matchRoute', () => {
  it('matches static and param routes with query', () => {
    expect(matchRoute('/', '')).toEqual({ name: 'home', params: {}, query: {} });
    expect(matchRoute('/activate', '?c=K7M4P2XQ')).toEqual({ name: 'activate', params: {}, query: { c: 'K7M4P2XQ' } });
    expect(matchRoute('/learner/S1', '')).toEqual({ name: 'learner', params: { id: 'S1' }, query: {} });
    expect(matchRoute('/inbox', '?item=k1_S1_202609210712')).toEqual({ name: 'inbox', params: {}, query: { item: 'k1_S1_202609210712' } });
    expect(matchRoute('/report/k1_S1_202609210712', '?student=S1').params).toEqual({ eventId: 'k1_S1_202609210712' });
    expect(matchRoute('/request-access', '').name).toBe('requestAccess');
    expect(matchRoute('/settings/', '').name).toBe('settings');
    expect(matchRoute('/nope', '').name).toBe('notFound');
  });
});
