import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ settings: null }));
vi.mock('../../firebase.js', () => ({ db: {}, functions: {} }));
vi.mock('../../data/tempPasses.js', () => ({
  issueTempPasses: vi.fn(), listTempPassRequests: vi.fn(() => new Promise(() => {})),
  fulfilTempPassRequests: vi.fn(), markTempPassRequestsPrinted: vi.fn(), declineTempPassRequest: vi.fn(),
}));
vi.mock('../../data/photos.js', () => ({ getStudentPhoto: vi.fn(), photoDataUrl: vi.fn() }));
vi.mock('../../hooks/useCollection.js', () => ({
  useDocResource: () => ({ data: fixture.settings, loading: false, error: null }),
}));

import PassRequestsTab, { requestTargets } from './PassRequestsTab.jsx';

const h = React.createElement;
const schoolYear = '2026-2027';
const sections = [{ id: 'g8', gradeLevel: 8, name: 'Rizal', schoolYear }, { id: 'g11', gradeLevel: 11, name: 'Luna', strand: 'STEM', schoolYear }];
const learner = (id, lastName, over = {}) => ({ id, lrn: `1000000000${id.slice(1)}`, firstName: 'Ana', lastName, sex: 'F', status: 'active', photo: { path: `student_photos/${id}.jpg` }, ...over });
const students = [learner('s1', 'Abad'), learner('s2', 'Bautista', { photo: null }), learner('s3', 'Cruz'), learner('s4', 'Diaz')];
const enrollments = students.map((s) => ({ studentId: s.id, sectionId: s.id === 's4' ? 'g11' : 'g8', gradeLevel: s.id === 's4' ? 11 : 8, schoolYear, status: 'enrolled' }));
const request = (id, studentId, over = {}) => {
  const s = students.find((x) => x.id === studentId);
  return { id, studentId, displayName: `${s.firstName} ${s.lastName}`, lrn: s.lrn, sectionId: 'g8', sectionName: 'Rizal', gradeLevel: 8, reason: 'new', note: '',
    requestedByName: 'Ava Adviser', createdAt: 1, status: 'pending', hasPhoto: !!s.photo, blocker: null, prepared: false, ...over };
};
const requests = [
  request('r1', 's1', { note: 'Lost on the bus' }),
  request('r2', 's2', { reason: 'lost' }),
  request('r3', 's3', { reason: 'damaged', blocker: 'official-printed' }),
  request('r4', 's4', { reason: 'damaged', sectionId: 'g11', sectionName: 'Luna', gradeLevel: 11, prepared: true }),
];
const render = (me, over = {}) => renderToStaticMarkup(h(PassRequestsTab, {
  me, schoolYear, sections, enrollments, students, passes: [],
  pending: { requests, truncated: false, loading: false, error: null, reload: () => {} }, ...over,
}));
const row = (html, name) => html.match(new RegExp(`<tr>(?:(?!</tr>)[\\s\\S])*${name}(?:(?!</tr>)[\\s\\S])*</tr>`))?.[0] ?? '';

beforeEach(() => { fixture.settings = { principalName: 'Paul O. Orong', principalTitle: 'Secondary Principal IV' }; });

describe('pass requests tab', () => {
  it.each([[{ role: 'logistic' }], [{ role: 'glc', gradeLevel: 8 }], [{ role: 'admin' }]])('lists waiting requests for %o with their reason, adviser, note and photo', (me) => {
    const html = render(me);
    for (const label of ['>Waiting<', '>Printed<', '>Declined<']) expect(html).toContain(label);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Waiting</);
    for (const header of ['Name', 'LRN', 'Section', 'Reason', 'Requested by', 'Note', 'Photo']) expect(html).toContain(`>${header}</th>`);
    expect(row(html, 'ABAD, ANA')).toContain('>New pass<');
    expect(row(html, 'BAUTISTA, ANA')).toContain('>Lost<');
    expect(row(html, 'CRUZ, ANA')).toContain('>Damaged<');
    expect(row(html, 'ABAD, ANA')).toContain('Ava Adviser');
    expect(row(html, 'ABAD, ANA')).toContain('Lost on the bus');
    expect(row(html, 'ABAD, ANA')).toContain('>Yes<');
    expect(row(html, 'BAUTISTA, ANA')).toContain('>No photo<');
    expect(row(html, 'ABAD, ANA')).toContain('Grade 8 - Rizal');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Prepare passes \(0\)<\/button>/);
    expect(html).not.toContain('Mark as printed');
  });
  it('suggests declining a request that can no longer be met, and keeps it from being ticked', () => {
    const html = render({ role: 'logistic' });
    const cruz = row(html, 'CRUZ, ANA');
    expect(cruz).toContain('>Decline suggested<');
    expect(cruz).toContain('Official ID already issued');
    expect(cruz).toMatch(/<input[^>]*aria-label="Select CRUZ, ANA"[^>]*disabled=""/);
    expect(cruz).toContain('>Decline<');
    expect(row(html, 'ABAD, ANA')).not.toMatch(/<input[^>]*disabled=""/);
    expect(row(html, 'ABAD, ANA')).toContain('>Decline<');
  });
  it('shows a prepared request as prepared, without Decline, and keeps it printable', () => {
    const html = render({ role: 'logistic' });
    const diaz = row(html, 'DIAZ, ANA');
    expect(diaz).toContain('>Prepared<');
    expect(diaz).not.toContain('>Decline<');
    expect(diaz).not.toContain('Decline suggested');
    expect(diaz).not.toMatch(/<input[^>]*disabled=""/);
  });
  it('never suggests declining a prepared request, even when it is blocked', () => {
    const html = render({ role: 'logistic' }, { pending: { requests: [request('r3', 's3', { blocker: 'official-printed', prepared: true })], truncated: false, loading: false, error: null } });
    expect(html).not.toContain('Decline suggested');
    expect(html).not.toContain('>Decline<');
  });
  it('says when only the first 200 requests are shown', () => {
    expect(render({ role: 'logistic' })).not.toContain('first 200');
    expect(render({ role: 'logistic' }, { pending: { requests, truncated: true, loading: false, error: null } })).toContain('Only the first 200 requests are shown.');
  });
  it('says when nothing is waiting', () => {
    const html = render({ role: 'logistic' }, { pending: { requests: [], truncated: false, loading: false, error: null } });
    expect(html).toContain('No requests waiting');
  });
  it('asks for the principal before preparing', () => {
    fixture.settings = { principalName: '', principalTitle: '' };
    expect(render({ role: 'logistic' })).toContain('Ask an administrator to add the principal&#x27;s name and title in Settings before printing.');
    expect(render({ role: 'admin' })).toContain('Add the principal&#x27;s name and title in Settings before printing.');
  });
  it('keeps every control out of the printed page', () => {
    expect(render({ role: 'logistic' })).toMatch(/^<div class="[^"]*id-cards-controls/);
  });
});

describe('requestTargets', () => {
  it('prints each request for its learner, in the learner’s current section', () => {
    const studentsById = new Map(students.map((s) => [s.id, s]));
    const enrolled = new Map(enrollments.map((e) => [e.studentId, e]));
    const sectionsById = new Map(sections.map((s) => [s.id, s]));
    const moved = { ...requests[0], sectionId: 'g11' };
    expect(requestTargets([moved, requests[3]], { studentsById, enrolled, sectionsById })).toEqual([
      { studentId: 's1', requestId: 'r1', student: students[0], section: sections[0] },
      { studentId: 's4', requestId: 'r4', student: students[3], section: sections[1] },
    ]);
  });
  it('leaves out a request whose learner or section is not loaded here', () => {
    const studentsById = new Map([['s1', students[0]]]);
    expect(requestTargets([requests[0], requests[1]], { studentsById, enrolled: new Map(), sectionsById: new Map() })).toEqual([]);
  });
});
