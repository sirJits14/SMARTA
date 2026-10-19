import { beforeEach, describe, expect, it } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { requestSchoolRole, withdrawSchoolRequest, resolveSchoolRole, resolveSchoolRoles, replaceAdviser, assignSchoolRole, revokeSchoolRole, getSchoolContext, loadSchoolActor, deleteSchoolAccess, markSchoolOpened, getSchoolPendingCount } from '../../src/handlers/schoolAccess.js';

const year = '2026-2027';
const now = () => new Date('2026-10-17T08:00:00+08:00');
const users = {
  teacher: { uid: 'teacher', email: 'teacher@deped.gov.ph', emailVerified: true, displayName: 'Teacher' },
  personal: { uid: 'personal', email: 'teacher@gmail.com', emailVerified: true },
  curriculum: { uid: 'curriculum', email: 'ca@deped.gov.ph', emailVerified: true },
  admin: { uid: 'admin', email: 'admin@school.test', emailVerified: true },
  gone: { uid: 'gone', email: 'gone@deped.gov.ph', emailVerified: true, disabled: true },
};
const auth = { getUser: async uid => users[uid], getUserByEmail: async email => Object.values(users).find(u => u.email === email) };
const deps = uid => ({ db: db(), auth, now, uid, email: users[uid].email, displayName: users[uid].displayName || uid, authTime: 1792195200 });
const seedRequest = async (uid, role, sectionId) => {
  const id = `${uid}_${role}_${sectionId}`;
  const gradeLevel = sectionId === 'SEC8' ? 8 : 7;
  await db().doc(`school_role_requests/${id}`).set({ uid, email: users[uid].email, emailVerified: true, displayName: uid,
    role, schoolYear: year, sectionId, gradeLevel, status: 'pending', createdAt: new Date() });
  return { id };
};
beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('users/admin@school.test').set({ uid: 'admin', role: 'admin' });
  await db().doc('school_accounts/curriculum').set({ assignments: [{ role: 'curriculum_adviser', schoolYear: year, gradeLevel: 7 }] });
  await db().doc('sections/SEC8').set({ name: 'Eight', gradeLevel: 8, schoolYear: year });
});
describe('school request lifecycle', () => {
  it('keeps existing adviser sections consistent when another grant refreshes the account name', async () => {
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1' });
    const renamedUser = { ...users.teacher, displayName: 'Renamed Teacher' };
    const renamed = { ...deps('admin'), auth: {
      ...auth, getUser: async uid => uid === 'teacher' ? renamedUser : users[uid],
      getUserByEmail: async email => email === renamedUser.email ? renamedUser : auth.getUserByEmail(email),
    } };
    await assignSchoolRole(renamed, { email: users.teacher.email, role: 'subject_teacher', sectionId: 'SEC8' });
    expect((await db().doc('school_accounts/teacher').get()).data().displayName).toBe('Renamed Teacher');
    expect((await db().doc('sections/SEC1').get()).data().adviserName).toBe('Renamed Teacher');
    renamedUser.displayName = 'Name after repeat grant';
    await assignSchoolRole(renamed, { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1' });
    expect((await db().doc('school_accounts/teacher').get()).data().displayName).toBe('Name after repeat grant');
    expect((await db().doc('sections/SEC1').get()).data().adviserName).toBe('Name after repeat grant');
  });
  it('syncs an approved adviser, replaces them, and preserves the last name on revocation', async () => {
    await db().doc('sections/SEC1').update({ adviserName: 'Old manual name' });
    const request = await seedRequest('teacher', 'adviser', 'SEC1');
    expect((await db().doc('sections/SEC1').get()).data().adviserName).toBe('Old manual name');
    await resolveSchoolRole(deps('admin'), { requestId: request.id, approve: true });
    expect((await db().doc('sections/SEC1').get()).data()).toMatchObject({ adviserName: 'Teacher', schoolAdviserUid: 'teacher' });
    const replacement = await seedRequest('personal', 'adviser', 'SEC1');
    await replaceAdviser(deps('admin'), { requestId: replacement.id, reason: 'New class adviser' });
    expect((await db().doc('sections/SEC1').get()).data()).toMatchObject({ adviserName: 'teacher@gmail.com', schoolAdviserUid: 'personal' });
    await revokeSchoolRole(deps('admin'), { uid: 'personal', role: 'adviser', sectionId: 'SEC1', reason: 'Assignment ended' });
    const section = (await db().doc('sections/SEC1').get()).data();
    expect(section.adviserName).toBe('teacher@gmail.com');
    expect(section.schoolAdviserUid).toBeUndefined();
  });
  it('syncs direct assignments and unlocks on account deletion without changing the name', async () => {
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1' });
    expect((await db().doc('sections/SEC1').get()).data()).toMatchObject({ adviserName: 'Teacher', schoolAdviserUid: 'teacher' });
    await deleteSchoolAccess(db(), 'teacher');
    const section = (await db().doc('sections/SEC1').get()).data();
    expect(section.adviserName).toBe('Teacher');
    expect(section.schoolAdviserUid).toBeUndefined();
  });
  it('does not overwrite the class adviser for subject or curriculum assignments', async () => {
    await db().doc('sections/SEC1').update({ adviserName: 'Manual adviser' });
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'subject_teacher', sectionId: 'SEC1' });
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'curriculum_adviser', gradeLevel: 7 });
    expect((await db().doc('sections/SEC1').get()).data()).toMatchObject({ adviserName: 'Manual adviser' });
    expect((await db().doc('sections/SEC1').get()).data().schoolAdviserUid).toBeUndefined();
  });
  it('account deletion releases adviser locks and withdraws pending requests', async () => {
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1' });
    const request = await seedRequest('teacher', 'subject_teacher', 'SEC8');
    await deleteSchoolAccess(db(), 'teacher');
    expect((await db().doc('school_accounts/teacher').get()).exists).toBe(false);
    expect((await db().doc('school_adviser_locks/2026-2027_SEC1').get()).exists).toBe(false);
    expect((await db().doc(`school_role_requests/${request.id}`).get()).data().status).toBe('withdrawn');
    await assignSchoolRole(deps('admin'), { email: users.personal.email, role: 'adviser', sectionId: 'SEC1' });
  });
  it('a request gives no access; a Curriculum Adviser approves an in-grade DepEd adviser request without a reason', async () => {
    const r = await seedRequest('teacher', 'adviser', 'SEC1');
    expect((await loadSchoolActor(deps('teacher'))).assignments).toEqual([]);
    await resolveSchoolRole(deps('curriculum'), { requestId: r.id, approve: true });
    const [entry] = (await loadSchoolActor(deps('teacher'))).assignments;
    expect(entry).toMatchObject({ role: 'adviser', sectionId: 'SEC1', schoolYear: year, source: 'request', assignedBy: 'ca@deped.gov.ph' });
    expect(entry.assignedAt.toMillis()).toBeGreaterThan(0);
    expect((await db().doc(`school_role_requests/${r.id}`).get()).data()).toMatchObject({ status: 'approved', reason: 'Approved', reviewedBy: 'curriculum' });
  });
  it('keeps subject-teacher requests with administrators', async () => {
    const r = await seedRequest('teacher', 'subject_teacher', 'SEC1');
    await expect(resolveSchoolRole(deps('curriculum'), { requestId: r.id, approve: true })).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('a rejection needs a reason and tells the teacher why', async () => {
    const r = await seedRequest('teacher', 'adviser', 'SEC1');
    await expect(resolveSchoolRole(deps('admin'), { requestId: r.id, approve: false })).rejects.toMatchObject({ code: 'invalid-argument' });
    await db().doc('sections/SEC1').delete();
    await resolveSchoolRole(deps('admin'), { requestId: r.id, approve: false, reason: 'Not your section this year' });
    const inbox = (await db().collection('guardians/teacher/inbox').get()).docs.map(d => d.data());
    expect(inbox).toEqual([expect.objectContaining({ type: 'school_access', rejected: true, body: 'Reason: Not your section this year' })]);
    expect((await db().doc(`school_role_requests/${r.id}`).get()).data().status).toBe('rejected');
  });
  it('lets a rejection through when the requester account is disabled, but not an approval', async () => {
    const r = await seedRequest('gone', 'adviser', 'SEC1');
    await expect(resolveSchoolRole(deps('admin'), { requestId: r.id, approve: true })).rejects.toMatchObject({ code: 'failed-precondition' });
    await resolveSchoolRole(deps('admin'), { requestId: r.id, approve: false, reason: 'Account no longer active' });
    expect((await db().doc(`school_role_requests/${r.id}`).get()).data().status).toBe('rejected');
    const inbox = (await db().collection('guardians/gone/inbox').get()).docs.map(d => d.data());
    expect(inbox).toEqual([expect.objectContaining({ type: 'school_access', rejected: true })]);
  });
  it('stamps direct and legacy assignments with who and how', async () => {
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1', source: 'legacy' });
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'subject_teacher', sectionId: 'SEC8' });
    expect((await loadSchoolActor(deps('teacher'))).assignments).toMatchObject([
      { source: 'legacy', assignedBy: 'admin@school.test' }, { source: 'direct', assignedBy: 'admin@school.test' }]);
  });
  it('requires an administrator for personal-email requests', async () => {
    const r = await seedRequest('personal', 'adviser', 'SEC1');
    await expect(resolveSchoolRole(deps('curriculum'), { requestId: r.id, approve: true, reason: 'Verified' })).rejects.toMatchObject({ code: 'permission-denied' });
    await resolveSchoolRole(deps('admin'), { requestId: r.id, approve: true, reason: 'Verified' });
    expect((await loadSchoolActor(deps('personal'))).assignments).toHaveLength(1);
  });
  it('rejects curriculum approvals outside their grades and subject-teacher elevation', async () => {
    const r = await seedRequest('teacher', 'adviser', 'SEC8');
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
  }, 20000); // Firestore transaction contention can back off beyond Vitest's 5s default.
  it('does not allow self-approval', async () => {
    const r = await seedRequest('curriculum', 'adviser', 'SEC1');
    await expect(resolveSchoolRole(deps('curriculum'), { requestId: r.id, approve: true, reason: 'Self' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('removes old-year access and refuses ended-year changes', async () => {
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1' });
    await db().doc(`school_years/${year}`).set({ endedAt: new Date() });
    expect((await loadSchoolActor(deps('teacher'))).assignments).toEqual([]);
    await expect(requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC1' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('tells a newly assigned teacher where to switch to School', async () => {
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1' });
    const inbox = (await db().collection('guardians/teacher/inbox').get()).docs.map(d => d.data());
    expect(inbox).toEqual([expect.objectContaining({ type: 'school_access', title: 'School access approved',
      body: 'You can now use the app for school work. Switch to School in Settings.' })]);
  });
  it('groups legacy advisers for administrators only', async () => {
    await db().doc('guardian_links/tLegacy_S1').set({ guardianUid: 'tLegacy', guardianEmail: 'legacy@example.com', guardianName: 'Legacy Teacher',
      studentId: 'S1', status: 'active', schoolYear: '2026-2027', slot: 'adviser', relationship: 'Adviser' });
    const context = await getSchoolContext(deps('admin'));
    expect(context).not.toHaveProperty('requests');
    expect(context).not.toHaveProperty('reviewRequests');
    expect(context.legacyAdvisers).toEqual([{ guardianUid: 'tLegacy', email: 'legacy@example.com', name: 'Legacy Teacher', learnerCount: 1, suggestedSectionId: 'SEC1' }]);
    expect((await getSchoolContext(deps('teacher')))).not.toHaveProperty('legacyAdvisers');
    const curriculum = await getSchoolContext(deps('curriculum'));
    expect(curriculum).not.toHaveProperty('managedAssignments');
    expect(curriculum).not.toHaveProperty('legacyAdvisers');
    expect(curriculum).not.toHaveProperty('migrationCandidates');
  });
});

describe('teacher requests', () => {
  it('records a pending request that grants nothing, and dedupes repeats', async () => {
    const first = await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC1' });
    const again = await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC1' });
    expect(again.id).toBe(first.id);
    expect((await db().doc(`school_role_requests/${first.id}`).get()).data()).toMatchObject({ uid: 'teacher', email: 'teacher@deped.gov.ph',
      emailVerified: true, role: 'adviser', sectionId: 'SEC1', gradeLevel: 7, schoolYear: year, status: 'pending' });
    expect((await loadSchoolActor(deps('teacher'))).assignments).toEqual([]);
    const audit = (await db().collection('audit_log').get()).docs.map(d => d.data());
    expect(audit).toEqual([expect.objectContaining({ action: 'school.requested', details: expect.objectContaining({ teacherEmail: 'teacher@deped.gov.ph' }) })]);
  });
  it('never takes Curriculum Adviser requests', async () => {
    await expect(requestSchoolRole(deps('teacher'), { role: 'curriculum_adviser', gradeLevel: 7 }))
      .rejects.toMatchObject({ code: 'permission-denied', message: 'An administrator assigns Curriculum Adviser access.' });
  });
  it('lets a teacher withdraw only their own pending request', async () => {
    const { id } = await requestSchoolRole(deps('teacher'), { role: 'subject_teacher', sectionId: 'SEC1' });
    await expect(withdrawSchoolRequest(deps('personal'), { requestId: id })).rejects.toMatchObject({ code: 'not-found' });
    await withdrawSchoolRequest(deps('teacher'), { requestId: id });
    expect((await db().doc(`school_role_requests/${id}`).get()).data().status).toBe('withdrawn');
    await expect(withdrawSchoolRequest(deps('teacher'), { requestId: id })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('replacing and bulk approval', () => {
  it('replaces the current adviser in one audited step, administrators only', async () => {
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1' });
    const { id } = await requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC1' });
    await expect(resolveSchoolRole(deps('admin'), { requestId: id, approve: true })).rejects.toMatchObject({ code: 'already-exists' });
    await expect(replaceAdviser(deps('curriculum'), { requestId: id, reason: 'Moved' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(replaceAdviser(deps('admin'), { requestId: id })).rejects.toMatchObject({ code: 'invalid-argument' });
    await replaceAdviser(deps('admin'), { requestId: id, reason: 'Teacher moved to Grade 8' });
    expect((await loadSchoolActor(deps('teacher'))).assignments).toEqual([]);
    expect((await loadSchoolActor(deps('personal'))).assignments).toMatchObject([{ role: 'adviser', sectionId: 'SEC1', source: 'replace' }]);
    expect((await db().doc('school_adviser_locks/2026-2027_SEC1').get()).data().uid).toBe('personal');
    expect((await db().doc(`school_role_requests/${id}`).get()).data()).toMatchObject({ status: 'approved', reason: 'Teacher moved to Grade 8' });
    const replaced = (await db().collection('audit_log').where('action', '==', 'school.replaced').get()).docs.map(d => d.data().details);
    expect(replaced).toEqual([expect.objectContaining({ previousUid: 'teacher', previousEmail: 'teacher@deped.gov.ph', teacherEmail: 'teacher@gmail.com' })]);
  });
  it('refuses Replace when nobody else holds the section', async () => {
    const { id } = await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC1' });
    await expect(replaceAdviser(deps('admin'), { requestId: id, reason: 'Moved' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('bulk approval reports each request and never stops at a failure', async () => {
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC8' });
    const clean = await requestSchoolRole(deps('teacher'), { role: 'subject_teacher', sectionId: 'SEC1' });
    const taken = await requestSchoolRole(deps('personal'), { role: 'adviser', sectionId: 'SEC8' });
    const { results } = await resolveSchoolRoles(deps('admin'), { requestIds: [taken.id, clean.id, 'missing'] });
    expect(results).toEqual([
      { id: taken.id, ok: false, error: 'This section already has an adviser. An administrator must revoke that assignment first.' },
      { id: clean.id, ok: true },
      { id: 'missing', ok: false, error: 'Request not found.' },
    ]);
    await expect(resolveSchoolRoles(deps('curriculum'), { requestIds: [clean.id] })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(resolveSchoolRoles(deps('admin'), { requestIds: [] })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('tracking and queues', () => {
  it('records when an assigned teacher opens School and shows it to administrators', async () => {
    expect(await markSchoolOpened(deps('teacher'))).toEqual({ ok: false });
    expect((await db().doc('school_accounts/teacher').get()).exists).toBe(false);
    await assignSchoolRole(deps('admin'), { email: users.teacher.email, role: 'adviser', sectionId: 'SEC1' });
    expect(await markSchoolOpened(deps('teacher'))).toEqual({ ok: true });
    const [item] = (await getSchoolContext(deps('admin'))).managedAssignments.filter(a => a.uid === 'teacher');
    expect(item).toMatchObject({ role: 'adviser', source: 'direct', assignedBy: 'admin@school.test' });
    expect(typeof item.assignedAt).toBe('number');
    expect(item.lastSchoolOpenAt).toBeGreaterThanOrEqual(item.assignedAt);
  });
  it('counts pending requests for administrators only', async () => {
    await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC1' });
    await requestSchoolRole(deps('personal'), { role: 'subject_teacher', sectionId: 'SEC8' });
    expect(await getSchoolPendingCount(deps('admin'))).toEqual({ count: 2 });
    await expect(getSchoolPendingCount(deps('teacher'))).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('gives each audience its own queue, with conflicts named', async () => {
    await assignSchoolRole(deps('admin'), { email: users.personal.email, role: 'adviser', sectionId: 'SEC1' });
    const inGrade = await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC1' });
    await requestSchoolRole(deps('teacher'), { role: 'subject_teacher', sectionId: 'SEC1' });
    await requestSchoolRole(deps('teacher'), { role: 'adviser', sectionId: 'SEC8' });
    const admin = await getSchoolContext(deps('admin'));
    expect(admin.pendingRequests).toHaveLength(3);
    expect(admin.pendingRequests.find(r => r.id === inGrade.id).conflict).toEqual({ uid: 'personal', email: 'teacher@gmail.com', displayName: 'teacher@gmail.com' });
    const curriculum = await getSchoolContext(deps('curriculum'));
    expect(curriculum.reviewQueue.map(r => r.id)).toEqual([inGrade.id]);
    expect(curriculum).not.toHaveProperty('pendingRequests');
    const teacher = await getSchoolContext(deps('teacher'));
    expect(teacher.myRequests.map(r => r.status)).toEqual(['pending', 'pending', 'pending']);
    expect(teacher).not.toHaveProperty('reviewQueue');
    expect(teacher).not.toHaveProperty('pendingRequests');
  });
});
