import { audienceKeysFor } from '../../shared/announcements.js';

// Rebuilds guardians/{uid}.audienceKeys from the grades of the guardian's
// active links (announcements spec, "Guardian audience keys"). Never
// creates the guardian doc: the portal treats its existence as "activated".
export async function refreshGuardianAudience(db, uid) {
  const ref = db.doc(`guardians/${uid}`);
  const [guardian, links] = await Promise.all([
    ref.get(),
    db.collection('guardian_links').where('guardianUid', '==', uid).where('status', '==', 'active').get(),
  ]);
  if (!guardian.exists) return null;
  const grades = [];
  for (const l of links.docs) {
    const { studentId, schoolYear } = l.data();
    const enrollment = (await db.doc(`enrollments/${studentId}_${schoolYear}`).get()).data();
    let grade = enrollment?.gradeLevel;
    if (grade == null && enrollment?.sectionId) grade = (await db.doc(`sections/${enrollment.sectionId}`).get()).data()?.gradeLevel;
    if (grade != null) grades.push(Number(grade));
  }
  const keys = audienceKeysFor(grades);
  const current = guardian.data().audienceKeys;
  if (!Array.isArray(current) || current.join(',') !== keys.join(',')) await ref.update({ audienceKeys: keys });
  return keys;
}

// guardian_links/{id} trigger: only a change to who/which learner/status/
// school year can change the audience.
export function handleGuardianLinkWrite(db, { before, after }) {
  const uid = after?.guardianUid || before?.guardianUid;
  if (!uid) return null;
  const same = before && after && before.status === after.status
    && before.studentId === after.studentId && before.schoolYear === after.schoolYear;
  if (same) return null;
  return refreshGuardianAudience(db, uid);
}
