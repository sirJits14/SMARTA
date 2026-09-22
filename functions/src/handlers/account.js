import { FieldValue } from 'firebase-admin/firestore';
import { audit } from '../audit.js';
import { logEvent } from '../log.js';

async function deleteCollection(db, path, batchSize = 200) {
  for (;;) {
    const snap = await db.collection(path).limit(batchSize).get();
    if (snap.empty) return;
    const b = db.batch(); snap.docs.forEach((d) => b.delete(d.ref)); await b.commit();
  }
}

// Spec §8 "Data-subject rights": withdrawal/erasure. The audit trail is the
// only thing that survives. The Auth user is deleted LAST, after every
// Firestore cleanup step succeeds, so a mid-cleanup failure never leaves an
// orphaned, unrecoverable Auth account pointing at dangling Firestore state.
export async function deleteGuardianAccount(ctx) {
  const { db, auth, uid, email } = ctx;
  const links = await db.collection('guardian_links').where('guardianUid', '==', uid).get();
  for (const l of links.docs) await l.ref.set({ status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: 'guardian', revokedReason: 'account deleted' }, { merge: true });
  await deleteCollection(db, `guardians/${uid}/devices`);
  await deleteCollection(db, `guardians/${uid}/inbox`);
  await db.doc(`guardians/${uid}`).delete();
  await db.doc(`rate_limits/${uid}`).delete();
  await audit(db, { action: 'guardian.deleted', actorType: 'guardian', actorUid: uid, targetType: 'guardian', targetId: uid, details: { links: links.size, email } });
  await auth.deleteUser(uid);
  logEvent('guardian_deleted', { uid });
  return { ok: true };
}
