import { FieldValue } from 'firebase-admin/firestore';
import { isEnded } from './schoolYears.js';

// Each transaction rechecks the year, assignment, lock and section. Concurrent
// approvals/revocations cause a retry instead of restoring a stale assignment.
export async function backfillSectionAdvisers(db, { apply = false } = {}) {
  const schoolYear = (await db.doc('settings/app').get()).data()?.currentSchoolYear;
  if (!/^\d{4}-\d{4}$/.test(schoolYear || '')) throw new Error('Configure a valid current school year first.');
  if (isEnded(await db.doc(`school_years/${schoolYear}`).get())) throw new Error('The current school year has ended.');
  const sections = await db.collection('sections').where('schoolYear', '==', schoolYear).get();
  const result = { schoolYear, changed: [], warnings: [] };
  for (const candidate of sections.docs) {
    const outcome = await db.runTransaction(async tx => {
      const [settings, year, section, locked] = await Promise.all([
        tx.get(db.doc('settings/app')), tx.get(db.doc(`school_years/${schoolYear}`)), tx.get(candidate.ref),
        tx.get(db.doc(`school_adviser_locks/${schoolYear}_${candidate.id}`)),
      ]);
      if (settings.data()?.currentSchoolYear !== schoolYear || isEnded(year)) throw new Error('The school year changed or ended. Run the backfill again.');
      if (!section.exists || section.data().schoolYear !== schoolYear) return {};
      const lock = locked.data();
      if (!lock) return {};
      if (typeof lock.uid !== 'string' || !lock.uid || lock.uid.includes('/')) return { warning: 'Invalid adviser lock.' };
      const account = (await tx.get(db.doc(`school_accounts/${lock.uid}`))).data();
      const assignment = account?.assignments?.find(a => a.role === 'adviser' && a.schoolYear === schoolYear
        && a.sectionId === candidate.id && a.gradeLevel === section.data().gradeLevel);
      if (!assignment || lock.role !== 'adviser' || lock.sectionId !== candidate.id || lock.schoolYear !== schoolYear
        || lock.gradeLevel !== assignment.gradeLevel) return { warning: 'Lock and approved assignment do not match.' };
      const adviserName = account.displayName?.trim() || account.email?.trim();
      if (!adviserName) return { warning: 'The adviser account has no name or email.' };
      if (section.data().schoolAdviserUid === lock.uid && section.data().adviserName === adviserName) return {};
      if (apply) {
        tx.update(section.ref, { adviserName, schoolAdviserUid: lock.uid });
        tx.set(db.collection('audit_log').doc(), {
          action: 'section.adviserSynced', actorType: 'system', actorUid: 'section-adviser-backfill',
          targetType: 'section', targetId: candidate.id,
          details: { schoolYear, adviserUid: lock.uid }, at: FieldValue.serverTimestamp(),
        });
      }
      return { changed: true };
    });
    if (outcome.changed) result.changed.push(candidate.id);
    if (outcome.warning) result.warnings.push({ sectionId: candidate.id, reason: outcome.warning });
  }
  return result;
}
