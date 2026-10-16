import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { audit } from '../audit.js';
import { logEvent, logWarn } from '../log.js';
import { str, oneOf, int } from '../lib/validators.js';
import { generateCode, normalizeCode, isValidCode, hashCode } from '../lib/activationCode.js';
import { sectionLabel, learnerIdentity, formalName, manilaDateTime } from '../lib/format.js';
import { schoolYearRef, isEnded, schoolYearEnded } from '../lib/schoolYears.js';
import { ADVISER, isDepedEmail, slotFor, claimSlot, slotsFromLinks, isOpenStatus } from '../lib/codeSlots.js';

// Guardian relationships. The class adviser (ADVISER) can only link through a
// slip, never through requestAccess, so it is not in this list.
export const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
const GENERIC = 'That code could not be used. Ask the registrar to reissue your slip.';
const ADVISER_DEPED = 'Sign in with your @deped.gov.ph account to link as adviser.';

async function assertYearOpen(db, schoolYear) {
  if (await schoolYearEnded(db, schoolYear)) throw new CallableError('failed-precondition', `The ${schoolYear} school year has ended.`);
}

// Revokes a learner's issued and exhausted (fully used) codes for one school year.
async function revokeOpenCodes(db, studentId, schoolYear, by, reason) {
  const snap = await db.collection('activation_codes').where('studentId', '==', studentId).where('schoolYear', '==', schoolYear).get();
  const batch = db.batch(); let n = 0;
  snap.docs.forEach((d) => { if (isOpenStatus(d.data().status)) { batch.update(d.ref, { status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: by, revokedReason: reason }); n++; } });
  await batch.commit();
  return n;
}

// Issues one learner's code with slots pre-filled from their active links
// (spec 2026-10-13 §2). A learner whose every slot is linked is skipped and
// keeps their current code: a new one could not link anybody.
async function issueCodeFor(db, { studentId, student, section, schoolYear, by, reason }) {
  const links = await db.collection('guardian_links').where('studentId', '==', studentId).where('status', '==', 'active').get();
  const slots = slotsFromLinks(links.docs.map((d) => d.data()), schoolYear);
  if (slots.status === 'exhausted') return { skipped: 'fully-linked' };
  await revokeOpenCodes(db, studentId, schoolYear, by, reason);
  const code = generateCode(randomBytes(8));
  await db.doc(`activation_codes/${hashCode(code)}`).set({ studentId, schoolYear, issuedAt: FieldValue.serverTimestamp(), issuedBy: by, ...slots });
  return {
    slip: { studentId, name: formalName(student), lrn: student.lrn, sectionLabel: sectionLabel(section), schoolYear, code },
    slotsFree: { guardian: slots.maxGuardians - slots.guardianRedemptions, adviser: slots.maxAdvisers - slots.adviserRedemptions },
  };
}

// Staff. One code per enrolled learner of the section; previous issued codes
// for the same learner+SY are revoked. Learners whose slots are all linked
// are skipped. Raw codes are returned once for the print job and never
// stored (spec §3).
export async function issueActivationCodes(ctx, data) {
  const { db, now, email } = ctx;
  const sectionId = str(data.sectionId, { name: 'sectionId', min: 1, max: 64 });
  const schoolYear = str(data.schoolYear, { name: 'schoolYear', min: 9, max: 9 });
  await enforceRateLimit(db, ctx.uid, 'issueCodes', LIMITS.issueCodes, now().getTime(), (resetMs) =>
    `Slips were issued for ${LIMITS.issueCodes.max} sections in the last 24 hours, the daily limit. You can issue more after ${manilaDateTime(resetMs)}.`);
  await assertYearOpen(db, schoolYear);

  const section = (await db.doc(`sections/${sectionId}`).get()).data();
  if (!section) throw new CallableError('not-found', 'Section not found');
  const enrolled = await db.collection('enrollments').where('sectionId', '==', sectionId).where('schoolYear', '==', schoolYear).where('status', '==', 'enrolled').get();

  const slips = [], skipped = [];
  for (const e of enrolled.docs) {
    const studentId = e.data().studentId;
    const student = (await db.doc(`students/${studentId}`).get()).data();
    if (!student) { skipped.push({ studentId, reason: 'missing' }); continue; }
    if (student.activationRestricted === true) { skipped.push({ studentId, reason: 'restricted' }); continue; }
    const r = await issueCodeFor(db, { studentId, student, section, schoolYear, by: email, reason: 'reissued' });
    if (r.skipped) { skipped.push({ studentId, reason: r.skipped }); continue; }
    slips.push(r.slip);
  }
  await audit(db, { action: 'code.issued', actorType: 'staff', actorUid: email, targetType: 'section', targetId: sectionId, details: { schoolYear, count: slips.length, skipped: skipped.length } });
  logEvent('codes_issued', { sectionId, count: slips.length });
  return { slips, skipped };
}

// Staff. Replaces one learner's lost or damaged slip without touching the
// rest of the section (spec 2026-10-13 §4).
export async function reissueActivationCode(ctx, data) {
  const { db, now, email } = ctx;
  const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
  const schoolYear = str(data.schoolYear, { name: 'schoolYear', min: 9, max: 9 });
  const reason = str(data.reason, { name: 'Reason', min: 1, max: 200 });
  await enforceRateLimit(db, ctx.uid, 'reissueCode', LIMITS.reissueCode, now().getTime());
  await assertYearOpen(db, schoolYear);

  const student = (await db.doc(`students/${studentId}`).get()).data();
  if (!student) throw new CallableError('not-found', 'Learner not found');
  if (student.activationRestricted === true) throw new CallableError('failed-precondition', 'This learner is restricted. Lift the restriction first.');
  const enrollment = (await db.doc(`enrollments/${studentId}_${schoolYear}`).get()).data();
  if (enrollment?.status !== 'enrolled') throw new CallableError('failed-precondition', `This learner is not enrolled for ${schoolYear}.`);
  const section = (await db.doc(`sections/${enrollment.sectionId}`).get()).data();

  const r = await issueCodeFor(db, { studentId, student, section, schoolYear, by: email, reason });
  if (r.skipped) throw new CallableError('failed-precondition', 'All guardian and adviser slots are linked. Revoke a link first.');
  await audit(db, { action: 'code.reissued', actorType: 'staff', actorUid: email, targetType: 'student', targetId: studentId, details: { schoolYear, reason, guardianSlotsFree: r.slotsFree.guardian, adviserSlotsFree: r.slotsFree.adviser } });
  logEvent('code_reissued', { studentId });
  return r;
}

export async function revokeCode(ctx, data) {
  const { db, email } = ctx;
  const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
  const schoolYear = str(data.schoolYear, { name: 'schoolYear', min: 9, max: 9 });
  const reason = str(data.reason ?? '', { name: 'reason', max: 200 });
  const revoked = await revokeOpenCodes(db, studentId, schoolYear, email, reason);
  await audit(db, { action: 'code.revoked', actorType: 'staff', actorUid: email, targetType: 'student', targetId: studentId, details: { schoolYear, reason, revoked } });
  return { revoked };
}

// Guardian. Every failure is the same generic message to the caller; the
// real reason is logged (spec §3 "Redemption").
export async function activateCode(ctx, data) {
  const { db, now, uid, email } = ctx;
  const nowMs = now().getTime();
  const relationship = oneOf(data.relationship, [...RELATIONSHIPS, ADVISER], 'relationship');
  const slot = slotFor(relationship);
  // Checked before the code is read, so this specific message reveals
  // nothing about whether the code is valid.
  if (slot === 'adviser' && !isDepedEmail(email)) throw new CallableError('permission-denied', ADVISER_DEPED);
  // An adviser links a whole section's learners in one sitting, so they get
  // their own, higher limit than a guardian.
  await enforceRateLimit(db, uid, slot === 'adviser' ? 'activateAdviser' : 'activate', slot === 'adviser' ? LIMITS.activateAdviser : LIMITS.activate, nowMs);
  const consentVersion = int(data.consentVersion, { name: 'consentVersion', min: 0, max: 1000 });
  const code = normalizeCode(data.code);
  // The guardian's own name, typed (or prefilled from their Google account)
  // on the Activate screen. Optional for older clients, which fall back to
  // the name on the sign-in token.
  const guardianName = str(data.guardianName ?? '', { name: 'Your name', max: 120 }) || ctx.displayName || '';

  const fail = (reason) => { logWarn('activation_failed', { uid, reason, codeHash: isValidCode(code) ? hashCode(code) : null }); return new CallableError('failed-precondition', GENERIC); };
  if (!isValidCode(code)) throw fail('format');

  const portal = (await db.doc('settings/parent_portal').get()).data() || {};
  if ((portal.consentVersion ?? 1) !== consentVersion) throw fail('consent');

  const codeRef = db.doc(`activation_codes/${hashCode(code)}`);
  const codeDoc = (await codeRef.get()).data();
  if (!codeDoc) throw fail('unknown');
  // 'exhausted' can still have a free slot of the other kind (and legacy
  // codes were marked exhausted after two guardians); claimSlot decides.
  if (!isOpenStatus(codeDoc.status)) throw fail(codeDoc.status);

  // Slips are valid for their own school year until staff revoke them
  // (endSchoolYear / reissue) or end that year; changing currentSchoolYear
  // does not end them.
  const { studentId, schoolYear } = codeDoc;
  const yearRef = schoolYearRef(db, schoolYear);
  const [studentSnap, enrollSnap] = await Promise.all([db.doc(`students/${studentId}`).get(), db.doc(`enrollments/${studentId}_${schoolYear}`).get()]);
  const student = studentSnap.data(); const enrollment = enrollSnap.data();
  if (!student || student.activationRestricted === true) throw fail('restricted');
  if (!enrollment || enrollment.status !== 'enrolled') throw fail('not-enrolled');
  const section = (await db.doc(`sections/${enrollment.sectionId}`).get()).data();

  const linkRef = db.doc(`guardian_links/${uid}_${studentId}`);
  const profileRef = db.doc(`guardians/${uid}`);
  const learnerRef = db.doc(`learners/${studentId}`);
  const learner = learnerIdentity(student, section, schoolYear);
  const activeLinksQuery = db.collection('guardian_links').where('studentId', '==', studentId).where('status', '==', 'active');
  await db.runTransaction(async (tx) => {
    // The year is read in the transaction so an endSchoolYear running now
    // either refuses this link or expires it along with the year's others.
    const [c, link, profile, year, activeLinks] = await Promise.all([tx.get(codeRef), tx.get(linkRef), tx.get(profileRef), yearRef && tx.get(yearRef), tx.get(activeLinksQuery)]);
    const cd = c.data();
    if (!isOpenStatus(cd.status)) throw fail(cd.status);
    if (isEnded(year)) throw fail('year-ended');
    const alreadyActive = link.exists && link.data().status === 'active';
    // The learner's active links are the real cap (spec 2026-10-13 learner link cap):
    // links approved through access requests never touch a code's counters.
    // A link already active for this school year is already counted.
    if (!(alreadyActive && link.data().schoolYear === schoolYear)) {
      const used = slotsFromLinks(activeLinks.docs.filter((d) => d.id !== linkRef.id).map((d) => d.data()), schoolYear);
      if (slot === 'adviser' ? used.adviserRedemptions >= used.maxAdvisers : used.guardianRedemptions >= used.maxGuardians) throw fail('cap');
    }
    if (alreadyActive) {
      if ((link.data().slot ?? 'guardian') !== slot) throw fail('slot-mismatch');
      tx.update(codeRef, { lastRedeemedAt: FieldValue.serverTimestamp() });
    } else {
      const claim = claimSlot(cd, slot);
      if (!claim) throw fail('exhausted');
      tx.update(codeRef, { ...claim, redemptions: FieldValue.delete(), maxRedemptions: FieldValue.delete(), lastRedeemedAt: FieldValue.serverTimestamp() });
    }
    tx.set(linkRef, {
      guardianUid: uid, guardianName, guardianEmail: email || '', learnerName: learner.displayName,
      studentId, schoolYear, relationship, slot, status: 'active', activatedAt: FieldValue.serverTimestamp(), activatedVia: 'code',
      revokedAt: FieldValue.delete(), revokedBy: FieldValue.delete(), revokedReason: FieldValue.delete(),
      expiredAt: FieldValue.delete(), expiredReason: FieldValue.delete(),
    }, { merge: true });
    if (!profile.exists) {
      tx.set(profileRef, { email, displayName: guardianName, consentAcceptedAt: FieldValue.serverTimestamp(), consentVersion, notificationsEnabled: true, createdAt: FieldValue.serverTimestamp() });
    } else {
      const p = profile.data();
      const patch = {
        ...(p.consentVersion !== consentVersion ? { consentAcceptedAt: FieldValue.serverTimestamp(), consentVersion } : {}),
        ...(guardianName && p.displayName !== guardianName ? { displayName: guardianName } : {}),
      };
      if (Object.keys(patch).length) tx.update(profileRef, patch);
    }
    // Seed the learner's projection so the guardian's Home card shows the
    // learner's name straight away instead of waiting for a first gate scan.
    // Merge keeps any today/recent summary a scan already wrote.
    tx.set(learnerRef, learner, { merge: true });
  });
  await audit(db, { action: 'link.activated', actorType: 'guardian', actorUid: uid, targetType: 'student', targetId: studentId, details: { via: 'code', relationship, slot, codeHash: hashCode(code) } });
  logEvent('activation_succeeded', { uid, studentId });
  return { studentId, displayName: learner.displayName, sectionLabel: learner.sectionLabel };
}

// Guardian. Also creates the account when first-time learner linking is
// skipped. Read the live consent version here, never a client-supplied one.
// A transaction preserves existing preferences if linking happens at the
// same time as this write (for example, on another device).
export async function acceptConsent(ctx, data = {}) {
  const { db, uid, email, displayName } = ctx;
  const portal = (await db.doc('settings/parent_portal').get()).data() || {};
  const consentVersion = portal.consentVersion ?? 1;
  // Skip must confirm the notice the parent actually saw. Older re-consent
  // clients omit this field and continue to use the live server version.
  if (data.acceptedConsentVersion !== undefined && data.acceptedConsentVersion !== consentVersion) {
    throw new CallableError('failed-precondition', 'Please accept the current privacy notice.');
  }
  const ref = db.doc(`guardians/${uid}`);
  await db.runTransaction(async (tx) => {
    const profile = await tx.get(ref);
    tx.set(ref, {
      ...(!profile.exists ? {
        email: email || '', displayName: displayName || '',
        notificationsEnabled: true, audienceKeys: [], createdAt: FieldValue.serverTimestamp(),
        // Start the existing dormancy clock even if this account never links.
        lastActiveLinkAt: FieldValue.serverTimestamp(),
      } : {}),
      consentAcceptedAt: FieldValue.serverTimestamp(), consentVersion,
    }, { merge: true });
  });
  return { consentVersion };
}
