import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { audit } from '../audit.js';
import { str } from '../lib/validators.js';
import { CallableError } from '../errors.js';

const EMAIL_DOMAIN = 'bnhs.local';
const MAX_EMAIL_ATTEMPTS = 5;

const slugify = (label) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'device';

// base64url avoids characters that need escaping when copy-pasted into a
// plain <input> or a terminal; 18 random bytes -> 24 chars, ~144 bits.
const generatePassword = () => randomBytes(18).toString('base64url');

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

// Creates the device's own Firebase Auth account AND its kiosks/{uid}
// allow-list doc, so staff never has to visit the Firebase Console or
// handle a raw Auth UID. The generated email/password is returned to the
// caller exactly once -- nothing here persists the plaintext password.
export async function provisionKiosk(ctx, data) {
  const { db, auth, email: staffEmail } = ctx;
  const label = str(data.label, { name: 'label', min: 2, max: 40 });
  const base = slugify(label);
  const password = generatePassword();

  let userRecord;
  for (let attempt = 0; ; attempt += 1) {
    const candidateEmail = attempt === 0 ? `kiosk-${base}@${EMAIL_DOMAIN}` : `kiosk-${base}-${attempt + 1}@${EMAIL_DOMAIN}`;
    try {
      userRecord = await auth.createUser({ email: candidateEmail, password });
      break;
    } catch (e) {
      if (e.code === 'auth/email-already-exists' && attempt < MAX_EMAIL_ATTEMPTS - 1) continue;
      throw e;
    }
  }

  await db.doc(`kiosks/${userRecord.uid}`).set({ label, active: true, createdBy: staffEmail, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(db, { action: 'kiosk.provisioned', actorType: 'staff', actorUid: staffEmail, targetType: 'kiosk', targetId: userRecord.uid, details: { label, email: userRecord.email } });
  return { uid: userRecord.uid, email: userRecord.email, password };
}

// Regenerates the password for an already-registered device (lost sticky
// note, suspected compromise). The uid and kiosks/{uid} doc are unchanged --
// only the Auth credential moves.
export async function resetKioskPassword(ctx, data) {
  const { db, auth, email: staffEmail } = ctx;
  const uid = str(data.uid, { name: 'uid', min: 4, max: 128 });
  const kioskDoc = await db.doc(`kiosks/${uid}`).get();
  if (!kioskDoc.exists) throw new CallableError('not-found', 'Kiosk not found');
  const password = generatePassword();
  const userRecord = await auth.updateUser(uid, { password });
  await audit(db, { action: 'kiosk.password_reset', actorType: 'staff', actorUid: staffEmail, targetType: 'kiosk', targetId: uid });
  return { uid, email: userRecord.email, password };
}
