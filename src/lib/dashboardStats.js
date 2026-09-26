import { depedSort } from './roster.js';
export function activeStudentCount(students) {
  return students.filter((s) => s.status === 'active').length;
}

export function unassignedCount(students, enrollments, schoolYear) {
  const enrolledIds = new Set(
    enrollments
      .filter((e) => e.schoolYear === schoolYear && e.status === 'enrolled')
      .map((e) => e.studentId)
  );
  return students.filter((s) => s.status === 'active' && !enrolledIds.has(s.id)).length;
}

export function enrolledCount(enrollments, schoolYear) {
  return enrollments.filter((e) => e.schoolYear === schoolYear && e.status === 'enrolled').length;
}

export function countByGrade(enrollments, schoolYear) {
  const counts = {};
  for (const e of enrollments) {
    if (e.schoolYear === schoolYear && e.status === 'enrolled') {
      counts[e.gradeLevel] = (counts[e.gradeLevel] || 0) + 1;
    }
  }
  return counts;
}

export function todayAttendance(attendanceDocs, sectionsCount, date) {
  const todays = attendanceDocs.filter((d) => d.date === date);
  if (todays.length === 0) return { sectionsMarked: 0, presentRate: null };
  let presentSum = 0, totalSum = 0;
  for (const doc of todays) {
    const marks = Object.values(doc.marks || {});
    totalSum += marks.length;
    presentSum += marks.filter((m) => m === 'P' || m === 'L').length;
  }
  const presentRate = totalSum > 0 ? Math.round((presentSum / totalSum) * 100) : null;
  return { sectionsMarked: todays.length, presentRate };
}

export function recentEnrollments(enrollments, schoolYear, limit = 5) {
  return [...enrollments]
    .filter((e) => e.status === 'enrolled' && e.schoolYear === schoolYear)
    .sort((a, b) => (b.dateEnrolled || '').localeCompare(a.dateEnrolled || ''))
    .slice(0, limit);
}

export function attendanceCoverage({ students, sections, enrollments, attendance, schoolYear, date }) {
  const studentIds = new Set(depedSort(students).map(s => s.id));
  const enrolledSections = new Set(enrollments.filter(e => e.schoolYear === schoolYear && e.status === 'enrolled' && studentIds.has(e.studentId)).map(e => e.sectionId));
  const byId = new Map(sections.filter(s => s.schoolYear === schoolYear && enrolledSections.has(s.id)).map(s => [s.id, s]));
  const eligibleSections = [...byId.values()].sort((a,b) => a.gradeLevel-b.gradeLevel || a.name.localeCompare(b.name));
  const recorded = new Set(attendance.filter(d => d.date === date && d.schoolYear === schoolYear && byId.has(d.sectionId)).map(d => d.sectionId));
  const pendingSections = eligibleSections.filter(s => !recorded.has(s.id));
  const totalSections = eligibleSections.length;
  return { eligibleSections, pendingSections, recordedCount: recorded.size, totalSections,
    percent: totalSections ? Math.round(recorded.size / totalSections * 100) : null };
}
