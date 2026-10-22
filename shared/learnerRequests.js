// Rules for adviser learner requests (spec 2026-10-22): which fields a request carries, how they are
// checked, what a removal does, and who may decide one. Cloud Functions, the Parent App and SIMS all
// import this file, so a phone and the server always agree.
import { currentAssignments, reviewGrades } from './schoolAccess.js';

export const ENROLL_TYPES = ['new', 'returning', 'transferee'];
export const ENROLL_TYPE_LABELS = { new: 'New', returning: 'Returning', transferee: 'Transferee' };

// What an approved removal does to the enrollment and to the learner. Nothing is ever erased.
// `moved_section` leaves the learner Active (Unassigned), exactly like SIMS Enrollment → Withdraw.
export const REMOVAL_REASONS = {
  transferred_out: { label: 'Transferred out', enrollment: 'transferred', learner: 'transferred' },
  dropped_out: { label: 'Dropped out', enrollment: 'dropped', learner: 'dropped' },
  moved_section: { label: 'Moved to another section', enrollment: 'dropped', learner: null },
};
export const REASON_CODES = Object.keys(REMOVAL_REASONS);
export const reasonLabel = (code) => REMOVAL_REASONS[code]?.label || '';

export const MAX_PENDING_PER_ADVISER = 20;
export const NOTE_MAX = 500;

// Removed from a request once it is decided or withdrawn; the rest of the form stays so a
// rejected add can be sent again with most of it filled in.
export const CONTACT_FIELDS = ['address', 'guardianContact', 'contactNumber'];

export const LEARNER_TEXT_FIELDS = ['lastName', 'firstName', 'middleName', 'extName', 'address',
  'guardianName', 'guardianRelationship', 'guardianContact', 'contactNumber'];
const TEXT_LIMITS = { lastName: 60, firstName: 60, middleName: 60, extName: 60, address: 200,
  guardianName: 60, guardianRelationship: 60, guardianContact: 60, contactNumber: 60 };
const TEXT_LABELS = { lastName: 'Last name', firstName: 'First name', middleName: 'Middle name', extName: 'Ext',
  address: 'Address', guardianName: 'Guardian name', guardianRelationship: 'Guardian relationship',
  guardianContact: 'Guardian contact', contactNumber: 'Contact number' };

// Trim, drop control characters and collapse runs of spaces.
export const cleanText = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

function birthdateError(text, today) {
  if (!text) return 'Birthdate is required.';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return 'Enter the birthdate as a real date.';
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return 'Enter the birthdate as a real date.';
  if (today && text > today) return 'Birthdate cannot be in the future.';
  return '';
}

// The Excel import's rules (src/lib/validation.js) plus length limits. `value` is the cleaned form,
// ready to store whether or not it passed; `today` is a YYYY-MM-DD in school time.
export function validateLearnerFields(input, { today } = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const value = { lrn: cleanText(source.lrn), sex: cleanText(source.sex).toUpperCase(), birthdate: cleanText(source.birthdate) };
  for (const key of LEARNER_TEXT_FIELDS) value[key] = cleanText(source[key]);
  const errors = {};
  if (!/^\d{12}$/.test(value.lrn)) errors.lrn = 'LRN must be exactly 12 digits.';
  if (!value.lastName) errors.lastName = 'Last name is required.';
  if (!value.firstName) errors.firstName = 'First name is required.';
  if (value.sex !== 'M' && value.sex !== 'F') errors.sex = 'Choose a sex.';
  const birthdate = birthdateError(value.birthdate, today);
  if (birthdate) errors.birthdate = birthdate;
  for (const key of LEARNER_TEXT_FIELDS) {
    if (!errors[key] && value[key].length > TEXT_LIMITS[key]) errors[key] = `Keep ${TEXT_LABELS[key]} within ${TEXT_LIMITS[key]} characters.`;
  }
  return { ok: Object.keys(errors).length === 0, errors, value };
}

// A blank enrollment type means "new", as in the import; anything else must be a known type.
export function validateEnrollType(input) {
  const value = cleanText(input).toLowerCase() || 'new';
  return ENROLL_TYPES.includes(value) ? { ok: true, value } : { ok: false, value, error: 'Enrollment type must be new, returning, or transferee.' };
}

export function validateRemoval(input) {
  const source = input && typeof input === 'object' ? input : {};
  const errors = {};
  const reasonCode = REASON_CODES.includes(source.reasonCode) ? source.reasonCode : '';
  if (!reasonCode) errors.reasonCode = 'Choose a reason.';
  const note = cleanText(source.note);
  if (!note) errors.note = 'Add a short note.';
  else if (note.length > NOTE_MAX) errors.note = `Keep the note within ${NOTE_MAX} characters.`;
  return { ok: Object.keys(errors).length === 0, errors, value: { reasonCode, note } };
}

export const addKey = (sectionId, lrn) => `add:${sectionId}:${lrn}`;
export const removeKey = (sectionId, studentId) => `remove:${sectionId}:${studentId}`;

// The section's Class Adviser for the actor's current school year.
export const isSectionAdviser = (actor, sectionId) =>
  currentAssignments(actor).some((a) => a.role === 'adviser' && a.sectionId === sectionId);

// Administrators, plus Curriculum Advisers and SIMS coordinators whose grades include `grade`.
export const coversGrade = (actor, grade) => actor?.isAdmin === true || reviewGrades(actor).includes(grade);

// Nobody decides their own request; nobody decides another school year's.
export function canDecideLearnerRequest(actor, request) {
  if (!actor || request?.status !== 'pending' || request.schoolYear !== actor.schoolYear) return false;
  return request.requestedByUid !== actor.uid && coversGrade(actor, request.gradeLevel);
}
