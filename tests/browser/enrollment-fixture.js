import { useSyncExternalStore } from 'react';

const schoolYear = '2026-2027';
const section = (id, name, gradeLevel, strand) => ({ id, name, gradeLevel, strand, schoolYear });
const sections = [
  ...Array.from({ length: 30 }, (_, i) => section(`g7-${i}`, i === 0 ? 'Acacia' : i === 1 ? 'Bamboo' : `Section ${String(i + 1).padStart(2, '0')}`, 7)),
  section('g8-a', 'Camia', 8), section('g8-b', 'Dahlia', 8),
  ...Array.from({ length: 16 }, (_, i) => section(`g10-${i}`, `Section ${i + 1}`, 10)),
  section('g11-a', 'Buffet', 11, 'ABM'),
  ...Array.from({ length: 20 }, (_, i) => section(`g12-${i}`, i === 0 ? 'William Dean' : `Senior Section ${i + 1}`, 12, i % 2 ? 'STEM' : 'Agri-Fishery Arts')),
  { ...section('historic', 'Previous year section', 9), schoolYear: '2025-2026' },
];
const students = Array.from({ length: 26 }, (_, i) => ({ id: `s${i}`, lastName: 'Synthetic', firstName: `Learner ${String(i + 1).padStart(2, '0')}`, sex: i % 2 ? 'F' : 'M', lrn: `999${String(i).padStart(9, '0')}` }));
let enrollments;
let scenario = 'normal';
let revision = 0;
const listeners = new Set();
export const writes = [];
const notify = () => { revision++; listeners.forEach(listener => listener()); };
export function resetFixture() {
  enrollments = students.slice(0, 24).map((student, i) => ({ studentId: student.id, sectionId: i < 14 ? 'g7-0' : 'g8-a', schoolYear, status: 'enrolled' }));
  enrollments.push({ ...enrollments[0] }, { studentId: 's25', sectionId: 'g7-0', schoolYear: '2025-2026', status: 'enrolled' }, { studentId: 'missing', sectionId: 'g7-0', schoolYear, status: 'enrolled' });
  scenario = 'normal'; writes.length = 0; notify();
}
resetFixture();
export const setScenario = value => { scenario = value; notify(); };
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function useCollectionResource(path) {
  useSyncExternalStore(subscribe, () => revision);
  return { data: scenario === 'empty' ? [] : ({ sections, students, enrollments }[path] || []), loading: scenario === 'loading', error: scenario === 'error' ? new Error('Synthetic resource error') : null, retry: () => setScenario('normal') };
}
export async function enrollStudent({ student, section, schoolYear, type }) {
  if (scenario === 'save-error') throw new Error('Synthetic save error');
  writes.push({ kind: 'enroll', studentId: student.id, sectionId: section.id, schoolYear, type });
  enrollments = enrollments.filter(enrollment => enrollment.studentId !== student.id || enrollment.schoolYear !== schoolYear);
  enrollments.push({ studentId: student.id, sectionId: section.id, schoolYear, status: 'enrolled' }); notify();
}
export async function withdrawEnrollment(studentId, year, status) {
  writes.push({ kind: 'withdraw', studentId, schoolYear: year, status });
  enrollments = enrollments.map(enrollment => enrollment.studentId === studentId && enrollment.schoolYear === year ? { ...enrollment, status } : enrollment); notify();
}
