import { describe, expect, it } from 'vitest';
import * as helpers from './coordinatorScope.js';
const year = '2026-2027';
const student = { id: 'S1' };
const enrollment = { id: 'S1_2026-2027', studentId: 'S1', schoolYear: year, status: 'enrolled', gradeLevel: 7 };
const section = { id: 'SEC1', schoolYear: year, gradeLevel: 7 };

describe('coordinator scope derivation', () => {
  it('derives current scope including legacy students without status', () => {
    expect(helpers.deriveStudentScope(student, [enrollment], year)).toEqual({ fields: { gradeLevel: 7, scopeSchoolYear: year }, warnings: [] });
  });
  it('clears scope when no current active enrollment exists', () => {
    expect(helpers.deriveStudentScope(student, [{ ...enrollment, schoolYear: '2025-2026' }], year).fields).toEqual({ gradeLevel: null, scopeSchoolYear: null });
  });
  it('clears scope for an inactive student', () => {
    expect(helpers.deriveStudentScope({ ...student, status: 'inactive' }, [enrollment], year).fields).toEqual({ gradeLevel: null, scopeSchoolYear: null });
  });
  it('treats explicit null status as inactive, matching current writers and rules', () => {
    expect(helpers.deriveStudentScope({ ...student, status: null }, [enrollment], year).fields).toEqual({ gradeLevel: null, scopeSchoolYear: null });
  });
  it('clears withdrawn enrollment scope', () => {
    expect(helpers.deriveStudentScope(student, [{ ...enrollment, status: 'withdrawn' }], year).fields).toEqual({ gradeLevel: null, scopeSchoolYear: null });
  });
  it.each([
    [null, [enrollment]],
    [student, [{ ...enrollment, studentId: 'S2' }]],
    [student, [enrollment, { ...enrollment, id: 'duplicate', gradeLevel: 8 }]],
    [student, [{ ...enrollment, gradeLevel: '7' }]],
  ])('does not guess from missing or conflicting student/enrollment sources', (s, es) => {
    const result = helpers.deriveStudentScope(s, es, year);
    expect(result.fields).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it('derives attendance grade from its matching section', () => {
    expect(helpers.deriveAttendanceScope({ sectionId: 'SEC1', schoolYear: year }, section)).toEqual({ fields: { gradeLevel: 7 }, warnings: [] });
  });
  it.each([null, { ...section, id: 'SEC2' }, { ...section, schoolYear: '2025-2026' }, { ...section, gradeLevel: 13 }])('rejects missing or mismatched attendance source', source => {
    const result = helpers.deriveAttendanceScope({ sectionId: 'SEC1', schoolYear: year }, source);
    expect(result.fields).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it('preserves a historical grade conflict for manual repair', () => {
    expect(helpers.deriveAttendanceScope({ sectionId: 'SEC1', gradeLevel: 8 }, section).fields).toBeNull();
  });
  it('derives a sorted unique shared schedule audience', () => {
    expect(helpers.deriveScheduleScope('AM', [{ scheduleId: 'AM', gradeLevel: 12 }, { scheduleId: 'AM', gradeLevel: 7 }, { scheduleId: 'AM', gradeLevel: 7 }]).fields).toEqual({ gradeLevels: [7, 12] });
  });
  it('clears an unreferenced schedule audience', () => {
    expect(helpers.deriveScheduleScope('AM', []).fields).toEqual({ gradeLevels: [] });
  });
  it('does not omit an invalid linked section to invent a partial audience', () => {
    expect(helpers.deriveScheduleScope('AM', [{ scheduleId: 'AM', gradeLevel: 7 }, { scheduleId: 'AM', gradeLevel: null }]).fields).toBeNull();
  });
  it('plans deterministic patches and becomes a no-op after applying them', () => {
    const input = { schoolYear: year, students: [student], enrollments: [enrollment], sections: [section], attendance: [{ id: 'A1', sectionId: 'SEC1', schoolYear: year }], schedules: [{ id: 'AM' }] };
    const first = helpers.planCoordinatorScopeBackfill(input);
    expect(first.changes).toEqual([
      { path: 'schedules/AM', patch: { gradeLevels: [] } },
      { path: 'student_attendance/A1', patch: { gradeLevel: 7 } },
      { path: 'students/S1', patch: { gradeLevel: 7, scopeSchoolYear: year } },
    ]);
    expect(helpers.planCoordinatorScopeBackfill({ ...input, students: [{ ...student, gradeLevel: 7, scopeSchoolYear: year }], attendance: [{ ...input.attendance[0], gradeLevel: 7 }], schedules: [{ id: 'AM', gradeLevels: [] }] }).changes).toEqual([]);
  });
  it('reports orphan enrollments and missing schedules without writing guessed records', () => {
    const result = helpers.planCoordinatorScopeBackfill({ schoolYear: year, students: [], enrollments: [enrollment], sections: [{ ...section, scheduleId: 'missing' }], schedules: [], attendance: [] });
    expect(result.changes).toEqual([]);
    expect(result.warnings).toHaveLength(2);
  });
  it('refuses all planning when the active school year is missing', () => {
    expect(() => helpers.planCoordinatorScopeBackfill({ students: [student] })).toThrow(/school year/i);
  });
});
