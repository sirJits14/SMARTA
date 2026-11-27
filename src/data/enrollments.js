import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase.js';
import { localDate } from '../lib/dates.js';
import { studentScopeFields } from './coordinatorScope.js';

export const enrollmentId = (studentId, schoolYear) => `${studentId}_${schoolYear}`;

export async function enrollStudent({ student, section, schoolYear, type }) {
  const enrollment = {
    studentId:student.id, schoolYear, gradeLevel:section.gradeLevel, sectionId:section.id,
    track:section.track||null, strand:section.strand||null,
    type: type||'new', dateEnrolled:localDate(), status:'enrolled',
  };
  const batch = writeBatch(db);
  batch.set(doc(db, 'enrollments', enrollmentId(student.id, schoolYear)), enrollment);
  batch.set(doc(db, 'students', student.id), studentScopeFields(enrollment, schoolYear, student.status), { merge: true });
  await batch.commit();
}

export async function withdrawEnrollment(studentId, schoolYear, status) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'enrollments', enrollmentId(studentId, schoolYear)), { status }, { merge: true });
  batch.set(doc(db, 'students', studentId), studentScopeFields(null), { merge: true });
  await batch.commit();
}
