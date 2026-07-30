import { collection, addDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { isSHS } from '../lib/constants.js';

const shape = (f) => ({
  name:f.name.trim(), gradeLevel:Number(f.gradeLevel),
  track: isSHS(f.gradeLevel) ? (f.track||null) : null,
  strand: isSHS(f.gradeLevel) ? (f.strand||null) : null,
  schoolYear:f.schoolYear, adviserName:f.adviserName?.trim()||'',
  scheduleId: f.scheduleId || null,
});
export const createSection = (f) => addDoc(collection(db, 'sections'), shape(f));
export const updateSection = (id, f) => setDoc(doc(db, 'sections', id), shape(f), { merge:true });
export const deleteSection = (id) => deleteDoc(doc(db, 'sections', id));
