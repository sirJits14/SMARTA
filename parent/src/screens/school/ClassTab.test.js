import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../../strings.js';
import ClassTab from './ClassTab.jsx';

// Smoke test: ClassTab pulls in Firebase, so stub it and check the module still loads and exports a screen.
vi.mock('../../firebase.js', () => ({
  app: {},
  db: {},
  auth: { currentUser: null },
  callable: () => async () => ({ data: {} }),
}));

describe('ClassTab', () => {
  it('loads and exports a component', async () => {
    const mod = await import('./ClassTab.jsx');
    expect(typeof mod.default).toBe('function');
  });
});

// A server render runs no effects, so no roster is fetched and nothing touches the network:
// it shows the first paint, where the Download SF2 button is decided by `ended` alone.
describe('ClassTab Download SF2 button', () => {
  const section = { id: 'sec-1', name: 'Rizal', gradeLevel: 7, schoolYear: '2026-2027' };
  const render = (props) => renderToStaticMarkup(createElement(ClassTab, { sections: [section], ended: false, navigate() {}, ...props }));

  it('is offered while the school year is running', () => {
    const html = render({ ended: false });
    expect(html).toContain(S.sf2Button);
    expect(html).toContain(`aria-label="${S.classActions}"`);
  });

  it('is hidden once the school year has ended', () => {
    const html = render({ ended: true });
    expect(html).not.toContain(S.sf2Button);
  });

  it('is not offered when there is no class, and the screen still renders', () => {
    const html = render({ sections: [] });
    expect(html).not.toContain(S.sf2Button);
  });
});

// Same first-paint render: the Add learner button follows `ended` the same way.
describe('ClassTab Add learner button', () => {
  const section = { id: 'sec-1', name: 'Rizal', gradeLevel: 7, schoolYear: '2026-2027' };
  const render = (props) => renderToStaticMarkup(createElement(ClassTab, { sections: [section], ended: false, navigate() {}, ...props }));

  it('is offered while the school year is running', () => {
    expect(render({ ended: false })).toContain(S.addLearnerButton);
  });

  it('is hidden once the school year has ended', () => {
    expect(render({ ended: true })).not.toContain(S.addLearnerButton);
  });
});
