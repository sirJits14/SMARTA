import { collection, addDoc, doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase.js';
import { isSHS } from '../lib/constants.js';

const shape = (f) => ({
  name:f.name.trim(), gradeLevel:Number(f.gradeLevel),
  track: isSHS(f.gradeLevel) ? (f.track||null) : null,
  strand: isSHS(f.gradeLevel) ? (f.strand||null) : null,
  schoolYear:f.schoolYear, adviserName:f.adviserName?.trim()||'',
  scheduleId: f.scheduleId || null,
});

// Preserve live roster behavior; only add School Access ownership protection.
async function mutateSection(id, next) {
  const ref = doc(db, 'sections', id);
  return runTransaction(db, async tx => {
    const before = await tx.get(ref);
    if (before.data()?.schoolAdviserUid) {
      if (!next || next.gradeLevel !== before.data().gradeLevel || next.schoolYear !== before.data().schoolYear) {
        throw new Error('Revoke the Class Adviser assignment in School Access before deleting this section or changing its grade or school year.');
      }
      next = { ...next, adviserName: before.data().adviserName };
    }
    if (next) tx.set(ref, next, { merge: true });
    else tx.delete(ref);
  });
}
export const createSection = (f) => addDoc(collection(db, 'sections'), shape(f));
export const updateSection = (id, f) => mutateSection(id, shape(f));
export const deleteSection = (id) => mutateSection(id, null);
