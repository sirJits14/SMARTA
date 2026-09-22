import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { classifyEvent } from '../lib/classifyEvent.js';
import { recomputeSummary } from '../lib/recomputeSummary.js';
import { shouldPush, guardianPushGate } from '../lib/shouldPush.js';
import { cached } from '../cache.js';
import { logEvent, logWarn } from '../log.js';
import { sendToGuardian } from './push.js';
import { manilaDate } from '../../shared/dates.js';
import { sectionLabel, displayName } from '../lib/format.js';

const CACHE_MS = 30_000;
const RECENT_QUERY = 40;
const PENDING_RESEND_MS = 5 * 60 * 1000;

// Spec §5. The only writer of learners/* and guardians/*/inbox/*. Every step
// is keyed on eventId so a re-delivered trigger is a no-op.
export async function handleScanEvent({ db, messaging, portalUrl, now = () => new Date() }, { eventId, data, suppressPush = false }) {
  const t0 = Date.now();
  const { studentId, schoolYear, kind, deviceId, source } = data;
  const isStaff = source === 'staff';

  // 1. device
  const kiosk = isStaff ? { label: 'School office', active: true }
    : await cached(`kiosk:${deviceId}`, CACHE_MS, async () => (await db.doc(`kiosks/${deviceId}`).get()).data() || null);
  if (!kiosk || kiosk.active !== true) { logWarn('scan_rejected', { eventId, deviceId, reason: 'device' }); return { outcome: 'rejected:device' }; }

  // 2. enrollment
  const enrollment = (await db.doc(`enrollments/${studentId}_${schoolYear}`).get()).data();
  if (!enrollment || enrollment.status !== 'enrolled' || enrollment.sectionId !== data.sectionId) {
    logWarn('scan_rejected', { eventId, deviceId, reason: 'enrollment' }); return { outcome: 'rejected:enrollment' };
  }

  // 3. classify
  const cls = classifyEvent({ scannedAtMs: data.scannedAt.toMillis(), receivedAtMs: data.receivedAt.toMillis() });
  const todayDate = manilaDate(now());

  // 4. project + summary (transaction)
  const learnerRef = db.doc(`learners/${studentId}`);
  const eventRef = learnerRef.collection('events').doc(eventId);
  const [studentSnap, sectionSnap] = await Promise.all([db.doc(`students/${studentId}`).get(), db.doc(`sections/${enrollment.sectionId}`).get()]);
  const student = studentSnap.data();
  const learnerName = displayName(student);

  await db.runTransaction(async (tx) => {
    const recentSnap = await tx.get(learnerRef.collection('events').orderBy('effectiveAt', 'desc').limit(RECENT_QUERY));
    const existing = recentSnap.docs.map((d) => ({ id: d.id, ...d.data(), effectiveAtMs: d.data().effectiveAt.toMillis() }));

    if (kind === 'void') {
      const target = existing.find((e) => e.id === data.voidsEventId);
      const targetRef = learnerRef.collection('events').doc(data.voidsEventId);
      tx.set(targetRef, { status: 'voided', voidReason: data.note || '', voidedAt: Timestamp.now() }, { merge: true });
      if (target) target.status = 'voided';
    } else {
      const projected = {
        kind, scannedAt: data.scannedAt, scannedDate: data.scannedDate, scannedTime: data.scannedTime,
        receivedAt: data.receivedAt, effectiveAt: Timestamp.fromMillis(cls.effectiveAtMs),
        deviceLabel: kiosk.label, status: 'recorded', delayedSync: cls.delayedSync, clockSkew: cls.clockSkew, source,
        ...(isStaff ? { correctionNote: data.note || '' } : {}),
      };
      tx.set(eventRef, projected, { merge: true });
      const idx = existing.findIndex((e) => e.id === eventId);
      const row = { id: eventId, ...projected, effectiveAtMs: cls.effectiveAtMs };
      if (idx >= 0) existing[idx] = row; else existing.push(row);
    }

    const summary = recomputeSummary({ events: existing, todayDate });
    tx.set(learnerRef, {
      displayName: learnerName, sectionLabel: sectionLabel(sectionSnap.data()), schoolYear,
      today: summary.today, recent: summary.recent, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  // 5.–6. fan-out + push
  const paused = await cached('settings:parent_portal', CACHE_MS, async () => (await db.doc('settings/parent_portal').get()).data()?.notificationsPaused === true);
  const learnerDoc = (await learnerRef.get()).data();
  const lastPush = learnerDoc.lastPush ? { kind: learnerDoc.lastPush.kind, atMs: learnerDoc.lastPush.at.toMillis() } : null;
  const eventGate = suppressPush ? { send: false, status: 'skipped_suppressed' }
    : shouldPush({ paused, delayedSync: cls.delayedSync, clockSkew: cls.clockSkew, lastPush, kind, nowMs: now().getTime() });

  const links = await db.collection('guardian_links').where('studentId', '==', studentId).where('status', '==', 'active').get();
  let pushesSent = 0, pushesFailed = 0, pruned = 0;
  for (const link of links.docs) {
    const uid = link.data().guardianUid;
    const inboxRef = db.doc(`guardians/${uid}/inbox/${eventId}`);
    const inboxSnap = await inboxRef.get();
    const prior = inboxSnap.data();
    if (prior && prior.pushStatus !== 'pending') continue;
    if (prior && prior.pushStatus === 'pending' && now().getTime() - prior.createdAt.toMillis() > PENDING_RESEND_MS) continue;

    const item = {
      type: 'attendance', studentId, learnerName, kind, scannedDate: data.scannedDate, scannedTime: data.scannedTime,
      eventId: kind === 'void' ? data.voidsEventId : eventId, createdAt: prior?.createdAt || FieldValue.serverTimestamp(), pushStatus: 'pending',
    };
    if (!eventGate.send) { await inboxRef.set({ ...item, pushStatus: eventGate.status }, { merge: true }); continue; }

    const guardian = (await db.doc(`guardians/${uid}`).get()).data() || {};
    const devCount = (await db.collection(`guardians/${uid}/devices`).where('enabled', '==', true).count().get()).data().count;
    const gGate = guardianPushGate({ notificationsEnabled: guardian.notificationsEnabled !== false, tokenCount: devCount });
    if (gGate) { await inboxRef.set({ ...item, pushStatus: gGate }, { merge: true }); continue; }

    if (!prior) await inboxRef.set(item);
    const res = await sendToGuardian({ db, messaging, portalUrl }, { guardianUid: uid, inboxId: eventId, studentId });
    pruned += res.pruned;
    if (res.status === 'sent') pushesSent++; else if (res.status === 'failed') pushesFailed++;
    await inboxRef.set({ pushStatus: res.status, pushSentAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  if (pushesSent > 0) await learnerRef.set({ lastPush: { kind, at: Timestamp.fromDate(now()) } }, { merge: true });

  logEvent('scan_processed', { eventId, deviceId, kind, source, delayedSync: cls.delayedSync, clockSkew: cls.clockSkew,
    guardians: links.size, pushesSent, pushesFailed, tokensPruned: pruned, latencyMs: Date.now() - t0 });
  return { outcome: 'processed' };
}
