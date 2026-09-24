import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, appCheckReady } from '../firebase.js';

export function useDoc(path) {
  const [state, setState] = useState({ data: undefined, error: null });
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
        (s) => setState({ data: s.exists() ? { id: s.id, ...s.data() } : null, error: null, fromCache: s.metadata.fromCache }),
        (e) => setState({ data: null, error: e.code || 'error' }));
    });
    return () => { cancelled = true; unsub(); };
  }, [path]);
  return state;
}

// buildQuery must return a Firestore Query with a limit (rules require it).
export function useQuery(buildQuery, deps) {
  const [state, setState] = useState({ rows: undefined, error: null });
  useEffect(() => {
    const q = buildQuery();
    if (!q) { setState({ rows: undefined, error: null }); return; }
    let cancelled = false; let unsub = () => {};
    appCheckReady.then(() => {
      if (cancelled) return;
      unsub = onSnapshot(q, (s) => setState({ rows: s.docs.map((d) => ({ id: d.id, ...d.data() })), error: null }), (e) => {
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
