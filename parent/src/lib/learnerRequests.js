import S from '../strings.js';
import { nameCase } from './format.js';
import { manilaDate } from '../../../shared/dates.js';
import {
  CONTACT_FIELDS, ENROLL_TYPES, ENROLL_TYPE_LABELS, REASON_CODES, REMOVAL_REASONS, reasonLabel, validateEnrollType, validateLearnerFields, validateRemoval,
} from '../../../shared/learnerRequests.js';

export const REASON_OPTIONS = REASON_CODES.map((value) => ({ value, label: REMOVAL_REASONS[value].label }));
export const ENROLL_OPTIONS = ENROLL_TYPES.map((value) => ({ value, label: ENROLL_TYPE_LABELS[value] }));

export const emptyLearnerForm = () => ({
  lrn: '', lastName: '', firstName: '', middleName: '', extName: '', sex: '', birthdate: '', enrollType: 'new',
  address: '', guardianName: '', guardianRelationship: '', guardianContact: '', contactNumber: '',
});

// The same rules the server applies, so most mistakes are caught before anything is sent.
export function checkLearnerForm(form, today = manilaDate()) {
  const fields = validateLearnerFields(form, { today });
  const type = validateEnrollType(form.enrollType);
  const errors = { ...fields.errors, ...(type.ok ? {} : { enrollType: type.error }) };
  return { ok: Object.keys(errors).length === 0, errors };
}

export const checkRemoval = (input) => validateRemoval(input);

// What requestLearnerAddFn takes: the class, the enrollment type, and the learner's details.
export function addPayload(sectionId, form) {
  const { enrollType, ...student } = form;
  return { sectionId, enrollType, student };
}

export const removalPayload = (sectionId, studentId, { reasonCode, note }) => ({ sectionId, studentId, reasonCode, note });

// "Send again" on a not-approved add: the form comes back without the address and phone numbers,
// which the school clears once a request is decided. The server already strips them; this does not
// rely on that. Only the form's own fields are taken, and only text values; the contact fields stay
// empty and an unknown enrollment type falls back to new.
export function prefillFrom(request) {
  const form = emptyLearnerForm();
  const student = request?.student || {};
  for (const key of Object.keys(form)) {
    if (key === 'enrollType' || CONTACT_FIELDS.includes(key)) continue;
    if (typeof student[key] === 'string') form[key] = student[key];
  }
  form.enrollType = ENROLL_TYPES.includes(request?.enrollType) ? request.enrollType : 'new';
  return form;
}

export const STATUS_LABEL = {
  pending: S.learnerStatusPending, approved: S.learnerStatusApproved, rejected: S.learnerStatusRejected, withdrawn: S.learnerStatusWithdrawn,
};
export const pendingRequests = (requests) => (requests || []).filter((r) => r.status === 'pending');
export const pendingRemovalIds = (requests) => new Set(pendingRequests(requests).filter((r) => r.kind === 'remove').map((r) => r.studentId));
export const removalFor = (requests, studentId) => pendingRequests(requests).find((r) => r.kind === 'remove' && r.studentId === studentId) || null;

export const requestTitle = (request) => `${request.kind === 'add' ? S.learnerAddVerb : S.learnerRemoveVerb} ${nameCase(request.displayName)}`;
export const requestDetail = (request) => (request.kind === 'remove' ? `${reasonLabel(request.reasonCode)} · ${request.note}` : `LRN ${request.lrn}`);
