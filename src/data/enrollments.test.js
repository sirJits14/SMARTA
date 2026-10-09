import { beforeEach, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({
  writes: [],
  commit: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn((_db, collection, id) => ({ path: `${collection}/${id}`, id })),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('firebase/firestore', () => ({
  doc: firestore.doc, setDoc: firestore.setDoc,
  writeBatch: () => ({ set: (...args) => firestore.writes.push(args), commit: firestore.commit }),
}));
vi.mock('../firebase.js', () => ({ db: {} }));
import { enrollStudent, withdrawEnrollment } from './enrollments.js';

beforeEach(() => { firestore.writes.length = 0; firestore.commit.mockClear(); });

it.each([7, 11])('atomically aligns student scope when enrolling or transferring to grade %i', async gradeLevel => {
  await enrollStudent({ student: { id: 's1', status: 'active' }, section: { id: 'sec', gradeLevel }, schoolYear: '2026-2027' });
  expect(firestore.writes).toHaveLength(2);
  expect(firestore.writes.find(([ref]) => ref.path === 'students/s1')).toEqual([
    { path: 'students/s1', id: 's1' }, { gradeLevel, scopeSchoolYear: '2026-2027' }, { merge: true },
  ]);
  expect(firestore.writes.find(([ref]) => ref.path.startsWith('enrollments/'))[1]).toMatchObject({ gradeLevel, status: 'enrolled' });
  expect(firestore.commit).toHaveBeenCalledOnce();
});

it('does not grant student scope to an inactive student when enrolling', async () => {
  await enrollStudent({ student: { id: 's1', status: 'inactive' }, section: { id: 'sec', gradeLevel: 7 }, schoolYear: '2026-2027' });
  expect(firestore.writes.find(([ref]) => ref.path === 'students/s1')[1]).toEqual({ gradeLevel: null, scopeSchoolYear: null });
});

it('atomically clears student scope when withdrawing the active-year enrollment', async () => {
  await withdrawEnrollment('s1', '2026-2027', 'dropped');
  expect(firestore.writes).toEqual([
    [{ path: 'enrollments/s1_2026-2027', id: 's1_2026-2027' }, { status: 'dropped' }, { merge: true }],
    [{ path: 'students/s1', id: 's1' }, { gradeLevel: null, scopeSchoolYear: null }, { merge: true }],
  ]);
  expect(firestore.commit).toHaveBeenCalledOnce();
});
