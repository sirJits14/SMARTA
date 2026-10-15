import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { startResourceSubscription } from '../lib/resourceSubscription.js';
import { createSubscriptionRegistry } from '../lib/subscriptionRegistry.js';
import { staffCollectionQuery, staffResourceKey } from '../lib/staffQueries.js';
const EMPTY = [];
const rows = snapshot => snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
// One listener per key for the whole app; pages that ask for the same rows share it.
const shared = createSubscriptionRegistry();
function useResource(subscribe, deps, emptyValue) {
  const [attempt, setAttempt] = useState(0);
  // The token identifies the subscription, including the first render before effect cleanup.
  const token = useMemo(() => ({ subscribe }), [...deps, attempt]);
  const [state, setState] = useState(() => ({ token: null, data: emptyValue, loading: true, error: null }));
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => startResourceSubscription(token.subscribe, value => setState({ token, ...value }), emptyValue), [token, emptyValue]);
  return { ...(state.token === token ? state : { data: emptyValue, loading: true, error: null }), retry };
}
// The key must name everything the listener depends on: same key, same rows.
function useSharedResource(key, subscribe, emptyValue) {
  const subscribeRef = useRef(subscribe);
  subscribeRef.current = subscribe;
  const listen = useCallback(onChange => {
    const handle = shared.acquire(key, publish =>
      startResourceSubscription((next, fail) => subscribeRef.current(next, fail), publish, emptyValue));
    const unlisten = handle.listen(onChange);
    onChange(); // the listener may have published between render and this subscribe
    return () => { unlisten(); handle.release(); };
  }, [key, emptyValue]);
  const state = useSyncExternalStore(listen, () => shared.peek(key));
  const retry = useCallback(() => shared.restart(key), [key]);
  return { ...(state ?? { data: emptyValue, loading: true, error: null }), retry };
}
export function useCollectionResource(path) {
  return useSharedResource(`${path}|all`, (next, fail) => onSnapshot(collection(db, path), snapshot => next(rows(snapshot)), fail), EMPTY);
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
    return onSnapshot(query, snapshot => next(rows(snapshot)), fail);
  }, deps, EMPTY);
}
export function useSharedQueryResource(key, buildQuery) {
  return useSharedResource(key, (next, fail) => {
    const query = buildQuery();
    if (!query) { next(EMPTY); return; }
    return onSnapshot(query, snapshot => next(rows(snapshot)), fail);
  }, EMPTY);
}
// Only the selected year's enrollments; every past year stays off the wire.
export function useSchoolYearEnrollments(schoolYear) {
  return useSharedQueryResource(`enrollments|sy=${schoolYear || ''}`,
    () => (schoolYear ? query(collection(db, 'enrollments'), where('schoolYear', '==', schoolYear)) : null));
}
export function useStaffCollectionResource(path, { me, schoolYear, sectionId, date } = {}) {
  const key = staffResourceKey(path, { me, schoolYear, sectionId, date });
  const resource = useSharedQueryResource(key, () => staffCollectionQuery(path, { me, schoolYear, sectionId, date }));
  // A profile that is still loading must never look like a successful empty roster.
  return !me ? { ...resource, data: EMPTY, loading: true, error: null } : resource;
}
export const useCollection = path => useCollectionResource(path).data;
export const useDoc = path => useDocResource(path).data;
export const useQueryRows = (buildQuery, deps) => useQueryResource(buildQuery, deps).data;
