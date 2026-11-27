import { ENROLL_TYPE_LABELS, reasonLabel } from '../../shared/learnerRequests.js';
import { capsName, fullName } from './roster.js';

// Words the Learner requests page shows. The server decides who may act; this file only phrases it.
export const kindLabel = (request) => (request.kind === 'add' ? 'Add' : 'Remove');
export const classText = (request) => `Grade ${request.gradeLevel} · ${request.sectionName || request.sectionId}`;
export const nameText = (request) => capsName(request.displayName);

// A person's name in capitals; an email address (shown when they have no name) stays as written.
export const personText = (name) => {
  if (!name) return '';
  return String(name).includes('@') ? String(name) : capsName(name);
};

const STATUS_WORD = { dropped: 'Dropped', transferred: 'Transferred' };

// Where an existing learner is now, in words an approver can act on.
export function placeText(existing) {
  if (existing.currentGrade != null) return `Grade ${existing.currentGrade} · ${existing.currentSection}`;
  return STATUS_WORD[existing.learnerStatus] || 'Unassigned';
}

// The flag under an Add whose LRN is already in SIMS; '' when the LRN is new.
export function existingFlag(request) {
  const existing = request.existing;
  if (!existing) return '';
  if (existing.needsAdmin) return 'Needs an administrator';
  if (existing.ambiguous) return 'This LRN matches more than one learner. Fix the records first.';
  if (existing.enrolledHere) return `Already in SIMS: ${capsName(existing.displayName)}, already in this class. Approving will not work; reject this request.`;
  const effect = existing.currentGrade != null ? 'Approving moves them here.' : 'Approving enrolls them here.';
  return `Already in SIMS: ${capsName(existing.displayName)}, currently ${placeText(existing)}. ${effect}`;
}

// Approving an Add for an LRN already in SIMS leaves the learner's own record as it is; the adviser's details are ignored.
export function keepsDetailsText(request) {
  const existing = request.existing;
  if (!existing || existing.needsAdmin || existing.ambiguous || existing.enrolledHere) return '';
  return 'SIMS keeps the details it already has for this learner.';
}

// What approving a request will do, in a sentence. Adds for a learner already in SIMS say it in the flag instead.
export function approveEffect(request) {
  const name = nameText(request);
  if (request.kind === 'remove') {
    if (request.reasonCode === 'transferred_out') return `Marks ${name} as transferred and ends the enrollment.`;
    if (request.reasonCode === 'dropped_out') return `Marks ${name} as dropped and ends the enrollment.`;
    return `Ends the enrollment of ${name}. They stay Active and show as Unassigned.`;
  }
  return request.existing ? '' : `Adds ${name} to ${classText(request)} as ${ENROLL_TYPE_LABELS[request.enrollType] || 'New'}.`;
}

// The "Details" of an Add: everything the adviser typed, skipping what was left blank.
export function detailRows(request) {
  const student = request.student || {};
  return [
    ['Name', fullName(student)], ['LRN', student.lrn], ['Sex', student.sex === 'F' ? 'Female' : student.sex === 'M' ? 'Male' : ''],
    ['Birthdate', student.birthdate], ['Enrollment type', ENROLL_TYPE_LABELS[request.enrollType]], ['Address', student.address],
    ['Guardian', student.guardianName], ['Relationship', student.guardianRelationship], ['Guardian contact', student.guardianContact],
    ['Contact number', student.contactNumber],
  ].filter(([, value]) => value);
}

// One line under a removal: why the adviser asked.
export const removalText = (request) => `${reasonLabel(request.reasonCode)} · ${request.note}`;

export const whenText = (ms) => (ms ? new Date(ms).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '');

export const outcomeText = (request) => `${request.status === 'approved' ? 'Approved' : 'Not approved'} by ${personText(request.decidedByName) || 'staff'}`;

// Requests the signed-in person can decide come first, then the ones that need an administrator.
export const orderWaiting = (requests) => [...requests.filter((r) => r.decidable), ...requests.filter((r) => !r.decidable)];
export const decidableCount = (requests) => requests.filter((r) => r.decidable).length;

// The Waiting tab's label. The server stops at 200, so a cut list is a floor and gets a plus.
export const waitingTabLabel = (count, truncated) => `Waiting${count ? ` (${count}${truncated ? '+' : ''})` : ''}`;

// The sidebar badge text, for the expanded sidebar, the narrow rail and the drawer alike: three digits do not
// fit beside the rail's icon, and a cut count is only a floor, so over 99 or cut reads 99+.
export const badgeCountText = (count, truncated) => (truncated || count > 99 ? '99+' : String(count));

// The note after a decision, worded from what the server did. A card can be stale (an "Add" may move a learner
// another approval just created), so the server's `mode` decides: new, moved, enrolled, removed or rejected.
// A missing or unknown mode falls back to a plain approval.
export function decisionNotice(request, result) {
  if (result?.mode === 'rejected') return 'Rejected. The adviser sees your reason.';
  const name = nameText(request);
  const inbox = 'The adviser gets an inbox note.';
  switch (result?.mode) {
    case 'new': return `Added ${name} to ${classText(request)}. ${inbox}`;
    case 'moved': return `Moved ${name} to ${classText(request)}. ${inbox}`;
    case 'enrolled': return `Enrolled ${name} in ${classText(request)}. ${inbox}`;
    case 'removed': return `Removed ${name} from ${classText(request)}. ${inbox}`;
    default: return `Approved ${name}. ${inbox}`;
  }
}

// Shown on the Waiting tab when the server cut the list at its limit; '' otherwise.
export const waitingCutNote = (waiting) => (waiting?.truncated ? 'Showing the 200 oldest requests. Decide some to see the rest.' : '');
