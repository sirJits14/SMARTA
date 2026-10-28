import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => []);
vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions, name) => (data) => new Promise((resolve, reject) => { calls.push({ name, data, resolve, reject }); }),
}));
vi.mock('../../firebase.js', () => ({ functions: {} }));

import { noticeText, requestLeftList, shouldLoadDecided, waitingState } from './useLearnerRequestLists.js';

describe('requestLeftList', () => {
  const list = [{ id: 'a' }, { id: 'b' }];
  it('says the card is gone only when a fresh list no longer holds the request', () => {
    expect(requestLeftList(list, 'c')).toBe(true);
    expect(requestLeftList([], 'a')).toBe(true);
    expect(requestLeftList(list, 'a')).toBe(false);
  });
  it('keeps the message on the card when the reload failed or was superseded', () => {
    expect(requestLeftList(null, 'a')).toBe(false);
    expect(requestLeftList(undefined, 'a')).toBe(false);
  });
});

describe('shouldLoadDecided', () => {
  const idle = { view: 'decided', decided: null, loading: false, error: '' };
  it('loads the first page only on Decided, with nothing loaded, nothing running and no error', () => {
    expect(shouldLoadDecided(idle)).toBe(true);
    expect(shouldLoadDecided({ ...idle, view: 'waiting' })).toBe(false);
    expect(shouldLoadDecided({ ...idle, decided: { requests: [], nextCursor: null } })).toBe(false); // an empty list is a loaded list
    expect(shouldLoadDecided({ ...idle, loading: true })).toBe(false);
    expect(shouldLoadDecided({ ...idle, error: 'Could not load decided requests.' })).toBe(false);
  });
  it('tries once after a failure only when Refresh clears it, and once more when Decided is opened during a reload', () => {
    const failed = { ...idle, error: 'Could not load decided requests.' };
    expect(shouldLoadDecided(failed)).toBe(false); // stays quiet, so no retry loop on a persistent failure
    expect(shouldLoadDecided({ ...failed, error: '', loading: true })).toBe(false); // Refresh running
    expect(shouldLoadDecided({ ...failed, error: '', loading: false })).toBe(true); // Refresh finished: one attempt
    expect(shouldLoadDecided({ ...idle, loading: true })).toBe(false); // Decided opened while a reload runs
    expect(shouldLoadDecided(idle)).toBe(true); // the reload ended: it loads now
  });
});

describe('noticeText', () => {
  it('uses a string as written and calls a function with what the server answered', () => {
    expect(noticeText('Rejected.', { mode: 'rejected' })).toBe('Rejected.');
    expect(noticeText((result) => `Did ${result.mode}.`, { mode: 'moved' })).toBe('Did moved.');
  });
  it('passes nothing on safely when the server sent no answer', () => {
    expect(noticeText((result) => String(result?.mode), undefined)).toBe('undefined');
  });
});

describe('waitingState', () => {
  it('keeps the requests, whether the year ended and whether the list was cut', () => {
    const requests = [{ id: 'a' }];
    expect(waitingState({ requests, ended: true, truncated: true })).toEqual({ requests, ended: true, truncated: true });
    expect(waitingState({ requests, ended: false, truncated: false })).toEqual({ requests, ended: false, truncated: false });
  });
  it('treats a missing truncated as not cut', () => {
    expect(waitingState({ requests: [], ended: false }).truncated).toBe(false);
  });
});

// The sidebar badge is module state shared by every listener, so each test starts from a fresh module.
describe('learner request badge count', () => {
  let badge;
  const answer = async (index, count) => { calls[index].resolve({ data: { count } }); await Promise.resolve(); };
  beforeEach(async () => {
    calls.length = 0;
    vi.resetModules();
    badge = await import('../../hooks/useLearnerRequestCount.js');
  });

  it('shares one call between concurrent refreshes and tells every listener', async () => {
    const seen = [];
    badge.subscribeLearnerRequestCount((n) => seen.push(['a', n]));
    badge.subscribeLearnerRequestCount((n) => seen.push(['b', n]));
    const first = badge.refreshLearnerRequestCount();
    const second = badge.refreshLearnerRequestCount();
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('getLearnerRequestCountFn');
    await answer(0, 3);
    await Promise.all([first, second]);
    expect(seen).toEqual([['a', 3], ['b', 3]]);
    expect(badge.currentLearnerRequestCount()).toBe(3);
  });

  it('forgets the number when the last listener leaves', async () => {
    const stopA = badge.subscribeLearnerRequestCount(() => {});
    const stopB = badge.subscribeLearnerRequestCount(() => {});
    const done = badge.refreshLearnerRequestCount();
    await answer(0, 4);
    await done;
    stopA();
    expect(badge.currentLearnerRequestCount()).toBe(4); // someone is still watching
    stopB();
    expect(badge.currentLearnerRequestCount()).toBe(0);
  });

  it('makes no call and keeps the count at 0 when nobody is listening', async () => {
    const late = badge.refreshLearnerRequestCount(); // a late call made after sign-out
    expect(calls).toHaveLength(0);
    await late;
    expect(badge.currentLearnerRequestCount()).toBe(0);
    const stop = badge.subscribeLearnerRequestCount(() => {});
    stop(); // everyone left again
    const later = badge.refreshLearnerRequestCount();
    expect(calls).toHaveLength(0);
    await later;
    expect(badge.currentLearnerRequestCount()).toBe(0);
  });

  it('drops an answer for the previous person that arrives after they left, and does not share its call', async () => {
    const stop = badge.subscribeLearnerRequestCount(() => {});
    const late = badge.refreshLearnerRequestCount();
    stop(); // sign-out while the call is still running
    const next = badge.subscribeLearnerRequestCount(() => {});
    const fresh = badge.refreshLearnerRequestCount();
    expect(calls).toHaveLength(2); // a new person gets their own call
    await answer(0, 9); // the previous person's answer
    await late;
    expect(badge.currentLearnerRequestCount()).toBe(0);
    expect(badge.refreshLearnerRequestCount()).toBe(fresh); // the late call's cleanup left the new call in place
    expect(calls).toHaveLength(2);
    await answer(1, 2);
    await fresh;
    expect(badge.currentLearnerRequestCount()).toBe(2);
    next();
  });
});
