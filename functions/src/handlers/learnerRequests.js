// Adviser requests to add or remove a learner, decided in SIMS (spec 2026-10-22).
// Advisers file from the Parent App; an Administrator, or whoever covers the grade, decides. Every
// call is a schoolCall, so authority comes from loadSchoolActor: an administrator, a Curriculum
// Adviser assignment or a SIMS coordinator scope. Nothing here is readable by clients directly.
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { loadSchoolActor, inboxRef } from './schoolAccess.js';
import { reviewGrades } from '../../shared/schoolAccess.js';
import { manilaDate } from '../../shared/dates.js';
import {
  MAX_PENDING_PER_ADVISER, NOTE_MAX, REMOVAL_REASONS, addKey, canDecideLearnerRequest, cleanText, coversGrade, isSectionAdviser,
  reasonLabel, removeKey, validateEnrollType, validateLearnerFields, validateRemoval,
} from '../../shared/learnerRequests.js';
import { fullName } from '../lib/format.js';
import { contactCleared, pendingLearnerRequests, withdrawLearnerRequests } from '../lib/learnerRequestCleanup.js';

const fail = (code, message) => { throw new CallableError(code, message); };
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const cursorId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 1500 && !value.includes('/');
const millis = (value) => (value?.toMillis ? value.toMillis() : null);
// The shared validator turns anything into text (an object becomes "[object Object]", a number is
// accepted), so a filing is checked here first: only strings count as text, and null or undefined
// mean "not filled in", which the validator then reports field by field.
const NOT_TEXT = 'Check the form and try again.';
const isTextOrMissing = (value) => value === undefined || value === null || typeof value === 'string';
const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};
const clock = (deps) => (deps.now || (() => new Date()))();
const requestsOf = (db) => db.collection('learner_change_requests');
const classLabel = (section) => `Grade ${section.gradeLevel} · ${section.name || section.sectionName || section.id}`;
const TOO_MANY = () => 'Too many learner requests. Try again in a little while.';

const REQUEST_LIMIT = 200; // pending requests read per school year, filtered in code
const DECIDED_PAGE = 50;
const ADVISER_LIST = 50;
// Matches DOCS_DEFAULT in src/data/students.js: no paperwork on file yet.
const NEW_LEARNER_DOCUMENTS = { form137: false, birthCert: false, goodMoral: false, form138: false };
const STUDENT_FIELDS = ['lrn', 'lastName', 'firstName', 'middleName', 'extName', 'sex', 'birthdate', 'address',
  'guardianName', 'guardianRelationship', 'guardianContact', 'contactNumber'];
const scopeFor = (gradeLevel, schoolYear) => ({ gradeLevel, scopeSchoolYear: schoolYear });
const NO_SCOPE = { gradeLevel: null, scopeSchoolYear: null };

// School access audit rows use targetType 'school_assignment', which its History tab lists; learner
// requests have their own so they never show there.
const auditRow = (actor, action, targetId, details) => ({ action, actorType: 'staff', actorUid: actor.email,
  targetType: 'learner_request', targetId, details, at: FieldValue.serverTimestamp() });

function requireAdviser(actor, sectionId) {
  if (actor.ended) fail('failed-precondition', 'This school year has ended.');
  if (!isSectionAdviser(actor, sectionId)) fail('permission-denied', "Only this class's adviser can send learner requests.");
}

async function sectionOf(deps, tx, sectionId, actor) {
  const snap = await tx.get(deps.db.doc(`sections/${sectionId}`));
  const section = snap.exists ? { ...snap.data(), id: snap.id } : null;
  if (!section || section.schoolYear !== actor.schoolYear || !Number.isInteger(section.gradeLevel) || section.gradeLevel < 7 || section.gradeLevel > 12) {
    fail('failed-precondition', 'This section is unavailable for the current school year.');
  }
  return section;
}

const filing = (actor, deps, section, extra) => ({
  status: 'pending', schoolYear: section.schoolYear, sectionId: section.id, gradeLevel: section.gradeLevel, sectionName: section.name || '',
  requestedByUid: deps.uid, requestedByEmail: actor.email, requestedByName: actor.displayName, createdAt: FieldValue.serverTimestamp(), ...extra,
});

export async function requestLearnerAdd(deps, input) {
  if (!identifier(input?.sectionId)) fail('invalid-argument', 'Choose a class.');
  if (!isPlainObject(input.student) || !Object.values(input.student).every(isTextOrMissing) || !isTextOrMissing(input.enrollType)) {
    fail('invalid-argument', NOT_TEXT);
  }
  const fields = validateLearnerFields(input.student, { today: manilaDate(clock(deps)) });
  if (!fields.ok) fail('invalid-argument', Object.values(fields.errors)[0]);
  const type = validateEnrollType(input.enrollType);
  if (!type.ok) fail('invalid-argument', type.error);
  const student = fields.value;
  await enforceRateLimit(deps.db, deps.uid, 'learnerRequest', LIMITS.learnerRequest, clock(deps).getTime(), TOO_MANY);
  return deps.db.runTransaction(async (tx) => {
    const actor = await loadSchoolActor(deps, tx);
    requireAdviser(actor, input.sectionId);
    const section = await sectionOf(deps, tx, input.sectionId, actor);
    const key = addKey(section.id, student.lrn);
    const [same, mine, matches] = await Promise.all([
      tx.get(requestsOf(deps.db).where('dedupeKey', '==', key).where('status', '==', 'pending').limit(1)),
      tx.get(pendingLearnerRequests(deps.db, deps.uid)),
      tx.get(deps.db.collection('students').where('lrn', '==', student.lrn).limit(2)),
    ]);
    // A second tap, or a second device, finds the request already waiting.
    if (same.size) return { id: same.docs[0].id, status: 'pending' };
    if (matches.size === 1) {
      const enrollment = (await tx.get(deps.db.doc(`enrollments/${matches.docs[0].id}_${section.schoolYear}`))).data();
      if (enrollment?.status === 'enrolled' && enrollment.sectionId === section.id) fail('already-exists', 'This LRN is already in your class.');
    }
    if (mine.size >= MAX_PENDING_PER_ADVISER) fail('resource-exhausted', 'Wait for your pending requests to be decided.');
    const ref = requestsOf(deps.db).doc();
    tx.set(ref, filing(actor, deps, section, { kind: 'add', dedupeKey: key, student, enrollType: type.value, displayName: fullName(student) }));
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'learner.addRequested', ref.id,
      { sectionId: section.id, gradeLevel: section.gradeLevel, lrn: student.lrn, name: fullName(student) }));
    return { id: ref.id, status: 'pending' };
  });
}

export async function requestLearnerRemoval(deps, input) {
  if (!identifier(input?.sectionId) || !identifier(input?.studentId)) fail('invalid-argument', 'Choose a learner.');
  if (!isTextOrMissing(input.note) || !isTextOrMissing(input.reasonCode)) fail('invalid-argument', NOT_TEXT);
  const removal = validateRemoval(input);
  if (!removal.ok) fail('invalid-argument', Object.values(removal.errors)[0]);
  await enforceRateLimit(deps.db, deps.uid, 'learnerRequest', LIMITS.learnerRequest, clock(deps).getTime(), TOO_MANY);
  return deps.db.runTransaction(async (tx) => {
    const actor = await loadSchoolActor(deps, tx);
    requireAdviser(actor, input.sectionId);
    const section = await sectionOf(deps, tx, input.sectionId, actor);
    const key = removeKey(section.id, input.studentId);
    const [same, mine, enrollment, student] = await Promise.all([
      tx.get(requestsOf(deps.db).where('dedupeKey', '==', key).where('status', '==', 'pending').limit(1)),
      tx.get(pendingLearnerRequests(deps.db, deps.uid)),
      tx.get(deps.db.doc(`enrollments/${input.studentId}_${section.schoolYear}`)),
      tx.get(deps.db.doc(`students/${input.studentId}`)),
    ]);
    if (!student.exists || enrollment.data()?.status !== 'enrolled' || enrollment.data().sectionId !== section.id) {
      fail('permission-denied', 'Learner is not enrolled in this section.');
    }
    if (same.size) return { id: same.docs[0].id, status: 'pending' };
    if (mine.size >= MAX_PENDING_PER_ADVISER) fail('resource-exhausted', 'Wait for your pending requests to be decided.');
    const name = fullName(student.data());
    const ref = requestsOf(deps.db).doc();
    tx.set(ref, filing(actor, deps, section, { kind: 'remove', dedupeKey: key, studentId: input.studentId, lrn: student.data().lrn || '',
      displayName: name, reasonCode: removal.value.reasonCode, note: removal.value.note }));
    // Audit rows carry the reason code only; the free-text note stays on the request.
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'learner.removalRequested', ref.id,
      { sectionId: section.id, gradeLevel: section.gradeLevel, lrn: student.data().lrn || '', name, reasonCode: removal.value.reasonCode }));
    return { id: ref.id, status: 'pending' };
  });
}

export async function withdrawLearnerRequest(deps, input) {
  if (!identifier(input?.requestId)) fail('invalid-argument', 'Choose a request.');
  const ref = requestsOf(deps.db).doc(input.requestId);
  return deps.db.runTransaction(async (tx) => {
    const actor = await loadSchoolActor(deps, tx);
    const snap = await tx.get(ref);
    const request = snap.data();
    if (!request || request.requestedByUid !== deps.uid) fail('not-found', 'Request not found.');
    if (request.status !== 'pending') fail('failed-precondition', 'This request was already decided.');
    withdrawLearnerRequests(tx, [snap], 'Withdrawn by the adviser');
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'learner.requestWithdrawn', ref.id,
      { sectionId: request.sectionId, gradeLevel: request.gradeLevel, lrn: request.kind === 'add' ? request.student?.lrn || '' : request.lrn || '', name: request.displayName || '' }));
    return { ok: true };
  });
}

const adviserRow = (snap) => {
  const r = snap.data();
  return {
    id: snap.id, kind: r.kind, status: r.status, displayName: r.displayName || '',
    lrn: r.kind === 'add' ? r.student?.lrn || '' : r.lrn || '', studentId: r.studentId || '', enrollType: r.enrollType || '',
    reasonCode: r.reasonCode || '', note: r.note || '', decisionReason: r.status === 'rejected' ? r.decisionReason || '' : '',
    createdAt: millis(r.createdAt), decidedAt: millis(r.decidedAt) ?? millis(r.withdrawnAt),
    // Only a rejected add is sent again, so only it hands the form back.
    student: r.kind === 'add' && r.status === 'rejected' ? r.student : undefined,
  };
};

export async function getLearnerRequests(deps, input) {
  if (!identifier(input?.sectionId)) fail('invalid-argument', 'Choose a class.');
  const actor = await loadSchoolActor(deps);
  requireAdviser(actor, input.sectionId);
  const snap = await requestsOf(deps.db).where('requestedByUid', '==', deps.uid).where('sectionId', '==', input.sectionId)
    .orderBy('createdAt', 'desc').limit(ADVISER_LIST).get();
  return { requests: snap.docs.map(adviserRow) };
}
