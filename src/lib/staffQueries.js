import { collection, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { scopedGrades } from '../../shared/staffRoles.js';

// Queries must prove the same grade boundary as the Firestore read rules.
export function staffCollectionQuery(path, { me, schoolYear } = {}) {
  if (!me) return null;
  const allowed = scopedGrades(me);
  if (allowed === null) return query(collection(db, path));
  if (!allowed.length) return null;
  if (path === 'students') {
    if (typeof schoolYear !== 'string' || !schoolYear) return null;
    return query(collection(db, path), where('scopeSchoolYear', '==', schoolYear), where('gradeLevel', 'in', allowed));
  }
  if (['sections', 'enrollments', 'student_attendance'].includes(path)) {
    return query(collection(db, path), where('gradeLevel', 'in', allowed));
  }
  if (path === 'schedules') return query(collection(db, path), where('gradeLevels', 'array-contains-any', allowed));
  return null;
}
