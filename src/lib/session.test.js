import { afterEach, describe, expect, it, vi } from 'vitest';
import { SIGN_OUT_NOTICE_KEY, shouldReloadAfterSignOut, signOutAndClear, takeSignOutNotice } from './session.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (k) => (values.has(k) ? values.get(k) : null),
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
  };
}
function deps(overrides = {}) {
  const calls = [];
  const storage = memoryStorage();
  return {
    calls, storage,
    deps: {
      storage: () => storage,
      signOut: vi.fn(async () => calls.push('signOut')),
      terminate: vi.fn(async () => calls.push('terminate')),
      clearCache: vi.fn(async () => calls.push('clearCache')),
      reload: vi.fn(() => calls.push('reload')),
      ...overrides,
    },
  };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('signOutAndClear', () => {
  it('signs out, wipes the cache, then reloads, keeping the notice', async () => {
    const { calls, storage, deps: d } = deps();
    const reloaded = await signOutAndClear('Your session has ended. Please sign in again.', d);
    expect(reloaded).toBe(true);
    expect(calls).toEqual(['signOut', 'terminate', 'clearCache', 'reload']);
    expect(storage.getItem(SIGN_OUT_NOTICE_KEY)).toBe('Your session has ended. Please sign in again.');
  });

  it('removes an old notice on a plain logout', async () => {
    const { storage, deps: d } = deps();
    storage.setItem(SIGN_OUT_NOTICE_KEY, 'old');
    await signOutAndClear('', d);
    expect(storage.getItem(SIGN_OUT_NOTICE_KEY)).toBeNull();
  });

  it('still reloads when the cache cannot be cleared', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('in use');
    const { calls, deps: d } = deps({ clearCache: vi.fn(async () => { throw error; }) });
    const reloaded = await signOutAndClear('', d);
    expect(reloaded).toBe(true);
    expect(calls.at(-1)).toBe('reload');
    expect(warn).toHaveBeenCalledWith('Could not clear the offline cache', error);
  });

  it('still reloads, without clearing, when terminate rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { calls, deps: d } = deps({ terminate: vi.fn(async () => { throw new Error('busy'); }) });
    const reloaded = await signOutAndClear('', d);
    expect(reloaded).toBe(true);
    expect(d.clearCache).not.toHaveBeenCalled();
    expect(calls).toEqual(['signOut', 'reload']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('still signs out when storage is blocked', async () => {
    const { calls, deps: d } = deps({ storage: () => { throw new Error('blocked'); } });
    await signOutAndClear('note', d);
    expect(calls).toEqual(['signOut', 'terminate', 'clearCache', 'reload']);
  });

  it('does not reload when sign-out itself fails, so it cannot loop', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('auth');
    const { calls, deps: d } = deps({ signOut: vi.fn(async () => { throw error; }) });
    const reloaded = await signOutAndClear('', d);
    expect(reloaded).toBe(false);
    expect(calls).toEqual([]);
    expect(warn).toHaveBeenCalledWith('Sign-out failed', error);
  });

  it('removes the stored notice when sign-out fails, so a later reload stays quiet', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { storage, deps: d } = deps({ signOut: vi.fn(async () => { throw new Error('auth'); }) });
    await signOutAndClear('Your session has ended. Please sign in again.', d);
    expect(storage.getItem(SIGN_OUT_NOTICE_KEY)).toBeNull();
  });

  it('still returns false when sign-out fails and storage is blocked', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps: d } = deps({
      storage: () => { throw new Error('blocked'); },
      signOut: vi.fn(async () => { throw new Error('auth'); }),
    });
    await expect(signOutAndClear('note', d)).resolves.toBe(false);
  });
});

describe('shouldReloadAfterSignOut', () => {
  it('reloads a tab that had a user and lost it to another tab', () => {
    expect(shouldReloadAfterSignOut({ hadUser: true, user: null, ending: false })).toBe(true);
  });

  it('does not reload before any user was seen', () => {
    expect(shouldReloadAfterSignOut({ hadUser: false, user: null, ending: false })).toBe(false);
  });

  it('does not reload while a user is present', () => {
    expect(shouldReloadAfterSignOut({ hadUser: true, user: { uid: 'u' }, ending: false })).toBe(false);
  });

  it('does not reload a tab that is ending its own session', () => {
    expect(shouldReloadAfterSignOut({ hadUser: true, user: null, ending: true })).toBe(false);
  });
});

describe('takeSignOutNotice', () => {
  it('returns the stored notice once', () => {
    const storage = memoryStorage();
    storage.setItem(SIGN_OUT_NOTICE_KEY, 'Bye');
    expect(takeSignOutNotice(() => storage)).toBe('Bye');
    expect(takeSignOutNotice(() => storage)).toBe('');
  });

  it('returns an empty notice when storage is blocked', () => {
    expect(takeSignOutNotice(() => { throw new Error('blocked'); })).toBe('');
  });
});
