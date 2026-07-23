import { describe, it, expect } from 'vitest';
import { isValidLRN, lrnTaken, validateStudent } from './validation.js';

describe('LRN', () => {
  it('accepts exactly 12 digits', () => expect(isValidLRN('123456789012')).toBe(true));
  it('rejects wrong length or non-digits', () => {
    expect(isValidLRN('12345')).toBe(false);
    expect(isValidLRN('12345678901a')).toBe(false);
    expect(isValidLRN('')).toBe(false);
  });
  it('detects a taken LRN, ignoring the same record', () => {
    const students = [{ id: 'a', lrn: '111111111111' }, { id: 'b', lrn: '222222222222' }];
    expect(lrnTaken('111111111111', students)).toBe(true);
    expect(lrnTaken('111111111111', students, 'a')).toBe(false); // editing self
    expect(lrnTaken('333333333333', students)).toBe(false);
  });
});

describe('validateStudent', () => {
  const good = { lrn:'123456789012', lastName:'Cruz', firstName:'Ana', sex:'F', birthdate:'2012-05-01' };
  it('passes a complete form', () => expect(validateStudent(good).ok).toBe(true));
  it('flags each missing/invalid field', () => {
    const r = validateStudent({ lrn:'12', lastName:'', firstName:'', sex:'X', birthdate:'' });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['birthdate','firstName','lastName','lrn','sex']);
  });
});
