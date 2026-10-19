import { useState } from 'react';
import { callable } from '../firebase.js';
import { schoolError } from '../lib/school.js';

// One School action at a time; the screen's context refreshes after each success.
export function useSchoolAction(refresh) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const act = async (name, payload, text, after = () => {}) => {
    if (busy) return false;
    setBusy(true); setMessage(null);
    try { await callable(name)(payload); after(); await refresh(); setMessage({ tone: 'info', text }); return true; }
    catch (e) { setMessage({ tone: 'danger', text: schoolError(e) }); return false; }
    finally { setBusy(false); }
  };
  return { busy, message, act };
}
