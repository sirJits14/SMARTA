import { useEffect, useState } from 'react';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { app, db } from '../firebase.js';

const LOCAL_KEY = 'bnhs-parent-device';   // sha256 of the registered token, per browser

// firebase/messaging is only needed once a user actually interacts with push
// notifications (enable/disable/foreground listener), so it's loaded on first
// use instead of in the initial bundle — keeps it out of the sign-in chunk.
let _messaging;
function messagingModule() { return (_messaging ??= import('firebase/messaging')); }

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const env = () => ({
  isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
  isStandalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  permission: typeof Notification === 'undefined' ? 'default' : Notification.permission,
});
const local = { get: () => { try { return localStorage.getItem(LOCAL_KEY); } catch { return null; } }, set: (v) => { try { v ? localStorage.setItem(LOCAL_KEY, v) : localStorage.removeItem(LOCAL_KEY); } catch {} } };

async function swRegistration() { return navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' }); }

async function writeDevice(uid, token) {
  const hash = await sha256(token);
  const prev = local.get();
  if (prev && prev !== hash) await deleteDoc(doc(db, `guardians/${uid}/devices/${prev}`)).catch(() => {});
  await setDoc(doc(db, `guardians/${uid}/devices/${hash}`), {
    token, platform: 'web', createdAt: serverTimestamp(), refreshedAt: serverTimestamp(), enabled: true, failureCount: 0,
  }, { merge: true });
  local.set(hash);
}

// Called from Settings/Home after an explicit tap (never on load).
export async function enableOnThisDevice(uid) {
  const { getMessaging, getToken } = await messagingModule();
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY, serviceWorkerRegistration: await swRegistration() });
  await writeDevice(uid, token);
}
export async function disableOnThisDevice(uid) {
  const prev = local.get();
  if (prev) await deleteDoc(doc(db, `guardians/${uid}/devices/${prev}`)).catch(() => {});
  local.set(null);
  try {
    const { getMessaging, deleteToken } = await messagingModule();
    await deleteToken(getMessaging(app));
  } catch {}
}
// Called on every app open: bumps refreshedAt and replaces a rotated token.
export async function refreshTokenIfRegistered(uid) {
  if (!local.get() || env().permission !== 'granted') return;
  const { isSupported } = await messagingModule();
  if (!(await isSupported())) return;
  try { await enableOnThisDevice(uid); } catch {}
}

export function useDeviceStatus(uid) {
  const [s, setS] = useState({ supported: false, registered: Boolean(local.get()), ...env() });
  useEffect(() => {
    let alive = true;
    messagingModule().then(({ isSupported }) => isSupported()).then((ok) => alive && setS((p) => ({ ...p, supported: ok })));
    if (uid) refreshTokenIfRegistered(uid).then(() => alive && setS((p) => ({ ...p, registered: Boolean(local.get()), ...env() })));
    return () => { alive = false; };
  }, [uid]);
  const refresh = () => setS((p) => ({ ...p, registered: Boolean(local.get()), ...env() }));
  return { ...s, refresh };
}

// Foreground messages: refresh the inbox via a toast instead of an OS notification.
export async function onForegroundMessage(cb) {
  const { getMessaging, onMessage, isSupported } = await messagingModule();
  return (await isSupported()) ? onMessage(getMessaging(app), cb) : () => {};
}
