import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { coordinatorCanEditSection } from '../../shared/sectionEditing.js';
import { isEnded } from '../lib/schoolYears.js';

const FIELDS = ['name', 'adviserName', 'scheduleId'];
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 200
  && value !== '.' && value !== '..' && !value.includes('/');
const invalid = message => { throw new CallableError('invalid-argument', message); };
const denied = () => { throw new CallableError('permission-denied', 'You can edit only your grade’s sections for the current or next school year.'); };

function validateInput(data, editing) {
  const allowed = editing ? ['sectionId', ...FIELDS] : ['sectionId'];
  if (!data || Array.isArray(data) || typeof data !== 'object'
      || Object.keys(data).some(key => !allowed.includes(key)) || !validId(data.sectionId)) {
    invalid('Choose an existing section and use only the permitted fields.');
  }
  if (!editing) return;
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 200) invalid('Enter a section name of up to 200 characters.');
  if (typeof data.adviserName !== 'string' || data.adviserName.trim().length > 200) invalid('Enter an adviser name of up to 200 characters.');
  if (data.scheduleId !== null && !validId(data.scheduleId)) invalid('Choose an existing schedule.');
}

// staffCall authenticates/App-Checks the request. Re-reading these records inside
// the transaction also protects against a concurrent grade, role or year change.
async function editableSection(tx, { db, email, uid, profile: authenticatedProfile }, sectionId) {
  const ref = db.doc(`sections/${sectionId}`);
  const [staff, settings, snapshot] = await Promise.all([
    tx.get(db.doc(`users/${email}`)), tx.get(db.doc('settings/app')), tx.get(ref),
  ]);
  const profile = staff.data();
  if (!profile || (profile.uid && profile.uid !== uid)
      || (profile.sessionValidAfter ?? 0) !== (authenticatedProfile?.sessionValidAfter ?? 0)) denied();
  if (!snapshot.exists) throw new CallableError('not-found', 'This section no longer exists. Refresh the sections list.');
  const section = snapshot.data();
  if (!coordinatorCanEditSection(profile, section, settings.data()?.currentSchoolYear)) denied();
  if (isEnded(await tx.get(db.doc(`school_years/${section.schoolYear}`)))) denied();
  return { ref, section };
}

// Gives this editor only the public shift labels it needs. Direct schedule reads
// retain the existing grade boundary; no section memberships are returned.
export async function getCoordinatorSectionOptions(ctx, data) {
  validateInput(data, false);
  return ctx.db.runTransaction(async tx => {
    await editableSection(tx, ctx, data.sectionId);
    const schedules = await tx.get(ctx.db.collection('schedules').select('name'));
    return { schedules: schedules.docs.map(doc => ({ id: doc.id, name: doc.data().name || '' }))
      .sort((a, b) => a.name.localeCompare(b.name)) };
  });
}

export async function updateCoordinatorSection(ctx, data) {
  validateInput(data, true);
  const patch = { name: data.name.trim(), adviserName: data.adviserName.trim(), scheduleId: data.scheduleId };
  const auditRef = ctx.db.collection('audit_log').doc();
  return ctx.db.runTransaction(async tx => {
    const { ref, section } = await editableSection(tx, ctx, data.sectionId);
    if (section.schoolAdviserUid && patch.adviserName !== section.adviserName) {
      throw new CallableError('failed-precondition', 'This adviser is managed by School Access. Refresh the section and change the Class Adviser assignment there.');
    }
    const scheduleIds = [...new Set([section.scheduleId, patch.scheduleId].filter(validId))];
    const schedules = await Promise.all(scheduleIds.map(id => tx.get(ctx.db.doc(`schedules/${id}`))));
    if (patch.scheduleId && !schedules[scheduleIds.indexOf(patch.scheduleId)]?.exists) invalid('This schedule no longer exists. Choose another schedule.');
    const moved = (section.scheduleId || null) !== patch.scheduleId;
    // Both admin saves and these saves read/write the schedule documents. A
    // concurrent reassignment therefore retries before either audience is saved.
    const audiences = moved ? await Promise.all(scheduleIds.map(async id => {
      const linked = await tx.get(ctx.db.collection('sections').where('scheduleId', '==', id).select('gradeLevel'));
      const grades = linked.docs.filter(doc => doc.id !== ref.id).map(doc => doc.data().gradeLevel);
      if (patch.scheduleId === id) grades.push(section.gradeLevel);
      return [...new Set(grades.filter(grade => Number.isInteger(grade) && grade >= 7 && grade <= 12))].sort((a, b) => a - b);
    })) : [];
    const fields = FIELDS.filter(key => (section[key] ?? (key === 'scheduleId' ? null : '')) !== patch[key]);
    if (!fields.length) return { ok: true };
    tx.update(ref, patch);
    if (moved) schedules.forEach((schedule, i) => {
      if (schedule.exists) tx.update(schedule.ref, { gradeLevels: audiences[i] });
    });
    tx.set(auditRef, {
      action: 'section.edited', actorType: 'staff', actorUid: ctx.email, targetType: 'section', targetId: ref.id,
      details: { gradeLevel: section.gradeLevel, schoolYear: section.schoolYear, fields }, at: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  });
}
