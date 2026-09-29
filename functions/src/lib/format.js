// Small formatting helpers shared across handlers, so scanEvent.js, codes.js,
// and reports.js (added in later tasks) don't each redefine them.

export const sectionLabel = (s) => (s ? `Grade ${s.gradeLevel} – ${s.name}${s.strand ? ` · ${s.strand}` : ''}` : '');

export const displayName = (s) => `${s.firstName.trim()} ${s.lastName.trim()}`.trim();

// "Ana Bautista Cruz Jr." -- the learner's full name as the parent portal
// shows it. A one-letter middle name (some records only keep the initial)
// gets its period.
export const fullName = (s) => {
  const mid = s.middleName?.trim() || '';
  return [s.firstName, mid.length === 1 ? `${mid}.` : mid, s.lastName, s.extName]
    .map((p) => (p || '').trim()).filter(Boolean).join(' ');
};

// The identity fields of learners/{id} -- written whenever a guardian is
// linked so the Home card has a name before the learner's first gate scan.
export const learnerIdentity = (student, section, schoolYear) => ({
  displayName: fullName(student), sectionLabel: sectionLabel(section), schoolYear,
});
