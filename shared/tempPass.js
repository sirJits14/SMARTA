// Temporary ID Pass rules shared by SIMS and Functions (spec 2026-11-27).
// The kiosk repository keeps its own copy of the code pattern: keep in step.
import { roleOf, scopedGrades } from './staffRoles.js';

export const PASS_PREFIX = 'BNHS-TP-';
export const PASS_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const PASS_LENGTH = 10;
const PATTERN = new RegExp(`^${PASS_PREFIX}[${PASS_ALPHABET}]{${PASS_LENGTH}}$`);

export const isTempPassCode = (text) => typeof text === 'string' && PATTERN.test(text);

// randomInt(max) returns a uniform integer in [0, max).
export const makePassCode = (randomInt) =>
  PASS_PREFIX + Array.from({ length: PASS_LENGTH }, () => PASS_ALPHABET[randomInt(PASS_ALPHABET.length)]).join('');

// null = every grade (administrator, logistic operator); [] = no pass or photo management.
// Grade level coordinators get their own grade; academic coordinators get none (spec 2026-11-27 requests).
export function passGrades(profile) {
  const role = roleOf(profile);
  if (role === 'admin' || role === 'logistic') return null;
  return role === 'glc' ? scopedGrades(profile) : [];
}
export function canManagePasses(profile) {
  const grades = passGrades(profile);
  return grades === null || grades.length > 0;
}

// Same test as the official card queue: printed, and for the present LRN.
export const isOfficialCardPrinted = (student) => !!student?.idCard?.printedAt && student.idCard.lrn === student.lrn;

export function tempPassBlocker({ student, enrollment, section, schoolYear }) {
  if (!student) return 'not-found';
  if (!enrollment || enrollment.status !== 'enrolled' || enrollment.schoolYear !== schoolYear
      || !section || section.schoolYear !== schoolYear) return 'not-enrolled';
  if ((student.status ?? 'active') !== 'active') return 'inactive';
  if (!String(student.lrn ?? '').trim()) return 'no-lrn';
  if (isOfficialCardPrinted(student)) return 'official-printed';
  return null;
}
