import { pushPayload } from '../lib/pushPayload.js';
import { Timestamp } from 'firebase-admin/firestore';

const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-argument']);
export const MAX_FAILURES = 5;

// Sends the fixed push to every enabled device of one guardian and applies
// FCM's per-token verdicts to the device docs (spec §6 step 4).
export async function sendToGuardian({ db, messaging, portalUrl }, { guardianUid, inboxId, studentId }) {
  const devSnap = await db.collection(`guardians/${guardianUid}/devices`).where('enabled', '==', true).get();
  if (devSnap.empty) return { status: 'skipped_no_device', pruned: 0 };

  const tokens = devSnap.docs.map((d) => d.data().token);
  const res = await messaging.sendEachForMulticast(pushPayload({ tokens, inboxId, studentId, portalUrl }));

  const batch = db.batch();
  let pruned = 0, anySuccess = false;
  res.responses.forEach((r, i) => {
    const docSnap = devSnap.docs[i];
    if (r.success) { anySuccess = true; return; }
    if (DEAD.has(r.error?.code)) { batch.delete(docSnap.ref); pruned++; return; }
    const failureCount = (docSnap.data().failureCount || 0) + 1;
    const update = { failureCount };
    if (failureCount >= MAX_FAILURES) { update.enabled = false; update.disabledAt = Timestamp.now(); }
    batch.update(docSnap.ref, update);
  });
  await batch.commit();
  return { status: anySuccess ? 'sent' : 'failed', pruned };
}
