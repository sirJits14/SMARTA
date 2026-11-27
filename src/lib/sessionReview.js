import { grades } from './access.js';
import { enteredFor, hasTwoSessions } from '../../parent/src/lib/classSession.js';

const STATUS = { P: 'Present', L: 'Late', E: 'Excused', A: 'Absent' };

// Administrators review every current section; coordinators their grades.
export function reviewSections(sections, me, schoolYear) {
  const scope = grades(me);
  return (sections || [])
    .filter((s) => s.schoolYear === schoolYear && (scope === null || scope.includes(Number(s.gradeLevel))))
    .sort((a, b) => a.gradeLevel - b.gradeLevel || String(a.name || '').localeCompare(String(b.name || '')));
}

// Whole-day sections have a single session, counted as AM and shown as "Day".
export const reviewSessions = (schedule) => (hasTwoSessions(schedule) ? ['am', 'pm'] : ['am']);
export const sessionName = (session, sessions) => (sessions.length === 1 ? 'Day' : session.toUpperCase());

// The cell already says "Not in class"; show only what the reason adds.
export function reasonDetail(reason) {
  const text = String(reason || '').trim();
  if (text === 'Not in class') return '';
  return text.startsWith('Not in class: ') ? text.slice('Not in class: '.length) : text;
}

export function sessionCell(row, session) {
  const status = row?.[session] || {};
  const flagged = status.overrideActive === true;
  return {
    gate: enteredFor(row, session),
    flagged,
    label: flagged ? 'Not in class' : STATUS[status.status] || 'No mark',
    reason: flagged ? status.reason || '' : '',
    by: flagged ? status.actorName || '' : '',
  };
}
