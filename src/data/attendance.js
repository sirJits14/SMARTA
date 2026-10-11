import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { localDate } from '../lib/dates.js';

export const attendanceId = (sectionId, date) => `${sectionId}_${date}`;

export const saveMarks = ({ sectionId, gradeLevel, date, schoolYear, marks, existingAttendance }) => {
  if (existingAttendance) {
    if (existingAttendance.sectionId !== sectionId || existingAttendance.date !== date
        || existingAttendance.schoolYear !== schoolYear) {
      throw new Error('Attendance record does not match the selected section, date and school year.');
    }
    // Historical audience belongs to the record, even after a section edit.
    // Rules reject stale writes if the saved record has changed underneath us.
    gradeLevel = existingAttendance.gradeLevel;
  }
  if (!Number.isInteger(gradeLevel) || gradeLevel < 7 || gradeLevel > 12) {
    throw new Error('A valid section grade is required to save attendance.');
  }
  return setDoc(doc(db, 'student_attendance', attendanceId(sectionId, date)),
    { sectionId, gradeLevel, date, schoolYear, marks, updatedAt: localDate() }, { merge:true });
};
