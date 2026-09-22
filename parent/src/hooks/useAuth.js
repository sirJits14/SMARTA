import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase.js';

// user: undefined (resolving) | null (signed out) | User
// profile: undefined (loading) | null (no guardians/{uid} yet) | object
export function useAuth() {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u && !u.isAnonymous ? u : null)), []);
  useEffect(() => {
    if (!user || !user.emailVerified) { setProfile(user ? null : undefined); return; }
    return onSnapshot(doc(db, 'guardians', user.uid), (s) => setProfile(s.exists() ? { id: s.id, ...s.data() } : null), () => setProfile(null));
  }, [user]);
  return { user, profile };
}
