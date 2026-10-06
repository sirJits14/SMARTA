import S from '../strings.js';
import { toMillis, isVisibleToParents } from '../../../shared/announcements.js';
import { manilaDate, manilaTime, formatScanTime } from '../../../shared/dates.js';

// Only http(s) URLs ever become links; everything else stays plain text
// (no HTML is stored or rendered). Trailing sentence punctuation is left
// out of the link: "see https://x.ph." links https://x.ph.
const URL_RE = /\bhttps?:\/\/[^\s<>"]+/gi;
const TRAIL = /[.,;:!?)\]}'"]+$/;
export function linkify(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(TRAIL, '');
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'link', href: url, value: url });
    last = m.index + url.length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

export function audienceText(keys = []) {
  if (keys.includes('all')) return S.audienceAll;
  const grades = keys.map((k) => k.slice(1));
  if (grades.length === 1) return `${S.audienceGrade} ${grades[0]}`;
  return `${S.audienceGrades} ${grades.slice(0, -1).join(', ')} ${S.announcementsAnd} ${grades[grades.length - 1]}`;
}

// rows arrive newest first from the query; keep that order in both groups.
export function splitForList(rows, nowMs) {
  const visible = rows.filter((p) => isVisibleToParents(p, nowMs));
  return { pinned: visible.filter((p) => p.pinned), rest: visible.filter((p) => !p.pinned) };
}

export function isNewSince(post, seenAt) {
  const seen = toMillis(seenAt);
  return seen == null || (toMillis(post.publishedAt) ?? 0) > seen;
}

export const hasUnread = (newest, seenAt, nowMs) => !!newest && isVisibleToParents(newest, nowMs) && isNewSince(newest, seenAt);

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function postDateLabel(at, now = new Date()) {
  const d = at instanceof Date ? at : new Date(toMillis(at));
  const day = manilaDate(d);
  if (day === manilaDate(now)) return `${S.announcementsToday}, ${formatScanTime(manilaTime(d))}`;
  const [y, m, dd] = day.split('-').map(Number);
  const label = `${MON[m - 1]} ${dd}`;
  return String(y) === manilaDate(now).slice(0, 4) ? label : `${label}, ${y}`;
}
