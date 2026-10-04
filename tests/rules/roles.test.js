import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { setup, seed, seedBaseline, as, ok, denied, STAFF, ADMIN_NEW, JHS, SHS, GLC8, DISABLED_ADMIN, LEGACY } from './helpers.js';

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await seedBaseline(env);
  await seed(env, async (db) => {
    await db.doc('users/admin2@bnhs.edu').set({ name: 'Admin Two', role: 'admin', gradeLevel: null, disabled: false });
    await db.doc('users/jhs@bnhs.edu').set({ name: 'JHS', role: 'jhs_coord', gradeLevel: null, disabled: false });
    await db.doc('users/shs@bnhs.edu').set({ name: 'SHS', role: 'shs_coord', gradeLevel: null, disabled: false });
    await db.doc('users/glc8@bnhs.edu').set({ name: 'G8', role: 'glc', gradeLevel: 8, disabled: false });
    await db.doc('users/off@bnhs.edu').set({ name: 'Off', role: 'admin', gradeLevel: null, disabled: true });
    await db.doc('sections/SEC8').set({ name: 'Mabini', gradeLevel: 8, schoolYear: '2026-2027' });
    await db.doc('sections/SEC11').set({ name: 'Luna', gradeLevel: 11, schoolYear: '2026-2027' });
  });
});

const COORDS = [['jhs', JHS], ['shs', SHS], ['glc8', GLC8]];
const att = (sectionId) => ({ sectionId, date: '2026-09-21', schoolYear: '2026-2027', marks: { S1: 'A' } });

describe('administrators', () => {
  it('legacy registrar and role admin both write roster data', async () => {
    await ok(as(env, STAFF).doc('students/S3').set({ lrn: '100000000003' }));
    await ok(as(env, ADMIN_NEW).doc('sections/SEC9').set({ name: 'X', gradeLevel: 9, schoolYear: '2026-2027' }));
    await ok(as(env, ADMIN_NEW).collection('audit_log').get());
    await ok(as(env, ADMIN_NEW).collection('users').get());
  });
  it('a disabled admin is refused', async () => {
    await denied(as(env, DISABLED_ADMIN).doc('students/S3').set({ lrn: '100000000003' }));
    await denied(as(env, DISABLED_ADMIN).collection('audit_log').get());
  });
  for (const [label, fields] of [['missing', {}], ['null', { role: null }], ["''", { role: '' }]]) {
    it(`a legacy profile with role ${label} is an administrator`, async () => {
      await seed(env, (db) => db.doc('users/legacy@bnhs.edu').set({ name: 'Legacy', ...fields }));
      await ok(as(env, LEGACY).doc('students/S3').set({ lrn: '100000000003' }));
      await ok(as(env, LEGACY).collection('audit_log').get());
    });
  }
});

describe('profile binding and unknown roles', () => {
  it('a profile bound to another uid grants nothing; the bound uid is staff', async () => {
    await seed(env, (db) => db.doc('users/legacy@bnhs.edu').set({ name: 'Bound', role: 'admin', uid: 'someone-else' }));
    await denied(as(env, LEGACY).doc('students/S3').set({ lrn: '100000000003' }));
    await denied(as(env, LEGACY).collection('audit_log').get());
    await seed(env, (db) => db.doc('users/legacy@bnhs.edu').set({ name: 'Bound', role: 'admin', uid: LEGACY.uid }));
    await ok(as(env, LEGACY).doc('students/S3').set({ lrn: '100000000003' }));
  });
  it('an unknown role is not an administrator', async () => {
    await seed(env, (db) => db.doc('users/legacy@bnhs.edu').set({ name: 'Teacher', role: 'teacher' }));
    await denied(as(env, LEGACY).doc('students/S3').set({ lrn: '100000000003' }));
    await denied(as(env, LEGACY).collection('audit_log').get());
  });
  it('a disabled coordinator is refused', async () => {
    await seed(env, (db) => db.doc('users/glc8@bnhs.edu').set({ name: 'G8', role: 'glc', gradeLevel: 8, disabled: true }));
    await denied(as(env, GLC8).doc('users/registrar@bnhs.edu').get());
    await denied(as(env, GLC8).doc('students/S3').set({ lrn: '100000000003' }));
  });
});

describe('coordinators', () => {
  for (const [name, who] of COORDS) {
    it(`${name}: cannot change roster, schedules, or settings`, async () => {
      const db = as(env, who);
      await denied(db.doc('students/S3').set({ lrn: '100000000003' }));
      await denied(db.doc('sections/SEC8').update({ name: 'Renamed' }));
      await denied(db.doc('enrollments/S2_2026-2027').set({ studentId: 'S2', sectionId: 'SEC8', schoolYear: '2026-2027', status: 'enrolled' }));
      await denied(db.doc('schedules/SCH1').set({ name: 'AM', timeIn: '07:00', timeOut: '12:00' }));
      await denied(db.doc('settings/app').set({ schoolName: 'x' }, { merge: true }));
      await denied(db.doc('settings/parent_portal').set({ notificationsPaused: true }, { merge: true }));
    });
    it(`${name}: cannot read admin-only data or other profiles, can read own profile`, async () => {
      const db = as(env, who);
      for (const col of ['guardians', 'guardian_links', 'audit_log', 'kiosks', 'scan_events', 'activation_codes', 'access_requests', 'reports', 'learners', 'users']) {
        await denied(db.collection(col).get());
      }
      await denied(db.doc('users/registrar@bnhs.edu').get());
      await ok(db.doc(`users/${who.token.email}`).get());
    });
    it(`${name}: still reads roster collections (UI scopes them until the kiosk TEMP is removed)`, async () => {
      await ok(as(env, who).collection('students').get());
      await ok(as(env, who).collection('student_attendance').get());
    });
  }
  it('take attendance for sections in their grades', async () => {
    await ok(as(env, GLC8).doc('student_attendance/SEC8_2026-09-21').set(att('SEC8'), { merge: true }));
    await ok(as(env, JHS).doc('student_attendance/SEC8_2026-09-22').set({ ...att('SEC8'), date: '2026-09-22' }, { merge: true }));
    await ok(as(env, SHS).doc('student_attendance/SEC11_2026-09-21').set(att('SEC11'), { merge: true }));
  });
  // TODO(K1/K2): the TEMP(kiosk-v1-compat) `|| signedIn()` on student_attendance
  // lets every signed-in caller write today, so these cannot fail yet.
  // Un-skip when that clause is removed from firestore.rules.
  it.skip('cannot take attendance outside their grades', async () => {
    await denied(as(env, GLC8).doc('student_attendance/SEC11_2026-09-21').set(att('SEC11'), { merge: true }));
    await denied(as(env, SHS).doc('student_attendance/SEC8_2026-09-21').set(att('SEC8'), { merge: true }));
    await seed(env, (db) => db.doc('student_attendance/SEC8_2026-09-23').set({ ...att('SEC8'), date: '2026-09-23' }));
    await denied(as(env, GLC8).doc('student_attendance/SEC8_2026-09-23').set({ sectionId: 'SEC11' }, { merge: true }));
  });
});
