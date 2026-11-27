// Adviser requests for temporary ID passes (spec 2026-11-27 requests). Advisers ask from the Parent
// App (school calls); administrators, grade level coordinators and logistic operators prepare, print
// or decline them in SIMS (staff calls). temp_pass_requests is closed to clients; only this file writes it.
import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { loadSchoolActor, inboxRef } from './schoolAccess.js';
import { currentYear } from './advisorySlips.js';
import { issueInTransaction } from './tempPasses.js';
import { isSectionAdviser } from '../../shared/learnerRequests.js';
import { canManagePasses, passGrades } from '../../shared/tempPass.js';
import {
  DECLINE_REASON_MAX, MAX_PENDING_PASS_REQUESTS, PASS_NOTE_MAX, PASS_REQUEST_REASONS, canPrintGrade, cleanPassText, declinedNotice,
  isActivePassFor, passRequestBlocker, readyNotice, reasonError,
} from '../../shared/tempPassRequests.js';
import { fullName } from '../lib/format.js';

const fail = (code, message) => { throw new CallableError(code, message); };
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const millis = (value) => (value?.toMillis ? value.toMillis() : null);
const clock = (deps) => (deps.now || (() => new Date()))();
const requestsOf = (db) => db.collection('temp_pass_requests');
const auditRow = (actorEmail, action, targetId, details) => ({ action, actorType: 'staff', actorUid: actorEmail,
  targetType: 'temp_pass_request', targetId, details, at: FieldValue.serverTimestamp() });
const audit = (db, tx, ...row) => tx.set(db.collection('audit_log').doc(), auditRow(...row));

const FULL = `You already have ${MAX_PENDING_PASS_REQUESTS} requests waiting. Wait for some to be printed.`;
const DENIED = 'Temporary passes are for administrators, grade level coordinators and logistic operators.';
const LIST_STATUSES = ['pending', 'printed', 'declined'];
const ADVISER_LIST = 50;
const PRINTER_LIST = 200;
const MAX_BATCH = 200;
const READ_BATCH = 100;

// Server-only documents that serialize request filings. Every filing transaction reads and then writes
// the adviser's lock and the learner's lock, so two filings by one adviser, or two for one learner, cannot
// both commit: whichever commits second must have read the lock after the first one's commit (otherwise
// it is aborted and retried). The waiting-request queries run after the lock reads, so in the attempt that
// commits they always see every earlier filing. That keeps the 40-pending limit and the one waiting request
// per learner exact under concurrent calls. The queries run outside the transaction on purpose: the locks
// already give them the right snapshot, and the Firestore emulator fails transactional queries under
// contention with an error the SDK does not retry (production returns ABORTED).
// Lock documents are intentionally permanent: they hold no state, so there is nothing to clean up.
const lockRef = (db, key) => db.doc(`temp_pass_request_locks/${key}`);
// The learner's waiting request for this school year (equality filters only: no composite index).
const learnerPending = (db, studentId, schoolYear) => requestsOf(db).where('studentId', '==', studentId)
  .where('status', '==', 'pending').where('schoolYear', '==', schoolYear).limit(1);
// The adviser's waiting requests this school year; ids only, one past the limit is enough to know it is full.
const adviserPending = (db, uid, schoolYear) => requestsOf(db).where('requestedByUid', '==', uid)
  .where('status', '==', 'pending').where('schoolYear', '==', schoolYear).select().limit(MAX_PENDING_PASS_REQUESTS + 1);

// A fulfilled request whose code is still the learner's live pass: a sheet with that code exists (for a
// Lost request the old card is already dead), so it may only be marked printed. If the pass was revoked or
// replaced since, the request can be withdrawn or declined as before.
const isPrepared = (request, pass, student, schoolYear) => Boolean(request?.passCode)
  && isActivePassFor(pass, student, schoolYear) && pass.code === request.passCode;
// Reads the learner's pass and record inside the transaction (before any write).
async function preparedIn(db, tx, request, schoolYear) {
  if (!request.passCode || !identifier(request.studentId)) return false;
  const [pass, student] = await Promise.all([tx.get(db.doc(`temp_passes/${request.studentId}`)), tx.get(db.doc(`students/${request.studentId}`))]);
  return isPrepared(request, pass.data(), student.data(), schoolYear);
}

function requireAdviser(actor, sectionId) {
  if (actor.ended) fail('failed-precondition', 'This school year has ended.');
  if (!isSectionAdviser(actor, sectionId)) fail('permission-denied', "Only this class's adviser can request temporary passes.");
}

async function currentSection(db, sectionId, schoolYear) {
  const snap = await db.doc(`sections/${sectionId}`).get();
  const section = snap.data();
  if (!section || section.schoolYear !== schoolYear || !Number.isInteger(section.gradeLevel) || section.gradeLevel < 7 || section.gradeLevel > 12) {
    fail('failed-precondition', 'This section is unavailable for the current school year.');
  }
  return { ...section, id: snap.id };
}

function requestItems(input) {
  const items = input?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_PENDING_PASS_REQUESTS) fail('invalid-argument', 'Choose 1–40 learners.');
  if (!items.every((i) => isPlainObject(i) && identifier(i.studentId) && PASS_REQUEST_REASONS.includes(i.reason))) {
    fail('invalid-argument', 'Choose a learner and a reason for each request.');
  }
  if (new Set(items.map((i) => i.studentId)).size !== items.length) fail('invalid-argument', 'Choose each learner once.');
  return items.map(({ studentId, reason }) => ({ studentId, reason }));
}

export async function requestTempPasses(deps, input) {
  const { db, uid } = deps;
  if (!identifier(input?.sectionId)) fail('invalid-argument', 'Choose a class.');
  const actor = await loadSchoolActor(deps);
  requireAdviser(actor, input.sectionId);
  const items = requestItems(input);
  if (input.note !== undefined && input.note !== null && typeof input.note !== 'string') fail('invalid-argument', 'Check the note and try again.');
  const note = cleanPassText(input.note, PASS_NOTE_MAX);
  await enforceRateLimit(db, uid, 'tempPassRequest', LIMITS.tempPassRequest, clock(deps).getTime());
  const section = await currentSection(db, input.sectionId, actor.schoolYear);
  const { schoolYear } = actor;
  // The whole call is refused up front when it cannot fit; each filing re-checks under the adviser lock.
  if ((await adviserPending(db, uid, schoolYear).get()).size + items.length > MAX_PENDING_PASS_REQUESTS) fail('resource-exhausted', FULL);

  const created = []; const skipped = [];
  for (const { studentId, reason } of items) {
    const result = await db.runTransaction(async (tx) => {
      const adviserLock = lockRef(db, `adviser_${uid}`);
      const learnerLock = lockRef(db, `student_${studentId}`);
      // Every read first: both locks (before the waiting-request queries, see lockRef), the caller's
      // standing (re-read so a removed assignment conflicts), the learner's records and the waiting requests.
      await tx.get(adviserLock);
      await tx.get(learnerLock);
      const now = await loadSchoolActor(deps, tx);
      const [student, enrollment, pass, waiting, mine] = await Promise.all([
        tx.get(db.doc(`students/${studentId}`)), tx.get(db.doc(`enrollments/${studentId}_${schoolYear}`)), tx.get(db.doc(`temp_passes/${studentId}`)),
        learnerPending(db, studentId, schoolYear).get(), adviserPending(db, uid, schoolYear).get(),
      ]);
      if (now.schoolYear !== schoolYear) fail('failed-precondition', 'The school year changed. Try again.');
      requireAdviser(now, section.id);
      const blocker = passRequestBlocker({ student: student.data(), enrollment: enrollment.data(), sectionId: section.id, schoolYear, pendingRequest: !waiting.empty });
      if (blocker) return { skip: blocker };
      if (reasonError(reason, isActivePassFor(pass.data(), student.data(), schoolYear))) return { skip: 'reason' };
      if (mine.size >= MAX_PENDING_PASS_REQUESTS) fail('resource-exhausted', FULL);
      // Reads end here.
      const at = FieldValue.serverTimestamp();
      tx.set(adviserLock, { at });
      tx.set(learnerLock, { at });
      const ref = requestsOf(db).doc();
      tx.set(ref, { studentId, sectionId: section.id, sectionName: section.name || '', gradeLevel: section.gradeLevel, schoolYear, reason, note,
        status: 'pending', displayName: fullName(student.data()), requestedByUid: uid, requestedByName: actor.displayName,
        requestedByEmail: actor.email, createdAt: at });
      // The note stays on the request; the audit row carries no free text.
      audit(db, tx, actor.email, 'tempPassRequest.created', ref.id, { studentId, sectionId: section.id, gradeLevel: section.gradeLevel, reason });
      return { requestId: ref.id };
    });
    if (result.requestId) created.push({ requestId: result.requestId, studentId }); else skipped.push({ studentId, reason: result.skip });
  }
  return { created, skipped };
}

export async function withdrawTempPassRequest(deps, input) {
  const { db, uid } = deps;
  if (!identifier(input?.requestId)) fail('invalid-argument', 'Choose a request.');
  const ref = requestsOf(db).doc(input.requestId);
  return db.runTransaction(async (tx) => {
    const actor = await loadSchoolActor(deps, tx);
    const request = (await tx.get(ref)).data();
    if (!request || request.requestedByUid !== uid) fail('not-found', 'Request not found.');
    if (request.status !== 'pending') fail('failed-precondition', 'This request was already handled.');
    if (await preparedIn(db, tx, request, actor.schoolYear)) fail('failed-precondition', 'This pass is already being printed. Ask the ID office.');
    // Reads end here.
    tx.update(ref, { status: 'withdrawn', decidedAt: FieldValue.serverTimestamp() });
    audit(db, tx, actor.email, 'tempPassRequest.withdrawn', ref.id, { studentId: request.studentId, sectionId: request.sectionId, gradeLevel: request.gradeLevel });
    return { ok: true };
  });
}

// db.getAll in batches; returns the data of each document (undefined when missing), in order.
async function readAll(db, refs) {
  const out = [];
  for (let i = 0; i < refs.length; i += READ_BATCH) {
    const chunk = refs.slice(i, i + READ_BATCH);
    if (chunk.length) out.push(...(await db.getAll(...chunk)).map((s) => s.data()));
  }
  return out;
}

const byName = (a, b) => (a.lastName || '').localeCompare(b.lastName || '') || (a.firstName || '').localeCompare(b.firstName || '');

export async function getTempPassRequests(deps, input) {
  const { db, uid } = deps;
  if (!identifier(input?.sectionId)) fail('invalid-argument', 'Choose a class.');
  const actor = await loadSchoolActor(deps);
  requireAdviser(actor, input.sectionId);
  const { schoolYear } = actor;
  // Equality filters only, so neither query needs a composite index; the requests are sorted here.
  const [enrolled, mine] = await Promise.all([
    db.collection('enrollments').where('sectionId', '==', input.sectionId).where('schoolYear', '==', schoolYear).where('status', '==', 'enrolled').get(),
    requestsOf(db).where('requestedByUid', '==', uid).where('sectionId', '==', input.sectionId).where('schoolYear', '==', schoolYear).get(),
  ]);
  const rows = enrolled.docs.map((d) => d.data()).filter((e) => identifier(e.studentId));
  const ids = rows.map((e) => e.studentId);
  const [students, passes, waiting] = await Promise.all([
    readAll(db, ids.map((id) => db.doc(`students/${id}`))),
    readAll(db, ids.map((id) => db.doc(`temp_passes/${id}`))),
    Promise.all(ids.map((id) => learnerPending(db, id, schoolYear).get())),
  ]);
  const learners = rows.map((enrollment, i) => ({ studentId: ids[i], student: students[i], enrollment, pass: passes[i], pendingRequest: !waiting[i].empty }))
    .filter((l) => l.student)
    .sort((a, b) => byName(a.student, b.student))
    .map(({ studentId, student, enrollment, pass, pendingRequest }) => ({
      studentId, displayName: fullName(student), hasPhoto: !!student.photo?.path, hasActivePass: isActivePassFor(pass, student, schoolYear),
      blocker: passRequestBlocker({ student, enrollment, sectionId: input.sectionId, schoolYear, pendingRequest }),
    }));
  const latest = mine.docs
    .sort((a, b) => (millis(b.data().createdAt) ?? 0) - (millis(a.data().createdAt) ?? 0))
    .slice(0, ADVISER_LIST);
  // Only a waiting request with a code can be prepared; its learner's pass and record decide (see isPrepared).
  const preparedIds = [...new Set(latest.map((d) => d.data()).filter((r) => r.status === 'pending' && r.passCode && identifier(r.studentId))
    .map((r) => r.studentId))];
  const [preparedPasses, preparedStudents] = await Promise.all([
    readAll(db, preparedIds.map((id) => db.doc(`temp_passes/${id}`))),
    readAll(db, preparedIds.map((id) => db.doc(`students/${id}`))),
  ]);
  const passOf = new Map(preparedIds.map((id, i) => [id, [preparedPasses[i], preparedStudents[i]]]));
  const requests = latest.map((d) => {
    const r = d.data();
    const [pass, student] = passOf.get(r.studentId) || [];
    return { id: d.id, studentId: r.studentId || '', displayName: r.displayName || '', reason: r.reason || '', note: r.note || '', status: r.status,
      declineReason: r.status === 'declined' ? r.declineReason || '' : '', createdAt: millis(r.createdAt), decidedAt: millis(r.decidedAt),
      prepared: r.status === 'pending' && isPrepared(r, pass, student, schoolYear) };
  });
  return { learners, requests };
}

// ---- Printers: administrators, grade level coordinators (own grade) and logistic operators. ----

function requirePrinter(profile) {
  if (!canManagePasses(profile)) fail('permission-denied', DENIED);
}

function requestIds(input) {
  const ids = Array.isArray(input?.requestIds) ? [...new Set(input.requestIds)] : [];
  if (!ids.length || ids.length > MAX_BATCH || !ids.every(identifier)) fail('invalid-argument', 'Choose 1–200 requests.');
  return ids;
}

export async function listTempPassRequests(deps, input) {
  const { db, profile } = deps;
  requirePrinter(profile);
  const status = input?.status ?? 'pending';
  if (!LIST_STATUSES.includes(status)) fail('invalid-argument', 'Choose waiting, printed or declined requests.');
  const { schoolYear } = await currentYear(db);
  const grades = passGrades(profile);
  // Composite indexes: (status, schoolYear, createdAt) and (status, schoolYear, gradeLevel, createdAt), both directions.
  let query = requestsOf(db).where('status', '==', status).where('schoolYear', '==', schoolYear);
  if (grades !== null) query = query.where('gradeLevel', 'in', grades);
  // Waiting requests are a queue (oldest first); printed and declined ones are history (newest first).
  const snap = await query.orderBy('createdAt', status === 'pending' ? 'asc' : 'desc').limit(PRINTER_LIST + 1).get();
  // One more than the cap is read only to know whether the list was cut.
  const truncated = snap.size > PRINTER_LIST;
  const docs = snap.docs.slice(0, PRINTER_LIST).filter((d) => canPrintGrade(profile, d.data().gradeLevel));
  const ids = [...new Set(docs.map((d) => d.data().studentId).filter(identifier))];
  const [students, enrollments] = await Promise.all([
    readAll(db, ids.map((id) => db.doc(`students/${id}`))),
    status === 'pending' ? readAll(db, ids.map((id) => db.doc(`enrollments/${id}_${schoolYear}`))) : [],
  ]);
  const studentOf = new Map(ids.map((id, i) => [id, students[i]]));
  const enrollmentOf = new Map(ids.map((id, i) => [id, enrollments[i]]));
  const requests = docs.map((d) => {
    const r = d.data();
    const student = studentOf.get(r.studentId);
    return {
      id: d.id, studentId: r.studentId || '', displayName: r.displayName || '', lrn: student?.lrn || '', sectionId: r.sectionId || '',
      sectionName: r.sectionName || '', gradeLevel: r.gradeLevel, reason: r.reason || '', note: r.note || '', requestedByName: r.requestedByName || '',
      createdAt: millis(r.createdAt), status: r.status, hasPhoto: !!student?.photo?.path,
      // A waiting request that can no longer be met: SIMS suggests declining it (no trigger closes requests).
      blocker: status === 'pending'
        ? passRequestBlocker({ student, enrollment: enrollmentOf.get(r.studentId), sectionId: r.sectionId, schoolYear, pendingRequest: false })
        : null,
    };
  });
  return { requests, truncated };
}

export async function fulfilTempPassRequests(deps, input) {
  const { db, uid, email, profile } = deps;
  requirePrinter(profile);
  const ids = requestIds(input);
  await enforceRateLimit(db, uid, 'tempPass', LIMITS.tempPass, clock(deps).getTime());
  const { schoolYear, ended } = await currentYear(db);
  if (ended) fail('failed-precondition', `The ${schoolYear} school year has ended.`);
  const grades = passGrades(profile);
  const issued = []; const skipped = [];
  for (const requestId of ids) {
    const result = await db.runTransaction(async (tx) => {
      const ref = requestsOf(db).doc(requestId);
      const request = (await tx.get(ref)).data();
      const studentId = request?.studentId || '';
      if (!request) return { studentId: '', skip: 'not-found' };
      // Scope first: another grade's request reveals neither its learner nor its school year.
      if (!canPrintGrade(profile, request.gradeLevel)) return { studentId: '', skip: 'out-of-scope' };
      if (request.schoolYear !== schoolYear || !identifier(studentId)) return { studentId, skip: 'not-found' };
      if (request.status !== 'pending') return { studentId, skip: 'not-pending' };
      // A Lost request replaces the code once. Preparing it again (a paper jam) keeps the replacement it
      // already produced, so the sheet just printed still works.
      const currentPass = (await tx.get(db.doc(`temp_passes/${studentId}`))).data();
      const newCode = request.reason === 'lost' && !(request.passCode && request.passCode === currentPass?.code);
      // Reads end inside issueInTransaction; only writes follow.
      const outcome = await issueInTransaction(db, tx, { studentId, schoolYear, grades, email, newCode });
      if (!outcome.code) return { studentId, skip: outcome.skip };
      tx.update(ref, { passCode: outcome.code });
      return { studentId, code: outcome.code };
    });
    if (result.code) issued.push({ requestId, studentId: result.studentId, code: result.code });
    else skipped.push({ requestId, studentId: result.studentId, reason: result.skip });
  }
  return { issued, skipped };
}

const notify = (db, tx, request, requestId, status, notice) => tx.set(inboxRef(db, request.requestedByUid, `tempPass:${requestId}`),
  { type: 'temp_pass_request', requestId, status, ...notice, createdAt: FieldValue.serverTimestamp() });

export async function markTempPassRequestsPrinted(deps, input) {
  const { db, email, profile } = deps;
  requirePrinter(profile);
  const ids = requestIds(input);
  const { schoolYear } = await currentYear(db);
  let printed = 0;
  for (const requestId of ids) {
    const done = await db.runTransaction(async (tx) => {
      const ref = requestsOf(db).doc(requestId);
      const request = (await tx.get(ref)).data();
      if (!request || request.schoolYear !== schoolYear || !identifier(request.studentId)) return false;
      if (!canPrintGrade(profile, request.gradeLevel) || request.status !== 'pending' || !request.passCode) return false;
      const [pass, student, settings] = await Promise.all([
        tx.get(db.doc(`temp_passes/${request.studentId}`)), tx.get(db.doc(`students/${request.studentId}`)), tx.get(db.doc('settings/app')),
      ]);
      // Only the sheet that was prepared counts: a pass replaced or ended since then must be prepared again.
      if (!isActivePassFor(pass.data(), student.data(), schoolYear) || pass.data().code !== request.passCode) return false;
      // Reads end here.
      tx.update(ref, { status: 'printed', decidedBy: email, decidedAt: FieldValue.serverTimestamp() });
      notify(db, tx, request, requestId, 'printed', readyNotice({ name: request.displayName || '', place: settings.data()?.passPickupPlace }));
      audit(db, tx, email, 'tempPassRequest.printed', requestId, { studentId: request.studentId, sectionId: request.sectionId, gradeLevel: request.gradeLevel });
      return true;
    });
    if (done) printed += 1;
  }
  return { printed };
}

export async function declineTempPassRequest(deps, input) {
  const { db, email, profile } = deps;
  requirePrinter(profile);
  if (!identifier(input?.requestId)) fail('invalid-argument', 'Choose a request.');
  const reason = typeof input.reason === 'string' ? cleanPassText(input.reason, DECLINE_REASON_MAX) : '';
  if (!reason) fail('invalid-argument', `Tell the adviser why. Enter a reason of 1–${DECLINE_REASON_MAX} characters.`);
  const ref = requestsOf(db).doc(input.requestId);
  const { schoolYear } = await currentYear(db);
  return db.runTransaction(async (tx) => {
    const request = (await tx.get(ref)).data();
    // Another grade's request is reported exactly like a missing one.
    if (!request || !canPrintGrade(profile, request.gradeLevel)) fail('not-found', 'Request not found.');
    if (request.status !== 'pending') fail('failed-precondition', 'This request was already handled.');
    if (await preparedIn(db, tx, request, schoolYear)) fail('failed-precondition', 'This pass is already prepared. Mark it printed instead.');
    // Reads end here.
    tx.update(ref, { status: 'declined', declineReason: reason, decidedBy: email, decidedAt: FieldValue.serverTimestamp() });
    notify(db, tx, request, ref.id, 'declined', declinedNotice({ name: request.displayName || '', reason }));
    // The reason reaches the adviser and stays on the request; the audit row carries no free text.
    audit(db, tx, email, 'tempPassRequest.declined', ref.id, { studentId: request.studentId, sectionId: request.sectionId, gradeLevel: request.gradeLevel });
    return { ok: true };
  });
}
