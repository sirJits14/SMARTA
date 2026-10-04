import { describe, it, expect, vi } from 'vitest';
import { createStaffUser, staffEmail, roleAndGrade } from './users.js';

vi.mock('../audit.js', () => ({ audit: vi.fn() }));

describe('staffEmail', () => {
  it('trims and lowercases a valid address', () => expect(staffEmail('  Ana@BNHS.edu ')).toBe('ana@bnhs.edu'));
  it('rejects junk', () => expect(() => staffEmail('nope')).toThrow(/valid email/));
});

describe('roleAndGrade', () => {
  it('requires a 7-12 grade for glc', () => {
    expect(roleAndGrade('glc', 8)).toEqual({ role: 'glc', gradeLevel: 8 });
    expect(() => roleAndGrade('glc', null)).toThrow('Grade level is required for a Grade Level Coordinator.');
    expect(() => roleAndGrade('glc', 13)).toThrow(/between 7 and 12/);
  });
  it('forbids a grade on every other role', () => {
    expect(roleAndGrade('jhs_coord', null)).toEqual({ role: 'jhs_coord', gradeLevel: null });
    expect(() => roleAndGrade('admin', 8)).toThrow(/only to a Grade Level Coordinator/);
  });
  it('rejects unknown roles', () => expect(() => roleAndGrade('registrar', null)).toThrow(/not a valid choice/));
});

describe('createStaffUser rollback', () => {
  it('deletes the new Auth user when the profile write fails', async () => {
    const deleteUser = vi.fn().mockResolvedValue(undefined);
    const auth = { createUser: vi.fn().mockResolvedValue({ uid: 'u1' }), deleteUser };
    const db = { doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue({ exists: false }), create: vi.fn().mockRejectedValue(new Error('boom')) })) };
    await expect(createStaffUser({ db, auth, email: 'admin@bnhs.edu' }, { name: 'Ana Cruz', email: 'glc8@bnhs.edu', role: 'glc', gradeLevel: 8 }))
      .rejects.toThrow('boom');
    expect(deleteUser).toHaveBeenCalledWith('u1');
  });
});
