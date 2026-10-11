import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { getDocs } from 'firebase/firestore';
import { setup, seed, seedBaseline, as, ok, denied, STAFF, ADMIN_NEW, JHS, SHS, GLC8, LEGACY, KIOSK, GUARDIAN_A } from './helpers.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/firebase.js', () => ({ get db() { return state.db; } }));
import { staffCollectionQuery } from '../../src/lib/staffQueries.js';

let env;
const year = '2026-2027';
const paths = ['students', 'sections', 'enrollments', 'student_attendance', 'schedules'];
const coords = [
  ['JHS', JHS, { role: 'jhs_coord' }, 8, 11],
  ['SHS', SHS, { role: 'shs_coord' }, 11, 8],
  ['GLC8', GLC8, { role: 'glc', gradeLevel: 8 }, 8, 11],
];
const attendance = (gradeLevel, sectionId = `G${gradeLevel}`) => ({ sectionId, gradeLevel, schoolYear: year, date: '2026-10-09', marks: { S1: 'P' } });
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await seedBaseline(env);
  await seed(env, async db => {
    for (const [, who, profile] of coords) await db.doc(`users/${who.token.email}`).set(profile);
    await db.doc(`users/${ADMIN_NEW.token.email}`).set({ role: 'admin' });
    for (const gradeLevel of [7, 8, 9, 10, 11, 12]) {
      await db.doc(`students/G${gradeLevel}`).set({ gradeLevel, scopeSchoolYear: year });
      await db.doc(`sections/G${gradeLevel}`).set({ gradeLevel, schoolYear: year });
      await db.doc(`enrollments/G${gradeLevel}`).set({ gradeLevel, schoolYear: '2025-2026' });
      await db.doc(`student_attendance/G${gradeLevel}`).set({ ...attendance(gradeLevel), schoolYear: '2025-2026' });
      await db.doc(`schedules/G${gradeLevel}`).set({ gradeLevels: [gradeLevel] });
    }
    for (const path of paths) await db.doc(`${path}/MISSING`).set({ name: 'Legacy metadata absent' });
    await db.doc('students/OLD').set({ gradeLevel: 8, scopeSchoolYear: '2025-2026' });
    await db.doc('students/CLEARED').set({ gradeLevel: null, scopeSchoolYear: null });
    await db.doc('schedules/SHARED').set({ gradeLevels: [8, 11] });
    await db.doc('schedules/EMPTY').set({ gradeLevels: [] });
  });
});

describe('coordinator direct reads and list isolation', () => {
  for (const [name, who, me, inside, outside] of coords) {
    it(`${name} reads each assigned grade and denies direct out-of-grade reads`, async () => {
      for (const path of paths) {
        await ok(as(env, who).doc(`${path}/G${inside}`).get());
        await denied(as(env, who).doc(`${path}/G${outside}`).get());
      }
    });
    it(`${name} denies every broad roster list`, async () => {
      for (const path of paths) await denied(as(env, who).collection(path).get());
    });
    it(`${name} accepts the real app query builder and only returns assigned scope`, async () => {
      state.db = as(env, who);
      for (const path of paths) {
        const result = await ok(getDocs(staffCollectionQuery(path, { me, schoolYear: year })));
        expect(result.docs.some(doc => doc.id === `G${inside}`)).toBe(true);
        expect(result.docs.some(doc => ['MISSING', 'OLD', 'CLEARED', `G${outside}`].includes(doc.id))).toBe(false);
      }
    });
    it(`${name} denies filtered queries requesting another grade`, async () => {
      for (const path of paths) {
        const ref = as(env, who).collection(path);
        const q = path === 'schedules' ? ref.where('gradeLevels', 'array-contains', outside) : ref.where('gradeLevel', '==', outside);
        await denied((path === 'students' ? q.where('scopeSchoolYear', '==', year) : q).get());
      }
    });
    it(`${name} denies missing or incorrectly typed scope metadata`, async () => {
      for (const path of paths) {
        await denied(as(env, who).doc(`${path}/MISSING`).get());
        await seed(env, db => db.doc(`${path}/INVALID`).set(path === 'schedules' ? { gradeLevels: String(inside) } : { gradeLevel: String(inside), scopeSchoolYear: year }));
        await denied(as(env, who).doc(`${path}/INVALID`).get());
      }
    });
  }
  it('full students require the active year, including filtered lists', async () => {
    await denied(as(env, GLC8).doc('students/OLD').get());
    await denied(as(env, GLC8).doc('students/CLEARED').get());
    await denied(as(env, GLC8).collection('students').where('gradeLevel', '==', 8).get());
    await denied(as(env, GLC8).collection('students').where('gradeLevel', '==', 8).where('scopeSchoolYear', '==', '2025-2026').get());
    await seed(env, db => db.doc('settings/app').update({ currentSchoolYear: '2027-2028' }));
    await denied(as(env, GLC8).doc('students/G8').get());
  });
  for (const [label, scopeFields, currentSchoolYear] of [
    ['missing student year with null setting', {}, null],
    ['null student year with null setting', { scopeSchoolYear: null }, null],
    ['empty year', { scopeSchoolYear: '' }, ''],
    ['numeric year', { scopeSchoolYear: 2026 }, 2026],
    ['malformed year', { scopeSchoolYear: '2026/2027' }, '2026/2027'],
    ['partial year', { scopeSchoolYear: '2026-27' }, '2026-27'],
  ]) {
    it(`student reads fail closed for ${label} even when scope matches the setting`, async () => {
      await seed(env, async db => {
        await db.doc('settings/app').set({ currentSchoolYear });
        await db.doc('students/BADYEAR').set({ gradeLevel: 8, ...scopeFields });
      });
      await denied(as(env, GLC8).doc('students/BADYEAR').get());
      if ('scopeSchoolYear' in scopeFields) {
        await denied(as(env, GLC8).collection('students').where('gradeLevel', '==', 8)
          .where('scopeSchoolYear', '==', currentSchoolYear).get());
      }
      await ok(as(env, STAFF).doc('students/BADYEAR').get());
    });
  }
  it('historical enrollment and attendance retain their own grade scope', async () => {
    await ok(as(env, GLC8).doc('enrollments/G8').get());
    await ok(as(env, GLC8).doc('student_attendance/G8').get());
    await denied(as(env, SHS).doc('enrollments/G8').get());
    await denied(as(env, SHS).doc('student_attendance/G8').get());
  });
  it('a shared schedule is readable by either audience and denies unrelated grades', async () => {
    await ok(as(env, GLC8).doc('schedules/SHARED').get());
    await ok(as(env, SHS).doc('schedules/SHARED').get());
    await seed(env, db => db.doc(`users/${LEGACY.token.email}`).set({ role: 'glc', gradeLevel: 9 }));
    await denied(as(env, LEGACY).doc('schedules/SHARED').get());
    await denied(as(env, GLC8).doc('schedules/EMPTY').get());
  });
  it('invalid, disabled, or uid-mismatched profiles grant no scoped reads', async () => {
    for (const profile of [{ role: 'unknown' }, { role: 'glc', gradeLevel: 6 }, { role: 'glc', gradeLevel: 8, disabled: true }, { role: 'glc', gradeLevel: 8, uid: 'another' }]) {
      await seed(env, db => db.doc(`users/${LEGACY.token.email}`).set(profile));
      await denied(as(env, LEGACY).doc('sections/G8').get());
    }
  });
  it('legacy numeric-string GLC grades mirror the shared role policy', async () => {
    const me = { role: 'glc', gradeLevel: '8' };
    await seed(env, db => db.doc(`users/${LEGACY.token.email}`).set(me));
    await ok(as(env, LEGACY).doc('sections/G8').get());
    await denied(as(env, LEGACY).doc('sections/G11').get());
    state.db = as(env, LEGACY);
    const result = await ok(getDocs(staffCollectionQuery('students', { me, schoolYear: year })));
    expect(result.docs.map(doc => doc.id)).toEqual(['G8']);
  });
});

describe('attendance authoritative grade writes', () => {
  it('boots an empty assigned-section day and reads the first created record through the app query', async () => {
    state.db = as(env, GLC8);
    const q = () => staffCollectionQuery('student_attendance', { me: { role: 'glc', gradeLevel: 8 }, sectionId: 'G8', date: '2026-10-10' });
    expect((await ok(getDocs(q()))).size).toBe(0);
    await denied(as(env, GLC8).doc('student_attendance/G8_2026-10-10').get());
    await ok(as(env, GLC8).doc('student_attendance/G8_2026-10-10').set({ ...attendance(8), date: '2026-10-10' }));
    expect((await ok(getDocs(q()))).docs.map(d => d.id)).toEqual(['G8_2026-10-10']);
    await denied(as(env, GLC8).collection('student_attendance').where('sectionId', '==', 'G8').where('date', '==', '2026-10-10').get());
  });
  it('preserves historical grade while the same section current grade changes', async () => {
    await seed(env, async db => {
      await db.doc('student_attendance/G7_2026-10-09').set(attendance(7));
      await db.doc('sections/G7').update({ gradeLevel: 8 });
    });
    await ok(as(env, JHS).doc('student_attendance/G7_2026-10-09').update({ marks: { S1: 'A' } }));
    await denied(as(env, JHS).doc('student_attendance/G7_2026-10-09').update({ gradeLevel: 8 }));
    await denied(as(env, STAFF).doc('student_attendance/G7_2026-10-09').update({ gradeLevel: 8 }));
    await denied(as(env, GLC8).doc('student_attendance/G7_2026-10-09').update({ marks: { S1: 'E' } }));
    await seed(env, db => db.doc(`users/${LEGACY.token.email}`).set({ role: 'glc', gradeLevel: 7 }));
    await denied(as(env, LEGACY).doc('student_attendance/G7_2026-10-09').update({ marks: { S1: 'E' } }));
    await ok(as(env, JHS).doc('student_attendance/G7_2026-10-10').set({ ...attendance(8, 'G7'), date: '2026-10-10' }));
  });
  it('coordinators create and edit only section-matching grade metadata', async () => {
    await ok(as(env, GLC8).doc('student_attendance/NEW').set(attendance(8)));
    await ok(as(env, GLC8).doc('student_attendance/NEW').update({ marks: { S1: 'A' } }));
    await denied(as(env, GLC8).doc('student_attendance/NEW').update({ gradeLevel: 11 }));
    await denied(as(env, GLC8).doc('student_attendance/NEW').update({ sectionId: 'G11' }));
    await denied(as(env, GLC8).doc('student_attendance/NEW').delete());
  });
  it('forged, missing, invalid grades or sections cannot authorize a write', async () => {
    for (const data of [attendance(8, 'G11'), { ...attendance(8), gradeLevel: null }, { ...attendance(8), gradeLevel: '8' }, { ...attendance(8), gradeLevel: 6 }, { ...attendance(8), sectionId: 'ABSENT' }]) {
      await denied(as(env, JHS).doc('student_attendance/FORGED').set(data));
    }
    const { gradeLevel, ...missing } = attendance(8);
    await denied(as(env, JHS).doc('student_attendance/FORGED').set(missing));
  });
  it('cannot take over an attendance record whose previous section or grade is outside scope', async () => {
    await denied(as(env, GLC8).doc('student_attendance/G11').set(attendance(8)));
    await seed(env, db => db.doc('student_attendance/MISSCOPED').set(attendance(11, 'G8')));
    await denied(as(env, GLC8).doc('student_attendance/MISSCOPED').set(attendance(8)));
  });
  it('administrators can manually repair metadata, but new grades must match a section', async () => {
    await ok(as(env, STAFF).doc('student_attendance/MISSING').set(attendance(8)));
    await denied(as(env, STAFF).doc('student_attendance/FORGED').set(attendance(11, 'G8')));
    await ok(as(env, STAFF).doc('student_attendance/MISSING').delete());
  });
});

it('administrators and active kiosks keep broad reads, guardians retain linked projections only', async () => {
  for (const path of paths) {
    for (const who of [STAFF, ADMIN_NEW, KIOSK]) {
      await ok(as(env, who).collection(path).get());
      await ok(as(env, who).doc(`${path}/MISSING`).get());
    }
    await denied(as(env, GUARDIAN_A).collection(path).get());
  }
  await ok(as(env, GUARDIAN_A).doc('learners/S1').get());
  await denied(as(env, GUARDIAN_A).doc('learners/S2').get());
  await denied(as(env, KIOSK).doc('student_attendance/KIOSK').set(attendance(8)));
});
