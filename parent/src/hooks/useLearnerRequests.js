import { useCallback, useEffect, useRef, useState } from 'react';
import { callable } from '../firebase.js';
import { schoolError } from '../lib/school.js';

// The adviser's own learner requests for one class, reloaded whenever the app comes back into view.
// `requests` is null until the first answer arrives.
export function useLearnerRequests(sectionId, enabled = true) {
  const active = Boolean(sectionId && enabled);
  const [state, setState] = useState({ requests: null, loading: active, error: '' });
  const sequence = useRef(0);
  const load = useCallback(async () => {
    if (!active) return;
    const request = ++sequence.current;
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const { data } = await callable('getLearnerRequestsFn')({ sectionId });
      if (request === sequence.current) setState({ requests: data.requests, loading: false, error: '' });
    } catch (e) {
      if (request === sequence.current) setState((current) => ({ ...current, loading: false, error: schoolError(e) }));
    }
  }, [sectionId, active]);
  useEffect(() => {
    setState({ requests: null, loading: active, error: '' });
    load();
    return () => { ++sequence.current; };
  }, [load, active]);
  useEffect(() => {
    const onReturn = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => { window.removeEventListener('focus', onReturn); document.removeEventListener('visibilitychange', onReturn); };
  }, [load]);
  return { ...state, refresh: load };
}
