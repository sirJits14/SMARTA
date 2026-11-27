import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ students: [], sections: [], enrollments: [] }));
vi.mock('../firebase.js', () => ({ db: {}, functions: {} }));
vi.mock('../data/photos.js', async (importOriginal) => ({ ...await importOriginal(), getStudentPhoto: vi.fn(), saveStudentPhoto: vi.fn() }));
vi.mock('../data/students.js', () => ({ deleteStudent: vi.fn(), saveStudentWithEnrollment: vi.fn() }));
vi.mock('../pages/ImportStudentsWizard.jsx', () => ({ default: () => null }));
vi.mock('../hooks/useCollection.js', () => ({
  useStaffCollectionResource: (path) => ({ data: fixture[path] ?? [], loading: false, error: null }),
}));

import StudentPhotoDialog from './StudentPhotoDialog.jsx';
import PhotoCropper from './PhotoCropper.jsx';
import StudentsPage from '../pages/StudentsPage.jsx';

const h = React.createElement;
const learner = { id: 's1', lrn: '123456789012', firstName: 'Juan', middleName: 'Dela', lastName: 'Cruz', sex: 'M', status: 'active' };
const enrolled = (sectionId, gradeLevel) => [{ studentId: 's1', sectionId, gradeLevel, schoolYear: '2026-2027', status: 'enrolled' }];
beforeEach(() => {
  fixture.students = [learner];
  fixture.sections = [{ id: 'sec8', gradeLevel: 8, name: 'Rizal', schoolYear: '2026-2027' }, { id: 'sec11', gradeLevel: 11, name: 'Luna', schoolYear: '2026-2027' }];
  fixture.enrollments = enrolled('sec8', 8);
});

describe('learner photo dialog', () => {
  const render = () => renderToStaticMarkup(h(StudentPhotoDialog, { student: learner, onClose: vi.fn() }));
  it('is titled with the learner’s name in capitals', () => {
    expect(render()).toMatch(/<h2[^>]*>Photo · CRUZ, JUAN D\.<\/h2>/);
  });
  it('offers a file or the camera, and cannot save before there is a picture', () => {
    const html = render();
    expect(html).toContain('>Choose a file<');
    expect(html).toContain('>Use camera<');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save photo<\/button>/);
  });
});

describe('photo cropper', () => {
  it('takes only the allowed picture files through a hidden input', () => {
    const html = renderToStaticMarkup(h(PhotoCropper, { onReady: vi.fn() }));
    const input = html.match(/<input[^>]*>/)[0];
    expect(input).toContain('type="file"');
    expect(input).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(input).toContain('hidden=""');
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('<video');
  });
  it('disables both buttons while disabled', () => {
    const html = renderToStaticMarkup(h(PhotoCropper, { onReady: vi.fn(), disabled: true }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Choose a file<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Use camera<\/button>/);
  });
});

describe('Photo action on the student list', () => {
  const render = (me) => renderToStaticMarkup(h(StudentsPage, { me, schoolYear: '2026-2027' }));
  it('gives administrators Photo beside Edit and the row menu', () => {
    const html = render({ role: 'admin' });
    expect(html).toContain('>Photo<');
    expect(html).toContain('>Edit<');
    expect(html).toContain('More actions for CRUZ, JUAN D.');
  });
  it.each([['jhs_coord', 'sec8', 8], ['shs_coord', 'sec11', 11]])('gives a %s only Photo', (role, sectionId, gradeLevel) => {
    fixture.enrollments = enrolled(sectionId, gradeLevel);
    const html = render({ role });
    expect(html).toContain('>Photo<');
    expect(html).not.toContain('>Edit<');
    expect(html).not.toContain('More actions for');
  });
  it('gives grade level coordinators no row action', () => {
    const html = render({ role: 'glc', gradeLevel: 8 });
    expect(html).toContain('CRUZ, JUAN D.');
    expect(html).not.toContain('>Photo<');
    expect(html).not.toContain('>Edit<');
  });
});

describe('SIMS hosting', () => {
  it('lets only this site use the camera', () => {
    const sims = JSON.parse(readFileSync('firebase.json', 'utf8')).hosting.find((site) => site.target === 'sims');
    const policy = sims.headers.flatMap((rule) => rule.headers).find((header) => header.key === 'Permissions-Policy');
    expect(policy.value).toBe('geolocation=(), camera=(self), microphone=()');
  });
});
