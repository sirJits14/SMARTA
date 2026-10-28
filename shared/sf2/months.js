import { schoolDaysInMonth } from './calendar.js';

const SCHOOL_YEAR = /^(\d{4})-(\d{4})$/;
const pad2 = (n) => String(n).padStart(2, '0');

// The months an adviser may download an SF2 for: June of the school year's first year through May of
// its second, up to `today` (a YYYY-MM-DD in school time), and only once the month's first weekday has
// arrived. Newest first, as YYYY-MM. The Parent App and Cloud Functions share this rule.
export function sf2Months(schoolYear, today) {
  const match = SCHOOL_YEAR.exec(schoolYear || '');
  if (!match || Number(match[2]) !== Number(match[1]) + 1 || !/^\d{4}-\d{2}-\d{2}$/.test(today || '')) return [];
  const start = Number(match[1]);
  const months = [];
  for (let i = 0; i < 12; i++) {
    const year = start + Math.floor((5 + i) / 12); // June is zero-based month 5
    const month = ((5 + i) % 12) + 1;
    if (schoolDaysInMonth(year, month)[0] <= today) months.push(`${year}-${pad2(month)}`);
  }
  return months.reverse();
}

export const isSf2Month = (schoolYear, month, today) => sf2Months(schoolYear, today).includes(month);
