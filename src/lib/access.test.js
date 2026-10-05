import { describe, it, expect } from 'vitest';
import { isAdmin, allowedPages, canOpen, gradeOptions, singleGrade, profileRefusal, ownProfile, scopeRoster } from './access.js';

const admin = { role: 'registrar' }, jhs = { role: 'jhs_coord' }, glc8 = { role: 'glc', gradeLevel: 8 };

describe('pages', () => {
  it('admins open everything including Accounts', () => {
    expect(isAdmin(admin)).toBe(true);
    expect(allowedPages(admin)).toEqual(expect.arrayContaining(['dashboard', 'enroll', 'guardians', 'settings', 'accounts']));
  });
  it('coordinators open only the five shared pages', () => {
    expect(allowedPages(jhs)).toEqual(['dashboard', 'students', 'sections', 'schedules', 'attendance']);
    expect(canOpen(glc8, 'attendance')).toBe(true);
    expect(canOpen(glc8, 'enroll')).toBe(false);
    expect(canOpen({ role: 'teacher' }, 'dashboard')).toBe(false);
  });
});

describe('grade controls', () => {
  it('lists scoped grades and detects a single grade', () => {
    expect(gradeOptions(admin)).toEqual([7, 8, 9, 10, 11, 12]);
    expect(gradeOptions(jhs)).toEqual([7, 8, 9, 10]);
    expect(singleGrade(glc8)).toBe(8);
    expect(singleGrade(jhs)).toBeNull();
    expect(singleGrade(admin)).toBeNull();
  });
});

describe('profileRefusal', () => {
  it('explains why a signed-in user cannot enter', () => {
    expect(profileRefusal(null)).toBe('This account has no staff profile yet. Ask an administrator to add one.');
    expect(profileRefusal({ role: 'admin', disabled: true })).toBe('This account has been disabled. Contact an administrator.');
    expect(profileRefusal({ role: 'teacher' })).toMatch(/no valid role/);
    expect(profileRefusal(glc8)).toBeNull();
  });
});

describe('ownProfile', () => {
  it('ignores a profile bound to a different sign-in', () => {
    expect(ownProfile({ role: 'admin', uid: 'u1' }, 'u1')).toEqual({ role: 'admin', uid: 'u1' });
    expect(ownProfile({ role: 'admin' }, 'u1')).toEqual({ role: 'admin' });
    expect(ownProfile({ role: 'admin', uid: 'u0' }, 'u1')).toBeNull();
    expect(ownProfile(null, 'u1')).toBeNull();
  });
});

describe('scopeRoster', () => {
  const SY = '2026-2027';
  const data = {
    sections: [{ id: 'A', gradeLevel: 8 }, { id: 'B', gradeLevel: 11 }],
    enrollments: [
      { studentId: 's1', sectionId: 'A', gradeLevel: 8, schoolYear: SY, status: 'enrolled' },
      { studentId: 's2', sectionId: 'B', gradeLevel: 11, schoolYear: SY, status: 'enrolled' },
      { studentId: 's3', sectionId: 'A', gradeLevel: 8, schoolYear: '2025-2026', status: 'enrolled' },
    ],
    students: [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }],
    attendance: [{ id: 'A_d', sectionId: 'A' }, { id: 'B_d', sectionId: 'B' }],
  };
  it('is the identity for admins', () => {
    expect(scopeRoster(data, null, SY)).toEqual(data);
  });
  it('keeps only in-grade sections, enrollments, current learners, and attendance', () => {
    const r = scopeRoster(data, [8], SY);
    expect(r.sections.map((s) => s.id)).toEqual(['A']);
    expect(r.enrollments.map((e) => e.studentId)).toEqual(['s1', 's3']);
    expect(r.students.map((s) => s.id)).toEqual(['s1']); // s3 not enrolled this year; s4 unassigned
    expect(r.attendance.map((d) => d.id)).toEqual(['A_d']);
  });
  it('defaults missing collections to empty', () => {
    expect(scopeRoster({ sections: data.sections }, [11], SY)).toEqual({ sections: [data.sections[1]], enrollments: [], students: [], attendance: [] });
  });
});
