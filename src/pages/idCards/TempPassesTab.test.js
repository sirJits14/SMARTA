import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ settings: null, subscribed: [] }));
vi.mock('../../firebase.js', () => ({ db: {}, functions: {} }));
vi.mock('../../data/tempPasses.js', () => ({ issueTempPasses: vi.fn(), revokeTempPass: vi.fn() }));
vi.mock('../../data/photos.js', () => ({ getStudentPhoto: vi.fn(), photoDataUrl: vi.fn() }));
vi.mock('../../data/idCards.js', () => ({ markIdCardsPrinted: vi.fn(), addToIdCardBatch: vi.fn(), removeFromIdCardBatch: vi.fn(), clearIdCardBatch: vi.fn(), markBatchPrinted: vi.fn() }));
vi.mock('../../hooks/useCollection.js', () => ({
  useDocResource: () => ({ data: fixture.settings, loading: false, error: null }),
  useCollectionResource: (path) => { fixture.subscribed.push(['all', path]); return { data: [], loading: false, error: null }; },
  useSchoolYearEnrollments: () => { fixture.subscribed.push(['all', 'enrollments']); return { data: [], loading: false, error: null }; },
  useStaffCollectionResource: (path, { me }) => { fixture.subscribed.push(['staff', path, me?.role]); return { data: [], loading: false, error: null }; },
}));

import TempPassesTab from './TempPassesTab.jsx';
import IDCardsPage from '../IDCardsPage.jsx';

const h = React.createElement;
const schoolYear = '2026-2027';
const sections = [
  { id: 'g8', gradeLevel: 8, name: 'Rizal', schoolYear },
  { id: 'g11', gradeLevel: 11, name: 'Luna', strand: 'STEM', schoolYear },
  { id: 'old', gradeLevel: 8, name: 'Bonifacio', schoolYear: '2025-2026' },
];
const learner = (id, lastName, over = {}) => ({ id, lrn: `1000000000${id.slice(1)}`, firstName: 'Ana', lastName, sex: 'F', status: 'active', photo: { path: `student_photos/${id}.jpg` }, ...over });
const students = [learner('s1', 'Abad'), learner('s2', 'Bautista', { photo: null }), learner('s3', 'Cruz')];
const enrollments = students.map(s => ({ studentId: s.id, sectionId: 'g8', gradeLevel: 8, schoolYear, status: 'enrolled' }));
const passes = [{ id: 's1', code: 'BNHS-TP-ABCDEFGHJK', status: 'active', lrn: students[0].lrn, schoolYear, gradeLevel: 8 }];
const render = (me, over = {}) => renderToStaticMarkup(h(TempPassesTab, { me, schoolYear, sections, enrollments, students, passes, initialSectionId: 'g8', ...over }));

beforeEach(() => {
  fixture.settings = { principalName: 'Paul O. Orong', principalTitle: 'Secondary Principal IV' };
  fixture.subscribed = [];
});

describe('temporary passes tab', () => {
  it('asks for the principal before printing and disables preparing', () => {
    fixture.settings = { principalName: 'Paul O. Orong', principalTitle: ' ' };
    const html = render({ role: 'admin' });
    expect(html).toContain('Add the principal&#x27;s name and title in Settings before printing.');
    expect(html).not.toContain('Ask an administrator');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Prepare passes \(0\)<\/button>/);
  });
  it.each([['jhs_coord', 'g8'], ['shs_coord', 'g11']])('tells a %s to ask an administrator, who alone can open Settings', (role, sectionId) => {
    fixture.settings = { principalName: ' ', principalTitle: 'Secondary Principal IV' };
    const learners = enrollments.map(e => ({ ...e, sectionId, gradeLevel: sections.find(s => s.id === sectionId).gradeLevel }));
    const html = render({ role }, { initialSectionId: sectionId, enrollments: learners });
    expect(html).toContain('Ask an administrator to add the principal&#x27;s name and title in Settings before printing.');
    expect(html).not.toContain('Add the principal');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Prepare passes \(0\)<\/button>/);
  });
  it.each(['admin', 'jhs_coord', 'shs_coord'])('does not warn a %s when the principal is set', (role) => {
    expect(render({ role })).not.toMatch(/add the principal/i);
  });
  it('lists the section’s learners with their pass status', () => {
    const html = render({ role: 'admin' });
    expect(html).toContain('ABAD, ANA');
    expect(html).toContain('>Active<');
    expect(html).toContain('>Missing photo<');
    expect(html).toContain('>Ready<');
    expect(html).toContain('1 missing a photo');
    expect(html).toContain('>Select all printable<');
    expect(html).toMatch(/<input[^>]*aria-label="Select BAUTISTA, ANA"[^>]*disabled=""/);
  });
  it('offers Revoke for an active pass to administrators only', () => {
    expect(render({ role: 'admin' })).toContain('>Revoke<');
    expect(render({ role: 'jhs_coord' })).not.toContain('>Revoke<');
  });
  it('offers only this year’s sections in the coordinator’s grades', () => {
    const jhs = render({ role: 'jhs_coord' });
    expect(jhs).toContain('Grade 8 - Rizal');
    expect(jhs).not.toContain('Luna');
    expect(jhs).not.toContain('Bonifacio');
    expect(render({ role: 'admin' })).toContain('Grade 11 - Luna · STEM');
  });
  it('keeps every control out of the printed page', () => {
    const html = render({ role: 'admin' });
    expect(html).not.toContain('temp-pass-sheet');
    expect(html).toMatch(/^<div class="[^"]*id-cards-controls/);
  });
});

describe('ID Cards page', () => {
  it('gives administrators all three tabs', () => {
    const html = renderToStaticMarkup(h(IDCardsPage, { me: { role: 'admin' }, schoolYear }));
    expect(html).toContain('>By section<');
    expect(html).toContain('>Saved batch<');
    expect(html).toContain('>Temporary passes<');
  });
  it.each(['jhs_coord', 'shs_coord'])('gives a %s only temporary passes, from grade-scoped queries', (role) => {
    const html = renderToStaticMarkup(h(IDCardsPage, { me: { role }, schoolYear }));
    expect(html).toContain('>Temporary passes<');
    expect(html).not.toContain('>By section<');
    expect(html).not.toContain('>Saved batch<');
    expect(fixture.subscribed.filter(([kind]) => kind === 'all')).toEqual([]);
    expect(fixture.subscribed.map(([, path]) => path).sort()).toEqual(['enrollments', 'sections', 'students', 'temp_passes']);
  });
});
