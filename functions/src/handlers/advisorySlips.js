import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { generateCode, hashCode } from '../lib/activationCode.js';
import { sectionLabel } from '../lib/format.js';
import { scopedGrades } from '../../shared/staffRoles.js';

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
      const section = (await tx.get(db.doc(`sections/${sectionId}`))).data();
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
      tx.set(db.doc(`advisory_slips/${hashCode(code)}`), { sectionId, gradeLevel: section.gradeLevel, sectionLabel: label, schoolYear,
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
