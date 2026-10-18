// Legacy adviser rows for Guardians → School access: one per teacher, marked
// once that teacher already holds an adviser assignment this year.
export function legacyAdviserRows(advisers = [], managedAssignments = []) {
  const assigned = new Set((managedAssignments || []).filter((a) => a.role === 'adviser').map((a) => a.uid));
  return (advisers || []).map((adviser) => ({ ...adviser, assigned: assigned.has(adviser.guardianUid) }));
}

export const assignmentFromLegacy = (adviser) => ({ email: adviser.email || '', role: 'adviser', sectionId: adviser.suggestedSectionId || '', gradeLevel: '' });
