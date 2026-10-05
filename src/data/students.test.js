import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => {
  const sets = [];
  const commit = vi.fn().mockResolvedValue(undefined);
  return {
    sets,
    commit,
    collection: vi.fn((_db, name) => ({ kind: 'collection', path: name })),
    doc: vi.fn((first, collectionName, id) => {
      if (first?.kind === 'collection') return { kind: 'doc', path: `${first.path}/generated-student`, id: 'generated-student' };
      return { kind: 'doc', path: `${collectionName}/${id}`, id };
    }),
    addDoc: vi.fn().mockResolvedValue({ id: 'added-student' }),
    setDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn(() => ({
      set: (...args) => sets.push(args),
      commit,
    })),
  };
});

vi.mock('firebase/firestore', () => ({
  collection: firestore.collection,
  doc: firestore.doc,
  addDoc: firestore.addDoc,
  setDoc: firestore.setDoc,
  deleteDoc: firestore.deleteDoc,
  writeBatch: firestore.writeBatch,
}));
vi.mock('../firebase.js', () => ({ db: { kind: 'db' } }));

import { createStudent, saveStudentWithEnrollment, updateStudent } from './students.js';

const form = {
  lrn: '123456789012', lastName: ' Cruz ', firstName: ' Juan ', middleName: ' Dela ', extName: '',
  sex: 'M', birthdate: '2012-01-02', address: ' Poblacion ',
  guardianName: ' Maria Cruz ', guardianRelationship: ' Mother ', guardianContact: ' 0917 ',
  contactNumber: ' 0999 ', documents: { form137: true }, status: 'active', createdAt: '2026-06-01',
};

beforeEach(() => {
  firestore.sets.length = 0;
  firestore.commit.mockClear();
  firestore.addDoc.mockClear();
  firestore.setDoc.mockClear();
  firestore.writeBatch.mockClear();
});

describe('student persistence shape', () => {
  it('uses the same shaped fields for create, update, and a batch student write', async () => {
    await createStudent(form);
    await updateStudent('existing-student', form);
    await saveStudentWithEnrollment({
      form, isNew: false, id: 'existing-student', schoolYear: '2026-2027',
      enrollmentPlan: { kind: 'none' },
    });

    const createPayload = firestore.addDoc.mock.calls[0][1];
    const updatePayload = firestore.setDoc.mock.calls[0][1];
    const batchPayload = firestore.sets[0][1];
    expect(Object.keys(updatePayload).sort()).toEqual(Object.keys(createPayload).sort());
    expect(batchPayload).toEqual(updatePayload);
    expect(updatePayload.createdAt).toBe('2026-06-01');
    expect(createPayload.createdAt).not.toBe('2026-06-01');
    expect(createPayload).toMatchObject({
      lastName: 'Cruz', firstName: 'Juan', middleName: 'Dela', address: 'Poblacion',
      guardianName: 'Maria Cruz', guardianRelationship: 'Mother', guardianContact: '0917', contactNumber: '0999',
      documents: { form137: true, birthCert: false, goodMoral: false, form138: false },
    });
  });
});

describe('saveStudentWithEnrollment', () => {
  it('pre-generates a new student id and overwrites a new enrollment atomically', async () => {
    const id = await saveStudentWithEnrollment({
      form, isNew: true, schoolYear: '2026-2027',
      enrollmentPlan: {
        kind: 'enroll',
        data: { schoolYear: '2026-2027', gradeLevel: 7, sectionId: 'rizal', track: null, strand: null, type: 'transferee', dateEnrolled: '2026-09-29', status: 'enrolled' },
      },
    });

    expect(id).toBe('generated-student');
    expect(firestore.sets).toHaveLength(2);
    expect(firestore.sets[0][0].path).toBe('students/generated-student');
    expect(firestore.sets[1]).toEqual([
      { kind: 'doc', path: 'enrollments/generated-student_2026-2027', id: 'generated-student_2026-2027' },
      expect.objectContaining({ studentId: 'generated-student', sectionId: 'rizal', type: 'transferee' }),
    ]);
    expect(firestore.commit).toHaveBeenCalledOnce();
  });

  it('merges only transfer data into the existing enrollment document', async () => {
    const plan = { kind: 'transfer', data: { gradeLevel: 11, sectionId: 'stem', track: 'Academic', strand: 'STEM' } };

    const id = await saveStudentWithEnrollment({
      id: 'existing-student', form, isNew: false, enrollmentPlan: plan, schoolYear: '2026-2027',
    });

    expect(id).toBe('existing-student');
    expect(firestore.sets[0][2]).toEqual({ merge: true });
    expect(firestore.sets[1]).toEqual([
      { kind: 'doc', path: 'enrollments/existing-student_2026-2027', id: 'existing-student_2026-2027' },
      plan.data,
      { merge: true },
    ]);
    expect(firestore.commit).toHaveBeenCalledOnce();
  });

  it('does not write an enrollment document for a none plan', async () => {
    await saveStudentWithEnrollment({
      id: 'existing-student', form, isNew: false, enrollmentPlan: { kind: 'none' }, schoolYear: '2026-2027',
    });

    expect(firestore.sets).toHaveLength(1);
    expect(firestore.sets[0][0].path).toBe('students/existing-student');
    expect(firestore.commit).toHaveBeenCalledOnce();
  });
});
