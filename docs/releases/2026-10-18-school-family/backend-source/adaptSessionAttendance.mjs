// Production-only compatibility while the coordinator grade rollout is held.
// All other session correction behavior comes from the reviewed feature source.
export function adaptSessionAttendance(source) {
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw new Error('Session attendance source changed; review the release adapter.');
    source = source.replace(before, after);
  };
  replace('function validAttendance(attendance, section, date) {',
    `// Missing grade metadata is expected on live attendance. Only a server-read
// section can supply that legacy fallback; explicit saved values never fall back.
const attendanceGrade = (attendance, section) => attendance && Object.hasOwn(attendance, 'gradeLevel')
  ? attendance.gradeLevel : section.gradeLevel;
function validAttendance(attendance, section, date) {`);
  replace(`  if (attendance && (attendance.sectionId !== section.id || attendance.schoolYear !== section.schoolYear || attendance.date !== date
      || !Number.isInteger(attendance.gradeLevel) || attendance.gradeLevel < 7 || attendance.gradeLevel > 12)) {`,
    `  const grade = attendanceGrade(attendance, section);
  if (!Number.isInteger(grade) || grade < 7 || grade > 12
      || attendance && (attendance.sectionId !== section.id || attendance.schoolYear !== section.schoolYear || attendance.date !== date)) {`);
  replace('canReviewSection(actor, { ...section, gradeLevel: attendance.gradeLevel })',
    'canReviewSection(actor, { ...section, gradeLevel: attendanceGrade(attendance, section) })');
  replace('gradeLevel: attendance?.gradeLevel ?? section.gradeLevel,', 'gradeLevel: attendanceGrade(attendance, section),');
  return source;
}
