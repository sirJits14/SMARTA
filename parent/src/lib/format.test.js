import { describe, it, expect } from 'vitest';
import { eventTitle, initials, latestScanToday, nameCase } from './format.js';
describe('format', () => {
  it('builds initials from the first and last name, skipping suffixes', () => {
    expect(initials('Juan P. Dela Cruz Jr.')).toBe('JC');
    expect(initials('Maria Santos')).toBe('MS');
    expect(initials('Cher')).toBe('C');
    expect(initials('')).toBe('?');
    expect(initials('  maria   santos  ')).toBe('MS');
    expect(initials('juan dela cruz iii')).toBe('JC');
    expect(initials()).toBe('?');
  });
  it('titles events by kind/status', () => {
    expect(eventTitle({ kind: 'in', status: 'recorded' })).toBe('Entered school');
    expect(eventTitle({ kind: 'out', status: 'recorded' })).toBe('Left school');
  });
  it('shows only the most recent scan of today, including a stale summary from another day', () => {
    expect(latestScanToday({ date: '2026-09-21', status: 'in', events: [{ kind: 'in', time: '07:12' }] }, '2026-09-21')).toBe('Entered 07:12 AM');
    expect(latestScanToday({ date: '2026-09-21', status: 'out', events: [{ kind: 'in', time: '07:12' }, { kind: 'out', time: '16:05' }] }, '2026-09-21')).toBe('Left 04:05 PM');
    expect(latestScanToday({ date: '2026-09-21', status: 'in', events: [
      { kind: 'in', time: '07:12' }, { kind: 'out', time: '12:00' }, { kind: 'in', time: '12:45' },
    ] }, '2026-09-21')).toBe('Entered 12:45 PM');
    expect(latestScanToday({ date: '2026-09-21', status: 'out', events: [{ kind: 'out', time: '16:05' }] }, '2026-09-21')).toBe('Left 04:05 PM');
    expect(latestScanToday({ date: '2026-09-21', status: 'no_scan', events: [] }, '2026-09-21')).toBe('No entry recorded today');
    expect(latestScanToday({ date: '2026-09-20', status: 'out', events: [{ kind: 'in', time: '07:12' }, { kind: 'out', time: '16:05' }] }, '2026-09-21')).toBe('No entry recorded today');
    expect(latestScanToday(null, '2026-09-21')).toBe('No entry recorded today');
  });
  it('falls back to firstIn/lastOut for a summary written before per-day events were tracked', () => {
    expect(latestScanToday({ date: '2026-09-21', status: 'in', firstIn: { time: '07:12' }, lastOut: null }, '2026-09-21')).toBe('Entered 07:12 AM');
    expect(latestScanToday({ date: '2026-09-21', status: 'out', firstIn: { time: '07:12' }, lastOut: { time: '16:05' } }, '2026-09-21')).toBe('Left 04:05 PM');
    expect(latestScanToday({ date: '2026-09-21', status: 'out', firstIn: null, lastOut: { time: '16:05' } }, '2026-09-21')).toBe('Left 04:05 PM');
  });
});

describe('nameCase', () => {
  it('recases all-capital names from the registrar', () => {
    expect(nameCase('DELA CRUZ, ANA B.')).toBe('Dela Cruz, Ana B.');
    expect(nameCase('JUAN SANTOS DELA CRUZ JR.')).toBe('Juan Santos Dela Cruz Jr.');
    expect(nameCase('MA. CRISTINA SANTOS-VILLANUEVA')).toBe('Ma. Cristina Santos-Villanueva');
  });
  it('capitalizes after hyphens and apostrophes, and handles ñ', () => {
    expect(nameCase("O'NEIL, PEPE")).toBe("O'Neil, Pepe");
    expect(nameCase('NIÑO PEÑAFLOR')).toBe('Niño Peñaflor');
    expect(nameCase('ana lopez')).toBe('Ana Lopez');
  });
  it('keeps Roman numeral suffixes and single-letter initials in capitals', () => {
    expect(nameCase('JOSE RIZAL III')).toBe('Jose Rizal III');
    expect(nameCase('REYES II, PAOLO M.')).toBe('Reyes II, Paolo M.');
    expect(nameCase('IVAN LIM')).toBe('Ivan Lim');
    expect(nameCase('a. b. cruz')).toBe('A. B. Cruz');
  });
  it('leaves names that are already mixed case alone', () => {
    expect(nameCase('McDonald, Ana')).toBe('McDonald, Ana');
    expect(nameCase('Dela Cruz, Ana B.')).toBe('Dela Cruz, Ana B.');
  });
  it('passes non-strings through', () => {
    expect(nameCase(undefined)).toBe(undefined);
    expect(nameCase(null)).toBe(null);
  });
});
