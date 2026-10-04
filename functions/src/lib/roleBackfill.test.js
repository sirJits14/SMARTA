import { describe, it, expect } from 'vitest';
import { roleBackfill } from './roleBackfill.js';

describe('roleBackfill', () => {
  it('makes legacy registrar / role-less profiles explicit admins', () => {
    expect(roleBackfill({ name: 'R', role: 'registrar' })).toEqual({ role: 'admin', gradeLevel: null, disabled: false, mustChangePassword: false });
    expect(roleBackfill({ name: 'R' })).toEqual({ role: 'admin', gradeLevel: null, disabled: false, mustChangePassword: false });
  });
  it('only fills missing flags on new-style profiles', () => {
    expect(roleBackfill({ role: 'glc', gradeLevel: 8 })).toEqual({ disabled: false, mustChangePassword: false });
  });
  it('is idempotent', () => {
    expect(roleBackfill({ role: 'admin', gradeLevel: null, disabled: false, mustChangePassword: false })).toBeNull();
  });
});
