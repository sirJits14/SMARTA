import { isGradeRole } from './schoolAccess.js';

// Audience keys retain the SIMS writer's grade scope. Recipient permission is
// derived from current server-owned entitlements, never cached audience keys.
export const ANNOUNCEMENT_ROLES = ['family', 'adviser', 'curriculum_adviser'];
export const ANNOUNCEMENT_ROLE_LABELS = { family: 'Families', adviser: 'Advisers', curriculum_adviser: 'Curriculum Advisers' };

export function matchesAnnouncementAudience(audience, person, view = 'family') {
  if (!audience || !person?.schoolYear) return false;
  const roles = audience.roles ?? ['family'];
  const gradeMatches = (grade) => audience.all === true || (audience.grades || []).includes(Number(grade));
  const sectionMatches = (entitlement) => !audience.sectionIds?.length || (entitlement.sectionId
    ? audience.sectionIds.includes(entitlement.sectionId)
    : isGradeRole(entitlement.role) && (person.sections || []).some(section => audience.sectionIds.includes(section.id) && Number(section.gradeLevel) === Number(entitlement.gradeLevel)));
  if (view === 'family') return roles.includes('family') && (person.family || []).some(link => gradeMatches(link.gradeLevel) && sectionMatches(link));
  if (view !== 'school' || !audience.roles) return false;
  return (person.assignments || []).some(assignment => assignment.schoolYear === person.schoolYear
    && roles.includes(assignment.role) && assignment.role !== 'family'
    && gradeMatches(assignment.gradeLevel) && sectionMatches(assignment));
}
