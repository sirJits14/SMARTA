import { useSyncExternalStore } from 'react';
import { matchRoute } from '../../src/lib/router.js';

// Remote account data is synthetic here. Persisting it lets a browser reload
// exercise the returning-account gate; emulator tests verify the real writes.
const KEY = 'onboarding-preview-account';
let state = JSON.parse(localStorage.getItem(KEY) || 'null') || { profile: null, links: [] };
let revision = 0;
let rejectSkip = false;
const listeners = new Set();
const notify = () => { revision += 1; listeners.forEach((fn) => fn()); };
const save = () => { localStorage.setItem(KEY, JSON.stringify(state)); notify(); };
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const useRevision = () => useSyncExternalStore(subscribe, () => revision);
const user = { uid: 'preview-parent', email: 'ana@example.test', displayName: 'Ana Santos', emailVerified: true };
const portal = { consentVersion: 1 };
export function useAuth() { useRevision(); return { user, profile: state.profile }; }
export function useLinks() { useRevision(); return { links: state.links }; }
export function useDoc(path) { useRevision(); return { data: path ? portal : undefined, error: null }; }
export function useDocs(paths) { return Object.fromEntries(paths.map((path) => [path, { data: { displayName: 'Santos, Maria', sectionLabel: 'Grade 7 – Rizal' }, error: null }])); }
export function useQuery() { return { rows: [], error: null }; }
window.addEventListener('hashchange', notify);
const navigate = (to) => { window.location.hash = to; window.scrollTo(0, 0); };
export function useRoute() { useRevision(); return { route: matchRoute(window.location.hash.slice(1) || '/'), navigate }; }
export const failNextSkip = () => { rejectSkip = true; };
export function reset() {
  state = { profile: null, links: [] }; rejectSkip = false;
  portal.consentVersion = 1;
  localStorage.removeItem('bnhs-parent-consent'); navigate('/'); save();
}
export const updateNotice = () => { portal.consentVersion += 1; notify(); };
export const callable = (name) => async () => {
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (name === 'acceptConsentFn' && rejectSkip) { rejectSkip = false; throw new Error('Synthetic offline failure'); }
  state.profile ||= { id: user.uid, email: user.email, displayName: user.displayName, consentVersion: 1, notificationsEnabled: true, audienceKeys: [] };
  if (name === 'acceptConsentFn') state.profile.consentVersion = portal.consentVersion;
  if (name === 'activateCodeFn') state.links = [{ id: 'preview-link', studentId: 'S1', learnerName: 'Santos, Maria', relationship: 'Mother' }];
  save();
  return { data: name === 'activateCodeFn' ? { displayName: 'Santos, Maria', sectionLabel: 'Grade 7 – Rizal' } : { consentVersion: 1 } };
};
export const useDeviceStatus = () => ({ supported: false, registered: false, permission: 'default', isIOS: false, isStandalone: false });
export const onForegroundMessage = async () => () => {};
export const enableOnThisDevice = async () => {};
export const disableOnThisDevice = async () => {};
export const saveDisplayName = async (_user, displayName) => { state.profile.displayName = displayName; save(); };
export const setGuardianPrefs = async (_uid, fields) => { Object.assign(state.profile, fields); save(); };
export const deleteMyAccount = async () => reset();
export const signOutNow = async () => reset();
