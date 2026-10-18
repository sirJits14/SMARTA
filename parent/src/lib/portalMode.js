// Family or School, chosen in Settings and remembered on this device only.
// School appears only for accounts an administrator assigned in SIMS.
const KEY = 'bnhs-portal-mode';
const FAMILY = { view: 'family', hasClass: false };

export function readMode() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return saved?.view === 'school' ? { view: 'school', hasClass: saved.hasClass === true } : FAMILY;
  } catch { return FAMILY; }
}

export function writeMode(mode) {
  try {
    if (mode?.view === 'school') localStorage.setItem(KEY, JSON.stringify({ view: 'school', hasClass: mode.hasClass === true }));
    else localStorage.removeItem(KEY);
  } catch { /* private mode: the choice lasts for this visit */ }
}

const assignments = (context) => context?.assignments || [];
export const canUseSchool = (context) => assignments(context).length > 0;
export const hasClass = (context) => assignments(context).some((a) => a.role === 'adviser');
export const advisorySections = (context) => (context?.sections || [])
  .filter((section) => assignments(context).some((a) => a.role === 'adviser' && a.sectionId === section.id));
export const schoolHome = (mode) => (mode.hasClass ? '/school' : '/announcements?view=school');
