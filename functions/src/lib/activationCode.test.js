import { describe, it, expect } from 'vitest';
import { ALPHABET, generateCode, normalizeCode, isValidCode, formatCode, hashCode } from './activationCode.js';
describe('activationCode', () => {
  it('alphabet is Crockford base32 without I L O U', () => {
    expect(ALPHABET).toHaveLength(32);
    for (const c of 'ILOU') expect(ALPHABET).not.toContain(c);
  });
  it('generates 8 chars from 8 bytes, uniformly (256 % 32 == 0)', () => {
    const code = generateCode(Uint8Array.from([0, 31, 32, 255, 1, 2, 3, 4]));
    expect(code).toBe('0ZZ71234'.replace('ZZ7', `${ALPHABET[31]}${ALPHABET[0]}${ALPHABET[31]}`));
    expect(isValidCode(code)).toBe(true);
  });
  it('normalizes what parents type', () => {
    expect(normalizeCode(' k7m4-p2xq ')).toBe('K7M4P2XQ');
    expect(normalizeCode('K7M4-P2XO')).toBe('K7M4P2X0');   // O → 0
    expect(normalizeCode('K7M4-P2XI')).toBe('K7M4P2X1');   // I → 1
    expect(isValidCode('K7M4P2XQ')).toBe(true);
    expect(isValidCode('K7M4P2X')).toBe(false);
  });
  it('formats and hashes deterministically', () => {
    expect(formatCode('K7M4P2XQ')).toBe('K7M4-P2XQ');
    expect(hashCode('K7M4P2XQ')).toBe(hashCode('K7M4P2XQ'));
    expect(hashCode('K7M4P2XQ')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCode('K7M4P2XQ')).not.toBe(hashCode('K7M4P2XR'));
  });
});
