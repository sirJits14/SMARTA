import { DISABLED_MESSAGE } from './access.js';

// Firebase Auth error code -> what staff see on the sign-in screen. Only real
// credential errors say "did not match"; the old blanket message also hid
// App Check rejections, rate limiting and network failures.
export const AUTH_MESSAGES = {
  credentials: 'That email and password did not match.',
  invalidEmail: 'Enter a valid email address.',
  tooMany: 'Too many sign-in attempts. Wait a few minutes, then try again.',
  network: "Can't reach the server. Check your internet connection and try again.",
  appCheck: "This browser didn't pass the site's security check. Turn off ad-blockers or Brave Shields for this site, or try Chrome or Edge.",
  failed: "Sign-in didn't work. Try again in a moment.",
};

const BY_CODE = {
  'auth/invalid-credential': AUTH_MESSAGES.credentials,
  'auth/invalid-login-credentials': AUTH_MESSAGES.credentials,
  'auth/wrong-password': AUTH_MESSAGES.credentials,
  'auth/user-not-found': AUTH_MESSAGES.credentials,
  'auth/missing-password': AUTH_MESSAGES.credentials,
  'auth/invalid-email': AUTH_MESSAGES.invalidEmail,
  'auth/user-disabled': DISABLED_MESSAGE,
  'auth/too-many-requests': AUTH_MESSAGES.tooMany,
  'auth/network-request-failed': AUTH_MESSAGES.network,
};

export function signInErrorMessage(err) {
  const code = err?.code;
  if (!code) return AUTH_MESSAGES.failed;
  if (Object.prototype.hasOwnProperty.call(BY_CODE, code)) return BY_CODE[code];
  // Auth enforces App Check; the SDK turns the server's "Firebase App Check
  // token is invalid." into a code with no fixed spelling (trailing dot).
  if (code.includes('app-check')) return AUTH_MESSAGES.appCheck;
  return `${AUTH_MESSAGES.failed} (${code})`;
}
