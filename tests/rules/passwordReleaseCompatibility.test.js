import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { setup, seed, seedBaseline, as, ok, denied, STAFF, JHS, SHS, GLC8 } from './helpers.js';

// The separate release intentionally retains production's existing coordinator
// read permissions. The normal root suite tests the held grade isolation instead.
describe.runIf(process.env.SIMS_RULES_PATH?.endsWith('firestore.password-only.rules'))('password-only release compatibility', () => {
  let env;
  beforeAll(async () => { env = await setup(); });
  afterAll(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore(); await seedBaseline(env);
    await seed(env, async db => {
      for (const [who, role, gradeLevel] of [[JHS, 'jhs_coord', null], [SHS, 'shs_coord', null], [GLC8, 'glc', 8]]) {
        await db.doc(`users/${who.token.email}`).set({ uid: who.uid, role, gradeLevel });
      }
      for (const grade of [7, 8, 11]) await db.doc(`sections/SEC${grade}`).set({ gradeLevel: grade });
    });
  });
  it('bound administrators retain roster reads, writes and account listing', async () => {
    await ok(as(env, STAFF).collection('students').get());
    await ok(as(env, STAFF).doc('students/S3').set({ firstName: 'Local test' }));
    await ok(as(env, STAFF).collection('users').get());
  });
  it('legacy administrators without a UID lookup retain their existing access', async () => {
    await seed(env, db => db.doc(`staff_profiles/${STAFF.uid}`).delete());
    await ok(as(env, STAFF).collection('students').get());
    await ok(as(env, STAFF).doc('students/S3').set({ firstName: 'Local test' }));
  });
  for (const who of [JHS, SHS, GLC8]) {
    it(`${who.uid} retains production roster reads and own-profile GET only`, async () => {
      await ok(as(env, who).collection('students').get());
      await ok(as(env, who).collection('student_attendance').get());
      await ok(as(env, who).doc(`users/${who.token.email}`).get());
      await denied(as(env, who).collection('users').get());
      await denied(as(env, who).doc('students/S3').set({ firstName: 'Forbidden' }));
    });
  }
  it('coordinators retain attendance edits only within their existing section grades', async () => {
    const att = sectionId => ({ sectionId, marks: { S1: 'P' } });
    await ok(as(env, JHS).doc('student_attendance/jhs').set(att('SEC7')));
    await ok(as(env, SHS).doc('student_attendance/shs').set(att('SEC11')));
    await ok(as(env, GLC8).doc('student_attendance/glc').set(att('SEC8')));
    await denied(as(env, GLC8).doc('student_attendance/glc').set(att('SEC7')));
    await denied(as(env, GLC8).doc('student_attendance/out').set(att('SEC7')));
    await denied(as(env, JHS).doc('student_attendance/shs').set(att('SEC8')));
    await denied(as(env, JHS).doc('student_attendance/jhs').delete());
  });
});
