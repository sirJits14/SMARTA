import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../data/announcements.js', () => ({ announcements: {} }));
vi.mock('../../hooks/useCollection.js', () => ({
  useDocResource: () => ({ data: { currentSchoolYear: '2026-2027' }, loading: false, error: null }),
  useCollectionResource: path => ({
    data: path === 'sections' ? [
      { id: 'current', name: 'Current section', gradeLevel: 8, schoolYear: '2026-2027' },
      { id: 'shs-current', name: 'SHS current section', gradeLevel: 11, schoolYear: '2026-2027' },
      { id: 'previous', name: 'Previous section', gradeLevel: 8, schoolYear: '2025-2026' },
    ] : [], loading: false, error: null,
  }),
}));

import AnnouncementForm from './AnnouncementForm.jsx';

describe('announcement section choices', () => {
  it.each([{ role: 'glc', gradeLevel: 8 }, { role: 'jhs_coord' }, { role: 'shs_coord' }])('filters production section reads by selected school year and coordinator grade (%j)', me => {
    const editing = { title: 'T', body: 'B', status: 'scheduled', audience: { grades: [me.role === 'shs_coord' ? 11 : 8] } };
    const html = renderToStaticMarkup(React.createElement(AnnouncementForm, { me, editing, posts: [], onClose() {} }));
    expect(html).toContain(me.role === 'shs_coord' ? '<option value="shs-current">' : '<option value="current">');
    expect(html).not.toContain(me.role === 'shs_coord' ? '<option value="current">' : '<option value="shs-current">');
    expect(html).not.toContain('Previous section');
    expect(html).not.toContain('Section choices could not load.');
    expect(html).toMatch(/<select(?![^>]*disabled)[^>]*aria-label="Narrow to sections"/);
  });
});
