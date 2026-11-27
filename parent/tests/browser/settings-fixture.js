import { useSyncExternalStore } from 'react';

// Synthetic data for the Settings browser preview. settings.config.mjs swaps
// these in for the real hooks, writes and device checks; nothing calls Firebase.
export const SCENARIOS = ['normal', 'no-contact', 'no-learners', 'ios', 'installed', 'blocked', 'notifications-off'];
const CONTACT = {
  contactPhone: '+63 (44) 815 1234', contactEmail: 'registrar@example.test',
  contactFacebookUrl: 'https://www.facebook.com/example.school', officeHours: 'Mon–Fri, 7:30 AM – 4:30 PM',
};
let state;
let revision = 0;
const listeners = new Set();
const writes = [];
const notify = () => { revision += 1; listeners.forEach((fn) => fn()); };
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const useRevision = () => useSyncExternalStore(subscribe, () => revision);

export function setScenario(name) {
  state = {
    profile: { displayName: 'Ana Santos', notificationsEnabled: name !== 'notifications-off', announcementPushEnabled: true },
    portal: { privacyNoticeUrl: 'https://example.test/privacy', ...(name === 'no-contact' ? {} : CONTACT) },
    links: name === 'no-learners' ? [] : [
      { id: 'l1', studentId: 'S1', learnerName: 'Maria Santos', relationship: 'Mother' },
      { id: 'l2', studentId: 'S2', learnerName: 'Jose Santos Jr.', relationship: 'Mother' },
    ],
    reports: [
      { id: 'r1', reason: 'Scan time looks wrong', status: 'open' },
      { id: 'r2', reason: 'Missing exit scan', status: 'resolved', resolutionNote: 'Added the 4:05 PM exit.' },
    ],
    device: { supported: name !== 'ios', permission: name === 'blocked' ? 'denied' : 'granted', isIOS: name === 'ios', isStandalone: name === 'installed', registered: true },
  };
  writes.length = 0;
  notify();
}
setScenario('normal');

export function useProfile() { useRevision(); return state.profile; }
export function useWrites() { useRevision(); return writes; }

export function useDoc() { useRevision(); return { data: state.portal, error: null }; }
export function useQuery() { useRevision(); return { rows: state.reports, error: null }; }
export function useLinks() { useRevision(); return { links: state.links }; }
export function useDeviceStatus() { useRevision(); return { ...state.device, refresh: () => {} }; }
export const isIOS = () => state.device.isIOS;
export const isStandalone = () => state.device.isStandalone;

const record = (entry) => { writes.push(entry); notify(); };
export async function enableOnThisDevice() { state.device = { ...state.device, registered: true }; record(['enableOnThisDevice']); }
export async function disableOnThisDevice() { state.device = { ...state.device, registered: false }; record(['disableOnThisDevice']); }
export async function saveDisplayName(user, name) { state.profile = { ...state.profile, displayName: name }; record(['saveDisplayName', name]); }
export async function setGuardianPrefs(uid, fields) { state.profile = { ...state.profile, ...fields }; record(['setGuardianPrefs', fields]); }
export async function deleteMyAccount() { record(['deleteMyAccount']); }
export async function signOutNow() { record(['signOutNow']); }
