import { signOut } from 'firebase/auth';
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { signOutAndClear, takeSignOutNotice } from './lib/session.js';

const storage = () => window.sessionStorage;

// True from the moment this tab starts its own sign-out, so its auth listener
// does not also reload when the sign-out lands.
let ending = false;
export const isEndingSession = () => ending;

export const endSession = async (notice = '') => {
  ending = true;
  const reloaded = await signOutAndClear(notice, {
    storage,
    signOut: () => signOut(auth),
    terminate: () => terminate(db),
    clearCache: () => clearIndexedDbPersistence(db),
    reload: () => window.location.reload(),
  });
  if (!reloaded) ending = false;
};

// A tab signed out by another tab or by the auth SDK (revoked or expired token)
// never ran endSession. Clear what this device cached, ignoring failures because
// another tab may be clearing at the same time, then reload to the login screen.
export const reloadAfterOutsideSignOut = async () => {
  try { await terminate(db); } catch { /* already terminated by another tab */ }
  try { await clearIndexedDbPersistence(db); } catch { /* another tab may be clearing it */ }
  window.location.reload();
};

export const takeStoredSignOutNotice = () => takeSignOutNotice(storage);
