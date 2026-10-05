import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { audit } from '../audit.js';
import { logEvent, logWarn } from '../log.js';
import { applyVerdicts } from './push.js';
import { announcementPayload } from '../lib/pushPayload.js';

// Announcements spec: docs/superpowers/specs/2026-10-05-announcements-design.md
export const PUSH_CHUNK = 500;                 // FCM sendEachForMulticast limit
export const CLAIM_STALE_MS = 10 * 60 * 1000;  // a 'sending' claim older than this is 'interrupted'

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
    const system = authType === 'service_account' || !authId;
    const post = after || before;
    await audit(deps.db, {
      ...(eventId ? { id: `announcement_${eventId}` } : {}),
      action, actorType: system ? 'system' : 'staff', actorUid: system ? null : authId,
      targetType: 'announcement', targetId: id, details: { title: post.title, audienceKeys: post.audienceKeys },
    });
  }
  if (after?.status === 'published' && after.push === true && !after.pushedAt && !after.pushResult) {
    await sendAnnouncementPush(deps, id);
  }
}
