import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { MAX_OPEN_REQUESTS, LIMITS, enforceRateLimit } from '../callable.js';
import { audit } from '../audit.js';
import { logEvent, logWarn } from '../log.js';
import { str, oneOf, bool, lrn } from '../lib/validators.js';
import { RELATIONSHIPS } from './codes.js';
import { learnerIdentity } from '../lib/format.js';
import { ADVISER, isDepedEmail, isOpenStatus, slotFor, slotsFromLinks, moveSlot } from '../lib/codeSlots.js';
import { schoolYearRef, isEnded } from '../lib/schoolYears.js';
import { refreshGuardianAudience } from './guardianAudience.js';

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
    guardianName: str(data.guardianName ?? '', { name: 'Your name', max: 120 }) || ctx.displayName || '',
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
    const [studentSnap, sectionSnap] = await Promise.all([db.doc(`students/${studentId}`).get(), db.doc(`sections/${enrollment.sectionId}`).get()]);
    if (!studentSnap.exists) throw new CallableError('not-found', 'Learner not found');
    const learner = learnerIdentity(studentSnap.data(), sectionSnap.data(), schoolYear);
    const linkRef = db.doc(`guardian_links/${request.guardianUid}_${studentId}`);
    const activeLinksQuery = db.collection('guardian_links').where('studentId', '==', studentId).where('status', '==', 'active');
    await db.runTransaction(async (tx) => {
      // Staff approvals obey the same 2-guardian cap as slips (spec
      // 2026-10-13 learner link cap). The requester's own link is not counted, so
      // re-approving an already-linked guardian still works.
      const others = (await tx.get(activeLinksQuery)).docs.filter((d) => d.id !== linkRef.id).map((d) => d.data());
      const used = slotsFromLinks(others, schoolYear);
      if (used.guardianRedemptions >= used.maxGuardians) {
        throw new CallableError('failed-precondition', `This learner already has ${used.maxGuardians} linked guardians for ${schoolYear}. Revoke one on the Learner access tab first.`);
      }
      // Seeded with the link so the guardian's Home card already has the
      // learner's name (see activateCode).
      tx.set(db.doc(`learners/${studentId}`), learner, { merge: true });
      tx.set(linkRef, {
        guardianUid: request.guardianUid, guardianName: request.guardianName || '', guardianEmail: request.guardianEmail || '', learnerName: learner.displayName,
        studentId, schoolYear, relationship: request.relationship, slot: 'guardian', status: 'active',
        activatedAt: FieldValue.serverTimestamp(), activatedVia: 'staff',
        revokedAt: FieldValue.delete(), revokedBy: FieldValue.delete(), revokedReason: FieldValue.delete(),
        expiredAt: FieldValue.delete(), expiredReason: FieldValue.delete(),
        // Last year's relationship change is history once staff link them again;
        // relationshipChangedFor stays so the once-a-year limit still holds.
        previousRelationship: FieldValue.delete(), relationshipChangedAt: FieldValue.delete(),
      }, { merge: true });
    });
    const profileRef = db.doc(`guardians/${request.guardianUid}`);
    if (!(await profileRef.get()).exists) {
      await profileRef.set({ email: request.guardianEmail, displayName: request.guardianName || '', consentAcceptedAt: null, consentVersion: 0, notificationsEnabled: true, createdAt: FieldValue.serverTimestamp() });
    }
    // onGuardianLinkWritten may have run before the profile existed (and
    // refreshGuardianAudience never creates one), so set the keys here too.
    // A failure here must not fail an approval that already wrote the link:
    // onGuardianLinkWritten and the nightly expireLinks job re-derive the keys.
    try {
      await refreshGuardianAudience(db, request.guardianUid);
    } catch (e) {
      logWarn('audience_refresh_failed', { uid: request.guardianUid, message: e.message });
    }
    await systemInbox(db, request.guardianUid, { title: 'Access approved', body: 'The registrar approved your request. Your learner now appears on your home screen.', studentId });
  } else {
    await systemInbox(db, request.guardianUid, { title: 'Access request not approved', body: note ? `The registrar could not approve your request: ${note}` : 'The registrar could not approve your request. Please visit the school.' });
  }
  await ref.update({ status: approve ? 'approved' : 'denied', resolvedAt: FieldValue.serverTimestamp(), resolvedBy: email, resolutionNote: note, ...(approve ? { studentId: data.studentId } : {}) });
  await audit(db, { action: approve ? 'access.approved' : 'access.denied', actorType: 'staff', actorUid: email, targetType: 'access_request', targetId: id, details: { guardianUid: request.guardianUid, studentId: data.studentId || null, note } });
  return { status: approve ? 'approved' : 'denied' };
}

const DEPED_ONLY = 'Only DepEd (@deped.gov.ph) accounts can change their relationship.';
const LINK_ENDED = 'This link is no longer active.';
const OTHER_SIDE = 'Choose Adviser, or the relationship you have to the learner.';

// A DepEd account fixes an Adviser/guardian mix-up on its own link, once per
// link per school year (spec 2026-10-17). Each of the learner's open slips
// moves one count from the slot the caller left to the one they joined, so
// the slot they left is free again. Revoked links keep their counts.
export async function changeLinkRelationship(ctx, data) {
  const { db, now, uid, email } = ctx;
  // Checked before anything is read, like activateCode's adviser check.
  if (!isDepedEmail(email)) throw new CallableError('permission-denied', DEPED_ONLY);
  const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
  const relationship = oneOf(data.relationship, [...RELATIONSHIPS, ADVISER], 'relationship');
  const toSlot = slotFor(relationship);
  await enforceRateLimit(db, uid, 'relationshipChange', LIMITS.relationshipChange, now().getTime());

  const refuse = (reason, code, message) => { logWarn('relationship_change_failed', { uid, studentId, reason }); return new CallableError(code, message); };
  const linkRef = db.doc(`guardian_links/${uid}_${studentId}`);
  const activeLinksQuery = db.collection('guardian_links').where('studentId', '==', studentId).where('status', '==', 'active');
  const { from, fromSlot, schoolYear } = await db.runTransaction(async (tx) => {
    const l = (await tx.get(linkRef)).data();
    if (!l || l.guardianUid !== uid || l.studentId !== studentId || l.status !== 'active') throw refuse('inactive', 'failed-precondition', LINK_ENDED);
    const yearRef = schoolYearRef(db, l.schoolYear);
    const codesQuery = db.collection('activation_codes').where('studentId', '==', studentId).where('schoolYear', '==', l.schoolYear);
    const [year, activeLinks, codes] = await Promise.all([yearRef && tx.get(yearRef), tx.get(activeLinksQuery), tx.get(codesQuery)]);
    if (isEnded(year)) throw refuse('year-ended', 'failed-precondition', LINK_ENDED);
    if (l.relationshipChangedFor === l.schoolYear) {
      throw refuse('already-changed', 'failed-precondition', `You already changed your relationship for SY ${l.schoolYear}. Ask the registrar if it needs fixing again.`);
    }
    const current = l.slot ?? 'guardian';
    if (toSlot === current) throw refuse('same-side', 'invalid-argument', OTHER_SIDE);
    // Same cap as activateCode and resolveAccessRequest (spec 2026-10-13):
    // the caller's own link is not counted against them.
    const others = activeLinks.docs.filter((d) => d.id !== linkRef.id).map((d) => d.data());
    const used = slotsFromLinks(others, l.schoolYear);
    if (toSlot === 'adviser' && used.adviserRedemptions >= used.maxAdvisers) {
      throw refuse('cap', 'failed-precondition', 'This learner already has an adviser linked. Ask the registrar to remove that link first.');
    }
    if (toSlot === 'guardian' && used.guardianRedemptions >= used.maxGuardians) {
      throw refuse('cap', 'failed-precondition', `This learner already has ${used.maxGuardians} linked guardians. Ask the registrar to remove one first.`);
    }
    tx.update(linkRef, {
      relationship, slot: toSlot, previousRelationship: l.relationship ?? null,
      relationshipChangedFor: l.schoolYear, relationshipChangedAt: FieldValue.serverTimestamp(),
    });
    // `after` is what the active links use once the caller's link holds toSlot;
    // a slip's counters never drop below it.
    const after = slotsFromLinks([...others, { status: 'active', schoolYear: l.schoolYear, slot: toSlot }], l.schoolYear);
    for (const c of codes.docs) {
      if (isOpenStatus(c.data().status)) tx.update(c.ref, { ...moveSlot(c.data(), current, toSlot, after), redemptions: FieldValue.delete(), maxRedemptions: FieldValue.delete() });
    }
    return { from: l.relationship ?? null, fromSlot: current, schoolYear: l.schoolYear };
  });
  await audit(db, { action: 'link.relationshipChanged', actorType: 'guardian', actorUid: uid, targetType: 'student', targetId: studentId, details: { from, to: relationship, fromSlot, toSlot, schoolYear } });
  logEvent('relationship_changed', { uid, studentId });
  return { relationship, slot: toSlot };
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
    for (const c of codes.docs) if (isOpenStatus(c.data().status)) await c.ref.update({ status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: email, revokedReason: 'restricted' });
  }
  await audit(db, { action: restricted ? 'student.restricted' : 'student.unrestricted', actorType: 'staff', actorUid: email, targetType: 'student', targetId: studentId, details: { reason, revokedLinks } });
  return { revokedLinks };
}
