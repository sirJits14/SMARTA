import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CoverageView from './CoverageView.jsx';

const context = {
  schoolYear: '2026-2027', ended: false,
  sections: [{ id: 'A', name: 'Rizal', gradeLevel: 7 }, { id: 'B', name: 'Bonifacio', gradeLevel: 7 }],
  managedAssignments: [{ uid: 'u1', displayName: 'Ana Cruz', email: 'ana@deped.gov.ph', role: 'adviser', sectionId: 'A', gradeLevel: 7, assignedAt: 1, lastSchoolOpenAt: null }],
  pendingRequests: [{ id: 'r1', role: 'adviser', sectionId: 'B', displayName: 'Dan' }],
};

describe('CoverageView', () => {
  it('shows coverage per grade, gaps, opened status and the pending request', () => {
    const html = renderToStaticMarkup(React.createElement(CoverageView, { context, onAssign: () => {}, onOpenRequest: () => {} }));
    expect(html).toContain('1 of 2 sections have an adviser');
    expect(html).toContain('Curriculum Adviser: None');
    expect(html).toContain('Not opened yet');
    expect(html).toContain('No adviser');
    expect(html).toContain('Review Dan');
  });
});
