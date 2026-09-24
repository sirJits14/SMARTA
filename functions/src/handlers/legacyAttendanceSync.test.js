import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectLegacyScans, toScannedAt, toScanEventData, legacyEventId,
  MAX_SCANS_PER_WRITE, invalidScanReason, selectLegacyScans, isLegacyKioskWriter, handleLegacyAttendanceWrite,
} from './legacyAttendanceSync.js';
import { clearCache } from '../cache.js';
import { logWarn } from '../log.js';

// firebase-functions' logger captures its own console reference at load
// time (see test/emulator/scanEvent.test.js), so mock the module to observe
// logWarn calls.
vi.mock('../log.js', () => ({ logEvent: vi.fn(), logWarn: vi.fn() }));

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

  it('treats a changed value as a new tap by a learner who is already present, with its own event id', () => {
    const before = { ...base, timeIn: { S1: '07:12' }, timeOut: { S1: '12:00' } };
    const after = { ...base, timeIn: { S1: '07:12' }, timeOut: { S1: '16:05' } };
    const scans = detectLegacyScans({ before, after });
    expect(scans).toEqual([
      { studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'out', scannedDate: '2026-09-23', scannedTime: '16:05' },
    ]);
    // A different id from the earlier 12:00 tap: handleScanEvent adds it to
    // the day's timeline and fans out a new inbox item, instead of
    // overwriting the 12:00 event in place and skipping the inbox.
    expect(legacyEventId(scans[0])).not.toBe(legacyEventId({ ...scans[0], scannedTime: '12:00' }));
  });

  it('is a no-op when timeIn/timeOut are unchanged', () => {
    const before = { ...base, timeIn: { S1: '07:12' }, timeOut: { S1: '16:30' } };
    const after = { ...base, timeIn: { S1: '07:12' }, timeOut: { S1: '16:30' }, updatedAt: '2026-09-23' };
    expect(detectLegacyScans({ before, after })).toEqual([]);
  });
});

describe('legacyEventId', () => {
  it('is stable for the same scan and distinct across kind/date/student/time', () => {
    const scan = { sectionId: 'SEC1', scannedDate: '2026-09-23', studentId: 'S1', kind: 'in', scannedTime: '07:12' };
    expect(legacyEventId(scan)).toBe('legacy_SEC1_2026-09-23_S1_in_0712');
    expect(legacyEventId(scan)).toBe(legacyEventId({ ...scan }));
    expect(legacyEventId({ ...scan, kind: 'out' })).not.toBe(legacyEventId(scan));
    expect(legacyEventId({ ...scan, scannedDate: '2026-09-24' })).not.toBe(legacyEventId(scan));
    expect(legacyEventId({ ...scan, studentId: 'S2' })).not.toBe(legacyEventId(scan));
    expect(legacyEventId({ ...scan, scannedTime: '07:45' })).not.toBe(legacyEventId(scan));
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

const scan = (over = {}) => ({ studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'in', scannedDate: '2026-09-23', scannedTime: '07:12', ...over });

describe('invalidScanReason', () => {
  it('accepts a well-formed scan', () => {
    expect(invalidScanReason(scan())).toBeNull();
    expect(invalidScanReason(scan({ scannedTime: '00:00' }))).toBeNull();
    expect(invalidScanReason(scan({ scannedTime: '23:59', studentId: 'a_B-9' }))).toBeNull();
  });

  it.each([
    ['studentId', { studentId: 'S/1' }],
    ['studentId', { studentId: '' }],
    ['studentId', { studentId: 'x'.repeat(129) }],
    ['sectionId', { sectionId: 'SEC 1' }],
    ['sectionId', { sectionId: 42 }],
    ['schoolYear', { schoolYear: '2026/2027' }],
    ['date', { scannedDate: '2026-9-23' }],
    ['date', { scannedDate: '23/09/2026' }],
    ['time', { scannedTime: '24:00' }],
    ['time', { scannedTime: '7:12' }],
    ['time', { scannedTime: '07:60' }],
    ['time', { scannedTime: '07:12 AM' }],
    ['time', { scannedTime: 712 }],
    ['time', { scannedTime: { h: 7 } }],
  ])('flags %s for %j', (reason, over) => {
    expect(invalidScanReason(scan(over))).toBe(reason);
  });
});

describe('selectLegacyScans', () => {
  const today = '2026-09-23';

  it('accepts valid scans for today', () => {
    const s = [scan(), scan({ studentId: 'S2', kind: 'out', scannedTime: '16:30' })];
    expect(selectLegacyScans(s, { today })).toEqual({ accepted: s, invalid: [], cappedCount: 0 });
  });

  it('reports invalid scans (studentId + reason only) and keeps the valid ones', () => {
    const good = scan({ studentId: 'S2' });
    const r = selectLegacyScans([scan({ scannedTime: 'garbage' }), good], { today });
    expect(r.accepted).toEqual([good]);
    expect(r.invalid).toEqual([{ studentId: 'S1', reason: 'time' }]);
  });

  it('silently drops scans for any date other than today (backfills/replays)', () => {
    const r = selectLegacyScans([scan({ scannedDate: '2026-09-22' }), scan({ scannedDate: '2026-02-31' })], { today });
    expect(r).toEqual({ accepted: [], invalid: [], cappedCount: 0 });
  });

  it('accepts exactly MAX_SCANS_PER_WRITE (20) scans', () => {
    expect(MAX_SCANS_PER_WRITE).toBe(20);
    const s = Array.from({ length: 20 }, (_, i) => scan({ studentId: `S${i}` }));
    expect(selectLegacyScans(s, { today })).toEqual({ accepted: s, invalid: [], cappedCount: 0 });
  });

  it('accepts none when more than MAX_SCANS_PER_WRITE new scans arrive in one write', () => {
    const s = Array.from({ length: 21 }, (_, i) => scan({ studentId: `S${i}` }));
    expect(selectLegacyScans(s, { today })).toEqual({ accepted: [], invalid: [], cappedCount: 21 });
  });
});

// Fake Admin SDK handles: kiosks maps uid -> kiosk doc data; users maps
// uid -> user record (providerData) or an Error to throw.
function fakes({ kiosks = {}, users = {} } = {}) {
  const reads = { kiosk: 0, user: 0 };
  const db = {
    doc(path) {
      const [col, id] = path.split('/');
      if (col !== 'kiosks') throw new Error(`unexpected doc ${path}`);
      return { get: async () => { reads.kiosk++; return { exists: id in kiosks, data: () => kiosks[id] }; } };
    },
  };
  const auth = {
    async getUser(uid) {
      reads.user++;
      const u = users[uid];
      if (u instanceof Error) throw u;
      if (!u) throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
      return u;
    },
  };
  return { db, auth, reads };
}
const ANON_USER = { uid: 'anonKiosk1', providerData: [] };
const EMAIL_USER = { uid: 'v2Kiosk1', providerData: [{ providerId: 'password', uid: 'kiosk@bnhs.edu' }] };

describe('isLegacyKioskWriter', () => {
  beforeEach(() => clearCache());

  it('allows a registered, active kiosk whose Auth account is anonymous', async () => {
    const f = fakes({ kiosks: { anonKiosk1: { active: true } }, users: { anonKiosk1: ANON_USER } });
    expect(await isLegacyKioskWriter({ db: f.db, auth: f.auth, authId: 'anonKiosk1' })).toBe(true);
  });

  it('rejects a write with no authId without any lookups', async () => {
    const f = fakes();
    expect(await isLegacyKioskWriter({ db: f.db, auth: f.auth, authId: undefined })).toBe(false);
    expect(f.reads).toEqual({ kiosk: 0, user: 0 });
  });

  it('rejects an authId that cannot be a kiosk doc id without lookups', async () => {
    const f = fakes();
    expect(await isLegacyKioskWriter({ db: f.db, auth: f.auth, authId: 'a/b' })).toBe(false);
    expect(await isLegacyKioskWriter({ db: f.db, auth: f.auth, authId: 'svc@proj.iam.gserviceaccount.com' })).toBe(false);
    expect(f.reads).toEqual({ kiosk: 0, user: 0 });
  });

  it('rejects an anonymous user with no kiosks/{uid} doc (the reported hole)', async () => {
    const f = fakes({ users: { anonKiosk1: ANON_USER } });
    expect(await isLegacyKioskWriter({ db: f.db, auth: f.auth, authId: 'anonKiosk1' })).toBe(false);
    expect(f.reads.user).toBe(0);
  });

  it('rejects an inactive kiosk', async () => {
    const f = fakes({ kiosks: { anonKiosk1: { active: false } }, users: { anonKiosk1: ANON_USER } });
    expect(await isLegacyKioskWriter({ db: f.db, auth: f.auth, authId: 'anonKiosk1' })).toBe(false);
  });

  it('rejects a registered v2 kiosk (email/password account) so its writes are not double-processed', async () => {
    const f = fakes({ kiosks: { v2Kiosk1: { active: true } }, users: { v2Kiosk1: EMAIL_USER } });
    expect(await isLegacyKioskWriter({ db: f.db, auth: f.auth, authId: 'v2Kiosk1' })).toBe(false);
  });

  it('rejects when the Auth user no longer exists', async () => {
    const f = fakes({ kiosks: { gone: { active: true } } });
    expect(await isLegacyKioskWriter({ db: f.db, auth: f.auth, authId: 'gone' })).toBe(false);
  });

  it('propagates other Auth errors so the trigger retries', async () => {
    const f = fakes({ kiosks: { anonKiosk1: { active: true } }, users: { anonKiosk1: new Error('auth backend unavailable') } });
    await expect(isLegacyKioskWriter({ db: f.db, auth: f.auth, authId: 'anonKiosk1' })).rejects.toThrow('auth backend unavailable');
  });

  it('caches both lookups per instance', async () => {
    const f = fakes({ kiosks: { anonKiosk1: { active: true } }, users: { anonKiosk1: ANON_USER } });
    await isLegacyKioskWriter({ db: f.db, auth: f.auth, authId: 'anonKiosk1' });
    await isLegacyKioskWriter({ db: f.db, auth: f.auth, authId: 'anonKiosk1' });
    expect(f.reads).toEqual({ kiosk: 1, user: 1 });
  });

  it('rejects a registered active kiosk whose Auth user has an email but no providers (email-only account)', async () => {
    const EMAIL_NO_PROVIDERS = { uid: 'kioskWithEmail', providerData: [], email: 'kiosk@example.com' };
    const f = fakes({ kiosks: { kioskWithEmail: { active: true } }, users: { kioskWithEmail: EMAIL_NO_PROVIDERS } });
    expect(await isLegacyKioskWriter({ db: f.db, auth: f.auth, authId: 'kioskWithEmail' })).toBe(false);
  });
});

describe('handleLegacyAttendanceWrite', () => {
  // 00:10Z = 08:10 in Manila on 2026-09-23.
  const EVENT_TIME = '2026-09-23T00:10:00.000Z';
  const registered = () => fakes({ kiosks: { anonKiosk1: { active: true } }, users: { anonKiosk1: ANON_USER } });
  const input = (over = {}) => ({
    docId: 'SEC1_2026-09-23', authType: 'unknown', authId: 'anonKiosk1', eventTime: EVENT_TIME,
    before: null, after: { ...base, timeIn: { S1: '07:12' } }, ...over,
  });
  const run = (f, processScan, over) => handleLegacyAttendanceWrite({ db: f.db, auth: f.auth, processScan }, input(over));

  beforeEach(() => { clearCache(); vi.mocked(logWarn).mockClear(); });

  it('does no lookups and logs nothing when the write carries no new scans (e.g. staff marks)', async () => {
    const f = fakes();
    const processScan = vi.fn();
    const r = await run(f, processScan, { authId: 'staff1', after: { ...base, marks: { S1: 'P' } } });
    expect(r.outcome).toBe('no-scans');
    expect(f.reads).toEqual({ kiosk: 0, user: 0 });
    expect(processScan).not.toHaveBeenCalled();
    expect(logWarn).not.toHaveBeenCalled();
  });

  it('drops a write from an unregistered anonymous user and logs its uid (and nothing from the doc)', async () => {
    const f = fakes({ users: { intruder: ANON_USER } });
    const processScan = vi.fn();
    const r = await run(f, processScan, { authId: 'intruder' });
    expect(r.outcome).toBe('rejected:writer');
    expect(processScan).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith('legacy_scan_unregistered_writer', { authId: 'intruder', authType: 'unknown', docId: 'SEC1_2026-09-23' });
  });

  it('drops a write with no authId (unauthenticated / system)', async () => {
    const f = registered();
    const processScan = vi.fn();
    const r = await run(f, processScan, { authId: undefined, authType: 'unauthenticated' });
    expect(r.outcome).toBe('rejected:writer');
    expect(processScan).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith('legacy_scan_unregistered_writer', { authId: undefined, authType: 'unauthenticated', docId: 'SEC1_2026-09-23' });
  });

  it('processes a registered anonymous kiosk write with a receivedAt taken from the event time (stable across retries)', async () => {
    const f = registered();
    const processScan = vi.fn(async () => {});
    const r = await run(f, processScan);
    expect(r).toEqual({ outcome: 'processed', processed: 1 });
    expect(processScan).toHaveBeenCalledTimes(1);
    const [eventId, data] = processScan.mock.calls[0];
    expect(eventId).toBe('legacy_SEC1_2026-09-23_S1_in_0712');
    expect(data).toMatchObject({ studentId: 'S1', kind: 'in', source: 'attendance-sync', scannedTime: '07:12' });
    expect(data.receivedAt.toDate().toISOString()).toBe(EVENT_TIME);

    await run(f, processScan);
    expect(processScan.mock.calls[1][1].receivedAt.isEqual(data.receivedAt)).toBe(true);
  });

  it('skips and logs invalid scans (docId + studentId + reason only) and processes the rest', async () => {
    const f = registered();
    const processScan = vi.fn(async () => {});
    const r = await run(f, processScan, { after: { ...base, timeIn: { S1: '7:12 AM', S2: '07:15' } } });
    expect(r).toEqual({ outcome: 'processed', processed: 1 });
    expect(processScan.mock.calls.map((c) => c[0])).toEqual(['legacy_SEC1_2026-09-23_S2_in_0715']);
    expect(logWarn).toHaveBeenCalledWith('legacy_scan_invalid', { docId: 'SEC1_2026-09-23', studentId: 'S1', reason: 'time' });
  });

  it('ignores scans on a doc for a date other than the event day (backfill)', async () => {
    const f = registered();
    const processScan = vi.fn(async () => {});
    const r = await run(f, processScan, { after: { ...base, date: '2026-09-01', timeIn: { S1: '07:12' } } });
    expect(r).toEqual({ outcome: 'processed', processed: 0 });
    expect(processScan).not.toHaveBeenCalled();
  });

  it('processes none and logs when a write carries more than MAX_SCANS_PER_WRITE new scans', async () => {
    const f = registered();
    const processScan = vi.fn(async () => {});
    const timeIn = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`S${i}`, '07:12']));
    const r = await run(f, processScan, { after: { ...base, timeIn } });
    expect(r.outcome).toBe('capped');
    expect(processScan).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith('legacy_scan_cap', { docId: 'SEC1_2026-09-23', count: 21 });
  });

  it('keeps going after one scan throws, then rethrows so the trigger retries', async () => {
    const f = registered();
    const processScan = vi.fn(async (eventId) => { if (eventId.includes('_S1_')) throw new Error('transient'); });
    await expect(run(f, processScan, { after: { ...base, timeIn: { S1: '07:12', S2: '07:15' } } })).rejects.toThrow('transient');
    expect(processScan.mock.calls.map((c) => c[0])).toEqual(['legacy_SEC1_2026-09-23_S1_in_0712', 'legacy_SEC1_2026-09-23_S2_in_0715']);
  });
});
