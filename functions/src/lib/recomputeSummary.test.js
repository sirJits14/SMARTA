import { describe, it, expect } from 'vitest';
import { recomputeSummary } from './recomputeSummary.js';
const ev = (id, kind, date, time, ms, status = 'recorded') => ({ id, kind, scannedDate: date, scannedTime: time, effectiveAtMs: ms, status });

describe('recomputeSummary', () => {
  it('no events today', () => {
    const r = recomputeSummary({ events: [ev('a', 'in', '2026-09-20', '07:00', 1)], todayDate: '2026-09-21' });
    expect(r.today).toEqual({ date: '2026-09-21', firstIn: null, lastOut: null, status: 'no_scan', events: [] });
    expect(r.recent).toHaveLength(1);
  });
  it('first in and last out win; status follows the latest event', () => {
    const r = recomputeSummary({ events: [
      ev('in2', 'in', '2026-09-21', '07:30', 30), ev('in1', 'in', '2026-09-21', '07:12', 12),
      ev('out1', 'out', '2026-09-21', '12:00', 120), ev('out2', 'out', '2026-09-21', '16:05', 165),
    ], todayDate: '2026-09-21' });
    expect(r.today.firstIn).toEqual({ time: '07:12', eventId: 'in1' });
    expect(r.today.lastOut).toEqual({ time: '16:05', eventId: 'out2' });
    expect(r.today.status).toBe('out');
  });
  it('ignores voided events and caps recent at the limit, newest first', () => {
    const events = Array.from({ length: 15 }, (_, i) => ev(`e${i}`, 'in', '2026-09-21', '07:00', i));
    events[14].status = 'voided';
    const r = recomputeSummary({ events, todayDate: '2026-09-21', recentLimit: 10 });
    expect(r.recent.map((e) => e.id)[0]).toBe('e13');
    expect(r.recent).toHaveLength(10);
    expect(r.today.status).toBe('in');
  });
  it('out-of-order arrival does not matter: ordering is by effectiveAtMs', () => {
    const r = recomputeSummary({ events: [ev('late', 'in', '2026-09-21', '07:05', 5), ev('first', 'out', '2026-09-21', '16:00', 160)], todayDate: '2026-09-21' });
    expect(r.today.firstIn.eventId).toBe('late');
    expect(r.today.status).toBe('out');
    expect(r.today.events.map((e) => e.eventId)).toEqual(['late', 'first']);
  });

  it('lists every event of the day in chronological order, not just first-in/last-out', () => {
    const r = recomputeSummary({ events: [
      ev('in1', 'in', '2026-09-21', '07:12', 12),
      ev('out1', 'out', '2026-09-21', '12:00', 120),
      ev('in2', 'in', '2026-09-21', '12:45', 145),
      ev('out2', 'out', '2026-09-21', '16:05', 165),
    ], todayDate: '2026-09-21' });
    expect(r.today.events).toEqual([
      { kind: 'in', time: '07:12', eventId: 'in1' },
      { kind: 'out', time: '12:00', eventId: 'out1' },
      { kind: 'in', time: '12:45', eventId: 'in2' },
      { kind: 'out', time: '16:05', eventId: 'out2' },
    ]);
    expect(r.today.firstIn).toEqual({ time: '07:12', eventId: 'in1' });
    expect(r.today.lastOut).toEqual({ time: '16:05', eventId: 'out2' });
    expect(r.today.status).toBe('out');
  });

  it('excludes voided events from the day list, same as it already does for firstIn/lastOut', () => {
    const events = [ev('in1', 'in', '2026-09-21', '07:12', 12), ev('bad', 'in', '2026-09-21', '07:30', 30, 'voided')];
    const r = recomputeSummary({ events, todayDate: '2026-09-21' });
    expect(r.today.events).toEqual([{ kind: 'in', time: '07:12', eventId: 'in1' }]);
  });

  it('returns an empty events list when there is no scan today', () => {
    const r = recomputeSummary({ events: [ev('a', 'in', '2026-09-20', '07:00', 1)], todayDate: '2026-09-21' });
    expect(r.today.events).toEqual([]);
  });
});
