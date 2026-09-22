import { describe, it, expect } from 'vitest';
import { groupByDate, eventTitle, describeToday } from './format.js';
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
  it('describes today honestly, including a stale summary from another day', () => {
    expect(describeToday({ date: '2026-09-21', firstIn: { time: '07:12' }, lastOut: null, status: 'in' }, '2026-09-21')).toEqual({ entered: 'Entered 07:12 AM', left: 'No exit recorded yet' });
    expect(describeToday({ date: '2026-09-20', firstIn: { time: '07:12' }, lastOut: { time: '16:05' }, status: 'out' }, '2026-09-21')).toEqual({ entered: 'No entry recorded today', left: null });
    expect(describeToday(null, '2026-09-21')).toEqual({ entered: 'No entry recorded today', left: null });
  });
});
