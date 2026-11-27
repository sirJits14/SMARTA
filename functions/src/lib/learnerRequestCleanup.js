import { FieldValue } from 'firebase-admin/firestore';
import { CONTACT_FIELDS } from '../../shared/learnerRequests.js';

// An add keeps most of its form for "Send again", but its address and phone numbers go as soon
// as the request is decided or withdrawn (spec 2026-10-22).
export const contactCleared = (request) => (request?.kind === 'add'
  ? Object.fromEntries(CONTACT_FIELDS.map((field) => [`student.${field}`, FieldValue.delete()]))
  : {});

export const pendingLearnerRequests = (db, uid) =>
  db.collection('learner_change_requests').where('requestedByUid', '==', uid).where('status', '==', 'pending');

// `snaps` are document snapshots read earlier in the same transaction.
export function withdrawLearnerRequests(tx, snaps, reason) {
  for (const snap of snaps) {
    tx.update(snap.ref, { status: 'withdrawn', withdrawnAt: FieldValue.serverTimestamp(), decisionReason: reason, ...contactCleared(snap.data()) });
  }
}
