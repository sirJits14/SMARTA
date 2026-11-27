import { describe, it, expect } from 'vitest';
import { DISABLED_MESSAGE } from './access.js';
import { signInErrorMessage, AUTH_MESSAGES as M } from './authErrors.js';

describe('signInErrorMessage', () => {
  it('only says "email and password did not match" for credential errors', () => {
    for (const code of ['auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/wrong-password', 'auth/user-not-found', 'auth/missing-password']) {
      expect(signInErrorMessage({ code })).toBe(M.credentials);
    }
    expect(signInErrorMessage({ code: 'auth/network-request-failed' })).not.toBe(M.credentials);
    expect(signInErrorMessage({ code: 'auth/internal-error' })).not.toBe(M.credentials);
  });
  it('keeps the disabled-account message', () => {
    expect(signInErrorMessage({ code: 'auth/user-disabled' })).toBe(DISABLED_MESSAGE);
  });
  it('explains a failed App Check security check', () => {
    // The Auth SDK derives this code from the server text "Firebase App Check token is invalid."
    expect(signInErrorMessage({ code: 'auth/firebase-app-check-token-is-invalid.' })).toBe(M.appCheck);
    expect(signInErrorMessage({ code: 'auth/firebase-app-check-token-is-invalid' })).toBe(M.appCheck);
  });
  it('explains rate limiting and network failures', () => {
    expect(signInErrorMessage({ code: 'auth/too-many-requests' })).toBe(M.tooMany);
    expect(signInErrorMessage({ code: 'auth/network-request-failed' })).toBe(M.network);
  });
  it('flags a malformed email', () => {
    expect(signInErrorMessage({ code: 'auth/invalid-email' })).toBe(M.invalidEmail);
  });
  it('names the code for anything unexpected so staff can report it', () => {
    expect(signInErrorMessage({ code: 'auth/internal-error' })).toBe(`${M.failed} (auth/internal-error)`);
    expect(signInErrorMessage(new Error('boom'))).toBe(M.failed);
    expect(signInErrorMessage(undefined)).toBe(M.failed);
  });
});
