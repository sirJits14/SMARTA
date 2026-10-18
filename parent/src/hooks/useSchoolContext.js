import { useCallback, useEffect, useRef, useState } from 'react';
import { callable } from '../firebase.js';
import { schoolError } from '../lib/school.js';

// School access is always refreshed from the server, never inferred from family links.
export function useSchoolContext(uid, enabled = true) {
  const [state, setState] = useState({ uid, data: null, loading: Boolean(uid && enabled), error: '' });
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (!uid || !enabled) { setState({ uid, data: null, loading: false, error: '' }); return; }
    // Keep the last context only for the same account, so a refresh never blanks the UI.
    setState((current) => ({ uid, data: current.uid === uid ? current.data : null, loading: true, error: '' }));
    try {
      const result = await callable('getSchoolContextFn')({});
      if (request === sequence.current) setState({ uid, data: result.data, loading: false, error: '' });
    } catch (error) {
      if (request === sequence.current) setState((current) => ({ uid, data: current.uid === uid ? current.data : null, loading: false, error: schoolError(error) }));
    }
  }, [uid, enabled]);
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { ++sequence.current; window.removeEventListener('focus', onFocus); };
  }, [refresh]);
  return { data: state.uid === uid ? state.data : null, loading: state.loading, error: state.error, refresh };
}
