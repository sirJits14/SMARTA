import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';
import { schoolError } from '../../../parent/src/lib/school.js';
import { refreshLearnerRequestCount } from '../../hooks/useLearnerRequestCount.js';

const invoke = async (name, data = {}) => (await httpsCallable(functions, name)(data)).data;

// True when the list that was just reloaded no longer holds the request: someone else decided it, so its card
// is gone and a refusal can only be shown for the whole page. A reload that failed or was superseded (null)
// leaves the card on screen, so the message stays on it.
export const requestLeftList = (reloaded, requestId) => Array.isArray(reloaded) && !reloaded.some((item) => item?.id === requestId);

// Whether the Decided tab should fetch its first page now. Loads once per empty Decided: starting a load sets
// loading, success sets decided and a failure sets error, and each of the three blocks this condition, so only
// a person can bring one more attempt: Refresh (which clears error and empties decided), or choosing the
// Decided tab, which clears the old message with clearError and tries once.
export const shouldLoadDecided = ({ view, decided, loading, error }) => view === 'decided' && !decided && !loading && !error;

// The Waiting state kept from the server's answer. `truncated` is true when more requests were pending than the
// server returns, so the page can say the list is cut.
export const waitingState = (data) => ({ requests: data.requests, ended: data.ended, truncated: Boolean(data.truncated) });

// The notice after a decision: a string as written, or a function of what the server answered ({ ok, mode }).
export const noticeText = (message, result) => (typeof message === 'function' ? message(result) : message);

// The Waiting and Decided lists and one decision lock shared by every card. The server filters both lists to
// what this person may see; a failed decision is kept per card so it shows where the person is looking, and
// `pendingId` names the request being decided so its own button can say so.
export function useLearnerRequestLists() {
  const [waiting, setWaiting] = useState(null); // { requests, ended, truncated }
  const [decided, setDecided] = useState(null); // { requests, nextCursor }
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [pendingId, setPendingId] = useState('');
  const [failures, setFailures] = useState({});
  const lock = useRef(false);
  const sequence = useRef(0);
  const decidedSequence = useRef(0); // bumped by every Decided load and by refresh, which empties Decided

  // Resolves to the freshly loaded requests, or null when the load failed or a newer one took over.
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    ++decidedSequence.current;
    setLoading(true); setError('');
    try {
      const data = await invoke('listLearnerRequestsFn', { view: 'waiting' });
      if (request !== sequence.current) return null;
      setWaiting(waitingState(data)); setDecided(null); setLoadedAt(Date.now());
      refreshLearnerRequestCount(); // the sidebar badge follows every reload, including the page's own Refresh
      return data.requests;
    } catch (e) {
      if (request === sequence.current) setError(schoolError(e, 'Could not load learner requests.'));
      return null;
    } finally { if (request === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => { refresh(); return () => { ++sequence.current; ++decidedSequence.current; }; }, [refresh]);

  const loadDecided = useCallback(async (more = false) => {
    const call = ++decidedSequence.current;
    setLoading(true); setError('');
    try {
      const data = await invoke('listLearnerRequestsFn', { view: 'decided', cursor: more ? decided?.nextCursor : undefined });
      if (call === decidedSequence.current) setDecided((current) => ({ requests: more ? [...(current?.requests || []), ...data.requests] : data.requests, nextCursor: data.nextCursor }));
    } catch (e) { if (call === decidedSequence.current) setError(schoolError(e, 'Could not load decided requests.')); }
    finally { if (call === decidedSequence.current) setLoading(false); }
  }, [decided?.nextCursor]);

  // Approve, or reject with a reason. Resolves true when the server accepted the decision. `message` is the
  // notice, or a function of the server's answer ({ ok, mode }) so the notice says what actually happened.
  const decide = useCallback(async (request, approve, reason, message) => {
    if (lock.current) return false;
    lock.current = true; setPending(true); setPendingId(request.id); setError(''); setNotice('');
    setFailures((current) => { const { [request.id]: _gone, ...rest } = current; return rest; });
    try {
      const result = await invoke('resolveLearnerRequestFn', { requestId: request.id, approve, reason });
      setNotice(noticeText(message, result));
      await refresh();
      return true;
    } catch (e) {
      const text = schoolError(e);
      setFailures((current) => ({ ...current, [request.id]: text }));
      const reloaded = await refresh(); // the list reloads, so a request someone else decided disappears
      // refresh clears the page error first, so a refusal whose card is gone is set after it
      if (requestLeftList(reloaded, request.id)) setError(text);
      return false;
    } finally { lock.current = false; setPending(false); setPendingId(''); }
  }, [refresh]);

  const clearError = useCallback(() => setError(''), []);
  // Not part of refresh: decide sets the notice and then refreshes, and the notice must outlive that reload. Only a
  // person's own Refresh or change of tab drops it, so a finished decision's message does not sit above newer data.
  const clearNotice = useCallback(() => setNotice(''), []);

  return { waiting, decided, loading, loadedAt, error, notice, pending, pendingId, failures, refresh, loadDecided, decide, clearError, clearNotice };
}
