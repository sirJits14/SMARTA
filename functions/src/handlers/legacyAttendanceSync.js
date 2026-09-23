import { Timestamp } from 'firebase-admin/firestore';

// Bridges kiosk v1's student_attendance timeIn/timeOut maps into the same
// scan-processing pipeline that scan_events/onScanEventCreated feeds, so
// guardians see gate-scan entries even before kiosk v2 (which will write
// scan_events directly) is deployed and devices are registered -- see
// docs/parent-portal-rollout-checklist.md K1/K2. Delete this whole bridge
// (this file, the wiring in index.js, and the 'attendance-sync' branch in
// scanEvent.js) once every physical kiosk is on v2 and the legacy
// timeIn/timeOut writes stop.
//
// Manila has no DST, so `${date}T${hhmm}:00+08:00` is always the correct
// absolute instant for a Manila wall-clock date+time pair (src/data/attendance.js
// writes `date` via localDate(), and kiosk v1 writes timeIn/timeOut as
// 'HH:MM' 24-hour strings -- see src/lib/attendance.js formatScanTime).
export function toScannedAt(date, hhmm) {
  return Timestamp.fromDate(new Date(`${date}T${hhmm}:00+08:00`));
}

// Pure: diffs before/after timeIn/timeOut maps on a student_attendance doc
// and returns the scans that are new since the last write (a key that's
// absent before, or whose value changed -- covers both a fresh scan and a
// kiosk-side correction). "One timeIn, one timeOut per student per
// section-day" is the ceiling of what this data model records -- same
// granularity the registrar's own Attendance tab already shows -- so this
// bridge cannot surface more scans per day than that.
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
// this a no-op rather than a duplicate event. Prefixed distinctly from real
// kiosk device ids (which are Firebase Auth uids) so collision is not a
// concern.
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
