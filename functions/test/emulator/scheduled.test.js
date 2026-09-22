import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool, fakeMessaging, scanDoc, ts } from './helpers.js';
import { expireLinks, pruneDevices, reconcileEvents } from '../../src/handlers/scheduled.js';
import { auditSettingsChange } from '../../src/handlers/settingsAudit.js';
import { clearCache } from '../../src/cache.js';

const NOW = new Date('2026-09-21T02:00:00+08:00');
const DAY = 86400_000;
const deps = () => ({ db: db(), auth: { deleted: [], async deleteUser(u) { this.deleted.push(u); } }, messaging: fakeMessaging(), portalUrl: 'https://p.test', now: () => NOW });

beforeEach(async () => { await clearAll(); clearCache(); await seedSchool(); });

describe('expireLinks', () => {
  it('expires links whose learner is no longer enrolled this SY and notifies', async () => {
    await db().doc('enrollments/S1_2026-2027').set({ status: 'withdrawn' }, { merge: true });
    const r = await expireLinks(deps());
    expect(r.expired).toBe(2);
    expect((await db().doc('guardian_links/gA_S1').get()).data().status).toBe('expired');
    expect((await db().collection('guardians/gA/inbox').where('type', '==', 'system').get()).size).toBe(1);
  });
  it('deletes old revoked links, old codes, old audit rows, dormant guardians', async () => {
    await db().doc('guardian_links/gC_S1').set({ revokedAt: ts(NOW.getTime() - 400 * DAY) }, { merge: true });
    await db().doc('activation_codes/h1').set({ studentId: 'S1', schoolYear: '2024-2025', status: 'revoked', expiresAt: ts(NOW.getTime() - 400 * DAY) });
    await db().doc('audit_log/old').set({ action: 'x', at: ts(NOW.getTime() - 800 * DAY) });
    await db().doc('guardians/gOld').set({ email: 'old@x', lastActiveLinkAt: ts(NOW.getTime() - 400 * DAY) });
    const d = deps();
    await expireLinks(d);
    expect((await db().doc('guardian_links/gC_S1').get()).exists).toBe(false);
    expect((await db().doc('activation_codes/h1').get()).exists).toBe(false);
    expect((await db().doc('audit_log/old').get()).exists).toBe(false);
    expect((await db().doc('guardians/gOld').get()).exists).toBe(false);
    expect(d.auth.deleted).toEqual(['gOld']);
  });
  it('returns a zeroed result and does not throw when settings/app.currentSchoolYear is unset', async () => {
    await db().doc('settings/app').set({ currentSchoolYear: null }, { merge: true });
    const r = await expireLinks(deps());
    expect(r).toEqual({ expired: 0, oldRevoked: 0, oldExpired: 0, oldCodes: 0, oldAudit: 0, dormant: 0 });
  });
});

describe('pruneDevices (+ inbox/event retention)', () => {
  it('removes stale and long-disabled devices, old inbox items, old events, old scan_events, old resolved reports', async () => {
    await db().doc('guardians/gA/devices/tA1').set({ refreshedAt: ts(NOW.getTime() - 61 * DAY) }, { merge: true });
    await db().doc('guardians/gA/devices/tA2').set({ enabled: false, disabledAt: ts(NOW.getTime() - 8 * DAY) }, { merge: true });
    await db().doc('guardians/gA/inbox/old').set({ type: 'attendance', createdAt: ts(Date.parse('2025-05-01T00:00:00Z')) });
    await db().doc('guardians/gA/inbox/new').set({ type: 'attendance', createdAt: ts(NOW.getTime()) });
    await db().doc('learners/S1/events/old').set({ kind: 'in', scannedDate: '2025-05-30', effectiveAt: ts(0) });
    await db().doc('scan_events/old').set(scanDoc({ scannedDate: '2025-05-30' }));
    await db().doc('reports/r').set({ status: 'resolved', resolvedAt: ts(NOW.getTime() - 400 * DAY) });
    const r = await pruneDevices(deps());
    expect(r).toMatchObject({ devices: 2, inbox: 1, events: 1, scanEvents: 1, resolved: 1 });
    expect((await db().doc('guardians/gA/inbox/new').get()).exists).toBe(true);
  });
  it('returns a zeroed result and does not throw when settings/app.currentSchoolYear is unset', async () => {
    await db().doc('settings/app').set({ currentSchoolYear: null }, { merge: true });
    const r = await pruneDevices(deps());
    expect(r).toEqual({ devices: 0, inbox: 0, events: 0, scanEvents: 0, resolved: 0 });
  });
});

describe('reconcileEvents', () => {
  it('re-projects raw events that have no projection, without pushing', async () => {
    const d = deps();
    await db().doc('scan_events/k1_S1_202609200712').set(scanDoc({ scannedAt: ts('2026-09-20T07:12:00+08:00'), scannedDate: '2026-09-20', receivedAt: ts('2026-09-20T07:12:10+08:00') }));
    const r = await reconcileEvents(d);
    expect(r.missing).toBe(1);
    expect((await db().doc('learners/S1/events/k1_S1_202609200712').get()).exists).toBe(true);
    expect(d.messaging.sent).toHaveLength(0);
    expect((await reconcileEvents(d)).missing).toBe(0);
  });

  it('re-processes a raw event whose projection exists but fan-out never finished (partial failure); skips one whose fan-out completed', async () => {
    const d = deps();
    // Projection exists (its transaction committed) but fan-out was
    // interrupted before writing the fanOutDone marker -- this is the
    // "guardians never got their inbox entry" gap the marker closes. Shaped
    // to match the real `projected` object handleScanEvent's own
    // transaction writes (scanEvent.js), since reconcileEvents' reprocessing
    // run feeds these same docs straight into recomputeSummary.
    await db().doc('scan_events/k1_S1_202609200712').set(scanDoc({ scannedAt: ts('2026-09-20T07:12:00+08:00'), scannedDate: '2026-09-20', receivedAt: ts('2026-09-20T07:12:10+08:00') }));
    await db().doc('learners/S1/events/k1_S1_202609200712').set({ kind: 'in', scannedAt: ts('2026-09-20T07:12:00+08:00'), scannedDate: '2026-09-20', scannedTime: '07:12', receivedAt: ts('2026-09-20T07:12:10+08:00'), effectiveAt: ts('2026-09-20T07:12:00+08:00'), deviceLabel: 'Main Gate', status: 'recorded', delayedSync: false, clockSkew: false, source: 'kiosk' });

    await db().doc('scan_events/k1_S1_202609200800').set(scanDoc({ scannedAt: ts('2026-09-20T08:00:00+08:00'), scannedDate: '2026-09-20', scannedTime: '08:00', receivedAt: ts('2026-09-20T08:00:10+08:00') }));
    await db().doc('learners/S1/events/k1_S1_202609200800').set({ kind: 'in', scannedAt: ts('2026-09-20T08:00:00+08:00'), scannedDate: '2026-09-20', scannedTime: '08:00', receivedAt: ts('2026-09-20T08:00:10+08:00'), effectiveAt: ts('2026-09-20T08:00:00+08:00'), deviceLabel: 'Main Gate', status: 'recorded', delayedSync: false, clockSkew: false, source: 'kiosk', fanOutDone: true });

    const r = await reconcileEvents(d);
    expect(r.missing).toBe(1);
    expect((await db().doc('learners/S1/events/k1_S1_202609200712').get()).data().fanOutDone).toBe(true);
    expect((await db().doc('guardians/gA/inbox/k1_S1_202609200712').get()).exists).toBe(true);
    expect((await db().doc('guardians/gA/inbox/k1_S1_202609200800').get()).exists).toBe(false);
    expect(d.messaging.sent).toHaveLength(0);
  });
});

describe('auditSettingsChange', () => {
  it('records before/after for the pause switch', async () => {
    await auditSettingsChange(db(), { before: { notificationsPaused: false }, after: { notificationsPaused: true, pausedBy: 'registrar@bnhs.edu', pauseNote: 'Drill' } });
    const rows = await db().collection('audit_log').where('action', '==', 'portal.settings_changed').get();
    expect(rows.docs[0].data().details).toMatchObject({ before: { notificationsPaused: false }, after: { notificationsPaused: true, pausedBy: 'registrar@bnhs.edu', pauseNote: 'Drill' } });
  });
});
