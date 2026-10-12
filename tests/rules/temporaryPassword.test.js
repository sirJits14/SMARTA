import { describe, it, beforeEach, afterEach } from 'vitest';
import { setup, seed, seedBaseline, as, ok, denied, STAFF, GLC8, GUARDIAN_A, KIOSK } from './helpers.js';

let env;
const tokenFor = (who, authTime = 1000) => ({ ...who, token: { ...who.token, auth_time: authTime } });
beforeEach(async () => {
  env = await setup();
  await seedBaseline(env);
  await seed(env, async db => {
    await db.doc('students/S1').update({ gradeLevel: 8, scopeSchoolYear: '2026-2027' });
    await db.doc('sections/SEC8').set({ gradeLevel: 8, schoolYear: '2026-2027' });
    await db.doc('student_attendance/SEC8_2026-10-11').set({ sectionId: 'SEC8', gradeLevel: 8, schoolYear: '2026-2027', date: '2026-10-11', marks: {} });
    await db.doc('settings/parent_portal').set({ consentVersion: 1 });
    await db.doc('users/glc8@bnhs.edu').set({ role: 'glc', gradeLevel: 8, uid: GLC8.uid });
  });
});
afterEach(async () => { await env.cleanup(); });

describe('temporary-password database restrictions', () => {
  for (const [label, who] of [['administrator', STAFF], ['coordinator', GLC8]]) {
    it(`${label} can read only their own profile while a password change is required`, async () => {
      await seed(env, db => db.doc(`users/${who.token.email}`).update({ mustChangePassword: true }));
      const db = as(env, who);
      await ok(db.doc(`users/${who.token.email}`).get());
      for (const path of ['students/S1', 'sections/SEC8', 'settings/app', 'settings/parent_portal', 'student_attendance/SEC8_2026-10-11', 'users/other@bnhs.edu', 'announcements/a1']) {
        await denied(db.doc(path).get());
      }
      for (const collection of ['students', 'enrollments', 'sections', 'schedules', 'student_attendance', 'users', 'audit_log', 'scan_events', 'activation_codes', 'guardian_links', 'reports']) {
        await denied(db.collection(collection).get());
      }
      await denied(db.doc('students/S1').update({ firstName: 'Changed' }));
      await denied(db.doc('student_attendance/SEC8_2026-10-11').update({ marks: { S1: 'P' } }));
      await denied(db.doc(`users/${who.token.email}`).update({ mustChangePassword: false }));
      await denied(db.doc('students/S1').delete());
    });
  }
  it('a verified staff account cannot fall back to guardian or own-UID permissions', async () => {
    await seed(env, async db => {
      await db.doc(`users/${GUARDIAN_A.token.email}`).set({ role: 'admin', uid: GUARDIAN_A.uid, mustChangePassword: true });
      await db.doc('guardians/gA').update({ audienceKeys: ['all'] });
      await db.doc('announcements/published').set({ status: 'published', audienceKeys: ['all'] });
      await db.doc('kiosks/gA').set({ active: true });
    });
    const db = as(env, GUARDIAN_A);
    for (const path of ['learners/S1', 'learners/S1/events/e1', 'guardians/gA', 'guardians/gA/inbox/e1', 'guardian_links/gA_S1', 'announcements/published', 'kiosks/gA', 'settings/parent_portal']) {
      await denied(db.doc(path).get());
    }
    await denied(db.doc('guardians/gA').update({ displayName: 'Changed' }));
    await denied(db.doc('kiosks/gA').update({ lastSeenAt: new Date() }));
  });
  it('resetting a password blocks a previously authorized database session immediately', async () => {
    const db = as(env, tokenFor(STAFF));
    await ok(db.doc('students/S1').get());
    await seed(env, d => d.doc(`users/${STAFF.token.email}`).update({ mustChangePassword: true }));
    await denied(db.doc('students/S1').get());
    await denied(db.doc('students/S1').update({ firstName: 'Changed' }));
  });
  it('clearing the flag does not restore access to tokens older than the password change', async () => {
    await seed(env, db => db.doc(`users/${STAFF.token.email}`).update({ mustChangePassword: false, sessionValidAfter: 1005 }));
    const old = as(env, tokenFor(STAFF, 1000));
    await denied(old.doc('students/S1').get());
    await denied(old.doc('students/S1').update({ firstName: 'Changed' }));
    await ok(old.doc(`users/${STAFF.token.email}`).get());
    const fresh = as(env, tokenFor(STAFF, 1005));
    await ok(fresh.doc('students/S1').get());
    await ok(fresh.doc('students/S1').update({ firstName: 'Changed' }));
  });
  it('another UID cannot read the restricted staff profile or claim its permissions', async () => {
    await seed(env, db => db.doc(`users/${STAFF.token.email}`).update({ uid: 'different-user', mustChangePassword: true }));
    await denied(as(env, STAFF).doc(`users/${STAFF.token.email}`).get());
    await denied(as(env, STAFF).doc('students/S1').get());
  });
  it('legacy staff, ordinary parents, and registered kiosks keep their existing access', async () => {
    await ok(as(env, STAFF).doc('students/S1').get());
    await ok(as(env, GUARDIAN_A).doc('learners/S1').get());
    await ok(as(env, KIOSK).doc('students/S1').get());
    await seed(env, db => db.doc(`users/${GUARDIAN_A.token.email}`).set({ role: 'admin', uid: 'another-uid', mustChangePassword: true }));
    await ok(as(env, GUARDIAN_A).doc('learners/S1').get());
  });
  it('email changes cannot bypass the staff restriction through a guardian account', async () => {
    await seed(env, async db => {
      await db.doc(`users/${GUARDIAN_A.token.email}`).set({ uid: GUARDIAN_A.uid, role: 'admin', mustChangePassword: true });
      await db.doc(`staff_profiles/${GUARDIAN_A.uid}`).set({ email: GUARDIAN_A.token.email });
    });
    const changed = { ...GUARDIAN_A, token: { ...GUARDIAN_A.token, email: 'changed@gmail.com' } };
    await denied(as(env, changed).doc('learners/S1').get());
    await denied(as(env, changed).doc('guardians/gA').update({ displayName: 'Bypass' }));
    await denied(as(env, changed).doc(`staff_profiles/${GUARDIAN_A.uid}`).update({ email: 'changed@gmail.com' }));
  });
});
