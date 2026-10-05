import { localDate } from './dates.js';

export function currentEnrollmentByStudent(enrollments, schoolYear) {
  const current = new Map();
  for (const enrollment of enrollments || []) {
    if (enrollment.schoolYear === schoolYear && enrollment.status === 'enrolled') {
      current.set(enrollment.studentId, enrollment);
    }
  }
  return current;
}

export function planEnrollmentChange({ current, section, schoolYear, type }) {
  if (!section || current?.sectionId === section.id) return { kind: 'none' };

  const target = {
    gradeLevel: section.gradeLevel,
    sectionId: section.id,
    track: section.track || null,
    strand: section.strand || null,
  };

  if (current) return { kind: 'transfer', data: target };

  return {
    kind: 'enroll',
    data: {
      schoolYear,
      ...target,
      type: type || 'new',
      dateEnrolled: localDate(),
      status: 'enrolled',
    },
  };
}
