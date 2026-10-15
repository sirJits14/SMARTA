import { signOut } from 'firebase/auth';
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { signOutAndClear, takeSignOutNotice } from './lib/session.js';

const storage = () => window.sessionStorage;

export const endSession = (notice = '') => signOutAndClear(notice, {
  storage,
  signOut: () => signOut(auth),
  terminate: () => terminate(db),
  clearCache: () => clearIndexedDbPersistence(db),
  reload: () => window.location.reload(),
});

export const takeStoredSignOutNotice = () => takeSignOutNotice(storage);
