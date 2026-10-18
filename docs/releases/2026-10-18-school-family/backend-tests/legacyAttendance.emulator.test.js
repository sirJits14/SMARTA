// Copied into the prepared Functions package; do not run against live services.
import { beforeEach, describe, expect, it } from 'vitest';
import { db, auth, clearAll, clearAllAuthUsers, seedSchool, fakeMessaging, scanDoc, ts } from './helpers.js';
import { getSchoolRoster, setSessionAbsence, getFamilyAttendance } from '../../src/handlers/sessionAttendance.js';
import { handleScanEvent } from '../../src/handlers/scanEvent.js';
import { clearCache } from '../../src/cache.js';

const now = () => new Date('2026-09-21T13:20:00+08:00');
const deps = (uid = 'teacher') => ({ db: db(), auth: auth(), uid, email: `${uid}@example.com`, now, messaging: fakeMessaging(), portalUrl: 'https://p.test' });
const input = extra => ({ sectionId: 'SEC1', studentId: 'S1', date: '2026-09-21', session: 'am', absent: true, reason: 'Absent from class', expectedRevision: 0, operationId: 'legacy1', ...extra });
const ref = () => db().doc('student_attendance/SEC1_2026-09-21');
const roster = uid => getSchoolRoster(deps(uid), { sectionId: 'SEC1', date: '2026-09-21', gradeLevel: 12 });
beforeEach(async () => {
  clearCache(); await clearAll(); await clearAllAuthUsers(); await seedSchool();
  for (const uid of ['teacher', 'curriculum', 'other', 'admin']) await auth().createUser({ uid, email: `${uid}@example.com`, emailVerified: true });
  await db().doc('users/admin@example.com').set({ uid: 'admin', role: 'admin' });
  await db().doc('school_accounts/teacher').set({ assignments: [{ role: 'adviser', schoolYear: '2026-2027', sectionId: 'SEC1', gradeLevel: 7 }] });
  await db().doc('school_accounts/curriculum').set({ assignments: [{ role: 'curriculum_adviser', schoolYear: '2026-2027', gradeLevel: 7 }] });
  await ref().set({ sectionId: 'SEC1', schoolYear: '2026-2027', date: '2026-09-21', marks: { S1: 'L' }, timeIn: { S1: '08:12' } });
});
describe('production legacy grade compatibility', () => {
  it('reads unmodified legacy attendance as adviser, curriculum adviser, admin and approved family', async () => {
    for (const uid of ['teacher', 'curriculum', 'admin']) expect((await roster(uid)).rows[0]).toMatchObject({ am: { status: 'L' }, gate: { timeIn: '08:12' } });
    expect(await getFamilyAttendance(deps('gA'), { studentId: 'S1', date: '2026-09-21' })).toMatchObject({ am: { status: 'L' } });
    expect((await ref().get()).data()).not.toHaveProperty('gradeLevel');
  });
  it('corrects a legacy record using server section grade and restores underlying lateness', async () => {
    await setSessionAbsence(deps(), input({ gradeLevel: 12 }));
    expect((await ref().get()).data()).toMatchObject({ gradeLevel: 7, marks: { S1: 'L' }, timeIn: { S1: '08:12' }, sessionOverrides: { S1: { revision: 1, am: { absent: true } } } });
    expect((await roster('teacher')).rows[0]).toMatchObject({ am: { status: 'A' }, pm: { status: 'L' } });
    await setSessionAbsence(deps(), input({ absent: false, expectedRevision: 1, operationId: 'restore' }));
    expect((await roster('teacher')).rows[0].am.status).toBe('L');
  });
  it('allows admin correction on a legacy record', async () => {
    await setSessionAbsence(deps('admin'), input());
    expect((await roster('admin')).rows[0].am.status).toBe('A');
    expect((await db().collection('attendance_correction_audit').get()).size).toBe(1);
  });
  it('rejects unrelated accounts and current section grade mismatches', async () => {
    await expect(roster('other')).rejects.toMatchObject({ code: 'permission-denied' });
    await db().doc('sections/SEC1').update({ gradeLevel: 8 });
    await expect(roster('teacher')).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setSessionAbsence(deps('curriculum'), input({ gradeLevel: 7 }))).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('preserves valid historical grade and denies a mismatching grade assignment', async () => {
    await ref().update({ gradeLevel: 8 });
    for (const uid of ['teacher', 'curriculum']) {
      await expect(roster(uid)).rejects.toMatchObject({ code: 'permission-denied' });
      await expect(setSessionAbsence(deps(uid), input())).rejects.toMatchObject({ code: 'permission-denied' });
    }
    await setSessionAbsence(deps('admin'), input());
    expect((await ref().get()).data().gradeLevel).toBe(8);
  });
  it.each([null, '7', 6, 13, 7.5])('refuses explicitly invalid stored grade %s', async gradeLevel => {
    await ref().update({ gradeLevel });
    await expect(roster('admin')).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(setSessionAbsence(deps('admin'), input())).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('later PM scan keeps the AM correction and separate morning arrival', async () => {
    await db().doc('schedules/split').set({ timeIn: '07:30', timeOut: '11:30', pmTimeIn: '13:00', pmTimeOut: '16:00' });
    await db().doc('sections/SEC1').update({ scheduleId: 'split' });
    await db().doc('guardian_links/oldAdviser_S1').set({ guardianUid: 'oldAdviser', studentId: 'S1', schoolYear: '2026-2027', status: 'active', relationship: 'Adviser', slot: 'adviser' });
    await setSessionAbsence(deps(), input());
    const data = scanDoc({ scannedAt: ts('2026-09-21T13:20:00+08:00'), receivedAt: ts('2026-09-21T13:20:01+08:00'), scannedTime: '13:20' });
    await db().doc('scan_events/later_pm').set(data);
    expect(await handleScanEvent(deps(), { eventId: 'later_pm', data })).toMatchObject({ outcome: 'processed' });
    expect((await ref().get()).data()).toMatchObject({ marks: { S1: 'L' }, timeIn: { S1: '08:12' }, pmTimeIn: { S1: '13:20' }, latePm: { S1: true }, sessionOverrides: { S1: { revision: 1, am: { absent: true } } } });
    expect((await roster('teacher')).rows[0]).toMatchObject({ am: { status: 'A' }, pm: { status: 'L' } });
    expect((await db().doc('scan_events/later_pm').get()).data().attendanceResult.status).toBe('applied');
    expect((await db().doc('guardians/oldAdviser/inbox/later_pm').get()).exists).toBe(false);
    expect((await db().doc('guardians/gA/inbox/later_pm').get()).exists).toBe(true);
  });
  it('new PM attendance retains live missing-grade output and informational scan notes', async () => {
    await ref().delete();
    await db().doc('schedules/split').set({ timeIn: '07:30', timeOut: '11:30', pmTimeIn: '13:00', pmTimeOut: '16:00' });
    await db().doc('sections/SEC1').update({ scheduleId: 'split' });
    const data = scanDoc({ scannedAt: ts('2026-09-21T13:20:00+08:00'), receivedAt: ts('2026-09-21T13:20:01+08:00'), scannedTime: '13:20' });
    await db().doc('scan_events/first_pm').set(data);
    await handleScanEvent(deps(), { eventId: 'first_pm', data });
    const attendance = (await ref().get()).data();
    expect(attendance).not.toHaveProperty('gradeLevel');
    expect(attendance).toMatchObject({ marks: { S1: 'P' }, pmTimeIn: { S1: '13:20' }, absentAm: { S1: true }, latePm: { S1: true } });
    // The released PM flags are informational notes. Formal session status
    // follows the retained base mark until staff apply an audited override.
    expect((await roster('teacher')).rows[0]).toMatchObject({ am: { status: 'P' }, pm: { status: 'P' }, gate: { pmTimeIn: '13:20' } });
  });
});
