// One School access record per signed-in account, shared by every screen that
// asks (App's mode check, Settings, the Class tab) and saved on this device, so
// Settings' "Use the app as" row and the Class tab paint at once instead of
// waiting on the server each time they open. The server is still asked on
// every open and focus; a revoked or changed assignment replaces the saved
// copy as soon as that answer arrives.
const KEY = 'bnhs-school-context';

const NONE = Object.freeze({ data: null, loading: false, error: '' });

export function createSchoolContextStore({ fetch, storage, describe = String, now = Date.now }) {
  const entries = new Map(); // uid -> { data, loading, error, at }
  const inflight = new Map(); // uid -> Promise
  const listeners = new Set();
  const emit = () => listeners.forEach((l) => l());

  const readSaved = (uid) => {
    try {
      const saved = JSON.parse(storage?.getItem(KEY) || 'null');
      return saved?.uid === uid && saved.data ? saved.data : null;
    } catch { return null; }
  };
  const save = (uid, data) => { try { storage?.setItem(KEY, JSON.stringify({ uid, data })); } catch { /* private mode: kept for this visit */ } };

  function get(uid) {
    if (!uid) return NONE;
    // Loading until the server first answers, so a deep link to /settings/mode waits instead of bouncing.
    if (!entries.has(uid)) entries.set(uid, { data: readSaved(uid), loading: true, error: '', at: 0 });
    return entries.get(uid);
  }
  const set = (uid, patch) => { entries.set(uid, { ...get(uid), ...patch }); emit(); };

  // Several screens asking at once share one request. `maxAge` skips the call when the
  // server answered that recently (tab switches); a focus or retry always asks again.
  // `force` always starts a new request, even over one already on its way: that one may
  // have begun before a role was saved, and its answer is ignored once this one replaces it.
  function refresh(uid, { maxAge = 0, force = false } = {}) {
    if (!uid) return Promise.resolve();
    if (!force) {
      if (inflight.has(uid)) return inflight.get(uid);
      if (maxAge && now() - get(uid).at < maxAge) return Promise.resolve();
    }
    set(uid, { loading: true, error: '' });
    const request = Promise.resolve().then(() => fetch()).then(
      (data) => { if (inflight.get(uid) !== request) return; save(uid, data); set(uid, { data, loading: false, error: '', at: now() }); },
      (error) => { if (inflight.get(uid) !== request) return; set(uid, { loading: false, error: describe(error) }); },
    ).finally(() => { if (inflight.get(uid) === request) inflight.delete(uid); });
    inflight.set(uid, request);
    return request;
  }

  // Sign-out: the next account on this device must not see this one's sections.
  function forget() {
    entries.clear(); inflight.clear();
    try { storage?.removeItem(KEY); } catch { /* nothing saved */ }
    emit();
  }

  const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
  return { get, refresh, forget, subscribe };
}
