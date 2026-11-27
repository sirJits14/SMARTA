import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../data/announcements.js', () => ({ announcements: {} }));
vi.mock('../../hooks/useCollection.js', () => ({
  useDocResource: () => ({ data: { currentSchoolYear: '2026-2027' }, loading: false, error: null }),
  // The unscoped subscription is denied by the section read rules.
  useCollectionResource: () => ({ data: [], loading: false, error: new Error('permission-denied') }),
  useStaffCollectionResource: (path, { me, schoolYear }) => ({
    data: path === 'sections' && me?.role && schoolYear === '2026-2027' ? [
      { id: 'current', name: 'Current section', gradeLevel: me.role === 'shs_coord' ? 11 : 8, schoolYear: '2026-2027' },
      { id: 'previous', name: 'Previous section', gradeLevel: me.role === 'shs_coord' ? 11 : 8, schoolYear: '2025-2026' },
    ] : [], loading: false, error: null,
  }),
}));

import AnnouncementForm from './AnnouncementForm.jsx';

describe('announcement section choices', () => {
  it.each([{ role: 'glc', gradeLevel: 8 }, { role: 'jhs_coord' }, { role: 'shs_coord' }])('loads the selected school year using the coordinator profile (%j)', me => {
    const editing = { title: 'T', body: 'B', status: 'scheduled', audience: { grades: [me.role === 'shs_coord' ? 11 : 8] } };
    const html = renderToStaticMarkup(React.createElement(AnnouncementForm, { me, editing, posts: [], onClose() {} }));
    expect(html).toContain('<option value="current">');
    expect(html).not.toContain('Previous section');
    expect(html).not.toContain('Section choices could not load.');
    expect(html).toMatch(/<select(?![^>]*disabled)[^>]*aria-label="Narrow to sections"/);
  });
});
