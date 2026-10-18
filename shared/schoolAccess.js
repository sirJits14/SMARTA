// School responsibilities are independent of family relationships and SIMS roles.
export const SCHOOL_ROLES = ['adviser', 'subject_teacher', 'curriculum_adviser'];
export const SCHOOL_ROLE_LABELS = { adviser: 'Class Adviser', subject_teacher: 'Subject Teacher', curriculum_adviser: 'Curriculum Adviser' };
export const isFamilyLink = link => link?.status === 'active' && link.slot !== 'adviser' && link.relationship !== 'Adviser';
export const assignmentKey = a => JSON.stringify([a.role, a.schoolYear, a.sectionId || '', a.gradeLevel ?? null]);
export const currentAssignments = actor => (actor?.assignments || []).filter(a => a.schoolYear === actor.schoolYear && SCHOOL_ROLES.includes(a.role));

// Curriculum Adviser assignments and SIMS coordinator scopes both grant
// grade-wide review; class advisers only reach their own section.
const reviewGrades = actor => [
  ...currentAssignments(actor).filter(a => a.role === 'curriculum_adviser').map(a => a.gradeLevel),
  ...(Array.isArray(actor?.simsGrades) ? actor.simsGrades : []),
];

export function canReviewSection(actor, section) {
  if (!actor || !section || section.schoolYear !== actor.schoolYear) return false;
  return actor.isAdmin === true || reviewGrades(actor).includes(section.gradeLevel)
    || currentAssignments(actor).some(a => a.role === 'adviser' && a.sectionId === section.id && a.gradeLevel === section.gradeLevel);
}
export function canCorrectSession(actor, section, date, today) {
  if (!canReviewSection(actor, section) || !date || date > today) return false;
  return actor.isAdmin === true || date === today || reviewGrades(actor).includes(section.gradeLevel);
}
// Only administrators approve school roles; a DepEd email or Curriculum Adviser scope confers no approval path.
export function canApproveRoleRequest(actor, request) {
  if (!actor || request?.status !== 'pending' || actor.uid === request.uid || request.schoolYear !== actor.schoolYear) return false;
  return actor.isAdmin === true;
}
