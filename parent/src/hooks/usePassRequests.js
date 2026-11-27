import { useCallback, useEffect, useRef, useState } from 'react';
import { callable } from '../firebase.js';
import { schoolError } from '../lib/school.js';
import { passListFor } from '../lib/passRequests.js';

// One class's learners and the adviser's temporary pass requests, reloaded whenever the app comes back
// into view. Held in this component only (never on the device or between sign-ins). `learners` and
// `requests` are null until the answer for this class arrives.
export function usePassRequests(sectionId, enabled = true) {
  const active = Boolean(sectionId && enabled);
  const [state, setState] = useState({ sectionId: '', learners: null, requests: null, loading: false, error: '' });
  const sequence = useRef(0);
  const load = useCallback(async () => {
    if (!active) return;
    const request = ++sequence.current;
    setState((current) => ({ ...passListFor(current, sectionId, true), sectionId, loading: true, error: '' }));
    try {
      const { data } = await callable('getTempPassRequestsFn')({ sectionId });
      if (request === sequence.current) setState({ sectionId, learners: data.learners, requests: data.requests, loading: false, error: '' });
    } catch (e) {
      if (request === sequence.current) setState((current) => ({ ...current, loading: false, error: schoolError(e) }));
    }
  }, [sectionId, active]);
  useEffect(() => {
    load();
    return () => { ++sequence.current; };
  }, [load]);
  useEffect(() => {
    const onReturn = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => { window.removeEventListener('focus', onReturn); document.removeEventListener('visibilitychange', onReturn); };
  }, [load]);
  return { ...passListFor(state, sectionId, active), refresh: load };
}
