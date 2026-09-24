import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAuth } from 'firebase-admin/auth';
import { app, db, clearAll, seedSchool, fakeMessaging } from './helpers.js';
import { isLegacyKioskWriter, handleLegacyAttendanceWrite } from '../../src/handlers/legacyAttendanceSync.js';
import { handleScanEvent, clearDeviceRate } from '../../src/handlers/scanEvent.js';
import { clearCache } from '../../src/cache.js';

// See scanEvent.test.js for why log.js is mocked rather than console.
vi.mock('../../src/log.js', () => ({ logEvent: vi.fn(), logWarn: vi.fn() }));

// Requires the Auth emulator (npm run test:functions starts firestore,auth).
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!AUTH_HOST) throw new Error('Run via: npm run test:functions (auth emulator required)');
const PROJECT = process.env.GCLOUD_PROJECT;
const auth = () => getAuth(app());

async function clearAuth() {
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}
// A real anonymous sign-in, the same way kiosk v1 signs in (signInAnonymously).
async function signUpAnonymous() {
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
  });
  return (await res.json()).localId;
}

// 00:12:30Z = 08:12:30 in Manila on 2026-09-21.
const EVENT_TIME = '2026-09-21T00:12:30.000Z';
const NOW = () => new Date(EVENT_TIME);
const write = (authId) => ({
  docId: 'SEC1_2026-09-21', authId, authType: 'unknown', eventTime: EVENT_TIME,
  before: null, after: { sectionId: 'SEC1', date: '2026-09-21', schoolYear: '2026-2027', timeIn: { S1: '08:12' } },
});
const bridge = (messaging = fakeMessaging()) => ({
  db: db(), auth: auth(),
  processScan: (eventId, data) => handleScanEvent({ db: db(), messaging, portalUrl: 'https://p.test', now: NOW }, { eventId, data }),
});
const legacyEvent = () => db().doc('learners/S1/events/legacy_SEC1_2026-09-21_S1_in').get();

beforeEach(async () => { await clearAll(); await clearAuth(); clearCache(); clearDeviceRate(); await seedSchool(); });

describe('isLegacyKioskWriter (Auth emulator)', () => {
  it('allows a registered active kiosk signed in anonymously', async () => {
    const uid = await signUpAnonymous();
    await db().doc(`kiosks/${uid}`).set({ label: 'Gate v1', active: true });
    expect(await isLegacyKioskWriter({ db: db(), auth: auth(), authId: uid })).toBe(true);
  });

  it('rejects an anonymous user that is not registered', async () => {
    const uid = await signUpAnonymous();
    expect(await isLegacyKioskWriter({ db: db(), auth: auth(), authId: uid })).toBe(false);
  });

  it('rejects a registered email/password (v2) kiosk account', async () => {
    const { uid } = await auth().createUser({ email: 'kiosk-gate1@bnhs.edu', password: 'secret123' });
    await db().doc(`kiosks/${uid}`).set({ label: 'Gate v2', active: true });
    expect(await isLegacyKioskWriter({ db: db(), auth: auth(), authId: uid })).toBe(false);
  });

  it('rejects a registered kiosk doc whose Auth user does not exist', async () => {
    await db().doc('kiosks/ghostKiosk').set({ label: 'Ghost', active: true });
    expect(await isLegacyKioskWriter({ db: db(), auth: auth(), authId: 'ghostKiosk' })).toBe(false);
  });
});

describe('handleLegacyAttendanceWrite (end to end)', () => {
  it('bridges a registered anonymous kiosk write into a learner event', async () => {
    const uid = await signUpAnonymous();
    await db().doc(`kiosks/${uid}`).set({ label: 'Gate v1', active: true });
    const r = await handleLegacyAttendanceWrite(bridge(), write(uid));
    expect(r).toEqual({ outcome: 'processed', processed: 1 });
    const ev = (await legacyEvent()).data();
    expect(ev).toMatchObject({ kind: 'in', scannedDate: '2026-09-21', scannedTime: '08:12', source: 'attendance-sync' });
    expect(ev.receivedAt.toDate().toISOString()).toBe(EVENT_TIME);
  });

  it('creates nothing for an unregistered anonymous writer (the reported hole)', async () => {
    const uid = await signUpAnonymous();
    const m = fakeMessaging();
    const r = await handleLegacyAttendanceWrite(bridge(m), write(uid));
    expect(r.outcome).toBe('rejected:writer');
    expect((await legacyEvent()).exists).toBe(false);
    expect((await db().doc('guardians/gA/inbox/legacy_SEC1_2026-09-21_S1_in').get()).exists).toBe(false);
    expect(m.sent).toHaveLength(0);
  });
});
