import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { loadSchoolActor } from './schoolAccess.js';
import { roleOf } from '../../shared/staffRoles.js';
import { isFamilyLink } from '../../shared/schoolAccess.js';
import { photoPath, photoBytesError, PHOTO_MAX_BYTES } from '../../shared/studentPhoto.js';
import { passGrades } from '../../shared/tempPass.js';

// Learner photos (spec 2026-11-27). Storage rules deny every client, so this
// file is the only door: it decides who may see or replace a photo.
const fail = (code, message) => { throw new CallableError(code, message); };
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const DENIED = 'You do not have access to this learner’s photo.';
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

async function photoAccess(deps, studentId) {
  const { db, uid } = deps;
  const actor = await loadSchoolActor(deps);
  const [profileSnap, studentSnap, enrollmentSnap, linkSnap] = await Promise.all([
    db.doc(`users/${actor.email}`).get(),
    db.doc(`students/${studentId}`).get(),
    db.doc(`enrollments/${studentId}_${actor.schoolYear}`).get(),
    db.doc(`guardian_links/${uid}_${studentId}`).get(),
  ]);
  const profile = profileSnap.data();
  const staff = profile && profile.disabled !== true && (!profile.uid || profile.uid === uid) && roleOf(profile) ? profile : null;
  const enrollment = enrollmentSnap.data();
  const found = enrollment?.status === 'enrolled' && identifier(enrollment.sectionId)
    ? (await db.doc(`sections/${enrollment.sectionId}`).get()).data() : null;
  // Only a section of this school year is the learner's current one.
  const section = found?.schoolYear === actor.schoolYear ? found : null;
  const grades = staff ? passGrades(staff) : [];
  const advises = Boolean(section)
    && actor.assignments.some(a => a.role === 'adviser' && a.sectionId === enrollment.sectionId);
  const canWrite = grades === null || (Boolean(section) && grades.includes(section.gradeLevel)) || advises;
  const link = linkSnap.data();
  const guardian = isFamilyLink(link) && link.guardianUid === uid;
  return { actor, student: studentSnap.exists ? studentSnap.data() : null, canWrite, canRead: canWrite || guardian };
}

export async function saveStudentPhoto(deps, input) {
  const { db, bucket, uid } = deps;
  const { studentId, contentBase64 } = input;
  if (!identifier(studentId)) fail('invalid-argument', 'Choose a learner.');
  if (typeof contentBase64 !== 'string' || contentBase64.length > Math.ceil(PHOTO_MAX_BYTES * 4 / 3) + 4
      || !BASE64.test(contentBase64)) fail('invalid-argument', 'The photo must be a JPEG of 200 KB or less.');
  const bytes = Buffer.from(contentBase64, 'base64');
  const problem = photoBytesError(bytes);
  if (problem) fail('invalid-argument', problem);
  const access = await photoAccess(deps, studentId);
  if (!access.canWrite || !access.student) fail('permission-denied', DENIED);
  await enforceRateLimit(db, uid, 'studentPhoto', LIMITS.studentPhoto, deps.now().getTime());
  const path = photoPath(studentId);
  await bucket.file(path).save(bytes, { resumable: false, contentType: 'image/jpeg', metadata: { cacheControl: 'private, max-age=0, no-store' } });
  const updatedAt = Timestamp.fromDate(deps.now());
  const studentRef = db.doc(`students/${studentId}`);
  const learnerRef = db.doc(`learners/${studentId}`);
  await db.runTransaction(async tx => {
    const [student, learner] = await Promise.all([tx.get(studentRef), tx.get(learnerRef)]);
    if (!student.exists) fail('not-found', 'Learner not found.');
    tx.update(studentRef, { photo: { path, updatedAt, updatedBy: access.actor.email } });
    if (learner.exists) tx.update(learnerRef, { photoUpdatedAt: updatedAt });
    tx.set(db.collection('audit_log').doc(), { action: 'student.photoSaved', actorType: 'staff', actorUid: access.actor.email,
      targetType: 'student', targetId: studentId, details: {}, at: FieldValue.serverTimestamp() });
  });
  return { ok: true, updatedAt: updatedAt.toMillis() };
}

export async function getStudentPhoto(deps, input) {
  if (!identifier(input.studentId)) fail('invalid-argument', 'Choose a learner.');
  const access = await photoAccess(deps, input.studentId);
  if (!access.canRead) fail('permission-denied', DENIED);
  if (!access.student?.photo?.path) return { photo: null };
  try {
    const [bytes] = await deps.bucket.file(photoPath(input.studentId)).download();
    return { photo: { contentBase64: bytes.toString('base64'), updatedAt: access.student.photo.updatedAt?.toMillis?.() ?? null } };
  } catch (e) {
    if (e?.code === 404) return { photo: null };
    throw e;
  }
}

export const deletePhotoFile = (bucket, studentId) => bucket.file(photoPath(studentId)).delete({ ignoreNotFound: true });
