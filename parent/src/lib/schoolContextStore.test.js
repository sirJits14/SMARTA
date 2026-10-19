import { describe, expect, it } from 'vitest';
import { createSchoolContextStore } from './schoolContextStore.js';

const memory = () => {
  const map = new Map();
  return { map, getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
};
const access = { assignments: [{ role: 'adviser', sectionId: 'A' }] };

describe('school context store', () => {
  it('paints the saved answer for the same account on a fresh open', async () => {
    const storage = memory();
    await createSchoolContextStore({ fetch: async () => access, storage }).refresh('u1');
    const reopened = createSchoolContextStore({ fetch: async () => access, storage });
    expect(reopened.get('u1').data).toEqual(access);
    expect(reopened.get('u2').data).toBe(null);
  });

  it('keeps the last answer while asking again, so screens never blank', async () => {
    let answer = access;
    const store = createSchoolContextStore({ fetch: async () => answer, storage: memory() });
    await store.refresh('u1');
    answer = { assignments: [] };
    const pending = store.refresh('u1');
    expect(store.get('u1')).toMatchObject({ data: access, loading: true });
    await pending;
    expect(store.get('u1')).toMatchObject({ data: { assignments: [] }, loading: false });
  });

  it('shares one request between screens and skips one answered moments ago', async () => {
    let calls = 0, now = 1000;
    const store = createSchoolContextStore({ fetch: async () => { calls += 1; return access; }, storage: memory(), now: () => now });
    await Promise.all([store.refresh('u1'), store.refresh('u1'), store.refresh('u1')]);
    expect(calls).toBe(1);
    now += 10000;
    await store.refresh('u1', { maxAge: 30000 });
    expect(calls).toBe(1);
    await store.refresh('u1');
    expect(calls).toBe(2);
    now += 40000;
    await store.refresh('u1', { maxAge: 30000 });
    expect(calls).toBe(3);
  });

  it('reports loading until the server first answers', async () => {
    const store = createSchoolContextStore({ fetch: async () => access, storage: memory() });
    expect(store.get('u1').loading).toBe(true);
    expect(store.get(null)).toEqual({ data: null, loading: false, error: '' });
    expect(store.get(null)).toBe(store.get(undefined));
  });

  it('keeps the saved answer and reports the error when the check fails', async () => {
    const storage = memory();
    await createSchoolContextStore({ fetch: async () => access, storage }).refresh('u1');
    const store = createSchoolContextStore({ fetch: async () => { throw new Error('offline'); }, storage, describe: e => `failed: ${e.message}` });
    await store.refresh('u1');
    expect(store.get('u1')).toMatchObject({ data: access, loading: false, error: 'failed: offline' });
  });

  it('forgets everything on sign-out, including an answer still on its way', async () => {
    const storage = memory();
    let release;
    const store = createSchoolContextStore({ fetch: () => new Promise((resolve) => { release = resolve; }), storage });
    const pending = store.refresh('u1');
    await Promise.resolve();
    store.forget();
    release(access);
    await pending;
    expect(store.get('u1').data).toBe(null);
    expect(storage.map.size).toBe(0);
  });

  it.each([['older first', true], ['newer first', false]])('a forced refresh wins over one already in flight (%s)', async (_label, olderFirst) => {
    const stale = { assignments: [] };
    const resolvers = [];
    const store = createSchoolContextStore({ fetch: () => new Promise((resolve) => { resolvers.push(resolve); }), storage: memory() });
    const first = store.refresh('u1');
    await Promise.resolve(); await Promise.resolve();
    const second = store.refresh('u1', { force: true });
    await Promise.resolve(); await Promise.resolve();
    expect(resolvers).toHaveLength(2);
    if (olderFirst) { resolvers[0](stale); resolvers[1](access); } else { resolvers[1](access); resolvers[0](stale); }
    await Promise.all([first, second]);
    expect(store.get('u1')).toMatchObject({ data: access, loading: false });
  });

  it('tells subscribers when an answer arrives', async () => {
    const store = createSchoolContextStore({ fetch: async () => access, storage: memory() });
    let seen = 0;
    const off = store.subscribe(() => { seen += 1; });
    await store.refresh('u1');
    off();
    await store.refresh('u1');
    expect(seen).toBe(2);
  });
});
