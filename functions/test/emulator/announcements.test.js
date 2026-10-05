import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool, fakeMessaging, ts } from './helpers.js';
import { handleAnnouncementWrite, sendAnnouncementPush } from '../../src/handlers/announcements.js';

const NOW = new Date('2026-10-05T08:00:00+08:00');
const deps = (messaging = fakeMessaging()) => ({ db: db(), messaging, portalUrl: 'https://p.test', now: () => NOW });
const at = ts(NOW.getTime());
const post = (over = {}) => ({
  title: 'Class suspension', body: 'No classes.', audience: { all: true }, audienceKeys: ['all'],
  status: 'published', publishAt: at, publishedAt: at, expiresAt: null, pinned: false, push: true,
  createdBy: { uid: 'staff1', name: 'R' }, updatedBy: { uid: 'staff1', name: 'R' }, createdAt: at, updatedAt: at, ...over,
});
const write = async (id, data) => { await db().doc(`announcements/${id}`).set(data); return data; };
const read = async (id) => (await db().doc(`announcements/${id}`).get()).data();
const auditRows = async () => (await db().collection('audit_log').get()).docs.map((d) => d.data());

// seedSchool: gA (on, devices tokA1+tokA2), gB (notifications off, tokB1).
// Added here: gD opted out of announcement pushes; gE is a grade 12 parent.
beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('guardians/gA').set({ audienceKeys: ['all', 'g7'] }, { merge: true });
  await db().doc('guardians/gB').set({ audienceKeys: ['all', 'g7'] }, { merge: true });
  await db().doc('guardians/gD').set({ email: 'd@x', notificationsEnabled: true, announcementPushEnabled: false, audienceKeys: ['all', 'g7'] });
  await db().doc('guardians/gD/devices/tD1').set({ token: 'tokD1', enabled: true, failureCount: 0 });
  await db().doc('guardians/gE').set({ email: 'e@x', notificationsEnabled: true, audienceKeys: ['all', 'g12'] });
  await db().doc('guardians/gE/devices/tE1').set({ token: 'tokE1', enabled: true, failureCount: 0 });
});

describe('sendAnnouncementPush', () => {
  it('pushes a school-wide post to every opted-in guardian device and records the result', async () => {
    const m = fakeMessaging();
    await write('a1', post());
    const r = await sendAnnouncementPush(deps(m), 'a1');
    expect(m.sent).toHaveLength(1);
    expect([...m.sent[0].tokens].sort()).toEqual(['tokA1', 'tokA2', 'tokE1']);
    expect(m.sent[0].webpush.fcmOptions.link).toBe('https://p.test/announcements/a1');
    expect(m.sent[0].notification.body).toBe('Class suspension');
    expect(r).toEqual({ status: 'sent', guardians: 2, devices: 3, sent: 3, failed: 0, pruned: 0 });
    const saved = await read('a1');
    expect(saved.pushResult).toEqual(r);
    expect(saved.pushedAt).toBeTruthy();
  });
  it('pushes a grade post only to that grade', async () => {
    const m = fakeMessaging();
    await write('a12', post({ audience: { grades: [12] }, audienceKeys: ['g12'] }));
    await sendAnnouncementPush(deps(m), 'a12');
    expect(m.sent[0].tokens).toEqual(['tokE1']);
  });
  it('prunes dead tokens and counts failures', async () => {
    const m = fakeMessaging({ tokA1: 'messaging/registration-token-not-registered' });
    await write('a1', post());
    const r = await sendAnnouncementPush(deps(m), 'a1');
    expect(r).toMatchObject({ status: 'sent', sent: 2, failed: 1, pruned: 1 });
    expect((await db().doc('guardians/gA/devices/tA1').get()).exists).toBe(false);
  });
  it('sends in chunks of 500', async () => {
    const b = db().batch();
    for (let i = 0; i < 501; i++) b.set(db().doc(`guardians/gE/devices/x${i}`), { token: `x${i}`, enabled: true, failureCount: 0 });
    await b.commit();
    const m = fakeMessaging();
    await write('a12', post({ audience: { grades: [12] }, audienceKeys: ['g12'] }));
    const r = await sendAnnouncementPush(deps(m), 'a12');
    expect(m.sent.map((s) => s.tokens.length)).toEqual([500, 2]);
    expect(r.devices).toBe(502);
  });
  it('records skipped_paused while notifications are paused', async () => {
    await db().doc('settings/parent_portal').set({ notificationsPaused: true }, { merge: true });
    const m = fakeMessaging();
    await write('a1', post());
    expect(await sendAnnouncementPush(deps(m), 'a1')).toEqual({ status: 'skipped_paused' });
    expect(m.sent).toHaveLength(0);
    expect((await read('a1')).pushResult).toEqual({ status: 'skipped_paused' });
  });
  it('sends nothing when another run already claimed the push', async () => {
    const m = fakeMessaging();
    await write('a1', post({ pushResult: { status: 'sending', claimedAt: at } }));
    expect(await sendAnnouncementPush(deps(m), 'a1')).toEqual({ status: 'skipped_claimed' });
    expect(m.sent).toHaveLength(0);
  });
});

describe('handleAnnouncementWrite', () => {
  it('pushes exactly once, even when the trigger is delivered again', async () => {
    const m = fakeMessaging();
    const after = await write('a1', post());
    await handleAnnouncementWrite(deps(m), { id: 'a1', before: null, after, authId: 'staff1', authType: 'unknown' });
    await handleAnnouncementWrite(deps(m), { id: 'a1', before: null, after, authId: 'staff1', authType: 'unknown' });
    expect(m.sent).toHaveLength(1);
  });
  it('never pushes posts without push, scheduled posts, or edits after publishing', async () => {
    const m = fakeMessaging();
    const quiet = await write('q', post({ push: false }));
    await handleAnnouncementWrite(deps(m), { id: 'q', before: null, after: quiet, authId: 'staff1', authType: 'unknown' });
    const later = await write('s', post({ status: 'scheduled' }));
    await handleAnnouncementWrite(deps(m), { id: 's', before: null, after: later, authId: 'staff1', authType: 'unknown' });
    const sentBefore = post({ pushedAt: at, pushResult: { status: 'sent' } });
    const edited = await write('e', { ...sentBefore, title: 'Fixed typo', updatedAt: ts(NOW.getTime() + 1) });
    await handleAnnouncementWrite(deps(m), { id: 'e', before: sentBefore, after: edited, authId: 'staff1', authType: 'unknown' });
    expect(m.sent).toHaveLength(0);
  });
  it('audits staff actions with the writer uid and job moves as system', async () => {
    const created = await write('a1', post({ push: false, status: 'scheduled' }));
    await handleAnnouncementWrite(deps(), { id: 'a1', before: null, after: created, authId: 'jhs1', authType: 'unknown' });
    const live = { ...created, status: 'published', publishedAt: at };
    await handleAnnouncementWrite(deps(), { id: 'a1', before: created, after: live, authId: 'svc', authType: 'service_account' });
    const rows = await auditRows();
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'announcement.scheduled', actorType: 'staff', actorUid: 'jhs1', targetType: 'announcement', targetId: 'a1' }),
      expect.objectContaining({ action: 'announcement.went_out', actorType: 'system', actorUid: null, targetId: 'a1' }),
    ]));
    expect(rows[0].details).toEqual(expect.objectContaining({ title: 'Class suspension', audienceKeys: ['all'] }));
  });
});
