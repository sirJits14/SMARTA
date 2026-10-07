import { signOut, updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db, callable } from '../firebase.js';

// Settings' account writes in one place, so the browser preview
// (parent/tests/browser/settings.config.mjs) can swap them for synthetic ones.
export async function saveDisplayName(user, name) {
  await updateDoc(doc(db, 'guardians', user.uid), { displayName: name });
  updateProfile(user, { displayName: name }).catch(() => {});
}
export const setGuardianPrefs = (uid, fields) => updateDoc(doc(db, 'guardians', uid), fields);
export async function deleteMyAccount() {
  await callable('deleteGuardianAccountFn')({});
  await signOut(auth);
}
export const signOutNow = () => signOut(auth);
