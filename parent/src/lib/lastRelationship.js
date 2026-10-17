// The relationship picked the last time this account linked a learner, so
// Activate and Request access don't fall back to "Mother" every time. Per
// device and per account: a shared phone keeps each parent's own choice.
const KEY = 'bnhs-parent-last-relationship';

// Reading localStorage itself throws when site data is blocked.
const local = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function recallRelationship(uid, allowed, fallback, storage = local()) {
  if (!uid || !storage) return fallback;
  let stored = null;
  try { stored = storage.getItem(`${KEY}:${uid}`); } catch {}
  return allowed.includes(stored) ? stored : fallback;
}

export function rememberRelationship(uid, relationship, storage = local()) {
  if (!uid || !storage) return;
  try { storage.setItem(`${KEY}:${uid}`, relationship); } catch {}
}
