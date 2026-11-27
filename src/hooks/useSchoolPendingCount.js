import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

// One shared count for the sidebar and the Guardians tab; concurrent refreshes share a call.
let count = 0;
let inflight = null;
const listeners = new Set();
export function refreshSchoolPendingCount() {
  inflight ??= httpsCallable(functions, 'getSchoolPendingCountFn')({})
    .then(result => { count = Number(result.data?.count) || 0; listeners.forEach(listener => listener(count)); })
    .catch(() => { /* the badge simply keeps its last value */ })
    .finally(() => { inflight = null; });
  return inflight;
}
export function useSchoolPendingCount(enabled) {
  const [value, setValue] = useState(count);
  useEffect(() => {
    if (!enabled) return undefined;
    listeners.add(setValue);
    refreshSchoolPendingCount();
    const onFocus = () => refreshSchoolPendingCount();
    window.addEventListener('focus', onFocus);
    return () => { listeners.delete(setValue); window.removeEventListener('focus', onFocus); };
  }, [enabled]);
  return enabled ? value : 0;
}
