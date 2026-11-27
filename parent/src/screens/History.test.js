import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../strings.js';
import History from './History.jsx';

const state = vi.hoisted(() => ({ learner: null, asked: [] }));
vi.mock('../firebase.js', () => ({ app: {}, db: {}, auth: { currentUser: null }, appCheckReady: Promise.resolve(), callable: () => async () => ({ data: {} }) }));
vi.mock('../hooks/useDoc.js', async (original) => ({ ...(await original()), useDoc: (path) => (path?.startsWith('learners/') ? state.learner : { data: null, error: null }) }));
vi.mock('../hooks/useStudentPhoto.js', () => ({
  useStudentPhoto: (studentId, version) => { state.asked.push([studentId, version]); return version ? 'data:image/jpeg;base64,abc' : ''; },
}));

const render = (studentId = 'S1') => renderToStaticMarkup(createElement(History, { user: null, studentId, navigate() {}, route: { query: {} } }));
const learner = (extra) => ({ error: null, data: { id: 'S1', displayName: 'ZAMORA, ANA', sectionLabel: 'Grade 7 · Rizal', ...extra } });
const askedNothing = () => state.asked.length > 0 && state.asked.every(([, version]) => version === undefined);

describe('History learner photo', () => {
  beforeEach(() => { state.asked = []; });

  it('shows the photo as the avatar', () => {
    state.learner = learner({ photoUpdatedAt: { seconds: 42 } });
    expect(render()).toContain('src="data:image/jpeg;base64,abc"');
    expect(state.asked).toContainEqual(['S1', 42]);
  });
  it('asks for nothing when the learner has no photo', () => {
    state.learner = learner();
    expect(render()).not.toContain('<img class="page-header-avatar');
    expect(askedNothing()).toBe(true);
  });
  it('asks for nothing when the learner read was denied', () => {
    state.learner = { ...learner({ photoUpdatedAt: { seconds: 42 } }), error: 'permission-denied' };
    expect(render()).not.toContain('data:image/jpeg');
    expect(askedNothing()).toBe(true);
  });
  it('asks for nothing while the previous learner is still held', () => {
    state.learner = learner({ photoUpdatedAt: { seconds: 42 } });
    expect(render('S2')).not.toContain('data:image/jpeg');
    expect(askedNothing()).toBe(true);
  });
  it('keeps the Sessions button icon-only', () => {
    state.learner = learner();
    expect(render()).toMatch(new RegExp(`<button[^>]*aria-label="${S.sessionButton}"[^>]*><svg`));
  });
});
