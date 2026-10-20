import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ sections: [], advisory: new Map() }));
vi.mock('../hooks/useCollection.js', () => ({
  useStaffCollectionResource: path => ({ data: path === 'sections' ? fixture.sections : [], loading: false, error: null }),
}));
vi.mock('../data/sections.js', () => ({ createSection: vi.fn(), updateSection: vi.fn(), deleteSection: vi.fn(),
  updateCoordinatorSection: vi.fn(), getCoordinatorSectionOptions: vi.fn() }));
vi.mock('../data/coordinatorSections.js', () => ({ updateCoordinatorSection: vi.fn(), getCoordinatorSectionOptions: vi.fn() }));
vi.mock('../data/students.js', () => ({ saveStudentWithEnrollment: vi.fn() }));
vi.mock('../data/idCards.js', () => ({ markIdCardsPrinted: vi.fn() }));
vi.mock('../hooks/useAdvisoryStatus.js', () => ({ useAdvisoryStatus: () => ({ bySection: fixture.advisory, loading: false, error: '', reload: vi.fn() }) }));
vi.mock('../data/advisorySlips.js', () => ({ issueAdvisorySlips: vi.fn(), revokeAdvisorySlip: vi.fn(), listAdvisoryStatus: vi.fn() }));

import SectionsPage, * as sectionPage from './SectionsPage.jsx';

const h = React.createElement;
const glc = { role: 'glc', gradeLevel: 8 };
const section = { id: 's8', gradeLevel: 8, name: 'Mabini', adviserName: 'Ana Cruz', schoolYear: '2026-2027', scheduleId: 'AM' };
const render = me => renderToStaticMarkup(h(SectionsPage, { me, schoolYear: '2026-2027' }));
beforeEach(() => { fixture.sections = [section]; fixture.advisory = new Map(); });

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

describe('advisory slips on the Sections page', () => {
  it('offers a slip to administrators and in-grade coordinators for a section without an adviser', () => {
    fixture.advisory = new Map([['s8', { sectionId: 's8', adviser: null, slip: null }]]);
    for (const me of [{ role: 'admin' }, glc, { role: 'jhs_coord' }]) {
      const html = render(me);
      expect(html).toContain('>Advisory slip<');
      expect(html).toContain('No adviser in app');
      expect(html).toContain('aria-label="Select Mabini for an advisory slip"');
      expect(html).toContain('Select 1 section without a slip');
    }
    const outOfScope = render({ role: 'glc', gradeLevel: 7 });
    expect(outOfScope).not.toContain('>Advisory slip<');
    expect(outOfScope).not.toContain('type="checkbox"');
  });
  it('lets a section with an unused slip be ticked but leaves it out of the select shortcut', () => {
    fixture.advisory = new Map([['s8', { sectionId: 's8', adviser: null, slip: { issuedAt: 0, issuedBy: 'x' } }]]);
    const html = render({ role: 'admin' });
    expect(html).toContain('aria-label="Select Mabini for an advisory slip"');
    expect(html).not.toContain('without a slip');
  });
  it('shows the app adviser and hides the slip action once a section has one', () => {
    fixture.advisory = new Map([['s8', { sectionId: 's8', adviser: { name: 'Ana Cruz', email: 'a@deped.gov.ph' }, slip: null }]]);
    const html = render({ role: 'admin' });
    expect(html).toContain('In app: Ana Cruz');
    expect(html).not.toContain('>Advisory slip<');
    expect(html).not.toContain('type="checkbox"');
  });
  it('offers Revoke while a slip is outstanding', () => {
    fixture.advisory = new Map([['s8', { sectionId: 's8', adviser: null, slip: { issuedAt: Date.parse('2026-10-19T02:00:00Z'), issuedBy: 'x' } }]]);
    const html = render(glc);
    expect(html).toContain('>Revoke slip<');
    expect(html).toContain('Slip issued · Oct 19, 2026');
  });
});
