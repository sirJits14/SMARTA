import S from '../strings.js';
export const ROLE_LABELS = { adviser: 'Adviser', curriculum_adviser: 'Curriculum Adviser' };
export const REQUESTABLE_ROLES = ['adviser'];
export const REQUEST_STATUS = { pending: S.requestPending, approved: S.requestApproved, rejected: S.requestRejected, withdrawn: S.requestWithdrawn,
  fulfilled: S.requestFulfilled, superseded: S.requestSuperseded };
export function sectionsByGrade(sections = []) {
  const grades = [...new Set(sections.map((s) => Number(s.gradeLevel)))].sort((a, b) => a - b);
  return grades.map((grade) => ({ grade, sections: sections.filter((s) => Number(s.gradeLevel) === grade) }));
}
export const manilaDay = (date = new Date()) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const OPENED_KEY = 'bnhs-school-opened';
const localStore = () => { try { return localStorage; } catch { return null; } };
// School mode tells SIMS it was opened at most once a day per account; remembered only after the call succeeds.
export function openedToday(uid, day = manilaDay(), storage = localStore()) {
  try {
    const saved = JSON.parse(storage?.getItem(OPENED_KEY) || 'null');
    return saved?.uid === uid && saved.day === day;
  } catch { return false; }
}
export function rememberOpened(uid, day = manilaDay(), storage = localStore()) {
  try { storage?.setItem(OPENED_KEY, JSON.stringify({ uid, day })); } catch { /* storage unavailable: report again next time */ }
}
export function attendanceSections(context = {}) {
  return (context.sections || []).filter(section => context.isAdmin || (context.assignments || []).some(a =>
    (a.role === 'adviser' && a.sectionId === section.id) || (a.role === 'curriculum_adviser' && Number(a.gradeLevel) === Number(section.gradeLevel))));
}
export function correctionError({ session, reason }) {
  if (!['am', 'pm'].includes(session)) return 'Choose AM or PM.';
  if (!reason?.trim()) return 'Enter a reason for this attendance change.';
  if (reason.trim().length > 500) return 'Keep the reason within 500 characters.';
  return '';
}
export function inboxDestination(item) {
  if (item.type === 'school_access') return item.rejected ? '/settings/school-access' : '/settings';
  if (item.type === 'learner_request') return '/school';
  if (!item.studentId) return null;
  const path = `/learner/${encodeURIComponent(item.studentId)}`;
  if (item.type === 'attendance_correction') return `${path}?${new URLSearchParams({ date: item.date || '', session: item.session || '' })}`;
  return item.type === 'attendance' ? `${path}?event=${encodeURIComponent(item.eventId || '')}` : null;
}
// The Firebase SDK appends " [<httpStatus>]" to every callable error message.
export const callableMessage = (error) => String(error?.message ?? '').replace(/\s*\[\d{3}\]$/, '');
// The server's own message for the codes it chooses to send; otherwise `fallback` (the generic text unless a caller gives its own).
export const schoolError = (error, fallback = 'Could not complete this action. Check your connection and try again.') => /(?:permission-denied|failed-precondition|already-exists|aborted|invalid-argument|not-found|resource-exhausted)$/.test(error?.code || '') && error.message
  ? callableMessage(error) : fallback;
export const learnerPath = (sectionId, studentId) => `/school/learner/${encodeURIComponent(sectionId)}/${encodeURIComponent(studentId)}`;
export const sectionLabel = (section) => section ? `Grade ${section.gradeLevel} · ${section.name || section.sectionName || section.label || section.id}` : 'Section unavailable';
// Requests and assignments name a section, or only a grade for grade-level roles.
export const scopeLabel = (item, sections = []) => (item?.sectionId ? sectionLabel(sections.find((s) => s.id === item.sectionId)) : `Grade ${item?.gradeLevel}`);
export const sessionAction = (session) => session?.overrideActive ? 'restore' : session?.absent ? null : 'absent';
export function correctionTime(value) {
  if (!value) return '';
  const seconds = value.seconds ?? value._seconds;
  const date = value.toDate ? value.toDate() : seconds !== undefined ? new Date(seconds * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · Manila`;
}
