import { Timestamp } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { coversPostKeys, postAudienceKeys, isVisibleToParents, toMillis, TITLE_MAX, BODY_MAX, MAX_PINNED, manilaDateTime, endOfManilaDay } from '../../shared/announcements.js';
import { ANNOUNCEMENT_ROLES, matchesAnnouncementAudience } from '../../shared/announcementAudience.js';
import { isFamilyLink, isGradeRole } from '../../shared/schoolAccess.js';
import { loadSchoolActor } from './schoolAccess.js';

const rows = snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
const validId = value => typeof value === 'string' && /^[^/]{1,128}$/.test(value);
const viewOf = value => { if (value !== undefined && !['family', 'school'].includes(value)) throw new CallableError('invalid-argument', 'Choose Family or School.'); return value || 'family'; };

// Resolve enrollment and section at request/send time. Legacy adviser links
// and cached guardians.audienceKeys cannot authorize a role-targeted notice.
export async function announcementPeople(db, uid = null, targetSectionIds = []) {
  const schoolYear = (await db.doc('settings/app').get()).data()?.currentSchoolYear;
  if (!schoolYear) return new Map();
  const ended = (await db.doc(`school_years/${schoolYear}`).get()).data()?.endedAt;
  const [linkSnap, accountSnap] = await Promise.all([
    (uid ? db.collection('guardian_links').where('guardianUid', '==', uid) : db.collection('guardian_links').where('schoolYear', '==', schoolYear)).get(),
    uid ? db.doc(`school_accounts/${uid}`).get() : db.collection('school_accounts').get(),
  ]);
  const activeLinks = rows(linkSnap).filter(link => link.schoolYear === schoolYear && isFamilyLink(link));
  const accounts = uid ? (accountSnap.exists ? [{ id: uid, ...accountSnap.data() }] : []) : rows(accountSnap);
  const enrollmentRows = uid
    ? (await Promise.all([...new Set(activeLinks.map(link => link.studentId))].map(studentId => db.doc(`enrollments/${studentId}_${schoolYear}`).get())))
      .filter(snapshot => snapshot.exists).map(snapshot => snapshot.data())
    : rows(await db.collection('enrollments').where('schoolYear', '==', schoolYear).get());
  const enrollments = new Map(enrollmentRows.filter(e => e.schoolYear === schoolYear && e.status === 'enrolled').map(e => [e.studentId, e]));
  const sectionIds = [...new Set([...enrollments.values()].map(e => e.sectionId).concat(accounts.flatMap(account => (account.assignments || []).map(a => a.sectionId)), targetSectionIds).filter(validId))];
  const sections = uid
    ? (await Promise.all(sectionIds.map(sectionId => db.doc(`sections/${sectionId}`).get()))).filter(snapshot => snapshot.exists && snapshot.data().schoolYear === schoolYear).map(snapshot => ({ id: snapshot.id, ...snapshot.data() }))
    : rows(await db.collection('sections').where('schoolYear', '==', schoolYear).get());
  const sectionById = new Map(sections.map(section => [section.id, section]));
  const people = new Map();
  const person = id => { if (!people.has(id)) people.set(id, { schoolYear, sections, family: [], assignments: [] }); return people.get(id); };
  for (const link of activeLinks) {
    const section = sectionById.get(enrollments.get(link.studentId)?.sectionId);
    if (section && link.guardianUid) person(link.guardianUid).family.push({ sectionId: section.id, gradeLevel: Number(section.gradeLevel) });
  }
  for (const account of accounts) {
    if (account.disabled === true || ended) continue;
    person(account.id).assignments = (account.assignments || []).filter(assignment => {
      if (assignment.schoolYear !== schoolYear || !ANNOUNCEMENT_ROLES.includes(assignment.role) || assignment.role === 'family') return false;
      // Grade roles (Curriculum Adviser, grade-level Subject Teacher) carry no section; a section-bound legacy row still needs its section check.
      if (assignment.role === 'curriculum_adviser' || (isGradeRole(assignment.role) && !assignment.sectionId)) return Number.isInteger(assignment.gradeLevel) && assignment.gradeLevel >= 7 && assignment.gradeLevel <= 12;
      return Number(sectionById.get(assignment.sectionId)?.gradeLevel) === assignment.gradeLevel;
    });
  }
  return people;
}

async function recipient(deps, view, sectionIds) {
  const person = (await announcementPeople(deps.db, deps.uid, sectionIds)).get(deps.uid);
  if (view === 'school') {
    const actor = await loadSchoolActor(deps);
    if (person) person.assignments = person.assignments.filter(assignment => actor.assignments.some(current => JSON.stringify(current) === JSON.stringify(assignment)));
  }
  return person;
}
const serializePost = (post) => ({ id: post.id, title: post.title, body: post.body, audience: post.audience, audienceKeys: post.audienceKeys,
  pinned: post.pinned === true, status: post.status, publishedAt: toMillis(post.publishedAt), expiresAt: toMillis(post.expiresAt), editedAt: toMillis(post.editedAt) });

export async function getPortalAnnouncements(deps, data = {}) {
  const view = viewOf(data.view), max = data.max ?? 50;
  if (!Number.isInteger(max) || max < 1 || max > 50) throw new CallableError('invalid-argument', 'Choose up to 50 notices.');
  const snap = await deps.db.collection('announcements').where('status', '==', 'published').get();
  const posts = rows(snap);
  const person = await recipient(deps, view, posts.flatMap(post => post.audience?.sectionIds || []));
  if (!person) return { rows: [] };
  const at = deps.now().getTime();
  return { rows: posts.filter(post => isVisibleToParents(post, at) && matchesAnnouncementAudience(post.audience, person, view))
    .sort((a, b) => (toMillis(b.publishedAt) || 0) - (toMillis(a.publishedAt) || 0)).slice(0, max).map(serializePost) };
}

export async function getPortalAnnouncement(deps, data = {}) {
  if (!validId(data.id)) throw new CallableError('invalid-argument', 'Choose an announcement.');
  const view = viewOf(data.view);
  const snapshot = await deps.db.doc(`announcements/${data.id}`).get();
  const post = snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
  const person = await recipient(deps, view, post?.audience?.sectionIds || []);
  if (!person || !post || !isVisibleToParents(post, deps.now().getTime()) || !matchesAnnouncementAudience(post.audience, person, view)) throw new CallableError('not-found', 'This announcement is unavailable.');
  return { post: serializePost(post) };
}

export async function validateAnnouncementAudience(db, reader, audience, profile, schoolYear) {
  if (!audience || !Array.isArray(audience.roles) || !audience.roles.length || audience.roles.some(role => !ANNOUNCEMENT_ROLES.includes(role))
    || (audience.all !== true && (!Array.isArray(audience.grades) || !audience.grades.length || audience.grades.some(g => !Number.isInteger(g) || g < 7 || g > 12)))
    || (audience.sectionIds !== undefined && (!Array.isArray(audience.sectionIds) || audience.sectionIds.length > 200 || audience.sectionIds.some(id => !validId(id))))) {
    throw new CallableError('invalid-argument', 'Choose valid recipient roles, grades and sections.');
  }
  const audienceKeys = postAudienceKeys(audience);
  if (!coversPostKeys(profile, audienceKeys)) throw new CallableError('permission-denied', 'You can only post to your own grades.');
  const sections = await Promise.all([...new Set(audience.sectionIds || [])].map(id => reader.get(db.doc(`sections/${id}`))));
  for (const section of sections) {
    const value = section.data();
    if (!section.exists || value.schoolYear !== schoolYear || (!audience.all && !audience.grades.includes(Number(value.gradeLevel)))) throw new CallableError('invalid-argument', 'Every selected section must belong to the selected grades and current school year.');
  }
  return { ...(audience.all ? { all: true } : { grades: [...new Set(audience.grades)].sort((a,b) => a-b) }), roles: [...new Set(audience.roles)],
    ...(audience.sectionIds?.length ? { sectionIds: [...new Set(audience.sectionIds)] } : {}) };
}

// Role-targeted authoring runs on the server because rules cannot validate
// an arbitrary selection of section -> grade mappings atomically.
export async function savePortalAnnouncement(deps, data = {}) {
  const f = data.form || {}, id = data.id;
  if (id !== undefined && !validId(id)) throw new CallableError('invalid-argument', 'Choose an announcement.');
  const title = typeof f.title === 'string' ? f.title.trim() : '', body = typeof f.body === 'string' ? f.body.trim() : '';
  if (!title || title.length > TITLE_MAX || !body || body.length > BODY_MAX || typeof f.pinned !== 'boolean' || typeof f.push !== 'boolean') throw new CallableError('invalid-argument', 'Enter a valid title, message and options.');
  const at = deps.now(), stamp = Timestamp.fromDate(at), ref = id ? deps.db.doc(`announcements/${id}`) : deps.db.collection('announcements').doc();
  return deps.db.runTransaction(async tx => {
    const [settings, staff, previous] = await Promise.all([tx.get(deps.db.doc('settings/app')), tx.get(deps.db.doc(`users/${deps.email}`)), tx.get(ref)]);
    const profile = staff.data(), before = previous.data();
    if (!profile || profile.disabled || (profile.uid && profile.uid !== deps.uid) || (id && (!before || !['scheduled', 'published'].includes(before.status)))) throw new CallableError('permission-denied', 'You cannot edit this announcement.');
    if (profile.mustChangePassword === true || !Number.isSafeInteger(profile.sessionValidAfter ?? 0) || (profile.sessionValidAfter ?? 0) < 0
      || (profile.sessionValidAfter > 0 && (!Number.isSafeInteger(deps.authTime) || deps.authTime < profile.sessionValidAfter))) throw new CallableError('unauthenticated', 'Your session has ended. Sign in again.');
    if (before && !coversPostKeys(profile, before.audienceKeys)) throw new CallableError('permission-denied', 'You can only post to your own grades.');
    const live = before?.status === 'published';
    const audience = live ? before.audience : await validateAnnouncementAudience(deps.db, tx, { ...(f.all ? { all: true } : { grades: f.grades }), roles: f.roles, sectionIds: f.sectionIds }, profile, settings.data()?.currentSchoolYear);
    let publishAt = live ? before.publishAt : before ? Timestamp.fromDate(manilaDateTime(f.date, f.time)) : f.when === 'now' ? stamp : Timestamp.fromDate(manilaDateTime(f.date, f.time));
    if (!Number.isFinite(publishAt?.toMillis()) || (!live && (before || f.when !== 'now') && publishAt.toMillis() <= at.getTime())) throw new CallableError('invalid-argument', 'Choose a publish time in the future.');
    const expiresAt = f.expires ? Timestamp.fromDate(endOfManilaDay(f.expires)) : null;
    if (expiresAt && (!Number.isFinite(expiresAt.toMillis()) || expiresAt.toMillis() <= (live ? at.getTime() : publishAt.toMillis()))) throw new CallableError('invalid-argument', 'The expiry date must be after publication.');
    if (f.pinned && !before?.pinned) {
      const pins = await tx.get(deps.db.collection('announcements').where('pinned', '==', true));
      if (pins.docs.filter(p => ['published','scheduled'].includes(p.data().status)).length >= MAX_PINNED) throw new CallableError('failed-precondition', 'Unpin another announcement first.');
    }
    const author = { uid: deps.uid, name: profile.name || 'BNHS staff' };
    const common = { title, body, pinned: f.pinned, expiresAt, updatedBy: author, updatedAt: stamp };
    if (live) tx.update(ref, { ...common, ...(title !== before.title || body !== before.body ? { editedAt: stamp } : {}) });
    else tx.set(ref, { ...before, ...common, audience, audienceKeys: postAudienceKeys(audience), push: f.push, publishAt,
      ...(before ? {} : { status: f.when === 'now' ? 'published' : 'scheduled', createdBy: author, createdAt: stamp, ...(f.when === 'now' ? { publishedAt: stamp } : {}) }) });
    return { id: ref.id };
  });
}
