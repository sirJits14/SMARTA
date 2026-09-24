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

// Per-instance, per-device rolling-minute counter for the forged/
// malfunctioning-kiosk rate anomaly warning (spec §5 edge cases). This is a
// detective control only -- the kiosk is already constrained by App Check +
// the device/enrollment checks below. A Firestore-backed cross-instance
// counter would be over-engineering for a handful of low-volume kiosks; an
// in-memory counter that resets each minute bucket is correct at this
// scale (instance recycling only ever under-counts, never false-alarms).
// scannedTime is already minute-granular and is the kiosk's own clock, so
// it's the natural bucket -- no new clock source needed.
const RATE_LIMIT_PER_MIN = 60;
const deviceRate = new Map();
function checkDeviceRate(deviceId, data) {
  const bucket = `${data.scannedDate}T${data.scannedTime}`;
  const prior = deviceRate.get(deviceId);
  const count = prior && prior.bucket === bucket ? prior.count + 1 : 1;
  deviceRate.set(deviceId, { bucket, count });
  if (count > RATE_LIMIT_PER_MIN) logWarn('device_rate_anomaly', { deviceId, bucket, count });
}
export function clearDeviceRate() { deviceRate.clear(); }

// Spec §5. The only writer of learners/* and guardians/*/inbox/*. Every step
// is keyed on eventId so a re-delivered trigger is a no-op.
export async function handleScanEvent({ db, messaging, portalUrl, now = () => new Date() }, { eventId, data, suppressPush = false }) {
  const t0 = Date.now();
  const { studentId, schoolYear, kind, deviceId, source } = data;
  const isStaff = source === 'staff';
  // TEMP(kiosk-v1-compat): synthesized by src/handlers/legacyAttendanceSync.js
  // from kiosk v1's student_attendance timeIn/timeOut writes -- there's no
  // registered kiosks/{uid} doc for these, so it needs its own identity
  // branch, same as isStaff. Delete alongside that bridge once kiosk v2 is
  // live everywhere (docs/parent-portal-rollout-checklist.md K1/K2).
  const isAttendanceSync = source === 'attendance-sync';

  // 1. device
  const kiosk = isStaff ? { label: 'School office', active: true }
    : isAttendanceSync ? { label: 'School gate', active: true }
    : await cached(`kiosk:${deviceId}`, CACHE_MS, async () => (await db.doc(`kiosks/${deviceId}`).get()).data() || null);
  if (!kiosk || kiosk.active !== true) { logWarn('scan_rejected', { eventId, deviceId, reason: 'device' }); return { outcome: 'rejected:device' }; }
  if (!isStaff && !isAttendanceSync) checkDeviceRate(deviceId, data);

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
    // Fetched once here and reused by sendToGuardian below (its tokens and
    // failure-count updates need the same docs) instead of each querying
    // guardians/{uid}/devices separately.
    const devSnap = await db.collection(`guardians/${uid}/devices`).where('enabled', '==', true).get();
    const gGate = guardianPushGate({ notificationsEnabled: guardian.notificationsEnabled !== false, tokenCount: devSnap.size });
    if (gGate) { await inboxRef.set({ ...item, pushStatus: gGate }, { merge: true }); continue; }

    if (!prior) await inboxRef.set(item);
    const res = await sendToGuardian({ db, messaging, portalUrl }, { inboxId: eventId, studentId, devDocs: devSnap.docs });
    pruned += res.pruned;
    if (res.status === 'sent') pushesSent++; else if (res.status === 'failed') pushesFailed++;
    await inboxRef.set({ pushStatus: res.status, pushSentAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  if (pushesSent > 0) await learnerRef.set({ lastPush: { kind, at: Timestamp.fromDate(now()) } }, { merge: true });

  // Marks the fan-out loop above as having run to completion (success or
  // per-guardian-skipped -- either way it didn't throw). reconcileEvents'
  // "is this event done" check needs this: the learner projection above is
  // written in its own transaction BEFORE fan-out runs, so a throw partway
  // through fan-out (after that transaction already committed) would
  // otherwise be indistinguishable from a fully-delivered event once the
  // projection alone is checked. void events have no eventRef/projection
  // (reconcileEvents already skips them outright), so this is skipped too.
  if (kind !== 'void') await eventRef.set({ fanOutDone: true }, { merge: true });

  logEvent('scan_processed', { eventId, deviceId, kind, source, delayedSync: cls.delayedSync, clockSkew: cls.clockSkew,
    guardians: links.size, pushesSent, pushesFailed, tokensPruned: pruned, latencyMs: Date.now() - t0 });
  return { outcome: 'processed' };
}
