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

// Returns how many blank filler columns should precede the first real
// school day so that every column's weekday position aligns to a fixed
// Mon-Fri cycle (column 1 is always "the Monday slot", even if the
// month's first school day isn't a Monday). Dates stay in pure
// chronological order -- this only shifts where the FIRST real date is
// placed, it never reorders the days themselves.
//
// Always <= 4, and always safe against the template's fixed 25-column
// capacity: offset + schoolDays.length together equal the weekday count of
// a single Monday-anchored span of at most 35 calendar days (4 offset days
// + up to 31 days in the month), and 35 calendar days contain at most 5
// full Mon-Fri weeks = 25 weekdays. No runtime capacity check is needed.
export function mondayAlignmentOffset(schoolDays) {
  if (schoolDays.length === 0) return 0;
  const [y, m, d] = schoolDays[0].split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // schoolDays never includes Sat(6)/Sun(0), so this is always 1(Mon)-5(Fri)
  // Clamped defensively: if a future change to schoolDaysInMonth() ever let
  // a weekend day lead the list, an unclamped offset would either overrun
  // the day columns into the Absent/Tardy totals (Sat, dow=6 -> 5) or write
  // into the merged name cell (Sun, dow=0 -> -1).
  return Math.max(0, Math.min(4, dow - 1));
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
