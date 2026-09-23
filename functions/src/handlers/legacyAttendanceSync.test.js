import { describe, it, expect } from 'vitest';
import { detectLegacyScans, toScannedAt, toScanEventData, legacyEventId } from './legacyAttendanceSync.js';

const base = { sectionId: 'SEC1', date: '2026-09-23', schoolYear: '2026-2027' };

describe('toScannedAt', () => {
  it('reads a Manila wall-clock date+time pair (no DST to worry about)', () => {
    // 07:45 PHT = 23:45 UTC the previous day.
    expect(toScannedAt('2026-09-23', '07:45').toDate().toISOString()).toBe('2026-09-22T23:45:00.000Z');
  });
});

describe('detectLegacyScans', () => {
  it('returns nothing when there is no after (a delete)', () => {
    expect(detectLegacyScans({ before: { ...base, timeIn: { S1: '07:00' } }, after: null })).toEqual([]);
  });

  it('returns nothing when sectionId/date/schoolYear are missing (malformed doc)', () => {
    expect(detectLegacyScans({ before: null, after: { timeIn: { S1: '07:00' } } })).toEqual([]);
  });

  it('returns nothing for a staff attendance-marking write that never touches timeIn/timeOut', () => {
    const before = { ...base, marks: { S1: 'present' } };
    const after = { ...base, marks: { S1: 'present', S2: 'absent' } };
    expect(detectLegacyScans({ before, after })).toEqual([]);
  });

  it('detects a brand-new timeIn entry on a doc with no prior timeIn map', () => {
    const after = { ...base, timeIn: { S1: '07:12' } };
    expect(detectLegacyScans({ before: null, after })).toEqual([
      { studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'in', scannedDate: '2026-09-23', scannedTime: '07:12' },
    ]);
  });

  it('detects only the newly-added student when another was already recorded', () => {
    const before = { ...base, timeIn: { S1: '07:12' } };
    const after = { ...base, timeIn: { S1: '07:12', S2: '07:15' } };
    expect(detectLegacyScans({ before, after })).toEqual([
      { studentId: 'S2', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'in', scannedDate: '2026-09-23', scannedTime: '07:15' },
    ]);
  });

  it('detects both an in and an out on the same write', () => {
    const before = { ...base, timeIn: { S1: '07:12' } };
    const after = { ...base, timeIn: { S1: '07:12' }, timeOut: { S1: '16:30' } };
    expect(detectLegacyScans({ before, after })).toEqual([
      { studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'out', scannedDate: '2026-09-23', scannedTime: '16:30' },
    ]);
  });

  it('treats a changed value (a correction) as a new scan', () => {
    const before = { ...base, timeIn: { S1: '07:12' } };
    const after = { ...base, timeIn: { S1: '07:05' } };
    expect(detectLegacyScans({ before, after })).toEqual([
      { studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'in', scannedDate: '2026-09-23', scannedTime: '07:05' },
    ]);
  });

  it('is a no-op when timeIn/timeOut are unchanged', () => {
    const before = { ...base, timeIn: { S1: '07:12' }, timeOut: { S1: '16:30' } };
    const after = { ...base, timeIn: { S1: '07:12' }, timeOut: { S1: '16:30' }, updatedAt: '2026-09-23' };
    expect(detectLegacyScans({ before, after })).toEqual([]);
  });
});

describe('legacyEventId', () => {
  it('is stable for the same scan and distinct across kind/date/student', () => {
    const scan = { sectionId: 'SEC1', scannedDate: '2026-09-23', studentId: 'S1', kind: 'in' };
    expect(legacyEventId(scan)).toBe('legacy_SEC1_2026-09-23_S1_in');
    expect(legacyEventId(scan)).toBe(legacyEventId({ ...scan }));
    expect(legacyEventId({ ...scan, kind: 'out' })).not.toBe(legacyEventId(scan));
  });
});

describe('toScanEventData', () => {
  it('builds a scan_events-shaped record with the attendance-sync identity', () => {
    const scan = { studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'in', scannedDate: '2026-09-23', scannedTime: '07:12' };
    const receivedAt = toScannedAt('2026-09-23', '07:12');
    const data = toScanEventData(scan, receivedAt);
    expect(data).toMatchObject({
      studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'in',
      deviceId: 'attendance-sync', source: 'attendance-sync', scannedDate: '2026-09-23', scannedTime: '07:12', receivedAt,
    });
    expect(data.scannedAt.toDate().toISOString()).toBe('2026-09-22T23:12:00.000Z');
  });
});
