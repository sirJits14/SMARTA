import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { conflictingRole } from '../../shared/schoolAccess.js';
import { migrateAssignments } from '../lib/subjectTeacherMigration.js';
import { loadSchoolActor, requestKey, auditRow, rolesHeld } from './schoolAccess.js';

const isGrade = value => Number.isInteger(value) && value >= 7 && value <= 12;

// One-off, safe to re-run: Subject Teacher assignments and pending requests
// move from sections to grades. Accounts holding or requesting both Adviser and
// Subject Teacher this year are reported, never changed automatically.
export async function migrateSubjectTeachers(deps) {
  const { db } = deps;
  const actor = await loadSchoolActor(deps);
  if (!actor.isAdmin) throw new CallableError('permission-denied', 'Administrators only.');
  const grades = new Map((await db.collection('sections').get()).docs.map(d => [d.id, d.data().gradeLevel]));
  const sectionGrade = id => grades.get(id);
  let accountsChanged = 0; let requestsChanged = 0;
  const accounts = new Map();
  for (const snap of (await db.collection('school_accounts').get()).docs) {
    const after = await db.runTransaction(async tx => {
      const data = (await tx.get(snap.ref)).data() || {};
      const { assignments, changed } = migrateAssignments(data.assignments || [], sectionGrade);
      if (changed) tx.update(snap.ref, { assignments, updatedAt: FieldValue.serverTimestamp() });
      return { data, assignments, changed };
    });
    if (after.changed) accountsChanged++;
    accounts.set(snap.id, after);
  }
  const pending = await db.collection('school_role_requests').where('role', '==', 'subject_teacher').where('status', '==', 'pending').get();
  for (const snap of pending.docs.filter(d => d.data().sectionId)) {
    const converted = await db.runTransaction(async tx => {
      const r = (await tx.get(snap.ref)).data();
      if (r?.status !== 'pending' || !r.sectionId) return false;
      const { sectionId, ...rest } = r;
      const gradeLevel = sectionGrade(sectionId) ?? r.gradeLevel;
      if (!isGrade(gradeLevel)) return false;
      const assignment = { role: 'subject_teacher', schoolYear: r.schoolYear, gradeLevel };
      const target = db.doc(`school_role_requests/${requestKey(r.uid, assignment)}`);
      const existing = (await tx.get(target)).data();
      if (existing?.status !== 'pending') tx.set(target, { ...rest, gradeLevel });
      tx.update(snap.ref, { status: 'withdrawn', reason: 'Converted to a grade-level request', reviewedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (converted) requestsChanged++;
  }
  // Conflicts are computed last so converted requests are what get counted.
  const requestsByUid = new Map();
  for (const snap of (await db.collection('school_role_requests').where('status', '==', 'pending').get()).docs) {
    const r = snap.data();
    if (r.schoolYear !== actor.schoolYear || !r.uid) continue;
    requestsByUid.set(r.uid, [...(requestsByUid.get(r.uid) || []), snap]);
  }
  const conflicts = [];
  for (const uid of [...new Set([...accounts.keys(), ...requestsByUid.keys()])].sort()) {
    const account = accounts.get(uid);
    const requests = requestsByUid.get(uid) || [];
    const roles = rolesHeld(account?.assignments || [], requests, actor.schoolYear);
    if (!(roles.includes('adviser') && conflictingRole(roles, 'adviser'))) continue;
    const source = account?.data?.email ? account.data : requests[0].data();
    conflicts.push({ uid, email: source.email || '', displayName: source.displayName || account?.data?.displayName || '' });
  }
  const result = { accountsChanged, requestsChanged, conflicts };
  await db.collection('audit_log').add(auditRow(actor, 'school.subjectTeachersMigrated', actor.uid, { accountsChanged, requestsChanged, conflicts: conflicts.length }));
  return result;
}
