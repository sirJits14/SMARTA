import { beforeEach, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({ batches: [], nextId: 0, existing: new Map() }));
vi.mock('firebase/firestore', () => ({
  collection: (_db, path) => ({ path }),
  doc: (first, path, id) => path ? { path: `${path}/${id}`, id } : { path: `${first.path}/generated-${++firestore.nextId}`, id: `generated-${firestore.nextId}` },
  getDoc: async ref => ({ exists: () => firestore.existing.has(ref.id), data: () => firestore.existing.get(ref.id) }),
  addDoc: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(),
  writeBatch: () => {
    const writes = [];
    return { set: (...args) => writes.push(args), commit: async () => firestore.batches.push(writes) };
  },
}));
vi.mock('../firebase.js', () => ({ db: {} }));
import { commitImportPlan } from './studentImport.js';

beforeEach(() => { firestore.batches.length = 0; firestore.nextId = 0; firestore.existing.clear(); });
const row = i => ({ kind: 'new', student: { lrn: String(i), gradeLevel: 12, scopeSchoolYear: 'spoofed' }, gradeLevel: 8, sectionKey: '8::rizal', enrollType: 'new' });

it('keeps every student scope write with its enrollment across the 500-write boundary', async () => {
  const result = await commitImportPlan({
    plan: { newSections: [{ key: '8::rizal', name: 'Rizal', gradeLevel: 8 }], results: Array.from({ length: 251 }, (_, i) => row(i)) },
    sections: [], schoolYear: '2026-2027',
  });
  expect(result).toEqual({ studentsWritten: 251, sectionsCreated: 1 });
  expect(firestore.batches.length).toBeGreaterThan(1);
  for (const batch of firestore.batches) {
    expect(batch.length).toBeLessThanOrEqual(500);
    for (const [ref, data] of batch.filter(([ref]) => ref.path.startsWith('students/'))) {
      expect(data).toMatchObject({ gradeLevel: 8, scopeSchoolYear: '2026-2027' });
      expect(batch.find(([enrollmentRef]) => enrollmentRef.path === `enrollments/${ref.id}_2026-2027`)).toBeDefined();
    }
    for (const [, data] of batch.filter(([ref]) => ref.path.startsWith('enrollments/'))) {
      expect(batch.find(([ref]) => ref.path === `students/${data.studentId}`)).toBeDefined();
    }
  }
});

it('keeps an existing inactive student unscoped during import', async () => {
  firestore.existing.set('inactive', { status: 'inactive', gradeLevel: 7, scopeSchoolYear: '2025-2026' });
  await commitImportPlan({ plan: { newSections: [], results: [{ ...row(1), kind: 'update', existingStudentId: 'inactive' }] }, sections: [{ id: 'sec', gradeLevel: 8, name: 'Rizal', schoolYear: '2026-2027' }], schoolYear: '2026-2027' });
  expect(firestore.batches[0][0][1]).toMatchObject({ gradeLevel: null, scopeSchoolYear: null });
});
