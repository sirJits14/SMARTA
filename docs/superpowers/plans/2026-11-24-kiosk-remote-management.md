# Kiosk Remote Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In SIMS → Guardians → Kiosk devices, show Online/Offline per kiosk, delete kiosk accounts, and switch kiosks between Entrance and Exit from SIMS (live, no refresh), while the kiosk's own toggle keeps working.

**Architecture:** Every feature rides on the existing `kiosks/{uid}` doc. The kiosk app already listens to its own doc live (`useKioskDevice`), so a `mode` field written by SIMS (via an admin callable) or by the kiosk (via a narrowly widened rule) reaches the other side within seconds. Presence is a 2-minute `lastSeenAt` heartbeat from the kiosk plus a pure `kioskPresence()` helper in SIMS. Delete is an admin callable that removes the Auth user and tombstones the doc so Scan log names survive.

**Tech Stack:** React 19 + Vite (SIMS and kiosk), Firebase Functions v2 callables (`functions/`), Firestore rules + `@firebase/rules-unit-testing`, Vitest everywhere.

**Spec:** `docs/superpowers/specs/2026-11-24-kiosk-remote-management-design.md`

## Global Constraints

- Two repos. SIMS work happens in this worktree (`bnhs-sims`, branch `claude/kiosk-management-remote-565acd`). Kiosk work happens in a new worktree of `bnhs-student-kiosk` on branch `claude/kiosk-remote-mode` (created in Task 6). Never edit the kiosk repo's main checkout — it has the user's untracked files.
- Mode values are exactly `'entrance'` and `'exit'`.
- `HEARTBEAT_MS = 120_000` (kiosk). `ONLINE_WINDOW_MS = 5 * 60_000`, presence re-check every 30 s (SIMS).
- `modeChangedBy` is `'kiosk'` for kiosk writes, the staff email for SIMS writes. `modeChangedByName` is set only by SIMS (`ctx.profile?.name || email`).
- `setKioskModeFn` accepts 1–100 uids.
- Deleted kiosks: `deleted: true`, `active: false`, doc kept (tombstone), never hard-deleted.
- Last write wins. No lock. No time-of-day schedule.
- New callables are admin-only (`adminCall` in `functions/index.js`).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Deployment is NOT part of this plan. It follows the SIMS release recipe and the kiosk release flow, with the user, after review.

## File Map

**bnhs-sims (this worktree)**
- Modify `functions/src/handlers/kiosks.js` — add `deleteKiosk`, `setKioskMode`; `registerKiosk` refuses deleted kiosks.
- Modify `functions/src/handlers/kiosks.test.js` — unit tests for the above.
- Modify `functions/index.js` — export `deleteKioskFn`, `setKioskModeFn`.
- Modify `src/data/guardians.js` — add `call.deleteKiosk`, `call.setKioskMode`.
- Modify `firestore.rules` — kiosk self-update rule.
- Modify `tests/rules/existing.test.js` — kiosk rule tests.
- Create `src/lib/kioskPresence.js` + `src/lib/kioskPresence.test.js` — presence, "ago" text, mode-change note, visible-kiosk filter.
- Modify `src/pages/guardians/DevicesTab.jsx` — status dots, Mode column, Set-all buttons, Delete, hide deleted.
- Modify `src/pages/guardians/ScanLogTab.jsx` — Device filter hides deleted kiosks.

**bnhs-student-kiosk (new worktree)**
- Create `src/lib/kioskMode.js` + `src/lib/kioskMode.test.js` — mode resolution and write payload.
- Modify `src/App.jsx` — heartbeat, two-way mode sync, back-fill.

---

### Task 1: `deleteKiosk` callable

**Files:**
- Modify: `functions/src/handlers/kiosks.js`
- Modify: `functions/src/handlers/kiosks.test.js`
- Modify: `functions/index.js:12,75-78`
- Modify: `src/data/guardians.js:9-25`

**Interfaces:**
- Produces: `deleteKiosk(ctx: { db, auth, email }, data: { uid: string }) => Promise<{ ok: true }>`; callable name `deleteKioskFn`; client `call.deleteKiosk({ uid })`.
- Produces: `registerKiosk` throws `CallableError('failed-precondition', 'This kiosk was deleted.')` for `deleted: true` docs.

- [ ] **Step 1: Write the failing tests**

In `functions/src/handlers/kiosks.test.js`, change the import line to:

```js
import { registerKiosk, provisionKiosk, resetKioskPassword, deleteKiosk } from './kiosks.js';
```

Add after the existing `fakeDb` helper:

```js
// Per-path fake: docs maps kiosk uid -> data (absent = doc missing).
const kioskDb = (docs = {}) => {
  const set = vi.fn().mockResolvedValue(undefined);
  const batchSet = vi.fn();
  const commit = vi.fn().mockResolvedValue(undefined);
  const db = {
    doc: vi.fn((path) => {
      const id = path.split('/')[1];
      return {
        path,
        set: (...args) => set(path, ...args),
        get: vi.fn().mockResolvedValue({ exists: id in docs, data: () => docs[id] }),
      };
    }),
    batch: vi.fn(() => ({ set: batchSet, commit })),
  };
  return { db, set, batchSet, commit };
};
const kioskUser = (uid) => ({ uid, email: `kiosk-${uid}@bnhs.local` });
```

Change the existing `registerKiosk` test's `get` mock to return data:

```js
    const get = vi.fn().mockResolvedValue({ exists: true, data: () => ({ label: 'fake', active: false }) });
```

Append these tests:

```js
describe('registerKiosk (deleted)', () => {
  it('refuses to re-activate a deleted kiosk', async () => {
    const { db, set } = kioskDb({ kiosk1: { label: 'Main Gate', active: false, deleted: true } });
    const getUser = vi.fn().mockResolvedValue(kioskUser('kiosk1'));
    await expect(registerKiosk({ db, auth: { getUser }, email: 'registrar@bnhs.edu' }, { uid: 'kiosk1', label: 'Main Gate' }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(set).not.toHaveBeenCalled();
  });
});

describe('deleteKiosk', () => {
  it('deletes the Auth user, tombstones the doc and audits', async () => {
    vi.mocked(audit).mockClear();
    const { db, set } = kioskDb({ kiosk1: { label: 'Main Gate', active: true } });
    const getUser = vi.fn().mockResolvedValue(kioskUser('kiosk1'));
    const deleteUser = vi.fn().mockResolvedValue(undefined);

    const result = await deleteKiosk({ db, auth: { getUser, deleteUser }, email: 'registrar@bnhs.edu' }, { uid: 'kiosk1' });

    expect(result).toEqual({ ok: true });
    expect(deleteUser).toHaveBeenCalledWith('kiosk1');
    expect(set).toHaveBeenCalledWith('kiosks/kiosk1',
      expect.objectContaining({ active: false, deleted: true, deletedBy: 'registrar@bnhs.edu' }), { merge: true });
    expect(set.mock.calls[0][1]).not.toHaveProperty('label');
    expect(vi.mocked(audit)).toHaveBeenCalledWith(db, expect.objectContaining({
      action: 'kiosk.deleted', targetType: 'kiosk', targetId: 'kiosk1', details: { label: 'Main Gate' },
    }));
  });

  it('refuses a non-kiosk account and changes nothing', async () => {
    const { db, set } = kioskDb({ guardian1: { label: 'x', active: true } });
    const getUser = vi.fn().mockResolvedValue({ uid: 'guardian1', email: 'someone@gmail.com' });
    const deleteUser = vi.fn();
    await expect(deleteKiosk({ db, auth: { getUser, deleteUser }, email: 'registrar@bnhs.edu' }, { uid: 'guardian1' }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('still tombstones the doc when the Auth user is already gone', async () => {
    const { db, set } = kioskDb({ kiosk1: { label: 'Main Gate', active: false } });
    const getUser = vi.fn().mockRejectedValue(Object.assign(new Error('gone'), { code: 'auth/user-not-found' }));
    const deleteUser = vi.fn();
    await deleteKiosk({ db, auth: { getUser, deleteUser }, email: 'registrar@bnhs.edu' }, { uid: 'kiosk1' });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith('kiosks/kiosk1', expect.objectContaining({ deleted: true }), { merge: true });
  });

  it('returns not-found for a missing or already-deleted kiosk', async () => {
    const auth = { getUser: vi.fn(), deleteUser: vi.fn() };
    const missing = kioskDb({});
    await expect(deleteKiosk({ db: missing.db, auth, email: 'r@bnhs.edu' }, { uid: 'kiosk1' })).rejects.toMatchObject({ code: 'not-found' });
    const gone = kioskDb({ kiosk1: { label: 'Main Gate', active: false, deleted: true } });
    await expect(deleteKiosk({ db: gone.db, auth, email: 'r@bnhs.edu' }, { uid: 'kiosk1' })).rejects.toMatchObject({ code: 'not-found' });
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `functions/`): `npx vitest run src/handlers/kiosks.test.js`
Expected: FAIL — `deleteKiosk is not a function`, and the deleted-registerKiosk test resolves instead of rejecting.

- [ ] **Step 3: Implement**

In `functions/src/handlers/kiosks.js`, in `registerKiosk` replace

```js
  if (!existing.exists) throw new CallableError('not-found', 'No such kiosk device to reactivate.');
```

with

```js
  if (!existing.exists) throw new CallableError('not-found', 'No such kiosk device to reactivate.');
  if (existing.data()?.deleted === true) throw new CallableError('failed-precondition', 'This kiosk was deleted.');
```

Append to the file:

```js
// Permanently removes a device's sign-in. The kiosks/{uid} doc stays as a
// tombstone (deleted: true, active: false) so Scan log rows keep showing the
// gate name; SIMS hides tombstones from the device list and filters.
export async function deleteKiosk(ctx, data) {
  const { db, auth, email } = ctx;
  const uid = str(data.uid, { name: 'uid', min: 4, max: 128 });
  const ref = db.doc(`kiosks/${uid}`);
  const snap = await ref.get();
  const kiosk = snap.exists ? snap.data() : null;
  if (!kiosk || kiosk.deleted === true) throw new CallableError('not-found', 'No such kiosk device.');
  let authUserExists = true;
  try { await assertKioskAccount(auth, uid); }
  catch (e) { if (e.code === 'auth/user-not-found') authUserExists = false; else throw e; }
  if (authUserExists) await auth.deleteUser(uid);
  await ref.set({ active: false, deleted: true, deletedAt: FieldValue.serverTimestamp(), deletedBy: email }, { merge: true });
  await audit(db, { action: 'kiosk.deleted', actorType: 'staff', actorUid: email, targetType: 'kiosk', targetId: uid, details: { label: kiosk.label || '' } });
  return { ok: true };
}
```

In `functions/index.js` change line 12 to:

```js
import { registerKiosk, deactivateKiosk, provisionKiosk, resetKioskPassword, deleteKiosk } from './src/handlers/kiosks.js';
```

and after `export const resetKioskPasswordFn = adminCall(resetKioskPassword);` add:

```js
export const deleteKioskFn = adminCall(deleteKiosk);
```

In `src/data/guardians.js`, after `resetKioskPassword: fn('resetKioskPasswordFn'),` add:

```js
  deleteKiosk: fn('deleteKioskFn'),
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `functions/`): `npx vitest run src/handlers/kiosks.test.js`
Expected: PASS (all kiosks tests).

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/kiosks.js functions/src/handlers/kiosks.test.js functions/index.js src/data/guardians.js
git commit -m "feat(kiosks): deleteKiosk callable keeps a tombstone for scan log names"
```

---

### Task 2: `setKioskMode` callable

**Files:**
- Modify: `functions/src/handlers/kiosks.js`
- Modify: `functions/src/handlers/kiosks.test.js`
- Modify: `functions/index.js`
- Modify: `src/data/guardians.js`

**Interfaces:**
- Consumes: `kioskDb` test helper from Task 1.
- Produces: `setKioskMode(ctx: { db, email, profile }, data: { uids: string[], mode: 'entrance'|'exit' }) => Promise<{ updated: string[], skipped: string[] }>`; callable `setKioskModeFn`; client `call.setKioskMode({ uids, mode })`.
- Produces doc fields: `mode`, `modeChangedAt` (server timestamp), `modeChangedBy` (staff email), `modeChangedByName`.

- [ ] **Step 1: Write the failing tests**

Extend the import in `kiosks.test.js`:

```js
import { registerKiosk, provisionKiosk, resetKioskPassword, deleteKiosk, setKioskMode } from './kiosks.js';
```

Append:

```js
describe('setKioskMode', () => {
  const staff = { email: 'registrar@bnhs.edu', profile: { name: 'Sir Geths' } };

  it('sets the mode on active kiosks, skips inactive/deleted/missing, audits once', async () => {
    vi.mocked(audit).mockClear();
    const { db, batchSet, commit } = kioskDb({
      kioskA: { label: 'A', active: true },
      kioskB: { label: 'B', active: false },
      kioskC: { label: 'C', active: false, deleted: true },
      kioskD: { label: 'D', active: true },
    });

    const result = await setKioskMode({ db, ...staff }, { uids: ['kioskA', 'kioskB', 'kioskC', 'kioskD', 'kioskZ'], mode: 'exit' });

    expect(result).toEqual({ updated: ['kioskA', 'kioskD'], skipped: ['kioskB', 'kioskC', 'kioskZ'] });
    expect(batchSet).toHaveBeenCalledTimes(2);
    expect(batchSet.mock.calls[0][0].path).toBe('kiosks/kioskA');
    expect(batchSet.mock.calls[0][1]).toEqual(expect.objectContaining({
      mode: 'exit', modeChangedBy: 'registrar@bnhs.edu', modeChangedByName: 'Sir Geths',
    }));
    expect(batchSet.mock.calls[0][1]).toHaveProperty('modeChangedAt');
    expect(batchSet.mock.calls[0][2]).toEqual({ merge: true });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audit)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(audit)).toHaveBeenCalledWith(db, expect.objectContaining({
      action: 'kiosk.mode_changed', details: { mode: 'exit', uids: ['kioskA', 'kioskD'], count: 2 },
    }));
  });

  it('falls back to the email when the profile has no name', async () => {
    const { db, batchSet } = kioskDb({ kioskA: { label: 'A', active: true } });
    await setKioskMode({ db, email: 'r@bnhs.edu', profile: {} }, { uids: ['kioskA'], mode: 'entrance' });
    expect(batchSet.mock.calls[0][1].modeChangedByName).toBe('r@bnhs.edu');
  });

  it('does not commit or audit when nothing is eligible', async () => {
    vi.mocked(audit).mockClear();
    const { db, commit } = kioskDb({ kioskB: { label: 'B', active: false } });
    const result = await setKioskMode({ db, ...staff }, { uids: ['kioskB'], mode: 'exit' });
    expect(result).toEqual({ updated: [], skipped: ['kioskB'] });
    expect(commit).not.toHaveBeenCalled();
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it('rejects a bad mode or uid list', async () => {
    const { db } = kioskDb({});
    await expect(setKioskMode({ db, ...staff }, { uids: ['kioskA'], mode: 'sideways' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(setKioskMode({ db, ...staff }, { uids: [], mode: 'exit' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(setKioskMode({ db, ...staff }, { uids: 'kioskA', mode: 'exit' })).rejects.toMatchObject({ code: 'invalid-argument' });
    const tooMany = Array.from({ length: 101 }, (_, i) => `kiosk${i}`);
    await expect(setKioskMode({ db, ...staff }, { uids: tooMany, mode: 'exit' })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('de-duplicates uids', async () => {
    const { db, batchSet } = kioskDb({ kioskA: { label: 'A', active: true } });
    const result = await setKioskMode({ db, ...staff }, { uids: ['kioskA', 'kioskA'], mode: 'exit' });
    expect(result.updated).toEqual(['kioskA']);
    expect(batchSet).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `functions/`): `npx vitest run src/handlers/kiosks.test.js`
Expected: FAIL — `setKioskMode is not a function`.

- [ ] **Step 3: Implement**

Append to `functions/src/handlers/kiosks.js`:

```js
const KIOSK_MODES = ['entrance', 'exit'];
const MAX_MODE_UIDS = 100;

// Remote Entrance/Exit switch. Each kiosk listens to its own kiosks/{uid}
// doc and adopts `mode` live; the kiosk's own toggle writes the same field
// (modeChangedBy: 'kiosk'), so whichever write lands last wins.
export async function setKioskMode(ctx, data) {
  const { db, email, profile } = ctx;
  const mode = data.mode;
  if (!KIOSK_MODES.includes(mode)) throw new CallableError('invalid-argument', 'mode must be entrance or exit');
  if (!Array.isArray(data.uids) || data.uids.length < 1 || data.uids.length > MAX_MODE_UIDS) {
    throw new CallableError('invalid-argument', `uids must list 1 to ${MAX_MODE_UIDS} kiosks`);
  }
  const uids = [...new Set(data.uids.map((u) => str(u, { name: 'uid', min: 4, max: 128 })))];
  const refs = uids.map((uid) => db.doc(`kiosks/${uid}`));
  const snaps = await Promise.all(refs.map((r) => r.get()));
  const fields = {
    mode, modeChangedAt: FieldValue.serverTimestamp(), modeChangedBy: email, modeChangedByName: profile?.name || email,
  };
  const batch = db.batch();
  const updated = [];
  const skipped = [];
  snaps.forEach((snap, i) => {
    const kiosk = snap.exists ? snap.data() : null;
    if (!kiosk || kiosk.active !== true || kiosk.deleted === true) { skipped.push(uids[i]); return; }
    batch.set(refs[i], fields, { merge: true });
    updated.push(uids[i]);
  });
  if (updated.length) {
    await batch.commit();
    await audit(db, {
      action: 'kiosk.mode_changed', actorType: 'staff', actorUid: email, targetType: 'kiosk',
      targetId: updated.length === 1 ? updated[0] : 'multiple', details: { mode, uids: updated, count: updated.length },
    });
  }
  return { updated, skipped };
}
```

In `functions/index.js` extend the import to include `setKioskMode` and add after `deleteKioskFn`:

```js
export const setKioskModeFn = adminCall(setKioskMode);
```

In `src/data/guardians.js` after `deleteKiosk: fn('deleteKioskFn'),` add:

```js
  setKioskMode: fn('setKioskModeFn'),
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `functions/`): `npx vitest run src/handlers/kiosks.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/kiosks.js functions/src/handlers/kiosks.test.js functions/index.js src/data/guardians.js
git commit -m "feat(kiosks): setKioskMode callable switches Entrance/Exit remotely"
```

---

### Task 3: Firestore rule — kiosk may write its own mode

**Files:**
- Modify: `firestore.rules:192-196`
- Modify: `tests/rules/existing.test.js:1-2,63-77`

**Interfaces:**
- Produces: an active kiosk may update only `lastSeenAt`, `mode`, `modeChangedAt`, `modeChangedBy` on its own doc; mode writes require `mode in ['entrance','exit']`, `modeChangedBy == 'kiosk'`, `modeChangedAt == request.time`. Inactive kiosks may write nothing.

- [ ] **Step 1: Write the failing tests**

In `tests/rules/existing.test.js` add at the top, after the vitest import:

```js
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
```

and after the helpers import:

```js
// rules-unit-testing hands out compat Firestore instances.
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
```

Inside `describe('kiosks', …)` append:

```js
  it('active kiosk may report its own Entrance/Exit mode', async () => {
    const own = () => as(env, KIOSK).doc('kiosks/kiosk1');
    await ok(own().update({ mode: 'exit', modeChangedAt: serverTimestamp(), modeChangedBy: 'kiosk' }));
    await ok(own().update({ mode: 'entrance', modeChangedAt: serverTimestamp(), modeChangedBy: 'kiosk', lastSeenAt: serverTimestamp() }));
    await denied(own().update({ mode: 'sideways', modeChangedAt: serverTimestamp(), modeChangedBy: 'kiosk' }));
    await denied(own().update({ mode: 'exit', modeChangedAt: serverTimestamp(), modeChangedBy: 'registrar@bnhs.edu' }));
    await denied(own().update({ mode: 'exit', modeChangedAt: new Date(2020, 0, 1), modeChangedBy: 'kiosk' }));
    await denied(own().update({ mode: 'exit', modeChangedAt: serverTimestamp(), modeChangedBy: 'kiosk', modeChangedByName: 'Sir Geths' }));
    await denied(own().update({ deleted: true }));
    await denied(own().update({ label: 'Renamed' }));
  });
  it('a kiosk cannot write another kiosk, and an inactive kiosk writes nothing', async () => {
    await denied(as(env, KIOSK).doc('kiosks/kiosk9').update({ lastSeenAt: new Date() }));
    await denied(as(env, KIOSK_INACTIVE).doc('kiosks/kiosk9').update({ lastSeenAt: new Date() }));
    await denied(as(env, KIOSK_INACTIVE).doc('kiosks/kiosk9').update({ mode: 'exit', modeChangedAt: serverTimestamp(), modeChangedBy: 'kiosk' }));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:rules -- tests/rules/existing.test.js`
Expected: FAIL — the first `ok(...mode: 'exit'...)` is denied, and `KIOSK_INACTIVE ... lastSeenAt` succeeds.

- [ ] **Step 3: Implement**

In `firestore.rules`, replace

```
      allow update: if own(uid) && affectedOnly(['lastSeenAt']);
```

with

```
      // Active kiosks heartbeat (lastSeenAt) and report their own Entrance/Exit
      // toggle. SIMS writes mode through setKioskModeFn; last write wins.
      allow update: if own(uid) && resource.data.active == true
        && affectedOnly(['lastSeenAt', 'mode', 'modeChangedAt', 'modeChangedBy'])
        && (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['mode', 'modeChangedAt', 'modeChangedBy'])
          || (request.resource.data.mode in ['entrance', 'exit']
            && request.resource.data.modeChangedBy == 'kiosk'
            && request.resource.data.modeChangedAt == request.time));
```

and update the `create, delete` comment to `// provisionKiosk / deleteKioskFn callables (admin SDK)`.

- [ ] **Step 4: Run all rules tests**

Run: `npm run test:rules`
Expected: PASS for every rules file (including `temporaryPassword.test.js`, which still denies `kiosks/gA` writes).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules/existing.test.js
git commit -m "feat(rules): active kiosks may report their own Entrance/Exit mode"
```

---

### Task 4: `kioskPresence` helper

**Files:**
- Create: `src/lib/kioskPresence.js`
- Test: `src/lib/kioskPresence.test.js`

**Interfaces:**
- Produces:
  - `ONLINE_WINDOW_MS = 300000`, `PRESENCE_TICK_MS = 30000`
  - `formatAgo(ms: number, nowMs: number) => string` — `'just now' | '5m ago' | '2h ago' | '3d ago'`
  - `kioskPresence(kiosk, nowMs) => { state: 'online'|'offline'|'deactivated', label: string }`
  - `modeChangeNote(kiosk) => string`
  - `visibleKiosks(kiosks) => kiosks without deleted: true`
  - Timestamp inputs may be Firestore `Timestamp` (has `toMillis()`), `Date`, or missing.

- [ ] **Step 1: Write the failing test**

Create `src/lib/kioskPresence.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { ONLINE_WINDOW_MS, formatAgo, kioskPresence, modeChangeNote, visibleKiosks } from './kioskPresence.js';

const NOW = Date.parse('2026-11-24T10:00:00+08:00');
const ts = (ms) => ({ toMillis: () => ms });

describe('formatAgo', () => {
  it('rounds into the largest unit', () => {
    expect(formatAgo(NOW - 20_000, NOW)).toBe('just now');
    expect(formatAgo(NOW - 5 * 60_000, NOW)).toBe('5m ago');
    expect(formatAgo(NOW - 2 * 3600_000, NOW)).toBe('2h ago');
    expect(formatAgo(NOW - 3 * 86400_000, NOW)).toBe('3d ago');
    expect(formatAgo(NOW + 10_000, NOW)).toBe('just now');
  });
});

describe('kioskPresence', () => {
  it('is deactivated whenever active is not true', () => {
    expect(kioskPresence({ active: false, lastSeenAt: ts(NOW) }, NOW)).toEqual({ state: 'deactivated', label: 'Deactivated' });
  });
  it('is online up to and including the 5-minute window', () => {
    expect(kioskPresence({ active: true, lastSeenAt: ts(NOW - ONLINE_WINDOW_MS) }, NOW).state).toBe('online');
    expect(kioskPresence({ active: true, lastSeenAt: new Date(NOW - 60_000) }, NOW)).toEqual({ state: 'online', label: 'Online' });
  });
  it('is offline past the window, with how long ago', () => {
    expect(kioskPresence({ active: true, lastSeenAt: ts(NOW - ONLINE_WINDOW_MS - 1000) }, NOW))
      .toEqual({ state: 'offline', label: 'Offline · last seen 5m ago' });
    expect(kioskPresence({ active: true, lastSeenAt: ts(NOW - 2 * 3600_000) }, NOW).label).toBe('Offline · last seen 2h ago');
  });
  it('is offline and never seen without lastSeenAt', () => {
    expect(kioskPresence({ active: true }, NOW)).toEqual({ state: 'offline', label: 'Offline · never seen' });
  });
});

describe('modeChangeNote', () => {
  it('says not reported yet without a valid mode', () => {
    expect(modeChangeNote({})).toBe('not reported yet');
    expect(modeChangeNote({ mode: 'sideways' })).toBe('not reported yet');
  });
  it('names the kiosk or the staff member', () => {
    expect(modeChangeNote({ mode: 'exit', modeChangedBy: 'kiosk', modeChangedAt: ts(NOW) })).toMatch(/^changed at the kiosk, /);
    expect(modeChangeNote({ mode: 'exit', modeChangedBy: 'r@bnhs.edu', modeChangedByName: 'Sir Geths', modeChangedAt: ts(NOW) }))
      .toMatch(/^changed by Sir Geths, /);
    expect(modeChangeNote({ mode: 'entrance', modeChangedBy: 'r@bnhs.edu' })).toBe('changed by r@bnhs.edu');
  });
});

describe('visibleKiosks', () => {
  it('drops deleted kiosks only', () => {
    expect(visibleKiosks([{ id: 'a' }, { id: 'b', deleted: true }, { id: 'c', active: false }]).map((k) => k.id)).toEqual(['a', 'c']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/kioskPresence.test.js`
Expected: FAIL — cannot resolve `./kioskPresence.js`.

- [ ] **Step 3: Implement**

Create `src/lib/kioskPresence.js`:

```js
// Kiosks heartbeat lastSeenAt every 2 minutes (bnhs-student-kiosk App.jsx),
// so 5 minutes of silence means the kiosk page is closed or disconnected.
// "Online" never means the computer itself is powered on.
export const ONLINE_WINDOW_MS = 5 * 60_000;
export const PRESENCE_TICK_MS = 30_000;

const millis = (t) => (t?.toMillis ? t.toMillis() : t instanceof Date ? t.getTime() : null);

export function formatAgo(ms, nowMs) {
  const seconds = Math.max(0, Math.round((nowMs - ms) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function kioskPresence(kiosk, nowMs) {
  if (kiosk.active !== true) return { state: 'deactivated', label: 'Deactivated' };
  const seen = millis(kiosk.lastSeenAt);
  if (seen == null) return { state: 'offline', label: 'Offline · never seen' };
  if (nowMs - seen <= ONLINE_WINDOW_MS) return { state: 'online', label: 'Online' };
  return { state: 'offline', label: `Offline · last seen ${formatAgo(seen, nowMs)}` };
}

export function modeChangeNote(kiosk) {
  if (kiosk.mode !== 'entrance' && kiosk.mode !== 'exit') return 'not reported yet';
  const at = millis(kiosk.modeChangedAt);
  const when = at == null ? '' : `, ${new Date(at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  if (kiosk.modeChangedBy === 'kiosk') return `changed at the kiosk${when}`;
  return `changed by ${kiosk.modeChangedByName || kiosk.modeChangedBy || 'staff'}${when}`;
}

// Deleted kiosks stay as tombstones so the Scan log can still name them.
export const visibleKiosks = (kiosks) => kiosks.filter((k) => k.deleted !== true);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/kioskPresence.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kioskPresence.js src/lib/kioskPresence.test.js
git commit -m "feat(kiosks): presence and mode-change helpers for the devices list"
```

---

### Task 5: Kiosk devices tab + Scan log filter

**Files:**
- Modify: `src/pages/guardians/DevicesTab.jsx` (full rewrite shown below)
- Modify: `src/pages/guardians/ScanLogTab.jsx:55`

**Interfaces:**
- Consumes: `call.deleteKiosk({ uid })`, `call.setKioskMode({ uids, mode })` (Tasks 1–2); `kioskPresence`, `modeChangeNote`, `visibleKiosks`, `PRESENCE_TICK_MS` (Task 4).

- [ ] **Step 1: Rewrite `DevicesTab.jsx`**

Replace the whole file with:

```jsx
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ActionFeedback } from '../../components/ui.jsx';
import { ResourceState } from '../../components/ui.jsx';
import { useEffect, useState } from 'react';
import { useCollectionResource } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { T, S } from '../../styles.js';
import { Btn, Inp, Field, Card, Confirm, Modal } from '../../components/ui.jsx';
import { kioskPresence, modeChangeNote, visibleKiosks, PRESENCE_TICK_MS } from '../../lib/kioskPresence.js';

const copyToClipboard = async (text) => {
  try { await navigator.clipboard.writeText(text); }
  catch { /* clipboard unavailable (e.g. insecure context) -- the value is still visible to select and copy by hand */ }
};

const MODES = [['entrance', 'Entrance'], ['exit', 'Exit']];
const MODE_LABEL = Object.fromEntries(MODES);
const DOT = { online: T.present, offline: T.inkMuted, deactivated: 'transparent' };

// Re-renders on a timer so a kiosk that stops heartbeating turns Offline
// without a reload.
function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function StatusCell({ kiosk, now }) {
  const p = kioskPresence(kiosk, now);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', color: p.state === 'online' ? T.present : T.inkMuted }}>
      {p.state !== 'deactivated' && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: DOT[p.state] }} />}
      {p.label}
    </span>
  );
}

function ModeCell({ kiosk, busy, onChange }) {
  if (kiosk.active !== true) return <span style={{ color: T.inkMuted }}>—</span>;
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div role="group" aria-label={`Scan mode for ${kiosk.label}`} style={{ display: 'inline-flex', gap: 4 }}>
        {MODES.map(([value, label]) => (
          <Btn key={value} variant={kiosk.mode === value ? 'solid' : 'ghost'} aria-pressed={kiosk.mode === value}
            disabled={busy || kiosk.mode === value} onClick={() => onChange(value)}>{label}</Btn>
        ))}
      </div>
      <span style={{ fontSize: 11, color: T.inkMuted }}>{modeChangeNote(kiosk)}</span>
    </div>
  );
}

// Kiosk accounts are created here, not by hand in Firebase Auth: provisionKiosk
// (functions/src/handlers/kiosks.js) creates the Auth user AND the kiosks/{uid}
// allow-list doc in one call, so staff never needs a Firebase Auth UID.
export default function DevicesTab() {
  const action = useAsyncAction();
  const kiosksResource = useCollectionResource('kiosks');
  const kiosks = visibleKiosks(kiosksResource.data || []);
  const activeKiosks = kiosks.filter((k) => k.active === true);
  const now = useNow(PRESENCE_TICK_MS);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [confirmReset, setConfirmReset] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmAll, setConfirmAll] = useState(null); // 'entrance' | 'exit' | null
  const [credentials, setCredentials] = useState(null); // { label, email, password } | null

  const create = async () => {
    setBusy(true); setErr('');
    try {
      const { email, password } = await call.provisionKiosk({ label: label.trim() });
      setCredentials({ label: label.trim(), email, password });
      setLabel('');
    } catch (e) { setErr(e.message || 'Could not create the device.'); }
    setBusy(false);
  };
  const resetPassword = async (k) => {
    setErr('');
    try {
      const { email, password } = await call.resetKioskPassword({ uid: k.id });
      setCredentials({ label: k.label, email, password });
    } catch (e) { setErr(e.message || 'Could not reset the password.'); throw e; }
  };
  const deactivate = async (k) => { await call.deactivateKiosk({ uid: k.id, reason: 'Deactivated from SIMS' }); setConfirm(null); };
  const remove = async (k) => { await call.deleteKiosk({ uid: k.id }); setConfirmDelete(null); };
  const setMode = (uids, mode) => action.run('mode', () => call.setKioskMode({ uids, mode }));
  const setAll = async (mode) => { await call.setKioskMode({ uids: activeKiosks.map((k) => k.id), mode }); setConfirmAll(null); };

  if ([kiosksResource].some(r => r.loading || r.error)) return <ResourceState resources={[kiosksResource]}/>;

  return (
    <>
      <ActionFeedback action={action}/>
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={S.h2}>Add a new kiosk device</h2>
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>Name the gate. SIMS creates the device's sign-in and shows it to you once — copy it into that computer's <code>/setup</code> page.</p>
        {err && <div style={{ color: T.absent, fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--sims-form-columns, 1fr auto)', gap: 12, alignItems: 'end' }}>
          <Field label="Gate label (shown to parents)"><Inp value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main Gate" /></Field>
          <Btn onClick={() => action.run('create', create)} disabled={action.busy || busy || !label.trim()} style={{ marginBottom: 14 }}>{busy ? 'Creating…' : 'Create device'}</Btn>
        </div>
      </Card>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted, margin: 0 }}>
          Online means the kiosk page is open and connected. Entrance/Exit can also be changed on the kiosk itself; the latest change wins.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {MODES.map(([value, text]) => (
            <Btn key={value} variant="ghost" disabled={action.busy || activeKiosks.length === 0} onClick={() => setConfirmAll(value)}>
              Set all active kiosks to {text}
            </Btn>
          ))}
        </div>
      </div>
      <Card>
        <div className="sims-table-scroll" role="region" aria-label="Records" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.body, fontSize: 13 }}>
          <thead style={S.thead}><tr><th style={S.th}>Label</th><th style={S.th}>Status</th><th style={S.th}>Mode</th><th style={S.th}>Last seen</th><th style={S.th}></th></tr></thead>
          <tbody>
            {kiosks.map((k) => (
              <tr key={k.id}>
                <td style={S.td}>{k.label}</td>
                <td style={S.td}><StatusCell kiosk={k} now={now} /></td>
                <td style={S.td}><ModeCell kiosk={k} busy={action.busy} onChange={(mode) => setMode([k.id], mode)} /></td>
                <td style={S.td}>{k.lastSeenAt?.toDate ? k.lastSeenAt.toDate().toLocaleString() : '—'}</td>
                <td style={{ ...S.td, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {k.active
                    ? <>
                        <Btn variant="ghost" onClick={() => setConfirmReset(k)}>Reset password</Btn>
                        <Btn variant="ghost" onClick={() => setConfirm(k)}>Deactivate</Btn>
                      </>
                    : <Btn variant="ghost" onClick={() => action.run('action', () => call.registerKiosk({ uid: k.id, label: k.label }))}>Re-activate</Btn>}
                  <Btn variant="ghost-danger" onClick={() => setConfirmDelete(k)}>Delete</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
      {confirm && <Confirm message={`Deactivate "${confirm.label}"? The kiosk stops scanning within seconds.`} label="Deactivate" onYes={() => deactivate(confirm)} onNo={() => setConfirm(null)} />}
      {confirmDelete && (
        <Confirm
          title="Delete kiosk"
          message={`Delete "${confirmDelete.label}"? Its sign-in is removed for good and this can't be undone. Past scans keep its name.`}
          label="Delete"
          onYes={() => remove(confirmDelete)}
          onNo={() => setConfirmDelete(null)}
        />
      )}
      {confirmAll && (
        <Confirm
          title="Switch kiosks"
          message={`Switch ${activeKiosks.length} active kiosk${activeKiosks.length === 1 ? '' : 's'} to ${MODE_LABEL[confirmAll]}? They change within seconds, no refresh needed.`}
          label={`Switch to ${MODE_LABEL[confirmAll]}`}
          danger={false}
          onYes={() => setAll(confirmAll)}
          onNo={() => setConfirmAll(null)}
        />
      )}
      {confirmReset && (
        <Confirm
          message={`Reset the password for "${confirmReset.label}"? The device will be signed out within the hour and must be signed in again at /setup with the new password.`}
          label="Reset password"
          danger={false}
          onYes={async () => { await resetPassword(confirmReset); setConfirmReset(null); }}
          onNo={() => setConfirmReset(null)}
        />
      )}
      {credentials && (
        <Modal labelledBy="device-credentials-title" dismissible={false} onClose={() => {}}>
          <h2 id="device-credentials-title" style={S.h2}>{credentials.label} is ready</h2>
          <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>Copy these into that computer's <code>/setup</code> page now — the password won't be shown again.</p>
          <Field label="Device email">
            <div style={{ display: 'flex', gap: 8 }}>
              <Inp readOnly value={credentials.email} onFocus={(e) => e.target.select()} />
              <Btn variant="ghost" onClick={() => copyToClipboard(credentials.email)}>Copy</Btn>
            </div>
          </Field>
          <Field label="Password">
            <div style={{ display: 'flex', gap: 8 }}>
              <Inp readOnly value={credentials.password} onFocus={(e) => e.target.select()} style={{ ...T.num }} />
              <Btn variant="ghost" onClick={() => copyToClipboard(credentials.password)}>Copy</Btn>
            </div>
          </Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn onClick={() => setCredentials(null)}>Done</Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
```

- [ ] **Step 2: Hide deleted kiosks in the Scan log Device filter**

In `src/pages/guardians/ScanLogTab.jsx` add the import:

```js
import { visibleKiosks } from '../../lib/kioskPresence.js';
```

and on line 55 change `{kiosks.map((k) => <option …` to `{visibleKiosks(kiosks).map((k) => <option …`. Leave line 69's name lookup on the full `kiosks` list so old rows keep their gate name.

- [ ] **Step 3: Lint, unit tests and build**

Run: `npm test; npm run build`
Expected: all tests PASS, build succeeds.

- [ ] **Step 4: Browser check on the emulator**

Follow the emulator browser check notes (demo project, App Check placeholder, alternate ports). Seed four `kiosks` docs: one active with `lastSeenAt` now and `mode: 'exit', modeChangedBy: 'kiosk'`; one active with `lastSeenAt` 2 hours ago and no mode; one `active: false`; one `deleted: true`. Seed one `scan_events` row from the deleted kiosk. Sign in as an admin and open Guardians → Kiosk devices. Check:
- The first kiosk shows a green "Online" with "changed at the kiosk, …"; the second shows "Offline · last seen 2h ago" and "not reported yet"; the third shows "Deactivated" and "—"; the deleted kiosk is not listed.
- Clicking Entrance on the first row updates the note to "changed by <admin name>, …".
- "Set all active kiosks to Exit" confirms "Switch 2 active kiosks to Exit?" and switches both.
- Deleting the third kiosk removes it from the list. In Scan log, the deleted kiosk is missing from the Device filter but its old row still shows its name.
- Light and dark theme, and narrow width (table scrolls horizontally).

- [ ] **Step 5: Commit**

```bash
git add src/pages/guardians/DevicesTab.jsx src/pages/guardians/ScanLogTab.jsx
git commit -m "feat(kiosks): online status, remote Entrance/Exit and delete in Kiosk devices"
```

---

### Task 6: Kiosk app — heartbeat and two-way mode sync

**Repo:** `bnhs-student-kiosk`, in a new worktree. Paths below are relative to that worktree.

**Files:**
- Create: `src/lib/kioskMode.js`
- Test: `src/lib/kioskMode.test.js`
- Modify: `src/App.jsx:1-2,47-67,79-82`

**Interfaces:**
- Consumes: rules from Task 3 (kiosk may write `mode`, `modeChangedAt == request.time`, `modeChangedBy: 'kiosk'`); SIMS writes the same fields via `setKioskModeFn`.
- Produces: `MODES`, `HEARTBEAT_MS = 120000`, `isMode(v)`, `resolveMode(remote, local) => 'entrance'|'exit'`, `kioskModeWrite(mode, timestamp) => { mode, modeChangedAt, modeChangedBy: 'kiosk' }`.

- [ ] **Step 1: Create the kiosk worktree**

```bash
cd "C:/Users/jitsb/OneDrive - Department of Education/Desktop/APPS/bnhs-student-kiosk"
git fetch origin
git worktree add -b claude/kiosk-remote-mode ../bnhs-student-kiosk-remote-mode origin/master
cd ../bnhs-student-kiosk-remote-mode
npm ci
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/kioskMode.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { HEARTBEAT_MS, isMode, resolveMode, kioskModeWrite } from './kioskMode.js';

describe('kioskMode', () => {
  it('heartbeats every 2 minutes', () => { expect(HEARTBEAT_MS).toBe(120_000); });
  it('accepts only entrance and exit', () => {
    expect(isMode('entrance')).toBe(true);
    expect(isMode('exit')).toBe(true);
    expect(isMode('Exit')).toBe(false);
    expect(isMode(undefined)).toBe(false);
  });
  it('prefers the kiosk doc, then the saved local mode, then entrance', () => {
    expect(resolveMode('exit', 'entrance')).toBe('exit');
    expect(resolveMode(undefined, 'exit')).toBe('exit');
    expect(resolveMode('bogus', 'exit')).toBe('exit');
    expect(resolveMode(undefined, null)).toBe('entrance');
  });
  it('builds the write the Firestore rule expects', () => {
    const at = { sentinel: true };
    expect(kioskModeWrite('exit', at)).toEqual({ mode: 'exit', modeChangedAt: at, modeChangedBy: 'kiosk' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/kioskMode.test.js`
Expected: FAIL — cannot resolve `./kioskMode.js`.

- [ ] **Step 4: Implement the helper**

Create `src/lib/kioskMode.js`:

```js
// Entrance/Exit can be changed on this kiosk OR from SIMS (setKioskModeFn).
// Both write kiosks/{uid}.mode; whichever lands last wins, and this kiosk
// adopts the doc's value live through useKioskDevice's snapshot listener.
export const MODES = ['entrance', 'exit'];
// SIMS shows a kiosk as Online while lastSeenAt is under 5 minutes old.
export const HEARTBEAT_MS = 120_000;

export const isMode = (v) => MODES.includes(v);

export const resolveMode = (remote, local) => (isMode(remote) ? remote : isMode(local) ? local : 'entrance');

// Must match firestore.rules: modeChangedBy 'kiosk', modeChangedAt == request.time.
export const kioskModeWrite = (mode, timestamp) => ({ mode, modeChangedAt: timestamp, modeChangedBy: 'kiosk' });
```

Run: `npx vitest run src/lib/kioskMode.test.js` — Expected: PASS.

- [ ] **Step 5: Wire it into `App.jsx`**

Change the firestore import (line 2) to:

```js
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
```

and add:

```js
import { HEARTBEAT_MS, isMode, resolveMode, kioskModeWrite } from './lib/kioskMode.js';
```

Below `const MODE_STORAGE_KEY = 'bnhs-kiosk-mode';` add:

```js
const readLocalMode = () => { try { return localStorage.getItem(MODE_STORAGE_KEY); } catch { return null; } };
// Mode still updates in memory if persistence fails (e.g. localStorage
// blocked by device policy) -- better to keep the kiosk usable.
const writeLocalMode = (mode) => { try { localStorage.setItem(MODE_STORAGE_KEY, mode); } catch { /* see above */ } };
```

Replace the existing `mode` state and `setMode` callback (the block from `const [mode, setModeState] = useState(() => {` through the end of `const setMode = useCallback(…, []);`) with only:

```js
  const [mode, setModeState] = useState(() => resolveMode(undefined, readLocalMode()));
```

Keep the comment above it, and append one line to that comment: `// The kiosks/{uid} doc's mode (set here or from SIMS) wins once it loads.`

Replace the existing one-shot heartbeat effect

```js
  useEffect(() => {
    if (!device) return;
    setDoc(doc(db, 'kiosks', device.id), { lastSeenAt: serverTimestamp() }, { merge: true }).catch(() => {});
  }, [device?.id]);
```

with:

```js
  // Heartbeat: SIMS shows this kiosk Online while lastSeenAt is fresh.
  useEffect(() => {
    if (!device?.id) return;
    const ref = doc(db, 'kiosks', device.id);
    const beat = () => setDoc(ref, { lastSeenAt: serverTimestamp() }, { merge: true }).catch(() => {});
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [device?.id]);

  // Toggle tap: switch now, remember locally, and tell SIMS. Writes made
  // offline queue in the persistent cache and land on reconnect.
  const setMode = useCallback((next) => {
    setModeState(next);
    writeLocalMode(next);
    if (device?.id) updateDoc(doc(db, 'kiosks', device.id), kioskModeWrite(next, serverTimestamp())).catch(() => {});
  }, [device?.id]);

  // Remote change (from SIMS, or this kiosk's own write echoing back):
  // adopt it live, no reload.
  const remoteMode = device?.mode;
  useEffect(() => {
    if (!isMode(remoteMode)) return;
    setModeState(remoteMode);
    writeLocalMode(remoteMode);
  }, [remoteMode]);

  // First run after rollout: the doc has no mode yet, so report the local
  // one instead of letting anything flip.
  const backfilledRef = useRef(null);
  useEffect(() => {
    if (!device?.id || isMode(device.mode) || backfilledRef.current === device.id) return;
    backfilledRef.current = device.id;
    updateDoc(doc(db, 'kiosks', device.id), kioskModeWrite(mode, serverTimestamp())).catch(() => {});
  }, [device?.id, device?.mode, mode]);
```

`KioskStage` keeps receiving `mode={mode} onModeChange={setMode}` unchanged, so the toggle stays visible and moves when SIMS changes it. `handleScan` keeps reading `dataRef.current.mode`, so a scan in flight keeps the mode it started with.

- [ ] **Step 6: Run the kiosk test suite and build**

Run: `npm test; npm run build`
Expected: all tests PASS, build succeeds.

- [ ] **Step 7: Staging check against the new rules**

Point staging at this plan's SIMS worktree rules, then start it:

```powershell
$env:BNHS_SIMS_DIR = "C:\Users\jitsb\OneDrive - Department of Education\Desktop\APPS\bnhs-sims\.claude\worktrees\kiosk-management-remote-565acd"; npm run staging
```

Stop any running bnhs-sims emulators first (shared ports 8080/9099/4000/5173). Stop only this staging process afterwards, by its own task, never by killing every node process. In the Emulator UI (`:4000`) → Firestore → `kiosks/<staging kiosk uid>`:
- Within a few seconds of load, the doc gains `mode` (back-fill, `modeChangedBy: 'kiosk'`) and `lastSeenAt`.
- Tapping Exit on the kiosk updates `mode: 'exit'` and `modeChangedAt`.
- Editing `mode` to `entrance` in the Emulator UI flips the kiosk toggle to Entrance with no reload. A test scan (LRN `999900000001`) then records a Time In.
- No permission errors in the kiosk browser console.

- [ ] **Step 8: Commit**

```bash
git add src/lib/kioskMode.js src/lib/kioskMode.test.js src/App.jsx
git commit -m "feat(kiosk): heartbeat and two-way Entrance/Exit sync with SIMS"
```

---

### Task 7: Full verification and handoff

- [ ] **Step 1: Full SIMS test run**

Run in this worktree: `npm run test:all`
Expected: SIMS, functions, parent, rules and functions-emulator suites all PASS.

- [ ] **Step 2: Kiosk suite**

Run in the kiosk worktree: `npm test`
Expected: PASS.

- [ ] **Step 3: Record what's ready for release**

Report to the user: SIMS branch and kiosk branch names, test results, and what the browser and staging checks showed. Release order (done with the user, following the SIMS release recipe and the kiosk release flow, not part of this plan): (1) functions `deleteKioskFn`, `setKioskModeFn`, `registerKioskFn` plus the rules change layered onto the current live ruleset; (2) SIMS hosting through the documented release preparation; (3) kiosk `hosting:kiosk`, then one refresh per kiosk.
