import S from '../strings.js';
import { formatDateLabel, formatScanTime } from '../../../shared/dates.js';

export function groupByDate(events) {
  const by = new Map();
  for (const e of events) { if (!by.has(e.scannedDate)) by.set(e.scannedDate, []); by.get(e.scannedDate).push(e); }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, items]) => ({ date, label: formatDateLabel(date), items }));
}
export const eventTitle = (e) => (e.kind === 'in' ? S.eventIn : S.eventOut);

// Home card shows only the latest scan of today; the full list lives on History.
export function latestScanToday(today, todayDate) {
  if (!today || today.date !== todayDate) return S.homeTodayNone;
  const legacy = [
    today.firstIn && { kind: 'in', time: today.firstIn.time },
    today.lastOut && { kind: 'out', time: today.lastOut.time },
  ].filter(Boolean);
  // Older summaries have no events list; their status tells which of firstIn/lastOut came last.
  if (today.status === 'in') legacy.reverse();
  const events = today.events || legacy;
  const latest = events[events.length - 1];
  if (!latest) return S.homeTodayNone;
  return `${latest.kind === 'in' ? S.homeEntered : S.homeLeft} ${formatScanTime(latest.time)}`;
}
