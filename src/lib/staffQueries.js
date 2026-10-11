import { collection, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { scopedGrades } from '../../shared/staffRoles.js';

// Queries must prove the same grade boundary as the Firestore read rules.
export function staffCollectionQuery(path, { me, schoolYear, sectionId, date } = {}) {
  if (!me) return null;
  const allowed = scopedGrades(me);
  // Attendance taking needs an empty successful query before the first save.
  // A missing document get cannot prove a coordinator's grade boundary.
  if (path === 'student_attendance' && (sectionId !== undefined || date !== undefined)) {
    if (!sectionId || !date || (allowed !== null && !allowed.length)) return null;
    const filters = [where('sectionId', '==', sectionId), where('date', '==', date)];
    if (allowed !== null) filters.push(where('gradeLevel', 'in', allowed));
    return query(collection(db, path), ...filters);
  }
  if (allowed === null) return query(collection(db, path));
  if (!allowed.length) return null;
  if (path === 'students') {
    if (typeof schoolYear !== 'string' || !/^[0-9]{4}-[0-9]{4}$/.test(schoolYear)) return null;
    return query(collection(db, path), where('scopeSchoolYear', '==', schoolYear), where('gradeLevel', 'in', allowed));
  }
  if (['sections', 'enrollments', 'student_attendance'].includes(path)) {
    return query(collection(db, path), where('gradeLevel', 'in', allowed));
  }
  if (path === 'schedules') return query(collection(db, path), where('gradeLevels', 'array-contains-any', allowed));
  return null;
}
