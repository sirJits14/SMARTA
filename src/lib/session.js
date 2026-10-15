export const SIGN_OUT_NOTICE_KEY = 'sims.signOutNotice';

// Ends the session and wipes this device's cached Firestore data, then
// reloads so the next sign-in starts clean. The notice survives the reload
// so a forced sign-out still explains itself on the login screen.
// Resolves true once it has reloaded, false when sign-out failed and it bailed.
export async function signOutAndClear(notice, { storage, signOut, terminate, clearCache, reload }) {
  try {
    if (notice) storage().setItem(SIGN_OUT_NOTICE_KEY, notice);
    else storage().removeItem(SIGN_OUT_NOTICE_KEY);
  } catch { /* the sign-out still happens without storage */ }
  // Still signed in: reloading would sign out again on start and loop.
  try {
    await signOut();
  } catch (error) {
    console.warn('Sign-out failed', error);
    // No sign-out happened, so a later manual reload must not claim one did.
    try { storage().removeItem(SIGN_OUT_NOTICE_KEY); } catch { /* nothing to remove */ }
    return false;
  }
  try {
    await terminate();
    await clearCache();
  } catch (error) {
    // The clear can fail if another tab is mid-operation. Other tabs reload
    // when their auth state goes null (see shouldReloadAfterSignOut).
    console.warn('Could not clear the offline cache', error);
  }
  reload();
  return true;
}

// A tab signed out from elsewhere (another tab's logout cleared the shared
// cache, which terminates this tab's Firestore client) must reload to get a
// working client. A tab running its own endSession reloads by itself.
export function shouldReloadAfterSignOut({ hadUser, user, ending }) {
  return Boolean(hadUser && !user && !ending);
}

export function takeSignOutNotice(storage) {
  try {
    const notice = storage().getItem(SIGN_OUT_NOTICE_KEY) || '';
    storage().removeItem(SIGN_OUT_NOTICE_KEY);
    return notice;
  } catch {
    return '';
  }
}
