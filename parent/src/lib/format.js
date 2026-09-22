import S from '../strings.js';
import { formatDateLabel, formatScanTime } from '../../../shared/dates.js';

export function groupByDate(events) {
  const by = new Map();
  for (const e of events) { if (!by.has(e.scannedDate)) by.set(e.scannedDate, []); by.get(e.scannedDate).push(e); }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, items]) => ({ date, label: formatDateLabel(date), items }));
}
export const eventTitle = (e) => (e.kind === 'in' ? S.eventIn : S.eventOut);

export function describeToday(today, todayDate) {
  if (!today || today.date !== todayDate || (!today.firstIn && !today.lastOut)) return { entered: S.homeTodayNone, left: null };
  return {
    entered: today.firstIn ? `${S.homeEntered} ${formatScanTime(today.firstIn.time)}` : S.homeTodayNone,
    left: today.lastOut ? `${S.homeLeft} ${formatScanTime(today.lastOut.time)}` : S.homeNoExit,
  };
}
