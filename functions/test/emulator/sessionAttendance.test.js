import { beforeEach, describe, expect, it } from 'vitest';
import { db, auth, clearAll, clearAllAuthUsers, seedSchool, fakeMessaging, scanDoc } from './helpers.js';
import { getSchoolRoster, setSessionAbsence, getFamilyAttendance, handleAttendanceCorrection } from '../../src/handlers/sessionAttendance.js';
import { applyScanAttendance } from '../../src/handlers/scanAttendance.js';

const now = () => new Date('2026-09-21T10:00:00+08:00');
const deps = (uid = 'teacher') => ({ db: db(), auth: auth(), uid, email: `${uid}@example.com`, now, messaging: fakeMessaging(), portalUrl: 'https://p.test' });
const input = (over = {}) => ({ sectionId: 'SEC1', studentId: 'S1', date: '2026-09-21', session: 'am', absent: true, reason: 'Left class after arrival', expectedRevision: 0, operationId: 'op1', ...over });
beforeEach(async () => {
  await clearAll(); await clearAllAuthUsers(); await seedSchool();
  for (const uid of ['teacher', 'other', 'curriculum', 'subject', 'gA', 'admin']) await auth().createUser({ uid, email: `${uid}@example.com`, displayName: uid, emailVerified: true });
  await db().doc('users/admin@example.com').set({ uid: 'admin', role: 'admin' });
  await db().doc('school_accounts/teacher').set({ assignments: [{ role: 'adviser', schoolYear: '2026-2027', sectionId: 'SEC1', gradeLevel: 7 }] });
  await db().doc('school_accounts/curriculum').set({ assignments: [{ role: 'curriculum_adviser', schoolYear: '2026-2027', gradeLevel: 7 }] });
  await db().doc('school_accounts/subject').set({ assignments: [{ role: 'subject_teacher', schoolYear: '2026-2027', sectionId: 'SEC1', gradeLevel: 7 }] });
  await db().doc('student_attendance/SEC1_2026-09-21').set({ sectionId: 'SEC1', schoolYear: '2026-2027', gradeLevel: 7, date: '2026-09-21', marks: { S1: 'L' }, timeIn: { S1: '08:12' } });
});

describe('session corrections', () => {
  it('preserves base lateness, isolates PM, and reverses to late', async () => {
    await setSessionAbsence(deps(), input());
    let result = await getSchoolRoster(deps(), { sectionId: 'SEC1', date: '2026-09-21' });
    expect(result.rows[0]).toMatchObject({ revision: 1, gate: { timeIn: '08:12' }, am: { status: 'A' }, pm: { status: 'L' } });
    await setSessionAbsence(deps(), input({ absent: false, expectedRevision: 1, operationId: 'op2' }));
    result = await getSchoolRoster(deps(), { sectionId: 'SEC1', date: '2026-09-21' });
    expect(result.rows[0].am.status).toBe('L');
    expect((await db().doc('student_attendance/SEC1_2026-09-21').get()).data().marks.S1).toBe('L');
  });
  it('rejects subjects, unrelated accounts, earlier adviser dates and future dates', async () => {
    for (const uid of ['subject', 'other']) await expect(getSchoolRoster(deps(uid), { sectionId: 'SEC1', date: '2026-09-21' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setSessionAbsence(deps(), input({ date: '2026-09-20' }))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setSessionAbsence(deps('curriculum'), input({ date: '2026-09-22' }))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setSessionAbsence(deps(), input({ reason: ' ' }))).rejects.toMatchObject({ code: 'invalid-argument' });
    await setSessionAbsence(deps('curriculum'), input({ date: '2026-09-20' }));
  });
  it('is operation-idempotent and rejects a stale concurrent revision', async () => {
    const first = await setSessionAbsence(deps(), input());
    expect(await setSessionAbsence(deps(), input())).toEqual(first);
    await expect(setSessionAbsence(deps(), input({ operationId: 'op2' }))).rejects.toMatchObject({ code: 'aborted' });
    expect((await db().collection('attendance_corrections').get()).size).toBe(1);
    expect((await db().collection('attendance_correction_audit').get()).size).toBe(1);
  });
  it('rechecks revoked scope inside transactions', async () => {
    await db().doc('school_accounts/teacher').set({ assignments: [] });
    await expect(setSessionAbsence(deps(), input())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('allows only one concurrent update at the same revision', async () => {
    const results = await Promise.allSettled([
      setSessionAbsence(deps(), input({ operationId: 'race_am' })),
      setSessionAbsence(deps(), input({ operationId: 'race_pm', session: 'pm' })),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected').reason.code).toBe('aborted');
  });
  it('does not edit ended years or overwrite historical attendance grade metadata', async () => {
    await db().doc('student_attendance/SEC1_2026-09-21').update({ gradeLevel: 8 });
    for (const uid of ['teacher', 'curriculum']) {
      await expect(getSchoolRoster(deps(uid), { sectionId: 'SEC1', date: '2026-09-21' })).rejects.toMatchObject({ code: 'permission-denied' });
      await expect(setSessionAbsence(deps(uid), input())).rejects.toMatchObject({ code: 'permission-denied' });
    }
    await setSessionAbsence(deps('admin'), input());
    expect((await getSchoolRoster(deps('admin'), { sectionId: 'SEC1', date: '2026-09-21' })).rows[0].am.status).toBe('A');
    expect((await db().doc('student_attendance/SEC1_2026-09-21').get()).data()).toMatchObject({ gradeLevel: 8, marks: { S1: 'L' } });
    await db().doc('school_years/2026-2027').set({ endedAt: new Date() });
    for (const uid of ['teacher', 'curriculum', 'admin']) {
      await expect(setSessionAbsence(deps(uid), input({ expectedRevision: 1, operationId: 'ended' }))).rejects.toMatchObject({ code: 'failed-precondition' });
    }
  });
  it('later kiosk evidence cannot erase the absence correction', async () => {
    await setSessionAbsence(deps(), input());
    const data = scanDoc(); await db().doc('scan_events/later').set(data);
    await applyScanAttendance(db(), { eventId: 'later', data, date: '2026-09-21', scanTime: '09:00' });
    expect((await getSchoolRoster(deps(), { sectionId: 'SEC1', date: '2026-09-21' })).rows[0].am.status).toBe('A');
    expect((await db().doc('scan_events/later').get()).data().attendanceResult.status).toBe('applied');
  });
  it('only active current-year family links can read correction details and receive neutral notifications once', async () => {
    const d = deps(); await setSessionAbsence(d, input());
    const out = (await db().collection('attendance_corrections').get()).docs[0];
    await handleAttendanceCorrection(d, { id: out.id, data: out.data() });
    await handleAttendanceCorrection(d, { id: out.id, data: out.data() });
    expect(d.messaging.sent).toHaveLength(1);
    expect(d.messaging.sent[0].notification.body).not.toContain('Left class');
    expect((await db().collection('guardians/gA/inbox').get()).size).toBe(1);
    expect((await db().collection('guardians/gC/inbox').get()).size).toBe(0);
    expect(await getFamilyAttendance(deps('gA'), { studentId: 'S1', date: '2026-09-21' })).toMatchObject({ am: { status: 'A', reason: 'Left class after arrival' } });
    await db().doc('guardian_links/gA_S1').update({ relationship: 'Adviser' });
    await expect(getFamilyAttendance(deps('gA'), { studentId: 'S1', date: '2026-09-21' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('lets SIMS coordinators review and correct earlier days within their grades only', async () => {
    await auth().createUser({ uid: 'glc7', email: 'glc7@example.com' });
    await db().doc('users/glc7@example.com').set({ uid: 'glc7', role: 'glc', gradeLevel: 7 });
    await auth().createUser({ uid: 'glc8', email: 'glc8@example.com' });
    await db().doc('users/glc8@example.com').set({ uid: 'glc8', role: 'glc', gradeLevel: 8 });
    expect((await getSchoolRoster(deps('glc7'), { sectionId: 'SEC1', date: '2026-09-20' })).canCorrect).toBe(true);
    await setSessionAbsence(deps('glc7'), input({ date: '2026-09-20' }));
    await expect(getSchoolRoster(deps('glc8'), { sectionId: 'SEC1', date: '2026-09-21' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
