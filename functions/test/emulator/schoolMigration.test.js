import { beforeEach, describe, expect, it } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { migrateSubjectTeachers } from '../../src/handlers/schoolMigration.js';

const year = '2026-2027';
const deps = (uid, email) => ({ db: db(), auth: {}, now: () => new Date(), uid, email, authTime: 1792195200 });
beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('users/admin@school.test').set({ uid: 'admin', role: 'admin' });
  await db().doc('sections/SEC8').set({ name: 'Eight', gradeLevel: 8, schoolYear: year });
  await db().doc('school_accounts/t1').set({ email: 't1@deped.gov.ph', displayName: 'Ana', assignments: [
    { role: 'subject_teacher', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 },
    { role: 'subject_teacher', schoolYear: year, sectionId: 'SEC8', gradeLevel: 8 }] });
  await db().doc('school_accounts/t2').set({ email: 't2@deped.gov.ph', displayName: 'Ben', assignments: [
    { role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 },
    { role: 'subject_teacher', schoolYear: year, sectionId: 'SEC8', gradeLevel: 8 }] });
  await db().doc('school_role_requests/r1').set({ uid: 't3', email: 't3@gmail.com', emailVerified: true, role: 'subject_teacher',
    schoolYear: year, sectionId: 'SEC8', gradeLevel: 8, status: 'pending', createdAt: new Date() });
});
describe('migrateSubjectTeachers', () => {
  it('converts accounts and pending requests, reports conflicts, and is safe to re-run', async () => {
    await expect(migrateSubjectTeachers(deps('t1', 't1@deped.gov.ph'))).rejects.toMatchObject({ code: 'permission-denied' });
    const first = await migrateSubjectTeachers(deps('admin', 'admin@school.test'));
    expect(first).toEqual({ accountsChanged: 2, requestsChanged: 1, conflicts: [{ uid: 't2', email: 't2@deped.gov.ph', displayName: 'Ben' }] });
    expect((await db().doc('school_accounts/t1').get()).data().assignments.map(a => [a.role, a.gradeLevel, a.sectionId])).toEqual([
      ['subject_teacher', 7, undefined], ['subject_teacher', 8, undefined]]);
    expect((await db().doc('school_role_requests/r1').get()).data()).toMatchObject({ status: 'withdrawn', reason: 'Converted to a grade-level request' });
    const converted = (await db().collection('school_role_requests').where('status', '==', 'pending').get()).docs.map(d => d.data());
    expect(converted).toEqual([expect.objectContaining({ uid: 't3', role: 'subject_teacher', gradeLevel: 8 })]);
    expect(converted[0].sectionId).toBeUndefined();
    const again = await migrateSubjectTeachers(deps('admin', 'admin@school.test'));
    expect(again).toMatchObject({ accountsChanged: 0, requestsChanged: 0 });
  });
});
