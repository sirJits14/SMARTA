import { useSyncExternalStore } from 'react';
import { matchRoute } from '../../src/lib/router.js';

// A new email/password parent: unverified until "Continue" on Verify. The
// real App and useAuth run against these fakes, which copy the Firebase Auth
// behaviour that matters here: reload() updates the same User object in place,
// and onAuthStateChanged fires again only when the signed-in uid changes.
const portal = { consentVersion: 1 };
const store = new Map(); // Firestore path -> data
const docListeners = new Map(); // path -> Set of callbacks
let revision = 0;
const listeners = new Set();
const notify = () => { revision += 1; listeners.forEach((fn) => fn()); };
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const useRevision = () => useSyncExternalStore(subscribe, () => revision);

const user = {
  uid: 'verify-parent', email: 'ana@example.test', displayName: 'Ana Santos', emailVerified: false, isAnonymous: false,
  async reload() { this.emailVerified = true; },
  async getIdToken() { return 'token'; },
};
export const auth = { currentUser: user };

// firebase/auth
export const onAuthStateChanged = (_auth, cb) => { cb(user); return () => {}; };
export const updateProfile = async () => {};
export const sendEmailVerification = async () => {};
export const signOut = async () => {};

// firebase/firestore (only guardians/{uid} is live; other hooks are stubbed)
const snap = (path) => ({ id: path.split('/').pop(), exists: () => store.has(path), data: () => store.get(path) });
const write = (path, data) => { store.set(path, data); docListeners.get(path)?.forEach((cb) => cb(snap(path))); notify(); };
export const doc = (_db, ...parts) => ({ path: parts.join('/') });
export const onSnapshot = (ref, next) => {
  const set = docListeners.get(ref.path) ?? new Set(); docListeners.set(ref.path, set);
  set.add(next); next(snap(ref.path));
  return () => set.delete(next);
};
export const profileSubscriptions = () => docListeners.get(`guardians/${user.uid}`)?.size ?? 0;

// Hooks the app uses beyond useAuth.
export const clearLastSeen = () => {};
export function useDoc(path) { useRevision(); return { data: path ? portal : undefined, error: null }; }
export function useDocs(paths) { return Object.fromEntries(paths.map((p) => [p, { data: null, error: null }])); }
export function useQuery() { return { rows: [], error: null }; }
export function useLinks() { useRevision(); return { links: [] }; }
window.addEventListener('hashchange', notify);
const navigate = (to) => { window.location.hash = to; };
export function useRoute() { useRevision(); return { route: matchRoute(window.location.hash.slice(1) || '/'), navigate }; }

// Server side of Skip for now: acceptConsentFn creates guardians/{uid}.
export const callable = (name) => async () => {
  await new Promise((r) => setTimeout(r, 100));
  if (name === 'acceptConsentFn') write(`guardians/${user.uid}`, { email: user.email, displayName: user.displayName, consentVersion: portal.consentVersion, notificationsEnabled: true, audienceKeys: [] });
  return { data: { consentVersion: portal.consentVersion } };
};

export const useDeviceStatus = () => ({ supported: false, registered: false, permission: 'default', isIOS: false, isStandalone: false });
export const onForegroundMessage = async () => () => {};
export const enableOnThisDevice = async () => {};
export const disableOnThisDevice = async () => {};
export const saveDisplayName = async () => {};
export const setGuardianPrefs = async () => {};
export const deleteMyAccount = async () => {};
export const signOutNow = async () => {};
localStorage.removeItem('bnhs-parent-consent');
window.location.hash = '/';
