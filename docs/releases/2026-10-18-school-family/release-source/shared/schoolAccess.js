// School responsibilities are independent of family relationships and SIMS roles.
export const SCHOOL_ROLES = ['adviser', 'subject_teacher', 'curriculum_adviser'];
export const SCHOOL_ROLE_LABELS = { adviser: 'Class Adviser', subject_teacher: 'Subject Teacher', curriculum_adviser: 'Curriculum Adviser' };
export const isDepedEmail = email => typeof email === 'string' && /^[^\s@]+@deped\.gov\.ph$/i.test(email.trim());
export const isFamilyLink = link => link?.status === 'active' && link.slot !== 'adviser' && link.relationship !== 'Adviser';
export const assignmentKey = a => JSON.stringify([a.role, a.schoolYear, a.sectionId || '', a.gradeLevel ?? null]);
export const currentAssignments = actor => (actor?.assignments || []).filter(a => a.schoolYear === actor.schoolYear && SCHOOL_ROLES.includes(a.role));

export function canReviewSection(actor, section) {
  if (!actor || !section || section.schoolYear !== actor.schoolYear) return false;
  return actor.isAdmin === true || currentAssignments(actor).some(a =>
    a.gradeLevel === section.gradeLevel && (a.role === 'curriculum_adviser' || a.role === 'adviser' && a.sectionId === section.id));
}
export function canCorrectSession(actor, section, date, today) {
  if (!canReviewSection(actor, section) || !date || date > today) return false;
  return actor.isAdmin === true || date === today || currentAssignments(actor).some(a => a.role === 'curriculum_adviser' && a.gradeLevel === section.gradeLevel);
}
export function canApproveRoleRequest(actor, request) {
  if (!actor || request?.status !== 'pending' || actor.uid === request.uid || request.schoolYear !== actor.schoolYear) return false;
  if (actor.isAdmin === true) return true;
  return request.role === 'adviser' && request.emailVerified === true && isDepedEmail(request.email)
    && currentAssignments(actor).some(a => a.role === 'curriculum_adviser' && a.gradeLevel === request.gradeLevel);
}
