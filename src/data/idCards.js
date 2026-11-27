import { doc, writeBatch, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

const OPS_PER_BATCH = 500; // Firestore's hard limit per writeBatch
const BATCH = 'id_card_batch';

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
// isIdCardPrinted in src/lib/idCardQueue.js reads it back.
export const markIdCardsPrinted = (students, me) =>
  writeInChunks(students, 1, (batch, student) =>
    batch.set(doc(db, 'students', student.id), printedMark(student, me), { merge: true }));

// The saved batch stores only who was added; the card's details are read
// live from the learner's records when it prints.
export const addToIdCardBatch = (studentId, me) =>
  setDoc(doc(db, BATCH, studentId), { addedAt: serverTimestamp(), addedBy: me.email });

export const removeFromIdCardBatch = (studentId) => deleteDoc(doc(db, BATCH, studentId));

export const clearIdCardBatch = (studentIds) =>
  writeInChunks(studentIds, 1, (batch, id) => batch.delete(doc(db, BATCH, id)));

// Marking and leaving the batch share one write, so a learner is never
// marked printed while still waiting in the batch, or the other way round.
export const markBatchPrinted = (students, me) =>
  writeInChunks(students, 2, (batch, student) => {
    batch.set(doc(db, 'students', student.id), printedMark(student, me), { merge: true });
    batch.delete(doc(db, BATCH, student.id));
  });
