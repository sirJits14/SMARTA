import { describe, it, expect } from 'vitest';
import { markFor, summarizeMonth, formatScanTime, pmDetails, hasPmData, scanTitle } from './attendance.js';

const docsByDate = {
  '2026-07-01': { marks: { s1:'A', s2:'L' } },
  '2026-07-02': { marks: { s1:'E' } }, // s2 unmarked ⇒ Present
};

describe('markFor', () => {
  it('defaults to Present when unmarked', () => expect(markFor(docsByDate, '2026-07-02', 's2')).toBe('P'));
  it('returns the stored code', () => {
    expect(markFor(docsByDate, '2026-07-01', 's1')).toBe('A');
    expect(markFor(docsByDate, '2026-07-01', 's2')).toBe('L');
  });
});

describe('summarizeMonth', () => {
  it('tallies present (P+L), absent, excused, and late sub-count', () => {
    const out = summarizeMonth({ roster:['s1','s2'], schoolDays:['2026-07-01','2026-07-02'], docsByDate });
    expect(out.s1).toEqual({ present:0, late:0, absent:1, excused:1 });
    expect(out.s2).toEqual({ present:2, late:1, absent:0, excused:0 }); // 07-01 L (present+late), 07-02 default P
  });
});

describe('formatScanTime', () => {
  it('formats a 24-hour HH:MM string as 12-hour with AM/PM', () => {
    expect(formatScanTime('06:05')).toBe('06:05 AM');
    expect(formatScanTime('13:45')).toBe('01:45 PM');
    expect(formatScanTime('00:00')).toBe('12:00 AM');
    expect(formatScanTime('12:00')).toBe('12:00 PM');
    expect(formatScanTime('23:59')).toBe('11:59 PM');
  });

  it('returns an em dash when no time is recorded', () => {
    expect(formatScanTime(undefined)).toBe('—');
    expect(formatScanTime(null)).toBe('—');
    expect(formatScanTime('')).toBe('—');
  });
});

describe('pmDetails', () => {
  const doc = { pmTimeIn: { s1: '13:15' }, pmTimeOut: { s1: '16:02' }, latePm: { s1: true }, absentAm: { s2: true } };
  it('reads one learner\'s afternoon taps and note labels', () => {
    expect(pmDetails(doc, 's1')).toEqual({ pmTimeIn: '13:15', pmTimeOut: '16:02', notes: ['Late PM'] });
    expect(pmDetails(doc, 's2')).toEqual({ pmTimeIn: undefined, pmTimeOut: undefined, notes: ['Absent AM'] });
  });
  it('orders Absent AM before Late PM', () => {
    expect(pmDetails({ latePm: { s1: true }, absentAm: { s1: true } }, 's1').notes).toEqual(['Absent AM', 'Late PM']);
  });
  it('is empty for a missing record', () => {
    expect(pmDetails(null, 's1')).toEqual({ pmTimeIn: undefined, pmTimeOut: undefined, notes: [] });
  });
});

describe('hasPmData', () => {
  it('is true only when some learner has afternoon data', () => {
    expect(hasPmData({ pmTimeIn: { s1: '13:00' } })).toBe(true);
    expect(hasPmData({ absentAm: { s1: true } })).toBe(true);
    expect(hasPmData({ timeIn: { s1: '07:00' }, pmTimeIn: {} })).toBe(false);
    expect(hasPmData(null)).toBe(false);
  });
});

describe('scanTitle', () => {
  it('keeps the single-session wording', () => {
    expect(scanTitle({ timeIn: { s1: '07:12' } }, 's1')).toBe('Time in: 07:12 AM  ·  Time out: —');
  });
  it('adds afternoon taps and notes', () => {
    expect(scanTitle({ timeIn: { s1: '07:55' }, timeOut: { s1: '12:05' }, pmTimeIn: { s1: '13:15' }, latePm: { s1: true } }, 's1'))
      .toBe('Time in: 07:55 AM  ·  Time out: 12:05 PM  ·  PM in: 01:15 PM  ·  PM out: —  ·  Late PM');
    expect(scanTitle({ pmTimeIn: { s1: '12:50' }, absentAm: { s1: true } }, 's1'))
      .toBe('PM in: 12:50 PM  ·  PM out: —  ·  Absent AM');
  });
  it('is undefined with nothing recorded', () => {
    expect(scanTitle({}, 's1')).toBeUndefined();
    expect(scanTitle(undefined, 's1')).toBeUndefined();
  });
});
