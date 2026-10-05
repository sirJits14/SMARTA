import { TITLE_MAX, BODY_MAX, MAX_PINNED, canPostToAll, postableGrades, coversPostKeys, postAudienceKeys, toMillis, manilaDateTime, endOfManilaDay } from '../../shared/announcements.js';
import { manilaDate, manilaTime } from '../../shared/dates.js';

// Pure helpers behind the Announcements page (spec 2026-10-05).
export const TABS = [['live', 'Live'], ['scheduled', 'Scheduled'], ['ended', 'Ended']];
export const tabOf = (p) => (p.status === 'published' ? 'live' : p.status === 'scheduled' ? 'scheduled' : 'ended');

const by = (field, dir) => (a, b) => dir * ((toMillis(a[field]) ?? 0) - (toMillis(b[field]) ?? 0));
export function postsForTab(posts, tab) {
  const rows = posts.filter((p) => tabOf(p) === tab);
  if (tab === 'scheduled') return rows.sort(by('publishAt', 1));
  if (tab === 'live') return rows.sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true) || by('publishedAt', -1)(a, b));
  return rows.sort(by('updatedAt', -1));
}

export function audienceLabel(keys = []) {
  if (keys.includes('all')) return 'All parents';
  return keys.map((k) => `Grade ${k.slice(1)}`).join(' · ');
}

export function pushStatusText(p) {
  if (!p.push) return 'No push';
  const r = p.pushResult;
  if (!r || r.status === 'sending') return 'Push pending';
  if (r.status === 'sent') { const n = r.sent ?? 0; return `Push sent to ${n.toLocaleString('en-US')} device${n === 1 ? '' : 's'}`; }
  if (r.status === 'skipped_paused') return 'Push skipped: notifications paused';
  return 'Push may not have reached everyone';
}

// Pinned posts that are live or will go live, so a scheduled pin can't make a fourth.
export const pinnedCount = (posts, exceptId) =>
  posts.filter((p) => (p.status === 'published' || p.status === 'scheduled') && p.pinned && p.id !== exceptId).length;

export const audienceOf = (f) => (f.all ? { all: true } : { grades: [...f.grades].map(Number).sort((a, b) => a - b) });

export function emptyForm(me) {
  const grades = postableGrades(me);
  return { title: '', body: '', all: false, grades: grades.length === 1 ? [...grades] : [], when: 'now', date: '', time: '', expires: '', pinned: false, push: false };
}

export function formFromPost(p) {
  const publish = toMillis(p.publishAt), expires = toMillis(p.expiresAt);
  return {
    title: p.title, body: p.body, all: !!p.audience?.all, grades: p.audience?.grades ? [...p.audience.grades] : [],
    when: p.status === 'scheduled' ? 'schedule' : 'now',
    date: publish == null ? '' : manilaDate(new Date(publish)), time: publish == null ? '' : manilaTime(new Date(publish)),
    expires: expires == null ? '' : manilaDate(new Date(expires)),
    pinned: !!p.pinned, push: !!p.push,
  };
}

// editing: the post being edited, or null for a new one. A live post's
// audience and timing are locked, so only its wording, pin and expiry are checked.
export function validateForm(f, { me, nowMs, pinnedCount: pins, editing }) {
  const title = f.title.trim(), body = f.body.trim();
  if (!title) return 'Enter a title.';
  if (title.length > TITLE_MAX) return `The title can be at most ${TITLE_MAX} characters.`;
  if (!body) return 'Enter a message.';
  if (body.length > BODY_MAX) return `The message can be at most ${BODY_MAX.toLocaleString('en-US')} characters.`;
  const live = editing?.status === 'published';
  let publishMs = nowMs;
  if (!live) {
    if (f.all && !canPostToAll(me)) return 'Only administrators can post to all parents.';
    const keys = postAudienceKeys(audienceOf(f));
    if (!keys.length) return 'Choose who the announcement is for.';
    if (!coversPostKeys(me, keys)) return 'You can only post to your own grades.';
    if (f.when === 'schedule') {
      if (!f.date || !f.time) return 'Choose a date and time to publish.';
      publishMs = manilaDateTime(f.date, f.time).getTime();
      if (publishMs <= nowMs) return 'Choose a publish time in the future.';
    }
  }
  if (f.expires && endOfManilaDay(f.expires).getTime() <= publishMs) return 'The expiry date must be after the publish time.';
  if (f.pinned && !editing?.pinned && pins >= MAX_PINNED) return `Only ${MAX_PINNED} announcements can be pinned at once. Unpin one first.`;
  return null;
}
