import S from '../strings.js';
import { formatScanTime } from '../../../shared/dates.js';

export const eventTitle = (e) => (e.kind === 'in' ? S.eventIn : S.eventOut);

export const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

// Name suffixes written as Roman numerals, kept in capitals as whole words.
const ROMAN_SUFFIX = /^(ii|iii|iv)$/i;

// "DELA CRUZ, ANA B. JR." -> "Dela Cruz, Ana B. Jr." for display only; the
// registrar's records keep whatever casing was entered. Each run of letters
// that is all upper- or all lower-case is recased, so hyphens and
// apostrophes start a new capital (Santos-Villanueva, O'Neil); a run that is
// already mixed (McDonald) is left alone. Initials and II/III/IV stay capital.
export function nameCase(name) {
  if (typeof name !== 'string') return name;
  return name.replace(/\p{L}+/gu, (run, offset, all) => {
    if (run !== run.toUpperCase() && run !== run.toLowerCase()) return run;
    const before = all[offset - 1] || ' ';
    const after = all[offset + run.length] || ' ';
    if (run.length === 1 || (ROMAN_SUFFIX.test(run) && /[\s,]/.test(before) && /[\s,.]/.test(after))) return run.toUpperCase();
    return run[0].toUpperCase() + run.slice(1).toLowerCase();
  });
}

export function initials(name) {
  const words = typeof name === 'string' ? name.trim().split(/\s+/).filter(Boolean) : [];
  while (words.length > 1 && NAME_SUFFIXES.has(words[words.length - 1].replace(/\.$/, '').toLowerCase())) words.pop();
  if (!words.length) return '?';
  return `${words[0][0]}${words.length > 1 ? words[words.length - 1][0] : ''}`.toUpperCase();
}

// The latest scan of today ({ kind, time }), or null when there is none.
// Home and History show only this; the full list lives on History.
export function latestScan(today, todayDate) {
  if (!today || today.date !== todayDate) return null;
  const legacy = [
    today.firstIn && { kind: 'in', time: today.firstIn.time },
    today.lastOut && { kind: 'out', time: today.lastOut.time },
  ].filter(Boolean);
  // Older summaries have no events list; their status tells which of firstIn/lastOut came last.
  if (today.status === 'in') legacy.reverse();
  const events = today.events || legacy;
  return events[events.length - 1] || null;
}

export function latestScanToday(today, todayDate) {
  const latest = latestScan(today, todayDate);
  if (!latest) return S.homeTodayNone;
  return `${latest.kind === 'in' ? S.homeEntered : S.homeLeft} ${formatScanTime(latest.time)}`;
}
