import S from '../strings.js';
import { formatDateLabel, formatScanTime } from '../../../shared/dates.js';

export function groupByDate(events) {
  const by = new Map();
  for (const e of events) { if (!by.has(e.scannedDate)) by.set(e.scannedDate, []); by.get(e.scannedDate).push(e); }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, items]) => ({ date, label: formatDateLabel(date), items }));
}
export const eventTitle = (e) => (e.kind === 'in' ? S.eventIn : S.eventOut);

export function describeToday(today, todayDate) {
  if (!today || today.date !== todayDate) return { lines: [], empty: S.homeTodayNone };
  const events = today.events || [
    ...(today.firstIn ? [{ kind: 'in', time: today.firstIn.time }] : []),
    ...(today.lastOut ? [{ kind: 'out', time: today.lastOut.time }] : []),
  ];
  if (!events.length) return { lines: [], empty: S.homeTodayNone };
  const lines = events.map((e) => `${e.kind === 'in' ? S.homeEntered : S.homeLeft} ${formatScanTime(e.time)}`);
  if (!events.some((e) => e.kind === 'in')) lines.unshift(S.homeTodayNone);
  if (events[events.length - 1].kind === 'in') lines.push(S.homeNoExit);
  return { lines, empty: null };
}
