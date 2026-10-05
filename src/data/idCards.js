import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

const BATCH_CHUNK_SIZE = 500; // Firestore's hard limit per writeBatch

// Records that each learner's card was printed for their current LRN;
// isIdCardPrinted in src/lib/idCardQueue.js reads it back.
export async function markIdCardsPrinted(students, me) {
  for (let i = 0; i < students.length; i += BATCH_CHUNK_SIZE) {
    const batch = writeBatch(db);
    students.slice(i, i + BATCH_CHUNK_SIZE).forEach((student) =>
      batch.set(doc(db, 'students', student.id),
        { idCard: { printedAt: serverTimestamp(), printedBy: me.email, lrn: student.lrn } },
        { merge: true }));
    await batch.commit();
  }
}
