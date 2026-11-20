import { depedSort, fullName } from './roster.js';
import { attendanceUnits } from '../../shared/sessionAttendance.js';
import { toMillis } from '../../shared/announcements.js';
import { manilaDay } from './dates.js';
export function activeStudentCount(students) {
  return students.filter((s) => s.status === 'active').length;
}

export function unassignedStudents(students, enrollments, schoolYear) {
  const enrolledIds = new Set(
    enrollments
      .filter((e) => e.schoolYear === schoolYear && e.status === 'enrolled')
      .map((e) => e.studentId)
  );
  return students
    .filter((s) => s.status === 'active' && !enrolledIds.has(s.id))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));
}

export function unassignedCount(students, enrollments, schoolYear) {
  return unassignedStudents(students, enrollments, schoolYear).length;
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

const sexTally = () => ({ male: 0, female: 0, unknown: 0, total: 0 });
const bumpSex = (t, sex) => { t[sex === 'M' ? 'male' : sex === 'F' ? 'female' : 'unknown'] += 1; t.total += 1; };

// Learners enrolled this school year by sex. Any value other than 'M' or 'F' is counted as unknown
// ("Not recorded") so the totals always match enrollment.
export function sexBreakdown({ students, enrollments, sections, schoolYear, grade = null }) {
  const byId = new Map(students.map((s) => [s.id, s]));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const total = sexTally();
  const grades = new Map();
  const bySection = new Map();
  for (const e of enrollments) {
    if (e.schoolYear !== schoolYear || e.status !== 'enrolled') continue;
    const student = byId.get(e.studentId);
    if (!student) continue;
    const g = Number(e.gradeLevel);
    if (grade != null && g !== Number(grade)) continue;
    bumpSex(total, student.sex);
    if (!grades.has(g)) grades.set(g, { grade: g, ...sexTally() });
    bumpSex(grades.get(g), student.sex);
    if (e.sectionId) {
      if (!bySection.has(e.sectionId)) bySection.set(e.sectionId, { sectionId: e.sectionId, gradeLevel: g, name: sectionById.get(e.sectionId)?.name || 'Unavailable section', ...sexTally() });
      bumpSex(bySection.get(e.sectionId), student.sex);
    }
  }
  return {
    ...total,
    byGrade: [...grades.values()].sort((a, b) => a.grade - b.grade),
    bySection: [...bySection.values()].sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)),
  };
}

export function shsBreakdown(enrollments, sections, schoolYear) {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const groups = new Map();
  for (const e of enrollments) {
    if (e.schoolYear !== schoolYear || e.status !== 'enrolled' || Number(e.gradeLevel) < 11) continue;
    const section = byId.get(e.sectionId);
    const track = section?.track || 'No track';
    const strand = section?.strand || 'No strand';
    const key = `${track}|${strand}`;
    const group = groups.get(key) || { track, strand, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.track.localeCompare(b.track) || a.strand.localeCompare(b.strand));
}

export const gradesInScope = (sections, schoolYear) =>
  [...new Set(sections.filter((s) => s.schoolYear === schoolYear).map((s) => Number(s.gradeLevel)))].sort((a, b) => a - b);

export const sectionTitle = (section) => (section
  ? [section.gradeLevel && `Grade ${section.gradeLevel}`, section.name, section.strand].filter(Boolean).join(' · ')
  : 'Unavailable section');

export const formatUnits = (n) => n.toLocaleString('en-PH', { maximumFractionDigits: 1 });
export const formatRate = (rate) => (rate == null ? '—' : `${rate}%`);

export function postState(post, nowMs) {
  if (post.status === 'scheduled') return 'scheduled';
  const expires = toMillis(post.expiresAt);
  if (post.status === 'published' && !(expires != null && expires <= nowMs)) return 'published';
  return 'ended';
}

export const postDate = (post) =>
  toMillis(post.status === 'scheduled' ? post.publishAt : (post.publishedAt ?? post.publishAt)) ?? 0;

const STATE_RANK = { published: 0, scheduled: 1, ended: 2 };

// Notice board order: what is live now (pinned first, then newest), then what is coming (soonest first).
export function noticePosts(posts, { status = 'all', nowMs, limit = 4 }) {
  const state = new Map(posts.map((p) => [p.id, postState(p, nowMs)]));
  return posts
    .filter((p) => (status === 'all' ? state.get(p.id) !== 'ended' : state.get(p.id) === status))
    .sort((a, b) => {
      const sa = state.get(a.id);
      const sb = state.get(b.id);
      if (sa !== sb) return STATE_RANK[sa] - STATE_RANK[sb];
      if (sa === 'published' && Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      const byDate = sa === 'scheduled' ? postDate(a) - postDate(b) : postDate(b) - postDate(a);
      return byDate || a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

export function postsByDay(posts, nowMs) {
  const out = {};
  for (const post of posts) {
    const ms = postDate(post);
    if (!ms || postState(post, nowMs) === 'ended') continue;
    (out[manilaDay(ms)] ||= []).push(post);
  }
  for (const list of Object.values(out)) list.sort((a, b) => postDate(a) - postDate(b) || a.id.localeCompare(b.id));
  return out;
}

export function upcomingPosts({ posts, nowMs, day = null, limit = 3 }) {
  if (day) return (postsByDay(posts, nowMs)[day] || []).slice(0, limit);
  return posts
    .filter((p) => p.status === 'scheduled' && postDate(p) > nowMs)
    .sort((a, b) => postDate(a) - postDate(b) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

// Enrollments (by dateEnrolled) and posts (published: publishedAt; scheduled: when it was scheduled)
// as one newest-first feed. Same day: posts before enrollments, then by key, so the order is stable.
export function recentActivity({ enrollments, posts, schoolYear, kind = 'all', limit = 6 }) {
  const items = [];
  if (kind !== 'post') {
    for (const e of enrollments) {
      if (e.schoolYear !== schoolYear || e.status !== 'enrolled' || !e.dateEnrolled) continue;
      items.push({ key: `e:${e.studentId}`, kind: 'enrollment', day: e.dateEnrolled, enrollment: e });
    }
  }
  if (kind !== 'enrollment') {
    for (const post of posts) {
      if (post.status !== 'published' && post.status !== 'scheduled') continue;
      const ms = toMillis(post.status === 'scheduled' ? post.createdAt : post.publishedAt);
      if (!ms) continue;
      items.push({ key: `p:${post.id}`, kind: 'post', day: manilaDay(ms), post, scheduled: post.status === 'scheduled' });
    }
  }
  const rank = { post: 0, enrollment: 1 };
  return items
    .sort((a, b) => b.day.localeCompare(a.day) || rank[a.kind] - rank[b.kind] || a.key.localeCompare(b.key))
    .slice(0, limit);
}

export function attentionQueues({ admin, canRequests, unassigned, pendingSections, requests, idCards }) {
  return [
    admin && { id: 'unassigned', label: 'Learners without a section', count: unassigned },
    { id: 'attendance', label: 'Sections without attendance today', count: pendingSections },
    canRequests && { id: 'requests', label: 'Learner requests waiting', count: requests.count, truncated: Boolean(requests.truncated) },
    admin && { id: 'idcards', label: 'ID cards waiting to print', count: idCards },
  ].filter((q) => q && q.count > 0);
}
