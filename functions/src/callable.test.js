import { describe, it, expect } from 'vitest';
import { staffIdentity, adminIdentity } from './callable.js';

const req = (email = 'a@bnhs.edu') => ({ app: {}, auth: { uid: 'u1', token: { email } } });
const dbWith = (profile) => ({
  doc: () => ({ get: async () => ({ exists: profile !== undefined, data: () => profile }) }),
});

describe('staffIdentity', () => {
  it('returns the caller and their profile', async () => {
    const r = await staffIdentity(dbWith({ role: 'glc', gradeLevel: 8 }), req('A@bnhs.edu'));
    expect(r).toEqual({ uid: 'u1', email: 'a@bnhs.edu', profile: { role: 'glc', gradeLevel: 8 } });
  });
  it('refuses a missing, disabled, or unknown-role profile', async () => {
    await expect(staffIdentity(dbWith(undefined), req())).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(staffIdentity(dbWith({ role: 'admin', disabled: true }), req())).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(staffIdentity(dbWith({ role: 'teacher' }), req())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('still requires App Check and a signed-in email', async () => {
    await expect(staffIdentity(dbWith({}), { auth: req().auth })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(staffIdentity(dbWith({}), { app: {}, auth: null })).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

describe('adminIdentity', () => {
  it('accepts admins, including legacy registrar profiles', async () => {
    await expect(adminIdentity(dbWith({ role: 'admin' }), req())).resolves.toMatchObject({ email: 'a@bnhs.edu' });
    await expect(adminIdentity(dbWith({ role: 'registrar' }), req())).resolves.toMatchObject({ email: 'a@bnhs.edu' });
    await expect(adminIdentity(dbWith({}), req())).resolves.toMatchObject({ email: 'a@bnhs.edu' });
  });
  it('refuses every coordinator role', async () => {
    for (const profile of [{ role: 'jhs_coord' }, { role: 'shs_coord' }, { role: 'glc', gradeLevel: 8 }]) {
      await expect(adminIdentity(dbWith(profile), req())).rejects.toMatchObject({ code: 'permission-denied', message: 'Administrators only' });
    }
  });
});
