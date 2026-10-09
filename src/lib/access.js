import { roleOf, scopedGrades, ALL_GRADES } from '../../shared/staffRoles.js';
import { NAV_ITEMS } from './navigation.js';

// Every page/permission decision the SIMS app makes about the signed-in staff
// member. Pages ask here; nothing else compares role strings.
const COORDINATOR_PAGES = ['dashboard', 'students', 'sections', 'schedules', 'attendance', 'announcements'];
export const DISABLED_MESSAGE = 'This account has been disabled. Contact an administrator.';

export const isAdmin = (me) => roleOf(me) === 'admin';
export const grades = (me) => scopedGrades(me);
export function allowedPages(me) {
  if (!roleOf(me)) return [];
  return isAdmin(me) ? NAV_ITEMS.map((item) => item.key) : COORDINATOR_PAGES;
}
export const canOpen = (me, page) => allowedPages(me).includes(page);
export const gradeOptions = (me) => grades(me) ?? ALL_GRADES;
export function singleGrade(me) {
  const g = grades(me);
  return g && g.length === 1 ? g[0] : null;
}

// A profile bound to another Auth account (uid set and different) is treated
// as missing, so re-registering a staff email can't claim it. Legacy profiles
// without a uid match by email, as the rules and functions do.
export const ownProfile = (data, uid) => (data && (!data.uid || data.uid === uid) ? data : null);

export function profileRefusal(profile) {
  if (!profile) return 'This account has no staff profile yet. Ask an administrator to add one.';
  if (profile.disabled === true) return DISABLED_MESSAGE;
  if (!roleOf(profile)) return 'This account has no valid role. Ask an administrator to fix it.';
  return null;
}

// Narrows already-loaded collections to a coordinator's grades; identity for
// admins (scope null). Learners count as in scope only through a current
// enrolled enrollment, so unassigned learners never reach coordinators.
export function scopeRoster({ sections = [], enrollments = [], students = [], attendance = [] }, scope, schoolYear) {
  if (scope == null) return { sections, enrollments, students, attendance };
  const inScope = (g) => scope.includes(Number(g));
  const scopedSections = sections.filter((s) => inScope(s.gradeLevel));
  const sectionIds = new Set(scopedSections.map((s) => s.id));
  const scopedEnrollments = enrollments.filter((e) => inScope(e.gradeLevel));
  const studentIds = new Set(scopedEnrollments
    .filter((e) => e.schoolYear === schoolYear && e.status === 'enrolled')
    .map((e) => e.studentId));
  return {
    sections: scopedSections,
    enrollments: scopedEnrollments,
    students: students.filter((s) => studentIds.has(s.id)),
    attendance: attendance.filter((d) => sectionIds.has(d.sectionId)),
  };
}
