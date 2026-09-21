// Per-instance memoization with a TTL. Saves a Firestore read of hot
// documents (settings/parent_portal, kiosks/{id}) on every event during the
// 7 a.m. surge. Instances are recycled, so staleness is bounded by ttlMs.
const store = new Map();

export async function cached(key, ttlMs, loader, nowMs = Date.now()) {
  const hit = store.get(key);
  if (hit && nowMs - hit.at < ttlMs) return hit.value;
  const value = await loader();
  store.set(key, { at: nowMs, value });
  return value;
}

export function clearCache() { store.clear(); }
