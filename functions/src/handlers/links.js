import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { MAX_OPEN_REQUESTS } from '../callable.js';
import { audit } from '../audit.js';
import { logEvent } from '../log.js';
import { str, oneOf, bool, lrn } from '../lib/validators.js';
import { RELATIONSHIPS } from './codes.js';

// A non-attendance inbox item. Never pushed (system messages are read when
// the guardian next opens the portal).
export function systemInbox(db, uid, { title, body, studentId = null }) {
  return db.collection(`guardians/${uid}/inbox`).add({ type: 'system', title, body, studentId, createdAt: FieldValue.serverTimestamp(), pushStatus: 'skipped_suppressed' });
}

export async function requestAccess(ctx, data) {
  const { db, uid, email } = ctx;
  const open = await db.collection('access_requests').where('guardianUid', '==', uid).where('status', '==', 'open').count().get();
  if (open.data().count >= MAX_OPEN_REQUESTS) throw new CallableError('resource-exhausted', 'You already have requests waiting for review.');
  const doc = {
    guardianUid: uid, guardianEmail: email,
    studentLrn: lrn(data.studentLrn),
    learnerNameTyped: str(data.learnerNameTyped, { name: 'Learner name', min: 2, max: 120 }),
    relationship: oneOf(data.relationship, RELATIONSHIPS, 'relationship'),
    contactNumber: str(data.contactNumber, { name: 'Contact number', min: 7, max: 20 }),
    message: str(data.message ?? '', { name: 'Message', max: 500 }),
    status: 'open', createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await db.collection('access_requests').add(doc);
  logEvent('access_requested', { uid, id: ref.id });
  return { id: ref.id };
}

export async function resolveAccessRequest(ctx, data) {
  const { db, email } = ctx;
  const id = str(data.id, { name: 'id', min: 1, max: 64 });
  const approve = bool(data.approve, 'approve');
  const note = str(data.note ?? '', { name: 'note', max: 500 });
  const ref = db.doc(`access_requests/${id}`);
  const request = (await ref.get()).data();
  if (!request || request.status !== 'open') throw new CallableError('failed-precondition', 'Request is not open');

  if (approve) {
    const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
    const schoolYear = (await db.doc('settings/app').get()).data()?.currentSchoolYear;
    const enrollment = (await db.doc(`enrollments/${studentId}_${schoolYear}`).get()).data();
    if (!enrollment || enrollment.status !== 'enrolled') throw new CallableError('failed-precondition', 'Learner is not enrolled this school year');
    await db.doc(`guardian_links/${request.guardianUid}_${studentId}`).set({
      guardianUid: request.guardianUid, studentId, schoolYear, relationship: request.relationship, status: 'active',
      activatedAt: FieldValue.serverTimestamp(), activatedVia: 'staff',
      revokedAt: FieldValue.delete(), revokedBy: FieldValue.delete(), revokedReason: FieldValue.delete(),
    }, { merge: true });
    const profileRef = db.doc(`guardians/${request.guardianUid}`);
    if (!(await profileRef.get()).exists) {
      await profileRef.set({ email: request.guardianEmail, displayName: '', consentAcceptedAt: null, consentVersion: 0, notificationsEnabled: true, createdAt: FieldValue.serverTimestamp() });
    }
    await systemInbox(db, request.guardianUid, { title: 'Access approved', body: 'The registrar approved your request. Your learner now appears on your home screen.', studentId });
  } else {
    await systemInbox(db, request.guardianUid, { title: 'Access request not approved', body: note ? `The registrar could not approve your request: ${note}` : 'The registrar could not approve your request. Please visit the school.' });
  }
  await ref.update({ status: approve ? 'approved' : 'denied', resolvedAt: FieldValue.serverTimestamp(), resolvedBy: email, resolutionNote: note, ...(approve ? { studentId: data.studentId } : {}) });
  await audit(db, { action: approve ? 'access.approved' : 'access.denied', actorType: 'staff', actorUid: email, targetType: 'access_request', targetId: id, details: { guardianUid: request.guardianUid, studentId: data.studentId || null, note } });
  return { status: approve ? 'approved' : 'denied' };
}

async function revokeOne(db, linkRef, by, reason) {
  await linkRef.set({ status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: by, revokedReason: reason }, { merge: true });
}

export async function revokeLink(ctx, data) {
  const { db, email } = ctx;
  const linkId = str(data.linkId, { name: 'linkId', min: 3, max: 130 });
  const reason = str(data.reason, { name: 'reason', min: 1, max: 300 });
  const ref = db.doc(`guardian_links/${linkId}`);
  const link = (await ref.get()).data();
  if (!link) throw new CallableError('not-found', 'Link not found');
  await revokeOne(db, ref, email, reason);
  await systemInbox(db, link.guardianUid, { title: 'Access ended', body: 'Your access to a learner has ended. Contact the registrar if you believe this is a mistake.', studentId: link.studentId });
  await audit(db, { action: 'link.revoked', actorType: 'staff', actorUid: email, targetType: 'guardian_link', targetId: linkId, details: { reason } });
  return { ok: true };
}

export async function setActivationRestricted(ctx, data) {
  const { db, email } = ctx;
  const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
  const restricted = bool(data.restricted, 'restricted');
  const reason = str(data.reason ?? '', { name: 'reason', max: 300 });
  await db.doc(`students/${studentId}`).set({ activationRestricted: restricted }, { merge: true });
  let revokedLinks = 0;
  if (restricted) {
    const active = await db.collection('guardian_links').where('studentId', '==', studentId).where('status', '==', 'active').get();
    for (const d of active.docs) { await revokeOne(db, d.ref, email, `restricted: ${reason}`); revokedLinks++; }
    const codes = await db.collection('activation_codes').where('studentId', '==', studentId).get();
    for (const c of codes.docs) if (c.data().status === 'issued') await c.ref.update({ status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: email, revokedReason: 'restricted' });
  }
  await audit(db, { action: restricted ? 'student.restricted' : 'student.unrestricted', actorType: 'staff', actorUid: email, targetType: 'student', targetId: studentId, details: { reason, revokedLinks } });
  return { revokedLinks };
}
