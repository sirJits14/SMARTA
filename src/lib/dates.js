export const pad2 = (n) => String(n).padStart(2, '0');

export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const localMonth = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

export function schoolDaysInMonth(year, month /* 1..12 */) {
  const out = [];
  const days = new Date(year, month, 0).getDate();
  for (let day = 1; day <= days; day++) {
    const dow = new Date(year, month - 1, day).getDay(); // 0 Sun .. 6 Sat
    if (dow !== 0 && dow !== 6) out.push(`${year}-${pad2(month)}-${pad2(day)}`);
  }
  return out;
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export function previousSchoolYear(sy) {
  const [start] = sy.split('-').map(Number);
  return `${start - 1}-${start}`;
}

// Calendar math for the dashboard. Dates are local ISO days (YYYY-MM-DD); noon
// avoids any daylight-saving edge when stepping a day at a time.
const noon = (iso) => new Date(`${iso}T12:00:00`);

export const addDays = (iso, n) => {
  const d = noon(iso);
  d.setDate(d.getDate() + n);
  return localDate(d);
};

export const isWeekend = (iso) => {
  const dow = noon(iso).getDay();
  return dow === 0 || dow === 6;
};

// Monday to Friday of the week holding `iso`. A weekend maps to the week that just ended.
export function weekdaysOf(iso) {
  const dow = noon(iso).getDay();
  const monday = addDays(iso, dow === 0 ? -6 : 1 - dow);
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
}

export function schoolDaysToDate(iso) {
  const [y, m] = iso.split('-').map(Number);
  return schoolDaysInMonth(y, m).filter((d) => d <= iso);
}

export const shiftMonth = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  return localMonth(new Date(y, m - 1 + n, 1));
};

// Monday-first weeks covering the whole month, padded with the neighbouring months' days.
export function monthGrid(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const start = addDays(`${ym}-01`, -lead);
  const weeks = Math.ceil((lead + new Date(y, m, 0).getDate()) / 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, w * 7 + i);
    return { date, inMonth: date.startsWith(ym), weekend: i >= 5 };
  }));
}

const MANILA_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
export function manilaDay(ms) {
  const parts = Object.fromEntries(MANILA_DAY.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export const dayLabel = (iso, options) => noon(iso).toLocaleDateString('en-PH', options);
