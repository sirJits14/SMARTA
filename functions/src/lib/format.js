// Small formatting helpers shared across handlers, so scanEvent.js, codes.js,
// and reports.js (added in later tasks) don't each redefine them.

export const sectionLabel = (s) => (s ? `Grade ${s.gradeLevel} – ${s.name}${s.strand ? ` · ${s.strand}` : ''}` : '');

export const displayName = (s) => `${s.firstName.trim()} ${s.lastName.trim()}`.trim();
