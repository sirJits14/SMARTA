import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { conflictingRole } from '../../shared/schoolAccess.js';
import { migrateAssignments } from '../lib/subjectTeacherMigration.js';
import { loadSchoolActor, requestKey, auditRow } from './schoolAccess.js';

// One-off, safe to re-run: Subject Teacher assignments and pending requests
// move from sections to grades. Accounts holding both Adviser and Subject
// Teacher are reported, never changed automatically.
export async function migrateSubjectTeachers(deps) {
  const { db } = deps;
  const actor = await loadSchoolActor(deps);
  if (!actor.isAdmin) throw new CallableError('permission-denied', 'Administrators only.');
  const grades = new Map((await db.collection('sections').get()).docs.map(d => [d.id, d.data().gradeLevel]));
  const sectionGrade = id => grades.get(id);
  let accountsChanged = 0; let requestsChanged = 0; const conflicts = [];
  for (const snap of (await db.collection('school_accounts').get()).docs) {
    const after = await db.runTransaction(async tx => {
      const data = (await tx.get(snap.ref)).data() || {};
      const { assignments, changed } = migrateAssignments(data.assignments || [], sectionGrade);
      if (changed) tx.update(snap.ref, { assignments, updatedAt: FieldValue.serverTimestamp() });
      return { data, assignments, changed };
    });
    if (after.changed) accountsChanged++;
    const roles = after.assignments.filter(a => a.schoolYear === actor.schoolYear).map(a => a.role);
    if (roles.includes('adviser') && conflictingRole(roles, 'adviser')) conflicts.push({ uid: snap.id, email: after.data.email || '', displayName: after.data.displayName || '' });
  }
  const pending = await db.collection('school_role_requests').where('role', '==', 'subject_teacher').where('status', '==', 'pending').get();
  for (const snap of pending.docs.filter(d => d.data().sectionId)) {
    await db.runTransaction(async tx => {
      const r = (await tx.get(snap.ref)).data();
      if (r?.status !== 'pending' || !r.sectionId) return;
      const { sectionId, ...rest } = r;
      const assignment = { role: 'subject_teacher', schoolYear: r.schoolYear, gradeLevel: sectionGrade(sectionId) ?? r.gradeLevel };
      const target = db.doc(`school_role_requests/${requestKey(r.uid, assignment)}`);
      const existing = (await tx.get(target)).data();
      if (existing?.status !== 'pending') tx.set(target, { ...rest, gradeLevel: assignment.gradeLevel });
      tx.update(snap.ref, { status: 'withdrawn', reason: 'Converted to a grade-level request', reviewedAt: FieldValue.serverTimestamp() });
    });
    requestsChanged++;
  }
  const result = { accountsChanged, requestsChanged, conflicts };
  await db.collection('audit_log').add(auditRow(actor, 'school.subjectTeachersMigrated', actor.uid, { accountsChanged, requestsChanged, conflicts: conflicts.length }));
  return result;
}
