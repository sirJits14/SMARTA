import { markFor } from './attendance.js';

const MARK_CHAR = { P: '', A: 'X', L: 'L', E: 'E' };

export function markChar(mark) {
  return MARK_CHAR[mark] ?? '';
}

const cmp = (a, b) =>
  a.lastName.localeCompare(b.lastName, 'en', { sensitivity: 'base' }) ||
  a.firstName.localeCompare(b.firstName, 'en', { sensitivity: 'base' });

export function splitByGender(roster) {
  return {
    male: roster.filter((s) => s.sex !== 'F').sort(cmp),
    female: roster.filter((s) => s.sex === 'F').sort(cmp),
  };
}

export function dailyPresentCount(students, date, docsByDate) {
  return students.filter((s) => {
    const m = markFor(docsByDate, date, s.id);
    return m === 'P' || m === 'L';
  }).length;
}

export function rowsFor(students, schoolDays, docsByDate) {
  return students.map((student) => {
    let absentTotal = 0;
    let tardyTotal = 0;
    const marks = schoolDays.map((date) => {
      const m = markFor(docsByDate, date, student.id);
      if (m === 'A') absentTotal++;
      if (m === 'L') tardyTotal++;
      return markChar(m);
    });
    return { student, marks, absentTotal, tardyTotal };
  });
}

export function dailyTallies(students, schoolDays, docsByDate) {
  return schoolDays.map((date) => dailyPresentCount(students, date, docsByDate));
}

// Rotates a chronological school-day list so it starts at that month's
// first Monday, wrapping any earlier days (a partial first week, e.g. a
// month that starts on a Wednesday) to the end of the list instead of the
// front. This only reorders -- it never adds, drops, or duplicates a day,
// so it's always safe against the SF2 template's fixed 25-column capacity
// regardless of which weekday the month happens to start on.
export function mondayFirstOrder(schoolDays) {
  const isMonday = (date) => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).getDay() === 1;
  };
  const idx = schoolDays.findIndex(isMonday);
  if (idx <= 0) return schoolDays;
  return [...schoolDays.slice(idx), ...schoolDays.slice(0, idx)];
}

const round1 = (n) => Math.round(n * 10) / 10;

export function summaryFigures({ enrolledAsOfCutoff, registeredEndOfMonth, dailyTalliesCombined, schoolDays }) {
  const percentEnrolment = enrolledAsOfCutoff > 0 ? round1((registeredEndOfMonth / enrolledAsOfCutoff) * 100) : 0;
  const avgDailyAttendance = schoolDays.length > 0
    ? round1(dailyTalliesCombined.reduce((a, b) => a + b, 0) / schoolDays.length)
    : 0;
  const percentAttendance = registeredEndOfMonth > 0 ? round1((avgDailyAttendance / registeredEndOfMonth) * 100) : 0;
  return { percentEnrolment, avgDailyAttendance, percentAttendance };
}
