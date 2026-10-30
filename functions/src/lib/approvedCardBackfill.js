import { Timestamp } from 'firebase-admin/firestore';
import { APPROVED_CARDS, approvedCardEntry } from './approvedCards.js';

const docId = (value) => typeof value === 'string' && value.length > 0 && !value.includes('/');

// One-time: logs new learners approved before Recently approved existed (plan 2026-10-30), from the
// 'learner.addApproved' audit rows. A learner is logged only if that approval created them, they are
// still enrolled in that year, their card is unprinted, and they are not already logged or batched.
export async function backfillApprovedCards(db, { apply = false } = {}) {
  const rows = await db.collection('audit_log').where('action', '==', 'learner.addApproved').get();
  const result = { added: [], skipped: [] };
  const seen = new Set();
  for (const row of rows.docs) {
    const { details = {}, targetId, at } = row.data();
    const { mode, studentId } = details;
    if (mode !== 'new' || !docId(studentId) || seen.has(studentId)) continue;
    seen.add(studentId);
    const skip = (reason) => result.skipped.push({ studentId, reason });
    const request = docId(targetId) ? (await db.doc(`learner_change_requests/${targetId}`).get()).data() : null;
    if (!request?.schoolYear) { skip('Request not found.'); continue; }
    const [student, enrollment, logged, batched] = await Promise.all([
      db.doc(`students/${studentId}`).get(),
      db.doc(`enrollments/${studentId}_${request.schoolYear}`).get(),
      db.doc(`${APPROVED_CARDS}/${studentId}`).get(),
      db.doc(`id_card_batch/${studentId}`).get(),
    ]);
    if (!student.exists) { skip('Learner record not found.'); continue; }
    if (enrollment.data()?.status !== 'enrolled') { skip('No longer enrolled.'); continue; }
    const card = student.data().idCard;
    if (card?.printedAt && card.lrn === student.data().lrn) { skip('Card already printed.'); continue; }
    if (logged.exists) { skip('Already logged.'); continue; }
    if (batched.exists) { skip('Already in the saved batch.'); continue; }
    if (apply) {
      await db.doc(`${APPROVED_CARDS}/${studentId}`).create(approvedCardEntry({
        requestId: targetId, schoolYear: request.schoolYear, approvedByName: request.decidedByName, approvedAt: request.decidedAt ?? at ?? Timestamp.now(),
      }));
    }
    result.added.push(studentId);
  }
  return result;
}
