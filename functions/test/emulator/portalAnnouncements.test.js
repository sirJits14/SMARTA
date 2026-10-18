import { beforeEach, describe, expect, it } from 'vitest';
import { db, clearAll, seedSchool, ts, fakeMessaging } from './helpers.js';
import { getPortalAnnouncements, getPortalAnnouncement, savePortalAnnouncement } from '../../src/handlers/portalAnnouncements.js';
import { sendAnnouncementPush, announcementAudienceCount } from '../../src/handlers/announcements.js';

const now = () => new Date('2026-10-17T08:00:00+08:00');
const deps = (uid = 'gA') => ({ db: db(), uid, email: `${uid}@example.test`, now });
const audience = { roles: ['family', 'adviser'], grades: [7], sectionIds: ['SEC1'] };
const post = (over = {}) => ({ title: 'Notice', body: 'Details', audience, audienceKeys: ['g7'], status: 'published', publishedAt: ts(now().getTime()), expiresAt: null, push: true, ...over });
beforeEach(async () => { await clearAll(); await seedSchool(); });
describe('authorized portal announcements', () => {
  it('excludes stale legacy adviser keys from legacy push and audience counts', async () => {
    await db().doc('guardian_links/gA_S1').update({ relationship: 'Adviser' });
    await db().doc('guardians/gA').update({ audienceKeys: ['all', 'g7'] });
    await db().doc('announcements/legacy').set(post({ audience: { all: true }, audienceKeys: ['all'] }));
    expect(await announcementAudienceCount({ ...deps(), profile: { role: 'admin' } }, { audienceKeys: ['all'] })).toEqual({ count: 1 });
    const messaging = fakeMessaging();
    expect((await sendAnnouncementPush({ ...deps(), messaging, portalUrl: 'https://p.test' }, 'legacy')).devices).toBe(0);
  });
  it('checks current family entitlement on every feed/detail and rejects stale keys and adviser links', async () => {
    await db().doc('announcements/a').set(post());
    expect((await getPortalAnnouncements(deps(), { view: 'family' })).rows.map(p => p.id)).toEqual(['a']);
    await db().doc('guardian_links/gA_S1').update({ relationship: 'Adviser' });
    await db().doc('guardians/gA').update({ audienceKeys: ['all', 'g7'] });
    expect((await getPortalAnnouncements(deps(), { view: 'family' })).rows).toEqual([]);
    await expect(getPortalAnnouncement(deps(), { id: 'a', view: 'family' })).rejects.toMatchObject({ code: 'not-found' });
  });
  it('checks live assignment and section mapping for school notices, with no family crossover', async () => {
    await db().doc('school_accounts/gA').set({ assignments: [{ role: 'adviser', schoolYear: '2026-2027', sectionId: 'SEC1', gradeLevel: 7 }] });
    await db().doc('announcements/a').set(post({ audience: { roles: ['adviser'], grades: [7], sectionIds: ['SEC1'] } }));
    expect((await getPortalAnnouncements(deps(), { view: 'school' })).rows).toHaveLength(1);
    expect((await getPortalAnnouncements(deps(), { view: 'family' })).rows).toHaveLength(0);
    await db().doc('school_accounts/gA').update({ assignments: [] });
    expect((await getPortalAnnouncements(deps(), { view: 'school' })).rows).toHaveLength(0);
  });
  it('deduplicates multi-role recipients and matches count to push while excluding legacy adviser links', async () => {
    await db().doc('school_accounts/gA').set({ assignments: [{ role: 'adviser', schoolYear: '2026-2027', sectionId: 'SEC1', gradeLevel: 7 }] });
    await db().doc('guardian_links/gB_S1').update({ relationship: 'Adviser' });
    await db().doc('announcements/a').set(post());
    const messaging = fakeMessaging();
    expect(await announcementAudienceCount({ ...deps(), profile: { role: 'admin' } }, { audience })).toEqual({ count: 1 });
    const result = await sendAnnouncementPush({ ...deps(), messaging, portalUrl: 'https://p.test' }, 'a');
    expect(result.guardians).toBe(1);
    expect(messaging.sent.flatMap(m => m.tokens).sort()).toEqual(['tokA1', 'tokA2']);
  });
  it('rejects authoring a section outside the selected grade, even with valid grade scope keys', async () => {
    await db().doc('users/gA@example.test').set({ role: 'jhs_coord' });
    await db().doc('sections/SEC8').set({ name: 'Eight', gradeLevel: 8, schoolYear: '2026-2027' });
    await expect(savePortalAnnouncement({ ...deps(), profile: { role: 'jhs_coord' } }, { form: { title: 'Title', body: 'Body', roles: ['family'], all: false, grades: [7], sectionIds: ['SEC8'], when: 'now', expires: '', pinned: false, push: false } })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  it('publishes validated roles and rejects a password cutoff in the author transaction', async () => {
    const staff = db().doc('users/gA@example.test');
    await staff.set({ role: 'jhs_coord', uid: 'gA', name: 'Staff' });
    const form = { title: 'Title', body: 'Body', roles: ['family', 'adviser'], all: false, grades: [7], sectionIds: ['SEC1'], when: 'now', expires: '', pinned: false, push: false };
    const result = await savePortalAnnouncement(deps(), { form });
    expect((await db().doc(`announcements/${result.id}`).get()).data()).toMatchObject({ status: 'published', audience, audienceKeys: ['g7'] });
    await staff.update({ sessionValidAfter: 2 });
    await expect(savePortalAnnouncement({ ...deps(), authTime: 1 }, { form })).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  it('stops school matching after year end or section grade changes', async () => {
    await db().doc('school_accounts/gA').set({ assignments: [{ role: 'adviser', schoolYear: '2026-2027', sectionId: 'SEC1', gradeLevel: 7 }] });
    await db().doc('announcements/a').set(post({ audience: { roles: ['adviser'], grades: [7] } }));
    await db().doc('sections/SEC1').update({ gradeLevel: 8 });
    expect((await getPortalAnnouncements(deps(), { view: 'school' })).rows).toHaveLength(0);
    await db().doc('sections/SEC1').update({ gradeLevel: 7 });
    await db().doc('school_years/2026-2027').set({ endedAt: ts(now().getTime()) });
    expect((await getPortalAnnouncements(deps(), { view: 'school' })).rows).toHaveLength(0);
  });
});
