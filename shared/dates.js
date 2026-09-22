// Pure date helpers shared by parent/ and functions/. The SIMS keeps its own
// src/lib/dates.js and the kiosk keeps its own copy; nothing here imports
// from either app.
export const pad2 = (n) => String(n).padStart(2, '0');

export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const localTime = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export const compactStamp = (d = new Date()) =>
  `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}`;

// DepEd school year runs June→March. June or later ⇒ current year starts the SY.
export function currentSchoolYear(date = new Date()) {
  const y = date.getFullYear();
  const start = date.getMonth() >= 5 ? y : y - 1;
  return `${start}-${start + 1}`;
}

export function previousSchoolYear(sy) {
  const [start] = sy.split('-').map(Number);
  return `${start - 1}-${start}`;
}

export function schoolYearStartDate(sy) {
  const [start] = sy.split('-').map(Number);
  return `${start}-06-01`;
}

const manilaParts = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') === '24' ? '00' : get('hour'), min: get('minute') };
};

export const manilaDate = (date = new Date()) => { const p = manilaParts(date); return `${p.y}-${p.m}-${p.d}`; };
export const manilaTime = (date = new Date()) => { const p = manilaParts(date); return `${p.h}:${p.min}`; };

export function formatScanTime(hhmm) {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${pad2(h12)}:${pad2(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatDateLabel(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DOW[date.getDay()]} ${d} ${MON[m - 1]}`;
}
