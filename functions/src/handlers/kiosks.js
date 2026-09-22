import { FieldValue } from 'firebase-admin/firestore';
import { audit } from '../audit.js';
import { str } from '../lib/validators.js';

export async function registerKiosk(ctx, data) {
  const { db, email } = ctx;
  const uid = str(data.uid, { name: 'uid', min: 4, max: 128 });
  const label = str(data.label, { name: 'label', min: 2, max: 40 });
  await db.doc(`kiosks/${uid}`).set({ label, active: true, createdBy: email, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(db, { action: 'kiosk.registered', actorType: 'staff', actorUid: email, targetType: 'kiosk', targetId: uid, details: { label } });
  return { ok: true };
}

export async function deactivateKiosk(ctx, data) {
  const { db, email } = ctx;
  const uid = str(data.uid, { name: 'uid', min: 4, max: 128 });
  const reason = str(data.reason ?? '', { name: 'reason', max: 200 });
  await db.doc(`kiosks/${uid}`).set({ active: false, deactivatedAt: FieldValue.serverTimestamp(), deactivatedBy: email }, { merge: true });
  await audit(db, { action: 'kiosk.deactivated', actorType: 'staff', actorUid: email, targetType: 'kiosk', targetId: uid, details: { reason } });
  return { ok: true };
}
