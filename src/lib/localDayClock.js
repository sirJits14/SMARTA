import { localDate } from './dates.js';
export function startLocalDayClock({ now, schedule, cancel, onDay }) {
  let active = true, timer, day;
  const refresh = () => {
    if (!active) return;
    if (timer !== undefined) cancel(timer);
    const current = now(), nextDay = localDate(current);
    if (nextDay !== day) { day = nextDay; onDay(day); }
    const midnight = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
    timer = schedule(refresh, Math.max(1, midnight.getTime() - current.getTime() + 50));
  };
  refresh();
  return { refresh, stop() { active = false; if (timer !== undefined) cancel(timer); } };
}
