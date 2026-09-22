import { FieldValue } from 'firebase-admin/firestore';

// One append per action (spec §8 "Audit log"). Never contains raw codes,
// tokens, or passwords.
export function audit(db, { action, actorType, actorUid, targetType, targetId, details = {} }) {
  return db.collection('audit_log').add({ action, actorType, actorUid: actorUid || null, targetType, targetId, details, at: FieldValue.serverTimestamp() });
}
