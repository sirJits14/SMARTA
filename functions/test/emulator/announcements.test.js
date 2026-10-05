import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool, fakeMessaging, ts } from './helpers.js';
import { handleAnnouncementWrite, sendAnnouncementPush, publishDueAnnouncements, announcementAudienceCount, CLAIM_STALE_MS } from '../../src/handlers/announcements.js';

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
  it('a chunk whose send rejects does not stop the others', async () => {
    const b = db().batch();
    for (let i = 0; i < 501; i++) b.set(db().doc(`guardians/gE/devices/x${i}`), { token: `x${i}`, enabled: true, failureCount: 0 });
    await b.commit();
    const m = fakeMessaging();
    const real = m.sendEachForMulticast.bind(m);
    let calls = 0;
    m.sendEachForMulticast = async (msg) => {
      calls += 1;
      if (calls === 1) throw new Error('unavailable');
      return real(msg);
    };
    await write('a12', post({ audience: { grades: [12] }, audienceKeys: ['g12'] }));
    const r = await sendAnnouncementPush(deps(m), 'a12');
    expect(calls).toBe(2);
    expect(r).toMatchObject({ status: 'sent', devices: 502, failed: 500, sent: 2 });
    expect((await read('a12')).pushResult).toEqual(r);
  });
  it('a read error before the claim leaves no claim and a retry sends', async () => {
    const m = fakeMessaging();
    await write('a1', post());
    const real = db();
    let thrown = false;
    const flaky = {
      doc: (...a) => real.doc(...a),
      collection: (name) => {
        if (name === 'guardians' && !thrown) { thrown = true; throw new Error('read failed'); }
        return real.collection(name);
      },
      collectionGroup: (...a) => real.collectionGroup(...a),
      runTransaction: (...a) => real.runTransaction(...a),
      batch: (...a) => real.batch(...a),
    };
    await expect(sendAnnouncementPush({ ...deps(m), db: flaky }, 'a1')).rejects.toThrow('read failed');
    expect((await read('a1')).pushResult).toBeUndefined();
    expect(m.sent).toHaveLength(0);
    const r = await sendAnnouncementPush(deps(m), 'a1');
    expect(r.status).toBe('sent');
    expect(m.sent).toHaveLength(1);
  });
  it('pushes a token shared by two device docs only once', async () => {
    await db().doc('guardians/gE/devices/dup').set({ token: 'tokA1', enabled: true, failureCount: 0 });
    const m = fakeMessaging();
    await write('a1', post());
    const r = await sendAnnouncementPush(deps(m), 'a1');
    expect([...m.sent[0].tokens].sort()).toEqual(['tokA1', 'tokA2', 'tokE1']);
    expect(r).toMatchObject({ devices: 3, sent: 3 });
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
  it('writes one audit row per trigger event even when delivered twice', async () => {
    const created = await write('a1', post({ push: false }));
    const args = { id: 'a1', before: null, after: created, authId: 'staff1', authType: 'unknown', eventId: 'ev-1' };
    await handleAnnouncementWrite(deps(), args);
    await handleAnnouncementWrite(deps(), args);
    const rows = (await auditRows()).filter((r) => r.action === 'announcement.published');
    expect(rows).toHaveLength(1);
  });
});

describe('publishDueAnnouncements', () => {
  it('publishes due scheduled posts and leaves future ones', async () => {
    await write('due', post({ status: 'scheduled', publishAt: ts(NOW.getTime() - 60_000), publishedAt: null }));
    await write('future', post({ status: 'scheduled', publishAt: ts(NOW.getTime() + 60_000), publishedAt: null }));
    const r = await publishDueAnnouncements({ db: db(), now: () => NOW });
    expect(r).toMatchObject({ published: 1 });
    expect(await read('due')).toMatchObject({ status: 'published', publishedAt: at });
    expect((await read('future')).status).toBe('scheduled');
  });
  it('expires posts past their expiry and leaves open-ended ones', async () => {
    await write('old', post({ expiresAt: ts(NOW.getTime() - 1) }));
    await write('open', post({ expiresAt: null }));
    const r = await publishDueAnnouncements({ db: db(), now: () => NOW });
    expect(r).toMatchObject({ expired: 1 });
    expect((await read('old')).status).toBe('expired');
    expect((await read('open')).status).toBe('published');
  });
  it('marks stale push claims interrupted, never resent, and leaves fresh ones', async () => {
    await write('stuck', post({ expiresAt: ts(NOW.getTime() - 1), pushResult: { status: 'sending', claimedAt: ts(NOW.getTime() - CLAIM_STALE_MS - 1) } }));
    await write('busy', post({ pushResult: { status: 'sending', claimedAt: ts(NOW.getTime() - 1_000) } }));
    const r = await publishDueAnnouncements({ db: db(), now: () => NOW });
    expect(r).toEqual({ published: 0, expired: 1, interrupted: 1 });
    expect(await read('stuck')).toMatchObject({ status: 'expired', pushResult: { status: 'interrupted' }, pushedAt: at });
    expect((await read('busy')).pushResult.status).toBe('sending');
  });
});

describe('announcementAudienceCount', () => {
  const admin = { role: 'admin' }, jhs = { role: 'jhs_coord' }, glc8 = { role: 'glc', gradeLevel: 8 };
  it('counts guardians whose keys overlap', async () => {
    expect(await announcementAudienceCount({ db: db(), profile: admin }, { audienceKeys: ['all'] })).toEqual({ count: 4 });
    expect(await announcementAudienceCount({ db: db(), profile: jhs }, { audienceKeys: ['g7'] })).toEqual({ count: 3 });
  });
  it('refuses audiences outside the caller\'s scope and malformed keys', async () => {
    await expect(announcementAudienceCount({ db: db(), profile: jhs }, { audienceKeys: ['all'] })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(announcementAudienceCount({ db: db(), profile: glc8 }, { audienceKeys: ['g7'] })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(announcementAudienceCount({ db: db(), profile: admin }, { audienceKeys: ['x'] })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(announcementAudienceCount({ db: db(), profile: admin }, {})).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
