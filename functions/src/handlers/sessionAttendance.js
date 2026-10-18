import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { loadSchoolActor } from './schoolAccess.js';
import { canReviewSection, canCorrectSession } from '../../shared/schoolAccess.js';
import { sessionAttendance } from '../../shared/sessionAttendance.js';
import { manilaDate } from '../../shared/dates.js';
import { fullName } from '../lib/format.js';
import { sendToGuardian } from './push.js';

const fail = (code, message) => { throw new CallableError(code, message); };
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
function validateDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) fail('invalid-argument', 'Choose a valid date.');
}
function validateSectionDate({ sectionId, date }) {
  if (!identifier(sectionId)) fail('invalid-argument', 'Choose a valid section.');
  validateDate(date);
}
const activeFamily = (link, uid, studentId, schoolYear) => link?.status === 'active'
  && link.guardianUid === uid && link.studentId === studentId && link.schoolYear === schoolYear
  && link.relationship !== 'Adviser' && link.slot !== 'adviser';
const projection = (attendance, studentId) => ({
  studentId, gate: Object.fromEntries(['timeIn', 'timeOut', 'pmTimeIn', 'pmTimeOut'].map(key => [key, attendance?.[key]?.[studentId] || null])),
  ...sessionAttendance(attendance, studentId, { unrecordedStatus: 'no_scan' }),
});
const nowDate = deps => manilaDate((deps.now || (() => new Date()))());
async function sectionFor(deps, reader, sectionId, actor) {
  const snap = await reader.get(deps.db.doc(`sections/${sectionId}`));
  if (!snap.exists) fail('not-found', 'Section not found.');
  const section = { ...snap.data(), id: snap.id };
  if (!canReviewSection(actor, section)) fail('permission-denied', 'This section is outside your attendance access.');
  return section;
}
async function correctionAllowed(deps, reader, actor, section, date) {
  const ended = await reader.get(deps.db.doc(`school_years/${section.schoolYear}`));
  return !ended.data()?.endedAt && canCorrectSession(actor, section, date, nowDate(deps));
}
function validAttendance(attendance, section, date) {
  if (attendance && (attendance.sectionId !== section.id || attendance.schoolYear !== section.schoolYear || attendance.date !== date
      || !Number.isInteger(attendance.gradeLevel) || attendance.gradeLevel < 7 || attendance.gradeLevel > 12)) {
    fail('failed-precondition', 'Attendance record requires administrator repair.');
  }
}
function historicalScope(actor, section, attendance) {
  if (attendance && !canReviewSection(actor, { ...section, gradeLevel: attendance.gradeLevel })) {
    fail('permission-denied', 'The saved attendance grade is outside your scope.');
  }
}

export async function getSchoolRoster(deps, input) {
  validateSectionDate(input);
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    const section = await sectionFor(deps, tx, input.sectionId, actor);
    const canCorrect = await correctionAllowed(deps, tx, actor, section, input.date);
    const [enrollments, snap] = await Promise.all([
      tx.get(deps.db.collection('enrollments').where('sectionId', '==', section.id).where('schoolYear', '==', section.schoolYear).where('status', '==', 'enrolled')),
      tx.get(deps.db.doc(`student_attendance/${section.id}_${input.date}`)),
    ]);
    const attendance = snap.data(); validAttendance(attendance, section, input.date);
    historicalScope(actor, section, attendance);
    const students = await Promise.all(enrollments.docs.map(doc => tx.get(deps.db.doc(`students/${doc.data().studentId}`))));
    const rows = students.filter(s => s.exists).map(s => ({ ...projection(attendance, s.id), displayName: fullName(s.data()) }));
    rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return { section, date: input.date, rows, canCorrect };
  });
}

export async function setSessionAbsence(deps, input) {
  validateSectionDate(input);
  const { sectionId, studentId, date, session, absent, expectedRevision, operationId } = input;
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!identifier(studentId) || !identifier(operationId) || !['am', 'pm'].includes(session)
      || typeof absent !== 'boolean' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0
      || !reason || reason.length > 500) fail('invalid-argument', 'Choose a session and provide a reason (up to 500 characters).');
  const fingerprint = JSON.stringify({ sectionId, studentId, date, session, absent, reason, expectedRevision });
  return deps.db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    if (actor.ended) fail('failed-precondition', 'This school year has ended.');
    const section = await sectionFor(deps, tx, sectionId, actor);
    if (!await correctionAllowed(deps, tx, actor, section, date)) fail('permission-denied', 'Attendance cannot be corrected for this section and date.');
    const id = `${actor.uid}_${operationId}`;
    const operationRef = deps.db.doc(`attendance_corrections/${id}`);
    const attendanceRef = deps.db.doc(`student_attendance/${sectionId}_${date}`);
    const [operation, snap, enrollment, student] = await Promise.all([
      tx.get(operationRef), tx.get(attendanceRef), tx.get(deps.db.doc(`enrollments/${studentId}_${section.schoolYear}`)), tx.get(deps.db.doc(`students/${studentId}`)),
    ]);
    if (!student.exists || enrollment.data()?.status !== 'enrolled' || enrollment.data()?.sectionId !== sectionId) fail('permission-denied', 'Learner is not enrolled in this section.');
    const attendance = snap.data(); validAttendance(attendance, section, date);
    historicalScope(actor, section, attendance);
    if (operation.exists) {
      if (operation.data().fingerprint !== fingerprint) fail('already-exists', 'This operation ID was already used.');
      return operation.data().result;
    }
    const current = attendance?.sessionOverrides?.[studentId] || {};
    if ((current.revision || 0) !== expectedRevision) fail('aborted', 'Attendance changed. Refresh and review before submitting again.');
    const changedAt = Timestamp.fromDate((deps.now || (() => new Date()))());
    const value = { absent, reason, actorUid: actor.uid, actorName: actor.displayName || actor.email || actor.uid, changedAt };
    const override = { ...current, [session]: value, revision: expectedRevision + 1 };
    const effective = { ...attendance, sessionOverrides: { ...attendance?.sessionOverrides, [studentId]: override } };
    const result = { ok: true, revision: override.revision, operationId };
    tx.set(attendanceRef, { sectionId, date, schoolYear: section.schoolYear, gradeLevel: attendance?.gradeLevel ?? section.gradeLevel,
      sessionOverrides: { [studentId]: override }, updatedAt: date }, { merge: true });
    tx.set(deps.db.doc(`learners/${studentId}/attendance/${date}`), { ...projection(effective, studentId), date, schoolYear: section.schoolYear, sectionId });
    const audit = { studentId, sectionId, schoolYear: section.schoolYear, date, session, ...value,
      revision: override.revision, previous: current[session] || null, createdAt: FieldValue.serverTimestamp() };
    tx.create(deps.db.doc(`attendance_correction_audit/${id}`), audit);
    tx.create(deps.db.doc(`audit_log/attendance_${id}`), {
      action: 'attendance.sessionCorrected', actorType: 'staff', actorUid: actor.email,
      targetType: 'student_attendance', targetId: `${sectionId}_${date}`, at: FieldValue.serverTimestamp(),
      details: { studentId, sectionId, date, session, previous: current[session] || null, absent, reason, revision: override.revision },
    });
    tx.create(operationRef, { ...audit, fingerprint, result, learnerName: fullName(student.data()), status: 'pending' });
    return result;
  }, { maxAttempts: 10 });
}

export async function getFamilyAttendance(deps, { studentId, date }) {
  if (!deps.uid) fail('unauthenticated', 'Sign in to continue.');
  if (!identifier(studentId)) fail('invalid-argument', 'Choose a learner.');
  validateDate(date);
  return deps.db.runTransaction(async tx => {
    const settings = await tx.get(deps.db.doc('settings/app'));
    const schoolYear = settings.data()?.currentSchoolYear;
    const [links, enrollment] = await Promise.all([
      tx.get(deps.db.collection('guardian_links').where('guardianUid', '==', deps.uid).where('studentId', '==', studentId).where('status', '==', 'active')),
      tx.get(deps.db.doc(`enrollments/${studentId}_${schoolYear}`)),
    ]);
    if (!links.docs.some(l => activeFamily(l.data(), deps.uid, studentId, schoolYear)) || enrollment.data()?.status !== 'enrolled') fail('permission-denied', 'An approved family link is required.');
    const sectionId = enrollment.data().sectionId;
    const sectionSnap = await tx.get(deps.db.doc(`sections/${sectionId}`));
    const section = { ...sectionSnap.data(), id: sectionId };
    if (!sectionSnap.exists || section.schoolYear !== schoolYear) fail('permission-denied', 'Learner section is unavailable.');
    const attendance = (await tx.get(deps.db.doc(`student_attendance/${sectionId}_${date}`))).data();
    validAttendance(attendance, section, date);
    return { ...projection(attendance, studentId), date, sectionId, schoolYear };
  });
}

// Durable outbox written atomically with the correction. Per-recipient claims
// are at most once: a trigger retry never sends an already claimed push again.
export async function handleAttendanceCorrection(deps, { id }) {
  const ref = deps.db.doc(`attendance_corrections/${id}`);
  const data = (await ref.get()).data();
  if (!data || data.status === 'done') return { outcome: 'duplicate' };
  const links = await deps.db.collection('guardian_links').where('studentId', '==', data.studentId).where('status', '==', 'active').get();
  const recipients = new Map(links.docs.filter(l => activeFamily(l.data(), l.data().guardianUid, data.studentId, data.schoolYear)).map(l => [l.data().guardianUid, l]));
  for (const [uid, link] of recipients) {
    const inboxId = `correction_${id}`;
    const inboxRef = deps.db.doc(`guardians/${uid}/inbox/${inboxId}`);
    const claim = await deps.db.runTransaction(async tx => {
      const [existing, liveLink, settings, portal, guardian, enrollment, devices] = await Promise.all([
        tx.get(inboxRef), tx.get(link.ref), tx.get(deps.db.doc('settings/app')), tx.get(deps.db.doc('settings/parent_portal')),
        tx.get(deps.db.doc(`guardians/${uid}`)), tx.get(deps.db.doc(`enrollments/${data.studentId}_${data.schoolYear}`)),
        tx.get(deps.db.collection(`guardians/${uid}/devices`).where('enabled', '==', true)),
      ]);
      if (existing.exists || settings.data()?.currentSchoolYear !== data.schoolYear || enrollment.data()?.status !== 'enrolled'
          || !activeFamily(liveLink.data(), uid, data.studentId, data.schoolYear)) return null;
      const pushStatus = portal.data()?.notificationsPaused === true ? 'skipped_paused'
        : guardian.data()?.notificationsEnabled === false ? 'skipped_disabled'
          : !devices.size ? 'skipped_no_device' : 'sending';
      tx.create(inboxRef, { type: 'attendance_correction', studentId: data.studentId, learnerName: data.learnerName,
        date: data.date, scannedDate: data.date, session: data.session, absent: data.absent, revision: data.revision,
        title: 'Attendance updated', body: 'School staff updated a session attendance record. Open the learner history to review.',
        createdAt: FieldValue.serverTimestamp(), pushStatus });
      return pushStatus === 'sending' ? devices.docs : null;
    });
    if (claim) {
      const result = await sendToGuardian(deps, { inboxId, studentId: data.studentId, devDocs: claim, correction: true });
      await inboxRef.update({ pushStatus: result.status, pushSentAt: FieldValue.serverTimestamp() });
    }
  }
  await ref.update({ status: 'done', completedAt: FieldValue.serverTimestamp() });
  return { outcome: 'processed' };
}
