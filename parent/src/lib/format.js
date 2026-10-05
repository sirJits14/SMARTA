import S from '../strings.js';
import { formatScanTime } from '../../../shared/dates.js';

export const eventTitle = (e) => (e.kind === 'in' ? S.eventIn : S.eventOut);

const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

export function initials(name) {
  const words = typeof name === 'string' ? name.trim().split(/\s+/).filter(Boolean) : [];
  while (words.length > 1 && NAME_SUFFIXES.has(words[words.length - 1].replace(/\.$/, '').toLowerCase())) words.pop();
  if (!words.length) return '?';
  return `${words[0][0]}${words.length > 1 ? words[words.length - 1][0] : ''}`.toUpperCase();
}

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
