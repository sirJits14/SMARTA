import { describe, it, expect } from 'vitest';
import { recomputeSummary } from './recomputeSummary.js';
const ev = (id, kind, date, time, ms, status = 'recorded') => ({ id, kind, scannedDate: date, scannedTime: time, effectiveAtMs: ms, status });

describe('recomputeSummary', () => {
  it('no events today', () => {
    const r = recomputeSummary({ events: [ev('a', 'in', '2026-09-20', '07:00', 1)], todayDate: '2026-09-21' });
    expect(r.today).toEqual({ date: '2026-09-21', firstIn: null, lastOut: null, status: 'no_scan' });
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
  });
});
