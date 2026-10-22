// School-calendar helpers for the SF2. SIMS keeps its own copies in src/lib/dates.js (see
// calendar.test.js, which keeps the two in step); Cloud Functions and the Parent App use these.
const pad2 = (n) => String(n).padStart(2, '0');

// Every weekday of a month as YYYY-MM-DD. SIMS has no holiday calendar, so each weekday counts.
export function schoolDaysInMonth(year, month /* 1..12 */) {
  const out = [];
  const days = new Date(year, month, 0).getDate();
  for (let day = 1; day <= days; day++) {
    const dow = new Date(year, month - 1, day).getDay(); // 0 Sun .. 6 Sat
    if (dow !== 0 && dow !== 6) out.push(`${year}-${pad2(month)}-${pad2(day)}`);
  }
  return out;
}

// "2026-10" -> "October 2026"
export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

// DepEd's "Enrolment as of 1st Friday of June" cutoff for a school year such as "2026-2027".
export function firstFridayOfJune(schoolYear) {
  const year = Number(schoolYear.split('-')[0]);
  const d = new Date(year, 5, 1); // June 1
  for (let i = 0; i < 7 && d.getDay() !== 5; i++) d.setDate(d.getDate() + 1); // 5 = Friday, at most 6 steps
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
