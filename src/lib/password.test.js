import { describe, it, expect } from 'vitest';
import { passwordProblem } from './password.js';

describe('passwordProblem', () => {
  it('accepts matching passwords of 10+ characters', () => expect(passwordProblem('abcdefghij', 'abcdefghij')).toBeNull());
  it('explains what is wrong', () => {
    expect(passwordProblem('short', 'short')).toBe('Use at least 10 characters.');
    expect(passwordProblem('x'.repeat(129), 'x'.repeat(129))).toBe('Use at most 128 characters.');
    expect(passwordProblem('abcdefghij', 'abcdefghik')).toBe('The two passwords do not match.');
  });
});
