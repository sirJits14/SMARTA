import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { beforeEach, expect, it } from 'vitest';
import { clearAll, db } from './helpers.js';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../../scripts/backfillCoordinatorScope.mjs', import.meta.url));
const year = '2026-2027';
beforeEach(async () => {
  await clearAll();
  const batch = db().batch();
  const records = {
    'settings/app': { currentSchoolYear: year },
    'students/S1': { firstName: 'One' },
    'students/S2': { firstName: 'Two', gradeLevel: 9, scopeSchoolYear: year },
    'students/S3': { firstName: 'Three', status: 'inactive', gradeLevel: 7, scopeSchoolYear: year },
    'enrollments/E1': { studentId: 'S1', schoolYear: year, status: 'enrolled', gradeLevel: 7 },
    'enrollments/E2': { studentId: 'S2', schoolYear: year, status: 'enrolled', gradeLevel: 8 },
    'enrollments/E3': { studentId: 'S2', schoolYear: year, status: 'enrolled', gradeLevel: 9 },
    'sections/SEC1': { gradeLevel: 7, schoolYear: year, scheduleId: 'AM' },
    'sections/SEC2': { gradeLevel: 12, schoolYear: year, scheduleId: 'AM' },
    'schedules/AM': { timeIn: '07:30' },
    'student_attendance/A1': { sectionId: 'SEC1', schoolYear: year, marks: { S1: 'P' } },
    'student_attendance/A2': { sectionId: 'missing', schoolYear: year, marks: { S2: 'A' } },
  };
  Object.entries(records).forEach(([path, data]) => batch.set(db().doc(path), data));
  await batch.commit();
});
async function snapshot() {
  const records = {};
  for (const collection of ['settings', 'students', 'enrollments', 'sections', 'schedules', 'student_attendance']) {
    for (const doc of (await db().collection(collection).get()).docs) records[doc.ref.path] = doc.data();
  }
  return records;
}
it('executes read-only dry run, applies only unambiguous metadata, and repeats as a no-op', async () => {
  const before = await snapshot();
  const dry = await run(process.execPath, [script, process.env.GCLOUD_PROJECT]);
  expect(dry.stdout).toMatch(/Dry run: 4 .*2 warning/);
  expect(await snapshot()).toEqual(before);
  const applied = await run(process.execPath, [script, process.env.GCLOUD_PROJECT, '--apply']);
  expect(applied.stdout).toMatch(/Updated 4 .*2 warning/);
  const after = await snapshot();
  expect(after).toEqual({
    ...before,
    'students/S1': { firstName: 'One', gradeLevel: 7, scopeSchoolYear: year },
    'students/S3': { firstName: 'Three', status: 'inactive', gradeLevel: null, scopeSchoolYear: null },
    'schedules/AM': { timeIn: '07:30', gradeLevels: [7, 12] },
    'student_attendance/A1': { ...before['student_attendance/A1'], gradeLevel: 7 },
  });
  const repeated = await run(process.execPath, [script, process.env.GCLOUD_PROJECT, '--apply']);
  expect(repeated.stdout).toMatch(/Updated 0 .*2 warning/);
  expect(await snapshot()).toEqual(after);
}, 30000);
it('rejects absent project and unexpected arguments before accessing a database', async () => {
  await expect(run(process.execPath, [script])).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/Usage:/) });
  await expect(run(process.execPath, [script, process.env.GCLOUD_PROJECT, '--aply'])).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/Usage:/) });
});
