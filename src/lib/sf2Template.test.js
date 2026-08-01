import { describe, it, expect } from 'vitest';
import { markChar, splitByGender, dailyPresentCount, rowsFor, dailyTallies, summaryFigures, mondayFirstOrder } from './sf2Template.js';

describe('markChar', () => {
  it('maps each internal code to its SF2 letter', () => {
    expect(markChar('P')).toBe('');
    expect(markChar('A')).toBe('X');
    expect(markChar('L')).toBe('L');
    expect(markChar('E')).toBe('E');
  });
});

describe('splitByGender', () => {
  it('splits and sorts each group by last name then first name', () => {
    const roster = [
      { id: '1', lastName: 'Zamora', firstName: 'Ana', sex: 'F' },
      { id: '2', lastName: 'Bautista', firstName: 'Andres', sex: 'M' },
      { id: '3', lastName: 'Abella', firstName: 'Ben', sex: 'M' },
      { id: '4', lastName: 'Cruz', firstName: 'Bea', sex: 'F' },
    ];
    const { male, female } = splitByGender(roster);
    expect(male.map((s) => s.id)).toEqual(['3', '2']); // Abella before Bautista
    expect(female.map((s) => s.id)).toEqual(['4', '1']); // Cruz before Zamora
  });

  it('treats missing/other sex values as male (matches depedSort convention)', () => {
    const roster = [{ id: '1', lastName: 'A', firstName: 'A', sex: undefined }];
    const { male, female } = splitByGender(roster);
    expect(male.map((s) => s.id)).toEqual(['1']);
    expect(female).toEqual([]);
  });
});

const docsByDate = {
  '2026-07-01': { marks: { s1: 'A', s2: 'L', s3: 'P' } },
  '2026-07-02': { marks: { s1: 'P', s2: 'E' } }, // s3 unmarked ⇒ Present
};

describe('dailyPresentCount', () => {
  it('counts Present and Late as present, excludes Absent and Excused', () => {
    const students = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
    expect(dailyPresentCount(students, '2026-07-01', docsByDate)).toBe(2); // s2 (L) + s3 (P)
    expect(dailyPresentCount(students, '2026-07-02', docsByDate)).toBe(2); // s1 (P) + s3 (default P)
  });
});

describe('rowsFor', () => {
  it('builds one row per student with mark letters and monthly totals', () => {
    const students = [{ id: 's1', lastName: 'One', firstName: 'A', sex: 'M' }];
    const schoolDays = ['2026-07-01', '2026-07-02'];
    const rows = rowsFor(students, schoolDays, docsByDate);
    expect(rows).toHaveLength(1);
    expect(rows[0].marks).toEqual(['X', '']); // A on day1, P (default) on day2
    expect(rows[0].absentTotal).toBe(1);
    expect(rows[0].tardyTotal).toBe(0);
  });
});

describe('dailyTallies', () => {
  it('returns the present count for each school day in order', () => {
    const students = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
    const schoolDays = ['2026-07-01', '2026-07-02'];
    expect(dailyTallies(students, schoolDays, docsByDate)).toEqual([2, 2]);
  });
});

describe('mondayFirstOrder', () => {
  it('rotates the day list so it starts at the first Monday, wrapping earlier days to the end', () => {
    // July 2026: 1=Wed, 2=Thu, 3=Fri, 6=Mon, 7=Tue
    const schoolDays = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-06', '2026-07-07'];
    expect(mondayFirstOrder(schoolDays)).toEqual([
      '2026-07-06', '2026-07-07', '2026-07-01', '2026-07-02', '2026-07-03',
    ]);
  });

  it('leaves the list unchanged when it already starts on a Monday', () => {
    const schoolDays = ['2026-07-06', '2026-07-07', '2026-07-08'];
    expect(mondayFirstOrder(schoolDays)).toEqual(['2026-07-06', '2026-07-07', '2026-07-08']);
  });

  it('returns an empty array unchanged', () => {
    expect(mondayFirstOrder([])).toEqual([]);
  });

  it('leaves the list unchanged if no day in it is a Monday (defensive -- not reachable via real school-day data)', () => {
    const schoolDays = ['2026-07-01']; // a single Wednesday
    expect(mondayFirstOrder(schoolDays)).toEqual(['2026-07-01']);
  });
});

describe('summaryFigures', () => {
  it('computes enrolment %, average daily attendance, and attendance %', () => {
    const result = summaryFigures({
      enrolledAsOfCutoff: 40,
      registeredEndOfMonth: 38,
      dailyTalliesCombined: [36, 37, 35],
      schoolDays: ['2026-07-01', '2026-07-02', '2026-07-03'],
    });
    expect(result.percentEnrolment).toBe(95); // 38/40*100
    expect(result.avgDailyAttendance).toBeCloseTo(36, 1); // (36+37+35)/3
    expect(result.percentAttendance).toBeCloseTo(94.7, 1); // 36/38*100
  });

  it('is zero-safe when a denominator is zero', () => {
    expect(summaryFigures({ enrolledAsOfCutoff: 0, registeredEndOfMonth: 0, dailyTalliesCombined: [], schoolDays: [] }))
      .toEqual({ percentEnrolment: 0, avgDailyAttendance: 0, percentAttendance: 0 });
  });
});
