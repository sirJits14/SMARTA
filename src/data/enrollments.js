import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { localDate } from '../lib/dates.js';

export const enrollmentId = (studentId, schoolYear) => `${studentId}_${schoolYear}`;

export const enrollStudent = ({ student, section, schoolYear, type }) =>
  setDoc(doc(db, 'enrollments', enrollmentId(student.id, schoolYear)), {
    studentId:student.id, schoolYear, gradeLevel:section.gradeLevel, sectionId:section.id,
    track:section.track||null, strand:section.strand||null,
    type: type||'new', dateEnrolled:localDate(), status:'enrolled',
  });

export const withdrawEnrollment = (studentId, schoolYear, status) =>
  setDoc(doc(db, 'enrollments', enrollmentId(studentId, schoolYear)), { status }, { merge:true });
