import { describe, it, expect, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { db, auth, clearAll, clearAllAuthUsers } from './helpers.js';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../../scripts/backfillStaffProfileBindings.mjs', import.meta.url));
const invoke = async (...args) => {
  const result = await run(process.execPath, [script, process.env.GCLOUD_PROJECT, ...args], { env: process.env });
  return JSON.parse(result.stdout.split('\n')[0]);
};
beforeEach(async () => { await clearAll(); await clearAllAuthUsers(); });

describe('staff binding migration against Auth and Firestore emulators', () => {
  it('dry-runs without writes, applies verified bindings, and becomes idempotent', async () => {
    const user = await auth().createUser({ email: 'legacy@bnhs.edu', password: 'local-test-password' });
    await db().doc('users/legacy@bnhs.edu').set({ role: 'admin', mustChangePassword: true });
    await db().doc('students/S1').set({ marker: 'preserve-school-record' });
    expect(await invoke()).toMatchObject({ mode: 'dry-run', changes: 1, warnings: 0 });
    expect((await db().doc('users/legacy@bnhs.edu').get()).data().uid).toBeUndefined();
    expect((await db().doc(`staff_profiles/${user.uid}`).get()).exists).toBe(false);
    expect(await invoke('--apply')).toMatchObject({ changes: 1, warnings: 0 });
    expect((await db().doc('users/legacy@bnhs.edu').get()).data()).toMatchObject({ uid: user.uid, role: 'admin', mustChangePassword: true });
    expect((await db().doc(`staff_profiles/${user.uid}`).get()).data()).toEqual({ email: 'legacy@bnhs.edu' });
    expect(await invoke()).toMatchObject({ changes: 0, warnings: 0 });
    expect((await db().doc('students/S1').get()).data()).toEqual({ marker: 'preserve-school-record' });
  }, 20_000);
  it('refuses all writes when another profile has an unresolved Auth identity', async () => {
    const user = await auth().createUser({ email: 'good@bnhs.edu', password: 'local-test-password' });
    await db().doc('users/good@bnhs.edu').set({ uid: user.uid, role: 'admin' });
    await db().doc('users/missing@bnhs.edu').set({ role: 'glc', gradeLevel: 8 });
    await expect(invoke('--apply')).rejects.toMatchObject({ code: 1 });
    expect((await db().collection('staff_profiles').get()).empty).toBe(true);
    expect((await db().doc('users/missing@bnhs.edu').get()).data()).toEqual({ role: 'glc', gradeLevel: 8 });
  }, 20_000);
});
