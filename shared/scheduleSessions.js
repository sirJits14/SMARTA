// Split-day schedules (e.g. Grade 12: 08:00–12:00 and 13:00–16:00), shared
// by the SIMS, parent/ and functions/. Times are zero-padded "HH:MM", the
// format schedules and kiosk scans already use, so string order is time order.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const valid = (t) => typeof t === 'string' && HHMM.test(t);
const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const fromMinutes = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const hasPmSession = (schedule) =>
  valid(schedule?.timeOut) && valid(schedule?.pmTimeIn) && valid(schedule?.pmTimeOut);

// Halfway through the lunch break: a 12:05 tap-out is still the morning
// departure and a 12:50 tap-in is already the afternoon arrival.
export function sessionSplit(schedule) {
  if (!hasPmSession(schedule)) return null;
  return fromMinutes(Math.floor((toMinutes(schedule.timeOut) + toMinutes(schedule.pmTimeIn)) / 2));
}

export function sessionOf(time, schedule) {
  const split = sessionSplit(schedule);
  return split && time >= split ? 'pm' : 'am';
}

// Informational notes for one learner's day, from all of their tap-in times.
// A missing afternoon tap-in is not a note: some learners stay on campus at lunch.
export function sessionNotes({ inTimes, schedule }) {
  if (!hasPmSession(schedule) || !inTimes?.length) return [];
  const pm = inTimes.filter((t) => sessionOf(t, schedule) === 'pm').sort();
  const notes = [];
  if (pm.length === inTimes.length) notes.push('absentAm');
  if (pm.length && pm[0] > schedule.pmTimeIn) notes.push('latePm');
  return notes;
}
