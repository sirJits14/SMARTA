import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase.js';
import { schoolError } from '../../../../parent/src/lib/school.js';
import { refreshSchoolPendingCount } from '../../../hooks/useSchoolPendingCount.js';

const invoke = async (name, data = {}) => (await httpsCallable(functions, name)(data)).data;

// One loader and one mutation lock shared by every School access view.
export function useSchoolAccess() {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError('');
    try { const data = await invoke('getSchoolContextFn'); if (request === sequence.current) { setContext(data); setLoadedAt(Date.now()); } }
    catch (e) { if (request === sequence.current) setError(schoolError(e)); }
    finally { if (request === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { refresh(); return () => { ++sequence.current; }; }, [refresh]);
  const run = useCallback(async (name, payload, message, after = () => {}) => {
    if (lock.current) return undefined;
    lock.current = true; setPending(true); setError(''); setNotice('');
    try {
      const data = await invoke(name, payload);
      after(data);
      await refresh();
      refreshSchoolPendingCount();
      setNotice(typeof message === 'function' ? message(data) : message);
      return data;
    } catch (e) { setError(schoolError(e)); return undefined; }
    finally { lock.current = false; setPending(false); }
  }, [refresh]);
  return { context, loading, loadedAt, error, notice, pending, refresh, run };
}
