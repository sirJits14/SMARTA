import { hasPmSession } from '../../../shared/scheduleSessions.js';
import { formatScanTime } from '../../../shared/dates.js';
import S from '../strings.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const valid = (t) => typeof t === 'string' && HHMM.test(t);
const label = (name, from, to) => (valid(from) && valid(to) ? `${name} · ${formatScanTime(from)}–${formatScanTime(to)}` : name);

// The session rows a learner's SIMS schedule calls for. Single-session
// schedules (Morning or Afternoon shift) keep their mark and gate times in the
// `am` slot. `undefined` is a server from before schedules were sent.
export function sessionRows(schedule) {
  if (schedule === undefined) return [{ key: 'am', label: S.sessionAm }, { key: 'pm', label: S.sessionPm }];
  if (hasPmSession(schedule)) {
    return [
      { key: 'am', label: label(S.sessionAm, schedule.timeIn, schedule.timeOut) },
      { key: 'pm', label: label(S.sessionPm, schedule.pmTimeIn, schedule.pmTimeOut) },
    ];
  }
  if (!valid(schedule?.timeIn)) return [{ key: 'am', label: S.sessionWholeDay }];
  const name = schedule.timeIn < '12:00' ? S.sessionMorningShift : S.sessionAfternoonShift;
  return [{ key: 'am', label: label(name, schedule.timeIn, schedule.timeOut) }];
}

export const sessionFootnote = (rows) => (rows.length === 2 ? S.sessionSplitNote : S.sessionSingleNote);
