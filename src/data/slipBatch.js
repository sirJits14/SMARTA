import { doc, writeBatch, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

const BATCH = 'slip_batch';
const OPS_PER_BATCH = 500; // Firestore's hard limit per writeBatch

// Only who is waiting and why; codes are created by issueSlipBatchFn and
// never stored (spec 2026-10-16 §1).
export const addToSlipBatch = (studentId, reason, me) =>
  setDoc(doc(db, BATCH, studentId), { addedAt: serverTimestamp(), addedBy: me.email, reason });

export const removeFromSlipBatch = (studentId) => deleteDoc(doc(db, BATCH, studentId));

export async function clearSlipBatch(studentIds) {
  for (let i = 0; i < studentIds.length; i += OPS_PER_BATCH) {
    const batch = writeBatch(db);
    studentIds.slice(i, i + OPS_PER_BATCH).forEach((id) => batch.delete(doc(db, BATCH, id)));
    await batch.commit();
  }
}
