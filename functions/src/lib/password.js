import { randomBytes } from 'node:crypto';

// base64url avoids characters that need escaping when copy-pasted into a
// plain <input> or a terminal; 18 random bytes -> 24 chars, ~144 bits.
export const generatePassword = () => randomBytes(18).toString('base64url');
