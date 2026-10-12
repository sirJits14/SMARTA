import { describe, it, expect, vi, afterEach } from 'vitest';
import * as passwords from './password.js';
const { passwordProblem } = passwords;

describe('passwordProblem', () => {
  it('accepts matching passwords of 10+ characters', () => expect(passwordProblem('abcdefghij', 'abcdefghij')).toBeNull());
  it('explains what is wrong', () => {
    expect(passwordProblem('short', 'short')).toBe('Use at least 10 characters.');
    expect(passwordProblem('x'.repeat(129), 'x'.repeat(129))).toBe('Use at most 128 characters.');
    expect(passwordProblem('abcdefghij', 'abcdefghik')).toBe('The two passwords do not match.');
  });
});

describe('waitForPasswordSession', () => {
  afterEach(() => vi.useRealTimers());
  it('waits until a fresh sign-in can satisfy the server cutoff', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000_250);
    let finished = false;
    const waiting = passwords.waitForPasswordSession(1001).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(749);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(251);
    await waiting;
    expect(finished).toBe(true);
  });
  it('accepts older server responses that do not supply a cutoff', async () => {
    await expect(passwords.waitForPasswordSession(undefined)).resolves.toBeUndefined();
  });
});
