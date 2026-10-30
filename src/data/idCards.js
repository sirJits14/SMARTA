import { doc, writeBatch, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

const OPS_PER_BATCH = 500; // Firestore's hard limit per writeBatch
const BATCH = 'id_card_batch';
const APPROVED = 'id_card_approved';

const printedMark = (student, me) =>
  ({ idCard: { printedAt: serverTimestamp(), printedBy: me.email, lrn: student.lrn } });

// Runs `write(batch, item)` for every item, committing before a batch would
// pass Firestore's operation limit. `opsPerItem` is how many writes each
// item adds.
async function writeInChunks(items, opsPerItem, write) {
  const size = Math.floor(OPS_PER_BATCH / opsPerItem);
  for (let i = 0; i < items.length; i += size) {
    const batch = writeBatch(db);
    items.slice(i, i + size).forEach((item) => write(batch, item));
    await batch.commit();
  }
}

// Records that each learner's card was printed for their current LRN;
// isIdCardPrinted in src/lib/idCardQueue.js reads it back. A printed learner
// also leaves Recently approved; deleting a document that isn't there does nothing.
export const markIdCardsPrinted = (students, me) =>
  writeInChunks(students, 2, (batch, student) => {
    batch.set(doc(db, 'students', student.id), printedMark(student, me), { merge: true });
    batch.delete(doc(db, APPROVED, student.id));
  });

export const removeFromIdCardBatch = (studentId) => deleteDoc(doc(db, BATCH, studentId));

export const clearIdCardBatch = (studentIds) =>
  writeInChunks(studentIds, 1, (batch, id) => batch.delete(doc(db, BATCH, id)));

// Marking and leaving the batch share one write, so a learner is never
// marked printed while still waiting in the batch, or the other way round.
export const markBatchPrinted = (students, me) =>
  writeInChunks(students, 3, (batch, student) => {
    batch.set(doc(db, 'students', student.id), printedMark(student, me), { merge: true });
    batch.delete(doc(db, BATCH, student.id));
    batch.delete(doc(db, APPROVED, student.id));
  });

// Recently approved holds new learners whose add request was approved. Moving
// them to the saved batch and leaving Recently approved share one write.
export const addApprovedToBatch = (studentIds, me) =>
  writeInChunks(studentIds, 2, (batch, id) => {
    batch.set(doc(db, BATCH, id), { addedAt: serverTimestamp(), addedBy: me.email });
    batch.delete(doc(db, APPROVED, id));
  });

export const dismissApproved = (studentIds) =>
  writeInChunks(studentIds, 1, (batch, id) => batch.delete(doc(db, APPROVED, id)));

// The saved batch stores only who was added; the card's details are read
// live from the learner's records when it prints. Adding also takes the
// learner off Recently approved, so they cannot be printed from both lists.
export const addToIdCardBatch = (studentId, me) => addApprovedToBatch([studentId], me);
