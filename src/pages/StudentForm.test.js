import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../data/students.js', () => ({ saveStudentWithEnrollment: vi.fn() }));

import StudentForm, * as StudentFormModule from './StudentForm.jsx';

const h = React.createElement;

describe('StudentForm enrollment selection', () => {
  it('renders a disabled pending-selection option without offering enrolled learners an unassign option', () => {
    const learner = {
      id: 'student-1', lrn: '123456789012', firstName: 'Juan', lastName: 'Cruz',
      sex: 'M', birthdate: '2012-01-02', documents: {},
    };
    const html = renderToStaticMarkup(h(StudentForm, {
      students: [learner],
      editing: learner,
      sections: [{ id: 'section-1', schoolYear: '2026-2027', gradeLevel: 8, name: 'Rizal' }],
      enrollments: [{ studentId: 'student-1', schoolYear: '2026-2027', status: 'enrolled', gradeLevel: 8, sectionId: 'section-1' }],
      schoolYear: '2026-2027',
      onClose: vi.fn(),
    }));

    expect(html).toContain('<option value="__choose_section__" disabled="">Choose a section…</option>');
    expect(html).not.toContain('— Not assigned —');
  });

  it('rejects an empty, missing, or wrong-grade section while allowing an unassigned grade', () => {
    const errorFor = StudentFormModule.enrollmentSectionError;
    const sectionsForGrade = [{ id: 'section-8', gradeLevel: 8 }];

    expect(errorFor({ grade: '', sectionId: '', sectionsForGrade })).toBe('');
    expect(errorFor({ grade: '8', sectionId: '', sectionsForGrade })).toBe('Choose a section for this grade.');
    expect(errorFor({ grade: '8', sectionId: 'removed', sectionsForGrade })).toBe('Choose a section for this grade.');
    expect(errorFor({ grade: '8', sectionId: 'section-8', sectionsForGrade })).toBe('');
  });
});
