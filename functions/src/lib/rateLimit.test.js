import { describe, it, expect } from 'vitest';
import { takeToken } from './rateLimit.js';
const W = 3600_000;
describe('takeToken', () => {
  it('starts a window on first use', () => {
    expect(takeToken(null, { nowMs: 1000, windowMs: W, max: 5 })).toEqual({ allowed: true, next: { count: 1, windowStartMs: 1000 } });
  });
  it('counts within the window and refuses at max', () => {
    let s = { count: 4, windowStartMs: 0 };
    const r = takeToken(s, { nowMs: 10, windowMs: W, max: 5 });
    expect(r.allowed).toBe(true); expect(r.next.count).toBe(5);
    expect(takeToken(r.next, { nowMs: 20, windowMs: W, max: 5 })).toEqual({ allowed: false, next: r.next });
  });
  it('resets after the window', () => {
    expect(takeToken({ count: 5, windowStartMs: 0 }, { nowMs: W, windowMs: W, max: 5 })).toEqual({ allowed: true, next: { count: 1, windowStartMs: W } });
  });
});
