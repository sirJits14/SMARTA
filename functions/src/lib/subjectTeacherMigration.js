import { assignmentKey } from '../../shared/schoolAccess.js';

const millis = value => value?.toMillis?.() ?? Number.POSITIVE_INFINITY;
const isGrade = value => Number.isInteger(value) && value >= 7 && value <= 12;

// Subject Teacher became grade-level (spec 2026-10-19). Section rows become one
// row per grade; when several collapse (including rows that were already
// grade-level), the earliest assignment is kept. A row whose grade cannot be
// determined is left unchanged.
export function migrateAssignments(assignments = [], sectionGrade) {
  const out = [];
  let changed = false;
  for (const a of assignments) {
    if (a.role !== 'subject_teacher') { out.push(a); continue; }
    let row = a;
    if (a.sectionId) {
      const gradeLevel = sectionGrade(a.sectionId) ?? a.gradeLevel;
      if (!isGrade(gradeLevel)) { out.push(a); continue; }
      const { sectionId, ...rest } = a;
      row = { ...rest, gradeLevel };
      changed = true;
    }
    const at = out.findIndex(b => b.role === 'subject_teacher' && !b.sectionId && assignmentKey(b) === assignmentKey(row));
    if (at === -1) out.push(row);
    else {
      changed = true;
      if (millis(row.assignedAt) < millis(out[at].assignedAt)) out[at] = row;
    }
  }
  return changed ? { assignments: out, changed } : { assignments, changed: false };
}
