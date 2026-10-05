import { FieldValue } from 'firebase-admin/firestore';

// One append per action (spec §8 "Audit log"). Never contains raw codes,
// tokens, or passwords. Optional `id` makes a retried write overwrite, not duplicate.
export function audit(db, { id, action, actorType, actorUid, targetType, targetId, details = {} }) {
  const row = { action, actorType, actorUid: actorUid || null, targetType, targetId, details, at: FieldValue.serverTimestamp() };
  // An explicit id makes the write idempotent (e.g. keyed on a trigger event id).
  return id ? db.collection('audit_log').doc(id).set(row) : db.collection('audit_log').add(row);
}
