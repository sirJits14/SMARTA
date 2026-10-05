import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentEnrollmentByStudent, planEnrollmentChange } from './enrollmentChange.js';

afterEach(() => vi.useRealTimers());

describe('currentEnrollmentByStudent', () => {
  it('keeps only enrolled records for the requested school year', () => {
    const records = [
      { id: 'current', studentId: 's1', schoolYear: '2026-2027', status: 'enrolled' },
      { id: 'old', studentId: 's2', schoolYear: '2025-2026', status: 'enrolled' },
      { id: 'dropped', studentId: 's3', schoolYear: '2026-2027', status: 'dropped' },
      { id: 'transferred', studentId: 's4', schoolYear: '2026-2027', status: 'transferred' },
    ];

    expect([...currentEnrollmentByStudent(records, '2026-2027').entries()]).toEqual([
      ['s1', records[0]],
    ]);
  });
});

describe('planEnrollmentChange', () => {
  const current = {
    id: 's1_2026-2027', studentId: 's1', schoolYear: '2026-2027', status: 'enrolled',
    gradeLevel: 8, sectionId: 'old-section', track: null, strand: null,
    type: 'returning', dateEnrolled: '2026-06-03',
  };

  it('returns none when no section is selected or the section is unchanged', () => {
    expect(planEnrollmentChange({ current, section: null, schoolYear: '2026-2027' })).toEqual({ kind: 'none' });
    expect(planEnrollmentChange({ current, section: { id: 'old-section' }, schoolYear: '2026-2027' })).toEqual({ kind: 'none' });
  });

  it('returns only the mutable enrollment fields for a transfer', () => {
    expect(planEnrollmentChange({
      current,
      section: { id: 'new-section', gradeLevel: 11, track: 'Academic', strand: 'STEM' },
      schoolYear: '2026-2027',
      type: 'transferee',
    })).toEqual({
      kind: 'transfer',
      data: { gradeLevel: 11, sectionId: 'new-section', track: 'Academic', strand: 'STEM' },
    });
  });

  it('sets track and strand to null when transferring to a JHS section', () => {
    expect(planEnrollmentChange({
      current,
      section: { id: 'grade-9', gradeLevel: 9 },
      schoolYear: '2026-2027',
    })).toEqual({
      kind: 'transfer',
      data: { gradeLevel: 9, sectionId: 'grade-9', track: null, strand: null },
    });
  });

  it('plans a new enrollment with the default type and local date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 12));

    expect(planEnrollmentChange({
      section: { id: 'grade-7', gradeLevel: 7 },
      schoolYear: '2026-2027',
    })).toEqual({
      kind: 'enroll',
      data: {
        schoolYear: '2026-2027', gradeLevel: 7, sectionId: 'grade-7',
        track: null, strand: null, type: 'new', dateEnrolled: '2026-09-29', status: 'enrolled',
      },
    });
  });

  it('respects the chosen enrollment type', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 12));

    const plan = planEnrollmentChange({
      section: { id: 'grade-11', gradeLevel: 11, track: 'Academic', strand: 'HUMSS' },
      schoolYear: '2026-2027',
      type: 'transferee',
    });

    expect(plan.data.type).toBe('transferee');
    expect(plan.data.status).toBe('enrolled');
  });

  it('plans enrollment when the only current-year record is dropped', () => {
    const records = [{ studentId: 's1', schoolYear: '2026-2027', status: 'dropped' }];
    const active = currentEnrollmentByStudent(records, '2026-2027').get('s1');

    expect(planEnrollmentChange({
      current: active,
      section: { id: 'grade-8', gradeLevel: 8 },
      schoolYear: '2026-2027',
    }).kind).toBe('enroll');
  });
});
