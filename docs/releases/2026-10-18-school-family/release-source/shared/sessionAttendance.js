// Base day marks remain the historical source of truth. Session corrections
// only mask a session; clearing a correction restores the original mark.
export function sessionAttendance(record, studentId, { unrecordedStatus = 'P' } = {}) {
  const base = record?.marks?.[studentId] ?? (record?.timeIn?.[studentId] || record?.pmTimeIn?.[studentId] ? 'P' : unrecordedStatus);
  const correction = record?.sessionOverrides?.[studentId] || {};
  const session = key => {
    const override = correction[key];
    const status = override?.absent === true ? 'A' : base;
    return { status, absent: status === 'A', overrideActive: override?.absent === true, reason: override?.reason || '',
      actorName: override?.actorName || '', changedAt: override?.changedAt || null };
  };
  return { am: session('am'), pm: session('pm'), revision: correction.revision || 0 };
}

export function attendanceUnits(record, studentId) {
  const { am, pm } = sessionAttendance(record, studentId);
  const statuses = [am.status, pm.status];
  return {
    present: statuses.filter(s => s === 'P' || s === 'L').length / 2,
    absent: statuses.filter(s => s === 'A').length / 2,
    excused: statuses.filter(s => s === 'E').length / 2,
    late: statuses.includes('L') ? 1 : 0,
  };
}

export function effectiveDayMark(record, studentId) {
  const { am, pm } = sessionAttendance(record, studentId);
  if (am.status === pm.status) return am.status;
  if (am.absent || pm.absent) return 'H'; // one absent half-day
  return am.status === 'L' || pm.status === 'L' ? 'L' : am.status;
}
