import { describe, it, expect } from 'vitest';
import { staffIdentity, adminIdentity } from './callable.js';

// auth_time 1000s = 1970-01-01T00:16:40Z.
const req = (email = 'a@bnhs.edu', authTime = 1000) => ({ app: {}, auth: { uid: 'u1', token: { email, auth_time: authTime } } });
const dbWith = (profile) => ({
  doc: () => ({ get: async () => ({ exists: profile !== undefined, data: () => profile }) }),
});
// tokensValidAfterTime as Firebase Auth reports it (UTC string), or undefined.
const authWith = (tokensValidAfterTime) => ({ getUser: async () => ({ uid: 'u1', tokensValidAfterTime }) });
const auth = authWith(undefined);

describe('staffIdentity', () => {
  it('returns the caller and their profile', async () => {
    const r = await staffIdentity(dbWith({ role: 'glc', gradeLevel: 8 }), auth, req('A@bnhs.edu'));
    expect(r).toEqual({ uid: 'u1', email: 'a@bnhs.edu', profile: { role: 'glc', gradeLevel: 8 } });
  });
  it('refuses a missing, disabled, or unknown-role profile', async () => {
    await expect(staffIdentity(dbWith(undefined), auth, req())).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(staffIdentity(dbWith({ role: 'admin', disabled: true }), auth, req())).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(staffIdentity(dbWith({ role: 'teacher' }), auth, req())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('still requires App Check and a signed-in email', async () => {
    await expect(staffIdentity(dbWith({}), auth, { auth: req().auth })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(staffIdentity(dbWith({}), auth, { app: {}, auth: null })).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  it('refuses a profile bound to a different sign-in', async () => {
    await expect(staffIdentity(dbWith({ role: 'admin', uid: 'someone-else' }), auth, req())).rejects.toMatchObject({ code: 'permission-denied', message: 'Staff only' });
    await expect(staffIdentity(dbWith({ role: 'admin', uid: 'u1' }), auth, req())).resolves.toMatchObject({ uid: 'u1' });
  });
  it('refuses a session issued before its tokens were revoked', async () => {
    const revokedAt = new Date(1000_000 + 5000).toUTCString();
    await expect(staffIdentity(dbWith({ role: 'admin' }), authWith(revokedAt), req('a@bnhs.edu', 1000)))
      .rejects.toMatchObject({ code: 'unauthenticated', message: 'Your session has ended. Please sign in again.' });
    // A fresh sign-in after the revocation (e.g. right after changing the password) is fine.
    await expect(staffIdentity(dbWith({ role: 'admin' }), authWith(revokedAt), req('a@bnhs.edu', 1005))).resolves.toMatchObject({ uid: 'u1' });
    await expect(staffIdentity(dbWith({ role: 'admin' }), authWith(revokedAt), req('a@bnhs.edu', 2000))).resolves.toMatchObject({ uid: 'u1' });
    await expect(staffIdentity(dbWith({ role: 'admin' }), authWith(undefined), req('a@bnhs.edu', 1000))).resolves.toMatchObject({ uid: 'u1' });
  });
  it('treats a deleted sign-in as an ended session', async () => {
    const gone = { getUser: async () => { throw Object.assign(new Error('gone'), { code: 'auth/user-not-found' }); } };
    await expect(staffIdentity(dbWith({ role: 'admin' }), gone, req())).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

describe('adminIdentity', () => {
  it('accepts admins, including legacy registrar profiles', async () => {
    await expect(adminIdentity(dbWith({ role: 'admin' }), auth, req())).resolves.toMatchObject({ email: 'a@bnhs.edu' });
    await expect(adminIdentity(dbWith({ role: 'registrar' }), auth, req())).resolves.toMatchObject({ email: 'a@bnhs.edu' });
    await expect(adminIdentity(dbWith({}), auth, req())).resolves.toMatchObject({ email: 'a@bnhs.edu' });
  });
  it('refuses every coordinator role', async () => {
    for (const profile of [{ role: 'jhs_coord' }, { role: 'shs_coord' }, { role: 'glc', gradeLevel: 8 }]) {
      await expect(adminIdentity(dbWith(profile), auth, req())).rejects.toMatchObject({ code: 'permission-denied', message: 'Administrators only' });
    }
  });
  it('refuses a revoked admin session', async () => {
    await expect(adminIdentity(dbWith({ role: 'admin' }), authWith(new Date(2000_000).toUTCString()), req()))
      .rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
