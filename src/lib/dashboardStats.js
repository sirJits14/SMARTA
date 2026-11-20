import { depedSort, fullName } from './roster.js';
import { attendanceUnits } from '../../shared/sessionAttendance.js';
import { toMillis } from '../../shared/announcements.js';
import { manilaDay } from './dates.js';
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

export function recentEnrolledSections(enrollments, schoolYear) {
  const groups = new Map();
  for (const enrollment of enrollments) {
    if (enrollment.schoolYear !== schoolYear || enrollment.status !== 'enrolled' || !enrollment.sectionId) continue;
    const group = groups.get(enrollment.sectionId) || { sectionId: enrollment.sectionId, count: 0, latestDate: '' };
    group.count++;
    const date = enrollment.dateEnrolled || '';
    if (date > group.latestDate) group.latestDate = date;
    groups.set(enrollment.sectionId, group);
  }
  return [...groups.values()].sort((a, b) => b.latestDate.localeCompare(a.latestDate) || a.sectionId.localeCompare(b.sectionId)).slice(0, 30);
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

export const percentOf = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

// Enrolled learners per section for the school year, limited to the scoped student list.
export function rosterBySection(students, enrollments, schoolYear) {
  const ids = new Set(students.map((s) => s.id));
  const out = new Map();
  for (const e of enrollments) {
    if (e.schoolYear !== schoolYear || e.status !== 'enrolled' || !e.sectionId || !ids.has(e.studentId)) continue;
    if (!out.has(e.sectionId)) out.set(e.sectionId, []);
    out.get(e.sectionId).push(e.studentId);
  }
  return out;
}

const zeroUnits = () => ({ present: 0, late: 0, absent: 0, excused: 0 });
const addUnits = (into, u) => { into.present += u.present; into.late += u.late; into.absent += u.absent; into.excused += u.excused; };
// Present already includes late (attendanceUnits counts L as present), so late is never added to the denominator.
const withRate = (t) => ({ ...t, rate: percentOf(t.present, t.present + t.absent + t.excused) });

// Attendance over a set of dates, from the same summarizer SF2 uses. A section-day counts only when a
// student_attendance doc exists for it; inside a recorded doc, unmarked learners are present by default.
export function attendanceTally({ roster, attendance, schoolYear, dates, sectionIds = null }) {
  const wanted = new Set(dates);
  const allowed = sectionIds ? new Set(sectionIds) : null;
  const days = new Map(dates.map((date) => [date, { date, sectionsRecorded: 0, ...zeroUnits() }]));
  const sections = new Map();
  for (const doc of attendance) {
    if (doc.schoolYear !== schoolYear || !wanted.has(doc.date) || !roster.has(doc.sectionId)) continue;
    if (allowed && !allowed.has(doc.sectionId)) continue;
    const day = days.get(doc.date);
    const section = sections.get(doc.sectionId) || { sectionId: doc.sectionId, daysRecorded: 0, ...zeroUnits() };
    day.sectionsRecorded += 1;
    section.daysRecorded += 1;
    for (const studentId of roster.get(doc.sectionId)) {
      const units = attendanceUnits(doc, studentId);
      addUnits(day, units);
      addUnits(section, units);
    }
    sections.set(doc.sectionId, section);
  }
  const total = zeroUnits();
  for (const day of days.values()) addUnits(total, day);
  return {
    days: [...days.values()].map(withRate),
    sections: [...sections.values()].sort((a, b) => a.sectionId.localeCompare(b.sectionId)).map(withRate),
    total: withRate(total),
  };
}
