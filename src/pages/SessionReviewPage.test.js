import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ sections: [] }));
vi.mock('../hooks/useCollection.js', () => ({
  useStaffCollectionResource: () => ({ data: fixture.sections, loading: false, error: null }),
}));
vi.mock('../firebase.js', () => ({ functions: {} }));

import SessionReviewPage from './SessionReviewPage.jsx';

const h = React.createElement;
beforeEach(() => {
  fixture.sections = [
    { id: 'a', name: 'Rizal', gradeLevel: 7, schoolYear: '2026-2027' },
    { id: 'b', name: 'Luna', gradeLevel: 8, schoolYear: '2026-2027' },
  ];
});

describe('SessionReviewPage', () => {
  it('offers a coordinator only the sections in their grades', () => {
    const html = renderToStaticMarkup(h(SessionReviewPage, { me: { role: 'glc', gradeLevel: 8 }, schoolYear: '2026-2027' }));
    expect(html).toContain('Session review');
    expect(html).toContain('Grade 8 · Luna');
    expect(html).not.toContain('Grade 7 · Rizal');
  });
  it('explains when no sections are in scope', () => {
    const html = renderToStaticMarkup(h(SessionReviewPage, { me: { role: 'glc', gradeLevel: 12 }, schoolYear: '2026-2027' }));
    expect(html).toContain('No sections in your grades for 2026-2027.');
  });
});
