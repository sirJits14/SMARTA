import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { callable } from '../firebase.js';
import { schoolError } from '../lib/school.js';
import { createSchoolContextStore } from '../lib/schoolContextStore.js';

const store = createSchoolContextStore({
  fetch: () => callable('getSchoolContextFn')({}).then((result) => result.data),
  storage: typeof localStorage === 'undefined' ? null : localStorage,
  describe: schoolError,
});
export const forgetSchoolContext = store.forget;
const FRESH_MS = 30000;

// School access is always refreshed from the server, never inferred from family links.
// The last answer for this account paints first, so a screen opened again never blanks.
export function useSchoolContext(uid, enabled = true) {
  const state = useSyncExternalStore(store.subscribe, () => store.get(enabled ? uid : null));
  const refresh = useCallback((options) => (enabled ? store.refresh(uid, options) : Promise.resolve()), [uid, enabled]);
  useEffect(() => {
    if (!uid || !enabled) return undefined;
    // Switching tabs reuses an answer from the last half minute; coming back to the app asks again.
    store.refresh(uid, { maxAge: FRESH_MS });
    const onFocus = () => store.refresh(uid);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [uid, enabled]);
  return { data: state.data, loading: state.loading, error: state.error, refresh };
}
