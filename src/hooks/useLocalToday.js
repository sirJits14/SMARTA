import { useEffect, useState } from 'react';
import { localDate } from '../lib/dates.js';
import { startLocalDayClock } from '../lib/localDayClock.js';
export function useLocalToday() {
  const [day, setDay] = useState(() => localDate());
  useEffect(() => {
    const clock = startLocalDayClock({ now: () => new Date(), schedule: setTimeout, cancel: clearTimeout, onDay: setDay });
    const visible = () => { if (document.visibilityState === 'visible') clock.refresh(); };
    window.addEventListener('focus', clock.refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { clock.stop(); window.removeEventListener('focus', clock.refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  return day;
}
