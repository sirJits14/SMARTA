import S from '../strings.js';
import { formatDateLabel, manilaDate, manilaTime } from '../../../shared/dates.js';

// Where an inbox item sits on the timeline. Attendance items carry the
// kiosk's own scan date/time (what a parent cares about); system items only
// have the server's createdAt, read in Manila time. A server timestamp that
// hasn't resolved yet (null) counts as "now", so it lands at the bottom like
// a text that was just sent.
export function itemMoment(item, now = new Date()) {
  if (item.type === 'attendance') return { date: item.scannedDate, time: item.scannedTime };
  const d = item.createdAt?.toDate ? item.createdAt.toDate() : now;
  return { date: manilaDate(d), time: manilaTime(d) };
}

export function dayLabel(date, todayDate) {
  if (date === todayDate) return S.dayToday;
  const [y, m, d] = todayDate.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  if (date === yesterday) return S.dayYesterday;
  return formatDateLabel(date);
}

const createdMs = (item) => (item.createdAt?.toMillis ? item.createdAt.toMillis() : Number.MAX_SAFE_INTEGER);

// The Inbox as one text-message thread: days oldest -> newest (newest at the
// bottom), messages oldest -> newest within a day, and back-to-back messages
// about the same learner stacked into one run under a single name -- the way
// chat apps group consecutive texts from one sender.
export function toFeed(items, todayDate, now = new Date()) {
  const rows = items.map((it) => ({ it, m: itemMoment(it, now) }));
  rows.sort((a, b) => {
    const ka = `${a.m.date}T${a.m.time}`, kb = `${b.m.date}T${b.m.time}`;
    if (ka !== kb) return ka < kb ? -1 : 1;
    return createdMs(a.it) - createdMs(b.it);
  });

  const days = [];
  for (const { it, m } of rows) {
    let day = days[days.length - 1];
    if (!day || day.date !== m.date) {
      day = { date: m.date, label: dayLabel(m.date, todayDate), runs: [] };
      days.push(day);
    }
    const key = it.studentId || 'school';
    let run = day.runs[day.runs.length - 1];
    if (!run || run.key !== key) {
      run = { key, studentId: it.studentId || null, learnerName: null, items: [] };
      day.runs.push(run);
    }
    if (!run.learnerName && it.learnerName) run.learnerName = it.learnerName;
    run.items.push({ ...it, time: m.time });
  }
  return days;
}

const effectiveMs = (e) => (e.effectiveAt?.toMillis ? e.effectiveAt.toMillis() : 0);

// One History day, stacked the way it happened: Entered before Left.
export function stackDay(events) {
  return [...events].sort((a, b) => {
    if (a.scannedTime !== b.scannedTime) return a.scannedTime < b.scannedTime ? -1 : 1;
    return effectiveMs(a) - effectiveMs(b);
  });
}

// A learner's History as one text-message thread: days oldest -> newest (the
// latest scan at the bottom), each day's scans stacked oldest -> newest.
export function historyThread(events, todayDate) {
  const byDate = new Map();
  for (const e of events) { if (!byDate.has(e.scannedDate)) byDate.set(e.scannedDate, []); byDate.get(e.scannedDate).push(e); }
  return [...byDate.keys()].sort().map((date) => ({ date, label: dayLabel(date, todayDate), items: stackDay(byDate.get(date)) }));
}
