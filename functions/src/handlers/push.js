import { pushPayload } from '../lib/pushPayload.js';
import { Timestamp } from 'firebase-admin/firestore';
import { logWarn } from '../log.js';

const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-argument']);
export const MAX_FAILURES = 5;

// Applies FCM's per-token verdicts to the device docs (spec §6 step 4):
// dead tokens are deleted, other failures counted, and a device is disabled
// after MAX_FAILURES. devDocs[i] must be the device whose token was
// tokens[i] in the multicast that produced responses[i].
export async function applyVerdicts(db, devDocs, responses) {
  // invalid-argument on every token of a multicast means the payload (or
  // FCM) was at fault, or every token is malformed: we can't tell which, so
  // never delete (that could wipe the table). Each device still takes a
  // failure, so genuinely bad tokens reach MAX_FAILURES and are disabled. A
  // single token's invalid-argument still marks it dead.
  const payloadRejected = responses.length > 1 && responses.every((r) => !r.success && r.error?.code === 'messaging/invalid-argument');
  if (payloadRejected) logWarn('push_payload_rejected', { size: responses.length });
  const batch = db.batch();
  let sent = 0, failed = 0, pruned = 0;
  responses.forEach((r, i) => {
    const docSnap = devDocs[i];
    if (r.success) { sent++; return; }
    failed++;
    if (!payloadRejected && DEAD.has(r.error?.code)) { batch.delete(docSnap.ref); pruned++; return; }
    const failureCount = (docSnap.data().failureCount || 0) + 1;
    const update = { failureCount };
    if (failureCount >= MAX_FAILURES) { update.enabled = false; update.disabledAt = Timestamp.now(); }
    batch.update(docSnap.ref, update);
  });
  await batch.commit();
  return { sent, failed, pruned };
}

// Sends the fixed push to every enabled device of one guardian and applies
// FCM's per-token verdicts to the device docs. devDocs is the caller's own
// already-fetched enabled-devices query snapshot docs
// (QueryDocumentSnapshot-shaped: .data()/.ref) -- the caller (scanEvent.js)
// needs that same query for its own device-count gate right before this is
// called, so this no longer re-queries Firestore for it.
export async function sendToGuardian({ db, messaging, portalUrl }, { inboxId, studentId, devDocs, deviceLabel }) {
  if (devDocs.length === 0) return { status: 'skipped_no_device', pruned: 0 };

  const tokens = devDocs.map((d) => d.data().token);
  const res = await messaging.sendEachForMulticast(pushPayload({ tokens, inboxId, studentId, portalUrl, deviceLabel }));
  const { sent, pruned } = await applyVerdicts(db, devDocs, res.responses);
  return { status: sent > 0 ? 'sent' : 'failed', pruned };
}
