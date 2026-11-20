import { describe, it, expect } from 'vitest';
import { rosterBySection, attendanceTally, percentOf } from './dashboardStats.js';

const SY = '2026-2027';

describe('rosterBySection', () => {
  it('maps sections to enrolled learners who are in scope', () => {
    const students = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
    const enrollments = [
      { studentId: 's1', sectionId: 'A', schoolYear: SY, status: 'enrolled' },
      { studentId: 's2', sectionId: 'A', schoolYear: SY, status: 'enrolled' },
      { studentId: 's3', sectionId: 'B', schoolYear: SY, status: 'enrolled' },
      { studentId: 's4', sectionId: 'B', schoolYear: SY, status: 'enrolled' }, // out of scope
      { studentId: 's1', sectionId: 'C', schoolYear: '2025-2026', status: 'enrolled' },
      { studentId: 's2', sectionId: 'C', schoolYear: SY, status: 'dropped' },
    ];
    expect([...rosterBySection(students, enrollments, SY)]).toEqual([['A', ['s1', 's2']], ['B', ['s3']]]);
  });
});

describe('attendanceTally', () => {
  const roster = new Map([['A', ['s1', 's2']], ['B', ['s3']]]);
  const attendance = [
    { sectionId: 'A', date: '2026-07-20', schoolYear: SY, marks: { s2: 'A' } },
    { sectionId: 'A', date: '2026-07-21', schoolYear: SY, marks: { s2: 'E' }, sessionOverrides: { s1: { am: { absent: true } } } },
    { sectionId: 'B', date: '2026-07-21', schoolYear: SY, marks: { s3: 'L' } },
    { sectionId: 'B', date: '2026-07-21', schoolYear: '2025-2026', marks: { s3: 'A' } }, // other school year
    { sectionId: 'A', date: '2026-07-27', schoolYear: SY, marks: { s1: 'A' } },          // outside the dates
    { sectionId: 'Z', date: '2026-07-20', schoolYear: SY, marks: { x: 'A' } },           // section not in roster
  ];
  const dates = ['2026-07-20', '2026-07-21', '2026-07-22'];

  it('counts unmarked learners in a recorded section as present', () => {
    const { days } = attendanceTally({ roster, attendance, schoolYear: SY, dates });
    expect(days[0]).toEqual({ date: '2026-07-20', sectionsRecorded: 1, present: 1, late: 0, absent: 1, excused: 0, rate: 50 });
  });

  it('treats a half-day absence as half present, half absent, and keeps late inside present', () => {
    const { days } = attendanceTally({ roster, attendance, schoolYear: SY, dates });
    expect(days[1]).toEqual({ date: '2026-07-21', sectionsRecorded: 2, present: 1.5, late: 1, absent: 0.5, excused: 1, rate: 50 });
  });

  it('leaves a day with no records as not recorded rather than 0% or 100%', () => {
    const { days } = attendanceTally({ roster, attendance, schoolYear: SY, dates });
    expect(days[2]).toEqual({ date: '2026-07-22', sectionsRecorded: 0, present: 0, late: 0, absent: 0, excused: 0, rate: null });
  });

  it('totals per section and overall', () => {
    const { sections, total } = attendanceTally({ roster, attendance, schoolYear: SY, dates });
    expect(sections).toEqual([
      { sectionId: 'A', daysRecorded: 2, present: 1.5, late: 0, absent: 1.5, excused: 1, rate: 38 },
      { sectionId: 'B', daysRecorded: 1, present: 1, late: 1, absent: 0, excused: 0, rate: 100 },
    ]);
    expect(total).toEqual({ present: 2.5, late: 1, absent: 1.5, excused: 1, rate: 50 });
  });

  it('limits to the given sections', () => {
    const { total, sections } = attendanceTally({ roster, attendance, schoolYear: SY, dates, sectionIds: ['B'] });
    expect(sections.map((s) => s.sectionId)).toEqual(['B']);
    expect(total.rate).toBe(100);
  });

  it('handles an empty week', () => {
    const { days, total } = attendanceTally({ roster, attendance: [], schoolYear: SY, dates });
    expect(days.every((d) => d.rate === null)).toBe(true);
    expect(total.rate).toBe(null);
  });
});

describe('percentOf', () => {
  it('rounds and guards zero', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(0, 0)).toBe(null);
  });
});
