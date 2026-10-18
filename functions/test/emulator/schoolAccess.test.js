import { beforeEach, describe, expect, it } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { requestSchoolRole, resolveSchoolRole, assignSchoolRole, revokeSchoolRole, getSchoolContext, loadSchoolActor, deleteSchoolAccess } from '../../src/handlers/schoolAccess.js';

const year = '2026-2027';
const now = () => new Date('2026-10-17T08:00:00+08:00');
const users = {
  teacher: { uid: 'teacher', email: 'teacher@deped.gov.ph', emailVerified: true, displayName: 'Teacher' },
  personal: { uid: 'personal', email: 'teacher@gmail.com', emailVerified: true },
  curriculum: { uid: 'curriculum', email: 'ca@deped.gov.ph', emailVerified: true },
  admin: { uid: 'admin', email: 'admin@school.test', emailVerified: true },
};
const auth = { getUser: async uid => users[uid], getUserByEmail: async email => Object.values(users).find(u => u.email === email) };
const deps = uid => ({ db: db(), auth, now, uid, email: users[uid].email, displayName: users[uid].displayName || uid, authTime: 1792195200 });
beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('users/admin@school.test').set({ uid: 'admin', role: 'admin' });
  await db().doc('school_accounts/curriculum').set({ assignments: [{ role: 'curriculum_adviser', schoolYear: year, gradeLevel: 7 }] });
  await db().doc('sections/SEC8').set({ name: 'Eight', gradeLevel: 8, schoolYear: year });
});
describe('school request lifecycle', () => {
  it('account deletion releases adviser locks and withdraws pending requests', async () => {
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1' });
    const request = await requestSchoolRole(deps('teacher'), { role: 'subject_teacher', sectionId: 'SEC8' });
    await deleteSchoolAccess(db(), 'teacher');
    expect((await db().doc('school_accounts/teacher').get()).exists).toBe(false);
    expect((await db().doc('school_adviser_locks/2026-2027_SEC1').get()).exists).toBe(false);
    expect((await db().doc(`school_role_requests/${request.id}`).get()).data().status).toBe('withdrawn');
    await assignSchoolRole(deps('admin'), { email: users.personal.email, role: 'adviser', sectionId: 'SEC1' });
  });
  it('a request gives no access; scoped curriculum approval grants only the requested advisory section', async () => {
    const r = await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC1' });
    expect((await loadSchoolActor(deps('teacher'))).assignments).toEqual([]);
    await resolveSchoolRole(deps('curriculum'), { requestId: r.id, approve: true, reason: 'Verified teaching assignment' });
    expect((await loadSchoolActor(deps('teacher'))).assignments).toMatchObject([{ role: 'adviser', sectionId: 'SEC1', schoolYear: year }]);
  });
  it('requires an administrator for personal-email requests', async () => {
    const r = await requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC1' });
    await expect(resolveSchoolRole(deps('curriculum'), { requestId: r.id, approve: true, reason: 'Verified' })).rejects.toMatchObject({ code: 'permission-denied' });
    await resolveSchoolRole(deps('admin'), { requestId: r.id, approve: true, reason: 'Verified' });
    expect((await loadSchoolActor(deps('personal'))).assignments).toHaveLength(1);
  });
  it('rejects curriculum approvals outside their grades and subject-teacher elevation', async () => {
    const r = await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC8' });
    await expect(resolveSchoolRole(deps('curriculum'), { requestId: r.id, approve: true, reason: 'Verified' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(assignSchoolRole(deps('curriculum'), { email: users.teacher.email, role: 'curriculum_adviser', gradeLevel: 8 })).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('serializes two adviser assignments and supports audited explicit replacement', async () => {
    const assignments = await Promise.allSettled(['teacher', 'personal'].map(uid => assignSchoolRole(deps('admin'), { email: users[uid].email, role: 'adviser', sectionId: 'SEC1' })));
    expect(assignments.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const winner = assignments[0].status === 'fulfilled' ? 'teacher' : 'personal';
    const loser = winner === 'teacher' ? 'personal' : 'teacher';
    await revokeSchoolRole(deps('admin'), { uid: winner, role: 'adviser', sectionId: 'SEC1', reason: 'Reassigned' });
    await assignSchoolRole(deps('admin'), { email: users[loser].email, role: 'adviser', sectionId: 'SEC1' });
    expect((await loadSchoolActor(deps(winner))).assignments).toEqual([]);
    expect((await db().collection('audit_log').get()).size).toBe(3);
  });
  it('does not allow self-approval or client-supplied email proof', async () => {
    const r = await requestSchoolRole(deps('curriculum'), { role: 'adviser', sectionId: 'SEC1', email: users.teacher.email });
    await expect(resolveSchoolRole(deps('curriculum'), { requestId: r.id, approve: true, reason: 'Self' })).rejects.toMatchObject({ code: 'permission-denied' });
    const p = await requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC8', email: users.teacher.email, emailVerified: true });
    expect((await db().doc(`school_role_requests/${p.id}`).get()).data().email).toBe(users.personal.email);
  });
  it('removes old-year access and refuses ended-year changes', async () => {
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1' });
    await db().doc(`school_years/${year}`).set({ endedAt: new Date() });
    expect((await loadSchoolActor(deps('teacher'))).assignments).toEqual([]);
    await expect(requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC1' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('returns only scoped approvable requests to curriculum advisers', async () => {
    await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC1' });
    await requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC8' });
    const c = await getSchoolContext(deps('curriculum'));
    expect(c.reviewRequests).toHaveLength(1);
    expect(c.reviewRequests[0].email).toBe(users.teacher.email);
    expect(c.managedAssignments).toBeUndefined();
  });
});
