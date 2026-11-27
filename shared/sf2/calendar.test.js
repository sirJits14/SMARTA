import { describe, expect, it } from 'vitest';
import { firstFridayOfJune, monthLabel, schoolDaysInMonth } from './calendar.js';
import * as simsDates from '../../src/lib/dates.js';

describe('SF2 calendar helpers', () => {
  it('lists the weekdays of a month', () => {
    const days = schoolDaysInMonth(2026, 10);
    expect(days).toHaveLength(22);
    expect(days[0]).toBe('2026-10-01');
    expect(days.at(-1)).toBe('2026-10-30');
    expect(days).not.toContain('2026-10-03'); // a Saturday
  });
  it('labels a month in English', () => {
    expect(monthLabel('2026-10')).toBe('October 2026');
  });
  it('finds the first Friday of June', () => {
    expect(firstFridayOfJune('2026-2027')).toBe('2026-06-05');
    expect(firstFridayOfJune('2027-2028')).toBe('2027-06-04');
    expect(firstFridayOfJune('2028-2029')).toBe('2028-06-02');
  });
  it('agrees with the SIMS copies in src/lib/dates.js', () => {
    for (const [year, month] of [[2026, 6], [2026, 9], [2026, 12], [2027, 2], [2027, 5]]) {
      expect(schoolDaysInMonth(year, month)).toEqual(simsDates.schoolDaysInMonth(year, month));
    }
    for (const ym of ['2026-06', '2026-12', '2027-03']) expect(monthLabel(ym)).toBe(simsDates.monthLabel(ym));
  });
});
