import { describe, it, expect } from 'vitest';
import { itemMoment, dayLabel, toFeed, stackDay, historyThread } from './thread.js';

const ts = (iso) => ({ toDate: () => new Date(iso), toMillis: () => Date.parse(iso) });
const att = (over) => ({ type: 'attendance', studentId: 'S1', learnerName: 'Ana Cruz', kind: 'in', scannedDate: '2026-09-23', scannedTime: '07:12', createdAt: ts('2026-09-23T07:12:30+08:00'), ...over });

describe('itemMoment', () => {
  it('uses the scan date/time for attendance items', () => {
    expect(itemMoment(att({ scannedDate: '2026-09-22', scannedTime: '16:30' }))).toEqual({ date: '2026-09-22', time: '16:30' });
  });
  it('reads system items from createdAt in Manila time', () => {
    // 17:30 UTC on the 22nd is 01:30 on the 23rd in Manila.
    expect(itemMoment({ type: 'system', createdAt: ts('2026-09-22T17:30:00Z') })).toEqual({ date: '2026-09-23', time: '01:30' });
  });
  it('treats a not-yet-resolved server timestamp as now', () => {
    expect(itemMoment({ type: 'system', createdAt: null }, new Date('2026-09-23T02:00:00Z'))).toEqual({ date: '2026-09-23', time: '10:00' });
  });
});

describe('dayLabel', () => {
  it('says Today and Yesterday, otherwise the short date', () => {
    expect(dayLabel('2026-09-23', '2026-09-23')).toBe('Today');
    expect(dayLabel('2026-09-22', '2026-09-23')).toBe('Yesterday');
    expect(dayLabel('2026-09-21', '2026-09-23')).toBe('Mon 21 Sep');
  });
  it('knows yesterday across a month boundary', () => {
    expect(dayLabel('2026-09-30', '2026-10-01')).toBe('Yesterday');
  });
});

describe('toFeed', () => {
  it('orders days and messages oldest to newest, newest last (like a text thread)', () => {
    const feed = toFeed([
      att({ id: 'c', scannedDate: '2026-09-23', scannedTime: '16:30', kind: 'out' }),
      att({ id: 'b', scannedDate: '2026-09-23', scannedTime: '07:12' }),
      att({ id: 'a', scannedDate: '2026-09-22', scannedTime: '07:05' }),
    ], '2026-09-23');
    expect(feed.map((d) => d.date)).toEqual(['2026-09-22', '2026-09-23']);
    expect(feed.map((d) => d.label)).toEqual(['Yesterday', 'Today']);
    expect(feed[1].runs[0].items.map((i) => i.id)).toEqual(['b', 'c']);
    expect(feed[1].runs[0].items.map((i) => i.time)).toEqual(['07:12', '16:30']);
  });

  it('stacks back-to-back messages about the same learner into one run', () => {
    const feed = toFeed([
      att({ id: 'a1', scannedTime: '07:10' }),
      att({ id: 'a2', scannedTime: '16:30', kind: 'out' }),
    ], '2026-09-23');
    expect(feed[0].runs).toHaveLength(1);
    expect(feed[0].runs[0]).toMatchObject({ key: 'S1', studentId: 'S1', learnerName: 'Ana Cruz' });
    expect(feed[0].runs[0].items.map((i) => i.id)).toEqual(['a1', 'a2']);
  });

  it('starts a new run when a different learner interrupts', () => {
    const feed = toFeed([
      att({ id: 'a1', scannedTime: '07:10' }),
      att({ id: 'b1', studentId: 'S2', learnerName: 'Ben Dy', scannedTime: '07:11' }),
      att({ id: 'a2', scannedTime: '07:12' }),
    ], '2026-09-23');
    expect(feed[0].runs.map((r) => r.key)).toEqual(['S1', 'S2', 'S1']);
  });

  it('puts school messages with no learner in their own run with no learner name', () => {
    const feed = toFeed([
      { id: 's1', type: 'system', title: 'New school year', body: 'Please re-link.', studentId: null, createdAt: ts('2026-09-23T08:00:00+08:00') },
    ], '2026-09-23');
    expect(feed[0].runs[0]).toMatchObject({ key: 'school', studentId: null, learnerName: null });
  });

  it('keeps a learner-scoped school message in that learner\'s run and borrows the name', () => {
    const feed = toFeed([
      { id: 's1', type: 'system', title: 'Access approved', body: '...', studentId: 'S1', createdAt: ts('2026-09-23T07:00:00+08:00') },
      att({ id: 'a1', scannedTime: '07:12' }),
    ], '2026-09-23');
    expect(feed[0].runs).toHaveLength(1);
    expect(feed[0].runs[0].learnerName).toBe('Ana Cruz');
  });

  it('returns an empty feed for no items', () => {
    expect(toFeed([], '2026-09-23')).toEqual([]);
  });
});

describe('stackDay', () => {
  it('orders a day\'s scans by time ascending without mutating the input', () => {
    const input = [{ id: 'out', scannedTime: '16:30' }, { id: 'in', scannedTime: '07:12' }];
    expect(stackDay(input).map((e) => e.id)).toEqual(['in', 'out']);
    expect(input.map((e) => e.id)).toEqual(['out', 'in']);
  });
  it('breaks same-minute ties by effectiveAt', () => {
    const e = (id, iso) => ({ id, scannedTime: '07:12', effectiveAt: ts(iso) });
    expect(stackDay([e('second', '2026-09-23T07:12:40+08:00'), e('first', '2026-09-23T07:12:05+08:00')]).map((x) => x.id)).toEqual(['first', 'second']);
  });
});

describe('historyThread', () => {
  it('reads like a text thread: days oldest -> newest, scans oldest -> newest within a day', () => {
    // Firestore hands History its page newest-first.
    const page = [
      { id: 'd2-out', scannedDate: '2026-09-23', scannedTime: '16:05' },
      { id: 'd2-in', scannedDate: '2026-09-23', scannedTime: '07:12' },
      { id: 'd1-out', scannedDate: '2026-09-22', scannedTime: '16:03' },
      { id: 'd0-in', scannedDate: '2026-09-21', scannedTime: '07:40' },
    ];
    const days = historyThread(page, '2026-09-23');
    expect(days.map((d) => d.label)).toEqual(['Mon 21 Sep', 'Yesterday', 'Today']);
    expect(days.map((d) => d.items.map((e) => e.id))).toEqual([['d0-in'], ['d1-out'], ['d2-in', 'd2-out']]);
  });
  it('is empty for no scans', () => {
    expect(historyThread([], '2026-09-23')).toEqual([]);
  });
});
