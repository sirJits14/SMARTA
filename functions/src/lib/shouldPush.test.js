import { describe, it, expect } from 'vitest';
import { shouldPush, guardianPushGate } from './shouldPush.js';
const M = 60_000;
describe('shouldPush', () => {
  const base = { paused: false, delayedSync: false, clockSkew: false, lastPush: null, kind: 'in', nowMs: 100 * M };
  it('sends by default', () => expect(shouldPush(base)).toEqual({ send: true }));
  it('paused wins', () => expect(shouldPush({ ...base, paused: true, delayedSync: true })).toEqual({ send: false, status: 'skipped_paused' }));
  it('delayed or skewed are suppressed', () => {
    expect(shouldPush({ ...base, delayedSync: true })).toEqual({ send: false, status: 'skipped_suppressed' });
    expect(shouldPush({ ...base, clockSkew: true })).toEqual({ send: false, status: 'skipped_suppressed' });
  });
  it('same-kind push within 10 minutes is suppressed; other kind or older is not', () => {
    expect(shouldPush({ ...base, lastPush: { kind: 'in', atMs: 95 * M } })).toEqual({ send: false, status: 'skipped_suppressed' });
    expect(shouldPush({ ...base, lastPush: { kind: 'out', atMs: 95 * M } })).toEqual({ send: true });
    expect(shouldPush({ ...base, lastPush: { kind: 'in', atMs: 89 * M } })).toEqual({ send: true });
  });
});
describe('guardianPushGate', () => {
  it('gates on account toggle then device count', () => {
    expect(guardianPushGate({ notificationsEnabled: false, tokenCount: 2 })).toBe('skipped_disabled');
    expect(guardianPushGate({ notificationsEnabled: true, tokenCount: 0 })).toBe('skipped_no_device');
    expect(guardianPushGate({ notificationsEnabled: true, tokenCount: 1 })).toBeNull();
  });
});
