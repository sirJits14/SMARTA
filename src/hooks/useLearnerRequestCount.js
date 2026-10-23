import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

// One shared count for the sidebar badge; concurrent refreshes share a call. It counts only the learner
// requests the signed-in person can decide, and refreshes on load, on window focus and whenever the
// Learner requests page reloads its list.
let count = 0;
let inflight = null;
let generation = 0; // bumped when the last listener leaves, so a late answer for the previous person is dropped
const listeners = new Set();
export function refreshLearnerRequestCount() {
  if (listeners.size === 0) return Promise.resolve(); // nobody is watching (signed out): a late call must not write the next person's count
  if (!inflight) {
    const mine = generation;
    const call = httpsCallable(functions, 'getLearnerRequestCountFn')({})
      .then(result => { if (mine === generation) { count = Number(result.data?.count) || 0; listeners.forEach(listener => listener(count)); } })
      .catch(() => { /* the badge simply keeps its last value */ })
      .finally(() => { if (inflight === call) inflight = null; });
    inflight = call;
  }
  return inflight;
}
export const currentLearnerRequestCount = () => count;
export function subscribeLearnerRequestCount(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // Nobody is watching any more: the next person to sign in must not see this number or share this call.
    if (listeners.size === 0) { count = 0; generation += 1; inflight = null; }
  };
}
export function useLearnerRequestCount(enabled) {
  const [value, setValue] = useState(() => (enabled ? count : 0));
  useEffect(() => {
    if (!enabled) return undefined;
    setValue(count);
    const unsubscribe = subscribeLearnerRequestCount(setValue);
    refreshLearnerRequestCount();
    const onFocus = () => refreshLearnerRequestCount();
    window.addEventListener('focus', onFocus);
    return () => { unsubscribe(); window.removeEventListener('focus', onFocus); setValue(0); };
  }, [enabled]);
  return enabled ? value : 0;
}
