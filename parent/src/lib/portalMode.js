// Family or School, chosen in Settings and remembered on this device only.
// School appears only for accounts an administrator assigned in SIMS.
const KEY = 'bnhs-portal-mode';
const family = () => ({ view: 'family', hasClass: false });

// The choice belongs to the account that made it, so another sign-in on this device starts in Family.
export function readMode(uid) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return uid && saved?.uid === uid && saved.view === 'school' ? { view: 'school', hasClass: saved.hasClass === true } : family();
  } catch { return family(); }
}

export function writeMode(uid, mode) {
  try {
    if (uid && mode?.view === 'school') localStorage.setItem(KEY, JSON.stringify({ uid, view: 'school', hasClass: mode.hasClass === true }));
    else localStorage.removeItem(KEY);
  } catch { /* private mode: the choice lasts for this visit */ }
}

const assignments = (context) => context?.assignments || [];
export const canUseSchool = (context) => assignments(context).length > 0;
export const hasClass = (context) => assignments(context).some((a) => a.role === 'adviser');
export const advisorySections = (context) => (context?.sections || [])
  .filter((section) => assignments(context).some((a) => a.role === 'adviser' && a.sectionId === section.id));
export const schoolHome = (mode) => (mode.hasClass ? '/school' : '/announcements?view=school');

// Keeps a saved School choice true to the server: revoked or year-end access drops to Family,
// and a promotion (or demotion) changes whether the Class tab exists.
export function reconcileMode(mode, context) {
  if (mode.view !== 'school' || !context) return { mode, changed: false };
  if (!canUseSchool(context)) return { mode: family(), changed: true };
  const next = hasClass(context);
  return { mode: { view: 'school', hasClass: next }, changed: next !== mode.hasClass };
}
