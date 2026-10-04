import { describe, it, expect, vi } from 'vitest';
import { createStaffUser, deleteStaffUser, staffEmail, roleAndGrade } from './users.js';
import { audit } from '../audit.js';

vi.mock('../audit.js', () => ({ audit: vi.fn() }));

describe('staffEmail', () => {
  it('trims and lowercases a valid address', () => expect(staffEmail('  Ana@BNHS.edu ')).toBe('ana@bnhs.edu'));
  it('rejects junk', () => expect(() => staffEmail('nope')).toThrow(/valid email/));
  // The address is a Firestore document id (users/{email}); '/' would make it a path.
  it('rejects a slash', () => {
    expect(() => staffEmail('a/b@bnhs.edu')).toThrow(/valid email/);
    expect(() => staffEmail('ab@bnhs.edu/x')).toThrow(/valid email/);
  });
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

describe('deleteStaffUser audit', () => {
  it('records the deletion even when removing the login fails', async () => {
    audit.mockClear();
    const ref = { id: 'glc8@bnhs.edu' };
    const tx = {
      get: vi.fn(async (r) => (r === ref
        ? { exists: true, data: () => ({ role: 'glc', gradeLevel: 8, uid: 'u8' }) }
        : { docs: [{ id: 'admin@bnhs.edu', data: () => ({ role: 'admin' }) }] })),
      delete: vi.fn(),
    };
    const db = { doc: vi.fn(() => ref), collection: vi.fn(() => ({})), runTransaction: (fn) => fn(tx) };
    const auth = { deleteUser: vi.fn().mockRejectedValue(Object.assign(new Error('auth down'), { code: 'auth/internal-error' })) };
    await expect(deleteStaffUser({ db, auth, email: 'admin@bnhs.edu' }, { email: 'glc8@bnhs.edu' })).rejects.toThrow('auth down');
    expect(tx.delete).toHaveBeenCalledWith(ref);
    expect(audit).toHaveBeenCalledWith(db, expect.objectContaining({ action: 'staff.deleted', targetId: 'glc8@bnhs.edu', details: { role: 'glc' } }));
  });
});
