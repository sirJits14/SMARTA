import { useEffect, useState } from 'react';
import { auth, callable } from '../firebase.js';
import { recall, remember } from './useDoc.js';

const LIST_MAX = 50;
const noticeKey = (uid, name, signature) => `${uid || ''}:${name}:${signature}`;
const listKey = (uid, view) => noticeKey(uid, 'getPortalAnnouncementsFn', `${view}:${LIST_MAX}`);

// Reauthorize on focus and while the portal is open. A request/view/account
// change invalidates earlier responses before they can reach the screen.
// The last answer this sign-in paints first (memory only, cleared on sign-out)
// and the server's fresh answer replaces it moments later.
function useAuthorizedNotices(name, args, signature, seed) {
  const uid = auth.currentUser?.uid;
  const key = noticeKey(uid, name, signature);
  const [state, setState] = useState({ key: null, data: undefined, error: null });
  useEffect(() => {
    let alive = true, request = 0;
    const refresh = async () => {
      if (!uid) return;
      const version = ++request;
      try {
        const result = await callable(name)(args);
        remember(key, result.data);
        if (alive && request === version) setState({ key, data: result.data, error: null });
      } catch (error) { if (alive && request === version) setState({ key, data: null, error }); }
    };
    refresh();
    const interval = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { alive = false; clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [key]); // args are fully represented by key
  return state.key === key ? state : { data: recall(key) ?? seed?.(uid), error: null };
}

// Always authorize on the server. Local Firestore persistence and cached
// audienceKeys never determine access to role-targeted announcements.
export function useAnnouncements(profile, max, view = 'family') {
  const { data, error } = useAuthorizedNotices('getPortalAnnouncementsFn', { view, max }, `${view}:${max}`);
  return { rows: data === undefined ? undefined : data?.rows || [], error };
}

// A post opened from the list paints from that list while the server confirms it.
export function useAnnouncement(id, view = 'family') {
  const fromList = (uid) => { const post = recall(listKey(uid, view))?.rows?.find((p) => p.id === id); return post ? { post } : undefined; };
  const { data, error } = useAuthorizedNotices('getPortalAnnouncementFn', { id, view }, `${view}:${id}`, fromList);
  return { data: data === undefined ? undefined : data?.post || null, error };
}

// Fetched while idle after sign-in, so the Notices tab opens on its list.
export function preloadAnnouncements(view = 'family') {
  const uid = auth.currentUser?.uid;
  if (!uid || recall(listKey(uid, view))) return Promise.resolve();
  return callable('getPortalAnnouncementsFn')({ view, max: LIST_MAX }).then((result) => {
    if (auth.currentUser?.uid === uid) remember(listKey(uid, view), result.data);
  });
}
