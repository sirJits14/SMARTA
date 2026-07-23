import { describe, it, expect } from 'vitest';
import { markFor, summarizeMonth } from './attendance.js';

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
