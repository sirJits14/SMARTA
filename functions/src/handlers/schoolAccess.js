import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { roleOf, scopedGrades } from '../../shared/staffRoles.js';
import { SCHOOL_ROLES, REQUESTABLE_ROLES, assignmentKey, canApproveRoleRequest, isDepedEmail } from '../../shared/schoolAccess.js';
import { enforceRateLimit } from '../callable.js';
import { groupLegacyAdvisers, sampleStudentIds } from '../lib/legacyAdvisers.js';

const fail = (code, message) => { throw new CallableError(code, message); };
const read = (db, reader, ref) => reader === db ? ref.get() : reader.get(ref);
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const emailValue = value => typeof value === 'string' && /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(value);
const reasonValue = value => {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (!reason || reason.length > 500) fail('invalid-argument', 'Enter a reason of 1–500 characters.');
  return reason;
};
const fingerprint = value => createHash('sha256').update(value).digest('hex');
const requestKey = (uid, assignment) => fingerprint(JSON.stringify([uid, assignmentKey(assignment)]));
// Audit rows carry the teacher's name so History reads without another lookup.
const teacherOf = person => ({ teacherEmail: (person?.email || '').toLowerCase(), teacherName: person?.displayName || person?.email || '' });
const millis = value => (value?.toMillis ? value.toMillis() : null);
// Approvals may omit a reason; rejections must tell the teacher why.
const decisionReason = (approve, value) => (approve && !(typeof value === 'string' && value.trim()) ? 'Approved' : reasonValue(value));
const inboxRef = (db, uid, key) => db.doc(`guardians/${uid}/inbox/school_${fingerprint(key).slice(0, 32)}`);
const lockRef = (db, a) => a.role === 'adviser' ? db.doc(`school_adviser_locks/${a.schoolYear}_${a.sectionId}`) : null;
const auditRow = (actor, action, targetId, details) => ({ action, actorType: 'staff', actorUid: actor.email,
  targetType: 'school_assignment', targetId, details, at: FieldValue.serverTimestamp() });

// Callables validate Auth/App Check first. Transactional callers re-read scope
// here so a concurrent assignment removal conflicts with their write.
export async function loadSchoolActor(deps, reader = deps.db) {
  const { db, uid, email } = deps;
  if (!id(uid) || !emailValue(email)) fail('unauthenticated', 'Sign in with your verified account.');
  const [settings, account, staff] = await Promise.all([
    read(db, reader, db.doc('settings/app')),
    read(db, reader, db.doc(`school_accounts/${uid}`)),
    read(db, reader, db.doc(`users/${email.toLowerCase()}`)),
  ]);
  const schoolYear = settings.data()?.currentSchoolYear;
  if (!/^\d{4}-\d{4}$/.test(schoolYear || '')) fail('failed-precondition', 'The school must configure the current school year.');
  const ended = (await read(db, reader, db.doc(`school_years/${schoolYear}`))).data()?.endedAt;
  const profile = staff.data();
  const bound = profile && (!profile.uid || profile.uid === uid);
  if (bound && (profile.disabled === true || profile.mustChangePassword === true
    || !Number.isSafeInteger(profile.sessionValidAfter ?? 0) || (profile.sessionValidAfter ?? 0) < 0
    || (profile.sessionValidAfter > 0 && (!Number.isSafeInteger(deps.authTime) || deps.authTime < profile.sessionValidAfter)))) {
    fail('permission-denied', 'Your staff session is restricted. Sign in to SIMS again.');
  }
  const assignments = ended || account.data()?.disabled ? [] : (account.data()?.assignments || [])
    .filter(a => a.schoolYear === schoolYear && SCHOOL_ROLES.includes(a.role));
  const role = bound ? roleOf(profile) : null;
  // SIMS coordinators review their grades' sessions without a separate school assignment.
  const simsGrades = !ended && role && role !== 'admin' ? (scopedGrades(profile) || []) : [];
  return { uid, email: email.toLowerCase(), displayName: deps.displayName || account.data()?.displayName || profile?.name || email,
    isAdmin: role === 'admin', schoolYear, ended: Boolean(ended), assignments, simsGrades };
}

async function assignmentFrom(deps, reader, actor, input) {
  if (actor.ended) fail('failed-precondition', 'This school year has ended.');
  if (!SCHOOL_ROLES.includes(input.role)) fail('invalid-argument', 'Choose a school role.');
  if (input.role === 'curriculum_adviser') {
    if (!Number.isInteger(input.gradeLevel) || input.gradeLevel < 7 || input.gradeLevel > 12) fail('invalid-argument', 'Choose a grade from 7 to 12.');
    return { role: input.role, schoolYear: actor.schoolYear, gradeLevel: input.gradeLevel };
  }
  if (!id(input.sectionId)) fail('invalid-argument', 'Choose a section.');
  const section = (await read(deps.db, reader, deps.db.doc(`sections/${input.sectionId}`))).data();
  if (!section || section.schoolYear !== actor.schoolYear || !Number.isInteger(section.gradeLevel)
      || section.gradeLevel < 7 || section.gradeLevel > 12) fail('failed-precondition', 'This section is unavailable for the current school year.');
  return { role: input.role, schoolYear: actor.schoolYear, sectionId: input.sectionId, gradeLevel: section.gradeLevel };
}

async function liveUser(auth, uid) {
  const user = await auth.getUser(uid).catch(e => {
    if (e.code === 'auth/user-not-found') fail('failed-precondition', 'The requesting account no longer exists.');
    throw e;
  });
  if (!user || user.disabled || !user.emailVerified || !emailValue(user.email)) fail('failed-precondition', 'The requester must have an active, verified email account.');
  return user;
}

// Teachers ask from the Parent App; a request confers nothing until approved.
export async function requestSchoolRole(deps, input) {
  if (!REQUESTABLE_ROLES.includes(input.role)) fail('permission-denied', 'An administrator assigns Curriculum Adviser access.');
  const user = await liveUser(deps.auth, deps.uid);
  await enforceRateLimit(deps.db, deps.uid, 'schoolRoleRequest', { windowMs: 3600000, max: 30 }, (deps.now || (() => new Date()))().getTime());
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    const assignment = await assignmentFrom(deps, tx, actor, input);
    if (actor.assignments.some(a => assignmentKey(a) === assignmentKey(assignment))) fail('already-exists', 'This assignment is already active.');
    const key = requestKey(deps.uid, assignment);
    const ref = deps.db.doc(`school_role_requests/${key}`);
    const existing = await tx.get(ref);
    const pending = await tx.get(deps.db.collection('school_role_requests').where('uid', '==', deps.uid).where('status', '==', 'pending'));
    if (existing.data()?.status === 'pending') return { id: key, status: 'pending' };
    if (pending.size >= 20) fail('resource-exhausted', 'Wait for your pending requests to be reviewed.');
    tx.set(ref, { ...assignment, uid: deps.uid, email: user.email.toLowerCase(), emailVerified: true,
      displayName: user.displayName || actor.displayName, status: 'pending', createdAt: FieldValue.serverTimestamp() });
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'school.requested', deps.uid, { ...assignment, ...teacherOf(user) }));
    return { id: key, status: 'pending' };
  });
}

export async function withdrawSchoolRequest(deps, input) {
  if (!id(input.requestId)) fail('invalid-argument', 'Choose a request.');
  const ref = deps.db.doc(`school_role_requests/${input.requestId}`);
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    const request = (await tx.get(ref)).data();
    if (!request || request.uid !== deps.uid) fail('not-found', 'Request not found.');
    if (request.status !== 'pending') fail('failed-precondition', 'This request was already reviewed.');
    tx.update(ref, { status: 'withdrawn', reason: 'Withdrawn by the teacher', reviewedAt: FieldValue.serverTimestamp() });
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'school.requestWithdrawn', deps.uid, { requestId: ref.id,
      role: request.role, sectionId: request.sectionId || '', gradeLevel: request.gradeLevel, ...teacherOf(request) }));
    return { ok: true };
  });
}

// Reads must precede the mutation below. The section lock serializes different
// users requesting the same advisory section without relying on a query race.
async function prepareGrant(db, tx, uid, assignment) {
  const accountRef = db.doc(`school_accounts/${uid}`);
  const lock = lockRef(db, assignment);
  const [account, locked] = await Promise.all([tx.get(accountRef), lock ? tx.get(lock) : null]);
  if (locked?.exists && locked.data().uid !== uid) fail('already-exists', 'This section already has an adviser. An administrator must revoke that assignment first.');
  const assignments = account.data()?.assignments || [];
  return { accountRef, lock, assignments, exists: assignments.some(a => assignmentKey(a) === assignmentKey(assignment)) };
}
// serverTimestamp cannot sit inside an array, so assignedAt uses the function's clock.
function writeGrant(tx, prepared, actor, user, assignment, source) {
  if (prepared.exists) return;
  const db = prepared.accountRef.firestore;
  tx.set(prepared.accountRef, { uid: user.uid, email: user.email.toLowerCase(), displayName: user.displayName || user.email,
    assignments: [...prepared.assignments, { ...assignment, assignedAt: Timestamp.now(), assignedBy: actor.email, source }],
    updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (prepared.lock) tx.set(prepared.lock, { uid: user.uid, ...assignment });
  // Approvals and replacements write their own audit row.
  if (source === 'direct' || source === 'legacy') tx.set(db.collection('audit_log').doc(), auditRow(actor, 'school.assigned', user.uid, { ...assignment, source, ...teacherOf(user) }));
  tx.set(inboxRef(db, user.uid, assignmentKey(assignment)), {
    type: 'school_access', title: 'School access approved',
    body: 'You can now use the app for school work. Switch to School in Settings.', createdAt: FieldValue.serverTimestamp() });
}

export async function resolveSchoolRole(deps, input) {
  if (!id(input.requestId) || typeof input.approve !== 'boolean') fail('invalid-argument', 'Choose a request and a decision.');
  const reason = decisionReason(input.approve, input.reason);
  const ref = deps.db.doc(`school_role_requests/${input.requestId}`);
  const first = (await ref.get()).data();
  if (!first) fail('not-found', 'Request not found.');
  const user = await liveUser(deps.auth, first.uid);
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    if (actor.ended) fail('failed-precondition', 'This school year has ended.');
    const request = (await tx.get(ref)).data();
    if (!request || request.uid !== user.uid || request.email !== user.email.toLowerCase()) fail('failed-precondition', 'The requesting account changed. Ask the teacher to submit a new request.');
    // Live Auth verification is authoritative, never a caller-supplied field.
    if (!canApproveRoleRequest(actor, { ...request, email: user.email, emailVerified: user.emailVerified })) fail('permission-denied', 'You cannot review this request.');
    let scope = { role: request.role, sectionId: request.sectionId || '', gradeLevel: request.gradeLevel };
    if (input.approve) {
      const assignment = await assignmentFrom(deps, tx, actor, request);
      if (assignment.gradeLevel !== request.gradeLevel) fail('failed-precondition', 'The section changed grades. Ask for a new request.');
      writeGrant(tx, await prepareGrant(deps.db, tx, user.uid, assignment), actor, user, assignment, 'request');
      scope = assignment;
    } else {
      tx.set(inboxRef(deps.db, user.uid, `rejected:${ref.id}`), { type: 'school_access', rejected: true,
        title: 'School access request not approved', body: `Reason: ${reason}`, createdAt: FieldValue.serverTimestamp() });
    }
    tx.update(ref, { status: input.approve ? 'approved' : 'rejected', reviewedBy: actor.uid, reviewedAt: FieldValue.serverTimestamp(), reason });
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, input.approve ? 'school.requestApproved' : 'school.requestRejected', user.uid,
      { requestId: ref.id, reason, ...scope, ...teacherOf(user) }));
    return { ok: true };
  });
}

// One transaction moves the section from the current adviser to the requester,
// so the section is never without an adviser and never has two.
export async function replaceAdviser(deps, input) {
  if (!id(input.requestId)) fail('invalid-argument', 'Choose a request.');
  const reason = reasonValue(input.reason);
  const ref = deps.db.doc(`school_role_requests/${input.requestId}`);
  const first = (await ref.get()).data();
  if (!first) fail('not-found', 'Request not found.');
  const user = await liveUser(deps.auth, first.uid);
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    if (!actor.isAdmin) fail('permission-denied', 'Administrators only.');
    const request = (await tx.get(ref)).data();
    if (!request || request.uid !== user.uid || request.email !== user.email.toLowerCase()) fail('failed-precondition', 'The requesting account changed. Ask the teacher to submit a new request.');
    if (!canApproveRoleRequest(actor, { ...request, email: user.email, emailVerified: user.emailVerified })) fail('permission-denied', 'You cannot review this request.');
    if (request.role !== 'adviser') fail('failed-precondition', 'Only adviser requests can replace an adviser.');
    const assignment = await assignmentFrom(deps, tx, actor, request);
    if (assignment.gradeLevel !== request.gradeLevel) fail('failed-precondition', 'The section changed grades. Ask for a new request.');
    const lock = lockRef(deps.db, assignment);
    const holder = (await tx.get(lock)).data();
    if (!holder || holder.uid === user.uid) fail('failed-precondition', 'This section has no other adviser. Approve the request instead.');
    const previousRef = deps.db.doc(`school_accounts/${holder.uid}`);
    const accountRef = deps.db.doc(`school_accounts/${user.uid}`);
    const [previous, account] = await Promise.all([tx.get(previousRef), tx.get(accountRef)]);
    const key = assignmentKey(assignment);
    if (previous.exists) tx.update(previousRef, { assignments: (previous.data().assignments || []).filter(a => assignmentKey(a) !== key), updatedAt: FieldValue.serverTimestamp() });
    const assignments = account.data()?.assignments || [];
    writeGrant(tx, { accountRef, lock, assignments, exists: assignments.some(a => assignmentKey(a) === key) }, actor, user, assignment, 'replace');
    tx.update(ref, { status: 'approved', reviewedBy: actor.uid, reviewedAt: FieldValue.serverTimestamp(), reason });
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'school.replaced', user.uid, { requestId: ref.id, reason, ...assignment,
      previousUid: holder.uid, previousEmail: previous.data()?.email || '', ...teacherOf(user) }));
    return { ok: true };
  });
}

// Requests run one by one so a section conflict fails only its own request.
export async function resolveSchoolRoles(deps, input) {
  const ids = Array.isArray(input.requestIds) ? [...new Set(input.requestIds)] : [];
  if (!ids.length || ids.length > 25 || !ids.every(value => id(value))) fail('invalid-argument', 'Choose 1–25 requests.');
  if (!(await loadSchoolActor(deps)).isAdmin) fail('permission-denied', 'Administrators only.');
  const results = [];
  for (const requestId of ids) {
    try { await resolveSchoolRole(deps, { requestId, approve: true, reason: input.reason }); results.push({ id: requestId, ok: true }); }
    catch (e) { results.push({ id: requestId, ok: false, error: e instanceof CallableError ? e.message : 'Could not approve this request. Try again.' }); }
  }
  return { results };
}

export async function assignSchoolRole(deps, input) {
  const actor = await loadSchoolActor(deps);
  if (!actor.isAdmin) fail('permission-denied', 'Administrators only.');
  if (!emailValue(input.email)) fail('invalid-argument', 'Enter the account email.');
  const found = await deps.auth.getUserByEmail(input.email.trim().toLowerCase()).catch(e => {
    if (e.code === 'auth/user-not-found') fail('not-found', 'Ask this person to create and verify their app account first.');
    throw e;
  });
  if (!found) fail('not-found', 'Ask this person to create and verify their app account first.');
  const user = await liveUser(deps.auth, found.uid);
  return deps.db.runTransaction(async tx => {
    const current = await loadSchoolActor(deps, tx);
    if (!current.isAdmin) fail('permission-denied', 'Administrators only.');
    const assignment = await assignmentFrom(deps, tx, current, input);
    const prepared = await prepareGrant(deps.db, tx, user.uid, assignment);
    writeGrant(tx, prepared, current, user, assignment, input.source === 'legacy' ? 'legacy' : 'direct');
    return { ok: true };
  });
}

export async function revokeSchoolRole(deps, input) {
  if (!id(input.uid) || !SCHOOL_ROLES.includes(input.role)) fail('invalid-argument', 'Choose an assignment.');
  const reason = reasonValue(input.reason);
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    if (!actor.isAdmin) fail('permission-denied', 'Administrators only.');
    const ref = deps.db.doc(`school_accounts/${input.uid}`);
    const account = (await tx.get(ref)).data();
    const assignments = account?.assignments || [];
    const target = assignments.find(a => a.role === input.role && a.schoolYear === actor.schoolYear
      && (a.role === 'curriculum_adviser' ? a.gradeLevel === input.gradeLevel : a.sectionId === input.sectionId));
    if (!target) fail('not-found', 'This assignment is no longer active.');
    const lock = lockRef(deps.db, target);
    const locked = lock ? await tx.get(lock) : null;
    tx.update(ref, { assignments: assignments.filter(a => assignmentKey(a) !== assignmentKey(target)), updatedAt: FieldValue.serverTimestamp() });
    if (locked?.data()?.uid === input.uid) tx.delete(lock);
    tx.set(deps.db.collection('audit_log').doc(), auditRow(actor, 'school.revoked', input.uid, { ...target, reason, ...teacherOf(account) }));
    return { ok: true };
  });
}

const row = snap => ({ id: snap.id, ...snap.data() });
// Erasure must release section locks before deleting Auth, otherwise a deleted
// account could permanently occupy an advisory section.
export async function deleteSchoolAccess(db, uid) {
  return db.runTransaction(async tx => {
    const ref = db.doc(`school_accounts/${uid}`);
    const [account, pending] = await Promise.all([
      tx.get(ref), tx.get(db.collection('school_role_requests').where('uid', '==', uid).where('status', '==', 'pending')),
    ]);
    const locks = await Promise.all((account.data()?.assignments || []).filter(a => a.role === 'adviser').map(a => tx.get(lockRef(db, a))));
    for (const lock of locks) if (lock.data()?.uid === uid) tx.delete(lock.ref);
    for (const request of pending.docs) tx.update(request.ref, { status: 'withdrawn', reason: 'Account deleted', reviewedAt: FieldValue.serverTimestamp() });
    tx.delete(ref);
  });
}

const REQUEST_LIMIT = 200;
const plainAssignment = a => ({ ...a, assignedAt: millis(a.assignedAt) });

// Each adviser request names whoever already holds its section, so reviewers see conflicts first.
async function requestRows(tx, db, snaps) {
  const requests = snaps.map(row).sort((a, b) => (millis(a.createdAt) ?? 0) - (millis(b.createdAt) ?? 0));
  const locks = {};
  for (const r of requests) if (r.role === 'adviser') locks[r.sectionId] ??= tx.get(lockRef(db, r)).then(s => s.data() || null);
  const holders = {};
  for (const r of requests) {
    const lock = r.role === 'adviser' ? await locks[r.sectionId] : null;
    if (lock && lock.uid !== r.uid) holders[lock.uid] ??= tx.get(db.doc(`school_accounts/${lock.uid}`)).then(s => s.data() || {});
  }
  return Promise.all(requests.map(async r => {
    const lock = r.role === 'adviser' ? await locks[r.sectionId] : null;
    const holder = lock && lock.uid !== r.uid ? await holders[lock.uid] : null;
    return { id: r.id, uid: r.uid, email: r.email || '', displayName: r.displayName || '', emailVerified: r.emailVerified === true,
      role: r.role, sectionId: r.sectionId || '', gradeLevel: r.gradeLevel, createdAt: millis(r.createdAt),
      conflict: holder ? { uid: lock.uid, email: holder.email || '', displayName: holder.displayName || holder.email || '' } : null };
  }));
}

export async function markSchoolOpened(deps) {
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    if (!actor.assignments.length) return { ok: false };
    tx.set(deps.db.doc(`school_accounts/${deps.uid}`), { lastSchoolOpenAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true };
  });
}

export async function getSchoolPendingCount(deps) {
  const actor = await loadSchoolActor(deps);
  if (!actor.isAdmin) fail('permission-denied', 'Administrators only.');
  const snap = await deps.db.collection('school_role_requests').where('status', '==', 'pending').where('schoolYear', '==', actor.schoolYear).count().get();
  return { count: snap.data().count };
}

export async function getSchoolContext(deps) {
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    const requests = deps.db.collection('school_role_requests');
    const [sections, mine] = await Promise.all([
      tx.get(deps.db.collection('sections').where('schoolYear', '==', actor.schoolYear)),
      tx.get(requests.where('uid', '==', deps.uid)),
    ]);
    const result = { schoolYear: actor.schoolYear, ended: actor.ended, isAdmin: actor.isAdmin, assignments: actor.assignments.map(plainAssignment),
      sections: sections.docs.map(s => ({ id: s.id, name: s.data().name || '', gradeLevel: s.data().gradeLevel, schoolYear: s.data().schoolYear }))
        .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)),
      myRequests: mine.docs.map(row).filter(r => r.schoolYear === actor.schoolYear)
        .map(r => ({ id: r.id, role: r.role, sectionId: r.sectionId || '', gradeLevel: r.gradeLevel, status: r.status,
          reason: r.status === 'rejected' ? r.reason || '' : '', createdAt: millis(r.createdAt) }))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 20) };
    const pendingOf = query => tx.get(query.limit(REQUEST_LIMIT));
    if (actor.isAdmin) {
      const [accounts, legacy, pending] = await Promise.all([
        tx.get(deps.db.collection('school_accounts')),
        tx.get(deps.db.collection('guardian_links').where('status', '==', 'active')),
        pendingOf(requests.where('status', '==', 'pending').where('schoolYear', '==', actor.schoolYear)),
      ]);
      result.managedAssignments = accounts.docs.flatMap(s => (s.data().assignments || []).filter(a => a.schoolYear === actor.schoolYear)
        .map(a => ({ uid: s.id, email: s.data().email || '', displayName: s.data().displayName || '', ...plainAssignment(a), lastSchoolOpenAt: millis(s.data().lastSchoolOpenAt) })));
      result.pendingRequests = await requestRows(tx, deps.db, pending.docs);
      const candidates = legacy.docs.map(row).filter(l => l.schoolYear === actor.schoolYear && (l.slot === 'adviser' || l.relationship === 'Adviser'));
      result.migrationCandidates = candidates;
      const enrollments = await Promise.all(sampleStudentIds(candidates).filter(id).map(studentId => tx.get(deps.db.doc(`enrollments/${studentId}_${actor.schoolYear}`))));
      const sectionByStudent = Object.fromEntries(enrollments.filter(s => s.data()?.status === 'enrolled').map(s => [s.data().studentId, s.data().sectionId]));
      result.legacyAdvisers = groupLegacyAdvisers(candidates, sectionByStudent);
    } else {
      const grades = actor.assignments.filter(a => a.role === 'curriculum_adviser').map(a => a.gradeLevel);
      if (grades.length) {
        const pending = await pendingOf(requests.where('status', '==', 'pending').where('schoolYear', '==', actor.schoolYear).where('role', '==', 'adviser'));
        result.reviewQueue = await requestRows(tx, deps.db, pending.docs.filter(s => grades.includes(s.data().gradeLevel)
          && s.data().uid !== deps.uid && s.data().emailVerified === true && isDepedEmail(s.data().email)));
      }
    }
    return result;
  });
}
