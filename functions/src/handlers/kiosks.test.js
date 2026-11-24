import { describe, it, expect, vi } from 'vitest';
import { registerKiosk, provisionKiosk, resetKioskPassword, deleteKiosk } from './kiosks.js';
import { audit } from '../audit.js';

vi.mock('../audit.js', () => ({ audit: vi.fn() }));

const fakeDb = ({ exists = true } = {}) => ({
  doc: vi.fn(() => ({
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ exists }),
  })),
});

// Per-path fake: docs maps kiosk uid -> data (absent = doc missing).
const kioskDb = (docs = {}) => {
  const set = vi.fn().mockResolvedValue(undefined);
  const batchSet = vi.fn();
  const commit = vi.fn().mockResolvedValue(undefined);
  const db = {
    doc: vi.fn((path) => {
      const id = path.split('/')[1];
      return {
        path,
        set: (...args) => set(path, ...args),
        get: vi.fn().mockResolvedValue({ exists: id in docs, data: () => docs[id] }),
      };
    }),
    batch: vi.fn(() => ({ set: batchSet, commit })),
  };
  return { db, set, batchSet, commit };
};
const kioskUser = (uid) => ({ uid, email: `kiosk-${uid}@bnhs.local` });

describe('provisionKiosk', () => {
  it('slugifies the label into the kiosk email and returns a generated password', async () => {
    const createUser = vi.fn().mockResolvedValue({ uid: 'newUid1', email: 'kiosk-main-gate@bnhs.local' });
    const ctx = { db: fakeDb(), auth: { createUser }, email: 'registrar@bnhs.edu' };

    const result = await provisionKiosk(ctx, { label: 'Main Gate' });

    expect(createUser).toHaveBeenCalledWith({ email: 'kiosk-main-gate@bnhs.local', password: expect.any(String) });
    expect(createUser.mock.calls[0][0].password.length).toBeGreaterThanOrEqual(20);
    expect(result).toEqual({ uid: 'newUid1', email: 'kiosk-main-gate@bnhs.local', password: expect.any(String) });
    expect(JSON.stringify(vi.mocked(audit).mock.calls)).not.toContain(result.password);
  });

  it('strips punctuation and collapses spaces when slugifying', async () => {
    const createUser = vi.fn().mockResolvedValue({ uid: 'newUid2', email: 'kiosk-annex-b-side-door@bnhs.local' });
    const ctx = { db: fakeDb(), auth: { createUser }, email: 'registrar@bnhs.edu' };

    await provisionKiosk(ctx, { label: "Annex B - Side Door!" });

    expect(createUser).toHaveBeenCalledWith({ email: 'kiosk-annex-b-side-door@bnhs.local', password: expect.any(String) });
  });

  it('retries with a numeric suffix when the email is already taken', async () => {
    const createUser = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 'auth/email-already-exists' }))
      .mockResolvedValueOnce({ uid: 'newUid3', email: 'kiosk-main-gate-2@bnhs.local' });
    const ctx = { db: fakeDb(), auth: { createUser }, email: 'registrar@bnhs.edu' };

    const result = await provisionKiosk(ctx, { label: 'Main Gate' });

    expect(createUser).toHaveBeenNthCalledWith(1, { email: 'kiosk-main-gate@bnhs.local', password: expect.any(String) });
    expect(createUser).toHaveBeenNthCalledWith(2, { email: 'kiosk-main-gate-2@bnhs.local', password: expect.any(String) });
    expect(result.email).toBe('kiosk-main-gate-2@bnhs.local');
  });

  it('gives up after 5 collisions and surfaces the error', async () => {
    const collision = Object.assign(new Error('exists'), { code: 'auth/email-already-exists' });
    const createUser = vi.fn().mockRejectedValue(collision);
    const ctx = { db: fakeDb(), auth: { createUser }, email: 'registrar@bnhs.edu' };

    await expect(provisionKiosk(ctx, { label: 'Main Gate' })).rejects.toBe(collision);
    expect(createUser).toHaveBeenCalledTimes(5);
  });

  it('rejects a label that is too short', async () => {
    const ctx = { db: fakeDb(), auth: { createUser: vi.fn() }, email: 'registrar@bnhs.edu' };
    await expect(provisionKiosk(ctx, { label: 'A' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('registerKiosk', () => {
  it('rejects reactivating a kiosks doc that is not backed by a real kiosk-domain Auth account', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue({ exists: true, data: () => ({ label: 'fake', active: false }) });
    const db = { doc: vi.fn(() => ({ set, get })) };
    const getUser = vi.fn().mockResolvedValue({ uid: 'nonKiosk1', email: 'someone@gmail.com' });
    const ctx = { db, auth: { getUser }, email: 'registrar@bnhs.edu' };

    await expect(registerKiosk(ctx, { uid: 'nonKiosk1', label: 'fake' })).rejects.toMatchObject({ code: 'permission-denied' });

    expect(set).not.toHaveBeenCalled();
  });
});

describe('resetKioskPassword', () => {
  it('generates a new password for the existing uid and returns its email', async () => {
    const updateUser = vi.fn().mockResolvedValue({ uid: 'kiosk1', email: 'kiosk-main-gate@bnhs.local' });
    const getUser = vi.fn().mockResolvedValue({ uid: 'kiosk1', email: 'kiosk-main-gate@bnhs.local' });
    const ctx = { db: fakeDb({ exists: true }), auth: { updateUser, getUser }, email: 'registrar@bnhs.edu' };

    const result = await resetKioskPassword(ctx, { uid: 'kiosk1' });

    expect(updateUser).toHaveBeenCalledWith('kiosk1', { password: expect.any(String) });
    expect(result).toEqual({ uid: 'kiosk1', email: 'kiosk-main-gate@bnhs.local', password: expect.any(String) });
    expect(JSON.stringify(vi.mocked(audit).mock.calls)).not.toContain(result.password);
  });

  it('rejects a uid with no matching kiosks doc and does not touch Auth', async () => {
    const updateUser = vi.fn();
    const getUser = vi.fn();
    const ctx = { db: fakeDb({ exists: false }), auth: { updateUser, getUser }, email: 'registrar@bnhs.edu' };

    await expect(resetKioskPassword(ctx, { uid: 'unknownUid' })).rejects.toMatchObject({ code: 'not-found' });

    expect(getUser).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rejects when the kiosks doc exists but the Auth account is not a kiosk device (account-takeover chain guard)', async () => {
    const updateUser = vi.fn();
    const getUser = vi.fn().mockResolvedValue({ uid: 'nonKiosk1', email: 'someone@gmail.com' });
    const ctx = { db: fakeDb({ exists: true }), auth: { updateUser, getUser }, email: 'registrar@bnhs.edu' };

    await expect(resetKioskPassword(ctx, { uid: 'nonKiosk1' })).rejects.toMatchObject({ code: 'permission-denied' });

    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe('registerKiosk (deleted)', () => {
  it('refuses to re-activate a deleted kiosk', async () => {
    const { db, set } = kioskDb({ kiosk1: { label: 'Main Gate', active: false, deleted: true } });
    const getUser = vi.fn().mockResolvedValue(kioskUser('kiosk1'));
    await expect(registerKiosk({ db, auth: { getUser }, email: 'registrar@bnhs.edu' }, { uid: 'kiosk1', label: 'Main Gate' }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(set).not.toHaveBeenCalled();
  });
});

describe('deleteKiosk', () => {
  it('deletes the Auth user, tombstones the doc and audits', async () => {
    vi.mocked(audit).mockClear();
    const { db, set } = kioskDb({ kiosk1: { label: 'Main Gate', active: true } });
    const getUser = vi.fn().mockResolvedValue(kioskUser('kiosk1'));
    const deleteUser = vi.fn().mockResolvedValue(undefined);

    const result = await deleteKiosk({ db, auth: { getUser, deleteUser }, email: 'registrar@bnhs.edu' }, { uid: 'kiosk1' });

    expect(result).toEqual({ ok: true });
    expect(deleteUser).toHaveBeenCalledWith('kiosk1');
    expect(set).toHaveBeenCalledWith('kiosks/kiosk1',
      expect.objectContaining({ active: false, deleted: true, deletedBy: 'registrar@bnhs.edu' }), { merge: true });
    expect(set.mock.calls[0][1]).not.toHaveProperty('label');
    expect(vi.mocked(audit)).toHaveBeenCalledWith(db, expect.objectContaining({
      action: 'kiosk.deleted', targetType: 'kiosk', targetId: 'kiosk1', details: { label: 'Main Gate' },
    }));
  });

  it('refuses a non-kiosk account and changes nothing', async () => {
    const { db, set } = kioskDb({ guardian1: { label: 'x', active: true } });
    const getUser = vi.fn().mockResolvedValue({ uid: 'guardian1', email: 'someone@gmail.com' });
    const deleteUser = vi.fn();
    await expect(deleteKiosk({ db, auth: { getUser, deleteUser }, email: 'registrar@bnhs.edu' }, { uid: 'guardian1' }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('still tombstones the doc when the Auth user is already gone', async () => {
    const { db, set } = kioskDb({ kiosk1: { label: 'Main Gate', active: false } });
    const getUser = vi.fn().mockRejectedValue(Object.assign(new Error('gone'), { code: 'auth/user-not-found' }));
    const deleteUser = vi.fn();
    await deleteKiosk({ db, auth: { getUser, deleteUser }, email: 'registrar@bnhs.edu' }, { uid: 'kiosk1' });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith('kiosks/kiosk1', expect.objectContaining({ deleted: true }), { merge: true });
  });

  it('returns not-found for a missing or already-deleted kiosk', async () => {
    const auth = { getUser: vi.fn(), deleteUser: vi.fn() };
    const missing = kioskDb({});
    await expect(deleteKiosk({ db: missing.db, auth, email: 'r@bnhs.edu' }, { uid: 'kiosk1' })).rejects.toMatchObject({ code: 'not-found' });
    const gone = kioskDb({ kiosk1: { label: 'Main Gate', active: false, deleted: true } });
    await expect(deleteKiosk({ db: gone.db, auth, email: 'r@bnhs.edu' }, { uid: 'kiosk1' })).rejects.toMatchObject({ code: 'not-found' });
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });
});
