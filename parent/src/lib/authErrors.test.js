import { describe, it, expect } from 'vitest';
import S from '../strings.js';
import { authErrorMessage, needsRedirect } from './authErrors.js';

describe('authErrorMessage', () => {
  it('only says "email and password did not match" for credential errors', () => {
    expect(authErrorMessage({ code: 'auth/invalid-credential' })).toBe(S.authError);
    expect(authErrorMessage({ code: 'auth/unauthorized-domain' })).not.toBe(S.authError);
    expect(authErrorMessage({ code: 'auth/internal-error' })).not.toBe(S.authError);
  });
  it('explains Google sign-in that is not set up for this site', () => {
    expect(authErrorMessage({ code: 'auth/unauthorized-domain' })).toBe(S.googleUnavailable);
    expect(authErrorMessage({ code: 'auth/operation-not-allowed' })).toBe(S.googleUnavailable);
  });
  it('stays quiet when the guardian closes the Google window', () => {
    expect(authErrorMessage({ code: 'auth/popup-closed-by-user' })).toBeNull();
    expect(authErrorMessage({ code: 'auth/cancelled-popup-request' })).toBeNull();
  });
  it('falls back to the given message for unknown errors', () => {
    expect(authErrorMessage(new Error('boom'))).toBe(S.signInFailed);
    expect(authErrorMessage({ code: 'auth/something-new' }, S.createError)).toBe(S.createError);
  });
});

describe('needsRedirect', () => {
  it('switches to redirect only when the popup cannot open', () => {
    expect(needsRedirect({ code: 'auth/popup-blocked' })).toBe(true);
    expect(needsRedirect({ code: 'auth/operation-not-supported-in-this-environment' })).toBe(true);
    expect(needsRedirect({ code: 'auth/popup-closed-by-user' })).toBe(false);
  });
});
