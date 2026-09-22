import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';

export function useDoc(path) {
  const [state, setState] = useState({ data: undefined, error: null });
  useEffect(() => {
    if (!path) { setState({ data: undefined, error: null }); return; }
    return onSnapshot(doc(db, path),
      { includeMetadataChanges: true },
      (s) => setState({ data: s.exists() ? { id: s.id, ...s.data() } : null, error: null, fromCache: s.metadata.fromCache }),
      (e) => setState({ data: null, error: e.code || 'error' }));
  }, [path]);
  return state;
}

// buildQuery must return a Firestore Query with a limit (rules require it).
export function useQuery(buildQuery, deps) {
  const [state, setState] = useState({ rows: undefined, error: null });
  useEffect(() => {
    const q = buildQuery();
    if (!q) { setState({ rows: undefined, error: null }); return; }
    return onSnapshot(q, (s) => setState({ rows: s.docs.map((d) => ({ id: d.id, ...d.data() })), error: null }), (e) => setState({ rows: [], error: e.code || 'error' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
