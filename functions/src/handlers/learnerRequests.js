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
  CONTACT_FIELDS, MAX_PENDING_PER_ADVISER, NOTE_MAX, REMOVAL_REASONS, addKey, canDecideLearnerRequest, cleanText, coversGrade, isSectionAdviser,
  reasonLabel, removeKey, validateEnrollType, validateLearnerFields, validateRemoval,
} from '../../shared/learnerRequests.js';
import { fullName } from '../lib/format.js';
import { contactCleared, pendingLearnerRequests, withdrawLearnerRequests } from '../lib/learnerRequestCleanup.js';

const fail = (code, message) => { throw new CallableError(code, message); };
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const cursorId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 1500 && !value.includes('/');
const millis = (value) => (value?.toMillis ? value.toMillis() : null);
// A page cursor must name a time Firestore accepts: from 1970 to the end of the year 9999.
const MAX_CURSOR_MS = 253402300799999;
// A decided or withdrawn request has its address and phone numbers cleared when it is decided
// (Task 4). Reads still drop them, so a stored document that kept them cannot leak them.
const withoutContact = (student) => (student && typeof student === 'object'
  ? Object.fromEntries(Object.entries(student).filter(([field]) => !CONTACT_FIELDS.includes(field)))
  : student);
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
    // Only a rejected add is sent again, so only it hands the form back, and never its contact details.
    student: r.kind === 'add' && r.status === 'rejected' ? withoutContact(r.student) : undefined,
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

// What a reviewer needs to know about an LRN that is already in SIMS. A learner counts as inside an
// approver's grades only through a current enrolled enrollment (the rule scopeRoster applies), so an
// Unassigned, Dropped or Transferred learner, or one in another grade, is for Administrators.
async function existingLearner(deps, actor, request) {
  const found = await deps.db.collection('students').where('lrn', '==', request.student?.lrn || '').limit(2).get();
  if (found.empty) return null;
  if (found.size > 1) return { exists: true, ambiguous: true, needsAdmin: !actor.isAdmin };
  const student = found.docs[0];
  const enrollment = (await deps.db.doc(`enrollments/${student.id}_${request.schoolYear}`).get()).data();
  const enrolled = enrollment?.status === 'enrolled';
  const inScope = enrolled && coversGrade(actor, enrollment.gradeLevel);
  const flag = { exists: true, needsAdmin: !actor.isAdmin && !inScope, enrolledHere: enrolled && enrollment.sectionId === request.sectionId };
  if (actor.isAdmin || inScope) {
    const section = enrolled ? (await deps.db.doc(`sections/${enrollment.sectionId}`).get()).data() : null;
    Object.assign(flag, { displayName: fullName(student.data()), learnerStatus: student.data().status || 'active',
      currentGrade: enrolled ? enrollment.gradeLevel : null, currentSection: section?.name || '' });
  }
  return flag;
}

const reviewerRow = (snap, flag, actor) => {
  const r = snap.data();
  const row = {
    id: snap.id, kind: r.kind, status: r.status, schoolYear: r.schoolYear, gradeLevel: r.gradeLevel, sectionId: r.sectionId,
    sectionName: r.sectionName || '', requestedByName: r.requestedByName || r.requestedByEmail || '', requestedByEmail: r.requestedByEmail || '',
    displayName: r.displayName || '', lrn: r.kind === 'add' ? r.student?.lrn || '' : r.lrn || '', createdAt: millis(r.createdAt),
    decidedAt: millis(r.decidedAt), decidedByName: r.decidedByName || '', decisionReason: r.decisionReason || '',
  };
  // Reviewers need the address and phone numbers to decide, so only a pending add returns the whole form.
  if (r.kind === 'add') Object.assign(row, { student: r.status === 'pending' ? r.student : withoutContact(r.student), enrollType: r.enrollType, existing: flag || null });
  else Object.assign(row, { studentId: r.studentId, reasonCode: r.reasonCode, note: r.note });
  row.decidable = r.status === 'pending' && (actor.isAdmin || !flag?.needsAdmin);
  return row;
};

async function waitingRows(deps, actor) {
  if (actor.ended || (!actor.isAdmin && !reviewGrades(actor).length)) return [];
  const snap = await requestsOf(deps.db).where('status', '==', 'pending').where('schoolYear', '==', actor.schoolYear)
    .orderBy('createdAt', 'asc').limit(REQUEST_LIMIT).get();
  const mine = snap.docs.filter((d) => canDecideLearnerRequest(actor, d.data()));
  return Promise.all(mine.map(async (d) => reviewerRow(d, d.data().kind === 'add' ? await existingLearner(deps, actor, d.data()) : null, actor)));
}

export async function listLearnerRequests(deps, input) {
  const view = input?.view ?? 'waiting';
  if (!['waiting', 'decided'].includes(view)) fail('invalid-argument', 'Choose waiting or decided requests.');
  const cursor = input?.cursor ?? null;
  if (cursor != null && !(typeof cursor === 'object' && !Array.isArray(cursor) && Number.isSafeInteger(cursor.ms)
    && cursor.ms >= 0 && cursor.ms <= MAX_CURSOR_MS && cursorId(cursor.id))) fail('invalid-argument', 'Choose a valid page.');
  const actor = await loadSchoolActor(deps);
  const base = { schoolYear: actor.schoolYear, ended: actor.ended };
  if (view === 'waiting') return { ...base, requests: await waitingRows(deps, actor), nextCursor: null };
  const grades = [...new Set(reviewGrades(actor))];
  if (!actor.isAdmin && !grades.length) return { ...base, requests: [], nextCursor: null };
  let query = requestsOf(deps.db).where('schoolYear', '==', actor.schoolYear);
  if (!actor.isAdmin) query = query.where('gradeLevel', 'in', grades);
  // Withdrawn requests have no decidedAt, so only approved and rejected ones appear here.
  query = query.orderBy('decidedAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (cursor) query = query.startAfter(Timestamp.fromMillis(cursor.ms), cursor.id);
  // One row more than a page: the extra row proves there is a next page, so a full last page gets no "Load more".
  const snap = await query.limit(DECIDED_PAGE + 1).get();
  const page = snap.docs.slice(0, DECIDED_PAGE);
  const requests = page.map((d) => reviewerRow(d, null, actor));
  const last = page[page.length - 1];
  return { ...base, requests, nextCursor: snap.size > DECIDED_PAGE ? { ms: millis(last.data().decidedAt), id: last.id } : null };
}

export async function getLearnerRequestCount(deps) {
  const actor = await loadSchoolActor(deps);
  const rows = await waitingRows(deps, actor);
  return { count: rows.filter((r) => r.decidable).length };
}

const OUTCOME_TEXT = { add: 'Learner added', remove: 'Learner removed' };

export async function resolveLearnerRequest(deps, input) {
  if (!identifier(input?.requestId) || typeof input.approve !== 'boolean') fail('invalid-argument', 'Choose a request and a decision.');
  const text = typeof input.reason === 'string' ? cleanText(input.reason) : '';
  if (text.length > NOTE_MAX) fail('invalid-argument', `Keep the reason within ${NOTE_MAX} characters.`);
  if (!input.approve && !text) fail('invalid-argument', 'Tell the adviser why. Enter a reason of 1–500 characters.');
  const approve = input.approve;
  const reason = text || 'Approved';
  const db = deps.db;
  const ref = requestsOf(db).doc(input.requestId);
  return db.runTransaction(async (tx) => {
    const actor = await loadSchoolActor(deps, tx);
    if (actor.ended) fail('failed-precondition', 'This school year has ended.');
    const snap = await tx.get(ref);
    const request = snap.data();
    if (!request) fail('not-found', 'Request not found.');
    if (request.status !== 'pending') fail('failed-precondition', 'Already decided.');
    if (!canDecideLearnerRequest(actor, request)) fail('permission-denied', 'You cannot review this request.');
    const decision = { status: approve ? 'approved' : 'rejected', decidedAt: FieldValue.serverTimestamp(), decidedByUid: actor.uid,
      decidedByEmail: actor.email, decidedByName: actor.displayName, decisionReason: reason, ...contactCleared(request) };
    const name = request.displayName || '';
    let note;
    let audit;

    // Audit rows never carry free text: the reasons and the removal note stay on the request document.
    if (!approve) {
      note = { title: 'Request not approved', body: `${request.kind === 'add' ? 'Adding' : 'Removing'} ${name} was not approved. Reason: ${reason}`, rejected: true };
      audit = { action: 'learner.requestRejected', details: { kind: request.kind, lrn: request.kind === 'add' ? request.student.lrn : request.lrn, name,
        sectionId: request.sectionId, gradeLevel: request.gradeLevel } };
    } else {
      // Everything is read before the first write.
      const [sectionSnap, accountSnap, matches, enrollmentSnap, studentSnap] = await Promise.all([
        tx.get(db.doc(`sections/${request.sectionId}`)),
        tx.get(db.doc(`school_accounts/${request.requestedByUid}`)),
        request.kind === 'add' ? tx.get(db.collection('students').where('lrn', '==', request.student.lrn).limit(2)) : null,
        request.kind === 'remove' ? tx.get(db.doc(`enrollments/${request.studentId}_${request.schoolYear}`)) : null,
        request.kind === 'remove' ? tx.get(db.doc(`students/${request.studentId}`)) : null,
      ]);
      const section = sectionSnap.exists ? { ...sectionSnap.data(), id: sectionSnap.id } : null;
      if (!section || section.schoolYear !== request.schoolYear || section.gradeLevel !== request.gradeLevel) {
        fail('failed-precondition', 'This section changed. Reject this request and ask for a new one.');
      }
      if (!isSectionAdviser({ schoolYear: actor.schoolYear, assignments: accountSnap.data()?.assignments || [] }, request.sectionId)) {
        fail('failed-precondition', 'The adviser no longer holds this class. Reject this request.');
      }
      const today = manilaDate(clock(deps));
      const target = { gradeLevel: section.gradeLevel, sectionId: section.id, track: section.track || null, strand: section.strand || null };
      const where = classLabel(section);

      if (request.kind === 'add') {
        if (matches.size > 1) fail('failed-precondition', 'This LRN matches more than one learner. An administrator must fix the records first.');
        let mode = 'new';
        let previousSectionId = null;
        if (matches.empty) {
          const studentRef = db.collection('students').doc();
          tx.set(studentRef, { ...Object.fromEntries(STUDENT_FIELDS.map((field) => [field, request.student[field] ?? ''])),
            status: 'active', documents: { ...NEW_LEARNER_DOCUMENTS }, createdAt: today, ...scopeFor(section.gradeLevel, request.schoolYear) });
          tx.set(db.doc(`enrollments/${studentRef.id}_${request.schoolYear}`), { studentId: studentRef.id, schoolYear: request.schoolYear, ...target,
            type: request.enrollType, dateEnrolled: today, status: 'enrolled' });
        } else {
          const found = matches.docs[0];
          const enrollmentRef = db.doc(`enrollments/${found.id}_${request.schoolYear}`);
          const enrollment = (await tx.get(enrollmentRef)).data();
          const enrolled = enrollment?.status === 'enrolled';
          const existingName = fullName(found.data());
          if (enrolled && enrollment.sectionId === section.id) fail('already-exists', `${existingName} is already in this class. Reject this request.`);
          if (!actor.isAdmin && !(enrolled && coversGrade(actor, enrollment.gradeLevel))) fail('permission-denied', 'An administrator must approve this request.');
          if (enrolled) {
            // A move keeps the original enrollment date and type, as the SIMS learner form does.
            tx.update(enrollmentRef, target);
            if ((found.data().status ?? 'active') === 'active') tx.update(found.ref, scopeFor(section.gradeLevel, request.schoolYear));
            mode = 'moved';
            previousSectionId = enrollment.sectionId;
          } else {
            tx.update(found.ref, { status: 'active', ...scopeFor(section.gradeLevel, request.schoolYear) });
            tx.set(enrollmentRef, { studentId: found.id, schoolYear: request.schoolYear, ...target, type: request.enrollType, dateEnrolled: today, status: 'enrolled' });
            mode = 'enrolled';
          }
        }
        note = { title: OUTCOME_TEXT.add, body: `${name} was added to ${where}.` };
        audit = { action: 'learner.addApproved', details: { lrn: request.student.lrn, name, mode, sectionId: section.id, gradeLevel: section.gradeLevel, previousSectionId } };
      } else {
        const enrollment = enrollmentSnap.data();
        if (!studentSnap.exists || enrollment?.status !== 'enrolled' || enrollment.sectionId !== request.sectionId) {
          fail('failed-precondition', `${name} is no longer in this class. Reject this request.`);
        }
        const outcome = REMOVAL_REASONS[request.reasonCode];
        if (!outcome) fail('failed-precondition', 'This request has an unknown reason. Reject it and ask for a new one.');
        tx.update(enrollmentSnap.ref, { status: outcome.enrollment });
        tx.update(studentSnap.ref, { ...(outcome.learner ? { status: outcome.learner } : {}), ...NO_SCOPE });
        note = { title: OUTCOME_TEXT.remove, body: `${name} was removed from ${where}: ${reasonLabel(request.reasonCode)}.` };
        audit = { action: 'learner.removalApproved', details: { lrn: request.lrn, name, reasonCode: request.reasonCode, sectionId: section.id, gradeLevel: section.gradeLevel } };
      }
    }

    tx.update(ref, decision);
    tx.set(db.collection('audit_log').doc(), auditRow(actor, audit.action, ref.id, audit.details));
    tx.set(inboxRef(db, request.requestedByUid, `learner:${ref.id}`), { type: 'learner_request', requestId: ref.id, ...note, createdAt: FieldValue.serverTimestamp() });
    return { ok: true };
  });
}
