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
