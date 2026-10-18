export const ROLE_LABELS = { adviser: 'Adviser', subject_teacher: 'Subject Teacher', curriculum_adviser: 'Curriculum Adviser' };
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
  if (item.type === 'school_access') return '/settings';
  if (!item.studentId) return null;
  const path = `/learner/${encodeURIComponent(item.studentId)}`;
  if (item.type === 'attendance_correction') return `${path}?${new URLSearchParams({ date: item.date || '', session: item.session || '' })}`;
  return item.type === 'attendance' ? `${path}?event=${encodeURIComponent(item.eventId || '')}` : null;
}
export const schoolError = (error) => /(?:permission-denied|failed-precondition|already-exists|aborted|invalid-argument|not-found)$/.test(error?.code || '') && error.message
  ? error.message : 'Could not complete this action. Check your connection and try again.';
export const sectionLabel = (section) => section ? `Grade ${section.gradeLevel} · ${section.name || section.sectionName || section.label || section.id}` : 'Section unavailable';
export const sessionAction = (session) => session?.overrideActive ? 'restore' : session?.absent ? null : 'absent';
export function correctionTime(value) {
  if (!value) return '';
  const seconds = value.seconds ?? value._seconds;
  const date = value.toDate ? value.toDate() : seconds !== undefined ? new Date(seconds * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · Manila`;
}
