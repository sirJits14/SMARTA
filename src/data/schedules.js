import { collection, addDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase.js';

const shape = (f) => ({
  name: f.name.trim(), timeIn: f.timeIn, timeOut: f.timeOut,
});
export const createSchedule = (f) => addDoc(collection(db, 'schedules'), shape(f));
export const updateSchedule = (id, f) => setDoc(doc(db, 'schedules', id), shape(f), { merge: true });
export const deleteSchedule = (id) => deleteDoc(doc(db, 'schedules', id));
