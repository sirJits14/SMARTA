import { describe, it, expect, beforeEach } from 'vitest';
import { db, auth, clearAll, clearAllAuthUsers } from './helpers.js';
import { createStaffUser, updateStaffUser, setStaffUserDisabled, resetStaffPassword, deleteStaffUser, changeOwnPassword } from '../../src/handlers/users.js';

const ADMIN = 'registrar@bnhs.edu';
const ctx = (email = ADMIN, uid = 'adminUid') => ({ db: db(), auth: auth(), email, uid });
const profile = async (email) => (await db().doc(`users/${email}`).get()).data();
const auditActions = async () => (await db().collection('audit_log').get()).docs.map((d) => d.data().action);
const glc8 = { name: 'Ana Cruz', email: 'Glc8@bnhs.edu', role: 'glc', gradeLevel: 8 };

beforeEach(async () => {
  await clearAll(); await clearAllAuthUsers();
  // Legacy hand-made profile: role 'registrar', no uid.
  await db().doc(`users/${ADMIN}`).set({ name: 'Registrar', role: 'registrar' });
});

describe('createStaffUser', () => {
  it('creates the login and profile and returns the password once', async () => {
    const r = await createStaffUser(ctx(), glc8);
    expect(r.email).toBe('glc8@bnhs.edu');
    expect(r.password).toHaveLength(24);
    const user = await auth().getUserByEmail('glc8@bnhs.edu');
    expect(user.displayName).toBe('Ana Cruz');
    expect(await profile('glc8@bnhs.edu')).toMatchObject({ name: 'Ana Cruz', role: 'glc', gradeLevel: 8, disabled: false, mustChangePassword: true, uid: user.uid, createdBy: ADMIN });
    const log = (await db().collection('audit_log').get()).docs.map((d) => d.data());
    expect(log).toEqual([expect.objectContaining({ action: 'staff.created', actorUid: ADMIN, targetId: 'glc8@bnhs.edu', details: { role: 'glc', gradeLevel: 8 } })]);
    expect(JSON.stringify(log)).not.toContain(r.password);
  });
  it('creates academic coordinators without a grade', async () => {
    await createStaffUser(ctx(), { name: 'Ben Dy', email: 'jhs@bnhs.edu', role: 'jhs_coord' });
    expect(await profile('jhs@bnhs.edu')).toMatchObject({ role: 'jhs_coord', gradeLevel: null });
  });
  it('rejects duplicates and bad role/grade combinations', async () => {
    await expect(createStaffUser(ctx(), { ...glc8, email: ADMIN })).rejects.toMatchObject({ code: 'already-exists' });
    await createStaffUser(ctx(), glc8);
    await expect(createStaffUser(ctx(), glc8)).rejects.toMatchObject({ code: 'already-exists', message: 'An account with this email already exists.' });
    await expect(createStaffUser(ctx(), { ...glc8, email: 'x@bnhs.edu', gradeLevel: undefined })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(createStaffUser(ctx(), { ...glc8, email: 'y@bnhs.edu', role: 'shs_coord' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('updateStaffUser', () => {
  beforeEach(async () => { await createStaffUser(ctx(), glc8); });
  it('moves a glc to another grade', async () => {
    await updateStaffUser(ctx(), { email: 'glc8@bnhs.edu', gradeLevel: 9 });
    expect(await profile('glc8@bnhs.edu')).toMatchObject({ role: 'glc', gradeLevel: 9 });
  });
  it('clears the grade when the role changes away from glc', async () => {
    await updateStaffUser(ctx(), { email: 'glc8@bnhs.edu', role: 'shs_coord' });
    expect(await profile('glc8@bnhs.edu')).toMatchObject({ role: 'shs_coord', gradeLevel: null });
    expect(await auditActions()).toContain('staff.updated');
  });
  it('lets an admin rename but not re-role themselves', async () => {
    await updateStaffUser(ctx(), { email: ADMIN, name: 'Head Registrar' });
    expect(await profile(ADMIN)).toMatchObject({ name: 'Head Registrar', role: 'admin' });
    await expect(updateStaffUser(ctx(), { email: ADMIN, role: 'jhs_coord' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('refuses to demote the last active admin', async () => {
    // A caller who has since lost admin (the race the transaction guards).
    await expect(updateStaffUser(ctx('ghost@bnhs.edu'), { email: ADMIN, role: 'jhs_coord' }))
      .rejects.toMatchObject({ code: 'failed-precondition', message: 'At least one active Administrator is required.' });
  });
});

describe('setStaffUserDisabled', () => {
  beforeEach(async () => { await createStaffUser(ctx(), glc8); });
  it('disables and re-enables both the login and the profile', async () => {
    await setStaffUserDisabled(ctx(), { email: 'glc8@bnhs.edu', disabled: true });
    expect((await auth().getUserByEmail('glc8@bnhs.edu')).disabled).toBe(true);
    expect((await profile('glc8@bnhs.edu')).disabled).toBe(true);
    await setStaffUserDisabled(ctx(), { email: 'glc8@bnhs.edu', disabled: false });
    expect((await auth().getUserByEmail('glc8@bnhs.edu')).disabled).toBe(false);
    expect(await auditActions()).toEqual(expect.arrayContaining(['staff.disabled', 'staff.enabled']));
  });
  it('refuses self-disable and disabling the last admin', async () => {
    await expect(setStaffUserDisabled(ctx(), { email: ADMIN, disabled: true })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(setStaffUserDisabled(ctx('ghost@bnhs.edu'), { email: ADMIN, disabled: true })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('resetStaffPassword / changeOwnPassword', () => {
  it('issues a new password, forces a change, and the change clears the flag', async () => {
    const created = await createStaffUser(ctx(), glc8);
    const uid = (await auth().getUserByEmail('glc8@bnhs.edu')).uid;
    await changeOwnPassword({ ...ctx('glc8@bnhs.edu', uid) }, { newPassword: 'a-new-password' });
    expect((await profile('glc8@bnhs.edu')).mustChangePassword).toBe(false);
    const reset = await resetStaffPassword(ctx(), { email: 'glc8@bnhs.edu' });
    expect(reset.password).not.toBe(created.password);
    expect((await profile('glc8@bnhs.edu')).mustChangePassword).toBe(true);
    expect(await auditActions()).toEqual(expect.arrayContaining(['staff.password_changed', 'staff.password_reset']));
  });
  it('refuses a self reset and a short new password', async () => {
    await expect(resetStaffPassword(ctx(), { email: ADMIN })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(changeOwnPassword(ctx(), { newPassword: 'short' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('deleteStaffUser', () => {
  it('removes the profile and the login, keeping the audit trail', async () => {
    await createStaffUser(ctx(), glc8);
    await deleteStaffUser(ctx(), { email: 'glc8@bnhs.edu' });
    expect((await db().doc('users/glc8@bnhs.edu').get()).exists).toBe(false);
    await expect(auth().getUserByEmail('glc8@bnhs.edu')).rejects.toMatchObject({ code: 'auth/user-not-found' });
    expect(await auditActions()).toEqual(expect.arrayContaining(['staff.created', 'staff.deleted']));
  });
  it('deletes a legacy profile that has no login', async () => {
    await db().doc('users/old@bnhs.edu').set({ name: 'Old', role: 'registrar' });
    await deleteStaffUser(ctx(), { email: 'old@bnhs.edu' });
    expect((await db().doc('users/old@bnhs.edu').get()).exists).toBe(false);
  });
  it('refuses self-delete and deleting the last admin', async () => {
    await expect(deleteStaffUser(ctx(), { email: ADMIN })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(deleteStaffUser(ctx('ghost@bnhs.edu'), { email: ADMIN })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
