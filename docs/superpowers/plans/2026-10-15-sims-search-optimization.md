# SIMS Search Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SIMS pages open faster and search boxes respond instantly by sharing roster listeners across pages, caching in every tab, indexing learner names once, and drawing fewer rows.

**Architecture:** A pure subscription registry shares one Firestore listener per key across pages and keeps it for 5 minutes after the last page leaves; the hooks in `src/hooks/useCollection.js` read it through `useSyncExternalStore`. A pure learner index in `src/lib/search.js` normalizes names once per data change; pages search it with `useDeferredValue`. Firestore uses the multi-tab persistent cache, which a single `endSession()` helper clears on every sign-out.

**Tech Stack:** React 19, Firebase JS SDK 12 (Firestore), Vite 8, Vitest 4 (node environment, `src/**/*.test.js` only — no React component tests).

**Spec:** `docs/superpowers/specs/2026-10-15-search-optimization-design.md`

## Global Constraints

- Matching is word-start everywhere: every query word must be a prefix of a first-name or last-name word, in any order, case- and accent-insensitive; with `includeLrn`, the space-stripped query may instead be a prefix of the LRN.
- Linger period after the last consumer releases a shared listener: **5 minutes** (`LINGER_MS = 5 * 60 * 1000`).
- Students table page size: **100**; button text "Show 100 more"; count line "Showing {n} of {total} learners".
- Sign-out notice storage key: `sims.signOutNotice` in `sessionStorage`.
- Do not change `firestore.rules`, the query shapes in `src/lib/staffQueries.js`, or anything under `functions/`.
- Every new module and comment follows the repo style: short "why" comments, 2-space indent, single quotes, semicolons.
- Merging this branch does **not** release to production. Production SIMS is built from the temporary-password release tree (see Task 8).

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/lib/search.js` | modify | add `buildLearnerIndex`, `searchLearners` |
| `src/lib/search.test.js` | modify | tests for the index |
| `src/lib/subscriptionRegistry.js` | create | pure shared-listener registry |
| `src/lib/subscriptionRegistry.test.js` | create | registry tests |
| `src/hooks/useCollection.js` | modify | shared hooks, `useSchoolYearEnrollments` |
| `src/lib/session.js` | create | pure `signOutAndClear`, `takeSignOutNotice` |
| `src/lib/session.test.js` | create | session tests |
| `src/session.js` | create | `endSession()` wired to real Firebase |
| `src/firebase.js` | modify | multi-tab persistent cache |
| `src/App.jsx`, `src/components/ChangePassword.jsx` | modify | every sign-out goes through `endSession` |
| `src/pages/StudentsPage.jsx` | modify | index search, deferred query, paging, empty state |
| `src/pages/guardians/LinksTab.jsx` | modify | index search, deferred, year enrollments |
| `src/pages/guardians/ReportsTab.jsx`, `RequestsTab.jsx`, `ScanLogTab.jsx` | modify | deferred query, year enrollments |
| `src/pages/IDCardsPage.jsx`, `src/pages/idCards/SavedBatchTab.jsx` | modify | year enrollments; index search |
| `tests/browser/registrar-fixture.js` | modify | add `useSchoolYearEnrollments` stub |

---

### Task 1: Learner search index

**Files:**
- Modify: `src/lib/search.js`
- Test: `src/lib/search.test.js`

**Interfaces:**
- Produces:
  - `buildLearnerIndex(items: T[], toLearner?: (item: T) => {firstName?, lastName?, lrn?}) => Array<{ item: T, words: string[], lrn: string }>` — keeps the caller's order.
  - `searchLearners(index, query: string, { includeLrn?: boolean, accept?: (item: T) => boolean, limit?: number }) => T[]` — results in index order; empty query returns every accepted item up to `limit`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/search.test.js` (and add `buildLearnerIndex, searchLearners` to the existing import from `./search.js`):

```js
describe('buildLearnerIndex and searchLearners', () => {
  const ana = { id: 'a', firstName: 'Ana', lastName: 'Santos', lrn: '100000000001' };
  const jose = { id: 'j', firstName: 'José', lastName: 'Nuñez', lrn: '100000000002' };
  const juan = { id: 'u', firstName: 'Juan', lastName: 'Dela Cruz', lrn: '200000000003' };
  const santana = { id: 's', firstName: 'Liza', lastName: 'Santana', lrn: '300000000004' };
  const index = buildLearnerIndex([ana, jose, juan, santana]);

  it('keeps the order it was given', () => {
    expect(index.map((entry) => entry.item.id)).toEqual(['a', 'j', 'u', 's']);
    expect(searchLearners(index, '')).toEqual([ana, jose, juan, santana]);
  });

  it('matches word starts in any order, not mid-word', () => {
    expect(searchLearners(index, 'cruz juan')).toEqual([juan]);
    expect(searchLearners(index, 'san')).toEqual([ana, santana]);
    expect(searchLearners(index, 'ana')).toEqual([ana]);
  });

  it('ignores case and accents', () => {
    expect(searchLearners(index, 'NUNEZ jose')).toEqual([jose]);
  });

  it('matches an LRN prefix only with includeLrn', () => {
    expect(searchLearners(index, '1000')).toEqual([]);
    expect(searchLearners(index, '1000 0000', { includeLrn: true })).toEqual([ana, jose]);
  });

  it('applies accept and stops at limit without visiting the rest', () => {
    const seen = [];
    const accept = (learner) => { seen.push(learner.id); return learner.id !== 'a'; };
    expect(searchLearners(index, '', { accept, limit: 1 })).toEqual([jose]);
    expect(seen).toEqual(['a', 'j']);
  });

  it('indexes wrapped items through toLearner', () => {
    const entries = [{ student: juan, section: 'x' }, { student: ana, section: 'y' }];
    const wrapped = buildLearnerIndex(entries, (entry) => entry.student);
    expect(searchLearners(wrapped, 'ana')).toEqual([entries[1]]);
  });

  it('agrees with learnerMatches on every learner', () => {
    for (const q of ['', 'a', 'san', 'cruz ju', 'nuñ', '2000', 'zzz']) {
      for (const includeLrn of [false, true]) {
        const expected = [ana, jose, juan, santana].filter((l) => learnerMatches(q, l, { includeLrn }));
        expect(searchLearners(index, q, { includeLrn })).toEqual(expected);
      }
    }
  });

  it('survives missing fields', () => {
    const blank = buildLearnerIndex([{}, null]);
    expect(searchLearners(blank, '')).toHaveLength(2);
    expect(searchLearners(blank, 'a', { includeLrn: true })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/lib/search.test.js`
Expected: FAIL — `buildLearnerIndex is not a function`.

- [ ] **Step 3: Implement**

Add to the end of `src/lib/search.js`:

```js
// Normalizes each learner once so typing only compares prepared words.
// Keeps the caller's order (e.g. depedSort output or the ID card print order).
export function buildLearnerIndex(items, toLearner = (item) => item) {
  return items.map((item) => {
    const learner = toLearner(item) || {};
    return {
      item,
      words: [learner.firstName, learner.lastName].filter((field) => typeof field === 'string').flatMap(words),
      lrn: normalize(learner.lrn),
    };
  });
}

// Same matching rules as learnerMatches, against a prebuilt index. Results
// stay in index order, so callers never sort per keystroke.
export function searchLearners(index, query, { includeLrn = false, accept, limit = Infinity } = {}) {
  const queryWords = words(query);
  const compactQuery = normalize(query).replace(/\s+/g, '');
  const results = [];
  for (const entry of index) {
    if (results.length >= limit) break;
    const nameHit = queryWords.every((queryWord) => entry.words.some((word) => word.startsWith(queryWord)));
    const hit = nameHit || (includeLrn && entry.lrn.startsWith(compactQuery));
    if (hit && (!accept || accept(entry.item))) results.push(entry.item);
  }
  return results;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/lib/search.test.js`
Expected: PASS (all old and new cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/search.js src/lib/search.test.js
git commit -m "Add a prebuilt learner search index"
```

---

### Task 2: Shared subscription registry and hooks

**Files:**
- Create: `src/lib/subscriptionRegistry.js`
- Test: `src/lib/subscriptionRegistry.test.js`
- Modify: `src/hooks/useCollection.js`
- Modify: `tests/browser/registrar-fixture.js`

**Interfaces:**
- Consumes: `startResourceSubscription(subscribe, publish, emptyValue)` from `src/lib/resourceSubscription.js` (unchanged; returns a stop function and publishes `{ data, loading, error }`).
- Produces:
  - `createSubscriptionRegistry({ lingerMs? }) => { acquire(key, start) => { current(), listen(fn) => unlisten, release() }, peek(key) => state|null, restart(key), clear() }` where `start(publish) => stop`.
  - `LINGER_MS = 300000`.
  - In `useCollection.js`: `useCollectionResource(path)` (now shared, key `${path}|all`), `useSharedQueryResource(key, buildQuery)`, `useSchoolYearEnrollments(schoolYear)` (key `enrollments|sy=<schoolYear>`), `useStaffCollectionResource` (now shared). `useDocResource`, `useQueryResource`, `useCollection`, `useDoc`, `useQueryRows` unchanged.

- [ ] **Step 1: Write the failing registry tests**

Create `src/lib/subscriptionRegistry.test.js`:

```js
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/subscriptionRegistry.test.js`
Expected: FAIL — cannot resolve `./subscriptionRegistry.js`.

- [ ] **Step 3: Implement the registry**

Create `src/lib/subscriptionRegistry.js`:

```js
// Shares one live listener per key across every page that needs it, and
// keeps it a while after the last page leaves so going back is instant.
export const LINGER_MS = 5 * 60 * 1000;

export function createSubscriptionRegistry({ lingerMs = LINGER_MS } = {}) {
  const entries = new Map();

  function run(entry) {
    entry.stop = entry.start((state) => {
      entry.state = state;
      for (const listener of [...entry.listeners]) listener(state);
    }) || (() => {});
  }

  function drop(key) {
    const entry = entries.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    entries.delete(key);
    entry.stop();
  }

  function restart(key) {
    const entry = entries.get(key);
    if (!entry) return;
    entry.stop();
    run(entry);
  }

  function acquire(key, start) {
    let entry = entries.get(key);
    if (!entry) {
      entry = { start, state: null, listeners: new Set(), users: 0, timer: null, stop: () => {} };
      entries.set(key, entry);
      run(entry);
    } else if (entry.state?.error) {
      // A failed listener gets a fresh attempt instead of serving the error forever.
      restart(key);
    }
    clearTimeout(entry.timer);
    entry.timer = null;
    entry.users += 1;
    let released = false;
    return {
      current: () => entry.state,
      listen(listener) {
        entry.listeners.add(listener);
        return () => { entry.listeners.delete(listener); };
      },
      release() {
        if (released) return;
        released = true;
        entry.users -= 1;
        if (entry.users === 0) entry.timer = setTimeout(() => drop(key), lingerMs);
      },
    };
  }

  return {
    acquire,
    peek: (key) => entries.get(key)?.state ?? null,
    restart,
    clear: () => [...entries.keys()].forEach(drop),
  };
}
```

- [ ] **Step 4: Run the registry tests to see them pass**

Run: `npx vitest run src/lib/subscriptionRegistry.test.js`
Expected: PASS (10 tests).

- [ ] **Step 5: Wire the hooks**

Replace the whole of `src/hooks/useCollection.js` with:

```js
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';
import { startResourceSubscription } from '../lib/resourceSubscription.js';
import { createSubscriptionRegistry } from '../lib/subscriptionRegistry.js';
import { staffCollectionQuery } from '../lib/staffQueries.js';
const EMPTY = [];
const rows = snapshot => snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
// One listener per key for the whole app; pages that ask for the same rows share it.
const shared = createSubscriptionRegistry();
function useResource(subscribe, deps, emptyValue) {
  const [attempt, setAttempt] = useState(0);
  // The token identifies the subscription, including the first render before effect cleanup.
  const token = useMemo(() => ({ subscribe }), [...deps, attempt]);
  const [state, setState] = useState(() => ({ token: null, data: emptyValue, loading: true, error: null }));
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => startResourceSubscription(token.subscribe, value => setState({ token, ...value }), emptyValue), [token, emptyValue]);
  return { ...(state.token === token ? state : { data: emptyValue, loading: true, error: null }), retry };
}
// The key must name everything the listener depends on: same key, same rows.
function useSharedResource(key, subscribe, emptyValue) {
  const subscribeRef = useRef(subscribe);
  subscribeRef.current = subscribe;
  const listen = useCallback(onChange => {
    const handle = shared.acquire(key, publish =>
      startResourceSubscription((next, fail) => subscribeRef.current(next, fail), publish, emptyValue));
    const unlisten = handle.listen(onChange);
    onChange(); // the listener may have published between render and this subscribe
    return () => { unlisten(); handle.release(); };
  }, [key, emptyValue]);
  const state = useSyncExternalStore(listen, () => shared.peek(key));
  const retry = useCallback(() => shared.restart(key), [key]);
  return { ...(state ?? { data: emptyValue, loading: true, error: null }), retry };
}
export function useCollectionResource(path) {
  return useSharedResource(`${path}|all`, (next, fail) => onSnapshot(collection(db, path), snapshot => next(rows(snapshot)), fail), EMPTY);
}
export function useDocResource(path) {
  return useResource((next, fail) => {
    if (!path) { next(null); return; }
    return onSnapshot(doc(db, path), snapshot => next(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null), fail);
  }, [path], null);
}
// buildQuery retains its where/orderBy/limit. Null query means no selected filter.
export function useQueryResource(buildQuery, deps) {
  return useResource((next, fail) => {
    const query = buildQuery();
    if (!query) { next(EMPTY); return; }
    return onSnapshot(query, snapshot => next(rows(snapshot)), fail);
  }, deps, EMPTY);
}
export function useSharedQueryResource(key, buildQuery) {
  return useSharedResource(key, (next, fail) => {
    const query = buildQuery();
    if (!query) { next(EMPTY); return; }
    return onSnapshot(query, snapshot => next(rows(snapshot)), fail);
  }, EMPTY);
}
// Only the selected year's enrollments; every past year stays off the wire.
export function useSchoolYearEnrollments(schoolYear) {
  return useSharedQueryResource(`enrollments|sy=${schoolYear || ''}`,
    () => (schoolYear ? query(collection(db, 'enrollments'), where('schoolYear', '==', schoolYear)) : null));
}
export function useStaffCollectionResource(path, { me, schoolYear, sectionId, date } = {}) {
  const key = JSON.stringify(['staff', path, me ? me.role : null, me?.gradeLevel ?? null, schoolYear ?? null, sectionId ?? null, date ?? null]);
  const resource = useSharedQueryResource(key, () => staffCollectionQuery(path, { me, schoolYear, sectionId, date }));
  // A profile that is still loading must never look like a successful empty roster.
  return !me ? { ...resource, data: EMPTY, loading: true, error: null } : resource;
}
export const useCollection = path => useCollectionResource(path).data;
export const useDoc = path => useDocResource(path).data;
export const useQueryRows = (buildQuery, deps) => useQueryResource(buildQuery, deps).data;
```

- [ ] **Step 6: Teach the registrar browser fixture the new hook**

In `tests/browser/registrar-fixture.js`, after the `useQueryResource` export (line 16), add:

```js
export function useSchoolYearEnrollments(schoolYear){const r=useCollectionResource('enrollments');return {...r,data:r.data.filter(e=>e.schoolYear===schoolYear)};}
```

- [ ] **Step 7: Run the full unit suite**

Run: `npm test`
Expected: PASS — all suites, including `staffQueries.test.js` and `resourceSubscription.test.js`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/subscriptionRegistry.js src/lib/subscriptionRegistry.test.js src/hooks/useCollection.js tests/browser/registrar-fixture.js
git commit -m "Share roster listeners across pages"
```

---

### Task 3: Multi-tab cache and clear-on-sign-out

**Files:**
- Create: `src/lib/session.js`
- Test: `src/lib/session.test.js`
- Create: `src/session.js`
- Modify: `src/firebase.js:2,22,29`
- Modify: `src/App.jsx:2,4,87,105,117,128,149`
- Modify: `src/components/ChangePassword.jsx:2-3,36`

**Interfaces:**
- Produces:
  - `src/lib/session.js`: `SIGN_OUT_NOTICE_KEY = 'sims.signOutNotice'`; `signOutAndClear(notice: string, deps: { storage: () => Storage, signOut: () => Promise, terminate: () => Promise, clearCache: () => Promise, reload: () => void }) => Promise<void>`; `takeSignOutNotice(storage: () => Storage) => string`.
  - `src/session.js`: `endSession(notice = '') => Promise<void>`; `takeStoredSignOutNotice() => string`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/session.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { SIGN_OUT_NOTICE_KEY, signOutAndClear, takeSignOutNotice } from './session.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (k) => (values.has(k) ? values.get(k) : null),
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
  };
}
function deps(overrides = {}) {
  const calls = [];
  const storage = memoryStorage();
  return {
    calls, storage,
    deps: {
      storage: () => storage,
      signOut: vi.fn(async () => calls.push('signOut')),
      terminate: vi.fn(async () => calls.push('terminate')),
      clearCache: vi.fn(async () => calls.push('clearCache')),
      reload: vi.fn(() => calls.push('reload')),
      ...overrides,
    },
  };
}

describe('signOutAndClear', () => {
  it('signs out, wipes the cache, then reloads, keeping the notice', async () => {
    const { calls, storage, deps: d } = deps();
    await signOutAndClear('Your session has ended. Please sign in again.', d);
    expect(calls).toEqual(['signOut', 'terminate', 'clearCache', 'reload']);
    expect(storage.getItem(SIGN_OUT_NOTICE_KEY)).toBe('Your session has ended. Please sign in again.');
  });

  it('removes an old notice on a plain logout', async () => {
    const { storage, deps: d } = deps();
    storage.setItem(SIGN_OUT_NOTICE_KEY, 'old');
    await signOutAndClear('', d);
    expect(storage.getItem(SIGN_OUT_NOTICE_KEY)).toBeNull();
  });

  it('still reloads when another tab holds the cache', async () => {
    const { calls, deps: d } = deps({ clearCache: vi.fn(async () => { throw new Error('in use'); }) });
    await signOutAndClear('', d);
    expect(calls.at(-1)).toBe('reload');
  });

  it('still signs out when storage is blocked', async () => {
    const { calls, deps: d } = deps({ storage: () => { throw new Error('blocked'); } });
    await signOutAndClear('note', d);
    expect(calls).toEqual(['signOut', 'terminate', 'clearCache', 'reload']);
  });

  it('does not reload when sign-out itself fails, so it cannot loop', async () => {
    const { calls, deps: d } = deps({ signOut: vi.fn(async () => { throw new Error('auth'); }) });
    await signOutAndClear('', d);
    expect(calls).toEqual([]);
  });
});

describe('takeSignOutNotice', () => {
  it('returns the stored notice once', () => {
    const storage = memoryStorage();
    storage.setItem(SIGN_OUT_NOTICE_KEY, 'Bye');
    expect(takeSignOutNotice(() => storage)).toBe('Bye');
    expect(takeSignOutNotice(() => storage)).toBe('');
  });

  it('returns an empty notice when storage is blocked', () => {
    expect(takeSignOutNotice(() => { throw new Error('blocked'); })).toBe('');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/session.test.js`
Expected: FAIL — cannot resolve `./session.js`.

- [ ] **Step 3: Implement the pure helpers**

Create `src/lib/session.js`:

```js
export const SIGN_OUT_NOTICE_KEY = 'sims.signOutNotice';

// Ends the session and wipes this device's cached Firestore data, then
// reloads so the next sign-in starts clean. The notice survives the reload
// so a forced sign-out still explains itself on the login screen.
export async function signOutAndClear(notice, { storage, signOut, terminate, clearCache, reload }) {
  try {
    if (notice) storage().setItem(SIGN_OUT_NOTICE_KEY, notice);
    else storage().removeItem(SIGN_OUT_NOTICE_KEY);
  } catch { /* the sign-out still happens without storage */ }
  // Still signed in: reloading would sign out again on start and loop.
  try { await signOut(); } catch { return; }
  try {
    await terminate();
    await clearCache();
  } catch { /* another open SIMS tab still holds the cache; it clears on that tab's sign-out */ }
  reload();
}

export function takeSignOutNotice(storage) {
  try {
    const notice = storage().getItem(SIGN_OUT_NOTICE_KEY) || '';
    storage().removeItem(SIGN_OUT_NOTICE_KEY);
    return notice;
  } catch {
    return '';
  }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/lib/session.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Wire it to Firebase**

Create `src/session.js` (separate from `firebase.js` so browser fixtures that stub `firebase.js` keep working):

```js
import { signOut } from 'firebase/auth';
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { signOutAndClear, takeSignOutNotice } from './lib/session.js';

const storage = () => window.sessionStorage;

export const endSession = (notice = '') => signOutAndClear(notice, {
  storage,
  signOut: () => signOut(auth),
  terminate: () => terminate(db),
  clearCache: () => clearIndexedDbPersistence(db),
  reload: () => window.location.reload(),
});

export const takeStoredSignOutNotice = () => takeSignOutNotice(storage);
```

In `src/firebase.js`:
- line 2 becomes `import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from 'firebase/firestore';`
- line 22 becomes:

```js
// Every open tab shares one on-disk cache; endSession() wipes it at sign-out.
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
```

- delete the last line `enableIndexedDbPersistence(db).catch(() => {});`

- [ ] **Step 6: Route every sign-out through endSession**

In `src/App.jsx`:
- line 2: `import { onIdTokenChanged } from 'firebase/auth';`
- after line 4 add: `import { endSession, takeStoredSignOutNotice } from './session.js';`
- after the last `lazy(...)` page import (line 29) add, at module scope so StrictMode's double-called state initializers cannot consume it twice:

```js
// Read once per page load: a forced sign-out leaves its notice here before reloading.
const startupNotice = takeStoredSignOutNotice();
```

- line 87: `const [notice, setNotice] = useState(startupNotice);`
- line 105: `if (current === generation) { setNotice('Your session has ended. Please sign in again.'); endSession('Your session has ended. Please sign in again.'); }`
- line 118: replace `signOut(auth);` with `endSession('Your session has ended. Please sign in again.');`
- line 128: `const refuse = (message) => { setNotice(message); setMe(null); endSession(message); };`
- line 149: `const logout = () => { setNotice(''); setPasswordChangePending(false); endSession(); };`

Then confirm nothing else signs out directly:

Run: `git grep -n "signOut(auth)" -- src`
Expected: only `src/components/ChangePassword.jsx:36`.

In `src/components/ChangePassword.jsx`:
- line 2: `import { signInWithEmailAndPassword } from 'firebase/auth';`
- after line 3 add: `import { endSession } from '../session.js';`
- line 36: `catch { await endSession(); }`

Run: `git grep -n "signOut(auth)\|enableIndexedDbPersistence" -- src`
Expected: no output.

- [ ] **Step 7: Run the unit suite and a build**

Run: `npm test`
Expected: PASS.

Run (Bash; dummy config only proves the bundle compiles):
`VITE_FIREBASE_API_KEY=x VITE_FIREBASE_AUTH_DOMAIN=x VITE_FIREBASE_PROJECT_ID=x VITE_FIREBASE_STORAGE_BUCKET=x VITE_FIREBASE_MESSAGING_SENDER_ID=x VITE_FIREBASE_APP_ID=x npx vite build --outDir "$TMPDIR/sims-build-check"`
Expected: `✓ built in …` with no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/session.js src/lib/session.test.js src/session.js src/firebase.js src/App.jsx src/components/ChangePassword.jsx
git commit -m "Cache Firestore in every tab and clear it at sign-out"
```

---

### Task 4: Students page — indexed search, deferred typing, paging

**Files:**
- Modify: `src/pages/StudentsPage.jsx:2,4,40-51,88,94,114`

**Interfaces:**
- Consumes: `buildLearnerIndex`, `searchLearners` (Task 1); `depedSort` from `src/lib/roster.js`.

- [ ] **Step 1: Imports and state**

- line 2: `import { useDeferredValue, useMemo, useState } from 'react';`
- after line 4 add: `import { buildLearnerIndex, searchLearners } from '../lib/search.js';`
- above `export default function StudentsPage` add: `const PAGE_SIZE = 100;`

- [ ] **Step 2: Replace the `rows` memo (lines 40–51)**

```js
  // Names are normalized once per roster change; typing only walks the index.
  const learnerIndex = useMemo(() => buildLearnerIndex(depedSort(students)), [students]);
  const searchQuery = useDeferredValue(q);
  const rows = useMemo(() => searchLearners(learnerIndex, searchQuery, { includeLrn: true, accept: (s) => {
    const en = enrollmentByStudent.get(s.id);
    if (status === UNASSIGNED) { if (en) return false; }
    else if (status && s.status !== status) return false;
    if (gradeFilter === UNASSIGNED || sectionFilter === UNASSIGNED) return !en;
    if (gradeFilter && (!en || String(en.gradeLevel) !== gradeFilter)) return false;
    if (sectionFilter && (!en || en.sectionId !== sectionFilter)) return false;
    return true;
  } }), [learnerIndex, searchQuery, status, gradeFilter, sectionFilter, enrollmentByStudent]);
  // Drawing thousands of rows is what made typing lag; show a page at a time.
  const filterKey = [searchQuery, status, gradeFilter, sectionFilter].join('|');
  const [paging, setPaging] = useState({ key: filterKey, shown: PAGE_SIZE });
  const shown = paging.key === filterKey ? paging.shown : PAGE_SIZE;
  const visibleRows = rows.slice(0, shown);
  const filtering = Boolean(q.trim() || status || gradeFilter || sectionFilter);
```

- [ ] **Step 3: Empty state, table rows, count line and button**

Replace line 88's empty-state opening

```jsx
        {rows.length === 0 ? <EmptyState title="No learners yet" hint={admin ? 'Add your first learner with the button above.' : 'No learners are enrolled in your grade levels this school year.'} /> : (
```

with

```jsx
        {rows.length === 0 ? (filtering
          ? <EmptyState title={q.trim() ? `No learners match “${q.trim()}”` : 'No learners match these filters'} hint="Try another name, LRN or filter." />
          : <EmptyState title="No learners yet" hint={admin ? 'Add your first learner with the button above.' : 'No learners are enrolled in your grade levels this school year.'} />) : (
```

Change line 94 `<tbody>{rows.map((s) => {` to `<tbody>{visibleRows.map((s) => {`.

Directly after the closing `</table></div>` of the table (line 114, inside the `overflowX` wrapper, before its closing `</div>`), add:

```jsx
            {rows.length > PAGE_SIZE && <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              <span aria-live="polite" style={{ fontSize: 13, color: T.inkMuted }}>Showing {visibleRows.length.toLocaleString()} of {rows.length.toLocaleString()} learners</span>
              {shown < rows.length && <Btn variant="ghost" onClick={() => setPaging({ key: filterKey, shown: shown + PAGE_SIZE })}>Show 100 more</Btn>}
            </div>}
```

- [ ] **Step 4: Check it**

Run: `npm test`
Expected: PASS.

Run the Task 3 build command again.
Expected: builds.

Manual (emulator, signed in as an admin): Students page — typing "san" no longer shows "Santana"-only mid-word hits; typing an LRN prefix finds the learner; with more than 100 learners the count line and "Show 100 more" appear; changing a filter resets to 100; a search with no hits shows "No learners match “…”".

- [ ] **Step 5: Commit**

```bash
git add src/pages/StudentsPage.jsx
git commit -m "Students page: indexed word-start search, 100 rows at a time"
```

---

### Task 5: Guardians tabs and ID Cards — current-year enrollments, indexed search, deferred typing

**Files:**
- Modify: `src/pages/guardians/LinksTab.jsx:5,8,12,42,56-62,111`
- Modify: `src/pages/guardians/ReportsTab.jsx:4,7,26,40-46`
- Modify: `src/pages/guardians/RequestsTab.jsx:4,7,35,48-55`
- Modify: `src/pages/guardians/ScanLogTab.jsx:2,5,23,38-44`
- Modify: `src/pages/IDCardsPage.jsx:2,18`
- Modify: `src/pages/idCards/SavedBatchTab.jsx:1,9,31-33,67-68`

**Interfaces:**
- Consumes: `useSchoolYearEnrollments(schoolYear)` (Task 2); `buildLearnerIndex`, `searchLearners` (Task 1).

Reports, Requests and Scan Log filter at most 50/50/500 loaded rows, so they keep `learnerMatches` (no index needed) and only gain deferred typing and the narrower enrollments.

- [ ] **Step 1: LinksTab**

- line 5: `import { useDeferredValue, useMemo, useRef, useState } from 'react';`
- line 8: `import { useCollectionResource, useQueryResource, useDoc, useSchoolYearEnrollments } from '../../hooks/useCollection.js';`
- line 12: `import { buildLearnerIndex, searchLearners } from '../../lib/search.js';`
- line 42: `const enrollmentsResource = useSchoolYearEnrollments(schoolYear);`
- replace lines 56–62 (`allMatches` and `matches`) with:

```js
  const learnerIndex = useMemo(() => buildLearnerIndex(depedSort(students)), [students]);
  const searchQuery = useDeferredValue(q);
  // One extra hit tells us there are more than 20 without counting them all.
  const found = useMemo(() => searchQuery.trim() ? searchLearners(learnerIndex, searchQuery, { includeLrn: true, limit: 21, accept: (candidate) => {
    const enrollment = enrollmentByStudent.get(candidate.id);
    return gradeFilter === '' ||
      (gradeFilter === UNASSIGNED ? !enrollment : Number(enrollment?.gradeLevel) === Number(gradeFilter));
  } }) : [], [enrollmentByStudent, gradeFilter, learnerIndex, searchQuery]);
  const matches = found.slice(0, 20);
```

- line 111: replace `{allMatches.length > 20 && <div … >Showing 20 of {allMatches.length} — keep typing to narrow down.</div>}` with

```jsx
        {found.length > 20 && <div aria-live="polite" style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted }}>Showing the first 20 — keep typing to narrow down.</div>}
```

- [ ] **Step 2: ReportsTab**

- line 4: `import { useDeferredValue, useMemo, useState } from 'react';`
- line 7: `import { useCollectionResource, useQueryResource, useSchoolYearEnrollments } from '../../hooks/useCollection.js';`
- line 26: `const enrollmentsResource = useSchoolYearEnrollments(schoolYear);`
- before the `filtered` memo add `const searchQuery = useDeferredValue(filterQuery);`; in the memo use `learnerMatches(searchQuery, learner)` and replace `filterQuery` with `searchQuery` in its dependency list.

- [ ] **Step 3: RequestsTab**

- line 4: `import { useDeferredValue, useMemo, useState } from 'react';`
- line 7: `import { useCollectionResource, useQueryResource, useSchoolYearEnrollments } from '../../hooks/useCollection.js';`
- line 35: `const enrollmentsResource = useSchoolYearEnrollments(schoolYear);`
- before `filtered` add `const searchQuery = useDeferredValue(filterQuery);`; the name check becomes `const nameHit = learnerMatches(searchQuery, learner) || matchesWords(searchQuery, request.learnerNameTyped);` and the dependency list uses `searchQuery`.

- [ ] **Step 4: ScanLogTab**

- line 2: `import { useDeferredValue, useMemo, useState } from 'react';`
- line 5: `import { useCollectionResource, useQueryResource, useSchoolYearEnrollments } from '../../hooks/useCollection.js';`
- line 23: `const enrollmentsResource = useSchoolYearEnrollments(schoolYear);`
- before `filtered` add `const searchQuery = useDeferredValue(filterQuery);`; use `learnerMatches(searchQuery, learner)` and `searchQuery` in the dependency list. Leave `filterActive` on `filterQuery`.

- [ ] **Step 5: ID Cards**

`src/pages/IDCardsPage.jsx`:
- line 2: `import { useCollectionResource, useSchoolYearEnrollments } from '../hooks/useCollection.js';`
- line 18: `const enrollmentsResource = useSchoolYearEnrollments(schoolYear);`

`src/pages/idCards/SavedBatchTab.jsx`:
- line 1: `import { useDeferredValue, useMemo, useRef, useState } from 'react';`
- line 9: `import { buildLearnerIndex, searchLearners } from '../../lib/search.js';`
- replace lines 31–33 (`results`) with:

```js
  const searchIndex = useMemo(() => buildLearnerIndex(enrolled, (e) => e.student), [enrolled]);
  const searchQuery = useDeferredValue(query);
  const results = useMemo(() => (searchQuery.trim()
    ? searchLearners(searchIndex, searchQuery, { includeLrn: true, limit: SEARCH_LIMIT, accept: (e) => !batchIds.has(e.student.id) })
    : []), [searchIndex, batchIds, searchQuery]);
```

- lines 67–68: use `searchQuery.trim()` instead of `query.trim()` in the "No other enrolled learner matches" condition and text, so the message never shows for a query whose results have not been computed yet.

- [ ] **Step 6: Confirm no page still loads every year's enrollments outside its own scope**

Run: `git grep -n "useCollectionResource('enrollments')" -- src`
Expected: no output.

- [ ] **Step 7: Tests, build, browser regressions**

Run: `npm test` → PASS.
Run the Task 3 build command → builds.
Run: `npm exec vite -- --config tests/browser/registrar.config.mjs`, open `http://127.0.0.1:5187/tests/browser/registrar-recovery.html`.
Expected: twelve PASS lines (includes the ID card saved batch search). Stop the dev server by its own task/PID only — never kill `node` by name.

- [ ] **Step 8: Commit**

```bash
git add src/pages/guardians/LinksTab.jsx src/pages/guardians/ReportsTab.jsx src/pages/guardians/RequestsTab.jsx src/pages/guardians/ScanLogTab.jsx src/pages/IDCardsPage.jsx src/pages/idCards/SavedBatchTab.jsx
git commit -m "Guardians and ID Cards: current-year enrollments and indexed search"
```

---

### Task 6: Before/after measurement

**Files:** none committed. Scratch script in the session scratchpad.

- [ ] **Step 1: Search micro-measure (no emulator needed)**

Write `bench-search.mjs` in the scratchpad:

```js
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const root = process.argv[2];
const { learnerMatches, buildLearnerIndex, searchLearners } = await import(pathToFileURL(join(root, 'src/lib/search.js')));
const { depedSort } = await import(pathToFileURL(join(root, 'src/lib/roster.js')));
const first = ['Juan', 'Maria', 'José', 'Ana', 'Mark', 'Liza', 'Paolo', 'Grace'];
const last = ['Dela Cruz', 'Santos', 'Reyes', 'Nuñez', 'Bautista', 'Garcia', 'Santana', 'Mendoza'];
const students = Array.from({ length: 3000 }, (_, i) => ({ id: `s${i}`, firstName: first[i % 8], lastName: `${last[(i * 7) % 8]} ${i}`, lrn: String(100000000000 + i), sex: i % 2 ? 'M' : 'F' }));
const time = (label, fn, runs = 200) => { fn(); const t = performance.now(); for (let i = 0; i < runs; i++) fn(); console.log(label, ((performance.now() - t) / runs).toFixed(2), 'ms'); };
const index = buildLearnerIndex(depedSort(students));
for (const q of ['', 'j', 'san', 'juan dela', '1000000012']) {
  time(`old  "${q}"`, () => depedSort(students.filter((s) => learnerMatches(q, s, { includeLrn: true }))));
  time(`new  "${q}"`, () => searchLearners(index, q, { includeLrn: true }));
  time(`new20"${q}"`, () => searchLearners(index, q, { includeLrn: true, limit: 21 }));
}
time('index build', () => buildLearnerIndex(depedSort(students)), 20);
```

Run (Bash): `node "<scratchpad>/bench-search.mjs" "<worktree path>"`
Record the per-keystroke times for the PR.

- [ ] **Step 2: Page measurements (emulator, manual)**

With `npm run emulators` and `npm run dev` (emulator env), signed in as the emulator admin, use DevTools → Performance:
1. Students page open from Dashboard: before (on `master`) vs after.
2. Navigate Students → Guardians → Links → back to Students: after should show rows immediately on return.
3. Type "san" quickly into Students and Links search: record the longest task during typing.
Record the numbers in the PR description. Stop servers by their own task/PID only.

---

### Task 7: Final verification and PR

- [ ] **Step 1:** `npm test` → PASS.
- [ ] **Step 2:** `npm run test:rules` → PASS (rules unchanged; guard only).
- [ ] **Step 3:** Build command from Task 3 → builds; registrar browser regression → twelve PASS lines.
- [ ] **Step 4:** `git grep -n "enableIndexedDbPersistence\|signOut(auth)" -- src` → no output.
- [ ] **Step 5:** Push the branch and open a PR to `master` with the Task 6 numbers. State in the PR that merging does not release to production.

---

### Task 8: Production release (separate — needs the user's explicit go-ahead in the deploying session)

Production SIMS is built from the temporary-password release tree (base `26a6ed7` plus the patches listed in the deployment records under `docs/audits/deployments/`), not from `master`. Do this only when the user asks.

- [ ] **Step 1:** Recreate the release tree the way the latest record (`docs/audits/deployments/2026-10-15-pm-session-sims/`) did and confirm its build byte-matches https://bnhs-sims.web.app.
- [ ] **Step 2:** Port onto the tree: `src/lib/search.js` (+test), `src/lib/session.js`, `src/session.js`, the `src/firebase.js` cache change, the `App.jsx`/`ChangePassword.jsx` sign-out changes, `StudentsPage.jsx`, the Guardians tabs and ID Cards. These port directly or with small context fixes.
- [ ] **Step 3:** Port the registry into the tree's own `useCollection.js` by hand: the tree predates coordinator scoping, so its `useStaffCollectionResource` (if present) differs — keep the tree's query shapes and only switch listeners to `useSharedResource` with keys that name every dependency.
- [ ] **Step 4:** Build, diff against the live build to confirm only the intended files changed, write the deployment record, and deploy with `node scripts/deployTemporaryPasswordRelease.mjs hosting` after the user approves.
