// Staff roles for SIMS accounts (spec: docs/superpowers/specs/2026-10-04-staff-accounts-and-roles-design.md).
// The only place that maps a role to the grades it may see -- firestore.rules
// mirrors scopedGrades() in coversGrade(); keep the two in step.
export const ALL_GRADES = [7, 8, 9, 10, 11, 12];
export const ROLE_VALUES = ['admin', 'jhs_coord', 'shs_coord', 'glc'];
export const ROLE_LABELS = {
  admin: 'Administrator',
  jhs_coord: 'JHS Academic Coordinator',
  shs_coord: 'SHS Academic Coordinator',
  glc: 'Grade Level Coordinator',
};
const FIXED_GRADES = { jhs_coord: [7, 8, 9, 10], shs_coord: [11, 12] };
// Profiles hand-written before roles existed: no role, or the README's 'registrar'.
const LEGACY_ADMIN = [undefined, null, '', 'registrar'];

export function roleOf(profile) {
  if (!profile) return null;
  if (LEGACY_ADMIN.includes(profile.role)) return 'admin';
  return ROLE_VALUES.includes(profile.role) ? profile.role : null;
}

// null = every grade (admin); [] = nothing.
export function scopedGrades(profile) {
  const role = roleOf(profile);
  if (role === 'admin') return null;
  if (FIXED_GRADES[role]) return FIXED_GRADES[role];
  if (role === 'glc') {
    const g = Number(profile.gradeLevel);
    return ALL_GRADES.includes(g) ? [g] : [];
  }
  return [];
}

export function roleLabel(profile) {
  const role = roleOf(profile);
  if (!role) return 'No role';
  return role === 'glc' ? `Grade ${profile.gradeLevel} Coordinator` : ROLE_LABELS[role];
}
