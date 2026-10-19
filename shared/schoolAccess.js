// School responsibilities are independent of family relationships and SIMS roles.
export const SCHOOL_ROLES = ['adviser', 'subject_teacher', 'curriculum_adviser'];
export const SCHOOL_ROLE_LABELS = { adviser: 'Class Adviser', subject_teacher: 'Subject Teacher', curriculum_adviser: 'Curriculum Adviser' };
// Teachers may ask for these; Curriculum Adviser stays administrator-assigned.
export const REQUESTABLE_ROLES = ['adviser', 'subject_teacher'];
// Curriculum Adviser and Subject Teacher are held per grade; Class Adviser per section.
export const GRADE_ROLES = ['curriculum_adviser', 'subject_teacher'];
export const isGradeRole = role => GRADE_ROLES.includes(role);
// Within one school year a teacher is a Class Adviser or a Subject Teacher, never both.
const EXCLUSIVE = { adviser: 'subject_teacher', subject_teacher: 'adviser' };
export const conflictingRole = (roles, role) => (EXCLUSIVE[role] && (roles || []).includes(EXCLUSIVE[role]) ? EXCLUSIVE[role] : null);
export const canHold = (roles, role) => !conflictingRole(roles, role);
export const isDepedEmail = email => typeof email === 'string' && /@deped\.gov\.ph$/i.test(email.trim());
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
// Administrators approve any request. A Curriculum Adviser approves adviser and
// subject-teacher requests from verified accounts in a grade they are assigned to.
export function canApproveRoleRequest(actor, request) {
  if (!actor || request?.status !== 'pending' || actor.uid === request.uid || request.schoolYear !== actor.schoolYear) return false;
  if (actor.isAdmin === true) return true;
  return REQUESTABLE_ROLES.includes(request.role) && request.emailVerified === true
    && currentAssignments(actor).some(a => a.role === 'curriculum_adviser' && a.gradeLevel === request.gradeLevel);
}
