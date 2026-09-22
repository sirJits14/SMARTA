import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { audit } from '../audit.js';
import { logEvent } from '../log.js';
import { str, oneOf, hhmm, ymd } from '../lib/validators.js';
import { systemInbox } from './links.js';

export const REPORT_REASONS = ['wrong_time', 'not_this_learner', 'missing_event', 'other'];
export const RESOLUTION_ACTIONS = ['none', 'voided', 'corrected'];

async function assertActiveLink(db, uid, studentId) {
  const link = (await db.doc(`guardian_links/${uid}_${studentId}`).get()).data();
  if (!link || link.status !== 'active') throw new CallableError('permission-denied', 'You are not linked to this learner');
}

export async function submitReport(ctx, data) {
  const { db, now, uid } = ctx;
  const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
  // Checked before the rate limit is spent: a report about a learner the
  // guardian isn't linked to is refused outright and must not eat their quota.
  await assertActiveLink(db, uid, studentId);
  await enforceRateLimit(db, uid, 'report', LIMITS.report, now().getTime());
  const doc = {
    guardianUid: uid, studentId,
    eventId: str(data.eventId ?? '', { name: 'eventId', max: 200 }),
    reason: oneOf(data.reason, REPORT_REASONS, 'reason'),
    message: str(data.message ?? '', { name: 'message', max: 500 }),
    status: 'open', createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await db.collection('reports').add(doc);
  logEvent('report_submitted', { uid, studentId, reason: doc.reason });
  return { id: ref.id };
}

export async function resolveReport(ctx, data) {
  const { db, email } = ctx;
  const id = str(data.id, { name: 'id', min: 1, max: 64 });
  const note = str(data.note, { name: 'note', min: 1, max: 500 });
  const action = oneOf(data.action, RESOLUTION_ACTIONS, 'action');
  const ref = db.doc(`reports/${id}`);
  const report = (await ref.get()).data();
  if (!report || report.status !== 'open') throw new CallableError('failed-precondition', 'Report is not open');
  await ref.update({ status: 'resolved', resolvedAt: FieldValue.serverTimestamp(), resolvedBy: email, resolutionNote: note, resolutionAction: action });
  await systemInbox(db, report.guardianUid, { title: 'Your report was reviewed', body: `The school reviewed your report: ${note}`, studentId: report.studentId });
  await audit(db, { action: 'report.resolved', actorType: 'staff', actorUid: email, targetType: 'report', targetId: id, details: { action } });
  return { ok: true };
}

// Staff corrections are themselves scan_events (source: staff) so the same
// trigger projects them and the raw log stays the single history (spec §5).
function staffEvent({ studentId, sectionId, schoolYear, kind, scannedAt, extra, email }) {
  const scannedDate = ymdOf(scannedAt); const scannedTime = hhmmOf(scannedAt);
  return {
    studentId, sectionId, schoolYear, kind, deviceId: 'staff', scannedAt: Timestamp.fromDate(scannedAt), scannedDate, scannedTime,
    receivedAt: FieldValue.serverTimestamp(), source: 'staff', createdBy: email, ...extra,
  };
}
const manila = (d) => new Date(d.getTime() + 8 * 3600_000);   // Manila wall time as a UTC Date
const ymdOf = (d) => manila(d).toISOString().slice(0, 10);
const hhmmOf = (d) => manila(d).toISOString().slice(11, 16);
const stampOf = (d) => manila(d).toISOString().replace(/[-:T]/g, '').slice(0, 12); // YYYYMMDDHHMM, timezone-independent
const manilaDateTime = (ymdStr, hhmmStr) => new Date(`${ymdStr}T${hhmmStr}:00+08:00`);

async function enrolledSection(db, studentId) {
  const schoolYear = (await db.doc('settings/app').get()).data()?.currentSchoolYear;
  const e = (await db.doc(`enrollments/${studentId}_${schoolYear}`).get()).data();
  if (!e || e.status !== 'enrolled') throw new CallableError('failed-precondition', 'Learner is not enrolled this school year');
  return { schoolYear, sectionId: e.sectionId };
}

export async function correctEvent(ctx, data) {
  const { db, now, email } = ctx;
  const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
  const eventId = str(data.eventId, { name: 'eventId', min: 1, max: 200 });
  const reason = str(data.reason, { name: 'reason', min: 1, max: 300 });
  const target = (await db.doc(`learners/${studentId}/events/${eventId}`).get()).data();
  if (!target) throw new CallableError('not-found', 'Event not found');
  const { schoolYear, sectionId } = await enrolledSection(db, studentId);
  const at = now();
  const voidEventId = `staff_${studentId}_${stampOf(at)}_void`;
  await db.doc(`scan_events/${voidEventId}`).set(staffEvent({ studentId, sectionId, schoolYear, kind: 'void', scannedAt: at, email, extra: { voidsEventId: eventId, note: reason } }));
  await audit(db, { action: 'event.voided', actorType: 'staff', actorUid: email, targetType: 'event', targetId: eventId, details: { studentId, reason, voidEventId } });
  return { voidEventId };
}

export async function addManualEvent(ctx, data) {
  const { db, email } = ctx;
  const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
  const kind = oneOf(data.kind, ['in', 'out'], 'kind');
  const date = ymd(data.date, 'date'); const time = hhmm(data.time, 'time');
  const reason = str(data.reason, { name: 'reason', min: 1, max: 300 });
  const { schoolYear, sectionId } = await enrolledSection(db, studentId);
  const scannedAt = manilaDateTime(date, time);
  const eventId = `staff_${studentId}_${date.replace(/-/g, '')}${time.replace(':', '')}_${kind}`;
  await db.doc(`scan_events/${eventId}`).set(staffEvent({ studentId, sectionId, schoolYear, kind, scannedAt, email, extra: { note: reason } }));
  await audit(db, { action: 'event.added', actorType: 'staff', actorUid: email, targetType: 'event', targetId: eventId, details: { studentId, kind, date, time, reason } });
  return { eventId };
}
