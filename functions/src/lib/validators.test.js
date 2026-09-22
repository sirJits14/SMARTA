import { describe, it, expect } from 'vitest';
import { str, oneOf, lrn, bool, int, hhmm, ymd } from './validators.js';
describe('validators', () => {
  it('str trims and bounds', () => {
    expect(str('  hi ', { name: 'x', max: 5 })).toBe('hi');
    expect(() => str('toolong', { name: 'x', max: 3 })).toThrow(/x/);
    expect(() => str(5, { name: 'x' })).toThrow();
    expect(() => str('', { name: 'x', min: 1 })).toThrow();
  });
  it('oneOf / bool / int', () => {
    expect(oneOf('in', ['in', 'out'], 'kind')).toBe('in');
    expect(() => oneOf('void', ['in', 'out'], 'kind')).toThrow(/kind/);
    expect(bool(true, 'b')).toBe(true); expect(() => bool('true', 'b')).toThrow();
    expect(int(3, { name: 'n', min: 1, max: 5 })).toBe(3); expect(() => int(9, { name: 'n', min: 1, max: 5 })).toThrow();
  });
  it('lrn is exactly 12 digits', () => {
    expect(lrn('123456789012')).toBe('123456789012');
    expect(() => lrn('12345678901')).toThrow(); expect(() => lrn('12345678901a')).toThrow();
  });
  it('hhmm and ymd', () => {
    expect(hhmm('07:05', 't')).toBe('07:05'); expect(() => hhmm('7:05', 't')).toThrow(); expect(() => hhmm('25:00', 't')).toThrow();
    expect(ymd('2026-09-21', 'd')).toBe('2026-09-21'); expect(() => ymd('2026-9-21', 'd')).toThrow();
  });
});
