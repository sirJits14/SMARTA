import { describe, it, expect, beforeEach } from 'vitest';
import { db, auth, clearAll, clearAllAuthUsers, seedSchool } from './helpers.js';
import { requestAccess, resolveAccessRequest, revokeLink, setActivationRestricted } from '../../src/handlers/links.js';
import { registerKiosk, deactivateKiosk, provisionKiosk, resetKioskPassword } from '../../src/handlers/kiosks.js';

const NOW = new Date('2026-09-21T08:00:00+08:00');
const staff = () => ({ db: db(), now: () => NOW, uid: 'staff1', email: 'registrar@bnhs.edu' });
const guardian = (uid = 'gNew') => ({ db: db(), now: () => NOW, uid, email: `${uid}@gmail.com`, displayName: 'Maria' });
const req = { studentLrn: '100000000001', learnerNameTyped: 'Ana Cruz', relationship: 'Guardian', contactNumber: '09171234567', message: 'Lost slip' };

beforeEach(async () => { await clearAll(); await clearAllAuthUsers(); await seedSchool(); await db().doc('users/registrar@bnhs.edu').set({ role: 'registrar' }); });

describe('access requests', () => {
  it('creates an open request; max 3 open per guardian', async () => {
    const { id } = await requestAccess(guardian(), req);
    expect((await db().doc(`access_requests/${id}`).get()).data()).toMatchObject({ guardianUid: 'gNew', guardianEmail: 'gNew@gmail.com', studentLrn: '100000000001', status: 'open' });
    await requestAccess(guardian(), req); await requestAccess(guardian(), req);
    await expect(requestAccess(guardian(), req)).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
  it('approval creates the link via staff and a system inbox item; denial records a note', async () => {
    const { id } = await requestAccess(guardian(), req);
    await resolveAccessRequest(staff(), { id, approve: true, studentId: 'S1', note: 'ID checked' });
    expect((await db().doc('guardian_links/gNew_S1').get()).data()).toMatchObject({ status: 'active', activatedVia: 'staff', relationship: 'Guardian' });
    expect((await db().doc(`access_requests/${id}`).get()).data()).toMatchObject({ status: 'approved', resolvedBy: 'registrar@bnhs.edu' });
    const inbox = await db().collection('guardians/gNew/inbox').get();
    expect(inbox.docs[0].data()).toMatchObject({ type: 'system', pushStatus: 'skipped_suppressed' });

    const { id: id2 } = await requestAccess(guardian('g2'), req);
    await resolveAccessRequest(staff(), { id: id2, approve: false, note: 'Not on record' });
    expect((await db().doc(`access_requests/${id2}`).get()).data().status).toBe('denied');
    expect((await db().doc('guardian_links/g2_S1').get()).exists).toBe(false);
  });
});

describe('revokeLink / restricted', () => {
  it('revokes with reason and audits', async () => {
    await revokeLink(staff(), { linkId: 'gA_S1', reason: 'Custody order' });
    expect((await db().doc('guardian_links/gA_S1').get()).data()).toMatchObject({ status: 'revoked', revokedBy: 'registrar@bnhs.edu', revokedReason: 'Custody order' });
    expect((await db().collection('audit_log').where('action', '==', 'link.revoked').get()).size).toBe(1);
  });
  it('restricting a learner revokes every active link and blocks slips', async () => {
    const r = await setActivationRestricted(staff(), { studentId: 'S1', restricted: true, reason: 'Court order' });
    expect(r.revokedLinks).toBe(2);
    expect((await db().doc('students/S1').get()).data().activationRestricted).toBe(true);
    expect((await db().doc('guardian_links/gB_S1').get()).data().status).toBe('revoked');
  });
});

describe('kiosks', () => {
  it('registers and deactivates a device with audit entries', async () => {
    await db().doc('kiosks/kNew').set({ label: 'Old Label', active: false });
    await registerKiosk(staff(), { uid: 'kNew', label: 'Gate 2' });
    expect((await db().doc('kiosks/kNew').get()).data()).toMatchObject({ label: 'Gate 2', active: true, createdBy: 'registrar@bnhs.edu' });
    await deactivateKiosk(staff(), { uid: 'kNew', reason: 'stolen' });
    expect((await db().doc('kiosks/kNew').get()).data().active).toBe(false);
    expect((await db().collection('audit_log').where('targetId', '==', 'kNew').get()).size).toBe(2);
  });

  it('rejects registering/reactivating a uid with no existing kiosks doc', async () => {
    await expect(registerKiosk(staff(), { uid: 'noSuchKiosk', label: 'Ghost Gate' })).rejects.toMatchObject({ code: 'not-found' });
    expect((await db().doc('kiosks/noSuchKiosk').get()).exists).toBe(false);
  });

  it('provisions a real Auth account and allow-lists it in one call', async () => {
    const result = await provisionKiosk({ ...staff(), auth: auth() }, { label: 'Side Gate' });
    expect(result.email).toBe('kiosk-side-gate@bnhs.local');
    expect(result.password.length).toBeGreaterThanOrEqual(20);

    const userRecord = await auth().getUser(result.uid);
    expect(userRecord.email).toBe('kiosk-side-gate@bnhs.local');
    expect((await db().doc(`kiosks/${result.uid}`).get()).data()).toMatchObject({ label: 'Side Gate', active: true, createdBy: 'registrar@bnhs.edu' });
    expect((await db().collection('audit_log').where('action', '==', 'kiosk.provisioned').get()).size).toBe(1);
  });

  it('assigns a new password to an existing device without changing its uid', async () => {
    const { uid, password: firstPassword } = await provisionKiosk({ ...staff(), auth: auth() }, { label: 'Back Gate' });
    const result = await resetKioskPassword({ ...staff(), auth: auth() }, { uid });

    expect(result.uid).toBe(uid);
    expect(result.email).toBe('kiosk-back-gate@bnhs.local');
    expect(result.password).not.toBe(firstPassword);
    expect((await db().collection('audit_log').where('action', '==', 'kiosk.password_reset').get()).size).toBe(1);
  });

  it('blocks the registerKiosk + resetKioskPassword account-takeover chain against a non-kiosk Auth account', async () => {
    await auth().createUser({ uid: 'nonKiosk1', email: 'guardian@gmail.com', password: 'whatever123' });

    // registerKiosk is reactivate-only (Fix B) so it can no longer allow-list a
    // brand-new uid on its own -- but that alone isn't the full story: a
    // kiosks/{uid} doc could already exist for a non-kiosk uid for other
    // reasons (a stale doc, manual data entry, ...), and registerKiosk will
    // then happily "reactivate" it under that uid, same as it always could.
    // resetKioskPassword's own Auth-domain check (Fix A) is what actually
    // closes the takeover, regardless of how the doc came to exist.
    await db().doc('kiosks/nonKiosk1').set({ label: 'stale', active: false });
    await registerKiosk(staff(), { uid: 'nonKiosk1', label: 'fake' });
    expect((await db().doc('kiosks/nonKiosk1').get()).data()).toMatchObject({ active: true });

    await expect(resetKioskPassword({ ...staff(), auth: auth() }, { uid: 'nonKiosk1' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
