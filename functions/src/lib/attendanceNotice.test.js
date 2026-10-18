import { describe, expect, it } from 'vitest';
import { nextNotice, NOTIFY_DELAY_MS } from './attendanceNotice.js';

describe('nextNotice', () => {
  it('waits two minutes before telling families', () => {
    expect(NOTIFY_DELAY_MS).toBe(120000);
  });
  it('queues a first flag against the state families already saw', () => {
    expect(nextNotice(undefined, { previousAbsent: false, absent: true })).toEqual({ status: 'pending', baselineAbsent: false });
  });
  it('cancels a flag undone before it was sent', () => {
    const queued = { status: 'pending', baselineAbsent: false, absent: true };
    expect(nextNotice(queued, { previousAbsent: true, absent: false })).toEqual({ status: 'cancelled', baselineAbsent: false });
  });
  it('queues a reversal after the earlier update was sent', () => {
    const sent = { status: 'done', baselineAbsent: false, absent: true };
    expect(nextNotice(sent, { previousAbsent: true, absent: false })).toEqual({ status: 'pending', baselineAbsent: true });
  });
  it('treats an update being sent as already seen', () => {
    const sending = { status: 'sending', baselineAbsent: false, absent: true };
    expect(nextNotice(sending, { previousAbsent: true, absent: false })).toEqual({ status: 'pending', baselineAbsent: true });
  });
});
