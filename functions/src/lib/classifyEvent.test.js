import { describe, it, expect } from 'vitest';
import { classifyEvent } from './classifyEvent.js';
const H = 3600_000, M = 60_000;
describe('classifyEvent', () => {
  it('normal: received shortly after scan', () => {
    expect(classifyEvent({ scannedAtMs: 0, receivedAtMs: 2 * M })).toEqual({ delayedSync: false, clockSkew: false, effectiveAtMs: 0 });
  });
  it('delayed: received more than 2h after scan', () => {
    expect(classifyEvent({ scannedAtMs: 0, receivedAtMs: 2 * H + 1 })).toMatchObject({ delayedSync: true, clockSkew: false, effectiveAtMs: 0 });
    expect(classifyEvent({ scannedAtMs: 0, receivedAtMs: 2 * H })).toMatchObject({ delayedSync: false });
  });
  it('skew: scanned in the future (>5 min) or more than 24h in the past; positioned by receivedAt', () => {
    expect(classifyEvent({ scannedAtMs: 6 * M, receivedAtMs: 0 })).toEqual({ delayedSync: false, clockSkew: true, effectiveAtMs: 0 });
    expect(classifyEvent({ scannedAtMs: 0, receivedAtMs: 25 * H })).toEqual({ delayedSync: false, clockSkew: true, effectiveAtMs: 25 * H });
    expect(classifyEvent({ scannedAtMs: 4 * M, receivedAtMs: 0 })).toMatchObject({ clockSkew: false });
  });
});
