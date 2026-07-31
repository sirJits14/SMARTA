import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase.js';

const shape = (f) => ({
  schoolId: f.schoolId?.trim() || '',
  schoolName: f.schoolName?.trim() || '',
});

export const updateSettings = (f) => setDoc(doc(db, 'settings', 'app'), shape(f), { merge: true });
