import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { localDate } from '../lib/dates.js';

export const attendanceId = (sectionId, date) => `${sectionId}_${date}`;

export const saveMarks = ({ sectionId, date, schoolYear, marks }) =>
  setDoc(doc(db, 'student_attendance', attendanceId(sectionId, date)),
    { sectionId, date, schoolYear, marks, updatedAt: localDate() }, { merge:true });
