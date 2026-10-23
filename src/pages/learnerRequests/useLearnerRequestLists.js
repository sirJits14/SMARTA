import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { schoolError } from '../../../parent/src/lib/school.js';
import { refreshLearnerRequestCount } from '../../hooks/useLearnerRequestCount.js';

const invoke = async (name, data = {}) => (await httpsCallable(functions, name)(data)).data;

// The Waiting and Decided lists and one decision lock shared by every card. The server filters both lists to
// what this person may see; a failed decision is kept per card so it shows where the person is looking.
export function useLearnerRequestLists() {
  const [waiting, setWaiting] = useState(null); // { requests, ended }
  const [decided, setDecided] = useState(null); // { requests, nextCursor }
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [failures, setFailures] = useState({});
  const lock = useRef(false);
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError('');
    try {
      const data = await invoke('listLearnerRequestsFn', { view: 'waiting' });
      if (request === sequence.current) { setWaiting({ requests: data.requests, ended: data.ended }); setDecided(null); setLoadedAt(Date.now()); }
    } catch (e) { if (request === sequence.current) setError(schoolError(e)); }
    finally { if (request === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { refresh(); return () => { ++sequence.current; }; }, [refresh]);

  const loadDecided = useCallback(async (more = false) => {
    setLoading(true); setError('');
    try {
      const data = await invoke('listLearnerRequestsFn', { view: 'decided', cursor: more ? decided?.nextCursor : undefined });
      setDecided((current) => ({ requests: more ? [...(current?.requests || []), ...data.requests] : data.requests, nextCursor: data.nextCursor }));
    } catch (e) { setError(schoolError(e)); }
    finally { setLoading(false); }
  }, [decided?.nextCursor]);

  // Approve, or reject with a reason. Resolves true when the server accepted the decision.
  const decide = useCallback(async (request, approve, reason, message) => {
    if (lock.current) return false;
    lock.current = true; setPending(true); setError(''); setNotice('');
    setFailures((current) => { const { [request.id]: _gone, ...rest } = current; return rest; });
    try {
      await invoke('resolveLearnerRequestFn', { requestId: request.id, approve, reason });
      setNotice(message);
      await refresh();
      refreshLearnerRequestCount();
      return true;
    } catch (e) {
      setFailures((current) => ({ ...current, [request.id]: schoolError(e) }));
      await refresh(); // the card reloads, so a request someone else decided disappears
      return false;
    } finally { lock.current = false; setPending(false); }
  }, [refresh]);

  return { waiting, decided, loading, loadedAt, error, notice, pending, failures, refresh, loadDecided, decide };
}
