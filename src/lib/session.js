export const SIGN_OUT_NOTICE_KEY = 'sims.signOutNotice';

// Ends the session and wipes this device's cached Firestore data, then
// reloads so the next sign-in starts clean. The notice survives the reload
// so a forced sign-out still explains itself on the login screen.
export async function signOutAndClear(notice, { storage, signOut, terminate, clearCache, reload }) {
  try {
    if (notice) storage().setItem(SIGN_OUT_NOTICE_KEY, notice);
    else storage().removeItem(SIGN_OUT_NOTICE_KEY);
  } catch { /* the sign-out still happens without storage */ }
  // Still signed in: reloading would sign out again on start and loop.
  try { await signOut(); } catch { return; }
  try {
    await terminate();
    await clearCache();
  } catch { /* another open SIMS tab still holds the cache; it clears on that tab's sign-out */ }
  reload();
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
