import { HttpsError } from 'firebase-functions/v2/https';
import { CallableError } from './errors.js';
import { takeToken } from './lib/rateLimit.js';

export const LIMITS = {
  activate: { windowMs: 60 * 60 * 1000, max: 5 },
  report: { windowMs: 24 * 60 * 60 * 1000, max: 5 },
  issueCodes: { windowMs: 24 * 60 * 60 * 1000, max: 20 },
};
export const MAX_OPEN_REQUESTS = 3;

export function guardianIdentity(req) {
  if (!req.app) throw new CallableError('failed-precondition', 'App Check required');
  const t = req.auth?.token;
  if (!req.auth || t?.firebase?.sign_in_provider === 'anonymous') throw new CallableError('unauthenticated', 'Sign in required');
  if (!t.email_verified) throw new CallableError('failed-precondition', 'Verify your email first');
  return { uid: req.auth.uid, email: t.email, displayName: t.name || '' };
}

export async function staffIdentity(db, req) {
  if (!req.app) throw new CallableError('failed-precondition', 'App Check required');
  const email = req.auth?.token?.email?.toLowerCase();
  if (!email) throw new CallableError('unauthenticated', 'Sign in required');
  const staff = await db.doc(`users/${email}`).get();
  if (!staff.exists) throw new CallableError('permission-denied', 'Staff only');
  return { uid: req.auth.uid, email };
}

// Transactional fixed-window limiter on rate_limits/{uid}.{action}.
export async function enforceRateLimit(db, uid, action, { windowMs, max }, nowMs) {
  const ref = db.doc(`rate_limits/${uid}`);
  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const r = takeToken(snap.data()?.[action] || null, { nowMs, windowMs, max });
    tx.set(ref, { [action]: r.next }, { merge: true });
    return r.allowed;
  });
  if (!allowed) throw new CallableError('resource-exhausted', 'Too many attempts. Try again later.');
}

export function toHttpsError(err) {
  if (err instanceof CallableError) return new HttpsError(err.code, err.message);
  console.error(err);
  return new HttpsError('internal', 'Something went wrong. Please try again.');
}
