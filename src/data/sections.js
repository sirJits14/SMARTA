import { collection, doc, runTransaction, query, where, getDocsFromServer } from 'firebase/firestore';
import { db } from '../firebase.js';
import { isSHS } from '../lib/constants.js';

const shape = (f) => ({
  name:f.name.trim(), gradeLevel:Number(f.gradeLevel),
  track: isSHS(f.gradeLevel) ? (f.track||null) : null,
  strand: isSHS(f.gradeLevel) ? (f.strand||null) : null,
  schoolYear:f.schoolYear, adviserName:f.adviserName?.trim()||'',
  scheduleId: f.scheduleId || null,
});

async function mutateSection(ref, next, merge = false) {
  return runTransaction(db, async tx => {
    const before = await tx.get(ref);
    const scheduleIds = [...new Set([before.data()?.scheduleId, next?.scheduleId].filter(Boolean))];
    // Read schedule versions before querying their sections. Concurrent mutations
    // sharing a schedule then conflict and retry this query before committing.
    const schedules = await Promise.all(scheduleIds.map(id => tx.get(doc(db, 'schedules', id))));
    const audiences = await Promise.all(scheduleIds.map(async id => {
      const linked = await getDocsFromServer(query(collection(db, 'sections'), where('scheduleId', '==', id)));
      const grades = linked.docs.filter(section => section.id !== ref.id).map(section => section.data().gradeLevel);
      if (next?.scheduleId === id) grades.push(next.gradeLevel);
      return [...new Set(grades.filter(grade => Number.isInteger(grade) && grade >= 7 && grade <= 12))].sort((a, b) => a - b);
    }));
    if (next) tx.set(ref, next, { merge });
    else tx.delete(ref);
    schedules.forEach((schedule, index) => {
      if (schedule.exists()) tx.set(doc(db, 'schedules', scheduleIds[index]), { gradeLevels: audiences[index] }, { merge: true });
    });
    return ref;
  });
}
export const createSection = (f) => mutateSection(doc(collection(db, 'sections')), shape(f));
export const updateSection = (id, f) => mutateSection(doc(db, 'sections', id), shape(f), true);
export const deleteSection = (id) => mutateSection(doc(db, 'sections', id), null);
