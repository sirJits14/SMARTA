import S from '../strings.js';

// Firebase Auth error code -> what the guardian sees. null means say nothing
// (they closed the Google window themselves). Anything unmapped gets a
// generic retry message instead of the old blanket "email and password did
// not match", which was also shown for every Google sign-in failure.
const MESSAGES = {
  'auth/invalid-credential': S.authError,
  'auth/invalid-login-credentials': S.authError,
  'auth/wrong-password': S.authError,
  'auth/user-not-found': S.authError,
  'auth/invalid-email': S.authInvalidEmail,
  'auth/missing-password': S.authError,
  'auth/too-many-requests': S.authTooMany,
  'auth/network-request-failed': S.authNetwork,
  'auth/email-already-in-use': S.authEmailInUse,
  'auth/weak-password': S.createError,
  'auth/account-exists-with-different-credential': S.authUseOtherMethod,
  'auth/unauthorized-domain': S.googleUnavailable,
  'auth/operation-not-allowed': S.googleUnavailable,
  'auth/popup-closed-by-user': null,
  'auth/cancelled-popup-request': null,
  'auth/user-cancelled': null,
};

export function authErrorMessage(err, fallback = S.signInFailed) {
  const code = err?.code;
  if (code && Object.prototype.hasOwnProperty.call(MESSAGES, code)) return MESSAGES[code];
  return fallback;
}

// The Google popup can't open here (blocked, or an installed home-screen app
// that has no popup windows) -- switch to a full-page redirect instead.
export const needsRedirect = (err) => ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(err?.code);
