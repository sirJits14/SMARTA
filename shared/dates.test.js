import { describe, it, expect } from 'vitest';
import {
  pad2, localDate, localTime, currentSchoolYear, previousSchoolYear,
  schoolYearStartDate, manilaDate, manilaTime, formatScanTime, formatDateLabel, compactStamp,
} from './dates.js';

describe('shared/dates', () => {
  it('pads', () => { expect(pad2(7)).toBe('07'); expect(pad2(12)).toBe('12'); });

  it('localDate / localTime use the local clock', () => {
    const d = new Date(2026, 8, 21, 7, 5);
    expect(localDate(d)).toBe('2026-09-21');
    expect(localTime(d)).toBe('07:05');
    expect(compactStamp(d)).toBe('202609210705');
  });

  it('school year runs June to March', () => {
    expect(currentSchoolYear(new Date(2026, 5, 1))).toBe('2026-2027');
    expect(currentSchoolYear(new Date(2027, 2, 31))).toBe('2026-2027');
    expect(previousSchoolYear('2026-2027')).toBe('2025-2026');
    expect(schoolYearStartDate('2026-2027')).toBe('2026-06-01');
  });

  it('manila helpers ignore the process timezone', () => {
    const utc = new Date(Date.UTC(2026, 8, 20, 23, 12)); // 07:12 Manila next day
    expect(manilaDate(utc)).toBe('2026-09-21');
    expect(manilaTime(utc)).toBe('07:12');
  });

  it('formats times and dates for parents', () => {
    expect(formatScanTime('07:12')).toBe('07:12 AM');
    expect(formatScanTime('16:05')).toBe('04:05 PM');
    expect(formatScanTime('')).toBe('—');
    expect(formatDateLabel('2026-09-21')).toBe('Mon 21 Sep');
  });
});
