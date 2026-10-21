import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ActivationSlipsPrintable from './ActivationSlipsPrintable.jsx';
import IdCardsPrintable from './IdCardsPrintable.jsx';

const h = React.createElement;

// Names are stored in the case they were entered in; everything printed shows capitals.
describe('printed names', () => {
  it('prints the learner name on a QR slip in capitals', () => {
    const slip = { studentId: 's1', name: 'Dela Peña, Juan B.', sectionLabel: 'Grade 7 - Mabini', lrn: '123456789012', code: 'ABCD2345', schoolYear: '2026-2027' };
    const html = renderToStaticMarkup(h(ActivationSlipsPrintable, { slips: [slip], portalUrl: 'https://portal.example', paper: 'folio' }));
    expect(html).toContain('DELA PEÑA, JUAN B.');
    expect(html).not.toContain('Dela Peña');
  });

  it('prints the learner name on an ID card in capitals', () => {
    const student = { id: 's1', lrn: '123456789012', lastName: 'Cruz', firstName: 'Ana', middleName: 'Bautista' };
    const section = { id: 'a', name: 'Mabini', gradeLevel: 7 };
    const html = renderToStaticMarkup(h(IdCardsPrintable, { entries: [{ student, section }] }));
    expect(html).toContain('CRUZ, ANA B.');
    expect(html).not.toContain('Cruz, Ana');
  });
});
