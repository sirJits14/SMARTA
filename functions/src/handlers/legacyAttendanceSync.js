import { Timestamp } from 'firebase-admin/firestore';
import { cached } from '../cache.js';
import { logWarn } from '../log.js';
import { manilaDate } from '../../shared/dates.js';

// Bridges kiosk v1's student_attendance timeIn/timeOut maps into the same
// scan-processing pipeline that scan_events/onScanEventCreated feeds, so
// guardians see gate-scan entries even before kiosk v2 (which will write
// scan_events directly) is deployed and devices are registered -- see
// docs/parent-portal-rollout-checklist.md K1/K2. Delete this whole bridge
// (this file, the wiring in index.js, and the 'attendance-sync' branch in
// scanEvent.js) once every physical kiosk is on v2 and the legacy
// timeIn/timeOut writes stop.
//
// Only writes made by a registered, active kiosk whose Auth account is
// anonymous (i.e. a v1 kiosk) are bridged -- see isLegacyKioskWriter. The
// TEMP `|| signedIn()` rules fallback lets ANY signed-in caller write
// student_attendance, so without that gate anyone could sign in anonymously
// and fabricate "Entered/Left school" entries + pushes for any learner.
//
// Manila has no DST, so `${date}T${hhmm}:00+08:00` is always the correct
// absolute instant for a Manila wall-clock date+time pair (src/data/attendance.js
// writes `date` via localDate(), and kiosk v1 writes timeIn/timeOut as
// 'HH:MM' 24-hour strings -- see src/lib/attendance.js formatScanTime).
export function toScannedAt(date, hhmm) {
  return Timestamp.fromDate(new Date(`${date}T${hhmm}:00+08:00`));
}

// Pure: diffs before/after timeIn/timeOut maps on a student_attendance doc
// and returns the scans that are new since the last write: a key that's
// absent before, or whose value changed. A changed value (a kiosk-side
// correction) maps to the SAME legacyEventId as the original scan, so
// handleScanEvent overwrites that learner event's time in place; the
// guardian's existing inbox item keeps the old time and no new push is
// sent. "One timeIn, one timeOut per student per section-day" is the
// ceiling of what this data model records -- same granularity the
// registrar's own Attendance tab already shows -- so this bridge cannot
// surface more scans per day than that.
export function detectLegacyScans({ before, after }) {
  if (!after) return [];
  const { sectionId, date, schoolYear } = after;
  if (!sectionId || !date || !schoolYear) return [];

  const scans = [];
  for (const [kind, field] of [['in', 'timeIn'], ['out', 'timeOut']]) {
    const beforeMap = before?.[field] || {};
    const afterMap = after[field] || {};
    for (const [studentId, hhmm] of Object.entries(afterMap)) {
      if (beforeMap[studentId] === hhmm) continue;
      scans.push({ studentId, sectionId, schoolYear, kind, scannedDate: date, scannedTime: hhmm });
    }
  }
  return scans;
}

// A stable, idempotent id per (section, date, student, kind) -- a re-run of
// the same write (trigger redelivery) produces the same id, so
// handleScanEvent's own idempotency (everything keyed on eventId) makes
// this a no-op rather than a duplicate event. A corrected value for the
// same key also reuses the id (see detectLegacyScans). Prefixed distinctly
// from real kiosk device ids (which are Firebase Auth uids) so collision is
// not a concern.
export function legacyEventId(scan) {
  return `legacy_${scan.sectionId}_${scan.scannedDate}_${scan.studentId}_${scan.kind}`;
}

export function toScanEventData(scan, receivedAt) {
  return {
    studentId: scan.studentId, sectionId: scan.sectionId, schoolYear: scan.schoolYear, kind: scan.kind,
    deviceId: 'attendance-sync', source: 'attendance-sync',
    scannedAt: toScannedAt(scan.scannedDate, scan.scannedTime), scannedDate: scan.scannedDate, scannedTime: scan.scannedTime,
    receivedAt,
  };
}

// ---------- input guards (one bad entry must not wedge the trigger) ----------

export const MAX_SCANS_PER_WRITE = 20;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const matches = (re, v) => typeof v === 'string' && re.test(v);

// Pure: why a scan can't be safely turned into a scan event (a doc path
// segment that would throw or escape, or a time/date toScannedAt can't
// parse), or null if it's fine. schoolYear is checked with the id pattern
// too because handleScanEvent builds `enrollments/${studentId}_${schoolYear}`.
export function invalidScanReason(scan) {
  if (!matches(ID_RE, scan.studentId)) return 'studentId';
  if (!matches(ID_RE, scan.sectionId)) return 'sectionId';
  if (!matches(ID_RE, scan.schoolYear)) return 'schoolYear';
  if (!matches(DATE_RE, scan.scannedDate)) return 'date';
  if (!matches(TIME_RE, scan.scannedTime)) return 'time';
  return null;
}

// Pure: splits detected scans into the ones to process and the invalid ones
// (studentId + reason, for logging). Scans for any date other than `today`
// (the Manila date of the write) are dropped silently so a backfill or a
// replayed old doc doesn't flood guardians; this also filters out
// well-formed but impossible dates like 2026-02-31. If more than
// MAX_SCANS_PER_WRITE remain, none are accepted (cappedCount says how many).
export function selectLegacyScans(scans, { today }) {
  const accepted = [];
  const invalid = [];
  for (const scan of scans) {
    const reason = invalidScanReason(scan);
    if (reason) { invalid.push({ studentId: scan.studentId, reason }); continue; }
    if (scan.scannedDate !== today) continue;
    accepted.push(scan);
  }
  if (accepted.length > MAX_SCANS_PER_WRITE) return { accepted: [], invalid, cappedCount: accepted.length };
  return { accepted, invalid, cappedCount: 0 };
}

// ---------- writer gate ----------

const CACHE_MS = 30_000;

// Is the writer of this student_attendance change a v1 kiosk we trust:
// a kiosks/{authId} doc with active === true AND an anonymous Auth account
// (no linked providers)? Kiosk v2 devices use email/password accounts, so
// they fail the anonymous check -- their scans already arrive via
// scan_events, and bridging their student_attendance merge too would
// duplicate them. A missing Auth user is "not allowed"; any other Auth
// error propagates so the trigger retries.
export async function isLegacyKioskWriter({ db, auth, authId }) {
  if (!matches(ID_RE, authId)) return false;
  const kiosk = await cached(`kiosk:${authId}`, CACHE_MS, async () => (await db.doc(`kiosks/${authId}`).get()).data() || null);
  if (!kiosk || kiosk.active !== true) return false;
  return cached(`authAnonymous:${authId}`, CACHE_MS, async () => {
    try {
      const user = await auth.getUser(authId);
      return (user.providerData || []).length === 0;
    } catch (e) {
      if (e?.code === 'auth/user-not-found') return false;
      throw e;
    }
  });
}

// The onLegacyAttendanceScan trigger body. processScan(eventId, data) feeds
// one scan into handleScanEvent. eventTime is the CloudEvent's own time, so
// both "today" and receivedAt are stable across retries of the same event.
export async function handleLegacyAttendanceWrite({ db, auth, processScan }, { docId, authId, authType, eventTime, before, after }) {
  const scans = detectLegacyScans({ before, after });
  // Staff attendance marking and no-op merges carry no new scans: skip them
  // before any lookup (and without a writer warning).
  if (scans.length === 0) return { outcome: 'no-scans', processed: 0 };

  if (!(await isLegacyKioskWriter({ db, auth, authId }))) {
    // Staff use this line to find each v1 kiosk's anonymous uid to register
    // it. Never log the timeIn/timeOut contents.
    logWarn('legacy_scan_unregistered_writer', { authId, authType, docId });
    return { outcome: 'rejected:writer', processed: 0 };
  }

  const at = new Date(eventTime);
  const { accepted, invalid, cappedCount } = selectLegacyScans(scans, { today: manilaDate(at) });
  for (const { studentId, reason } of invalid) logWarn('legacy_scan_invalid', { docId, studentId, reason });
  if (cappedCount) {
    logWarn('legacy_scan_cap', { docId, count: cappedCount });
    return { outcome: 'capped', processed: 0 };
  }

  // One failing scan must not stop the others. Rethrow afterwards so a
  // transient failure is retried (retry: true); handleScanEvent is keyed on
  // eventId, so the ones that already succeeded are no-ops on the retry.
  const receivedAt = Timestamp.fromDate(at);
  let firstError = null;
  for (const scan of accepted) {
    const eventId = legacyEventId(scan);
    try {
      await processScan(eventId, toScanEventData(scan, receivedAt));
    } catch (e) {
      logWarn('legacy_scan_failed', { docId, eventId, error: String(e?.message || e) });
      firstError ||= e;
    }
  }
  if (firstError) throw firstError;
  return { outcome: 'processed', processed: accepted.length };
}
