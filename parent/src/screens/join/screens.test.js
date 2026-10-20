import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../../strings.js';
import { roleOptions } from '../../lib/join.js';

// Smoke test: nothing imports these screens until the /join route is wired, so
// this catches syntax and import-path errors and checks the chooser's copy.
vi.mock('../../firebase.js', () => ({
  app: {},
  db: {},
  auth: { currentUser: null },
  googleProvider: {},
  appCheckReady: Promise.resolve(),
  callable: () => async () => ({ data: {} }),
}));

const load = {
  Join: () => import('../Join.jsx'),
  RoleChooser: () => import('./RoleChooser.jsx'),
  FamilyStep: () => import('./FamilyStep.jsx'),
  AdviserStep: () => import('./AdviserStep.jsx'),
  JoinSummary: () => import('./JoinSummary.jsx'),
  StepHeader: () => import('./StepHeader.jsx'),
};

describe('Join screens', () => {
  for (const [name, importer] of Object.entries(load)) {
    it(`${name} loads and exports a component`, async () => {
      const mod = await importer();
      expect(typeof mod.default).toBe('function');
    });
  }

  it('exports the step label helper and role text', async () => {
    const { stepLabel } = await load.StepHeader();
    const { ROLE_TEXT } = await load.RoleChooser();
    expect(typeof stepLabel).toBe('function');
    expect(stepLabel(0, 2, 'Parent/Guardian')).toContain('1');
    expect(Object.keys(ROLE_TEXT)).toEqual(['family', 'adviser']);
    expect(ROLE_TEXT.family[0]).toBe(S.joinFamily);
  });

  const render = async (props) => {
    const { default: RoleChooser } = await load.RoleChooser();
    return renderToStaticMarkup(createElement(RoleChooser, { name: 'Ana Reyes', setName() {}, setSelected() {}, onContinue() {}, selected: [], ...props }));
  };

  it('shows the two role titles for a DepEd email', async () => {
    const options = roleOptions({ email: 'ana@deped.gov.ph' });
    const html = await render({ options });
    for (const title of [S.joinFamily, S.joinAdviser]) expect(html).toContain(title);
    expect(html).toContain('Parent/Guardian');
    expect(html).not.toContain('Subject Teacher');
    expect(html).not.toContain('Needs approval');
  });

  it('shows only Parent/Guardian for a personal email, even if a slip link preselected Class Adviser', async () => {
    const options = roleOptions({ email: 'ana@gmail.com', selected: ['adviser'] });
    const html = await render({ options, selected: ['adviser'] });
    expect(html).toContain(S.joinFamily);
    expect(html).not.toContain(S.joinAdviser);
    expect(html).not.toContain('Needs approval');
    expect(html.match(/role="checkbox"/g)).toHaveLength(1);
  });

  it('keeps a held Class Adviser card visible for a personal email', async () => {
    const options = roleOptions({ email: 'ana@gmail.com', held: ['adviser'] });
    const html = await render({ options });
    expect(html).toContain(S.joinAdviser);
    expect(html).toContain(S.joinActive);
  });

  it('lets a teacher who is also a parent tick both cards', async () => {
    const options = roleOptions({ email: 'ana@deped.gov.ph', selected: ['family', 'adviser'] });
    const html = await render({ options, selected: ['family', 'adviser'] });
    expect(html.match(/aria-checked="true"/g)).toHaveLength(2);
    expect(html).not.toContain('not both');
  });

  it('marks a held role as active', async () => {
    const options = roleOptions({ email: 'ana@deped.gov.ph', held: ['adviser'] });
    const html = await render({ options });
    expect(html).toContain(S.joinActive);
  });
});
