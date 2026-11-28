import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A static render cannot click "Create account", so the page's first empty state (the open form) can be preset.
const open = vi.hoisted(() => ({ form: null }));
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal();
  const useState = (initial) => {
    if (initial === null && open.form) { const form = open.form; open.form = null; return [form, () => {}]; }
    return react.useState(initial);
  };
  return { ...react, default: { ...react.default, useState }, useState };
});
vi.mock('../firebase.js', () => ({ db: {}, functions: {} }));
vi.mock('../data/staffUsers.js', () => ({ staffUsers: {} }));
vi.mock('../hooks/useCollection.js', () => ({ useCollectionResource: () => ({ data: [
  { id: 'logistics@deped.gov.ph', name: 'Lo Gistic', role: 'logistic' },
], loading: false, error: null }) }));

import AccountsPage from './AccountsPage.jsx';

const render = () => renderToStaticMarkup(React.createElement(AccountsPage, { me: { role: 'admin', email: 'admin@deped.gov.ph' } }));
beforeEach(() => { open.form = null; });

describe('accounts page and the Logistic Operator', () => {
  it('labels the account in the list', () => {
    expect(render()).toMatch(/<td[^>]*>Logistic Operator<\/td>/);
  });
  it('offers the role when creating an account', () => {
    open.form = {};
    expect(render()).toContain('<option value="logistic">Logistic Operator</option>');
  });
  it('asks no grade level of a logistic operator', () => {
    open.form = { id: 'logistics@deped.gov.ph', name: 'Lo Gistic', role: 'logistic' };
    const html = render();
    expect(html).toContain('<option value="logistic" selected="">Logistic Operator</option>');
    expect(html).not.toContain('Grade level');
  });
});
