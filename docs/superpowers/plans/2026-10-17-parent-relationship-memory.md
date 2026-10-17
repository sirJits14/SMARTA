# Parent app remembers the last relationship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a parent or adviser links a learner in the Parent app, the relationship they picked (Mother, Father, …, Adviser) is preselected the next time they link a learner, instead of going back to "Mother".

**Architecture:** A small `src/lib/lastRelationship.js` module reads and writes the last relationship in `localStorage`, keyed by the account's uid so two accounts on one phone don't share it. `Activate.jsx` starts its picker from the remembered value and saves the choice after a successful link. `RequestAccess.jsx` (the "no slip" form, which also asks for the relationship) does the same, but only accepts guardian relationships, since it has no Adviser option.

**Tech Stack:** React 19 + Vite, vitest (node environment, `src/**/*.test.js`). No Firebase or server changes.

## Global Constraints

- Storage key: `bnhs-parent-last-relationship:<uid>`. Same `bnhs-parent-` prefix as `bnhs-parent-consent`.
- Remember the choice only after the server accepts it (a successful `activateCodeFn` or `requestAccessFn`). A refused Adviser pick on a non-DepEd account must not be remembered.
- A stored value is used only if it is still one of the options on that screen. Otherwise use the screen's current default: `'Mother'` on Activate, `'Guardian'` on Request access.
- Every `localStorage` access is wrapped in `try/catch` (private mode and blocked storage throw). The screens must work exactly as today when storage is unavailable.
- No new strings, no server changes, no change to `functions/` or `firestore.rules`.
- The Parent app's eager bundle stays under the `npm --prefix parent run size` budget.
- Do not deploy anything as part of this plan. Releases follow the existing Parent App flow (`hosting:parent` only).
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Out of scope

- Syncing the choice across devices. It is per device, per account.
- The DepEd "Change relationship" sheet on the learner screen (`RelationshipSheet.jsx`). It only offers the other side of the guardian/Adviser line, so there is nothing to preselect.

## File map

| File | Action | Responsibility |
|---|---|---|
| `parent/src/lib/lastRelationship.js` | Create | `recallRelationship` / `rememberRelationship` over `localStorage` |
| `parent/src/lib/lastRelationship.test.js` | Create | Unit tests with a fake storage |
| `parent/src/screens/Activate.jsx` | Modify | Start from the remembered choice; save it on success |
| `parent/src/screens/RequestAccess.jsx` | Modify | Same, guardian relationships only |
| `parent/tests/browser/onboarding-fixture.js` | Modify | "Reset new account" also forgets the remembered choice |

---

### Task 1: `lastRelationship` storage helpers

**Files:**
- Create: `parent/src/lib/lastRelationship.js`
- Test: `parent/src/lib/lastRelationship.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `recallRelationship(uid: string | undefined, allowed: string[], fallback: string, storage?: Storage | null) → string` — the stored choice if it is in `allowed`, else `fallback`.
  - `rememberRelationship(uid: string | undefined, relationship: string, storage?: Storage | null) → void` — never throws.
  - `storage` defaults to `window.localStorage` (or `null` where it is missing or blocked). Tests always pass their own.

- [ ] **Step 1: Write the failing test**

Create `parent/src/lib/lastRelationship.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { recallRelationship, rememberRelationship } from './lastRelationship.js';
import { RELATIONSHIPS, ADVISER } from './relationships.js';

const ALL = [...RELATIONSHIPS, ADVISER];
const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, map: m };
};
const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };

describe('lastRelationship', () => {
  it('uses the screen default when nothing was remembered', () => {
    expect(recallRelationship('u1', ALL, 'Mother', fakeStorage())).toBe('Mother');
  });
  it('preselects the last choice that was saved', () => {
    const s = fakeStorage();
    rememberRelationship('u1', 'Father', s);
    expect(recallRelationship('u1', ALL, 'Mother', s)).toBe('Father');
    rememberRelationship('u1', ADVISER, s);
    expect(recallRelationship('u1', ALL, 'Mother', s)).toBe(ADVISER);
  });
  it('stores it under a per-account key', () => {
    const s = fakeStorage();
    rememberRelationship('u1', 'Grandparent', s);
    expect(s.map.get('bnhs-parent-last-relationship:u1')).toBe('Grandparent');
  });
  it('keeps each account on a shared phone separate', () => {
    const s = fakeStorage();
    rememberRelationship('mom', 'Mother', s);
    rememberRelationship('dad', 'Father', s);
    expect(recallRelationship('mom', ALL, 'Mother', s)).toBe('Mother');
    expect(recallRelationship('dad', ALL, 'Mother', s)).toBe('Father');
    expect(recallRelationship('someone-else', ALL, 'Mother', s)).toBe('Mother');
  });
  it('ignores a remembered choice the screen does not offer', () => {
    const s = fakeStorage();
    rememberRelationship('u1', ADVISER, s);
    // Request access has no Adviser option.
    expect(recallRelationship('u1', RELATIONSHIPS, 'Guardian', s)).toBe('Guardian');
    s.map.set('bnhs-parent-last-relationship:u1', 'Uncle'); // edited by hand or from an old build
    expect(recallRelationship('u1', ALL, 'Mother', s)).toBe('Mother');
  });
  it('does nothing without a signed-in account', () => {
    const s = fakeStorage();
    rememberRelationship(undefined, 'Father', s);
    expect(s.map.size).toBe(0);
    expect(recallRelationship(undefined, ALL, 'Mother', s)).toBe('Mother');
  });
  it('falls back quietly when storage is missing or blocked', () => {
    expect(recallRelationship('u1', ALL, 'Mother', null)).toBe('Mother');
    expect(recallRelationship('u1', ALL, 'Mother', blocked)).toBe('Mother');
    expect(() => rememberRelationship('u1', 'Father', blocked)).not.toThrow();
    expect(() => rememberRelationship('u1', 'Father', null)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `parent/`):
```bash
npx vitest run src/lib/lastRelationship.test.js
```
Expected: FAIL — `Failed to resolve import "./lastRelationship.js"`.

- [ ] **Step 3: Write the implementation**

Create `parent/src/lib/lastRelationship.js`:

```js
// The relationship picked the last time this account linked a learner, so
// Activate and Request access don't fall back to "Mother" every time. Per
// device and per account: a shared phone keeps each parent's own choice.
const KEY = 'bnhs-parent-last-relationship';

// Reading localStorage itself throws when site data is blocked.
const local = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function recallRelationship(uid, allowed, fallback, storage = local()) {
  if (!uid || !storage) return fallback;
  let stored = null;
  try { stored = storage.getItem(`${KEY}:${uid}`); } catch {}
  return allowed.includes(stored) ? stored : fallback;
}

export function rememberRelationship(uid, relationship, storage = local()) {
  if (!uid || !storage) return;
  try { storage.setItem(`${KEY}:${uid}`, relationship); } catch {}
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `parent/`):
```bash
npx vitest run src/lib/lastRelationship.test.js
```
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add parent/src/lib/lastRelationship.js parent/src/lib/lastRelationship.test.js
git commit -m "Add storage helpers for the last chosen learner relationship

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Activate and Request access start from the last choice

**Files:**
- Modify: `parent/src/screens/Activate.jsx` (imports at line 8; `useState('Mother')` at line 19; success branch at lines 45-47)
- Modify: `parent/src/screens/RequestAccess.jsx` (imports at line 6; initial form state at line 15; success branch at line 20)
- Modify: `parent/tests/browser/onboarding-fixture.js` (`reset()` at lines 26-30)

**Interfaces:**
- Consumes: `recallRelationship(uid, allowed, fallback)` and `rememberRelationship(uid, relationship)` from Task 1 (default storage); `RELATIONSHIPS`, `ADVISER` from `parent/src/lib/relationships.js`.
- Produces: nothing other tasks use.

There is no component test runner in this app (vitest runs in the node environment on `src/**/*.test.js`), so this task is checked in the existing onboarding browser preview.

- [ ] **Step 1: Wire Activate**

In `parent/src/screens/Activate.jsx`, change the import on line 8:

```js
import { RELATIONSHIPS, ADVISER } from '../lib/relationships.js';
import { recallRelationship, rememberRelationship } from '../lib/lastRelationship.js';
```

Replace line 19 (`const [relationship, setRelationship] = useState('Mother');`) with:

```js
  // Starts from the relationship this account used last time (Mother on the first link).
  const [relationship, setRelationship] = useState(() => recallRelationship(user?.uid, [...RELATIONSHIPS, ADVISER], 'Mother'));
```

In `submit`, remember the choice only once the server has accepted it. Replace:

```js
      const r = await callable('activateCodeFn')({ code, relationship, consentVersion, guardianName: name });
      if (user && user.displayName !== name) updateProfile(user, { displayName: name }).catch(() => {});
      setDone(r.data);
```

with:

```js
      const r = await callable('activateCodeFn')({ code, relationship, consentVersion, guardianName: name });
      rememberRelationship(user?.uid, relationship);
      if (user && user.displayName !== name) updateProfile(user, { displayName: name }).catch(() => {});
      setDone(r.data);
```

"Link another learner" (`setDone(null); setCode('')`) already keeps `relationship` in state, so it needs no change.

- [ ] **Step 2: Wire Request access**

In `parent/src/screens/RequestAccess.jsx`, add after the import on line 6:

```js
import { recallRelationship, rememberRelationship } from '../lib/lastRelationship.js';
```

On line 15, replace `relationship: 'Guardian'` in the initial form state so the line reads:

```js
  const [f, setF] = useState(() => ({ guardianName: profile?.displayName || user.displayName || '', studentLrn: '', learnerNameTyped: '', relationship: recallRelationship(user.uid, RELATIONSHIPS, 'Guardian'), contactNumber: '', message: '' }));
```

(Lazy initializer so storage is read once, not on every render. `RELATIONSHIPS` has no Adviser, so an adviser's remembered "Adviser" falls back to Guardian here.)

In `send`, replace:

```js
    try { await callable('requestAccessFn')(f); setMsg({ tone: 'info', text: S.requestSent }); setF((p) => ({ ...p, studentLrn: '', learnerNameTyped: '', message: '' })); }
```

with:

```js
    try { await callable('requestAccessFn')(f); rememberRelationship(user.uid, f.relationship); setMsg({ tone: 'info', text: S.requestSent }); setF((p) => ({ ...p, studentLrn: '', learnerNameTyped: '', message: '' })); }
```

- [ ] **Step 3: Make the preview's reset forget the choice**

In `parent/tests/browser/onboarding-fixture.js`, in `reset()`, replace:

```js
  localStorage.removeItem('bnhs-parent-consent'); navigate('/'); save();
```

with:

```js
  localStorage.removeItem('bnhs-parent-consent');
  localStorage.removeItem(`bnhs-parent-last-relationship:${user.uid}`);
  navigate('/'); save();
```

- [ ] **Step 4: Run the unit tests**

Run:
```bash
npm --prefix parent test
```
Expected: PASS, including the 7 `lastRelationship` tests.

- [ ] **Step 5: Check it in the onboarding preview**

Run (from `parent/`), in the background. When done, stop only this process (its own PID/task), never every `node` process:
```bash
npx vite --config tests/browser/onboarding.config.mjs
```
Open `http://127.0.0.1:5190/tests/browser/onboarding-preview.html` at phone width (375 px). Click **Reset new account**, accept the privacy notice, and you land on Activate. Check:
- The relationship picker shows **Mother** (nothing remembered yet).
- Pick **Father**, type any 8-character code (e.g. `ABCD1234`), tap Link learner. On the success card tap **Link another learner**: the picker still shows **Father**.
- Reload the page and go to `#/activate`: the picker shows **Father**, not Mother.
- Pick **Adviser (class adviser)**, link again, reload, open `#/activate`: the picker shows **Adviser (class adviser)**.
- Open `#/request-access`: the picker shows **Guardian** (Adviser is not offered there). Pick **Grandparent**, fill the LRN (12 digits), learner name and contact number, tap Send. Reload `#/request-access`: **Grandparent**. Then `#/activate` also shows **Grandparent**.
- Click **Reset new account** and go back to Activate: **Mother** again.
- In DevTools, run `localStorage.setItem('bnhs-parent-last-relationship:preview-parent', 'Uncle')` and reload `#/activate`: **Mother**, and no console errors.

- [ ] **Step 6: Build and check the bundle budget**

Run:
```bash
npm --prefix parent run build
npm --prefix parent run size
```
Expected: the build succeeds and `size` reports the eager entry under budget. (In a worktree, the build needs the main checkout's `parent/.env` and `parent/node_modules/jsqr`; see the existing Parent App release notes.)

- [ ] **Step 7: Commit**

```bash
git add parent/src/screens/Activate.jsx parent/src/screens/RequestAccess.jsx parent/tests/browser/onboarding-fixture.js
git commit -m "Preselect the last chosen relationship when linking a learner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
