import { assignmentKey } from '../../shared/schoolAccess.js';

const millis = value => value?.toMillis?.() ?? Number.POSITIVE_INFINITY;

// Subject Teacher became grade-level (spec 2026-10-19). Section rows become one
// row per grade; when several collapse, the earliest assignment is kept.
export function migrateAssignments(assignments = [], sectionGrade) {
  if (!assignments.some(a => a.role === 'subject_teacher' && a.sectionId)) return { assignments, changed: false };
  const out = [];
  for (const a of assignments) {
    if (a.role !== 'subject_teacher' || !a.sectionId) { out.push(a); continue; }
    const { sectionId, ...rest } = a;
    const row = { ...rest, gradeLevel: sectionGrade(sectionId) ?? a.gradeLevel };
    const at = out.findIndex(b => assignmentKey(b) === assignmentKey(row));
    if (at === -1) out.push(row);
    else if (millis(row.assignedAt) < millis(out[at].assignedAt)) out[at] = row;
  }
  return { assignments: out, changed: true };
}
