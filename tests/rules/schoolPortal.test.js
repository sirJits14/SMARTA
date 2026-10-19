import { beforeAll, afterAll, beforeEach, it } from 'vitest';
import { setup, seedBaseline, seed, as, ok, denied, STAFF, GUARDIAN_A } from './helpers.js';
let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedBaseline(env); });
it('school assignments confer no raw roster reads or direct mutation privileges', async () => {
  await seed(env, async db => {
    await db.doc('school_accounts/gA').set({ assignments: [{ role: 'adviser', schoolYear: '2026-2027', sectionId: 'SEC1', gradeLevel: 7 }] });
  });
  await denied(as(env, GUARDIAN_A).doc('students/S1').get());
  for (const who of [STAFF, GUARDIAN_A]) {
    for (const path of ['school_accounts/gA', 'school_role_requests/r', 'school_adviser_locks/s', 'advisory_slips/x', 'attendance_corrections/op', 'attendance_correction_audit/op']) {
      await denied(as(env, who).doc(path).set({ role: 'admin' }));
    }
  }
  for (const who of [STAFF, GUARDIAN_A]) await denied(as(env, who).doc('advisory_slips/x').get());
});
it('staff preserve session overrides when editing base marks and cannot erase the audit by deleting attendance', async () => {
  await seed(env, db => db.doc('student_attendance/SEC1_2026-10-17').set({ sectionId: 'SEC1', schoolYear: '2026-2027', gradeLevel: 7,
    date: '2026-10-17', marks: { S1: 'P' }, sessionOverrides: { S1: { revision: 1, am: { absent: true } } } }));
  const ref = as(env, STAFF).doc('student_attendance/SEC1_2026-10-17');
  await ok(ref.update({ marks: { S1: 'L' } }));
  await denied(ref.update({ sessionOverrides: {} }));
  await denied(ref.delete());
  await denied(as(env, STAFF).doc('student_attendance/SEC1_2026-10-18').set({ sectionId: 'SEC1', gradeLevel: 7, sessionOverrides: { S1: {} } }));
});
it('never serves role-targeted announcements through the legacy cached guardian audience', async () => {
  await seed(env, async db => {
    await db.doc('guardians/gA').update({ audienceKeys: ['all', 'g7'] });
    await db.doc('announcements/staff').set({ status: 'published', audience: { all: true, roles: ['subject_teacher'] }, audienceKeys: ['all'] });
  });
  await denied(as(env, GUARDIAN_A).doc('announcements/staff').get());
});
it('denies legacy family posts to adviser-only accounts with stale matching audience keys', async () => {
  await seed(env, async db => {
    await db.doc('guardian_links/gA_S1').update({ relationship: 'Adviser', slot: 'adviser' });
    await db.doc('guardians/gA').update({ audienceKeys: ['all', 'g7'] });
    await db.doc('announcements/legacyGrade').set({ status: 'published', audience: { grades: [7] }, audienceKeys: ['g7'], publishedAt: new Date() });
    await db.doc('announcements/legacyAll').set({ status: 'published', audience: { all: true }, audienceKeys: ['all'], publishedAt: new Date() });
  });
  for (const id of ['legacyGrade', 'legacyAll']) await denied(as(env, GUARDIAN_A).doc(`announcements/${id}`).get());
  await denied(as(env, GUARDIAN_A).collection('announcements').where('audienceKeys', 'array-contains-any', ['all', 'g7'])
    .where('status', '==', 'published').orderBy('publishedAt', 'desc').limit(50).get());
});
it('a legacy adviser link cannot read learner records even with a DepEd email', async () => {
  await seed(env, db => db.doc('guardian_links/gA_S1').update({ relationship: 'Adviser', slot: 'adviser' }));
  await denied(as(env, GUARDIAN_A).doc('learners/S1').get());
  await denied(as(env, GUARDIAN_A).collection('learners/S1/events').limit(10).get());
});
