import { describe, it, expect } from 'vitest';
import { ALL_GRADES, ROLE_VALUES, ROLE_LABELS, roleOf, scopedGrades, roleLabel } from './staffRoles.js';

describe('roleOf', () => {
  it('treats pre-roles profiles as admin', () => {
    expect(roleOf({})).toBe('admin');
    expect(roleOf({ role: null })).toBe('admin');
    expect(roleOf({ role: '' })).toBe('admin');
    expect(roleOf({ role: 'registrar' })).toBe('admin');
  });
  it('returns the four known roles as-is', () => {
    for (const r of ROLE_VALUES) expect(roleOf({ role: r })).toBe(r);
  });
  it('grants nothing for a missing profile or an unknown role', () => {
    expect(roleOf(null)).toBeNull();
    expect(roleOf(undefined)).toBeNull();
    expect(roleOf({ role: 'teacher' })).toBeNull();
  });
});

describe('scopedGrades', () => {
  it('admin sees every grade (null)', () => {
    expect(scopedGrades({ role: 'admin' })).toBeNull();
    expect(scopedGrades({ role: 'registrar' })).toBeNull();
  });
  it('academic coordinators get fixed ranges', () => {
    expect(scopedGrades({ role: 'jhs_coord' })).toEqual([7, 8, 9, 10]);
    expect(scopedGrades({ role: 'shs_coord' })).toEqual([11, 12]);
  });
  it('grade level coordinator gets exactly their grade', () => {
    expect(scopedGrades({ role: 'glc', gradeLevel: 8 })).toEqual([8]);
    expect(scopedGrades({ role: 'glc', gradeLevel: '11' })).toEqual([11]);
  });
  it('glc without a valid grade, or unknown roles, see nothing', () => {
    expect(scopedGrades({ role: 'glc' })).toEqual([]);
    expect(scopedGrades({ role: 'glc', gradeLevel: 13 })).toEqual([]);
    expect(scopedGrades({ role: 'teacher' })).toEqual([]);
    expect(scopedGrades(null)).toEqual([]);
  });
});

describe('roleLabel', () => {
  it('labels each role', () => {
    expect(roleLabel({ role: 'registrar' })).toBe('Administrator');
    expect(roleLabel({ role: 'jhs_coord' })).toBe('JHS Academic Coordinator');
    expect(roleLabel({ role: 'shs_coord' })).toBe('SHS Academic Coordinator');
    expect(roleLabel({ role: 'glc', gradeLevel: 9 })).toBe('Grade 9 Coordinator');
    expect(roleLabel({ role: 'teacher' })).toBe('No role');
  });
  it('exposes picker labels and grades', () => {
    expect(ROLE_LABELS.glc).toBe('Grade Level Coordinator');
    expect(ALL_GRADES).toEqual([7, 8, 9, 10, 11, 12]);
  });
});
