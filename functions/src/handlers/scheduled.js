import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { retentionCutoffs } from '../lib/retention.js';
import { logEvent, logWarn } from '../log.js';
import { audit } from '../audit.js';
import { systemInbox } from './links.js';
import { handleScanEvent } from './scanEvent.js';
import { manilaDate } from '../../shared/dates.js';

async function deleteMatching(db, query, batchSize = 300) {
  let n = 0;
  for (;;) {
    const snap = await query.limit(batchSize).get();
    if (snap.empty) return n;
    const b = db.batch(); snap.docs.forEach((d) => b.delete(d.ref)); await b.commit();
    n += snap.size;
    if (snap.size < batchSize) return n;
  }
}
const ms = (x) => Timestamp.fromMillis(x);

// Nightly. (1) expire links for learners no longer enrolled this SY;
// (2) delete old revoked/expired links, old codes, old audit rows;
// (3) delete dormant guardian accounts.
export async function expireLinks({ db, auth, now }) {
  const nowMs = now().getTime();
  const sy = (await db.doc('settings/app').get()).data()?.currentSchoolYear;
  if (!sy) {
    logWarn('retention_skipped', { job: 'expireLinks', reason: 'settings/app.currentSchoolYear is not set' });
    return { expired: 0, oldRevoked: 0, oldExpired: 0, oldCodes: 0, oldAudit: 0, dormant: 0 };
  }
  const cut = retentionCutoffs({ currentSchoolYear: sy, nowMs });

  let expired = 0;
  const active = await db.collection('guardian_links').where('status', '==', 'active').get();
  for (const l of active.docs) {
    const { studentId, guardianUid, schoolYear } = l.data();
    const e = (await db.doc(`enrollments/${studentId}_${sy}`).get()).data();
    if (e && e.status === 'enrolled' && schoolYear === sy) { await db.doc(`guardians/${guardianUid}`).set({ lastActiveLinkAt: ms(nowMs) }, { merge: true }); continue; }
    await l.ref.set({ status: 'expired', expiredAt: FieldValue.serverTimestamp() }, { merge: true });
    await systemInbox(db, guardianUid, { title: 'Re-activation needed', body: `Your link to a learner for SY ${schoolYear} has ended. Use the new activation slip from the school to link again for SY ${sy}.`, studentId });
    expired++;
  }

  const oldRevoked = await deleteMatching(db, db.collection('guardian_links').where('status', '==', 'revoked').where('revokedAt', '<', ms(cut.linksBeforeMs)));
  const oldExpired = await deleteMatching(db, db.collection('guardian_links').where('status', '==', 'expired').where('expiredAt', '<', ms(cut.linksBeforeMs)));
  const oldCodes = await deleteMatching(db, db.collection('activation_codes').where('expiresAt', '<', ms(cut.codesBeforeMs)));
  const oldAudit = await deleteMatching(db, db.collection('audit_log').where('at', '<', ms(cut.auditBeforeMs)));

  let dormant = 0;
  const dormantSnap = await db.collection('guardians').where('lastActiveLinkAt', '<', ms(cut.dormantBeforeMs)).limit(200).get();
  for (const g of dormantSnap.docs) {
    await deleteMatching(db, db.collection(`guardians/${g.id}/devices`));
    await deleteMatching(db, db.collection(`guardians/${g.id}/inbox`));
    await g.ref.delete();
    try { await auth.deleteUser(g.id); } catch (e) { logWarn('dormant_auth_delete_failed', { uid: g.id, message: e.message }); }
    await audit(db, { action: 'guardian.deleted', actorType: 'system', actorUid: null, targetType: 'guardian', targetId: g.id, details: { reason: 'dormant' } });
    dormant++;
  }
  const counts = { expired, oldRevoked, oldExpired, oldCodes, oldAudit, dormant };
  logEvent('expire_links_done', counts);
  return counts;
}

// Nightly. Device hygiene + school-year retention for inbox, events, raw log,
// and resolved requests/reports.
export async function pruneDevices({ db, now }) {
  const nowMs = now().getTime();
  const sy = (await db.doc('settings/app').get()).data()?.currentSchoolYear;
  if (!sy) {
    logWarn('retention_skipped', { job: 'pruneDevices', reason: 'settings/app.currentSchoolYear is not set' });
    return { devices: 0, inbox: 0, events: 0, scanEvents: 0, resolved: 0 };
  }
  const cut = retentionCutoffs({ currentSchoolYear: sy, nowMs });
  const stale = await deleteMatching(db, db.collectionGroup('devices').where('refreshedAt', '<', ms(cut.devicesStaleBeforeMs)));
  const disabled = await deleteMatching(db, db.collectionGroup('devices').where('disabledAt', '<', ms(cut.devicesDisabledBeforeMs)));
  const inboxBeforeMs = Date.parse(`${cut.eventsBefore}T00:00:00+08:00`);
  const inbox = await deleteMatching(db, db.collectionGroup('inbox').where('createdAt', '<', ms(inboxBeforeMs)));
  const events = await deleteMatching(db, db.collectionGroup('events').where('scannedDate', '<', cut.eventsBefore));
  const scanEvents = await deleteMatching(db, db.collection('scan_events').where('scannedDate', '<', cut.eventsBefore));
  const resolved = (await deleteMatching(db, db.collection('reports').where('status', '==', 'resolved').where('resolvedAt', '<', ms(cut.resolvedBeforeMs))))
    + (await deleteMatching(db, db.collection('access_requests').where('status', 'in', ['approved', 'denied']).where('resolvedAt', '<', ms(cut.resolvedBeforeMs))));
  const counts = { devices: stale + disabled, inbox, events, scanEvents, resolved };
  logEvent('prune_done', counts);
  return counts;
}

// Nightly safety net for lost triggers (spec §9): any raw event from the last
// two days without a projection is re-processed with push suppressed.
export async function reconcileEvents(deps) {
  const { db, now } = deps;
  const today = manilaDate(now());
  const yesterday = manilaDate(new Date(now().getTime() - 86400_000));
  const raw = await db.collection('scan_events').where('scannedDate', 'in', [today, yesterday]).get();
  let missing = 0, failed = 0;
  for (const r of raw.docs) {
    const data = r.data();
    if (data.kind === 'void') continue;
    const projected = await db.doc(`learners/${data.studentId}/events/${r.id}`).get();
    if (projected.exists) continue;
    missing++;
    const res = await handleScanEvent(deps, { eventId: r.id, data, suppressPush: true });
    if (res.outcome !== 'processed') failed++;
  }
  logEvent('reconcile_done', { scanned: raw.size, missing, failed });
  return { scanned: raw.size, missing, failed };
}
