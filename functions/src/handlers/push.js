import { pushPayload } from '../lib/pushPayload.js';
import { Timestamp } from 'firebase-admin/firestore';

const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-argument']);
export const MAX_FAILURES = 5;

// Sends the fixed push to every enabled device of one guardian and applies
// FCM's per-token verdicts to the device docs (spec §6 step 4). devDocs is
// the caller's own already-fetched enabled-devices query snapshot docs
// (QueryDocumentSnapshot-shaped: .data()/.ref) -- the caller (scanEvent.js)
// needs that same query for its own device-count gate right before this is
// called, so this no longer re-queries Firestore for it.
export async function sendToGuardian({ db, messaging, portalUrl }, { inboxId, studentId, devDocs, deviceLabel }) {
  if (devDocs.length === 0) return { status: 'skipped_no_device', pruned: 0 };

  const tokens = devDocs.map((d) => d.data().token);
  const res = await messaging.sendEachForMulticast(pushPayload({ tokens, inboxId, studentId, portalUrl, deviceLabel }));

  const batch = db.batch();
  let pruned = 0, anySuccess = false;
  res.responses.forEach((r, i) => {
    const docSnap = devDocs[i];
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
