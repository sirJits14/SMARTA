import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, clearAll, seedSchool, fakeMessaging, scanDoc, ts } from './helpers.js';
import { handleScanEvent, clearDeviceRate } from '../../src/handlers/scanEvent.js';
import { clearCache } from '../../src/cache.js';
import { logWarn } from '../../src/log.js';

// firebase-functions' logger.warn() writes via an UNPATCHED_CONSOLE
// reference it captures at ITS OWN module-load time (see
// node_modules/firebase-functions/lib/logger/common.js) specifically to
// survive third-party console monkey-patching -- which also defeats
// vi.spyOn(console, 'warn') here. Mocking this module directly (scoped to
// this test file only) is the reliable way to observe a logWarn call; no
// other test in this file asserts on log output, so this changes nothing
// for them.
vi.mock('../../src/log.js', () => ({ logEvent: vi.fn(), logWarn: vi.fn() }));

const NOW = () => new Date('2026-09-21T07:12:30+08:00');
const deps = (messaging = fakeMessaging()) => ({ db: db(), messaging, portalUrl: 'https://p.test', now: NOW });
const run = async (d, eventId, data, extra = {}) => {
  await db().doc(`scan_events/${eventId}`).set(data);
  return handleScanEvent(d, { eventId, data, ...extra });
};

beforeEach(async () => { await clearAll(); clearCache(); clearDeviceRate(); await seedSchool(); });

describe('handleScanEvent', () => {
  it('projects the event, updates the summary, fans out inbox items, pushes to enabled devices only', async () => {
    const m = fakeMessaging();
    const r = await run(deps(m), 'k1_S1_202609210712', scanDoc());
    expect(r.outcome).toBe('processed');

    const ev = (await db().doc('learners/S1/events/k1_S1_202609210712').get()).data();
    expect(ev).toMatchObject({ kind: 'in', scannedDate: '2026-09-21', scannedTime: '07:12', deviceLabel: 'Main Gate', status: 'recorded', delayedSync: false, clockSkew: false, source: 'kiosk', fanOutDone: true });

    const learner = (await db().doc('learners/S1').get()).data();
    expect(learner.displayName).toBe('Ana Cruz');
    expect(learner.sectionLabel).toBe('Grade 7 – Rizal');
    expect(learner.today).toMatchObject({ date: '2026-09-21', status: 'in', firstIn: { time: '07:12', eventId: 'k1_S1_202609210712' } });
    expect(learner.lastPush.kind).toBe('in');

    const inboxA = (await db().doc('guardians/gA/inbox/k1_S1_202609210712').get()).data();
    expect(inboxA).toMatchObject({ type: 'attendance', studentId: 'S1', learnerName: 'Ana Cruz', kind: 'in', scannedTime: '07:12', pushStatus: 'sent', deviceLabel: 'Main Gate' });
    const inboxB = (await db().doc('guardians/gB/inbox/k1_S1_202609210712').get()).data();
    expect(inboxB.pushStatus).toBe('skipped_disabled');
    expect((await db().doc('guardians/gC/inbox/k1_S1_202609210712').get()).exists).toBe(false);

    expect(m.sent).toHaveLength(1);
    expect(m.sent[0].tokens.sort()).toEqual(['tokA1', 'tokA2']);
    expect(m.sent[0].notification.body).toBe('BNHS recorded a new attendance event at Main Gate. Tap to view securely.');
  });

  it('is idempotent: re-running the same event sends nothing new', async () => {
    const m = fakeMessaging();
    await run(deps(m), 'k1_S1_202609210712', scanDoc());
    const r = await run(deps(m), 'k1_S1_202609210712', scanDoc());
    expect(r.outcome).toBe('processed');
    expect(m.sent).toHaveLength(1);
    expect((await db().collection('learners/S1/events').get()).size).toBe(1);
  });

  it('suppresses a same-kind push within 10 minutes but still records and inboxes', async () => {
    const m = fakeMessaging();
    await run(deps(m), 'k1_S1_202609210712', scanDoc());
    await run(deps(m), 'k1_S1_202609210715', scanDoc({ scannedAt: ts('2026-09-21T07:15:00+08:00'), scannedTime: '07:15', receivedAt: ts('2026-09-21T07:15:10+08:00') }));
    expect(m.sent).toHaveLength(1);
    expect((await db().doc('guardians/gA/inbox/k1_S1_202609210715').get()).data().pushStatus).toBe('skipped_suppressed');
    expect((await db().doc('learners/S1').get()).data().today.firstIn.time).toBe('07:12');
  });

  it('delayed sync: recorded with flag, no push', async () => {
    const m = fakeMessaging();
    await run(deps(m), 'k1_S1_202609210712', scanDoc({ receivedAt: ts('2026-09-21T10:00:00+08:00') }));
    expect(m.sent).toHaveLength(0);
    expect((await db().doc('learners/S1/events/k1_S1_202609210712').get()).data().delayedSync).toBe(true);
  });

  it('paused school-wide: inbox item skipped_paused, no push', async () => {
    await db().doc('settings/parent_portal').set({ notificationsPaused: true }, { merge: true });
    const m = fakeMessaging();
    await run(deps(m), 'k1_S1_202609210712', scanDoc());
    expect(m.sent).toHaveLength(0);
    expect((await db().doc('guardians/gA/inbox/k1_S1_202609210712').get()).data().pushStatus).toBe('skipped_paused');
  });

  it('rejects inactive device and unenrolled learner without projecting', async () => {
    expect((await run(deps(), 'k9_S1_202609210712', scanDoc({ deviceId: 'k9' }))).outcome).toBe('rejected:device');
    expect((await run(deps(), 'k1_S2_202609210712', scanDoc({ studentId: 'S2' }))).outcome).toBe('rejected:enrollment');
    expect((await db().collection('learners').get()).size).toBe(0);
  });

  it('dead token is deleted; other failures count up and disable at 5', async () => {
    await db().doc('guardians/gA/devices/tA2').set({ failureCount: 4 }, { merge: true });
    const m = fakeMessaging({ tokA1: 'messaging/registration-token-not-registered', tokA2: 'messaging/internal-error' });
    await run(deps(m), 'k1_S1_202609210712', scanDoc());
    expect((await db().doc('guardians/gA/devices/tA1').get()).exists).toBe(false);
    expect((await db().doc('guardians/gA/devices/tA2').get()).data()).toMatchObject({ failureCount: 5, enabled: false });
    expect((await db().doc('guardians/gA/inbox/k1_S1_202609210712').get()).data().pushStatus).toBe('failed');
  });

  it('TEMP(kiosk-v1-compat): attendance-sync source is treated as a device without needing a kiosks/{uid} doc', async () => {
    const m = fakeMessaging();
    const r = await run(deps(m), 'legacy_SEC1_2026-09-21_S1_in', {
      studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'in', deviceId: 'attendance-sync',
      scannedAt: ts('2026-09-21T07:12:00+08:00'), scannedDate: '2026-09-21', scannedTime: '07:12',
      receivedAt: ts('2026-09-21T07:12:20+08:00'), source: 'attendance-sync',
    });
    expect(r.outcome).toBe('processed');
    const ev = (await db().doc('learners/S1/events/legacy_SEC1_2026-09-21_S1_in').get()).data();
    expect(ev).toMatchObject({ deviceLabel: 'School gate', source: 'attendance-sync', status: 'recorded' });
    expect(m.sent).toHaveLength(1);
  });

  it('staff void marks the original voided and notifies', async () => {
    const m = fakeMessaging();
    await run(deps(m), 'k1_S1_202609210712', scanDoc());
    await run(deps(m), 'staff_S1_202609210900_void', {
      studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'void', voidsEventId: 'k1_S1_202609210712',
      note: 'Borrowed ID', createdBy: 'registrar@bnhs.edu', deviceId: 'staff', scannedAt: ts('2026-09-21T09:00:00+08:00'),
      scannedDate: '2026-09-21', scannedTime: '09:00', receivedAt: ts('2026-09-21T09:00:01+08:00'), source: 'staff',
    });
    const ev = (await db().doc('learners/S1/events/k1_S1_202609210712').get()).data();
    expect(ev).toMatchObject({ status: 'voided', voidReason: 'Borrowed ID' });
    expect((await db().doc('learners/S1').get()).data().today.status).toBe('no_scan');
    const inbox = (await db().doc('guardians/gA/inbox/staff_S1_202609210900_void').get()).data();
    expect(inbox).toMatchObject({ kind: 'void', eventId: 'k1_S1_202609210712' });
    expect(m.sent).toHaveLength(2);
  });

  it('suppressPush (reconcile) records without sending', async () => {
    const m = fakeMessaging();
    await run(deps(m), 'k1_S1_202609210712', scanDoc(), { suppressPush: true });
    expect(m.sent).toHaveLength(0);
    expect((await db().doc('guardians/gA/inbox/k1_S1_202609210712').get()).data().pushStatus).toBe('skipped_suppressed');
  });

  describe('device rate anomaly (spec §5)', () => {
    // These drive 60+ real handleScanEvent calls each (needed to actually
    // cross the per-minute threshold end-to-end through the emulator), well
    // past vitest's 5s default per-test timeout. logWarn itself is mocked
    // at the top of this file (see the vi.mock comment above) -- reading
    // straight from the imported logWarn is simpler and more reliable than
    // spying on console/stdio, which firebase-functions' logger bypasses.
    const anomalies = () => logWarn.mock.calls.filter(([event]) => event === 'device_rate_anomaly').map(([, fields]) => fields);

    it('warns once a single device exceeds 60 processed events within the same minute bucket', async () => {
      logWarn.mockClear();
      const d = deps();
      for (let i = 0; i < 61; i++) await run(d, 'k1_S1_202609210712', scanDoc());
      expect(anomalies()[0]).toMatchObject({ deviceId: 'k1', count: 61 });
    }, 30000);

    it('does not warn at or under the 60/minute threshold', async () => {
      logWarn.mockClear();
      const d = deps();
      for (let i = 0; i < 60; i++) await run(d, 'k1_S1_202609210712', scanDoc());
      expect(anomalies()).toEqual([]);
    }, 30000);

    it('staff-source events (no physical kiosk device) are never counted', async () => {
      logWarn.mockClear();
      const d = deps();
      for (let i = 0; i < 61; i++) {
        await run(d, `staff_S1_${i}`, { studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'in', deviceId: 'staff', scannedAt: ts('2026-09-21T09:00:00+08:00'), scannedDate: '2026-09-21', scannedTime: '09:00', receivedAt: ts('2026-09-21T09:00:01+08:00'), source: 'staff' });
      }
      expect(anomalies()).toEqual([]);
    }, 30000);
  });
});
