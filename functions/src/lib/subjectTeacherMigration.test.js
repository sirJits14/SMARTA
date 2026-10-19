import { describe, it, expect } from 'vitest';
import { migrateAssignments } from './subjectTeacherMigration.js';

const at = ms => ({ toMillis: () => ms });
const grades = { A: 7, B: 7, C: 8 };
const grade = id => grades[id];
describe('migrateAssignments', () => {
  it('turns section subject-teacher rows into one row per grade, keeping the earliest', () => {
    const { assignments, changed } = migrateAssignments([
      { role: 'subject_teacher', schoolYear: 'Y', sectionId: 'B', gradeLevel: 7, assignedAt: at(20), assignedBy: 'b', source: 'direct' },
      { role: 'subject_teacher', schoolYear: 'Y', sectionId: 'A', gradeLevel: 7, assignedAt: at(10), assignedBy: 'a', source: 'request' },
      { role: 'subject_teacher', schoolYear: 'Y', sectionId: 'C', gradeLevel: 8, assignedAt: at(30), assignedBy: 'c', source: 'direct' },
      { role: 'adviser', schoolYear: 'Y', sectionId: 'A', gradeLevel: 7, assignedAt: at(5), assignedBy: 'x', source: 'direct' },
    ], grade);
    expect(changed).toBe(true);
    expect(assignments).toEqual([
      { role: 'subject_teacher', schoolYear: 'Y', gradeLevel: 7, assignedAt: expect.anything(), assignedBy: 'a', source: 'request' },
      { role: 'subject_teacher', schoolYear: 'Y', gradeLevel: 8, assignedAt: expect.anything(), assignedBy: 'c', source: 'direct' },
      { role: 'adviser', schoolYear: 'Y', sectionId: 'A', gradeLevel: 7, assignedAt: expect.anything(), assignedBy: 'x', source: 'direct' },
    ]);
    expect(assignments[0].assignedAt.toMillis()).toBe(10);
  });
  it('falls back to the stored grade for a deleted section and reports no change when nothing is section-based', () => {
    expect(migrateAssignments([{ role: 'subject_teacher', schoolYear: 'Y', sectionId: 'GONE', gradeLevel: 9 }], grade).assignments)
      .toEqual([{ role: 'subject_teacher', schoolYear: 'Y', gradeLevel: 9 }]);
    const already = [{ role: 'subject_teacher', schoolYear: 'Y', gradeLevel: 9 }];
    expect(migrateAssignments(already, grade)).toEqual({ assignments: already, changed: false });
  });
  it('collapses an already grade-level row that duplicates a converted section row, keeping the earliest', () => {
    const { assignments, changed } = migrateAssignments([
      { role: 'subject_teacher', schoolYear: 'Y', sectionId: 'A', gradeLevel: 7, assignedAt: at(20), assignedBy: 'a' },
      { role: 'subject_teacher', schoolYear: 'Y', gradeLevel: 7, assignedAt: at(10), assignedBy: 'g' },
    ], grade);
    expect(changed).toBe(true);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({ gradeLevel: 7, assignedBy: 'g' });
  });
  it('leaves a section row unchanged when no grade can be determined', () => {
    const rows = [{ role: 'subject_teacher', schoolYear: 'Y', sectionId: 'GONE' }];
    expect(migrateAssignments(rows, grade)).toEqual({ assignments: rows, changed: false });
  });
});
