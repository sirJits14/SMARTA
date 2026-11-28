import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase.js';

export const PICKUP_PLACE_MAX = 120;

const shape = (f) => ({
  schoolId: f.schoolId?.trim() || '',
  schoolName: f.schoolName?.trim() || '',
  // Printed on temporary ID passes.
  principalName: f.principalName?.trim() || '',
  principalTitle: f.principalTitle?.trim() || '',
  // Named in the adviser's notice when a requested pass is ready.
  passPickupPlace: (f.passPickupPlace?.trim() || '').slice(0, PICKUP_PLACE_MAX).trim(),
});

export const updateSettings = (f) => setDoc(doc(db, 'settings', 'app'), shape(f), { merge: true });
