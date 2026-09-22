import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool, fakeMessaging, scanDoc } from './helpers.js';
import { handleScanEvent } from '../../src/handlers/scanEvent.js';
import { submitReport, resolveReport, correctEvent, addManualEvent } from '../../src/handlers/reports.js';
import { deleteGuardianAccount } from '../../src/handlers/account.js';
import { clearCache } from '../../src/cache.js';

const NOW = new Date('2026-09-21T09:00:00+08:00');
const staff = () => ({ db: db(), now: () => NOW, uid: 'staff1', email: 'registrar@bnhs.edu' });
const gA = () => ({ db: db(), now: () => NOW, uid: 'gA', email: 'a@x' });
const fakeAuth = () => ({ deleted: [], async deleteUser(uid) { this.deleted.push(uid); } });
const EV = 'k1_S1_202609210712';

beforeEach(async () => {
  await clearAll(); clearCache(); await seedSchool();
  await db().doc('users/registrar@bnhs.edu').set({ role: 'registrar' });
  await db().doc(`scan_events/${EV}`).set(scanDoc());
  await handleScanEvent({ db: db(), messaging: fakeMessaging(), portalUrl: 'https://p.test', now: () => NOW }, { eventId: EV, data: scanDoc() });
});

describe('reports', () => {
  it('linked guardian files a report on own learner; 5/day limit; unlinked learner refused', async () => {
    const { id } = await submitReport(gA(), { studentId: 'S1', eventId: EV, reason: 'wrong_time', message: 'She was late' });
    expect((await db().doc(`reports/${id}`).get()).data()).toMatchObject({ guardianUid: 'gA', studentId: 'S1', eventId: EV, reason: 'wrong_time', status: 'open' });
    await expect(submitReport(gA(), { studentId: 'S2', eventId: EV, reason: 'other', message: '' })).rejects.toMatchObject({ code: 'permission-denied' });
    for (let i = 0; i < 4; i++) await submitReport(gA(), { studentId: 'S1', eventId: EV, reason: 'other', message: '' });
    await expect(submitReport(gA(), { studentId: 'S1', eventId: EV, reason: 'other', message: '' })).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
  it('resolution notifies the guardian via a system inbox item', async () => {
    const { id } = await submitReport(gA(), { studentId: 'S1', eventId: EV, reason: 'wrong_time', message: '' });
    await resolveReport(staff(), { id, note: 'Checked the gate log; the time is correct.', action: 'none' });
    expect((await db().doc(`reports/${id}`).get()).data()).toMatchObject({ status: 'resolved', resolutionAction: 'none', resolvedBy: 'registrar@bnhs.edu' });
    const sys = (await db().collection('guardians/gA/inbox').where('type', '==', 'system').get()).docs[0].data();
    expect(sys.body).toContain('the time is correct');
    expect(JSON.stringify(sys)).not.toContain('registrar@bnhs.edu');
  });
});

describe('corrections', () => {
  it('correctEvent writes a staff void scan_event referencing the original', async () => {
    const { voidEventId } = await correctEvent(staff(), { studentId: 'S1', eventId: EV, reason: 'Borrowed ID' });
    const ev = (await db().doc(`scan_events/${voidEventId}`).get()).data();
    expect(ev).toMatchObject({ source: 'staff', kind: 'void', voidsEventId: EV, studentId: 'S1', sectionId: 'SEC1', note: 'Borrowed ID', createdBy: 'registrar@bnhs.edu', deviceId: 'staff' });
    expect(voidEventId.startsWith('staff_S1_')).toBe(true);
  });
  it('addManualEvent writes a staff in/out scan_event for a date and time', async () => {
    const { eventId } = await addManualEvent(staff(), { studentId: 'S1', kind: 'out', date: '2026-09-21', time: '16:05', reason: 'Kiosk was down' });
    const ev = (await db().doc(`scan_events/${eventId}`).get()).data();
    expect(ev).toMatchObject({ source: 'staff', kind: 'out', scannedDate: '2026-09-21', scannedTime: '16:05', note: 'Kiosk was down' });
    expect(ev.scannedAt.toDate().toISOString()).toBe('2026-09-21T08:05:00.000Z');
    await expect(addManualEvent(staff(), { studentId: 'S2', kind: 'in', date: '2026-09-21', time: '07:00', reason: 'x' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('deleteGuardianAccount', () => {
  it('revokes links, deletes profile/devices/inbox and the auth user; audit stays', async () => {
    const auth = fakeAuth();
    await deleteGuardianAccount({ ...gA(), auth }, {});
    expect((await db().doc('guardians/gA').get()).exists).toBe(false);
    expect((await db().collection('guardians/gA/devices').get()).size).toBe(0);
    expect((await db().collection('guardians/gA/inbox').get()).size).toBe(0);
    expect((await db().doc('guardian_links/gA_S1').get()).data().status).toBe('revoked');
    expect(auth.deleted).toEqual(['gA']);
    expect((await db().collection('audit_log').where('action', '==', 'guardian.deleted').get()).size).toBe(1);
  });
});
