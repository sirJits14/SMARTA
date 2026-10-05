import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { audit } from '../audit.js';
import { logEvent, logWarn } from '../log.js';
import { applyVerdicts } from './push.js';
import { announcementPayload } from '../lib/pushPayload.js';
import { CallableError } from '../errors.js';
import { coversPostKeys, POST_KEYS } from '../../shared/announcements.js';

// Announcements spec: docs/superpowers/specs/2026-10-05-announcements-design.md
export const PUSH_CHUNK = 500;                 // FCM sendEachForMulticast limit
export const CLAIM_STALE_MS = 10 * 60 * 1000;  // a 'sending' claim older than this is 'interrupted'
export const PUSH_MAX_AGE_MS = 60 * 60 * 1000; // no push for a post published longer ago than this

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const norm = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v ?? null);
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const STAFF_FIELDS = ['title', 'body', 'pinned', 'expiresAt', 'publishAt', 'audienceKeys', 'push'];

// What a write means for the audit log; null for Functions' own bookkeeping
// (push claims/results). Staff writes always move updatedAt; the publish job
// and push code never do.
export function auditActionFor(before, after) {
  if (!before && !after) return null;
  if (!before) return after.status === 'scheduled' ? 'announcement.scheduled' : 'announcement.published';
  if (!after) return 'announcement.deleted';
  if (before.status !== after.status) {
    if (after.status === 'published') return 'announcement.went_out';
    if (after.status === 'unpublished') return 'announcement.unpublished';
    if (after.status === 'expired') return 'announcement.expired';
  }
  if (same(before.updatedAt, after.updatedAt)) return null;
  return STAFF_FIELDS.some((k) => !same(before[k], after[k])) ? 'announcement.edited' : null;
}

const eligible = (p) => !!p && p.status === 'published' && p.push === true && !p.pushedAt && !p.pushResult;

// At most once: a transaction claims the push ('sending') before anything
// is sent. A run that finds a claim sends nothing; the publish job turns a
// claim older than CLAIM_STALE_MS into 'interrupted' (never resent).
// Every read that can fail happens BEFORE the claim, so a read error throws
// with no claim written and the trigger's retry can start over cleanly.
export async function sendAnnouncementPush({ db, messaging, portalUrl, now }, id) {
  const ref = db.doc(`announcements/${id}`);
  const first = (await ref.get()).data();
  if (!eligible(first)) return { status: 'skipped_claimed' };

  // A push hours after the post went out (e.g. a trigger retried for a
  // long time) is worse than none: record it once and stop, before the
  // pause read and the audience queries, so further retries are cheap.
  const publishedMs = norm(first.publishedAt);
  if (typeof publishedMs === 'number' && now().getTime() - publishedMs > PUSH_MAX_AGE_MS) {
    const recorded = await db.runTransaction(async (tx) => {
      if (!eligible((await tx.get(ref)).data())) return false;
      tx.update(ref, { pushedAt: FieldValue.serverTimestamp(), pushResult: { status: 'failed', reason: 'too_late' } });
      return true;
    });
    if (!recorded) return { status: 'skipped_claimed' };
    logWarn('announcement_push_too_late', { id });
    return { status: 'too_late' };
  }

  const paused = (await db.doc('settings/parent_portal').get()).data()?.notificationsPaused === true;
  if (paused) {
    const claimed = await db.runTransaction(async (tx) => {
      if (!eligible((await tx.get(ref)).data())) return false;
      tx.update(ref, { pushedAt: FieldValue.serverTimestamp(), pushResult: { status: 'skipped_paused' } });
      return true;
    });
    if (!claimed) return { status: 'skipped_claimed' };
    logEvent('announcement_push', { id, status: 'skipped_paused' });
    return { status: 'skipped_paused' };
  }

  // audienceKeys cannot change once a post is published, so the keys read
  // above are safe to use for the queries below.
  const guardians = await db.collection('guardians').where('audienceKeys', 'array-contains-any', first.audienceKeys).get();
  const wanted = new Set(guardians.docs
    .filter((g) => g.data().notificationsEnabled !== false && g.data().announcementPushEnabled !== false)
    .map((g) => g.id));
  // One collection-group read instead of one devices query per guardian.
  const seen = new Set();
  const devices = (await db.collectionGroup('devices').where('enabled', '==', true).get()).docs
    .filter((d) => d.ref.parent.parent?.parent?.id === 'guardians' && wanted.has(d.ref.parent.parent.id))
    .filter((d) => {
      const token = d.data().token;
      if (seen.has(token)) return false;
      seen.add(token);
      return true;
    });

  const post = await db.runTransaction(async (tx) => {
    const p = (await tx.get(ref)).data();
    if (!eligible(p)) return null;
    tx.update(ref, { pushResult: { status: 'sending', claimedAt: Timestamp.fromDate(now()) } });
    return p;
  });
  if (!post) return { status: 'skipped_claimed' };

  let sent = 0, failed = 0, pruned = 0;
  for (const part of chunk(devices, PUSH_CHUNK)) {
    let res;
    try {
      res = await messaging.sendEachForMulticast(announcementPayload({
        tokens: part.map((d) => d.data().token), announcementId: id, title: post.title, portalUrl,
      }));
    } catch (e) {
      logWarn('announcement_push_chunk_failed', { id, size: part.length, message: e?.message });
      failed += part.length;
      continue;
    }
    try {
      const v = await applyVerdicts(db, part, res.responses);
      sent += v.sent; failed += v.failed; pruned += v.pruned;
    } catch (e) {
      logWarn('announcement_push_chunk_failed', { id, size: part.length, stage: 'verdicts', message: e?.message });
      const ok = res.responses.filter((r) => r.success).length;
      sent += ok; failed += res.responses.length - ok;
    }
  }
  const result = { status: sent > 0 || devices.length === 0 ? 'sent' : 'failed', guardians: wanted.size, devices: devices.length, sent, failed, pruned };
  await ref.update({ pushedAt: FieldValue.serverTimestamp(), pushResult: result });
  logEvent('announcement_push', { id, ...result });
  return result;
}

// announcements/{id} trigger: audit the change, then push if it is a
// published post that asked for one and has not been claimed yet.
export async function handleAnnouncementWrite(deps, { id, before, after, authId, authType, eventId }) {
  const action = auditActionFor(before, after);
  if (action) {
    const system = authType === 'service_account' || !authId || authId.endsWith('gserviceaccount.com');
    // Other staff audit rows (and the Audit tab) name the actor by email.
    let actor = null;
    if (!system) {
      try { actor = (await deps.auth.getUser(authId)).email || authId; } catch { actor = authId; }
    }
    const post = after || before;
    await audit(deps.db, {
      ...(eventId ? { id: `announcement_${eventId}` } : {}),
      action, actorType: system ? 'system' : 'staff', actorUid: actor,
      targetType: 'announcement', targetId: id, details: { title: post.title, audienceKeys: post.audienceKeys },
    });
  }
  if (after?.status === 'published' && after.push === true && !after.pushedAt && !after.pushResult) {
    await sendAnnouncementPush(deps, id);
  }
}

// Every 5 minutes: scheduled -> published (the trigger then pushes),
// published past expiresAt -> expired, stale 'sending' claims -> interrupted.
// Updates are merged per document so one post can't be written twice in a batch.
export async function publishDueAnnouncements({ db, now }) {
  const at = Timestamp.fromDate(now());
  const staleBefore = Timestamp.fromMillis(now().getTime() - CLAIM_STALE_MS);
  const col = db.collection('announcements');
  const [due, ended, stuck] = await Promise.all([
    col.where('status', '==', 'scheduled').where('publishAt', '<=', at).limit(200).get(),
    col.where('status', '==', 'published').where('expiresAt', '<=', at).limit(200).get(),
    col.where('pushResult.status', '==', 'sending').where('pushResult.claimedAt', '<=', staleBefore).limit(200).get(),
  ]);
  const updates = new Map();
  const add = (d, patch) => updates.set(d.ref.path, { ref: d.ref, patch: { ...(updates.get(d.ref.path)?.patch || {}), ...patch } });
  // A scheduled post already past its expiry never goes out (never visible,
  // never pushed): it goes straight to expired, with no publishedAt.
  const pastExpiry = (d) => { const e = norm(d.data().expiresAt); return typeof e === 'number' && e <= at.toMillis(); };
  const toPublish = due.docs.filter((d) => !pastExpiry(d));
  const stillborn = due.docs.filter(pastExpiry);
  toPublish.forEach((d) => add(d, { status: 'published', publishedAt: at }));
  stillborn.forEach((d) => add(d, { status: 'expired' }));
  ended.docs.forEach((d) => add(d, { status: 'expired' }));
  stuck.docs.forEach((d) => add(d, { pushedAt: at, pushResult: { ...d.data().pushResult, status: 'interrupted' } }));
  if (updates.size) {
    const b = db.batch();
    for (const { ref, patch } of updates.values()) b.update(ref, patch);
    await b.commit();
  }
  const counts = { published: toPublish.length, expired: stillborn.length + ended.size, interrupted: stuck.size };
  if (updates.size) logEvent('announcements_job', counts);
  return counts;
}

// Staff callable behind the SIMS confirm dialog ("visible to about N
// guardians"). Coordinators can't read guardians/*, so the count is here.
export async function announcementAudienceCount({ db, profile }, { audienceKeys } = {}) {
  const keys = Array.isArray(audienceKeys) ? audienceKeys : [];
  if (!keys.length || keys.length > POST_KEYS.length || !keys.every((k) => POST_KEYS.includes(k))) {
    throw new CallableError('invalid-argument', 'Choose who the announcement is for.');
  }
  if (!coversPostKeys(profile, keys)) throw new CallableError('permission-denied', 'You can only post to your own grades.');
  const snap = await db.collection('guardians').where('audienceKeys', 'array-contains-any', keys).count().get();
  return { count: snap.data().count };
}
