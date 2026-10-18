import { useEffect, useState } from 'react';
import { auth, callable } from '../firebase.js';

// Reauthorize on focus and while the portal is open. A request/view/account
// change invalidates earlier responses before they can reach the screen.
function useAuthorizedNotices(name, args, signature) {
  const uid = auth.currentUser?.uid;
  const key = `${uid || ''}:${name}:${signature}`;
  const [state, setState] = useState({ key: null, data: undefined, error: null });
  useEffect(() => {
    let alive = true, request = 0;
    const refresh = async () => {
      if (!uid) return;
      const version = ++request;
      try {
        const result = await callable(name)(args);
        if (alive && request === version) setState({ key, data: result.data, error: null });
      } catch (error) { if (alive && request === version) setState({ key, data: null, error }); }
    };
    refresh();
    const interval = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { alive = false; clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [key]); // args are fully represented by key
  return state.key === key ? state : { data: undefined, error: null };
}

// Always authorize on the server. Local Firestore persistence and cached
// audienceKeys never determine access to role-targeted announcements.
export function useAnnouncements(profile, max, view = 'family') {
  const { data, error } = useAuthorizedNotices('getPortalAnnouncementsFn', { view, max }, `${view}:${max}`);
  return { rows: data === undefined ? undefined : data?.rows || [], error };
}

export function useAnnouncement(id, view = 'family') {
  const { data, error } = useAuthorizedNotices('getPortalAnnouncementFn', { id, view }, `${view}:${id}`);
  return { data: data === undefined ? undefined : data?.post || null, error };
}
