import { it, expect, vi } from 'vitest';
import { startLocalDayClock } from './localDayClock.js';
it('refreshes at local midnight and after sleep without leaking timers',()=>{
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date(2026,8,25,23,59,59));const days=[];
    const clock=startLocalDayClock({now:()=>new Date(),schedule:(fn,ms)=>setTimeout(fn,ms),cancel:clearTimeout,onDay:d=>days.push(d)});
    expect(days).toEqual(['2026-09-25']);
    vi.advanceTimersByTime(1100);expect(days.at(-1)).toBe('2026-09-26');
    vi.setSystemTime(new Date(2026,8,28,9));clock.refresh();clock.refresh();
    expect(days).toEqual(['2026-09-25','2026-09-26','2026-09-28']);
    clock.stop();expect(vi.getTimerCount()).toBe(0);clock.refresh();expect(vi.getTimerCount()).toBe(0);
  } finally {vi.useRealTimers();}
});
