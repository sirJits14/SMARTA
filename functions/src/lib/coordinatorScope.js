// Pure migration decisions. Null fields mean an ambiguous source: report and skip.
const validGrade = grade => Number.isInteger(grade) && grade >= 7 && grade <= 12;
const validYear = year => typeof year === 'string' && /^[0-9]{4}-[0-9]{4}$/.test(year);
const ok = fields => ({ fields, warnings: [] });
const conflict = message => ({ fields: null, warnings: [message] });
const clearedStudent = () => ok({ gradeLevel: null, scopeSchoolYear: null });

export function deriveStudentScope(student, enrollments, schoolYear) {
  if (!student?.id) return conflict('Missing student source');
  if (!validYear(schoolYear)) return conflict('Missing or invalid current school year');
  if (enrollments.some(e => e.studentId !== student.id)) return conflict('Enrollment studentId does not match student');
  if ((student.status === undefined ? 'active' : student.status) !== 'active') return clearedStudent();
  const active = enrollments.filter(e => e.schoolYear === schoolYear && e.status === 'enrolled');
  if (!active.length) return clearedStudent();
  if (active.length !== 1) return conflict('Multiple active current-year enrollments');
  if (!validGrade(active[0].gradeLevel)) return conflict('Invalid active enrollment grade');
  return ok({ gradeLevel: active[0].gradeLevel, scopeSchoolYear: schoolYear });
}

export function deriveAttendanceScope(attendance, section) {
  if (!section || !attendance.sectionId || attendance.sectionId !== section.id) return conflict('Missing or mismatched attendance section');
  if (attendance.schoolYear && section.schoolYear !== attendance.schoolYear) return conflict('Attendance and section school years disagree');
  if (!validGrade(section.gradeLevel)) return conflict('Invalid attendance section grade');
  // Existing grades can be historical evidence; do not overwrite a conflict.
  if (attendance.gradeLevel != null && attendance.gradeLevel !== section.gradeLevel) return conflict('Existing attendance grade disagrees with section; verify historical grade');
  return ok({ gradeLevel: section.gradeLevel });
}

export function deriveScheduleScope(scheduleId, sections) {
  const linked = sections.filter(s => s.scheduleId === scheduleId);
  if (linked.some(s => !validGrade(s.gradeLevel))) return conflict('Invalid grade on linked section');
  return ok({ gradeLevels: [...new Set(linked.map(s => s.gradeLevel))].sort((a, b) => a - b) });
}

export function planCoordinatorScopeBackfill({ schoolYear, students = [], enrollments = [], sections = [], attendance = [], schedules = [] }) {
  if (!validYear(schoolYear)) throw new Error('Missing or invalid current school year in settings/app; expected YYYY-YYYY');
  const changes = [], warnings = [];
  const studentIds = new Set(students.map(s => s.id));
  const scheduleIds = new Set(schedules.map(s => s.id));
  const sectionMap = new Map(sections.map(s => [s.id, s]));
  const byStudent = new Map();
  for (const e of enrollments) {
    if (!studentIds.has(e.studentId)) warnings.push({ path: `enrollments/${e.id}`, message: 'Missing referenced student' });
    const group = byStudent.get(e.studentId) || [];
    group.push(e); byStudent.set(e.studentId, group);
  }
  for (const section of sections) {
    if (section.scheduleId && !scheduleIds.has(section.scheduleId)) warnings.push({ path: `sections/${section.id}`, message: 'Missing referenced schedule' });
  }
  const add = (collection, record, result) => {
    const path = `${collection}/${record.id}`;
    for (const message of result.warnings) warnings.push({ path, message });
    if (!result.fields) return;
    const patch = Object.fromEntries(Object.entries(result.fields).filter(([key, value]) => JSON.stringify(record[key]) !== JSON.stringify(value)));
    if (Object.keys(patch).length) changes.push({ path, patch });
  };
  students.forEach(s => add('students', s, deriveStudentScope(s, byStudent.get(s.id) || [], schoolYear)));
  attendance.forEach(a => add('student_attendance', a, deriveAttendanceScope(a, sectionMap.get(a.sectionId))));
  schedules.forEach(s => add('schedules', s, deriveScheduleScope(s.id, sections)));
  changes.sort((a, b) => a.path.localeCompare(b.path));
  warnings.sort((a, b) => a.path.localeCompare(b.path) || a.message.localeCompare(b.message));
  return { changes, warnings };
}
