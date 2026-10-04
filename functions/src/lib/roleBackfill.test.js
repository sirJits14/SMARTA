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
  it('binds an unbound profile to its Auth uid, never overwriting one', () => {
    expect(roleBackfill({ role: 'admin', gradeLevel: null, disabled: false, mustChangePassword: false }, 'u1')).toEqual({ uid: 'u1' });
    expect(roleBackfill({ name: 'R' }, 'u1')).toEqual({ role: 'admin', gradeLevel: null, disabled: false, mustChangePassword: false, uid: 'u1' });
    expect(roleBackfill({ role: 'admin', gradeLevel: null, disabled: false, mustChangePassword: false, uid: 'u0' }, 'u1')).toBeNull();
    expect(roleBackfill({ role: 'admin', gradeLevel: null, disabled: false, mustChangePassword: false }, null)).toBeNull();
  });
});
