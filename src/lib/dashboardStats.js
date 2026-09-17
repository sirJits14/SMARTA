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

export function recentEnrollments(enrollments, limit = 5) {
  return [...enrollments]
    .filter((e) => e.status === 'enrolled')
    .sort((a, b) => (b.dateEnrolled || '').localeCompare(a.dateEnrolled || ''))
    .slice(0, limit);
}
