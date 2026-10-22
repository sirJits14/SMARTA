import { describe, expect, it } from 'vitest';
import { gradeImageFilename, gradeSummary, sectionCounts } from './gradeSummary.js';

const YEAR = '2026-2027';
const students = [{ id: 'm1', sex: 'M' }, { id: 'm2', sex: 'M' }, { id: 'f1', sex: 'F' }, { id: 'x1', sex: '' }];
const enroll = (studentId, sectionId, over = {}) => ({ studentId, sectionId, schoolYear: YEAR, status: 'enrolled', gradeLevel: 8, ...over });

describe('sectionCounts', () => {
  it('splits enrolled learners by sex per section', () => {
    const counts = sectionCounts([enroll('m1', 'a'), enroll('m2', 'a'), enroll('f1', 'a'), enroll('f1', 'b')], students, YEAR);
    expect(counts.get('a')).toEqual({ male: 2, female: 1, total: 3 });
    expect(counts.get('b')).toEqual({ male: 0, female: 1, total: 1 });
  });

  it('ignores withdrawn rows and other school years', () => {
    const counts = sectionCounts([
      enroll('m1', 'a'), enroll('m2', 'a', { status: 'transferred' }), enroll('f1', 'a', { status: 'dropped' }),
      enroll('f1', 'a', { schoolYear: '2025-2026' }),
    ], students, YEAR);
    expect(counts.get('a')).toEqual({ male: 1, female: 0, total: 1 });
  });

  it('counts a learner with no sex, or no record, in Total only', () => {
    const counts = sectionCounts([enroll('x1', 'a'), enroll('ghost', 'a')], students, YEAR);
    expect(counts.get('a')).toEqual({ male: 0, female: 0, total: 2 });
  });

  it('has no entry for a section nobody is enrolled in', () => {
    expect(sectionCounts([], students, YEAR).has('a')).toBe(false);
  });
});

describe('gradeSummary', () => {
  const sections = [
    { id: 'a', gradeLevel: 8, name: 'Mabini', adviserName: 'Ana Cruz', schoolYear: YEAR, scheduleId: 'AM' },
    { id: 'b', gradeLevel: '8', name: 'Rizal', schoolYear: YEAR },
    { id: 'c', gradeLevel: 9, name: 'Luna', adviserName: 'Cora Tan', schoolYear: YEAR },
    { id: 'd', gradeLevel: 8, name: 'Old', schoolYear: '2025-2026' },
    { id: 'e', gradeLevel: 11, name: 'Newton', adviserName: 'Ben Dy', schoolYear: YEAR, strand: 'STEM', scheduleId: 'GONE' },
  ];
  const schedules = new Map([['AM', { id: 'AM', name: 'Morning Shift' }]]);
  const counts = new Map([['a', { male: 21, female: 19, total: 40 }], ['e', { male: 5, female: 4, total: 10 }]]);
  const build = (grade, withCounts = counts) => gradeSummary({ grade, sections, counts: withCounts, schedules, schoolYear: YEAR });

  it('lists one grade and one school year in the order given', () => {
    expect(build(8).rows.map((row) => row.name)).toEqual(['Mabini', 'Rizal']);
  });

  it('carries the numbers and labels the table shows', () => {
    expect(build(8).rows[0]).toEqual({
      id: 'a', name: 'Mabini', strand: '', adviser: 'ANA CRUZ', schedule: 'Morning Shift', male: 21, female: 19, total: 40,
    });
  });

  it('lists a section nobody is enrolled in with zeros and blank labels', () => {
    expect(build(8).rows[1]).toEqual({ id: 'b', name: 'Rizal', strand: '', adviser: '', schedule: '', male: 0, female: 0, total: 0 });
  });

  it('totals the grade and reports learners without a recorded sex', () => {
    const summary = build(8, new Map([['a', { male: 2, female: 1, total: 4 }]]));
    expect(summary.totals).toEqual({ sections: 2, male: 2, female: 1, total: 4 });
    expect(summary.unknownSex).toBe(1);
  });

  it('shows strand for senior high and blanks a schedule that no longer exists', () => {
    const shs = build(11);
    expect(shs.hasStrand).toBe(true);
    expect(shs.rows[0]).toMatchObject({ strand: 'STEM', schedule: '' });
    expect(build(8).hasStrand).toBe(false);
  });

  it('returns an empty table for a grade without sections', () => {
    expect(build(10)).toMatchObject({ rows: [], totals: { sections: 0, male: 0, female: 0, total: 0 }, unknownSex: 0 });
  });
});

describe('gradeImageFilename', () => {
  it('names the file for the grade and school year', () => {
    expect(gradeImageFilename(8, '2026-2027')).toBe('BNHS-Grade-8-Sections-SY2026-2027.png');
    expect(gradeImageFilename('11', '2026-2027')).toBe('BNHS-Grade-11-Sections-SY2026-2027.png');
  });

  it('keeps odd characters out of the file name', () => {
    expect(gradeImageFilename(8, '2026/2027 "x"')).toBe('BNHS-Grade-8-Sections-SY20262027x.png');
  });
});
