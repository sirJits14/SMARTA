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
    const { id: named } = await requestAccess(guardian(), { ...req, guardianName: 'Maria Santos' });
    expect((await db().doc(`access_requests/${named}`).get()).data().guardianName).toBe('Maria Santos');
    await requestAccess(guardian(), req);
    await expect(requestAccess(guardian(), req)).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
  it('approval creates the link via staff and a system inbox item; denial records a note', async () => {
    const { id } = await requestAccess(guardian(), req);
    await resolveAccessRequest(staff(), { id, approve: true, studentId: 'S1', note: 'ID checked' });
    expect((await db().doc('guardian_links/gNew_S1').get()).data()).toMatchObject({ status: 'active', activatedVia: 'staff', relationship: 'Guardian', guardianName: 'Maria', guardianEmail: 'gNew@gmail.com', learnerName: 'Ana B. Cruz' });
    expect((await db().doc('learners/S1').get()).data()).toMatchObject({ displayName: 'Ana B. Cruz', sectionLabel: 'Grade 7 – Rizal' });
    expect((await db().doc('guardians/gNew').get()).data().displayName).toBe('Maria');
    expect((await db().doc(`access_requests/${id}`).get()).data()).toMatchObject({ status: 'approved', resolvedBy: 'registrar@bnhs.edu' });
    const inbox = await db().collection('guardians/gNew/inbox').get();
    expect(inbox.docs[0].data()).toMatchObject({ type: 'system', pushStatus: 'skipped_suppressed' });

    const { id: id2 } = await requestAccess(guardian('g2'), req);
    await resolveAccessRequest(staff(), { id: id2, approve: false, note: 'Not on record' });
    expect((await db().doc(`access_requests/${id2}`).get()).data().status).toBe('denied');
    expect((await db().doc('guardian_links/g2_S1').get()).exists).toBe(false);
  });
  it('approval gives a guardian with no prior profile their audience keys at once', async () => {
    const { id } = await requestAccess(guardian(), req);
    await resolveAccessRequest(staff(), { id, approve: true, studentId: 'S1', note: 'ID checked' });
    expect((await db().doc('guardians/gNew').get()).data().audienceKeys).toEqual(['all', 'g7']);
  });
  it('still approves when the audience refresh fails (the trigger and nightly job are the backstops)', async () => {
    // refreshGuardianAudience is the only approve-path code that queries guardian_links.
    const real = db();
    const flaky = new Proxy(real, {
      get(t, k) {
        if (k === 'collection') return (name) => { if (name === 'guardian_links') throw new Error('refresh unavailable'); return t.collection(name); };
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    const { id } = await requestAccess(guardian(), req);
    await expect(resolveAccessRequest({ ...staff(), db: flaky }, { id, approve: true, studentId: 'S1', note: 'ID checked' })).resolves.toEqual({ status: 'approved' });
    expect((await real.doc(`access_requests/${id}`).get()).data()).toMatchObject({ status: 'approved' });
    expect((await real.doc('guardian_links/gNew_S1').get()).data()).toMatchObject({ status: 'active' });
    const inbox = await real.collection('guardians/gNew/inbox').get();
    expect(inbox.docs[0].data()).toMatchObject({ type: 'system', title: 'Access approved' });
  });
});

describe('resolveAccessRequest over an expired adviser link', () => {
  it('reactivates the link as a guardian link and clears the expiry fields', async () => {
    await db().doc('guardian_links/gNew_S1').set({
      guardianUid: 'gNew', studentId: 'S1', status: 'expired', slot: 'adviser', relationship: 'Adviser',
      schoolYear: '2025-2026', expiredReason: 'school-year-ended', expiredAt: NOW,
    });
    const { id } = await requestAccess(guardian(), req);
    await resolveAccessRequest(staff(), { id, approve: true, studentId: 'S1', note: 'ID checked' });
    const link = (await db().doc('guardian_links/gNew_S1').get()).data();
    expect(link).toMatchObject({ status: 'active', slot: 'guardian', relationship: 'Guardian' });
    expect(link.expiredReason).toBeUndefined();
    expect(link.expiredAt).toBeUndefined();
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
  it('restricting a learner also revokes issued and exhausted slips', async () => {
    await db().doc('activation_codes/CA').set({ studentId: 'S1', schoolYear: '2026-2027', status: 'issued' });
    await db().doc('activation_codes/CB').set({ studentId: 'S1', schoolYear: '2026-2027', status: 'exhausted' });
    await setActivationRestricted(staff(), { studentId: 'S1', restricted: true, reason: 'Court order' });
    expect((await db().doc('activation_codes/CA').get()).data()).toMatchObject({ status: 'revoked', revokedReason: 'restricted' });
    expect((await db().doc('activation_codes/CB').get()).data()).toMatchObject({ status: 'revoked', revokedReason: 'restricted' });
  });
});

describe('kiosks', () => {
  it('registers and deactivates a device with audit entries', async () => {
    await auth().createUser({ uid: 'kNew', email: 'kiosk-gate2@bnhs.local', password: 'whatever123456' });
    await db().doc('kiosks/kNew').set({ label: 'Old Label', active: false });
    await registerKiosk({ ...staff(), auth: auth() }, { uid: 'kNew', label: 'Gate 2' });
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

  it('registerKiosk refuses to reactivate a kiosks doc that is not backed by a real kiosk-domain Auth account', async () => {
    await auth().createUser({ uid: 'nonKiosk1', email: 'guardian@gmail.com', password: 'whatever123' });
    // Simulates deactivateKiosk's upsert having created this doc for a
    // non-kiosk uid (a stale doc, manual data entry, or the upsert itself).
    await db().doc('kiosks/nonKiosk1').set({ label: 'stale', active: false });

    await expect(registerKiosk({ ...staff(), auth: auth() }, { uid: 'nonKiosk1', label: 'fake' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await db().doc('kiosks/nonKiosk1').get()).data().active).toBe(false);
  });

  it('resetKioskPassword independently blocks a non-kiosk Auth account even if its kiosks doc is somehow active', async () => {
    await auth().createUser({ uid: 'nonKiosk2', email: 'staffimposter@gmail.com', password: 'whatever123' });
    // Seeded directly (not via registerKiosk, which now refuses this) to
    // prove resetKioskPassword's own check is a real independent layer, not
    // just inert now that registerKiosk also blocks it.
    await db().doc('kiosks/nonKiosk2').set({ label: 'fake', active: true });

    await expect(resetKioskPassword({ ...staff(), auth: auth() }, { uid: 'nonKiosk2' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
