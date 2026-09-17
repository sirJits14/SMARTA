import { describe, it, expect } from 'vitest';
import { activeStudentCount, enrolledCount, countByGrade, todayAttendance, recentEnrollments, unassignedCount } from './dashboardStats.js';

describe('activeStudentCount', () => {
  it('counts only active students', () => {
    const students = [{ status: 'active' }, { status: 'active' }, { status: 'dropped' }, { status: 'transferred' }];
    expect(activeStudentCount(students)).toBe(2);
  });
});

describe('unassignedCount', () => {
  it('counts active students with no enrolled row for the school year', () => {
    const students = [
      { id: 's1', status: 'active' },
      { id: 's2', status: 'active' },
      { id: 's3', status: 'active' },
      { id: 's4', status: 'dropped' },
    ];
    const enrollments = [
      { studentId: 's1', schoolYear: '2026-2027', status: 'enrolled' },
      { studentId: 's2', schoolYear: '2025-2026', status: 'enrolled' },
      { studentId: 's3', schoolYear: '2026-2027', status: 'dropped' },
    ];
    // s1: enrolled this SY -> assigned. s2: enrolled, but wrong SY -> unassigned.
    // s3: has a row this SY but not 'enrolled' -> unassigned. s4: inactive -> excluded.
    expect(unassignedCount(students, enrollments, '2026-2027')).toBe(2);
  });

  it('returns 0 when every active student is enrolled', () => {
    const students = [{ id: 's1', status: 'active' }];
    const enrollments = [{ studentId: 's1', schoolYear: '2026-2027', status: 'enrolled' }];
    expect(unassignedCount(students, enrollments, '2026-2027')).toBe(0);
  });
});

describe('enrolledCount', () => {
  it('counts enrolled records for the given school year only', () => {
    const enrollments = [
      { schoolYear: '2026-2027', status: 'enrolled' },
      { schoolYear: '2026-2027', status: 'dropped' },
      { schoolYear: '2025-2026', status: 'enrolled' },
    ];
    expect(enrolledCount(enrollments, '2026-2027')).toBe(1);
  });
});

describe('countByGrade', () => {
  it('tallies enrolled learners per grade for the school year', () => {
    const enrollments = [
      { schoolYear: '2026-2027', status: 'enrolled', gradeLevel: 7 },
      { schoolYear: '2026-2027', status: 'enrolled', gradeLevel: 7 },
      { schoolYear: '2026-2027', status: 'enrolled', gradeLevel: 8 },
      { schoolYear: '2026-2027', status: 'dropped', gradeLevel: 8 },
      { schoolYear: '2025-2026', status: 'enrolled', gradeLevel: 7 },
    ];
    expect(countByGrade(enrollments, '2026-2027')).toEqual({ 7: 2, 8: 1 });
  });
});

describe('todayAttendance', () => {
  it('returns null presentRate when nothing marked today', () => {
    expect(todayAttendance([], 3, '2026-07-24')).toEqual({ sectionsMarked: 0, presentRate: null });
  });
  it('computes sections-marked and present rate (P and L count as present)', () => {
    const docs = [
      { date: '2026-07-24', marks: { s1: 'P', s2: 'A', s3: 'L' } },
      { date: '2026-07-24', marks: { s4: 'P' } },
      { date: '2026-07-23', marks: { s5: 'A' } },
    ];
    expect(todayAttendance(docs, 5, '2026-07-24')).toEqual({ sectionsMarked: 2, presentRate: 75 });
  });
});

describe('recentEnrollments', () => {
  it('returns the N most recently enrolled, newest first, enrolled-only', () => {
    const enrollments = [
      { studentId: 'a', status: 'enrolled', dateEnrolled: '2026-07-01' },
      { studentId: 'b', status: 'enrolled', dateEnrolled: '2026-07-10' },
      { studentId: 'c', status: 'dropped', dateEnrolled: '2026-07-15' },
      { studentId: 'd', status: 'enrolled', dateEnrolled: '2026-07-05' },
    ];
    const result = recentEnrollments(enrollments, 2);
    expect(result.map((e) => e.studentId)).toEqual(['b', 'd']);
  });
});
