export function markFor(docsByDate, date, studentId) {
  return docsByDate[date]?.marks?.[studentId] ?? 'P';
}

export function summarizeMonth({ roster, schoolDays, docsByDate }) {
  const out = {};
  for (const id of roster) {
    let present = 0, late = 0, absent = 0, excused = 0;
    for (const date of schoolDays) {
      const m = markFor(docsByDate, date, id);
      if (m === 'A') absent++;
      else if (m === 'E') excused++;
      else { present++; if (m === 'L') late++; } // P or L both count as present
    }
    out[id] = { present, late, absent, excused };
  }
  return out;
}

// Formats a kiosk-recorded scan time ("HH:MM", 24-hour, the same format
// bnhs-student-kiosk's localTime() and this app's own schedules.timeIn/
// timeOut already use) as a 12-hour label with AM/PM, matching the
// kiosk's own ConfirmScreen.jsx display convention. Returns an em dash
// when the student hasn't scanned in/out yet.
export function formatScanTime(hhmm) {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 || 12;
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`;
}

// Split-day schedules: the backend stores afternoon taps and informational
// notes beside timeIn/timeOut. Notes never change the P/L/A mark.
const NOTE_LABELS = [['absentAm', 'Absent AM'], ['latePm', 'Late PM']];
const PM_FIELDS = ['pmTimeIn', 'pmTimeOut', 'absentAm', 'latePm'];

export function pmDetails(doc, studentId) {
  return {
    pmTimeIn: doc?.pmTimeIn?.[studentId],
    pmTimeOut: doc?.pmTimeOut?.[studentId],
    notes: NOTE_LABELS.filter(([key]) => doc?.[key]?.[studentId] === true).map(([, label]) => label),
  };
}

export const hasPmData = (doc) => PM_FIELDS.some((k) => doc?.[k] && Object.keys(doc[k]).length > 0);

// Hover text for one learner's day on the monthly summary grid.
export function scanTitle(doc, studentId) {
  const timeIn = doc?.timeIn?.[studentId];
  const timeOut = doc?.timeOut?.[studentId];
  const pm = pmDetails(doc, studentId);
  const parts = [];
  if (timeIn || timeOut) parts.push(`Time in: ${formatScanTime(timeIn)}  ·  Time out: ${formatScanTime(timeOut)}`);
  if (pm.pmTimeIn || pm.pmTimeOut) parts.push(`PM in: ${formatScanTime(pm.pmTimeIn)}  ·  PM out: ${formatScanTime(pm.pmTimeOut)}`);
  parts.push(...pm.notes);
  return parts.length ? parts.join('  ·  ') : undefined;
}
