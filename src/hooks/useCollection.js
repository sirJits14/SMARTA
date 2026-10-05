import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';
import { startResourceSubscription } from '../lib/resourceSubscription.js';
const EMPTY = [];
function useResource(subscribe, deps, emptyValue) {
  const [attempt, setAttempt] = useState(0);
  // The token identifies the subscription, including the first render before effect cleanup.
  const token = useMemo(() => ({ subscribe }), [...deps, attempt]);
  const [state, setState] = useState(() => ({ token: null, data: emptyValue, loading: true, error: null }));
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => startResourceSubscription(token.subscribe, value => setState({ token, ...value }), emptyValue), [token, emptyValue]);
  return { ...(state.token === token ? state : { data: emptyValue, loading: true, error: null }), retry };
}
export function useCollectionResource(path) {
  return useResource((next, fail) => onSnapshot(collection(db, path),
    snapshot => next(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), fail), [path], EMPTY);
}
export function useDocResource(path) {
  return useResource((next, fail) => {
    if (!path) { next(null); return; }
    return onSnapshot(doc(db, path), snapshot => next(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null), fail);
  }, [path], null);
}
// buildQuery retains its where/orderBy/limit. Null query means no selected filter.
export function useQueryResource(buildQuery, deps) {
  return useResource((next, fail) => {
    const query = buildQuery();
    if (!query) { next(EMPTY); return; }
    return onSnapshot(query, snapshot => next(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), fail);
  }, deps, EMPTY);
}
export const useCollection = path => useCollectionResource(path).data;
export const useDoc = path => useDocResource(path).data;
export const useQueryRows = (buildQuery, deps) => useQueryResource(buildQuery, deps).data;
