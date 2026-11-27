import { collection, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { roleOf, scopedGrades } from '../../shared/staffRoles.js';
import { passGrades } from '../../shared/tempPass.js';

const isSchoolYear = (value) => typeof value === 'string' && /^[0-9]{4}-[0-9]{4}$/.test(value);

// Everything a logistic operator may query, across all grades. Learners are limited to this school year.
function logisticQuery(path, schoolYear) {
  if (path === 'students') {
    return isSchoolYear(schoolYear) ? query(collection(db, path), where('scopeSchoolYear', '==', schoolYear)) : null;
  }
  return ['sections', 'enrollments', 'temp_passes'].includes(path) ? query(collection(db, path)) : null;
}

// Queries must prove the same grade boundary as the Firestore read rules.
export function staffCollectionQuery(path, { me, schoolYear, sectionId, date } = {}) {
  if (!me) return null;
  if (roleOf(me) === 'logistic') return logisticQuery(path, schoolYear);
  // Pass staff differ from roster staff: grade level coordinators get none.
  if (path === 'temp_passes') {
    const grades = passGrades(me);
    if (grades === null) return query(collection(db, path));
    return grades.length ? query(collection(db, path), where('gradeLevel', 'in', grades)) : null;
  }
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
    if (!isSchoolYear(schoolYear)) return null;
    return query(collection(db, path), where('scopeSchoolYear', '==', schoolYear), where('gradeLevel', 'in', allowed));
  }
  if (['sections', 'enrollments', 'student_attendance'].includes(path)) {
    return query(collection(db, path), where('gradeLevel', 'in', allowed));
  }
  if (path === 'schedules') return query(collection(db, path), where('gradeLevels', 'array-contains-any', allowed));
  return null;
}

// Names everything staffCollectionQuery depends on, so a shared listener is
// reused only for the same rows. "No profile yet" never shares a key with a
// role-less (legacy admin) profile.
export function staffResourceKey(path, { me, schoolYear, sectionId, date } = {}) {
  const profile = me ? ['profile', me.role ?? null, me.gradeLevel ?? null] : ['no-profile'];
  return JSON.stringify(['staff', path, profile, schoolYear ?? null, sectionId ?? null, date ?? null]);
}
