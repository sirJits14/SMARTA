import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PendingView from './PendingView.jsx';

const h = React.createElement;
const base = { schoolYear: '2026-2027', ended: false, sections: [{ id: 'A', name: 'Rizal', gradeLevel: 7 }], legacyAdvisers: [], managedAssignments: [] };
const requests = [
  { id: 'r1', uid: 'u1', displayName: 'Dan Lee', email: 'dan@deped.gov.ph', role: 'adviser', sectionId: 'A', gradeLevel: 7, createdAt: Date.now(),
    conflict: { uid: 'u0', displayName: 'Ana Cruz', email: 'ana@deped.gov.ph' } },
  { id: 'r2', uid: 'u2', displayName: 'Eve Tan', email: 'eve@gmail.com', role: 'adviser', sectionId: 'A', gradeLevel: 7, createdAt: Date.now(), conflict: null },
];
const render = context => renderToStaticMarkup(h(PendingView, { school: { context, run: async () => undefined, pending: false }, onUseLegacy: () => {} }));

describe('PendingView', () => {
  it('offers Replace for a conflict and checkboxes only for clean requests', () => {
    const html = render({ ...base, pendingRequests: requests });
    expect(html).toContain('Replace ANA CRUZ');
    expect(html).toContain('Section has an adviser (ANA CRUZ)');
    expect(html).toContain('Non-DepEd email');
    expect(html.match(/type="checkbox"/g)).toHaveLength(2); // select-all + Eve
    expect(html).toContain('Select all without conflicts (1)');
  });
  it('explains where requests come from when the queue is empty', () => {
    expect(render({ ...base, pendingRequests: [] })).toContain('Teachers request access from the app');
  });
});
