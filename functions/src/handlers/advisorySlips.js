import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { generateCode, hashCode, normalizeCode, isValidCode } from '../lib/activationCode.js';
import { sectionLabel } from '../lib/format.js';
import { scopedGrades } from '../../shared/staffRoles.js';
import { isDepedEmail } from '../../shared/schoolAccess.js';
import { loadSchoolActor, liveUser, prepareGrant, writeGrant, inboxRef, auditRow, teacherOf } from './schoolAccess.js';

// Advisory slips (spec 2026-10-19): one single-use code per section that makes
// a verified DepEd account the section's Class Adviser without review.
const fail = (code, message) => { throw new CallableError(code, message); };
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const lockPath = (schoolYear, sectionId) => `school_adviser_locks/${schoolYear}_${sectionId}`;
const covers = (profile, grade) => { const grades = scopedGrades(profile); return grades === null || grades.includes(Number(grade)); };
const audit = (email, action, sectionId, details) => ({ action, actorType: 'staff', actorUid: email,
  targetType: 'school_assignment', targetId: sectionId, details: { sectionId, ...details }, at: FieldValue.serverTimestamp() });

export async function currentYear(db) {
  const schoolYear = (await db.doc('settings/app').get()).data()?.currentSchoolYear;
  if (!/^\d{4}-\d{4}$/.test(schoolYear || '')) fail('failed-precondition', 'The school must configure the current school year.');
  const ended = Boolean((await db.doc(`school_years/${schoolYear}`).get()).data()?.endedAt);
  return { schoolYear, ended };
}

// Each section runs in its own transaction so one section's state never blocks another's.
export async function issueAdvisorySlips(deps, input) {
  const { db, uid, email, profile, now } = deps;
  const ids = Array.isArray(input.sectionIds) ? [...new Set(input.sectionIds)] : [];
  if (!ids.length || ids.length > 200 || !ids.every(id)) fail('invalid-argument', 'Choose 1–200 sections.');
  await enforceRateLimit(db, uid, 'issueAdvisorySlips', LIMITS.issueCodes, now().getTime());
  const { schoolYear, ended } = await currentYear(db);
  if (ended) fail('failed-precondition', `The ${schoolYear} school year has ended.`);
  const issued = []; const skipped = [];
  for (const sectionId of ids) {
    const result = await db.runTransaction(async tx => {
      const [sectionSnap, yearSnap] = await Promise.all([tx.get(db.doc(`sections/${sectionId}`)), tx.get(db.doc(`school_years/${schoolYear}`))]);
      const section = sectionSnap.data();
      // Re-checked inside the transaction so a concurrent endSchoolYear cannot slip past the up-front check.
      if (yearSnap.data()?.endedAt) return { skip: 'not-found' };
      if (!section || section.schoolYear !== schoolYear) return { skip: 'not-found' };
      if (!covers(profile, section.gradeLevel)) return { skip: 'out-of-scope' };
      const [lock, open] = await Promise.all([
        tx.get(db.doc(lockPath(schoolYear, sectionId))),
        tx.get(db.collection('advisory_slips').where('sectionId', '==', sectionId).where('status', '==', 'issued')),
      ]);
      if (lock.exists) return { skip: 'has-adviser' };
      for (const d of open.docs) tx.update(d.ref, { status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: email, revokedReason: 'reissued' });
      const code = generateCode(randomBytes(8));
      const label = sectionLabel(section);
      tx.create(db.doc(`advisory_slips/${hashCode(code)}`), { sectionId, gradeLevel: section.gradeLevel, sectionLabel: label, schoolYear,
        status: 'issued', issuedBy: email, issuedAt: FieldValue.serverTimestamp() });
      tx.set(db.collection('audit_log').doc(), audit(email, 'school.slipIssued', sectionId, { gradeLevel: section.gradeLevel, replaced: open.size }));
      return { slip: { sectionId, sectionLabel: label, gradeLevel: section.gradeLevel, schoolYear, code } };
    });
    if (result.slip) issued.push(result.slip); else skipped.push({ sectionId, reason: result.skip });
  }
  return { issued, skipped };
}

export async function revokeAdvisorySlip(deps, input) {
  const { db, email, profile } = deps;
  if (!id(input.sectionId)) fail('invalid-argument', 'Choose a section.');
  const { schoolYear } = await currentYear(db);
  return db.runTransaction(async tx => {
    const section = (await tx.get(db.doc(`sections/${input.sectionId}`))).data();
    if (!section || section.schoolYear !== schoolYear) fail('not-found', 'Section not found.');
    if (!covers(profile, section.gradeLevel)) fail('permission-denied', 'This section is outside your grades.');
    const open = await tx.get(db.collection('advisory_slips').where('sectionId', '==', input.sectionId).where('status', '==', 'issued'));
    for (const d of open.docs) tx.update(d.ref, { status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: email, revokedReason: 'revoked' });
    if (open.size) tx.set(db.collection('audit_log').doc(), audit(email, 'school.slipRevoked', input.sectionId, { gradeLevel: section.gradeLevel }));
    return { revoked: open.size };
  });
}

export async function listAdvisoryStatus(deps) {
  const { db, profile } = deps;
  const { schoolYear, ended } = await currentYear(db);
  const [sections, locks, slips] = await Promise.all([
    db.collection('sections').where('schoolYear', '==', schoolYear).get(),
    db.collection('school_adviser_locks').where('schoolYear', '==', schoolYear).get(),
    db.collection('advisory_slips').where('schoolYear', '==', schoolYear).where('status', '==', 'issued').get(),
  ]);
  const lockBySection = new Map(locks.docs.map(d => [d.data().sectionId, d.data().uid]));
  const accounts = new Map(await Promise.all([...new Set(lockBySection.values())]
    .map(async uid => [uid, (await db.doc(`school_accounts/${uid}`).get()).data() || {}])));
  const slipBySection = new Map(slips.docs.map(d => [d.data().sectionId, d.data()]));
  return { schoolYear, ended, sections: sections.docs.filter(d => covers(profile, d.data().gradeLevel)).map(d => {
    const uid = lockBySection.get(d.id);
    const account = uid ? accounts.get(uid) : null;
    const slip = slipBySection.get(d.id);
    return { sectionId: d.id,
      adviser: account ? { name: account.displayName || account.email || '', email: account.email || '' } : null,
      slip: slip ? { issuedAt: slip.issuedAt?.toMillis?.() ?? null, issuedBy: slip.issuedBy || '' } : null };
  }) };
}

const GENERIC = 'That advisory slip could not be used. Ask the school to issue a new one.';
const DEPED = 'Advisory slips need a DepEd email.';

// Only verified DepEd accounts may use a slip; this refusal describes the
// caller's own account, so it is safe to say. Everything else is generic.
async function slipCaller(deps, input) {
  const code = normalizeCode(input.code);
  if (!isValidCode(code)) fail('invalid-argument', GENERIC);
  const user = await liveUser(deps.auth, deps.uid);
  if (!isDepedEmail(user.email)) fail('permission-denied', DEPED);
  await enforceRateLimit(deps.db, deps.uid, 'advisorySlip', LIMITS.advisorySlip, (deps.now || (() => new Date()))().getTime());
  return { user, ref: deps.db.doc(`advisory_slips/${hashCode(code)}`) };
}
const usable = (slip, schoolYear, ended) => !ended && slip?.status === 'issued' && slip.schoolYear === schoolYear;

export async function previewAdvisorySlip(deps, input) {
  const { ref } = await slipCaller(deps, input);
  const { schoolYear, ended } = await currentYear(deps.db);
  const slip = (await ref.get()).data();
  if (!usable(slip, schoolYear, ended)) fail('not-found', GENERIC);
  return { sectionLabel: slip.sectionLabel, gradeLevel: slip.gradeLevel };
}

export async function redeemAdvisorySlip(deps, input) {
  const { user, ref } = await slipCaller(deps, input);
  const { db } = deps;
  return db.runTransaction(async tx => {
    const actor = await loadSchoolActor(deps, tx);
    const slip = (await tx.get(ref)).data();
    if (!usable(slip, actor.schoolYear, actor.ended)) fail('not-found', GENERIC);
    const section = (await tx.get(db.doc(`sections/${slip.sectionId}`))).data();
    if (!section || section.schoolYear !== actor.schoolYear || section.gradeLevel !== slip.gradeLevel) fail('not-found', GENERIC);
    const assignment = { role: 'adviser', schoolYear: actor.schoolYear, sectionId: slip.sectionId, gradeLevel: slip.gradeLevel };
    const requests = db.collection('school_role_requests');
    const forSection = await tx.get(requests.where('sectionId', '==', slip.sectionId).where('status', '==', 'pending'));
    const prepared = await prepareGrant(db, tx, deps.uid, assignment);
    // Already this section's adviser: refuse without consuming the slip.
    if (prepared.exists) fail('already-exists', 'You are already the adviser of this section.');
    // Reads end here. The slip's issuer is recorded as who assigned the role.
    writeGrant(tx, prepared, { ...actor, email: slip.issuedBy }, user, assignment, 'slip');
    tx.update(ref, { status: 'redeemed', redeemedBy: deps.uid, redeemedAt: FieldValue.serverTimestamp() });
    for (const request of forSection.docs) {
      const r = request.data();
      if (r.role !== 'adviser' || r.schoolYear !== actor.schoolYear) continue;
      const own = r.uid === deps.uid;
      tx.update(request.ref, { status: own ? 'fulfilled' : 'superseded', reason: own ? 'Assigned by advisory slip' : 'Section adviser assigned by slip',
        reviewedAt: FieldValue.serverTimestamp() });
      if (!own) tx.set(inboxRef(db, r.uid, `superseded:${request.id}`), { type: 'school_access', rejected: true,
        title: 'School access request closed', body: `Another teacher became the adviser of ${slip.sectionLabel} with an advisory slip.`,
        createdAt: FieldValue.serverTimestamp() });
    }
    tx.set(db.collection('audit_log').doc(), auditRow(actor, 'school.slipRedeemed', deps.uid, { ...assignment, issuedBy: slip.issuedBy, ...teacherOf(user) }));
    return { sectionId: slip.sectionId, sectionLabel: slip.sectionLabel, gradeLevel: slip.gradeLevel };
  });
}
