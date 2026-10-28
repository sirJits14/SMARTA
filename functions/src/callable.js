import { HttpsError } from 'firebase-functions/v2/https';
import { CallableError } from './errors.js';
import { roleOf } from '../shared/staffRoles.js';
import { takeToken } from './lib/rateLimit.js';

export const LIMITS = {
  activate: { windowMs: 60 * 60 * 1000, max: 5 },
  activateAdviser: { windowMs: 60 * 60 * 1000, max: 60 },
  report: { windowMs: 24 * 60 * 60 * 1000, max: 5 },
  // One call per section. SY 2026-2027 has 159 sections, so one registrar
  // must be able to issue all of them (and redo many) in a single day.
  issueCodes: { windowMs: 24 * 60 * 60 * 1000, max: 2000 },
  // Replacing single lost slips has its own budget so it does not use up the
  // section-wide one.
  reissueCode: { windowMs: 24 * 60 * 60 * 1000, max: 60 },
  // A DepEd account fixing its own Adviser/guardian mix-up. The once-per-year
  // lock per learner is the real limit; an adviser may be fixing a whole
  // section in one sitting, so this only stops scripted calls.
  relationshipChange: { windowMs: 60 * 60 * 1000, max: 60 },
  // Preview and redeem of advisory slips share one budget per account.
  advisorySlip: { windowMs: 60 * 60 * 1000, max: 10 },
  // Adviser requests to add or remove a learner (spec 2026-10-22).
  learnerRequest: { windowMs: 60 * 60 * 1000, max: 30 },
  // SF2 downloads from the Class tab (spec 2026-10-22). Each builds a workbook, so keep it modest.
  sf2Export: { windowMs: 60 * 60 * 1000, max: 20 },
};
export const MAX_OPEN_REQUESTS = 3;

export function guardianIdentity(req) {
  if (!req.app) throw new CallableError('failed-precondition', 'App Check required');
  const t = req.auth?.token;
  if (!req.auth || t?.firebase?.sign_in_provider === 'anonymous') throw new CallableError('unauthenticated', 'Sign in required');
  if (!t.email_verified) throw new CallableError('failed-precondition', 'Verify your email first');
  return { uid: req.auth.uid, email: t.email, displayName: t.name || '' };
}

const SESSION_ENDED = 'Your session has ended. Please sign in again.';
const PASSWORD_REQUIRED = 'Set a new password before using the app.';

function checkProfileSession(profile, req, allowPasswordChange = false) {
  const cutoff = profile.sessionValidAfter ?? 0;
  const authTime = req.auth?.token?.auth_time;
  if (!Number.isSafeInteger(cutoff) || cutoff < 0
      || (cutoff > 0 && (!Number.isSafeInteger(authTime) || authTime < cutoff))) {
    throw new CallableError('unauthenticated', SESSION_ENDED);
  }
  if (!allowPasswordChange && profile.mustChangePassword === true) {
    throw new CallableError('failed-precondition', PASSWORD_REQUIRED);
  }
}

// Guardian endpoints must not provide an alternate route for a restricted
// staff Auth account. A profile bound to another UID is unrelated.
export async function assertUnrestrictedSession(db, req) {
  const email = await staffProfileEmail(db, req);
  if (!email) return;
  const staff = await db.doc(`users/${email}`).get();
  if (staff.exists && (!staff.data().uid || staff.data().uid === req.auth.uid)) {
    checkProfileSession(staff.data(), req);
  }
}

async function staffProfileEmail(db, req) {
  if (!req.auth) return null;
  const binding = await db.doc(`staff_profiles/${req.auth.uid}`).get();
  if (binding.exists) {
    const email = binding.data().email;
    if (typeof email !== 'string' || !email || email.includes('/')) throw new CallableError('unauthenticated', SESSION_ENDED);
    return email;
  }
  return req.auth.token?.email?.toLowerCase();
}

async function loadStaffIdentity(db, auth, req, allowPasswordChange) {
  if (!req.app) throw new CallableError('failed-precondition', 'App Check required');
  const tokenEmail = req.auth?.token?.email?.toLowerCase();
  if (!tokenEmail) throw new CallableError('unauthenticated', 'Sign in required');
  const email = await staffProfileEmail(db, req);
  if (email !== tokenEmail) throw new CallableError('permission-denied', 'Staff only');
  const staff = await db.doc(`users/${email}`).get();
  if (!staff.exists) throw new CallableError('permission-denied', 'Staff only');
  const profile = staff.data();
  if (profile.disabled === true) throw new CallableError('permission-denied', 'This account has been disabled');
  if (!roleOf(profile)) throw new CallableError('permission-denied', 'Staff only');
  // A profile is bound to the Auth account it was made for; legacy profiles
  // without a uid fall back to the email (backfillUserRoles.mjs adds it).
  if (profile.uid && profile.uid !== req.auth.uid) throw new CallableError('permission-denied', 'Staff only');
  // ID tokens outlive revokeRefreshTokens (reset/disable) by up to an hour.
  const user = await auth.getUser(req.auth.uid).catch((e) => {
    if (e.code === 'auth/user-not-found') throw new CallableError('unauthenticated', SESSION_ENDED);
    throw e;
  });
  if (user.tokensValidAfterTime && req.auth.token.auth_time * 1000 < Date.parse(user.tokensValidAfterTime)) {
    throw new CallableError('unauthenticated', SESSION_ENDED);
  }
  checkProfileSession(profile, req, allowPasswordChange);
  return { uid: req.auth.uid, email, profile };
}

export const staffIdentity = (db, auth, req) => loadStaffIdentity(db, auth, req, false);
// Both existing SIMS accounts and verified portal accounts use school tools.
// Existing staff credentials retain the password/session gate even when their
// email has not been verified (SIMS provisions those accounts administratively).
export async function schoolIdentity(db, auth, req) {
  if (!req.app) throw new CallableError('failed-precondition', 'App Check required');
  if (!req.auth) throw new CallableError('unauthenticated', 'Sign in required');
  const email = await staffProfileEmail(db, req);
  const profile = email ? (await db.doc(`users/${email}`).get()).data() : null;
  if (profile && (!profile.uid || profile.uid === req.auth.uid)) {
    return { ...(await staffIdentity(db, auth, req)), authTime: req.auth.token.auth_time };
  }
  const identity = guardianIdentity(req);
  const user = await auth.getUser(identity.uid);
  if (user.disabled || !user.emailVerified || user.email?.toLowerCase() !== identity.email?.toLowerCase()
    || user.tokensValidAfterTime && (!Number.isSafeInteger(req.auth.token.auth_time) || req.auth.token.auth_time * 1000 < Date.parse(user.tokensValidAfterTime))) {
    throw new CallableError('unauthenticated', SESSION_ENDED);
  }
  return { ...identity, authTime: req.auth.token.auth_time };
}
// Used only by changeOwnPasswordFn, never selected through client data.
export const passwordChangeIdentity = async (db, auth, req) => {
  const identity = await loadStaffIdentity(db, auth, req, true);
  const authTime = req.auth.token.auth_time;
  if (!Number.isSafeInteger(authTime) || authTime < 0) throw new CallableError('unauthenticated', SESSION_ENDED);
  return { ...identity, authTime };
};

export async function adminIdentity(db, auth, req) {
  const identity = await staffIdentity(db, auth, req);
  if (roleOf(identity.profile) !== 'admin') throw new CallableError('permission-denied', 'Administrators only');
  return identity;
}

// Transactional fixed-window limiter on rate_limits/{uid}.{action}.
// `tooMany(resetMs)` gives a staff-facing message naming when the window
// resets; without it callers get the generic message.
export async function enforceRateLimit(db, uid, action, { windowMs, max }, nowMs, tooMany) {
  const ref = db.doc(`rate_limits/${uid}`);
  const { allowed, resetMs } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const r = takeToken(snap.data()?.[action] || null, { nowMs, windowMs, max });
    tx.set(ref, { [action]: r.next }, { merge: true });
    return { allowed: r.allowed, resetMs: r.next.windowStartMs + windowMs };
  });
  if (!allowed) throw new CallableError('resource-exhausted', tooMany ? tooMany(resetMs) : 'Too many attempts. Try again later.');
}

export function toHttpsError(err) {
  if (err instanceof CallableError) return new HttpsError(err.code, err.message);
  console.error(err);
  return new HttpsError('internal', 'Something went wrong. Please try again.');
}
