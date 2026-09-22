import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, appCheckReady } from '../firebase.js';

// user: undefined (resolving) | null (signed out) | User
// profile: undefined (loading) | null (no guardians/{uid} yet) | object
export function useAuth() {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u && !u.isAnonymous ? u : null)), []);
  useEffect(() => {
    if (!user || !user.emailVerified) { setProfile(user ? null : undefined); return; }
    // See useDoc.js: wait for App Check to attach before subscribing, so a
    // too-early listener never gets a permission-denied that outlives it.
    let cancelled = false; let unsub = () => {};
    appCheckReady.then(() => {
      if (cancelled) return;
      unsub = onSnapshot(doc(db, 'guardians', user.uid), (s) => setProfile(s.exists() ? { id: s.id, ...s.data() } : null), () => setProfile(null));
    });
    return () => { cancelled = true; unsub(); };
  }, [user]);
  return { user, profile };
}
