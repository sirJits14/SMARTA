import { describe, it, expect } from 'vitest';
import { pad2, localDate, localMonth, schoolDaysInMonth, monthLabel, previousSchoolYear,
  addDays, isWeekend, weekdaysOf, schoolDaysToDate, shiftMonth, monthGrid, manilaDay, dayLabel } from './dates.js';

describe('dates', () => {
  it('pads single digits', () => { expect(pad2(7)).toBe('07'); expect(pad2(12)).toBe('12'); });

  it('formats a local date without UTC shift', () => {
    expect(localDate(new Date(2026, 6, 5))).toBe('2026-07-05'); // month index 6 = July
  });

  it('formats a local month', () => {
    expect(localMonth(new Date(2026, 6, 5))).toBe('2026-07');
  });

  it('lists weekdays of July 2026 (23 school days, excludes weekends)', () => {
    const days = schoolDaysInMonth(2026, 7);
    expect(days[0]).toBe('2026-07-01'); // Wed
    expect(days).not.toContain('2026-07-04'); // Sat
    expect(days).not.toContain('2026-07-05'); // Sun
    expect(days).toContain('2026-07-31');
    expect(days.length).toBe(23);
  });

  it('labels a month', () => { expect(monthLabel('2026-07')).toBe('July 2026'); });
});

describe('previousSchoolYear', () => {
  it('steps back one school year', () => {
    expect(previousSchoolYear('2026-2027')).toBe('2025-2026');
    expect(previousSchoolYear('2000-2001')).toBe('1999-2000');
  });
});

describe('dashboard calendar helpers', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('knows weekends', () => {
    expect(isWeekend('2026-07-25')).toBe(true);  // Sat
    expect(isWeekend('2026-07-26')).toBe(true);  // Sun
    expect(isWeekend('2026-07-24')).toBe(false); // Fri
  });

  it('lists Monday to Friday of the week, including from a weekend', () => {
    const week = ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24'];
    expect(weekdaysOf('2026-07-24')).toEqual(week);
    expect(weekdaysOf('2026-07-20')).toEqual(week);
    expect(weekdaysOf('2026-07-25')).toEqual(week);
    expect(weekdaysOf('2026-07-26')).toEqual(week);
  });

  it('lists the month’s school days up to a date', () => {
    expect(schoolDaysToDate('2026-07-03')).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(schoolDaysToDate('2026-07-05')).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
  });

  it('shifts months across years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('builds a Monday-first month grid', () => {
    const weeks = monthGrid('2026-07'); // 1 July 2026 is a Wednesday
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toEqual({ date: '2026-06-29', inMonth: false, weekend: false });
    expect(weeks[0][2]).toEqual({ date: '2026-07-01', inMonth: true, weekend: false });
    expect(weeks[0][5].weekend).toBe(true);
    expect(weeks[4][6]).toEqual({ date: '2026-08-02', inMonth: false, weekend: true });
  });

  it('buckets timestamps into Manila days around midnight', () => {
    expect(manilaDay(Date.UTC(2026, 10, 20, 15, 59))).toBe('2026-11-20'); // 23:59 Manila
    expect(manilaDay(Date.UTC(2026, 10, 20, 16, 30))).toBe('2026-11-21'); // 00:30 Manila
  });

  it('labels a day in en-PH', () => {
    expect(dayLabel('2026-11-20', { weekday: 'short' })).toBe('Fri');
  });
});
