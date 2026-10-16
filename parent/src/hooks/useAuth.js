import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, appCheckReady } from '../firebase.js';
import { clearLastSeen } from './useDoc.js';
import { profileFrom } from '../lib/profile.js';

// user: undefined (resolving) | null (signed out) | User
// profile: undefined (loading) | null (no guardians/{uid} yet) | object
export function useAuth() {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(undefined);
  useEffect(() => {
    let uid;
    return onAuthStateChanged(auth, (u) => {
      // Another account (or none) must never see the previous one's data.
      if ((u?.uid ?? null) !== uid) { clearLastSeen(); uid = u?.uid ?? null; }
      setUser(u && !u.isAnonymous ? u : null);
    });
  }, []);
  // Verify.jsx's reload() flips emailVerified on this same User object and
  // onAuthStateChanged does not fire again, so the flag is a dependency of
  // its own. App re-renders on onVerified(), which re-runs this effect;
  // without it the profile never loads and Skip / Activate loop back to
  // Activate until the page is reloaded.
  const emailVerified = Boolean(user?.emailVerified);
  useEffect(() => {
    if (!user || !emailVerified) { setProfile(user ? null : undefined); return; }
    // See useDoc.js: wait for App Check to attach before subscribing, so a
    // too-early listener never gets a permission-denied that outlives it.
    let cancelled = false; let unsub = () => {};
    appCheckReady.then(() => {
      if (cancelled) return;
      unsub = onSnapshot(doc(db, 'guardians', user.uid), (s) => setProfile(s.exists() ? profileFrom(s) : null), () => setProfile(null));
    });
    return () => { cancelled = true; unsub(); };
  }, [user, emailVerified]);
  return { user, profile };
}
