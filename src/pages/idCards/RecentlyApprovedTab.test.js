import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../firebase.js', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), writeBatch: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(), serverTimestamp: vi.fn(),
}));

import RecentlyApprovedTab from './RecentlyApprovedTab.jsx';

const h = React.createElement;
const SY = '2026-2027';
const me = { email: 'admin@bnhs.edu.ph', role: 'admin' };
const rizal = { id: 'rizal', gradeLevel: 7, name: 'Rizal', schoolYear: SY };
const ana = { id: 'ana', lastName: 'Abad', firstName: 'Ana', sex: 'F', lrn: '200000000001' };
const dan = { id: 'dan', lastName: 'Dy', firstName: 'Dan', sex: 'M', lrn: '200000000002' };
const approval = (id) => ({ id, approvedByName: 'Cleo Curriculum', requestId: `R-${id}`, schoolYear: SY, approvedAt: null });
const render = (approvedDocs) => renderToStaticMarkup(h(RecentlyApprovedTab, {
  me, schoolYear: SY, sections: [rizal], students: [ana, dan],
  enrollments: [{ id: `ana_${SY}`, studentId: 'ana', sectionId: 'rizal', schoolYear: SY, status: 'enrolled' }],
  approvedDocs,
}));

describe('RecentlyApprovedTab', () => {
  it('says nothing is waiting when the log is empty', () => {
    const html = render([]);
    expect(html).toContain('No new learners waiting');
    expect(html).not.toContain('Print selected');
  });
  it('lists an approved learner by section with who approved them, ready to select', () => {
    const html = render([approval('ana')]);
    expect(html).toContain('Grade 7 - Rizal · 1');
    expect(html).toContain('ABAD, ANA');
    expect(html).toContain('Approved by CLEO CURRICULUM');
    expect(html).toContain('aria-label="Select ABAD, ANA"');
    expect(html).toContain('Select all (1)');
    for (const label of ['Print selected', 'Add to saved batch', 'Dismiss']) expect(html).toContain(label);
    expect(html).toContain('Select learners to print or add to the saved batch');
  });
  it('lists a learner who is no longer enrolled apart, to dismiss', () => {
    const html = render([approval('dan')]);
    expect(html).toContain('Not enrolled — won&#x27;t print · 1');
    expect(html).toContain('aria-label="Dismiss DY, DAN"');
  });
});
