import { describe, it, expect } from 'vitest';
import { rosterBySection, attendanceTally, percentOf, sexBreakdown, shsBreakdown, unassignedStudents, unassignedCount, gradesInScope, sectionTitle, formatUnits, formatRate } from './dashboardStats.js';

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

describe('sexBreakdown', () => {
  const students = [
    { id: 'a', sex: 'M' }, { id: 'b', sex: 'F' }, { id: 'c', sex: '' }, { id: 'd', sex: 'M' },
  ];
  const sections = [{ id: 'A', name: 'Rizal', gradeLevel: 7 }, { id: 'B', name: 'Mabini', gradeLevel: 8 }];
  const enrollments = [
    { studentId: 'a', sectionId: 'A', gradeLevel: 7, schoolYear: SY, status: 'enrolled' },
    { studentId: 'b', sectionId: 'A', gradeLevel: 7, schoolYear: SY, status: 'enrolled' },
    { studentId: 'c', sectionId: 'B', gradeLevel: '8', schoolYear: SY, status: 'enrolled' },
    { studentId: 'e', sectionId: 'A', gradeLevel: 7, schoolYear: SY, status: 'enrolled' }, // not in scoped students
    { studentId: 'a', sectionId: 'A', gradeLevel: 7, schoolYear: '2025-2026', status: 'enrolled' },
    { studentId: 'd', sectionId: 'A', gradeLevel: 7, schoolYear: SY, status: 'dropped' },
  ];

  it('counts enrolled learners in scope and keeps unknown sex as Not recorded', () => {
    const r = sexBreakdown({ students, enrollments, sections, schoolYear: SY });
    expect([r.male, r.female, r.unknown, r.total]).toEqual([1, 1, 1, 3]);
    expect(r.byGrade).toEqual([
      { grade: 7, male: 1, female: 1, unknown: 0, total: 2 },
      { grade: 8, male: 0, female: 0, unknown: 1, total: 1 },
    ]);
    expect(r.bySection.map((s) => [s.name, s.total])).toEqual([['Rizal', 2], ['Mabini', 1]]);
  });

  it('filters to one grade', () => {
    const r = sexBreakdown({ students, enrollments, sections, schoolYear: SY, grade: 8 });
    expect([r.male, r.female, r.unknown, r.total]).toEqual([0, 0, 1, 1]);
  });
});

describe('shsBreakdown', () => {
  it('groups grades 11 and 12 by track and strand', () => {
    const sections = [
      { id: 's11', gradeLevel: 11, track: 'Academic', strand: 'STEM' },
      { id: 's12', gradeLevel: 12, track: 'TVL', strand: 'ICT' },
      { id: 's7', gradeLevel: 7 },
    ];
    const row = (sectionId, gradeLevel) => ({ studentId: sectionId + gradeLevel + Math.random(), sectionId, gradeLevel, schoolYear: SY, status: 'enrolled' });
    const enrollments = [row('s11', 11), row('s11', 11), row('s12', 12), row('s7', 7), row('gone', 11)];
    expect(shsBreakdown(enrollments, sections, SY)).toEqual([
      { track: 'Academic', strand: 'STEM', count: 2 },
      { track: 'No track', strand: 'No strand', count: 1 },
      { track: 'TVL', strand: 'ICT', count: 1 },
    ]);
  });
});

describe('unassignedStudents', () => {
  it('lists active learners without an enrolled row, sorted by name, and backs unassignedCount', () => {
    const students = [
      { id: 's1', status: 'active', lastName: 'Cruz', firstName: 'Ana' },
      { id: 's2', status: 'active', lastName: 'Abad', firstName: 'Ben' },
      { id: 's3', status: 'active', lastName: 'Diaz', firstName: 'Cy' },
      { id: 's4', status: 'dropped', lastName: 'Ely', firstName: 'Di' },
    ];
    const enrollments = [{ studentId: 's3', schoolYear: SY, status: 'enrolled' }];
    expect(unassignedStudents(students, enrollments, SY).map((s) => s.id)).toEqual(['s2', 's1']);
    expect(unassignedCount(students, enrollments, SY)).toBe(2);
  });
});

describe('labels', () => {
  it('lists grades that have sections this school year', () => {
    expect(gradesInScope([{ gradeLevel: '8', schoolYear: SY }, { gradeLevel: 7, schoolYear: SY }, { gradeLevel: 9, schoolYear: 'old' }], SY)).toEqual([7, 8]);
  });
  it('titles sections', () => {
    expect(sectionTitle({ gradeLevel: 11, name: 'Rizal', strand: 'STEM' })).toBe('Grade 11 · Rizal · STEM');
    expect(sectionTitle({ gradeLevel: 7, name: 'Mabini' })).toBe('Grade 7 · Mabini');
    expect(sectionTitle(undefined)).toBe('Unavailable section');
  });
  it('formats units and rates', () => {
    expect(formatUnits(1200)).toBe('1,200');
    expect(formatUnits(2.5)).toBe('2.5');
    expect(formatRate(50)).toBe('50%');
    expect(formatRate(null)).toBe('—');
  });
});
