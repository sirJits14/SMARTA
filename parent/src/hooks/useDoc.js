import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, appCheckReady } from '../firebase.js';

// The last data each doc path (or keyed query) delivered this sign-in, so a
// screen opened again -- going back to Home, say -- paints at once instead of
// flashing a spinner while its listener re-attaches. The live snapshot
// replaces it moments later. Cleared on sign-in changes (hooks/useAuth.js).
const lastSeen = new Map();
export const clearLastSeen = () => lastSeen.clear();

export function useDoc(path) {
  const [state, setState] = useState(() => ({ data: path ? lastSeen.get(path) : undefined, error: null }));
  useEffect(() => {
    if (!path) { setState({ data: undefined, error: null }); return; }
    // Wait for App Check to attach before the first listener subscribes --
    // a permission-denied from subscribing too early never self-heals on
    // its own once App Check is ready (see firebase.js's appCheckReady).
    let cancelled = false; let unsub = () => {};
    appCheckReady.then(() => {
      if (cancelled) return;
      unsub = onSnapshot(doc(db, path),
        { includeMetadataChanges: true },
        (s) => {
          const data = s.exists() ? { id: s.id, ...s.data() } : null;
          lastSeen.set(path, data);
          setState({ data, error: null, fromCache: s.metadata.fromCache });
        },
        (e) => { lastSeen.delete(path); setState({ data: null, error: e.code || 'error' }); });
    });
    return () => { cancelled = true; unsub(); };
  }, [path]);
  return state;
}

const lastSeenFor = (key) => Object.fromEntries((key ? key.split('|') : [])
  .filter((path) => lastSeen.has(path)).map((path) => [path, { data: lastSeen.get(path), error: null }]));

// Live docs for several paths at once, as { [path]: { data, error } }. A path
// is missing from the result until its first snapshot (or error) arrives, so
// callers can wait for all of them before ordering a list.
export function useDocs(paths) {
  const key = paths.join('|');
  const [state, setState] = useState(() => lastSeenFor(key));
  useEffect(() => {
    setState(lastSeenFor(key));
    if (!key) return;
    let cancelled = false; const unsubs = [];
    appCheckReady.then(() => {
      if (cancelled) return;
      for (const path of key.split('|')) {
        unsubs.push(onSnapshot(doc(db, path),
          (s) => {
            const data = s.exists() ? { id: s.id, ...s.data() } : null;
            lastSeen.set(path, data);
            setState((prev) => ({ ...prev, [path]: { data, error: null } }));
          },
          (e) => { lastSeen.delete(path); setState((prev) => ({ ...prev, [path]: { data: null, error: e.code || 'error' } })); }));
      }
    });
    return () => { cancelled = true; unsubs.forEach((u) => u()); };
  }, [key]);
  return state;
}

// buildQuery must return a Firestore Query with a limit (rules require it).
// `cacheKey` opts the query into lastSeen; leave it out where stale rows
// would mislead (the Inbox marks what was unread on open).
export function useQuery(buildQuery, deps, cacheKey) {
  const [state, setState] = useState(() => ({ rows: cacheKey ? lastSeen.get(cacheKey) : undefined, error: null }));
  useEffect(() => {
    const q = buildQuery();
    if (!q) { setState({ rows: undefined, error: null }); return; }
    let cancelled = false; let unsub = () => {};
    appCheckReady.then(() => {
      if (cancelled) return;
      unsub = onSnapshot(q, (s) => {
        const rows = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (cacheKey) lastSeen.set(cacheKey, rows);
        setState({ rows, error: null });
      }, (e) => {
        if (cacheKey) lastSeen.delete(cacheKey);
        // Callers must check `error` -- rows is [] here, which otherwise
        // renders identically to a genuinely empty list (that's how a
        // missing Firestore index went unnoticed on the Inbox).
        console.warn('useQuery failed:', e.code, e.message);
        setState({ rows: [], error: e.code || 'error' });
      });
    });
    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
