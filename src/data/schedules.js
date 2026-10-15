import { collection, addDoc, doc, setDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase.js';

// With the afternoon session off, an edit removes any saved PM times.
const shape = (f, { clearPm }) => ({
  name: f.name.trim(), timeIn: f.timeIn, timeOut: f.timeOut,
  ...(f.pm ? { pmTimeIn: f.pmTimeIn, pmTimeOut: f.pmTimeOut }
    : clearPm ? { pmTimeIn: deleteField(), pmTimeOut: deleteField() } : {}),
});
export const createSchedule = (f) => addDoc(collection(db, 'schedules'), { ...shape(f, { clearPm: false }), gradeLevels: [] });
export const updateSchedule = (id, f) => setDoc(doc(db, 'schedules', id), shape(f, { clearPm: true }), { merge: true });
export const deleteSchedule = (id) => deleteDoc(doc(db, 'schedules', id));
