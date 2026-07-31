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

const round1 = (n) => Math.round(n * 10) / 10;

export function summaryFigures({ enrolledAsOfCutoff, registeredEndOfMonth, dailyTalliesCombined, schoolDays }) {
  const percentEnrolment = enrolledAsOfCutoff > 0 ? round1((registeredEndOfMonth / enrolledAsOfCutoff) * 100) : 0;
  const avgDailyAttendance = schoolDays.length > 0
    ? round1(dailyTalliesCombined.reduce((a, b) => a + b, 0) / schoolDays.length)
    : 0;
  const percentAttendance = registeredEndOfMonth > 0 ? round1((avgDailyAttendance / registeredEndOfMonth) * 100) : 0;
  return { percentEnrolment, avgDailyAttendance, percentAttendance };
}
