import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LegacyAdvisers from './LegacyAdvisers.jsx';

const h = React.createElement;
const sections = [{ id: 'MABINI', name: 'Mabini', gradeLevel: 8 }];
const row = { guardianUid: 't1', email: 't1@deped.gov.ph', name: 'Ana Cruz', learnerCount: 38, suggestedSectionId: 'MABINI', assigned: false };

describe('LegacyAdvisers', () => {
  it('shows one row per teacher with the likely section and a form shortcut', () => {
    const html = renderToStaticMarkup(h(LegacyAdvisers, { rows: [row], sections, disabled: false, onUse: () => {} }));
    expect(html).toContain('Ana Cruz');
    expect(html).toContain('38 learner links');
    expect(html).toContain('Likely Grade 8 · Mabini');
    expect(html).toContain('Use in form');
  });
  it('shows Assigned instead of the shortcut once assigned', () => {
    const html = renderToStaticMarkup(h(LegacyAdvisers, { rows: [{ ...row, assigned: true }], sections, disabled: false, onUse: () => {} }));
    expect(html).toContain('Assigned');
    expect(html).not.toContain('Use in form');
  });
  it('says when nothing is left to verify', () => {
    expect(renderToStaticMarkup(h(LegacyAdvisers, { rows: [], sections, disabled: false, onUse: () => {} }))).toContain('No legacy adviser links to verify.');
  });
});
