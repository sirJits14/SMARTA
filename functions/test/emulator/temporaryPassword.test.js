import { describe, it, expect, beforeEach } from 'vitest';
import { db, auth, clearAll, clearAllAuthUsers } from './helpers.js';
import { createStaffUser, resetStaffPassword, changeOwnPassword } from '../../src/handlers/users.js';
import { createStaffUserFn, announcementAudienceCountFn, changeOwnPasswordFn, acceptConsentFn } from '../../index.js';

const EMAIL = 'temporary@bnhs.edu';
const admin = () => ({ db: db(), auth: auth(), email: 'admin@bnhs.edu', uid: 'admin' });
const request = (uid, data = {}, authTime = Math.floor(Date.now() / 1000) + 5) => ({
  app: { appId: 'local-test' }, auth: { uid, token: { email: EMAIL, email_verified: true, auth_time: authTime, firebase: { sign_in_provider: 'password' } } }, data,
});
let uid;
let temporaryPassword;
const login = async password => {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-test`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password, returnSecureToken: true }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Local sign-in failed');
  const token = await auth().verifyIdToken(result.idToken);
  return { app: { appId: 'local-test' }, auth: { uid: token.uid, token }, data: {} };
};
const waitForFreshLogin = async () => {
  const p = (await db().doc(`users/${EMAIL}`).get()).data();
  const delay = p.sessionValidAfter * 1000 + 100 - Date.now();
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
};
beforeEach(async () => {
  await clearAll();
  await clearAllAuthUsers();
  temporaryPassword = (await createStaffUser(admin(), { name: 'Temporary Staff', email: EMAIL, role: 'admin' })).password;
  uid = (await auth().getUserByEmail(EMAIL)).uid;
});

describe('temporary-password callable enforcement', () => {
  it('blocks administrative operations before handler side effects', async () => {
    await expect(createStaffUserFn.run(request(uid, { name: 'Bypass', email: 'bypass@bnhs.edu', role: 'admin' })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect((await db().doc('users/bypass@bnhs.edu').get()).exists).toBe(false);
    await expect(auth().getUserByEmail('bypass@bnhs.edu')).rejects.toMatchObject({ code: 'auth/user-not-found' });
  });
  it('blocks ordinary staff operations', async () => {
    await expect(announcementAudienceCountFn.run(request(uid, { audienceKeys: ['all'] })))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('blocks guardian callables for the same verified temporary-password account', async () => {
    await db().doc(`guardians/${uid}`).set({ email: EMAIL, consentVersion: 0 });
    await db().doc('settings/parent_portal').set({ consentVersion: 1 });
    await expect(acceptConsentFn.run(request(uid, { version: 1 }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect((await db().doc(`guardians/${uid}`).get()).data().consentVersion).toBe(0);
  });
  it('allows the password-change callable and restores normal permissions after a fresh sign-in', async () => {
    const temporary = await login(temporaryPassword);
    await expect(changeOwnPasswordFn.run({ ...temporary, data: { newPassword: 'new-personal-password' } })).resolves.toMatchObject({ ok: true });
    const profile = (await db().doc(`users/${EMAIL}`).get()).data();
    expect(profile.mustChangePassword).toBe(false);
    expect(profile.sessionValidAfter).toBeGreaterThan(0);
    await waitForFreshLogin();
    const fresh = await login('new-personal-password');
    await expect(createStaffUserFn.run({ ...fresh, data: { name: 'Allowed', email: 'allowed@bnhs.edu', role: 'glc', gradeLevel: 8 } }))
      .resolves.toMatchObject({ email: 'allowed@bnhs.edu' });
  });
  it('invalid new passwords leave the restriction in place', async () => {
    await expect(changeOwnPasswordFn.run(request(uid, { newPassword: 'short' }))).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await db().doc(`users/${EMAIL}`).get()).data().mustChangePassword).toBe(true);
  });
  it('disabled accounts cannot use the password-change exception', async () => {
    await db().doc(`users/${EMAIL}`).update({ disabled: true });
    await expect(changeOwnPasswordFn.run(request(uid, { newPassword: 'new-personal-password' }))).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('a reset blocks the existing session; that session stays blocked after the next change', async () => {
    const initial = await login(temporaryPassword);
    await changeOwnPasswordFn.run({ ...initial, data: { newPassword: 'first-personal-password' } });
    await waitForFreshLogin();
    const signedIn = await login('first-personal-password');
    const old = { ...signedIn, data: { audienceKeys: ['all'] } };
    await expect(announcementAudienceCountFn.run(old)).resolves.toEqual({ count: 0 });
    const reset = await resetStaffPassword(admin(), { email: EMAIL });
    expect((await db().doc(`users/${EMAIL}`).get()).data().mustChangePassword).toBe(true);
    await expect(announcementAudienceCountFn.run(old)).rejects.toMatchObject({ code: 'unauthenticated' });
    await waitForFreshLogin();
    const resetSession = await login(reset.password);
    await changeOwnPasswordFn.run({ ...resetSession, data: { newPassword: 'second-personal-password' } });
    await expect(announcementAudienceCountFn.run(old)).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(changeOwnPasswordFn.run({ ...old, data: { newPassword: 'old-session-password' } })).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  it('email changes cannot bypass the UID-bound restriction on guardian operations', async () => {
    await auth().updateUser(uid, { email: 'changed@bnhs.edu', emailVerified: true });
    await db().doc(`guardians/${uid}`).set({ consentVersion: 0 });
    await db().doc('settings/parent_portal').set({ consentVersion: 1 });
    const changed = request(uid, { version: 1 });
    changed.auth.token.email = 'changed@bnhs.edu';
    await expect(acceptConsentFn.run(changed)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect((await db().doc(`guardians/${uid}`).get()).data().consentVersion).toBe(0);
  });
  it('rechecks a delayed password request against the cutoff inside the operation lock', async () => {
    const oldTime = Math.floor(Date.now() / 1000);
    await resetStaffPassword(admin(), { email: EMAIL });
    await expect(changeOwnPassword({ ...admin(), uid, email: EMAIL, authTime: oldTime }, { newPassword: 'late-request-password' }))
      .rejects.toMatchObject({ code: 'unauthenticated' });
    expect((await db().doc(`users/${EMAIL}`).get()).data().mustChangePassword).toBe(true);
  });
  it('does not take over an old operation whose Auth mutation may still be running', async () => {
    await db().doc(`users/${EMAIL}`).update({ passwordOperation: { id: 'interrupted', startedAt: Date.now() - 600_000 } });
    await expect(resetStaffPassword(admin(), { email: EMAIL })).rejects.toMatchObject({ code: 'failed-precondition' });
    const p = (await db().doc(`users/${EMAIL}`).get()).data();
    expect(p.passwordOperation.id).toBe('interrupted');
    expect(p.mustChangePassword).toBe(true);
  });
  it('an Auth failure during reset keeps the database account restricted', async () => {
    await db().doc(`users/${EMAIL}`).update({ mustChangePassword: false });
    const failingAuth = { updateUser: async () => { throw new Error('Auth unavailable'); } };
    await expect(resetStaffPassword({ ...admin(), auth: failingAuth }, { email: EMAIL })).rejects.toThrow('Auth unavailable');
    expect((await db().doc(`users/${EMAIL}`).get()).data().mustChangePassword).toBe(true);
    expect((await db().doc(`users/${EMAIL}`).get()).data().passwordOperation?.id).toBeTruthy();
    await expect(resetStaffPassword(admin(), { email: EMAIL })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('a failed password change never clears the restriction', async () => {
    await db().doc(`users/${EMAIL}`).update({ mustChangePassword: false });
    const failingAuth = { updateUser: async () => { throw new Error('Auth unavailable'); } };
    await expect(changeOwnPassword({ ...admin(), auth: failingAuth, uid, email: EMAIL }, { newPassword: 'new-personal-password' })).rejects.toThrow('Auth unavailable');
    expect((await db().doc(`users/${EMAIL}`).get()).data().mustChangePassword).toBe(true);
  });
  it('a reset locks data access before changing the Auth password', async () => {
    await db().doc(`users/${EMAIL}`).update({ mustChangePassword: false });
    const failingAuth = { updateUser: async () => {
      expect((await db().doc(`users/${EMAIL}`).get()).data().mustChangePassword).toBe(true);
      throw new Error('Auth unavailable');
    } };
    await expect(resetStaffPassword({ ...admin(), auth: failingAuth }, { email: EMAIL })).rejects.toThrow('Auth unavailable');
  });
  it('concurrent password operations cannot clear another operation\'s restriction', async () => {
    let release;
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    const paused = new Promise(resolve => { release = resolve; });
    const real = auth();
    const slowAuth = {
      updateUser: async (...args) => { started(); await paused; return real.updateUser(...args); },
      revokeRefreshTokens: (...args) => real.revokeRefreshTokens(...args),
      getUser: (...args) => real.getUser(...args),
    };
    const changing = changeOwnPassword({ ...admin(), auth: slowAuth, uid, email: EMAIL }, { newPassword: 'new-personal-password' });
    await ready;
    try {
      await expect(resetStaffPassword(admin(), { email: EMAIL })).rejects.toMatchObject({ code: 'failed-precondition' });
      expect((await db().doc(`users/${EMAIL}`).get()).data().mustChangePassword).toBe(true);
    } finally { release(); await changing; }
    expect((await db().doc(`users/${EMAIL}`).get()).data().mustChangePassword).toBe(false);
  });
  it('tokens from the same second as the password change remain invalid', async () => {
    const before = Math.floor(Date.now() / 1000);
    await changeOwnPasswordFn.run(request(uid, { newPassword: 'new-personal-password' }));
    const profile = (await db().doc(`users/${EMAIL}`).get()).data();
    expect(profile.sessionValidAfter).toBeGreaterThan(before);
    await expect(announcementAudienceCountFn.run(request(uid, { audienceKeys: ['all'] }, profile.sessionValidAfter - 1)))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
