import { randomInt } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { currentYear } from './advisorySlips.js';
import { makePassCode, passGrades, canManagePasses, tempPassBlocker, isOfficialCardPrinted } from '../../shared/tempPass.js';

// Temporary ID Passes (spec 2026-11-27). temp_passes/{studentId} is written only here.
const fail = (code, message) => { throw new CallableError(code, message); };
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const validGrade = grade => Number.isInteger(grade) && grade >= 7 && grade <= 12;
const audit = (actorUid, action, studentId, details) => ({ action, actorType: 'staff', actorUid,
  targetType: 'temp_pass', targetId: studentId, details, at: FieldValue.serverTimestamp() });

export async function issueTempPasses(deps, input) {
  const { db, uid, email, profile, now } = deps;
  if (!canManagePasses(profile)) fail('permission-denied', 'Temporary passes are for administrators and academic coordinators.');
  const ids = Array.isArray(input.studentIds) ? [...new Set(input.studentIds)] : [];
  if (!ids.length || ids.length > 200 || !ids.every(identifier)) fail('invalid-argument', 'Choose 1–200 learners.');
  await enforceRateLimit(db, uid, 'tempPass', LIMITS.tempPass, now().getTime());
  const { schoolYear, ended } = await currentYear(db);
  if (ended) fail('failed-precondition', `The ${schoolYear} school year has ended.`);
  const grades = passGrades(profile);
  const issued = []; const skipped = [];
  for (const studentId of ids) {
    const result = await db.runTransaction(async tx => {
      const passRef = db.doc(`temp_passes/${studentId}`);
      const [student, enrollment, pass] = await Promise.all([
        tx.get(db.doc(`students/${studentId}`)), tx.get(db.doc(`enrollments/${studentId}_${schoolYear}`)), tx.get(passRef),
      ]);
      const sectionId = enrollment.data()?.sectionId;
      const section = identifier(sectionId) ? (await tx.get(db.doc(`sections/${sectionId}`))).data() : undefined;
      const blocker = tempPassBlocker({ student: student.data(), enrollment: enrollment.data(), section, schoolYear });
      // Scope is checked before the learner's own details are described.
      if (grades !== null && section && !grades.includes(section.gradeLevel)) return { skip: 'out-of-scope' };
      if (blocker) return { skip: blocker };
      // An incomplete section record skips its learner instead of failing the whole batch.
      if (!validGrade(section.gradeLevel)) return { skip: 'not-enrolled' };
      const placement = { sectionId, gradeLevel: section.gradeLevel };
      const current = pass.data();
      const lrn = student.data().lrn;
      if (current?.status === 'active' && current.lrn === lrn && current.schoolYear === schoolYear) {
        if (current.sectionId !== sectionId || current.gradeLevel !== section.gradeLevel) tx.update(passRef, placement);
        return { code: current.code };
      }
      const code = makePassCode(randomInt);
      tx.set(passRef, { code, status: 'active', lrn, ...placement, schoolYear, issuedBy: email, issuedAt: FieldValue.serverTimestamp() });
      tx.set(db.collection('audit_log').doc(), audit(email, 'tempPass.issued', studentId, placement));
      return { code };
    });
    if (result.code) issued.push({ studentId, code: result.code }); else skipped.push({ studentId, reason: result.skip });
  }
  return { issued, skipped };
}

export async function revokeTempPass(deps, input) {
  const { db, email } = deps;
  if (!identifier(input.studentId)) fail('invalid-argument', 'Choose a learner.');
  return db.runTransaction(async tx => {
    const ref = db.doc(`temp_passes/${input.studentId}`);
    const pass = (await tx.get(ref)).data();
    if (pass?.status !== 'active') return { revoked: 0 };
    tx.update(ref, { status: 'revoked', endedReason: 'revoked', endedBy: email, endedAt: FieldValue.serverTimestamp() });
    tx.set(db.collection('audit_log').doc(), audit(email, 'tempPass.revoked', input.studentId, { gradeLevel: pass.gradeLevel }));
    return { revoked: 1 };
  });
}

function ending(pass, student, enrollment) {
  if (!student) return ['revoked', 'learner_removed'];
  if (isOfficialCardPrinted(student)) return ['superseded', 'official_id_printed'];
  if (student.lrn !== pass.lrn) return ['superseded', 'lrn_changed'];
  if ((student.status ?? 'active') !== 'active') return ['revoked', 'learner_inactive'];
  if (!enrollment || enrollment.status !== 'enrolled') return ['revoked', 'enrollment_ended'];
  return null;
}

// Re-reads current records, so repeated or out-of-order triggers settle the same way.
export async function reconcileTempPass(db, studentId) {
  const ref = db.doc(`temp_passes/${studentId}`);
  // Most learners have no pass: skip the transaction for them (imports write thousands).
  if ((await ref.get()).data()?.status !== 'active') return 'none';
  return db.runTransaction(async tx => {
    const pass = (await tx.get(ref)).data();
    if (pass?.status !== 'active') return 'none';
    const [student, enrollment] = await Promise.all([
      tx.get(db.doc(`students/${studentId}`)), tx.get(db.doc(`enrollments/${studentId}_${pass.schoolYear}`)),
    ]);
    const end = ending(pass, student.data(), enrollment.data());
    if (end) {
      const [status, endedReason] = end;
      tx.update(ref, { status, endedReason, endedBy: 'system', endedAt: FieldValue.serverTimestamp() });
      tx.set(db.collection('audit_log').doc(), { ...audit('system', `tempPass.${status}`, studentId, { reason: endedReason }), actorType: 'system' });
      return status;
    }
    const { sectionId } = enrollment.data();
    // Throwing on an incomplete record would retry forever, so the old placement stays.
    if (sectionId === pass.sectionId || !identifier(sectionId)) return 'kept';
    const section = (await tx.get(db.doc(`sections/${sectionId}`))).data();
    if (!validGrade(section?.gradeLevel)) return 'kept';
    tx.update(ref, { sectionId, gradeLevel: section.gradeLevel });
    return 'moved';
  });
}
