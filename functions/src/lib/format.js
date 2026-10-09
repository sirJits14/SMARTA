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

// "Dela Cruz, Juan S. Jr." -- the DepEd form order, as on code slips and
// the parent portal's Home list.
export const formalName = (s) => {
  const mi = s.middleName?.trim() ? ` ${s.middleName.trim()[0]}.` : '';
  const ext = s.extName?.trim() ? ` ${s.extName.trim()}` : '';
  return `${(s.lastName || '').trim()}, ${(s.firstName || '').trim()}${mi}${ext}`;
};

// The identity fields of learners/{id} -- written whenever a guardian is
// linked so the Home card has a name before the learner's first gate scan.
// lastName/firstName/sex let Home sort learners male-first, then by last
// name, without parsing the display name.
export const learnerIdentity = (student, section, schoolYear) => ({
  displayName: fullName(student), formalName: formalName(student),
  lastName: (student.lastName || '').trim(), firstName: (student.firstName || '').trim(),
  sex: student.sex === 'M' || student.sex === 'F' ? student.sex : '',
  sectionLabel: sectionLabel(section), schoolYear,
});
