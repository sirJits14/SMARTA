import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { localDate } from '../lib/dates.js';

export const attendanceId = (sectionId, date) => `${sectionId}_${date}`;

export const saveMarks = ({ sectionId, gradeLevel, date, schoolYear, marks }) => {
  if (!Number.isInteger(gradeLevel) || gradeLevel < 7 || gradeLevel > 12) {
    throw new Error('A valid section grade is required to save attendance.');
  }
  return setDoc(doc(db, 'student_attendance', attendanceId(sectionId, date)),
    { sectionId, gradeLevel, date, schoolYear, marks, updatedAt: localDate() }, { merge:true });
};
