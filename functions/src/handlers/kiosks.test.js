import { describe, it, expect, vi } from 'vitest';
import { provisionKiosk, resetKioskPassword } from './kiosks.js';
import { audit } from '../audit.js';

vi.mock('../audit.js', () => ({ audit: vi.fn() }));

const fakeDb = ({ exists = true } = {}) => ({
  doc: vi.fn(() => ({
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ exists }),
  })),
});

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
    await expect(provisionKiosk(ctx, { label: 'A' })).rejects.toThrow();
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
