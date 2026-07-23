import { describe, it, expect } from 'vitest';
import { pad2, localDate, localMonth, schoolDaysInMonth, monthLabel } from './dates.js';

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
