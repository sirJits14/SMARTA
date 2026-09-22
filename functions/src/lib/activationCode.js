import { createHash } from 'node:crypto';

// Crockford base32: no I, L, O, U — nothing a parent can misread on paper.
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// 8 random bytes → 8 symbols. 256 is divisible by 32, so `byte % 32` is
// exactly uniform: ~2^40 codes.
export function generateCode(bytes) {
  return Array.from(bytes.subarray(0, 8), (b) => ALPHABET[b % 32]).join('');
}
export function normalizeCode(input) {
  return String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}
export const isValidCode = (code) => /^[0-9A-HJKMNP-TV-Z]{8}$/.test(code);
export const formatCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;
export const hashCode = (code) => createHash('sha256').update(code).digest('hex');
