import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { loadSchoolActor, inboxRef, auditRow, teacherOf } from './schoolAccess.js';

const ROLE = 'subject_teacher';
const REASON = 'The Subject Teacher role was retired.';
export const RETIRED_NOTE = { type: 'school_access', title: 'Subject Teacher access has ended',
  body: "BNHS no longer uses the Subject Teacher role, so these notices stop. If you are a class adviser or a learner's parent or guardian, add that role in Settings → Add a role." };

// Subject Teacher was retired on 2026-10-20 (spec 2026-10-20). One-off and safe
// to re-run: {} only counts; { apply: true } removes every Subject Teacher row,
// rejects pending requests, and tells current-year holders why notices stopped.
export async function retireSubjectTeachers(deps, input = {}) {
  const { db } = deps;
  const actor = await loadSchoolActor(deps);
  if (!actor.isAdmin) throw new CallableError('permission-denied', 'Administrators only.');
  const subjectRows = data => (data?.assignments || []).filter(a => a.role === ROLE);
  const holders = (await db.collection('school_accounts').get()).docs.filter(snap => subjectRows(snap.data()).length);
  const requests = (await db.collection('school_role_requests').where('role', '==', ROLE).where('status', '==', 'pending').get()).docs;
  if (input.apply !== true) {
    return { dryRun: true, accounts: holders.length, rows: holders.reduce((n, snap) => n + subjectRows(snap.data()).length, 0), requests: requests.filter(snap => snap.data().uid).length };
  }
  let accounts = 0; let rows = 0; let closed = 0;
  for (const snap of holders) {
    const removed = await db.runTransaction(async tx => {
      const data = (await tx.get(snap.ref)).data() || {};
      const gone = subjectRows(data);
      if (!gone.length) return 0;
      tx.update(snap.ref, { assignments: (data.assignments || []).filter(a => a.role !== ROLE), updatedAt: FieldValue.serverTimestamp() });
      tx.set(db.collection('audit_log').doc(), auditRow(actor, 'school.roleRetired', snap.id, { role: ROLE, removed: gone, ...teacherOf(data) }));
      if (gone.some(a => a.schoolYear === actor.schoolYear)) {
        tx.set(inboxRef(db, snap.id, `retired:${ROLE}`), { ...RETIRED_NOTE, createdAt: FieldValue.serverTimestamp() });
      }
      return gone.length;
    });
    if (removed) { accounts++; rows += removed; }
  }
  for (const snap of requests) {
    const done = await db.runTransaction(async tx => {
      const request = (await tx.get(snap.ref)).data();
      if (request?.status !== 'pending' || request.role !== ROLE || !request.uid) return false;
      tx.update(snap.ref, { status: 'rejected', reason: REASON, reviewedBy: actor.uid, reviewedAt: FieldValue.serverTimestamp() });
      tx.set(inboxRef(db, request.uid, `rejected:${snap.id}`), { type: 'school_access', rejected: true,
        title: 'School access request not approved', body: `Reason: ${REASON}`, createdAt: FieldValue.serverTimestamp() });
      tx.set(db.collection('audit_log').doc(), auditRow(actor, 'school.requestRejected', request.uid,
        { requestId: snap.id, reason: REASON, role: ROLE, sectionId: request.sectionId || '', gradeLevel: request.gradeLevel ?? null, ...teacherOf(request) }));
      return true;
    });
    if (done) closed++;
  }
  return { dryRun: false, accounts, rows, requests: closed };
}
