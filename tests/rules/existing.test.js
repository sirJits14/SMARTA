import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setup, seedBaseline, as, anon, ok, denied, STAFF, KIOSK, KIOSK_INACTIVE, GUARDIAN_A, ANON } from './helpers.js';

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedBaseline(env); });

describe('roster collections', () => {
  for (const col of ['students', 'enrollments', 'sections']) {
    it(`${col}: staff and active kiosk read; anonymous, guardian, inactive kiosk denied`, async () => {
      await ok(as(env, STAFF).collection(col).get());
      await ok(as(env, KIOSK).collection(col).get());
      await denied(as(env, ANON).collection(col).get());
      await denied(anon(env).collection(col).get());
      await denied(as(env, GUARDIAN_A).collection(col).get());
      await denied(as(env, KIOSK_INACTIVE).collection(col).get());
    });
  }
  it('only staff write students', async () => {
    await ok(as(env, STAFF).doc('students/S3').set({ lrn: '100000000003' }));
    await denied(as(env, KIOSK).doc('students/S3').set({ lrn: '100000000003' }));
  });
});

describe('settings', () => {
  it('settings/app readable by staff and kiosk only', async () => {
    await ok(as(env, KIOSK).doc('settings/app').get());
    await denied(as(env, GUARDIAN_A).doc('settings/app').get());
  });
  it('settings/parent_portal readable by any non-anonymous user, writable by staff', async () => {
    await ok(as(env, GUARDIAN_A).doc('settings/parent_portal').get());
    await ok(as(env, KIOSK).doc('settings/parent_portal').get());
    await denied(as(env, ANON).doc('settings/parent_portal').get());
    await ok(as(env, STAFF).doc('settings/parent_portal').set({ notificationsPaused: true, pauseNote: 'drill' }, { merge: true }));
    await denied(as(env, GUARDIAN_A).doc('settings/parent_portal').set({ notificationsPaused: true }, { merge: true }));
  });
});

describe('student_attendance', () => {
  const ref = (db) => db.doc('student_attendance/SEC1_2026-09-21');
  it('kiosk merge with allowed keys succeeds', async () => {
    await ok(ref(as(env, KIOSK)).set({ sectionId: 'SEC1', date: '2026-09-21', schoolYear: '2026-2027', marks: { S1: 'P' }, timeIn: { S1: '07:12' }, rosterInitialized: true, updatedAt: '2026-09-21' }, { merge: true }));
  });
  it('kiosk cannot add unexpected keys; anonymous cannot write; guardian cannot read', async () => {
    await denied(ref(as(env, KIOSK)).set({ sectionId: 'SEC1', date: '2026-09-21', schoolYear: '2026-2027', note: 'x' }, { merge: true }));
    await denied(ref(as(env, ANON)).set({ marks: { S1: 'P' } }, { merge: true }));
    await denied(ref(as(env, GUARDIAN_A)).get());
  });
});

describe('kiosks', () => {
  it('kiosk reads its own doc and may only bump lastSeenAt', async () => {
    await ok(as(env, KIOSK).doc('kiosks/kiosk1').get());
    await ok(as(env, KIOSK).doc('kiosks/kiosk1').update({ lastSeenAt: new Date() }));
    // Use a value that actually differs from the seeded doc (active: true) so
    // `active` is genuinely part of the write's affected keys — resending the
    // same value would not show up in diff().affectedKeys() and would let this
    // update slip through affectedOnly(['lastSeenAt']) unintentionally.
    await denied(as(env, KIOSK).doc('kiosks/kiosk1').update({ active: false, lastSeenAt: new Date() }));
    await denied(as(env, KIOSK).doc('kiosks/kiosk9').get());
  });
  it('nobody creates kiosk docs from a client, staff can read all', async () => {
    await denied(as(env, STAFF).doc('kiosks/new').set({ label: 'x', active: true }));
    await ok(as(env, STAFF).collection('kiosks').get());
  });
});

describe('users', () => {
  it('unchanged: staff read, nobody writes', async () => {
    await ok(as(env, STAFF).doc('users/registrar@bnhs.edu').get());
    await denied(as(env, STAFF).doc('users/x@bnhs.edu').set({ role: 'registrar' }));
    await denied(as(env, KIOSK).doc('users/registrar@bnhs.edu').get());
  });
});
