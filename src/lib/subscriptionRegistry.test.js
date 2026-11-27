import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSubscriptionRegistry, LINGER_MS } from './subscriptionRegistry.js';

// A fake listener source: counts starts and stops and lets a test publish.
function source() {
  const s = { starts: 0, stops: 0, publish: null };
  s.start = (publish) => {
    s.starts += 1;
    s.publish = publish;
    publish({ data: [], loading: true, error: null });
    return () => { s.stops += 1; };
  };
  return s;
}
const ready = (data) => ({ data, loading: false, error: null });

describe('subscription registry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lingers five minutes by default', () => {
    expect(LINGER_MS).toBe(5 * 60 * 1000);
  });

  it('shares one listener between consumers of a key', () => {
    const registry = createSubscriptionRegistry();
    const src = source();
    const a = registry.acquire('students|all', src.start);
    const b = registry.acquire('students|all', src.start);
    const seen = [];
    b.listen((state) => seen.push(state));
    src.publish(ready(['x']));
    expect(src.starts).toBe(1);
    expect(a.current()).toEqual(ready(['x']));
    expect(seen).toEqual([ready(['x'])]);
  });

  it('hands a late consumer the current rows at once', () => {
    const registry = createSubscriptionRegistry();
    const src = source();
    registry.acquire('k', src.start);
    src.publish(ready(['x']));
    expect(registry.peek('k')).toEqual(ready(['x']));
    expect(registry.acquire('k', src.start).current()).toEqual(ready(['x']));
    expect(registry.peek('other')).toBeNull();
  });

  it('stops the listener only after the linger period', () => {
    const registry = createSubscriptionRegistry({ lingerMs: 1000 });
    const src = source();
    registry.acquire('k', src.start).release();
    vi.advanceTimersByTime(999);
    expect(src.stops).toBe(0);
    vi.advanceTimersByTime(1);
    expect(src.stops).toBe(1);
    expect(registry.peek('k')).toBeNull();
  });

  it('reuses a lingering listener and cancels its stop', () => {
    const registry = createSubscriptionRegistry({ lingerMs: 1000 });
    const src = source();
    registry.acquire('k', src.start).release();
    vi.advanceTimersByTime(500);
    registry.acquire('k', src.start);
    vi.advanceTimersByTime(5000);
    expect(src.starts).toBe(1);
    expect(src.stops).toBe(0);
  });

  it('counts a double release once', () => {
    const registry = createSubscriptionRegistry({ lingerMs: 1000 });
    const src = source();
    const a = registry.acquire('k', src.start);
    registry.acquire('k', src.start);
    a.release(); a.release();
    vi.advanceTimersByTime(5000);
    expect(src.stops).toBe(0);
  });

  it('stops notifying a consumer after unlisten', () => {
    const registry = createSubscriptionRegistry();
    const src = source();
    const seen = [];
    const unlisten = registry.acquire('k', src.start).listen((state) => seen.push(state));
    unlisten();
    src.publish(ready(['x']));
    expect(seen).toEqual([]);
  });

  it('sends an error to every consumer and retries on the next acquire', () => {
    const registry = createSubscriptionRegistry();
    const src = source();
    const seen = [];
    registry.acquire('k', src.start).listen((state) => seen.push(state));
    const error = new Error('offline');
    src.publish({ data: [], loading: false, error });
    expect(seen.at(-1).error).toBe(error);
    registry.acquire('k', src.start);
    expect(src.starts).toBe(2);
    expect(src.stops).toBe(1);
    expect(seen.at(-1)).toEqual({ data: [], loading: true, error: null });
  });

  it('restart keeps consumers and starts a fresh listener', () => {
    const registry = createSubscriptionRegistry();
    const src = source();
    const seen = [];
    registry.acquire('k', src.start).listen((state) => seen.push(state));
    registry.restart('k');
    src.publish(ready(['fresh']));
    expect(src.starts).toBe(2);
    expect(src.stops).toBe(1);
    expect(seen.at(-1)).toEqual(ready(['fresh']));
  });

  it('starts a fresh listener when a key is acquired after its linger drop', () => {
    const registry = createSubscriptionRegistry({ lingerMs: 1000 });
    const src = source();
    registry.acquire('k', src.start).release();
    vi.advanceTimersByTime(1000);
    registry.acquire('k', src.start);
    expect(src.starts).toBe(2);
    expect(src.stops).toBe(1);
  });

  it('does not let a handle from before clear stop a newer listener', () => {
    const registry = createSubscriptionRegistry({ lingerMs: 1000 });
    const oldSrc = source(); const newSrc = source();
    const old = registry.acquire('k', oldSrc.start);
    registry.clear();
    registry.acquire('k', newSrc.start);
    old.release();
    vi.advanceTimersByTime(5000);
    expect(oldSrc.stops).toBe(1);
    expect(newSrc.stops).toBe(0);
    expect(registry.peek('k')).not.toBeNull();
  });

  it('restarts a key with its own start, never another key\'s', () => {
    const registry = createSubscriptionRegistry();
    const a = source(); const b = source();
    registry.acquire('k1', a.start);
    registry.acquire('k2', b.start);
    a.publish({ data: [], loading: false, error: new Error('offline') });
    registry.restart('k1');
    expect(a.starts).toBe(2);
    a.publish({ data: [], loading: false, error: new Error('offline again') });
    registry.acquire('k1', b.start); // acquiring an errored key restarts it with its own start
    expect(a.starts).toBe(3);
    expect(b.starts).toBe(1);
  });

  it('ignores a restart of an unknown key', () => {
    const registry = createSubscriptionRegistry();
    expect(() => registry.restart('missing')).not.toThrow();
  });

  it('keeps keys independent and clear stops them all', () => {
    const registry = createSubscriptionRegistry();
    const one = source(); const two = source();
    registry.acquire('one', one.start);
    registry.acquire('two', two.start);
    one.publish(ready([1]));
    expect(registry.peek('two')).toEqual({ data: [], loading: true, error: null });
    registry.clear();
    expect([one.stops, two.stops]).toEqual([1, 1]);
    expect(registry.peek('one')).toBeNull();
  });
});
