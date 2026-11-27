import { roleOf, scopedGrades } from './staffRoles.js';

// The configured school year, rather than the device's clock, anchors planning.
export function sectionEditSchoolYears(currentSchoolYear) {
  if (typeof currentSchoolYear !== 'string' || currentSchoolYear.length !== 9 || !/^[0-9]{4}-[0-9]{4}$/.test(currentSchoolYear)) return [];
  const [start, end] = currentSchoolYear.split('-').map(Number);
  if (end !== start + 1) return [];
  return [currentSchoolYear, ...(end < 9999 ? [`${String(end).padStart(4, '0')}-${String(end + 1).padStart(4, '0')}`] : [])];
}

export function coordinatorCanEditSection(profile, section, currentSchoolYear) {
  return roleOf(profile) === 'glc' && profile.disabled !== true && profile.mustChangePassword !== true
    && Number.isInteger(section?.gradeLevel) && scopedGrades(profile).includes(section.gradeLevel)
    && sectionEditSchoolYears(currentSchoolYear).includes(section.schoolYear);
}
