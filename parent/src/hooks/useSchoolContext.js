import { useCallback, useEffect, useRef, useState } from 'react';
import { callable } from '../firebase.js';
import { schoolError } from '../lib/school.js';

// School access is always refreshed from the server, never inferred from family links.
export function useSchoolContext(uid, enabled = true) {
  const [state, setState] = useState({ data: null, loading: false, error: '' });
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (!uid || !enabled) { setState({ data: null, loading: false, error: '' }); return; }
    setState((current) => ({ data: current.data, loading: true, error: '' }));
    try {
      const result = await callable('getSchoolContextFn')({});
      if (request === sequence.current) setState({ data: result.data, loading: false, error: '' });
    } catch (error) {
      if (request === sequence.current) setState({ data: null, loading: false, error: schoolError(error) });
    }
  }, [uid, enabled]);
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { ++sequence.current; window.removeEventListener('focus', onFocus); };
  }, [refresh]);
  return { ...state, refresh };
}
