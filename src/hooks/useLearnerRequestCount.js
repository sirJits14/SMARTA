import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

// One shared count for the sidebar badge; concurrent refreshes share a call. It counts only the learner
// requests the signed-in person can decide, and refreshes on load, on window focus and whenever the
// Learner requests page reloads its list. The hook gives { count, truncated }: the server stops counting at
// its limit and says so with `truncated`, and listeners are called with (count, truncated).
let count = 0;
let truncated = false;
let inflight = null;
let generation = 0; // bumped when the last listener leaves, so a late answer for the previous person is dropped
const listeners = new Set();
export function refreshLearnerRequestCount() {
  if (listeners.size === 0) return Promise.resolve(); // nobody is watching (signed out): a late call must not write the next person's count
  if (!inflight) {
    const mine = generation;
    const call = httpsCallable(functions, 'getLearnerRequestCountFn')({})
      .then(result => {
        if (mine !== generation) return;
        count = Number(result.data?.count) || 0; truncated = Boolean(result.data?.truncated);
        listeners.forEach(listener => listener(count, truncated));
      })
      .catch(() => { /* the badge simply keeps its last value */ })
      .finally(() => { if (inflight === call) inflight = null; });
    inflight = call;
  }
  return inflight;
}
export const currentLearnerRequestCount = () => count;
export const currentLearnerRequestTruncated = () => truncated;
export function subscribeLearnerRequestCount(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // Nobody is watching any more: the next person to sign in must not see this number or share this call.
    if (listeners.size === 0) { count = 0; truncated = false; generation += 1; inflight = null; }
  };
}
const NONE = Object.freeze({ count: 0, truncated: false });
export function useLearnerRequestCount(enabled) {
  const [value, setValue] = useState(() => (enabled ? { count, truncated } : NONE));
  useEffect(() => {
    if (!enabled) return undefined;
    // Keeps the same object when nothing changed, so an unchanged answer does not re-render the shell.
    const update = (nextCount, nextTruncated) => setValue(prev => (prev.count === nextCount && prev.truncated === nextTruncated ? prev : { count: nextCount, truncated: nextTruncated }));
    update(count, truncated);
    const unsubscribe = subscribeLearnerRequestCount(update);
    refreshLearnerRequestCount();
    const onFocus = () => refreshLearnerRequestCount();
    window.addEventListener('focus', onFocus);
    return () => { unsubscribe(); window.removeEventListener('focus', onFocus); setValue(NONE); };
  }, [enabled]);
  return enabled ? value : NONE;
}
