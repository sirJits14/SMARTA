// Run against prepared source. BACKEND_RELEASE_ROOT=. checks the unadapted source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(process.env.BACKEND_RELEASE_ROOT || '.superpowers/releases/school-family/backend');
const { getSchoolRoster, setSessionAbsence, getFamilyAttendance } = await import(pathToFileURL(resolve(root, 'functions/src/handlers/sessionAttendance.js')));

// A read-only fixture boundary for unit checks while the emulator is reserved.
// The release emulator suite separately verifies persisted merge semantics.
function fixture({ uid = 'teacher', grade, hasGrade = false, sectionGrade = 7, attendancePatch = {} } = {}) {
  const year = '2026-2027', date = '2026-09-21', path = `student_attendance/SEC1_${date}`;
  const docs = new Map(Object.entries({
    'settings/app': { currentSchoolYear: year },
    'sections/SEC1': { name: 'Rizal', gradeLevel: sectionGrade, schoolYear: year },
    'students/S1': { firstName: 'Ana', lastName: 'Cruz' },
    [`enrollments/S1_${year}`]: { studentId: 'S1', sectionId: 'SEC1', schoolYear: year, status: 'enrolled' },
    'users/admin@example.com': { uid: 'admin', role: 'admin' },
    'school_accounts/teacher': { assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 }] },
    'school_accounts/curriculum': { assignments: [{ role: 'curriculum_adviser', schoolYear: year, gradeLevel: 7 }] },
    'guardian_links/family_S1': { guardianUid: 'family', studentId: 'S1', schoolYear: year, relationship: 'Mother', status: 'active' },
    [path]: { sectionId: 'SEC1', schoolYear: year, date, marks: { S1: 'L' }, timeIn: { S1: '08:12' }, ...(hasGrade ? { gradeLevel: grade } : {}), ...attendancePatch },
  }));
  const snapshot = path => ({ id: path.split('/').at(-1), exists: docs.has(path), data: () => docs.get(path) });
  const collection = name => ({ name, where() { return this; } });
  const writes = [];
  const tx = { get: async ref => ref.name ? { docs: [...docs.keys()].filter(path => path.startsWith(ref.name + '/')).map(snapshot) } : snapshot(ref.path),
    set: (ref, data) => writes.push({ path: ref.path, data }), create: (ref, data) => writes.push({ path: ref.path, data }) };
  const db = { doc: path => ({ path }), collection, runTransaction: fn => fn(tx) };
  return { deps: { db, uid, email: `${uid}@example.com`, now: () => new Date('2026-09-21T10:00:00+08:00') }, writes };
}
const input = extra => ({ sectionId: 'SEC1', studentId: 'S1', date: '2026-09-21', session: 'am', absent: true, reason: 'Class absence', expectedRevision: 0, operationId: 'op1', ...extra });
const read = deps => getSchoolRoster(deps, { sectionId: 'SEC1', date: '2026-09-21', gradeLevel: 12 });

test('legacy missing-grade roster remains available to adviser and curriculum adviser', async () => {
  for (const uid of ['teacher', 'curriculum', 'admin']) {
    const { deps } = fixture({ uid });
    const roster = await read(deps);
    assert.equal(roster.rows[0].am.status, 'L');
    assert.equal(roster.canCorrect, true);
  }
});
test('legacy correction derives grade only from the stored section and keeps base attendance', async () => {
  for (const uid of ['teacher', 'admin']) {
    const { deps, writes } = fixture({ uid });
    assert.equal((await setSessionAbsence(deps, input({ gradeLevel: 12 }))).revision, 1);
    const write = writes.find(w => w.path === 'student_attendance/SEC1_2026-09-21');
    assert.equal(write.data.gradeLevel, 7);
    assert.equal(write.data.sessionOverrides.S1.am.absent, true);
    assert.equal(Object.hasOwn(write.data, 'marks'), false);
  }
});
test('legacy family details use an approved family link without requiring a bulk migration', async () => {
  const { deps } = fixture({ uid: 'family' });
  assert.equal((await getFamilyAttendance(deps, { studentId: 'S1', date: '2026-09-21' })).am.status, 'L');
});
test('valid historical grade remains authoritative and mismatching school scope is denied', async () => {
  for (const uid of ['teacher', 'curriculum']) {
    const { deps } = fixture({ uid, hasGrade: true, grade: 8 });
    await assert.rejects(() => read(deps), { code: 'permission-denied' });
    await assert.rejects(() => setSessionAbsence(deps, input()), { code: 'permission-denied' });
  }
  const { deps, writes } = fixture({ uid: 'admin', hasGrade: true, grade: 8 });
  await setSessionAbsence(deps, input());
  assert.equal(writes.find(w => w.path.startsWith('student_attendance/')).data.gradeLevel, 8);
});
test('explicit invalid stored grades fail closed even for administrators', async () => {
  for (const grade of [null, '7', 6, 13, 7.5]) {
    const { deps } = fixture({ uid: 'admin', hasGrade: true, grade });
    await assert.rejects(() => read(deps), { code: 'failed-precondition' });
    await assert.rejects(() => setSessionAbsence(deps, input()), { code: 'failed-precondition' });
  }
});
test('missing grade cannot bypass current section scope or malformed section metadata', async () => {
  await assert.rejects(() => read(fixture({ sectionGrade: 8 }).deps), { code: 'permission-denied' });
  await assert.rejects(() => read(fixture({ uid: 'admin', sectionGrade: '7' }).deps), { code: 'failed-precondition' });
});
test('legacy fallback never repairs unrelated attendance identity mismatches', async () => {
  for (const attendancePatch of [{ sectionId: 'SEC2' }, { schoolYear: '2025-2026' }, { date: '2026-09-20' }]) {
    await assert.rejects(() => read(fixture({ uid: 'admin', attendancePatch }).deps), { code: 'failed-precondition' });
  }
});
