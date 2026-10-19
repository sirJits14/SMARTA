import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ sections: [] }));
vi.mock('../hooks/useCollection.js', () => ({
  useStaffCollectionResource: path => ({ data: path === 'sections' ? fixture.sections : [], loading: false, error: null }),
}));
vi.mock('../data/sections.js', () => ({ createSection: vi.fn(), updateSection: vi.fn(), deleteSection: vi.fn(),
  updateCoordinatorSection: vi.fn(), getCoordinatorSectionOptions: vi.fn() }));
vi.mock('../data/coordinatorSections.js', () => ({ updateCoordinatorSection: vi.fn(), getCoordinatorSectionOptions: vi.fn() }));
vi.mock('../data/students.js', () => ({ saveStudentWithEnrollment: vi.fn() }));
vi.mock('../data/idCards.js', () => ({ markIdCardsPrinted: vi.fn() }));

import SectionsPage, * as sectionPage from './SectionsPage.jsx';

const h = React.createElement;
const glc = { role: 'glc', gradeLevel: 8 };
const section = { id: 's8', gradeLevel: 8, name: 'Mabini', adviserName: 'Ana Cruz', schoolYear: '2026-2027', scheduleId: 'AM' };
const render = me => renderToStaticMarkup(h(SectionsPage, { me, schoolYear: '2026-2027' }));
beforeEach(() => { fixture.sections = [section]; });

describe('coordinator section controls', () => {
  it.each([false, true])('makes an assigned adviser read-only in the section form (restricted=%s)', restricted => {
    const html = renderToStaticMarkup(h(sectionPage.SectionForm, {
      editing: { ...section, schoolAdviserUid: 'teacher' }, restricted,
      schoolYear: '2026-2027', schedules: [], onClose: vi.fn(),
    }));
    expect(html).toMatch(/<input[^>]*readOnly=""[^>]*value="Ana Cruz"/);
    expect(html).toContain('School Access');
    const unlocked = renderToStaticMarkup(h(sectionPage.SectionForm, {
      editing: section, restricted, schoolYear: '2026-2027', schedules: [], onClose: vi.fn(),
    }));
    expect(unlocked).not.toMatch(/<input[^>]*readOnly=""[^>]*value="Ana Cruz"/);
  });
  it('offers Edit and a two-year chooser without Add or Delete', () => {
    const html = render(glc);
    expect(html).toContain('>Edit<');
    expect(html).not.toContain('>Delete<');
    expect(html).not.toContain('Add section');
    expect(html).toContain('2027-2028');
    expect(html).toContain('School year');
  });
  it('keeps academic coordinators view-only', () => {
    for (const role of ['jhs_coord', 'shs_coord']) {
      const html = render({ role });
      expect(html).not.toContain('>Edit<');
      expect(html).not.toContain('>Delete<');
      expect(html).not.toContain('Add section');
    }
  });
  it('retains all administrator section actions', () => {
    const html = render({ role: 'admin' });
    expect(html).toContain('>Edit<');
    expect(html).toContain('>Delete<');
    expect(html).toContain('Add section');
  });
  it('locks grade, track and strand in the coordinator form while exposing the approved fields', () => {
    expect(sectionPage.SectionForm).toBeTypeOf('function');
    const html = renderToStaticMarkup(h(sectionPage.SectionForm, {
      editing: { ...section, gradeLevel: 11, track: 'Academic', strand: 'STEM' }, restricted: true,
      schoolYear: '2026-2027', schedules: [{ id: 'AM', name: 'Morning' }], onClose: vi.fn(),
    }));
    expect(html).toContain('Section name');
    expect(html).toContain('Adviser name');
    expect(html).toContain('Loading available schedules');
    expect(html).toMatch(/<button disabled=""[^>]*>Save changes<\/button>/);
    expect(html).not.toMatch(/<select[^>]*>[\s\S]*?<option[^>]*>Grade 7</);
    expect(html).not.toContain('<option value="TVL"');
    expect(html).not.toContain('<option value="ABM"');
    expect(html).not.toContain('type="time"');
  });
});
