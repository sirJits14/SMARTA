// These fields describe the active-year enrollment, never editable profile input.
export function studentScopeFields(enrollment, activeSchoolYear, studentStatus = 'active') {
  if (studentStatus === 'active' && enrollment?.status === 'enrolled'
      && activeSchoolYear && enrollment.schoolYear === activeSchoolYear
      && Number.isInteger(enrollment.gradeLevel) && enrollment.gradeLevel >= 7 && enrollment.gradeLevel <= 12) {
    return { gradeLevel: enrollment.gradeLevel, scopeSchoolYear: activeSchoolYear };
  }
  return { gradeLevel: null, scopeSchoolYear: null };
}
