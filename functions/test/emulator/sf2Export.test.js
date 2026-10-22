import { beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { db, clearAll, seedSchool } from './helpers.js';
import { exportSchoolSf2 } from '../../src/handlers/sf2Export.js';

const year = '2026-2027';
const now = () => new Date('2026-10-22T09:00:00+08:00');
const people = {
  teacher: { email: 'teacher@deped.gov.ph', displayName: 'Teacher Tina' }, // Class Adviser of SEC1 (Grade 7 Rizal)
  other: { email: 'other@deped.gov.ph', displayName: 'Omar Other' }, // Class Adviser of SEC2 (Grade 7 Mabini, no learners)
  admin: { email: 'admin@school.test', displayName: 'Ada Admin' },
  coord7: { email: 'coord7@school.test', displayName: 'Cora Seven' },
  ca7: { email: 'ca7@deped.gov.ph', displayName: 'Cleo Curriculum' },
};
const deps = (uid) => ({ db: db(), now, uid, email: people[uid].email, displayName: people[uid].displayName, authTime: 1792195200 });
const ask = (uid = 'teacher', over = {}) => exportSchoolSf2(deps(uid), { sectionId: 'SEC1', month: '2026-09', ...over });
const sheetOf = async (result) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(result.contentBase64, 'base64'));
  return workbook.worksheets[0];
};

beforeEach(async () => {
  await clearAll(); await seedSchool();
  const d = db();
  await d.doc('settings/app').set({ currentSchoolYear: year, schoolId: '300000', schoolName: 'Bukidnon NHS' });
  await d.doc('sections/SEC1').update({ adviserName: 'Teacher Tina' });
  await d.doc('sections/SEC2').set({ name: 'Mabini', gradeLevel: 7, schoolYear: year });
  // Ana (F) enrolled after the first Friday of June; Ben (M) before it.
  await d.doc('enrollments/S1_2026-2027').update({ gradeLevel: 7, dateEnrolled: '2026-07-10' });
  await d.doc('enrollments/S2_2026-2027').set({ studentId: 'S2', sectionId: 'SEC1', schoolYear: year, gradeLevel: 7, status: 'enrolled', dateEnrolled: '2026-06-01' });
  await d.doc('student_attendance/SEC1_2026-09-21').set({ sectionId: 'SEC1', schoolYear: year, date: '2026-09-21', marks: { S1: 'L', S2: 'A' } });
  await d.doc('student_attendance/SEC1_2026-09-23').set({ sectionId: 'SEC1', schoolYear: year, date: '2026-09-23', marks: {}, sessionOverrides: { S2: { am: { absent: true } } } });
  // A stray document under this section's id that names another section must be ignored.
  await d.doc('student_attendance/SEC1_2026-09-22').set({ sectionId: 'SEC2', schoolYear: year, date: '2026-09-22', marks: { S2: 'A' } });
  await d.doc('school_accounts/teacher').set({ assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 }] });
  await d.doc('school_accounts/other').set({ assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC2', gradeLevel: 7 }] });
  await d.doc('school_accounts/ca7').set({ assignments: [{ role: 'curriculum_adviser', schoolYear: year, gradeLevel: 7 }] });
  await d.doc('users/admin@school.test').set({ uid: 'admin', role: 'admin' });
  await d.doc('users/coord7@school.test').set({ uid: 'coord7', role: 'glc', gradeLevel: 7, name: 'Cora Seven' });
});

describe('exportSchoolSf2', () => {
  it('gives the section’s adviser the SIMS workbook for the month', async () => {
    const result = await ask();
    expect(result.filename).toBe('SF2_Rizal_2026-09.xlsx');
    expect(result.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const ws = await sheetOf(result);
    expect(['C6', 'K6', 'X6', 'C8', 'X8', 'AC8', 'AD88'].map((address) => ws.getCell(address).value))
      .toEqual(['300000', '2026-2027', 'September 2026', 'Bukidnon NHS', 7, 'Rizal', 'TEACHER TINA']);
    expect(ws.getCell('B14').value).toBe('DY, BEN');
    expect(ws.getCell('B36').value).toBe('CRUZ, ANA B.');
    expect(ws.getCell('S14').value).toBe('X'); // Monday 21 Sep, absent
    expect(ws.getCell('S36').value).toBe('L'); // Monday 21 Sep, late
    expect(ws.getCell('U14').value).toBe('½A'); // Wednesday 23 Sep, morning absence
    expect(ws.getCell('AC14').value).toBe(1.5);
    expect(ws.getCell('AD36').value).toBe(1);
    expect(ws.getCell('AG64').value).toBe(22);
    expect(ws.getCell('AJ66').value).toBe(1); // only Ben was enrolled by the first Friday of June
  });
  it('ignores a day document that names another section', async () => {
    const ws = await sheetOf(await ask());
    expect(ws.getCell('T14').value ?? '').toBe(''); // Tuesday 22 Sep stays blank (present), not an X
  });
  it('lets an administrator, a coordinator for the grade and a Curriculum Adviser export too', async () => {
    for (const uid of ['admin', 'coord7', 'ca7']) expect((await ask(uid)).filename).toBe('SF2_Rizal_2026-09.xlsx');
  });
  it('refuses an adviser of another section', async () => {
    await expect(ask('other')).rejects.toMatchObject({ code: 'permission-denied', message: 'This section is outside your attendance access.' });
  });
  it('refuses a month outside the school year, in the future, or malformed', async () => {
    for (const month of ['2026-05', '2026-11', '2027-01', '2026-13', 'garbage', undefined]) {
      await expect(ask('teacher', { month })).rejects.toMatchObject({ code: 'invalid-argument', message: 'Choose a month of this school year, up to the current month.' });
    }
    await expect(ask('teacher', { sectionId: 'a/b' })).rejects.toMatchObject({ code: 'invalid-argument', message: 'Choose a valid section.' });
    await expect(ask('teacher', { sectionId: 'NOPE' })).rejects.toMatchObject({ code: 'not-found' });
  });
  it('refuses a class with no learners', async () => {
    await expect(exportSchoolSf2(deps('other'), { sectionId: 'SEC2', month: '2026-09' }))
      .rejects.toMatchObject({ code: 'failed-precondition', message: 'There are no learners in this class yet.' });
  });
  it('stops advisers once the school year has ended', async () => {
    await db().doc(`school_years/${year}`).set({ endedAt: new Date() });
    await expect(ask()).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await ask('admin')).filename).toBe('SF2_Rizal_2026-09.xlsx');
  });
  it('limits exports to 20 an hour for each person', async () => {
    for (let i = 0; i < 20; i++) await ask();
    await expect(ask()).rejects.toMatchObject({ code: 'resource-exhausted', message: 'Too many exports. Try again in a few minutes.' });
    expect((await ask('admin')).filename).toBe('SF2_Rizal_2026-09.xlsx');
  }, 60000);
});
