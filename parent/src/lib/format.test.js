import { describe, it, expect } from 'vitest';
import { groupByDate, eventTitle, latestScanToday } from './format.js';
describe('format', () => {
  it('groups newest-first by date with labels', () => {
    const g = groupByDate([{ id: 'a', scannedDate: '2026-09-21', kind: 'in' }, { id: 'b', scannedDate: '2026-09-20', kind: 'out' }, { id: 'c', scannedDate: '2026-09-21', kind: 'out' }]);
    expect(g.map((x) => x.date)).toEqual(['2026-09-21', '2026-09-20']);
    expect(g[0].label).toBe('Mon 21 Sep');
    expect(g[0].items.map((i) => i.id)).toEqual(['a', 'c']);
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
