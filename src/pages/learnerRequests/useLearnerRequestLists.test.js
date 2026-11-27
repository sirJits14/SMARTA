import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => []);
// Just enough of React's hooks to run useLearnerRequestLists without a DOM: state and refs live in slots that
// survive a new render() of the hook, setters write straight to their slot, and effects never run (so nothing
// loads until a test asks).
const fake = vi.hoisted(() => {
  const slots = [];
  let cursor = 0;
  return {
    reset() { slots.length = 0; cursor = 0; },
    begin() { cursor = 0; },
    useState(initial) {
      const slot = (slots[cursor] ??= { value: typeof initial === 'function' ? initial() : initial });
      cursor += 1;
      return [slot.value, (next) => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
    useRef(initial) { const slot = (slots[cursor] ??= { current: initial }); cursor += 1; return slot; },
    useCallback: (fn) => fn,
    useEffect() {},
  };
});
vi.mock('react', () => ({ useState: fake.useState, useRef: fake.useRef, useCallback: fake.useCallback, useEffect: fake.useEffect }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions, name) => (data) => new Promise((resolve, reject) => { calls.push({ name, data, resolve, reject }); }),
}));
vi.mock('../../firebase.js', () => ({ functions: {} }));

import { useLearnerRequestLists } from './useLearnerRequestLists.js';

const render = () => { fake.begin(); return useLearnerRequestLists(); };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const request = { id: 'r1' };
const empty = { data: { requests: [], ended: false } };

beforeEach(() => { calls.length = 0; fake.reset(); });

describe('pendingId', () => {
  it('names the request being decided until the decision and the reload that follows it have ended', async () => {
    let lists = render();
    expect(lists.pendingId).toBe('');
    const done = lists.decide(request, true, '', () => 'Added.');
    lists = render();
    expect(lists.pending).toBe(true);
    expect(lists.pendingId).toBe('r1');
    calls[0].resolve({ data: { ok: true, mode: 'new' } });
    await flush();
    expect(calls[1].name).toBe('listLearnerRequestsFn');
    expect(render().pendingId).toBe('r1'); // the reload is part of the decision
    calls[1].resolve(empty);
    expect(await done).toBe(true);
    lists = render();
    expect(lists.pending).toBe(false);
    expect(lists.pendingId).toBe('');
  });

  it('is cleared when the server refuses the decision', async () => {
    let lists = render();
    const done = lists.decide(request, false, 'No', () => 'Rejected.');
    expect(render().pendingId).toBe('r1');
    calls[0].reject(Object.assign(new Error('Already decided.'), { code: 'functions/failed-precondition' }));
    await flush();
    calls[1].resolve({ data: { requests: [request], ended: false } });
    expect(await done).toBe(false);
    lists = render();
    expect(lists.pendingId).toBe('');
    expect(lists.pending).toBe(false);
    expect(lists.failures).toEqual({ r1: 'Already decided.' });
  });

  it('is not taken over by a second decision while one is running', async () => {
    const lists = render();
    const first = lists.decide(request, true, '', () => 'Added.');
    expect(await lists.decide({ id: 'r2' }, true, '', () => 'Added.')).toBe(false);
    expect(render().pendingId).toBe('r1');
    expect(calls).toHaveLength(1);
    calls[0].resolve({ data: { ok: true } });
    await flush();
    calls[1].resolve(empty);
    await first;
  });
});

describe('clearNotice', () => {
  const decideOne = async () => {
    const done = render().decide(request, true, '', () => 'Added.');
    calls[calls.length - 1].resolve({ data: { ok: true, mode: 'new' } });
    await flush();
    calls[calls.length - 1].resolve(empty);
    await done;
  };

  it('leaves the notice of a decision standing after the reload that follows it', async () => {
    await decideOne();
    expect(render().notice).toBe('Added.');
  });

  it('is what drops the notice, and the page calls it from Refresh and from changing tab', async () => {
    await decideOne();
    render().clearNotice();
    expect(render().notice).toBe('');
  });

  it('is not done by a reload on its own: refresh keeps the notice', async () => {
    await decideOne();
    const reload = render().refresh();
    calls[calls.length - 1].resolve(empty);
    await reload;
    expect(render().notice).toBe('Added.');
  });

  it('gives way to the next decision, which starts with no notice', async () => {
    await decideOne();
    const done = render().decide({ id: 'r2' }, true, '', () => 'Added again.');
    expect(render().notice).toBe('');
    calls[calls.length - 1].resolve({ data: { ok: true } });
    await flush();
    calls[calls.length - 1].resolve(empty);
    await done;
    expect(render().notice).toBe('Added again.');
  });
});
