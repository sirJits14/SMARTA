import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ settings: null, subscribed: [] }));
vi.mock('../../firebase.js', () => ({ db: {}, functions: {} }));
vi.mock('../../data/tempPasses.js', () => ({
  issueTempPasses: vi.fn(), revokeTempPass: vi.fn(), listTempPassRequests: vi.fn(() => new Promise(() => {})),
  fulfilTempPassRequests: vi.fn(), markTempPassRequestsPrinted: vi.fn(), declineTempPassRequest: vi.fn(),
}));
vi.mock('../../data/photos.js', () => ({ getStudentPhoto: vi.fn(), photoDataUrl: vi.fn() }));
vi.mock('../../data/idCards.js', () => ({ markIdCardsPrinted: vi.fn(), addToIdCardBatch: vi.fn(), removeFromIdCardBatch: vi.fn(), clearIdCardBatch: vi.fn(), markBatchPrinted: vi.fn() }));
vi.mock('../../hooks/useCollection.js', () => ({
  useDocResource: () => ({ data: fixture.settings, loading: false, error: null }),
  useCollectionResource: (path) => { fixture.subscribed.push(['all', path]); return { data: [], loading: false, error: null }; },
  useSchoolYearEnrollments: () => { fixture.subscribed.push(['all', 'enrollments']); return { data: [], loading: false, error: null }; },
  useStaffCollectionResource: (path, { me }) => { fixture.subscribed.push(['staff', path, me?.role]); return { data: [], loading: false, error: null }; },
}));

import TempPassesTab, { pendingBlocksPrinting, requestsChanged } from './TempPassesTab.jsx';
import IDCardsPage, { requestsTabLabel } from '../IDCardsPage.jsx';

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
const glc = (gradeLevel) => ({ role: 'glc', gradeLevel });

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
  it.each([[glc(8), 'g8'], [glc(11), 'g11'], [{ role: 'logistic' }, 'g11']])('tells a %o to ask an administrator, who alone can open Settings', (me, sectionId) => {
    fixture.settings = { principalName: ' ', principalTitle: 'Secondary Principal IV' };
    const learners = enrollments.map(e => ({ ...e, sectionId, gradeLevel: sections.find(s => s.id === sectionId).gradeLevel }));
    const html = render(me, { initialSectionId: sectionId, enrollments: learners });
    expect(html).toContain('ABAD, ANA');
    expect(html).toContain('Ask an administrator to add the principal&#x27;s name and title in Settings before printing.');
    expect(html).not.toContain('Add the principal');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Prepare passes \(0\)<\/button>/);
  });
  it.each([{ role: 'admin' }, glc(8), { role: 'logistic' }])('does not warn %o when the principal is set', (me) => {
    expect(render(me)).not.toMatch(/add the principal/i);
  });
  it('lists the section’s learners with their pass status, printing learners without a photo too', () => {
    const html = render({ role: 'admin' });
    expect(html).toContain('ABAD, ANA');
    expect(html).toContain('>Active<');
    expect(html).toContain('>Ready · no photo<');
    expect(html).toContain('>Ready<');
    expect(html).not.toContain('Missing photo');
    expect(html).toContain('1 without a photo');
    expect(html).toContain('>Select all printable<');
    expect(html).not.toMatch(/<input[^>]*aria-label="Select BAUTISTA, ANA"[^>]*disabled=""/);
  });
  it('marks learners with a waiting request', () => {
    const pending = { requests: [{ id: 'r2', studentId: 's2', status: 'pending', blocker: null, prepared: false }], truncated: false, loading: false, error: null };
    const html = render({ role: 'admin' }, { pending });
    expect(html.match(/>Requested</g)).toHaveLength(1);
    // In Bautista's own row.
    expect(html).toMatch(/BAUTISTA, ANA<\/td>(?:(?!<\/tr>)[\s\S])*>Requested</);
    expect(render({ role: 'admin' })).not.toContain('>Requested<');
  });
  it.each([
    [{ loading: true }, 'Checking waiting requests…'],
    [{ error: new Error('x') }, 'Could not load the waiting requests. Printing is paused so a requested pass is not printed here by mistake.'],
    [{ truncated: true }, 'More than 200 requests are waiting. A learner with a waiting request is printed from Requests.'],
  ])('holds printing back until the waiting requests are known (%o)', (state, text) => {
    const html = render({ role: 'admin' }, { pending: { requests: [], truncated: false, loading: false, error: null, ...state } });
    expect(html).toContain(text);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Prepare passes \(0\)<\/button>/);
  });
  it('waits for the waiting requests before preparing', () => {
    expect(pendingBlocksPrinting({ requests: [], loading: true })).toBe(true);
    expect(pendingBlocksPrinting({ requests: [], error: new Error('x') })).toBe(true);
    expect(pendingBlocksPrinting({ requests: [], truncated: true })).toBe(false);
    expect(pendingBlocksPrinting({ requests: [] })).toBe(false);
  });
  it('sees a changed request before preparing', () => {
    const selected = [{ studentId: 's1', requestId: 'r1' }, { studentId: 's2' }];
    expect(requestsChanged(selected, [{ id: 'r1', studentId: 's1', status: 'pending' }])).toBe(false);
    expect(requestsChanged(selected, [{ id: 'r1', studentId: 's1', status: 'pending' }, { id: 'r2', studentId: 's2', status: 'pending' }])).toBe(true);
    expect(requestsChanged(selected, [])).toBe(true);
  });
  it('offers Revoke for an active pass to administrators only', () => {
    expect(render({ role: 'admin' })).toContain('>Revoke<');
    expect(render(glc(8))).not.toContain('>Revoke<');
    expect(render({ role: 'logistic' })).not.toContain('>Revoke<');
  });
  it('offers only this year’s sections in the coordinator’s grade, and every grade to a logistic operator', () => {
    const own = render(glc(8));
    expect(own).toContain('Grade 8 - Rizal');
    expect(own).not.toContain('Luna');
    expect(own).not.toContain('Bonifacio');
    expect(render({ role: 'admin' })).toContain('Grade 11 - Luna · STEM');
    expect(render({ role: 'logistic' })).toContain('Grade 11 - Luna · STEM');
    expect(render({ role: 'logistic' })).not.toContain('Bonifacio');
  });
  it('offers nothing to an academic coordinator, who no longer prints passes', () => {
    const html = render({ role: 'jhs_coord' });
    expect(html).not.toContain('Grade 8 - Rizal');
    expect(html).not.toContain('ABAD, ANA');
  });
  it('keeps every control out of the printed page', () => {
    const html = render({ role: 'admin' });
    expect(html).not.toContain('temp-pass-sheet');
    expect(html).toMatch(/^<div class="[^"]*id-cards-controls/);
  });
});

describe('ID Cards page', () => {
  const page = (me) => renderToStaticMarkup(h(IDCardsPage, { me, schoolYear }));
  const tabs = (html) => [...html.matchAll(/role="tab"[^>]*>([^<]*)</g)].map((m) => m[1]);
  it('gives administrators the official card tabs, Requests and Temporary passes', () => {
    expect(tabs(page({ role: 'admin' }))).toEqual(['By section', 'Saved batch', 'Requests', 'Temporary passes']);
  });
  it.each([[glc(8)], [{ role: 'logistic' }]])('gives %o only Requests and Temporary passes, from staff-scoped queries', (me) => {
    const html = page(me);
    expect(tabs(html)).toEqual(['Requests', 'Temporary passes']);
    expect(html).toContain('aria-selected="true"');
    expect(html).toMatch(/aria-selected="true"[^>]*>Requests</);
    expect(fixture.subscribed.filter(([kind]) => kind === 'all')).toEqual([]);
    expect(fixture.subscribed.map(([, path]) => path).sort()).toEqual(['enrollments', 'sections', 'students', 'temp_passes']);
    expect(fixture.subscribed.every(([, , role]) => role === me.role)).toBe(true);
  });
  it('gives an academic coordinator no ID card tabs', () => {
    const html = page({ role: 'jhs_coord' });
    expect(tabs(html)).toEqual([]);
    expect(fixture.subscribed).toEqual([]);
  });
  it('counts waiting requests on the Requests tab', () => {
    expect(requestsTabLabel(0)).toBe('Requests');
    expect(requestsTabLabel(3)).toBe('Requests · 3');
  });
});
