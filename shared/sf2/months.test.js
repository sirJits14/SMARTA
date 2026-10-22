import { describe, expect, it } from 'vitest';
import { isSf2Month, sf2Months } from './months.js';

describe('sf2Months', () => {
  it('lists the school year up to today, newest first', () => {
    expect(sf2Months('2026-2027', '2026-10-22')).toEqual(['2026-10', '2026-09', '2026-08', '2026-07', '2026-06']);
  });
  it('waits for a month’s first weekday', () => {
    // 2026-11-01 is a Sunday; November's first weekday is Monday the 2nd.
    expect(sf2Months('2026-2027', '2026-11-01')[0]).toBe('2026-10');
    expect(sf2Months('2026-2027', '2026-11-02')[0]).toBe('2026-11');
  });
  it('covers June through May once the year is over', () => {
    const all = sf2Months('2026-2027', '2027-07-15');
    expect(all).toHaveLength(12);
    expect(all[0]).toBe('2027-05');
    expect(all.at(-1)).toBe('2026-06');
  });
  it('offers nothing before the school year starts or for malformed input', () => {
    expect(sf2Months('2026-2027', '2026-05-30')).toEqual([]);
    expect(sf2Months('2026-27', '2026-10-22')).toEqual([]);
    expect(sf2Months('2026-2028', '2026-10-22')).toEqual([]);
    expect(sf2Months('2026-2027', 'today')).toEqual([]);
    expect(sf2Months(undefined, '2026-10-22')).toEqual([]);
  });
  it('checks one month against the same rule', () => {
    expect(isSf2Month('2026-2027', '2026-10', '2026-10-22')).toBe(true);
    expect(isSf2Month('2026-2027', '2026-05', '2026-10-22')).toBe(false);
    expect(isSf2Month('2026-2027', '2026-11', '2026-10-22')).toBe(false);
    expect(isSf2Month('2026-2027', 'garbage', '2026-10-22')).toBe(false);
  });
});
