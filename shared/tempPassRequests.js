// Adviser requests for temporary ID passes (spec 2026-11-27 requests). Functions, SIMS and the
// Parent App import this file so they agree on who can be requested and how notices read.
import { isOfficialCardPrinted, passGrades } from './tempPass.js';

export const PASS_REQUEST_REASONS = ['new', 'lost', 'damaged'];
export const REPLACE_REASONS = ['lost', 'damaged'];
export const PASS_REQUEST_STATUSES = ['pending', 'printed', 'declined', 'withdrawn'];
export const MAX_PENDING_PASS_REQUESTS = 40;
export const PASS_NOTE_MAX = 500;
export const DECLINE_REASON_MAX = 300;

// True only for this school year's active pass for the learner's current LRN.
export const isActivePassFor = (pass, student, schoolYear) =>
  pass?.status === 'active' && pass.schoolYear === schoolYear && pass.lrn === student?.lrn;

// Returns the reason a learner cannot be requested, or null when a request is allowed.
export function passRequestBlocker({ student, enrollment, sectionId, schoolYear, pendingRequest }) {
  if (!student || !enrollment || enrollment.status !== 'enrolled' || enrollment.sectionId !== sectionId
      || enrollment.schoolYear !== schoolYear) return 'not-in-class';
  if ((student.status ?? 'active') !== 'active') return 'inactive';
  if (!String(student.lrn ?? '').trim()) return 'no-lrn';
  if (isOfficialCardPrinted(student)) return 'official-printed';
  if (pendingRequest) return 'already-requested';
  return null;
}

// Empty string when the reason fits whether the learner already holds an active pass.
export function reasonError(reason, hasActivePass) {
  if (!PASS_REQUEST_REASONS.includes(reason)) return 'Choose a reason for this request.';
  if (hasActivePass && reason === 'new') return 'This learner already has a temporary pass. Choose Lost or Damaged.';
  if (!hasActivePass && reason !== 'new') return 'This learner has no temporary pass to replace.';
  return '';
}

// Strips control and invisible format characters, collapses whitespace, and limits length.
export const cleanPassText = (value, max) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/[\u0080-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

export function readyNotice({ name, place }) {
  const where = String(place ?? '').trim();
  return {
    title: 'Temporary pass ready',
    body: where
      ? `Temporary pass for ${name} is ready for pick-up at ${where}.`
      : `Temporary pass for ${name} is ready for pick-up.`,
  };
}

export const declinedNotice = ({ name, reason }) => ({
  title: 'Temporary pass request declined',
  body: `${name}: ${reason}`,
});

// Printers see every grade (logistic, administrator) or their own grade (glc).
export function canPrintGrade(profile, grade) {
  const grades = passGrades(profile);
  return grades === null || grades.includes(Number(grade));
}
