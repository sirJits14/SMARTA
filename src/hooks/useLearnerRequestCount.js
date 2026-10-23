import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

// One shared count for the sidebar badge; concurrent refreshes share a call. It counts only the learner
// requests the signed-in person can decide, and refreshes on load, on window focus and after each decision.
let count = 0;
let inflight = null;
const listeners = new Set();
export function refreshLearnerRequestCount() {
  inflight ??= httpsCallable(functions, 'getLearnerRequestCountFn')({})
    .then(result => { count = Number(result.data?.count) || 0; listeners.forEach(listener => listener(count)); })
    .catch(() => { /* the badge simply keeps its last value */ })
    .finally(() => { inflight = null; });
  return inflight;
}
export function useLearnerRequestCount(enabled) {
  const [value, setValue] = useState(count);
  useEffect(() => {
    if (!enabled) return undefined;
    listeners.add(setValue);
    refreshLearnerRequestCount();
    const onFocus = () => refreshLearnerRequestCount();
    window.addEventListener('focus', onFocus);
    return () => { listeners.delete(setValue); window.removeEventListener('focus', onFocus); };
  }, [enabled]);
  return enabled ? value : 0;
}
