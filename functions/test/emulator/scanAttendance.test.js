import { beforeEach, describe, expect, it } from 'vitest';
import { db, clearAll, seedSchool, fakeMessaging, scanDoc, ts } from './helpers.js';
import { handleScanEvent } from '../../src/handlers/scanEvent.js';
import { clearCache } from '../../src/cache.js';

const deps = () => ({ db: db(), messaging: fakeMessaging(), portalUrl: 'https://p.test', now: () => new Date('2026-09-21T08:00:00+08:00') });
const attendance = () => db().doc('student_attendance/SEC1_2026-09-21');
async function run(id, data = scanDoc()) {
  await db().doc(`scan_events/${id}`).set(data);
  return handleScanEvent(deps(), { eventId: id, data });
}
beforeEach(async () => { await clearAll(); clearCache(); await seedSchool();
  await db().doc('sections/SEC1').update({ scheduleId: 'AM' });
  await db().doc('schedules/AM').set({ timeIn: '07:30', timeOut: '17:00' });
  await db().doc('enrollments/S2_2026-2027').set({ studentId: 'S2', sectionId: 'SEC1', schoolYear: '2026-2027', status: 'enrolled' });
});

describe('server-derived kiosk attendance', () => {
  it('derives grade from the trusted section instead of kiosk input', async () => {
    await run('grade', scanDoc({ gradeLevel: 12 }));
    expect((await attendance().get()).data()?.gradeLevel).toBe(7);
  });
  it.each([null, '7', 6, 13])('rejects invalid trusted section grade %s without writing attendance', async gradeLevel => {
    await db().doc('sections/SEC1').update({ gradeLevel });
    expect((await run('invalid_grade')).outcome).toBe('rejected:grade');
    expect((await attendance().get()).exists).toBe(false);
  });
  it('initializes the enrolled roster and applies an on-time entry with a server receipt', async () => {
    await run('entry');
    expect((await attendance().get()).data()).toMatchObject({ sectionId: 'SEC1', date: '2026-09-21', schoolYear: '2026-2027', rosterInitialized: true, marks: { S1: 'P', S2: 'A' }, timeIn: { S1: '07:12' } });
    expect((await db().doc('scan_events/entry').get()).data().attendanceResult).toMatchObject({ status: 'applied', mark: 'P', date: '2026-09-21', scanTime: '07:12' });
  });
  it('uses the trusted schedule to mark a first late entry', async () => {
    await run('late', scanDoc({ scannedAt: ts('2026-09-21T07:31:00+08:00'), receivedAt: ts('2026-09-21T07:31:10+08:00'), scannedTime: '07:31' }));
    expect((await attendance().get()).data()?.marks?.S1).toBe('L');
  });
  it('preserves staff marks and applies exit without inventing an entrance', async () => {
    await attendance().set({ marks: { S1: 'E', S2: 'P' } });
    await run('exit', scanDoc({ kind: 'out' }));
    expect((await attendance().get()).data()).toMatchObject({ marks: { S1: 'E', S2: 'P' }, timeOut: { S1: '07:12' } });
    expect((await attendance().get()).data().timeIn).toBeUndefined();
  });
  it('does not reapply an event after staff subsequently change attendance', async () => {
    const event = scanDoc();
    await run('repeat', event);
    await attendance().set({ marks: { S1: 'E' }, timeIn: { S1: '08:15' } }, { merge: true });
    await handleScanEvent(deps(), { eventId: 'repeat', data: event });
    expect((await attendance().get()).data()).toMatchObject({ marks: { S1: 'E' }, timeIn: { S1: '08:15' } });
  });
  it('preserves all six learners when six gates first scan the same section concurrently', async () => {
    const batch = db().batch();
    for (let n = 1; n <= 6; n++) {
      batch.set(db().doc(`kiosks/k${n}`), { active: true, label: `Gate ${n}` });
      batch.set(db().doc(`students/S${n}`), { firstName: `Learner ${n}`, lastName: 'Test' });
      batch.set(db().doc(`enrollments/S${n}_2026-2027`), { studentId: `S${n}`, sectionId: 'SEC1', schoolYear: '2026-2027', status: 'enrolled' });
    }
    await batch.commit();
    await Promise.all(Array.from({ length: 6 }, (_, i) => run(`gate${i+1}`, scanDoc({ deviceId: `k${i+1}`, studentId: `S${i+1}` }))));
    expect((await attendance().get()).data()?.marks).toEqual({ S1: 'P', S2: 'P', S3: 'P', S4: 'P', S5: 'P', S6: 'P' });
    expect(Object.keys((await attendance().get()).data().timeIn)).toHaveLength(6);
  }, 30000);
  it('does not let an older arriving scan move the latest entrance backwards', async () => {
    await run('later', scanDoc({ scannedAt: ts('2026-09-21T08:00:00+08:00'), receivedAt: ts('2026-09-21T08:00:01+08:00') }));
    await run('earlier');
    expect((await attendance().get()).data()?.timeIn?.S1).toBe('08:00');
  });
  it('derives the attendance calendar from timestamps rather than forged client strings', async () => {
    await run('forged_calendar', scanDoc({ scannedDate: '2000-01-01', scannedTime: '00:00' }));
    expect((await attendance().get()).data()?.timeIn?.S1).toBe('07:12');
    expect((await db().doc('student_attendance/SEC1_2000-01-01').get()).exists).toBe(false);
  });
  it('rejects an invalid timestamp without writing attendance or a parent projection', async () => {
    const result = await run('bad_time', scanDoc({ scannedAt: 'not a timestamp' }));
    expect(result.outcome).toBe('rejected:invalid');
    expect((await attendance().get()).exists).toBe(false);
    expect((await db().doc('learners/S1').get()).exists).toBe(false);
  });
  it('does not trust a cached device approval after deactivation', async () => {
    await run('approved');
    await db().doc('kiosks/k1').update({ active: false });
    const result = await run('disabled', scanDoc({ kind: 'out' }));
    expect(result.outcome).toBe('rejected:device');
    expect((await attendance().get()).data().timeOut).toBeUndefined();
  });
  it('persists a rejection receipt when enrollment changes after raw event acceptance', async () => {
    const data = scanDoc(); await db().doc('scan_events/withdrawn').set(data);
    await db().doc('enrollments/S1_2026-2027').update({ status: 'withdrawn' });
    expect((await handleScanEvent(deps(), { eventId: 'withdrawn', data })).outcome).toBe('rejected:enrollment');
    expect((await db().doc('scan_events/withdrawn').get()).data().attendanceResult).toMatchObject({ status: 'rejected', reason: 'enrollment' });
    expect((await attendance().get()).exists).toBe(false);
  });
  it('preserves the chosen calendar of a historical staff event', async () => {
    await run('historical', scanDoc({ source: 'staff', deviceId: 'staff', scannedAt: ts('2026-09-18T08:15:00+08:00'), scannedDate: '2026-09-18', scannedTime: '08:15' }));
    expect((await db().doc('learners/S1/events/historical').get()).data()).toMatchObject({ scannedDate: '2026-09-18', scannedTime: '08:15' });
  });
});
