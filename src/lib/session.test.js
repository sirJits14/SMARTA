import { describe, expect, it, vi } from 'vitest';
import { SIGN_OUT_NOTICE_KEY, signOutAndClear, takeSignOutNotice } from './session.js';

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

describe('signOutAndClear', () => {
  it('signs out, wipes the cache, then reloads, keeping the notice', async () => {
    const { calls, storage, deps: d } = deps();
    await signOutAndClear('Your session has ended. Please sign in again.', d);
    expect(calls).toEqual(['signOut', 'terminate', 'clearCache', 'reload']);
    expect(storage.getItem(SIGN_OUT_NOTICE_KEY)).toBe('Your session has ended. Please sign in again.');
  });

  it('removes an old notice on a plain logout', async () => {
    const { storage, deps: d } = deps();
    storage.setItem(SIGN_OUT_NOTICE_KEY, 'old');
    await signOutAndClear('', d);
    expect(storage.getItem(SIGN_OUT_NOTICE_KEY)).toBeNull();
  });

  it('still reloads when another tab holds the cache', async () => {
    const { calls, deps: d } = deps({ clearCache: vi.fn(async () => { throw new Error('in use'); }) });
    await signOutAndClear('', d);
    expect(calls.at(-1)).toBe('reload');
  });

  it('still signs out when storage is blocked', async () => {
    const { calls, deps: d } = deps({ storage: () => { throw new Error('blocked'); } });
    await signOutAndClear('note', d);
    expect(calls).toEqual(['signOut', 'terminate', 'clearCache', 'reload']);
  });

  it('does not reload when sign-out itself fails, so it cannot loop', async () => {
    const { calls, deps: d } = deps({ signOut: vi.fn(async () => { throw new Error('auth'); }) });
    await signOutAndClear('', d);
    expect(calls).toEqual([]);
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
