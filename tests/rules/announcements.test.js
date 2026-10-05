import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { setup, seed, seedBaseline, as, ok, denied, STAFF, KIOSK, JHS, SHS, GLC8, GUARDIAN_A, GUARDIAN_B } from './helpers.js';

const now = () => firebase.firestore.FieldValue.serverTimestamp();
const tomorrow = () => new Date(Date.now() + 86_400_000);
const yesterday = () => new Date(Date.now() - 86_400_000);
const by = (who) => ({ uid: who.uid, name: 'Staff' });
const grades = (...g) => ({ audience: { grades: g }, audienceKeys: g.map((x) => `g${x}`) });

// A post as it sits in Firestore (seeded with rules off).
const stored = (over = {}) => ({
  title: 'Brigada Eskwela', body: 'Bring cleaning materials.', audience: { all: true }, audienceKeys: ['all'],
  status: 'published', publishAt: new Date(), publishedAt: new Date(), expiresAt: null, pinned: false, push: false,
  createdBy: { uid: 'staff1', name: 'R' }, updatedBy: { uid: 'staff1', name: 'R' }, createdAt: new Date(), updatedAt: new Date(), ...over,
});
const storedScheduled = (over = {}) => { const d = stored({ status: 'scheduled', publishAt: tomorrow(), ...over }); delete d.publishedAt; return d; };

// A post as SIMS creates it ("Publish now").
const draft = (who, over = {}) => ({
  title: 'Class suspension', body: 'No classes tomorrow.', audience: { all: true }, audienceKeys: ['all'],
  status: 'published', publishAt: now(), publishedAt: now(), expiresAt: null, pinned: false, push: true,
  createdBy: by(who), updatedBy: by(who), createdAt: now(), updatedAt: now(), ...over,
});
const scheduledDraft = (who, over = {}) => { const d = draft(who, { status: 'scheduled', publishAt: tomorrow(), ...over }); delete d.publishedAt; return d; };
const touch = (who) => ({ updatedBy: by(who), updatedAt: now() });

const guardianQuery = (who, keys, n = 50) => as(env, who).collection('announcements')
  .where('audienceKeys', 'array-contains-any', keys).where('status', '==', 'published')
  .orderBy('publishedAt', 'desc').limit(n);

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await seedBaseline(env);
  await seed(env, async (db) => {
    await db.doc('users/jhs@bnhs.edu').set({ name: 'JHS', role: 'jhs_coord', gradeLevel: null, disabled: false });
    await db.doc('users/shs@bnhs.edu').set({ name: 'SHS', role: 'shs_coord', gradeLevel: null, disabled: false });
    await db.doc('users/glc8@bnhs.edu').set({ name: 'G8', role: 'glc', gradeLevel: 8, disabled: false });
    await db.doc('guardians/gA').set({ audienceKeys: ['all', 'g7'] }, { merge: true });
    await db.doc('guardians/gB').set({ audienceKeys: [] }, { merge: true });
    await db.doc('announcements/pAll').set(stored());
    await db.doc('announcements/p7').set(stored(grades(7)));
    await db.doc('announcements/p12').set(stored(grades(12)));
    await db.doc('announcements/pSched').set(storedScheduled());
    await db.doc('announcements/pGone').set(stored({ status: 'unpublished' }));
  });
});

describe('guardians read', () => {
  it('lists published posts for their own keys, bounded', async () => {
    await ok(guardianQuery(GUARDIAN_A, ['all', 'g7']).get());
    await ok(guardianQuery(GUARDIAN_A, ['g7'], 1).get());
    await denied(guardianQuery(GUARDIAN_A, ['all', 'g7'], 51).get());
    await denied(as(env, GUARDIAN_A).collection('announcements').where('audienceKeys', 'array-contains-any', ['all', 'g7']).where('status', '==', 'published').get());
  });
  it('cannot list another grade, unpublished posts, or anything without keys', async () => {
    await denied(guardianQuery(GUARDIAN_A, ['g12']).get());
    await denied(as(env, GUARDIAN_A).collection('announcements').where('audienceKeys', 'array-contains-any', ['all', 'g7']).limit(50).get());
    await denied(guardianQuery(GUARDIAN_B, ['all']).get());
  });
  it('gets one post only when it is published and theirs', async () => {
    await ok(as(env, GUARDIAN_A).doc('announcements/p7').get());
    await ok(as(env, GUARDIAN_A).doc('announcements/pAll').get());
    await denied(as(env, GUARDIAN_A).doc('announcements/p12').get());
    await denied(as(env, GUARDIAN_A).doc('announcements/pSched').get());
    await denied(as(env, GUARDIAN_A).doc('announcements/pGone').get());
    await denied(as(env, KIOSK).doc('announcements/pAll').get());
  });
  it('never writes posts', async () => {
    await denied(as(env, GUARDIAN_A).collection('announcements').add(draft(GUARDIAN_A)));
    await denied(as(env, GUARDIAN_A).doc('announcements/p7').update({ title: 'x' }));
  });
});

describe('guardian profile fields', () => {
  it('updates the unread marker and the announcement switch, never its keys', async () => {
    await ok(as(env, GUARDIAN_A).doc('guardians/gA').update({ announcementsSeenAt: now(), announcementPushEnabled: false }));
    await denied(as(env, GUARDIAN_A).doc('guardians/gA').update({ audienceKeys: ['all', 'g7', 'g12'] }));
  });
});

describe('staff read', () => {
  it('every staff member reads every post', async () => {
    await ok(as(env, STAFF).collection('announcements').get());
    await ok(as(env, JHS).doc('announcements/p12').get());
    await ok(as(env, GLC8).collection('announcements').get());
  });
});

describe('staff create', () => {
  it('administrators publish to everyone or any grade, now or later', async () => {
    await ok(as(env, STAFF).collection('announcements').add(draft(STAFF)));
    await ok(as(env, STAFF).collection('announcements').add(draft(STAFF, grades(7, 12))));
    await ok(as(env, STAFF).collection('announcements').add(scheduledDraft(STAFF)));
  });
  it('coordinators publish only inside their grades and never to everyone', async () => {
    await ok(as(env, JHS).collection('announcements').add(draft(JHS, grades(7, 8))));
    await denied(as(env, JHS).collection('announcements').add(draft(JHS, grades(11))));
    await denied(as(env, JHS).collection('announcements').add(draft(JHS)));
    await ok(as(env, SHS).collection('announcements').add(draft(SHS, grades(12))));
    await denied(as(env, SHS).collection('announcements').add(draft(SHS, grades(9))));
    await ok(as(env, GLC8).collection('announcements').add(draft(GLC8, grades(8))));
    await denied(as(env, GLC8).collection('announcements').add(draft(GLC8, grades(7))));
    await denied(as(env, GLC8).collection('announcements').add(draft(GLC8, grades(8, 9))));
  });
  it('rejects malformed posts', async () => {
    const add = (d) => as(env, STAFF).collection('announcements').add(d);
    await denied(add(draft(STAFF, { audienceKeys: ['all', 'g7'] })));
    await denied(add(draft(STAFF, { audienceKeys: [] })));
    await denied(add(draft(STAFF, { audienceKeys: ['g13'] })));
    await denied(add(draft(STAFF, { title: 'x'.repeat(121) })));
    await denied(add(draft(STAFF, { body: '' })));
    await denied(add(draft(STAFF, { extra: 1 })));
    await denied(add(draft(STAFF, { pushedAt: now() })));
    await denied(add(draft(STAFF, { pushResult: { status: 'sent' } })));
    await denied(add(draft(STAFF, { editedAt: now() })));
    await denied(add(draft(STAFF, { createdBy: { uid: 'someoneElse', name: 'X' } })));
    await denied(add(draft(STAFF, { publishAt: tomorrow() })));          // "published" must be now
    await denied(add(scheduledDraft(STAFF, { publishAt: yesterday() })));  // scheduled must be future
    await denied(add({ ...scheduledDraft(STAFF), publishedAt: now() }));
  });
});

describe('staff update', () => {
  it('edits a live post\'s wording, pin and expiry; marks editedAt now', async () => {
    const ref = as(env, STAFF).doc('announcements/pAll');
    await ok(ref.update({ title: 'Brigada Eskwela 2026', editedAt: now(), ...touch(STAFF) }));
    await ok(ref.update({ pinned: true, expiresAt: tomorrow(), ...touch(STAFF) }));
    await denied(ref.update({ editedAt: yesterday(), ...touch(STAFF) }));
  });
  it('locks a live post\'s audience, push and server fields', async () => {
    const ref = as(env, STAFF).doc('announcements/p7');
    await denied(ref.update({ ...grades(7, 8), ...touch(STAFF) }));
    await denied(ref.update({ push: true, ...touch(STAFF) }));
    await denied(ref.update({ pushedAt: now(), ...touch(STAFF) }));
    await denied(ref.update({ publishedAt: now(), ...touch(STAFF) }));
    await denied(ref.update({ title: 'no touch' }));                     // updatedAt/updatedBy required
  });
  it('unpublishes a live post and nothing else in the same write', async () => {
    await ok(as(env, STAFF).doc('announcements/pAll').update({ status: 'unpublished', ...touch(STAFF) }));
    await denied(as(env, STAFF).doc('announcements/p7').update({ status: 'unpublished', title: 'x', ...touch(STAFF) }));
    await denied(as(env, STAFF).doc('announcements/pGone').update({ status: 'published', ...touch(STAFF) }));
  });
  it('edits every field of a scheduled post while it stays in the future', async () => {
    const ref = as(env, STAFF).doc('announcements/pSched');
    await ok(ref.update({ ...grades(9), push: true, publishAt: tomorrow(), title: 'Moved', ...touch(STAFF) }));
    await denied(ref.update({ publishAt: yesterday(), ...touch(STAFF) }));
    await denied(ref.update({ status: 'published', ...touch(STAFF) }));
    await denied(ref.update({ editedAt: now(), ...touch(STAFF) }));
  });
  it('keeps coordinators inside their grades on update', async () => {
    await ok(as(env, JHS).doc('announcements/p7').update({ title: 'Grade 7 assembly', editedAt: now(), ...touch(JHS) }));
    await denied(as(env, JHS).doc('announcements/pAll').update({ status: 'unpublished', ...touch(JHS) }));
    await denied(as(env, GLC8).doc('announcements/p7').update({ title: 'x', editedAt: now(), ...touch(GLC8) }));
  });
});

describe('staff delete', () => {
  it('deletes only scheduled posts in scope', async () => {
    await denied(as(env, JHS).doc('announcements/pSched').delete());       // school-wide
    await ok(as(env, STAFF).doc('announcements/pSched').delete());
    await denied(as(env, STAFF).doc('announcements/pAll').delete());
    await denied(as(env, GUARDIAN_A).doc('announcements/p7').delete());
  });
});
