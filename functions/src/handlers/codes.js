import { randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { audit } from '../audit.js';
import { logEvent, logWarn } from '../log.js';
import { str, oneOf, int } from '../lib/validators.js';
import { generateCode, normalizeCode, isValidCode, hashCode } from '../lib/activationCode.js';
import { sectionLabel, displayName } from '../lib/format.js';

export const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
export const CODE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_REDEMPTIONS = 2;
const GENERIC = 'That code could not be used. Ask the registrar to reissue your slip.';

const formalName = (s) => { const mi = s.middleName?.trim() ? ` ${s.middleName.trim()[0]}.` : ''; const ext = s.extName?.trim() ? ` ${s.extName.trim()}` : ''; return `${s.lastName}, ${s.firstName}${mi}${ext}`; };

async function revokeIssuedCodes(db, studentId, schoolYear, by, reason) {
  const snap = await db.collection('activation_codes').where('studentId', '==', studentId).where('schoolYear', '==', schoolYear).get();
  const batch = db.batch(); let n = 0;
  snap.docs.forEach((d) => { if (d.data().status === 'issued') { batch.update(d.ref, { status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: by, revokedReason: reason }); n++; } });
  await batch.commit();
  return n;
}

// Staff. One code per enrolled learner of the section; previous issued codes
// for the same learner+SY are revoked. Raw codes are returned once for the
// print job and never stored (spec §3).
export async function issueActivationCodes(ctx, data) {
  const { db, now, email } = ctx;
  const sectionId = str(data.sectionId, { name: 'sectionId', min: 1, max: 64 });
  const schoolYear = str(data.schoolYear, { name: 'schoolYear', min: 9, max: 9 });
  await enforceRateLimit(db, ctx.uid, 'issueCodes', LIMITS.issueCodes, now().getTime());

  const section = (await db.doc(`sections/${sectionId}`).get()).data();
  if (!section) throw new CallableError('not-found', 'Section not found');
  const enrolled = await db.collection('enrollments').where('sectionId', '==', sectionId).where('schoolYear', '==', schoolYear).where('status', '==', 'enrolled').get();

  const slips = [], skipped = [];
  for (const e of enrolled.docs) {
    const studentId = e.data().studentId;
    const student = (await db.doc(`students/${studentId}`).get()).data();
    if (!student) { skipped.push({ studentId, reason: 'missing' }); continue; }
    if (student.activationRestricted === true) { skipped.push({ studentId, reason: 'restricted' }); continue; }
    await revokeIssuedCodes(db, studentId, schoolYear, email, 'reissued');
    const code = generateCode(randomBytes(8));
    await db.doc(`activation_codes/${hashCode(code)}`).set({
      studentId, schoolYear, issuedAt: FieldValue.serverTimestamp(), issuedBy: email,
      expiresAt: Timestamp.fromMillis(now().getTime() + CODE_TTL_MS), maxRedemptions: MAX_REDEMPTIONS, redemptions: 0, status: 'issued',
    });
    slips.push({ studentId, name: formalName(student), lrn: student.lrn, sectionLabel: sectionLabel(section), code });
  }
  await audit(db, { action: 'code.issued', actorType: 'staff', actorUid: email, targetType: 'section', targetId: sectionId, details: { schoolYear, count: slips.length, skipped: skipped.length } });
  logEvent('codes_issued', { sectionId, count: slips.length });
  return { slips, skipped };
}

export async function revokeCode(ctx, data) {
  const { db, email } = ctx;
  const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
  const schoolYear = str(data.schoolYear, { name: 'schoolYear', min: 9, max: 9 });
  const reason = str(data.reason ?? '', { name: 'reason', max: 200 });
  const revoked = await revokeIssuedCodes(db, studentId, schoolYear, email, reason);
  await audit(db, { action: 'code.revoked', actorType: 'staff', actorUid: email, targetType: 'student', targetId: studentId, details: { schoolYear, reason, revoked } });
  return { revoked };
}

// Guardian. Every failure is the same generic message to the caller; the
// real reason is logged (spec §3 "Redemption").
export async function activateCode(ctx, data) {
  const { db, now, uid, email } = ctx;
  const nowMs = now().getTime();
  await enforceRateLimit(db, uid, 'activate', LIMITS.activate, nowMs);
  const relationship = oneOf(data.relationship, RELATIONSHIPS, 'relationship');
  const consentVersion = int(data.consentVersion, { name: 'consentVersion', min: 0, max: 1000 });
  const code = normalizeCode(data.code);

  const fail = (reason) => { logWarn('activation_failed', { uid, reason, codeHash: isValidCode(code) ? hashCode(code) : null }); return new CallableError('failed-precondition', GENERIC); };
  if (!isValidCode(code)) throw fail('format');

  const portal = (await db.doc('settings/parent_portal').get()).data() || {};
  if ((portal.consentVersion ?? 1) !== consentVersion) throw fail('consent');
  const schoolYear = (await db.doc('settings/app').get()).data()?.currentSchoolYear;

  const codeRef = db.doc(`activation_codes/${hashCode(code)}`);
  const codeDoc = (await codeRef.get()).data();
  if (!codeDoc) throw fail('unknown');
  if (codeDoc.status !== 'issued') throw fail(codeDoc.status);
  if (codeDoc.expiresAt.toMillis() < nowMs) throw fail('expired');
  if (codeDoc.schoolYear !== schoolYear) throw fail('school-year');

  const { studentId } = codeDoc;
  const [studentSnap, enrollSnap] = await Promise.all([db.doc(`students/${studentId}`).get(), db.doc(`enrollments/${studentId}_${schoolYear}`).get()]);
  const student = studentSnap.data(); const enrollment = enrollSnap.data();
  if (!student || student.activationRestricted === true) throw fail('restricted');
  if (!enrollment || enrollment.status !== 'enrolled') throw fail('not-enrolled');
  const section = (await db.doc(`sections/${enrollment.sectionId}`).get()).data();

  const linkRef = db.doc(`guardian_links/${uid}_${studentId}`);
  const profileRef = db.doc(`guardians/${uid}`);
  await db.runTransaction(async (tx) => {
    const [c, link, profile] = await Promise.all([tx.get(codeRef), tx.get(linkRef), tx.get(profileRef)]);
    const cd = c.data();
    if (cd.status !== 'issued' || cd.redemptions >= cd.maxRedemptions) throw fail('exhausted');
    const alreadyActive = link.exists && link.data().status === 'active';
    const redemptions = alreadyActive ? cd.redemptions : cd.redemptions + 1;
    tx.update(codeRef, { redemptions, status: redemptions >= cd.maxRedemptions ? 'exhausted' : 'issued', lastRedeemedAt: FieldValue.serverTimestamp() });
    tx.set(linkRef, {
      guardianUid: uid, studentId, schoolYear, relationship, status: 'active', activatedAt: FieldValue.serverTimestamp(), activatedVia: 'code',
      revokedAt: FieldValue.delete(), revokedBy: FieldValue.delete(), revokedReason: FieldValue.delete(),
    }, { merge: true });
    if (!profile.exists) {
      tx.set(profileRef, { email, displayName: ctx.displayName || '', consentAcceptedAt: FieldValue.serverTimestamp(), consentVersion, notificationsEnabled: true, createdAt: FieldValue.serverTimestamp() });
    } else if (profile.data().consentVersion !== consentVersion) {
      tx.update(profileRef, { consentAcceptedAt: FieldValue.serverTimestamp(), consentVersion });
    }
  });
  await audit(db, { action: 'link.activated', actorType: 'guardian', actorUid: uid, targetType: 'student', targetId: studentId, details: { via: 'code', relationship, codeHash: hashCode(code) } });
  logEvent('activation_succeeded', { uid, studentId });
  return { studentId, displayName: displayName(student), sectionLabel: sectionLabel(section) };
}
