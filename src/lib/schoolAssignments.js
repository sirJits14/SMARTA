import { ROLE_LABELS, sectionLabel } from '../../parent/src/lib/school.js';

// Legacy adviser rows for Guardians → School access: one per teacher, marked
// once that teacher already holds an adviser assignment this year.
export function legacyAdviserRows(advisers = [], managedAssignments = []) {
  const assigned = new Set((managedAssignments || []).filter((a) => a.role === 'adviser').map((a) => a.uid));
  return (advisers || []).map((adviser) => ({ ...adviser, assigned: assigned.has(adviser.guardianUid) }));
}

export const assignmentFromLegacy = (adviser) => ({ email: adviser.email || '', role: 'adviser', sectionId: adviser.suggestedSectionId || '', gradeLevel: '' });

export const DAY_MS = 86400000;
const who = person => person?.displayName || person?.email || '';

// Opened means School mode was used after this particular assignment was made.
export function openedStatus(item) {
  const at = item?.lastSchoolOpenAt || null;
  return at && (!item.assignedAt || at >= item.assignedAt) ? { opened: true, at } : { opened: false, at: null };
}

export function requestFlags(request, now = Date.now()) {
  const flags = [];
  if (request.conflict) flags.push({ key: 'conflict', label: `Section has an adviser (${who(request.conflict)})` });
  if (!/@deped\.gov\.ph$/i.test(request.email || '')) flags.push({ key: 'personal', label: 'Non-DepEd email' });
  if (request.createdAt && now - request.createdAt >= 3 * DAY_MS) flags.push({ key: 'stale', label: 'Waiting 3+ days' });
  return flags;
}

export function relativeAge(ms, now = Date.now()) {
  if (!ms) return '';
  const minutes = Math.floor(Math.max(0, now - ms) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export const shortDate = ms => (ms ? new Date(ms).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }) : '');

export function coverageByGrade(sections = [], assignments = [], pending = []) {
  const grades = [...new Set(sections.map(s => Number(s.gradeLevel)))].sort((a, b) => a - b);
  return grades.map(grade => {
    const rows = sections.filter(s => Number(s.gradeLevel) === grade).map(section => ({
      section,
      adviser: assignments.find(a => a.role === 'adviser' && a.sectionId === section.id) || null,
      subjectTeachers: assignments.filter(a => a.role === 'subject_teacher' && a.sectionId === section.id).length,
      pending: pending.find(r => r.role === 'adviser' && r.sectionId === section.id) || null,
    }));
    return { grade, rows, covered: rows.filter(r => r.adviser).length,
      curriculumAdvisers: assignments.filter(a => a.role === 'curriculum_adviser' && Number(a.gradeLevel) === grade) };
  });
}

export function filterAssignments(items = [], { text = '', grade = '', role = '', status = '' } = {}, sections = []) {
  const byId = Object.fromEntries(sections.map(s => [s.id, s]));
  const needle = text.trim().toLowerCase();
  const name = item => byId[item.sectionId]?.name || '';
  return items.filter(item => {
    if (grade && Number(item.gradeLevel) !== Number(grade)) return false;
    if (role && item.role !== role) return false;
    if (status && (openedStatus(item).opened ? 'opened' : 'not_opened') !== status) return false;
    return !needle || [item.displayName, item.email, name(item)].some(v => String(v || '').toLowerCase().includes(needle));
  }).sort((a, b) => Number(a.gradeLevel) - Number(b.gradeLevel) || name(a).localeCompare(name(b)) || who(a).localeCompare(who(b)));
}

// A UTF-8 BOM lets Excel read names correctly; a leading quote stops formula injection.
const cell = value => {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
export const toCsv = rows => '\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n');

export function assignmentCsvRows(items, sections = []) {
  const byId = Object.fromEntries(sections.map(s => [s.id, s]));
  return [['Name', 'Email', 'Responsibility', 'Grade', 'Section', 'Assigned on', 'Assigned by', 'Source', 'Status'],
    ...items.map(item => [who(item), item.email || '', ROLE_LABELS[item.role] || item.role, Number(item.gradeLevel), byId[item.sectionId]?.name || '',
      shortDate(item.assignedAt), item.assignedBy || '', item.source || '', openedStatus(item).opened ? 'Opened' : 'Not opened yet'])];
}

export function coverageCsvRows(groups) {
  return [['Grade', 'Section', 'Adviser', 'Adviser email', 'Opened', 'Subject teachers', 'Pending request'],
    ...groups.flatMap(g => g.rows.map(r => [g.grade, r.section.name || r.section.id, who(r.adviser), r.adviser?.email || '',
      r.adviser ? (openedStatus(r.adviser).opened ? 'Yes' : 'No') : '', r.subjectTeachers, who(r.pending)]))];
}

const VERBS = { 'school.requestApproved': 'approved', 'school.requestRejected': 'rejected the request from', 'school.assigned': 'assigned', 'school.revoked': 'revoked' };
export function historyLine(row, sections = []) {
  const d = row.details || {};
  const teacher = d.teacherName || d.teacherEmail || row.targetId;
  const section = sections.find(s => s.id === d.sectionId);
  const scope = d.sectionId ? (section ? sectionLabel(section) : `Section ${d.sectionId}`) : d.gradeLevel ? `Grade ${d.gradeLevel}` : '';
  const what = [ROLE_LABELS[d.role], scope].filter(Boolean).join(' · ');
  const when = row.at?.toDate ? row.at.toDate().toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  const text = row.action === 'school.requested' ? `${teacher} requested ${what}`
    : row.action === 'school.requestWithdrawn' ? `${teacher} withdrew a request for ${what}`
    : row.action === 'school.replaced' ? `${row.actorUid} replaced ${d.previousEmail || 'the adviser'} with ${teacher} · ${what}`
    : `${row.actorUid} ${VERBS[row.action] || row.action} ${teacher} · ${what}`;
  return { when, text, reason: d.reason && d.reason !== 'Approved' ? d.reason : '' };
}
