import { describe, it, expect } from 'vitest';
import * as bindings from './staffProfileBindings.js';

describe('staff profile binding migration', () => {
  const profile = { email: 'staff@bnhs.edu', uid: 'u1' };
  const login = { email: 'staff@bnhs.edu', uid: 'u1' };
  it('plans a missing UID lookup without changing a bound profile', () => {
    expect(bindings.planStaffProfileBindings({ profiles: [profile], authUsers: [login] })).toEqual({
      changes: [{ email: 'staff@bnhs.edu', uid: 'u1', bindUid: false }], warnings: [],
    });
  });
  it('binds a legacy profile to the matching Auth account', () => {
    expect(bindings.planStaffProfileBindings({ profiles: [{ email: 'staff@bnhs.edu' }], authUsers: [login] })).toEqual({
      changes: [{ email: 'staff@bnhs.edu', uid: 'u1', bindUid: true }], warnings: [],
    });
  });
  it('is idempotent for matching profile and lookup', () => {
    expect(bindings.planStaffProfileBindings({ profiles: [profile], authUsers: [login], indexes: [login] })).toEqual({ changes: [], warnings: [] });
  });
  it.each([
    ['missing Auth account', [profile], [], []],
    ['changed Auth email', [profile], [{ ...login, email: 'changed@bnhs.edu' }], []],
    ['different indexed profile', [profile], [login], [{ ...login, email: 'other@bnhs.edu' }]],
    ['two profiles for one UID', [profile, { ...profile, email: 'other@bnhs.edu' }], [login], []],
  ])('reports %s instead of guessing', (_label, profiles, authUsers, indexes) => {
    expect(bindings.planStaffProfileBindings({ profiles, authUsers, indexes }).warnings.length).toBeGreaterThan(0);
  });
});
