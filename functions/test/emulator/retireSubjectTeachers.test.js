import { beforeEach, describe, expect, it } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { retireSubjectTeachers, RETIRED_NOTE } from '../../src/handlers/retireSubjectTeachers.js';

const year = '2026-2027';
const deps = (uid, email) => ({ db: db(), auth: {}, now: () => new Date(), uid, email, authTime: 1792195200 });
const admin = () => deps('admin', 'admin@school.test');
const inbox = async uid => (await db().collection(`guardians/${uid}/inbox`).get()).docs.map(d => d.data());
const audit = async action => (await db().collection('audit_log').where('action', '==', action).get()).docs.map(d => d.data());

beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('users/admin@school.test').set({ uid: 'admin', role: 'admin' });
  await db().doc('users/glc7@school.test').set({ uid: 'glc7', role: 'glc', gradeLevel: 7 });
  await db().doc('school_accounts/t1').set({ email: 't1@deped.gov.ph', displayName: 'Ana', assignments: [
    { role: 'subject_teacher', schoolYear: year, gradeLevel: 7 }, { role: 'subject_teacher', schoolYear: year, gradeLevel: 8 }] });
  await db().doc('school_accounts/t2').set({ email: 't2@deped.gov.ph', displayName: 'Ben', assignments: [
    { role: 'curriculum_adviser', schoolYear: year, gradeLevel: 9 }, { role: 'subject_teacher', schoolYear: year, gradeLevel: 7 }] });
  await db().doc('school_accounts/old').set({ email: 'old@deped.gov.ph', assignments: [{ role: 'subject_teacher', schoolYear: '2025-2026', gradeLevel: 7 }] });
  await db().doc('school_accounts/adv').set({ email: 'adv@deped.gov.ph', assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 }] });
  await db().doc('school_role_requests/r1').set({ uid: 't3', email: 't3@gmail.com', emailVerified: true, displayName: 'Cy', role: 'subject_teacher',
    schoolYear: year, gradeLevel: 8, status: 'pending', createdAt: new Date() });
  await db().doc('school_role_requests/r2').set({ uid: 't4', email: 't4@gmail.com', emailVerified: true, role: 'adviser',
    schoolYear: year, sectionId: 'SEC1', gradeLevel: 7, status: 'pending', createdAt: new Date() });
});

describe('retireSubjectTeachers', () => {
  it('refuses anyone but an administrator', async () => {
    await expect(retireSubjectTeachers(deps('t1', 't1@deped.gov.ph'), { apply: true })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(retireSubjectTeachers(deps('glc7', 'glc7@school.test'), { apply: true })).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('only counts on a dry run', async () => {
    expect(await retireSubjectTeachers(admin(), {})).toEqual({ dryRun: true, accounts: 3, rows: 4, requests: 1 });
    expect((await db().doc('school_accounts/t1').get()).data().assignments).toHaveLength(2);
    expect((await db().doc('school_role_requests/r1').get()).data().status).toBe('pending');
    expect(await inbox('t1')).toEqual([]);
  });
  it('removes every Subject Teacher row, keeps other roles, and tells current-year holders', async () => {
    expect(await retireSubjectTeachers(admin(), { apply: true })).toEqual({ dryRun: false, accounts: 3, rows: 4, requests: 1 });
    expect((await db().doc('school_accounts/t1').get()).data().assignments).toEqual([]);
    expect((await db().doc('school_accounts/t2').get()).data().assignments).toEqual([{ role: 'curriculum_adviser', schoolYear: year, gradeLevel: 9 }]);
    expect((await db().doc('school_accounts/old').get()).data().assignments).toEqual([]);
    expect((await db().doc('school_accounts/adv').get()).data().assignments).toHaveLength(1);
    expect(await inbox('t1')).toEqual([expect.objectContaining(RETIRED_NOTE)]);
    expect(await inbox('t2')).toEqual([expect.objectContaining(RETIRED_NOTE)]);
    expect(await inbox('old')).toEqual([]);
    const rows = await audit('school.roleRetired');
    expect(rows.map(r => r.targetId).sort()).toEqual(['old', 't1', 't2']);
    expect(rows.find(r => r.targetId === 't1')).toMatchObject({ actorUid: 'admin@school.test', details: {
      role: 'subject_teacher', teacherEmail: 't1@deped.gov.ph', teacherName: 'Ana',
      removed: [expect.objectContaining({ gradeLevel: 7 }), expect.objectContaining({ gradeLevel: 8 })] } });
  });
  it('rejects pending Subject Teacher requests with a reason and leaves adviser requests alone', async () => {
    await retireSubjectTeachers(admin(), { apply: true });
    expect((await db().doc('school_role_requests/r1').get()).data()).toMatchObject({ status: 'rejected', reason: 'The Subject Teacher role was retired.', reviewedBy: 'admin' });
    expect((await db().doc('school_role_requests/r2').get()).data().status).toBe('pending');
    expect(await inbox('t3')).toEqual([expect.objectContaining({ type: 'school_access', rejected: true, body: 'Reason: The Subject Teacher role was retired.' })]);
    expect(await audit('school.requestRejected')).toEqual([expect.objectContaining({ targetId: 't3' })]);
  });
  it('changes nothing on a second run', async () => {
    await retireSubjectTeachers(admin(), { apply: true });
    expect(await retireSubjectTeachers(admin(), { apply: true })).toEqual({ dryRun: false, accounts: 0, rows: 0, requests: 0 });
    expect(await retireSubjectTeachers(admin(), {})).toEqual({ dryRun: true, accounts: 0, rows: 0, requests: 0 });
    expect(await inbox('t1')).toHaveLength(1);
  });
});
