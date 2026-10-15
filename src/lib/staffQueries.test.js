import { describe, it, expect, vi } from 'vitest';
import { collection, query, where, queryEqual } from 'firebase/firestore';
vi.mock('../firebase.js', async () => {
  const { initializeApp } = await import('firebase/app');
  const { getFirestore } = await import('firebase/firestore');
  return { db: getFirestore(initializeApp({ projectId: 'staff-query-tests' }, 'staff-query-tests')) };
});
import { db } from '../firebase.js';
import { staffCollectionQuery, staffResourceKey } from './staffQueries.js';

const schoolYear = '2026-2027';
const paths = ['students', 'sections', 'enrollments', 'student_attendance', 'schedules'];
describe('staff collection query authorization filters', () => {
  it.each([[{ role: 'glc', gradeLevel: 8 }, [8]], [{ role: 'jhs_coord' }, [7, 8, 9, 10]], [{ role: 'admin' }, null]])('filters a selected attendance day for %j', (me, allowed) => {
    const filters = [where('sectionId', '==', 'G8'), where('date', '==', '2026-10-10')];
    if (allowed) filters.push(where('gradeLevel', 'in', allowed));
    expect(queryEqual(staffCollectionQuery('student_attendance', { me, sectionId: 'G8', date: '2026-10-10' }),
      query(collection(db, 'student_attendance'), ...filters))).toBe(true);
  });
  it.each([undefined, null])('does not query before the profile is available (%s)', me => {
    expect(staffCollectionQuery('students', { me, schoolYear })).toBeNull();
  });
  it.each([{ role: 'admin' }, { role: 'registrar' }, {}])('preserves administrator access (%j)', me => {
    for (const path of paths) expect(queryEqual(staffCollectionQuery(path, { me, schoolYear }), query(collection(db, path)))).toBe(true);
  });
  it.each([
    [{ role: 'jhs_coord' }, [7, 8, 9, 10]],
    [{ role: 'shs_coord' }, [11, 12]],
    [{ role: 'glc', gradeLevel: '9' }, [9]],
  ])('constrains every roster collection for %j', (me, allowed) => {
    for (const path of ['sections', 'enrollments', 'student_attendance']) {
      expect(queryEqual(staffCollectionQuery(path, { me, schoolYear }), query(collection(db, path), where('gradeLevel', 'in', allowed)))).toBe(true);
    }
    expect(queryEqual(staffCollectionQuery('students', { me, schoolYear }), query(collection(db, 'students'),
      where('scopeSchoolYear', '==', '2026-2027'), where('gradeLevel', 'in', allowed)))).toBe(true);
    expect(queryEqual(staffCollectionQuery('schedules', { me, schoolYear }), query(collection(db, 'schedules'),
      where('gradeLevels', 'array-contains-any', allowed)))).toBe(true);
  });
  it.each([{ role: 'unknown' }, { role: 'glc', gradeLevel: 6 }, { role: 'glc' }])('fails closed for invalid scope (%j)', me => {
    for (const path of paths) expect(staffCollectionQuery(path, { me, schoolYear })).toBeNull();
  });
  it.each([undefined, null, '', '2026/2027', '2026-27', 2026, ' 2026-2027 ', 'abcd-efgh', '2026-2027\n'])('does not read coordinator students without a canonical active school year (%s)', schoolYear => {
    expect(staffCollectionQuery('students', { me: { role: 'jhs_coord' }, schoolYear })).toBeNull();
  });
  it('does not expose an unsupported collection to coordinators', () => {
    expect(staffCollectionQuery('guardians', { me: { role: 'jhs_coord' }, schoolYear })).toBeNull();
  });
});

describe('staff resource key', () => {
  const base = { schoolYear, sectionId: 'G8', date: '2026-10-10' };
  const keyFor = (over = {}) => staffResourceKey('student_attendance', { me: { role: 'glc', gradeLevel: 8 }, ...base, ...over });
  it('never shares a key between no profile, a role-less admin, and an admin', () => {
    const keys = [undefined, { email: 'a@x' }, { role: 'admin' }].map(me => staffResourceKey('students', { me, schoolYear }));
    expect(new Set(keys).size).toBe(3);
  });
  it('is stable for the same inputs', () => {
    expect(keyFor()).toBe(keyFor());
  });
  it.each([
    ['gradeLevel', { me: { role: 'glc', gradeLevel: 9 } }],
    ['schoolYear', { schoolYear: '2027-2028' }],
    ['sectionId', { sectionId: 'G9' }],
    ['date', { date: '2026-10-11' }],
  ])('changes when %s changes', (_name, over) => {
    expect(keyFor(over)).not.toBe(keyFor());
  });
  it('treats an undefined and a null role as the same legacy administrator', () => {
    expect(staffResourceKey('students', { me: { role: undefined }, schoolYear })).toBe(staffResourceKey('students', { me: { role: null }, schoolYear }));
  });
  it('changes with the collection path', () => {
    expect(staffResourceKey('students', { me: { role: 'admin' } })).not.toBe(staffResourceKey('sections', { me: { role: 'admin' } }));
  });
});
