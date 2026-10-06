# Announcements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff publish announcements from the SIMS app (school-wide or by grade, optionally with a push) and verified guardians read them in a new **Notices** tab of the Parents Portal.

**Architecture:** One `announcements` Firestore collection that staff write directly (scope enforced by `firestore.rules`). Cloud Functions keep a server-only `guardians/{uid}.audienceKeys` list, send at-most-once pushes, write the audit log, and run a 5-minute job that publishes scheduled posts and expires old ones. Guardians read through a rules-checked `array-contains-any` query on their own keys.

**Tech Stack:** React 19 + Vite (SIMS `src/`, portal `parent/`), Firebase JS SDK 12, Cloud Functions v2 (Node 22, `asia-southeast1`), firebase-admin 13, Vitest 4, `@firebase/rules-unit-testing` 5, Firestore emulator.

**Spec:** `docs/superpowers/specs/2026-10-05-announcements-design.md`

## Global Constraints

- Audience values: `audienceKeys` is `['all']` alone, or a non-empty sorted list drawn from `['g7','g8','g9','g10','g11','g12']`. Never `'all'` mixed with grades.
- Limits: title 1–120 chars, body 1–5,000 chars, at most **3** pinned posts (published or scheduled), parent list `limit(50)`, unread-dot query `limit(1)`.
- Post statuses: `scheduled` → `published` → `unpublished` | `expired`. Only Functions write `pushedAt` and `pushResult`. `pushResult.status` is one of `sending`, `sent`, `failed`, `skipped_paused`, `interrupted`.
- Scope: admin = any audience incl. `all`; `jhs_coord` = g7–g10; `shs_coord` = g11–g12; `glc` = own grade only. `firestore.rules` `postKeysInScope()` and `shared/announcements.js` `coversPostKeys()` must stay in step.
- Times are Philippine time (`Asia/Manila`, `+08:00`). "Expires on" a date ends the post at 23:59:59.999 that day.
- Push payload title is exactly `BNHS announcement`; body is the post title; link is `${PORTAL_URL}/announcements/${id}`.
- Push chunk size 500 (FCM multicast limit). A `sending` claim older than 10 minutes becomes `interrupted` and is never resent.
- Parent-portal strings live only in `parent/src/strings.js`, in English, and must not contain the substrings `location`, `tracking` or `live` (enforced by `parent/src/lib/strings.test.js` — beware words like "deliver", "olive", "alive").
- Parent portal tab label: **Notices**; page title: **Announcements**; routes `/announcements` and `/announcements/:id`.
- Never create a `guardians/{uid}` document from Functions code that maintains audience keys — the portal treats that document's existence as "activated".
- Git: commit after every task with a conventional message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never use bare `git stash`.
- Deploying from this machine needs the IPv4-first + longer functions-discovery-timeout setup used for earlier deploys (see the project memory "Firebase deploy from this machine").

### Settled during planning (differences from the spec text)

1. **The `hasAny` rules risk is resolved.** A scratch emulator test on 2026-10-05 confirmed a guardian's `where('audienceKeys','array-contains-any', myKeys).where('status','==','published').orderBy('publishedAt','desc').limit(50)` query is allowed under `resource.data.audienceKeys.hasAny(get(guardian).audienceKeys)`, and a query for another grade is denied. The spec's per-key fallback is not needed. Task 2's rules tests lock this in.
2. **The confirm-dialog guardian count uses a staff callable** (`announcementAudienceCountFn`), not a client `count()`. Coordinators are not allowed to read `guardians` (it holds emails), so a client aggregation would be denied for them.
3. **The backfill script lives at `functions/scripts/backfillGuardianAudience.mjs`**, next to the existing `backfillUserRoles.mjs`, not in the root `scripts/` folder.
4. **Audit actor** comes from the trigger's auth context (`onDocumentWrittenWithAuthContext`, as `onLegacyAttendanceScan` already does): `authId` is the staff uid for client writes; `service_account` writes (the publish job) are logged as `system`.
5. **Parent audience wording** is "For all parents" / "For parents in Grade 7" / "For parents in Grades 7 and 8", which reads better for several grades than the spec's "For Grade 7 parents".
6. **The collection-group devices query** (`collectionGroup('devices').where('enabled','==',true)`) needs a new single-field index override in `firestore.indexes.json` (Task 2).

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `shared/announcements.js` (+ `.test.js`) | new | Pure helpers shared by SIMS, portal and Functions: audience keys, scope, visibility, Manila times |
| `firestore.rules` | modify | `announcements` rules; two new guardian self-editable fields |
| `firestore.indexes.json` | modify | Four `announcements` composite indexes; `devices.enabled` collection-group override |
| `tests/rules/announcements.test.js` | new | Rules tests for every read/write path |
| `functions/src/handlers/push.js` (+ test) | modify | Extract `applyVerdicts()` shared by scan and announcement pushes |
| `functions/src/lib/pushPayload.js` (+ test) | modify | `announcementPayload()` |
| `functions/src/handlers/guardianAudience.js` | new | `refreshGuardianAudience()`, `handleGuardianLinkWrite()` |
| `functions/src/handlers/scheduled.js` | modify | `expireLinks` refreshes every visited guardian's keys |
| `functions/src/handlers/announcements.js` (+ unit test) | new | Audit, push fan-out, publish job, audience-count callable |
| `functions/index.js` | modify | Four new exports |
| `functions/scripts/backfillGuardianAudience.mjs` | new | One-time rollout backfill |
| `functions/test/emulator/guardianAudience.test.js` | new | Emulator tests for audience keys |
| `functions/test/emulator/announcements.test.js` | new | Emulator tests for push, audit, job, count |
| `src/lib/announcements.js` (+ test) | new | SIMS tab/sort/label/validation helpers |
| `src/data/announcements.js` | new | SIMS Firestore writes + count callable |
| `src/pages/AnnouncementsPage.jsx` | new | List with tabs, actions |
| `src/pages/announcements/AnnouncementForm.jsx` | new | Create/edit modal |
| `src/lib/navigation.js`, `src/lib/access.js` (+ test), `src/components/NavIcon.jsx`, `src/App.jsx` | modify | Nav item, coordinator access, icon, route |
| `parent/src/lib/announcements.js` (+ test) | new | linkify, audience text, list split, unread, date label |
| `parent/src/strings.js` | modify | New strings |
| `parent/src/hooks/useAnnouncements.js` | new | The rules-shaped query |
| `parent/src/lib/nav.js` (+ test), `parent/src/lib/router.js` (+ test) | modify | Notices tab and routes |
| `parent/src/components/Icon.jsx`, `parent/src/components/Shell.jsx`, `parent/src/glass.css` | modify | Megaphone icon, unread dot |
| `parent/src/screens/Announcements.jsx`, `parent/src/screens/AnnouncementDetail.jsx` | new | List and detail screens |
| `parent/src/screens/Settings.jsx`, `parent/src/App.jsx` | modify | Announcement push switch; routes, Shell profile, foreground push |
| `docs/parent-portal-runbook.md`, `docs/guardian-account-guide.md` | modify | Rollout docs |

## Commands

Run everything from the worktree root. Install once per worktree (the worktree starts with no `node_modules`):

```bash
npm install && npm --prefix functions install && npm --prefix parent install
```

- SIMS + shared unit tests: `npm test`
- Functions unit tests: `npm --prefix functions test`
- Portal unit tests: `npm --prefix parent test`
- Rules tests (needs Java; starts the Firestore emulator): `npm run test:rules`
- Functions emulator tests: `npm run test:functions`
- Everything: `npm run test:all`

---

### Task 1: Shared announcement helpers

**Files:**
- Create: `shared/announcements.js`
- Test: `shared/announcements.test.js`

**Interfaces:**
- Consumes: `ALL_GRADES`, `roleOf`, `scopedGrades` from `shared/staffRoles.js`.
- Produces (all named exports of `shared/announcements.js`):
  - `TITLE_MAX = 120`, `BODY_MAX = 5000`, `MAX_PINNED = 3`, `ALL_KEY = 'all'`, `POST_KEYS` (array `['all','g7',…,'g12']`)
  - `gradeKey(g: number): string` → `'g7'`
  - `postAudienceKeys(audience: {all?: true, grades?: number[]}): string[]`
  - `audienceKeysFor(grades: number[]): string[]` — guardian keys; `[]` when no grades
  - `canPostToAll(profile): boolean`, `postableGrades(profile): number[]`, `coversPostKeys(profile, keys: string[]): boolean`
  - `toMillis(t: Timestamp|Date|number|null|undefined): number|null`
  - `isVisibleToParents(post, nowMs: number): boolean`
  - `manilaDateTime(date: 'YYYY-MM-DD', time: 'HH:MM'): Date`, `endOfManilaDay(date: 'YYYY-MM-DD'): Date`

- [ ] **Step 1: Write the failing test**

Create `shared/announcements.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  MAX_PINNED, POST_KEYS, gradeKey, postAudienceKeys, audienceKeysFor, canPostToAll, postableGrades,
  coversPostKeys, toMillis, isVisibleToParents, manilaDateTime, endOfManilaDay,
} from './announcements.js';

const admin = { role: 'admin' }, legacy = { role: 'registrar' }, jhs = { role: 'jhs_coord' }, shs = { role: 'shs_coord' }, glc8 = { role: 'glc', gradeLevel: 8 };

describe('audience keys', () => {
  it('stores all parents as the single key all', () => {
    expect(postAudienceKeys({ all: true })).toEqual(['all']);
    expect(postAudienceKeys({ all: true, grades: [7] })).toEqual(['all']);
  });
  it('stores grades as sorted, unique g-keys and drops unknown grades', () => {
    expect(postAudienceKeys({ grades: [11, 7, 7, '8', 13] })).toEqual(['g7', 'g8', 'g11']);
    expect(postAudienceKeys({ grades: [] })).toEqual([]);
    expect(postAudienceKeys(undefined)).toEqual([]);
    expect(gradeKey(12)).toBe('g12');
    expect(POST_KEYS).toEqual(['all', 'g7', 'g8', 'g9', 'g10', 'g11', 'g12']);
  });
  it('gives a guardian all plus their grades, or nothing without a grade', () => {
    expect(audienceKeysFor([11, 7])).toEqual(['all', 'g7', 'g11']);
    expect(audienceKeysFor([])).toEqual([]);
  });
});

describe('scope', () => {
  it('lets only administrators post to everyone', () => {
    expect(canPostToAll(admin)).toBe(true);
    expect(canPostToAll(legacy)).toBe(true);
    expect(canPostToAll(jhs)).toBe(false);
  });
  it('lists the grades each role may address', () => {
    expect(postableGrades(admin)).toEqual([7, 8, 9, 10, 11, 12]);
    expect(postableGrades(jhs)).toEqual([7, 8, 9, 10]);
    expect(postableGrades(shs)).toEqual([11, 12]);
    expect(postableGrades(glc8)).toEqual([8]);
  });
  it('checks keys against the role, mirroring postKeysInScope() in the rules', () => {
    expect(coversPostKeys(admin, ['all'])).toBe(true);
    expect(coversPostKeys(admin, ['g12'])).toBe(true);
    expect(coversPostKeys(jhs, ['g7', 'g10'])).toBe(true);
    expect(coversPostKeys(jhs, ['g11'])).toBe(false);
    expect(coversPostKeys(jhs, ['all'])).toBe(false);
    expect(coversPostKeys(shs, ['g12'])).toBe(true);
    expect(coversPostKeys(glc8, ['g8'])).toBe(true);
    expect(coversPostKeys(glc8, ['g8', 'g9'])).toBe(false);
    expect(coversPostKeys(admin, [])).toBe(false);
    expect(coversPostKeys({ role: 'teacher' }, ['g7'])).toBe(false);
  });
});

describe('time and visibility', () => {
  it('reads Timestamps, Dates, numbers and nulls as milliseconds', () => {
    expect(toMillis({ toMillis: () => 42 })).toBe(42);
    expect(toMillis(new Date(5))).toBe(5);
    expect(toMillis(7)).toBe(7);
    expect(toMillis(null)).toBeNull();
    expect(toMillis(undefined)).toBeNull();
  });
  it('shows only published posts that have not expired', () => {
    const now = 1_000;
    expect(isVisibleToParents({ status: 'published', expiresAt: null }, now)).toBe(true);
    expect(isVisibleToParents({ status: 'published', expiresAt: new Date(2_000) }, now)).toBe(true);
    expect(isVisibleToParents({ status: 'published', expiresAt: new Date(1_000) }, now)).toBe(false);
    expect(isVisibleToParents({ status: 'scheduled', expiresAt: null }, now)).toBe(false);
    expect(isVisibleToParents({ status: 'unpublished' }, now)).toBe(false);
  });
  it('builds Philippine times', () => {
    expect(manilaDateTime('2026-10-05', '07:30').toISOString()).toBe('2026-10-04T23:30:00.000Z');
    expect(endOfManilaDay('2026-10-05').toISOString()).toBe('2026-10-05T15:59:59.999Z');
    expect(MAX_PINNED).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/announcements.test.js`
Expected: FAIL — `Failed to resolve import "./announcements.js"`.

- [ ] **Step 3: Write the implementation**

Create `shared/announcements.js`:

```js
// Pure announcement helpers shared by the SIMS (src/), the Parents Portal
// (parent/) and Cloud Functions (functions/, copied by scripts/syncShared.mjs).
// Spec: docs/superpowers/specs/2026-10-05-announcements-design.md
import { ALL_GRADES, roleOf, scopedGrades } from './staffRoles.js';

export const TITLE_MAX = 120;
export const BODY_MAX = 5000;
export const MAX_PINNED = 3;
export const ALL_KEY = 'all';
export const gradeKey = (g) => `g${g}`;
export const POST_KEYS = [ALL_KEY, ...ALL_GRADES.map(gradeKey)];

// The keys stored on a post: ['all'] for everyone, else its grades as g-keys.
export function postAudienceKeys(audience) {
  if (audience?.all) return [ALL_KEY];
  const grades = [...new Set((audience?.grades || []).map(Number))]
    .filter((g) => ALL_GRADES.includes(g))
    .sort((a, b) => a - b);
  return grades.map(gradeKey);
}

// The keys stored on a guardian: school-wide posts plus their learners'
// grades. A guardian without a graded learner sees nothing.
export function audienceKeysFor(grades) {
  const keys = postAudienceKeys({ grades });
  return keys.length ? [ALL_KEY, ...keys] : [];
}

export const canPostToAll = (profile) => roleOf(profile) === 'admin';
export const postableGrades = (profile) => scopedGrades(profile) ?? ALL_GRADES;

// Mirrors postKeysInScope() in firestore.rules -- keep the two in step.
export function coversPostKeys(profile, keys) {
  if (!roleOf(profile) || !keys?.length) return false;
  if (canPostToAll(profile)) return true;
  const allowed = postableGrades(profile).map(gradeKey);
  return keys.every((k) => allowed.includes(k));
}

export function toMillis(t) {
  if (t == null) return null;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t instanceof Date) return t.getTime();
  return Number(t);
}

// Published and not past its expiry -- the publish job can run late, so
// readers check expiresAt themselves too.
export function isVisibleToParents(post, nowMs) {
  if (post?.status !== 'published') return false;
  const ends = toMillis(post.expiresAt);
  return ends == null || ends > nowMs;
}

export const manilaDateTime = (date, time) => new Date(`${date}T${time}:00+08:00`);
export const endOfManilaDay = (date) => new Date(`${date}T23:59:59.999+08:00`);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared/announcements.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/announcements.js shared/announcements.test.js
git commit -m "feat(announcements): shared audience, scope and time helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Firestore rules and indexes

**Files:**
- Modify: `firestore.rules` (guardians block ~line 145; new block before `// ---------- staff-only records written by Functions ----------`)
- Modify: `firestore.indexes.json`
- Create: `tests/rules/announcements.test.js`

**Interfaces:**
- Consumes: existing rules helpers `isStaff()`, `isAdmin()`, `role()`, `profile()`, `isGuardian()`, `own()`, `bounded()`, `affectedOnly()`.
- Produces: the document contract every later task writes against (field list in the spec's data-model table). Guardians may now update `announcementsSeenAt` and `announcementPushEnabled` on their own profile.

- [ ] **Step 1: Write the failing rules tests**

Create `tests/rules/announcements.test.js`:

```js
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { setup, seed, seedBaseline, as, ok, denied, STAFF, KIOSK, JHS, SHS, GLC8, GUARDIAN_A, GUARDIAN_B } from './helpers.js';

const now = () => firebase.firestore.FieldValue.serverTimestamp();
const tomorrow = () => new Date(Date.now() + 86_400_000);
const yesterday = () => new Date(Date.now() - 86_400_000);
const by = (who) => ({ uid: who.uid, name: 'Staff' });
const grades = (...g) => ({ audience: { grades: g }, audienceKeys: g.map((x) => `g${x}`) });

// A post as it sits in Firestore (seeded with rules off).
const stored = (over = {}) => ({
  title: 'Brigada Eskwela', body: 'Bring cleaning materials.', audience: { all: true }, audienceKeys: ['all'],
  status: 'published', publishAt: new Date(), publishedAt: new Date(), expiresAt: null, pinned: false, push: false,
  createdBy: { uid: 'staff1', name: 'R' }, updatedBy: { uid: 'staff1', name: 'R' }, createdAt: new Date(), updatedAt: new Date(), ...over,
});
const storedScheduled = (over = {}) => { const d = stored({ status: 'scheduled', publishAt: tomorrow(), ...over }); delete d.publishedAt; return d; };

// A post as SIMS creates it ("Publish now").
const draft = (who, over = {}) => ({
  title: 'Class suspension', body: 'No classes tomorrow.', audience: { all: true }, audienceKeys: ['all'],
  status: 'published', publishAt: now(), publishedAt: now(), expiresAt: null, pinned: false, push: true,
  createdBy: by(who), updatedBy: by(who), createdAt: now(), updatedAt: now(), ...over,
});
const scheduledDraft = (who, over = {}) => { const d = draft(who, { status: 'scheduled', publishAt: tomorrow(), ...over }); delete d.publishedAt; return d; };
const touch = (who) => ({ updatedBy: by(who), updatedAt: now() });

const guardianQuery = (who, keys, n = 50) => as(env, who).collection('announcements')
  .where('audienceKeys', 'array-contains-any', keys).where('status', '==', 'published')
  .orderBy('publishedAt', 'desc').limit(n);

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await seedBaseline(env);
  await seed(env, async (db) => {
    await db.doc('users/jhs@bnhs.edu').set({ name: 'JHS', role: 'jhs_coord', gradeLevel: null, disabled: false });
    await db.doc('users/shs@bnhs.edu').set({ name: 'SHS', role: 'shs_coord', gradeLevel: null, disabled: false });
    await db.doc('users/glc8@bnhs.edu').set({ name: 'G8', role: 'glc', gradeLevel: 8, disabled: false });
    await db.doc('guardians/gA').set({ audienceKeys: ['all', 'g7'] }, { merge: true });
    await db.doc('guardians/gB').set({ audienceKeys: [] }, { merge: true });
    await db.doc('announcements/pAll').set(stored());
    await db.doc('announcements/p7').set(stored(grades(7)));
    await db.doc('announcements/p12').set(stored(grades(12)));
    await db.doc('announcements/pSched').set(storedScheduled());
    await db.doc('announcements/pGone').set(stored({ status: 'unpublished' }));
  });
});

describe('guardians read', () => {
  it('lists published posts for their own keys, bounded', async () => {
    await ok(guardianQuery(GUARDIAN_A, ['all', 'g7']).get());
    await ok(guardianQuery(GUARDIAN_A, ['g7'], 1).get());
    await denied(guardianQuery(GUARDIAN_A, ['all', 'g7'], 51).get());
    await denied(as(env, GUARDIAN_A).collection('announcements').where('audienceKeys', 'array-contains-any', ['all', 'g7']).where('status', '==', 'published').get());
  });
  it('cannot list another grade, unpublished posts, or anything without keys', async () => {
    await denied(guardianQuery(GUARDIAN_A, ['g12']).get());
    await denied(as(env, GUARDIAN_A).collection('announcements').where('audienceKeys', 'array-contains-any', ['all', 'g7']).limit(50).get());
    await denied(guardianQuery(GUARDIAN_B, ['all']).get());
  });
  it('gets one post only when it is published and theirs', async () => {
    await ok(as(env, GUARDIAN_A).doc('announcements/p7').get());
    await ok(as(env, GUARDIAN_A).doc('announcements/pAll').get());
    await denied(as(env, GUARDIAN_A).doc('announcements/p12').get());
    await denied(as(env, GUARDIAN_A).doc('announcements/pSched').get());
    await denied(as(env, GUARDIAN_A).doc('announcements/pGone').get());
    await denied(as(env, KIOSK).doc('announcements/pAll').get());
  });
  it('never writes posts', async () => {
    await denied(as(env, GUARDIAN_A).collection('announcements').add(draft(GUARDIAN_A)));
    await denied(as(env, GUARDIAN_A).doc('announcements/p7').update({ title: 'x' }));
  });
});

describe('guardian profile fields', () => {
  it('updates the unread marker and the announcement switch, never its keys', async () => {
    await ok(as(env, GUARDIAN_A).doc('guardians/gA').update({ announcementsSeenAt: now(), announcementPushEnabled: false }));
    await denied(as(env, GUARDIAN_A).doc('guardians/gA').update({ audienceKeys: ['all', 'g7', 'g12'] }));
  });
});

describe('staff read', () => {
  it('every staff member reads every post', async () => {
    await ok(as(env, STAFF).collection('announcements').get());
    await ok(as(env, JHS).doc('announcements/p12').get());
    await ok(as(env, GLC8).collection('announcements').get());
  });
});

describe('staff create', () => {
  it('administrators publish to everyone or any grade, now or later', async () => {
    await ok(as(env, STAFF).collection('announcements').add(draft(STAFF)));
    await ok(as(env, STAFF).collection('announcements').add(draft(STAFF, grades(7, 12))));
    await ok(as(env, STAFF).collection('announcements').add(scheduledDraft(STAFF)));
  });
  it('coordinators publish only inside their grades and never to everyone', async () => {
    await ok(as(env, JHS).collection('announcements').add(draft(JHS, grades(7, 8))));
    await denied(as(env, JHS).collection('announcements').add(draft(JHS, grades(11))));
    await denied(as(env, JHS).collection('announcements').add(draft(JHS)));
    await ok(as(env, SHS).collection('announcements').add(draft(SHS, grades(12))));
    await denied(as(env, SHS).collection('announcements').add(draft(SHS, grades(9))));
    await ok(as(env, GLC8).collection('announcements').add(draft(GLC8, grades(8))));
    await denied(as(env, GLC8).collection('announcements').add(draft(GLC8, grades(7))));
    await denied(as(env, GLC8).collection('announcements').add(draft(GLC8, grades(8, 9))));
  });
  it('rejects malformed posts', async () => {
    const add = (d) => as(env, STAFF).collection('announcements').add(d);
    await denied(add(draft(STAFF, { audienceKeys: ['all', 'g7'] })));
    await denied(add(draft(STAFF, { audienceKeys: [] })));
    await denied(add(draft(STAFF, { audienceKeys: ['g13'] })));
    await denied(add(draft(STAFF, { title: 'x'.repeat(121) })));
    await denied(add(draft(STAFF, { body: '' })));
    await denied(add(draft(STAFF, { extra: 1 })));
    await denied(add(draft(STAFF, { pushedAt: now() })));
    await denied(add(draft(STAFF, { pushResult: { status: 'sent' } })));
    await denied(add(draft(STAFF, { editedAt: now() })));
    await denied(add(draft(STAFF, { createdBy: { uid: 'someoneElse', name: 'X' } })));
    await denied(add(draft(STAFF, { publishAt: tomorrow() })));          // "published" must be now
    await denied(add(scheduledDraft(STAFF, { publishAt: yesterday() })));  // scheduled must be future
    await denied(add({ ...scheduledDraft(STAFF), publishedAt: now() }));
  });
});

describe('staff update', () => {
  it('edits a live post\'s wording, pin and expiry; marks editedAt now', async () => {
    const ref = as(env, STAFF).doc('announcements/pAll');
    await ok(ref.update({ title: 'Brigada Eskwela 2026', editedAt: now(), ...touch(STAFF) }));
    await ok(ref.update({ pinned: true, expiresAt: tomorrow(), ...touch(STAFF) }));
    await denied(ref.update({ editedAt: yesterday(), ...touch(STAFF) }));
  });
  it('locks a live post\'s audience, push and server fields', async () => {
    const ref = as(env, STAFF).doc('announcements/p7');
    await denied(ref.update({ ...grades(7, 8), ...touch(STAFF) }));
    await denied(ref.update({ push: true, ...touch(STAFF) }));
    await denied(ref.update({ pushedAt: now(), ...touch(STAFF) }));
    await denied(ref.update({ publishedAt: now(), ...touch(STAFF) }));
    await denied(ref.update({ title: 'no touch' }));                     // updatedAt/updatedBy required
  });
  it('unpublishes a live post and nothing else in the same write', async () => {
    await ok(as(env, STAFF).doc('announcements/pAll').update({ status: 'unpublished', ...touch(STAFF) }));
    await denied(as(env, STAFF).doc('announcements/p7').update({ status: 'unpublished', title: 'x', ...touch(STAFF) }));
    await denied(as(env, STAFF).doc('announcements/pGone').update({ status: 'published', ...touch(STAFF) }));
  });
  it('edits every field of a scheduled post while it stays in the future', async () => {
    const ref = as(env, STAFF).doc('announcements/pSched');
    await ok(ref.update({ ...grades(9), push: true, publishAt: tomorrow(), title: 'Moved', ...touch(STAFF) }));
    await denied(ref.update({ publishAt: yesterday(), ...touch(STAFF) }));
    await denied(ref.update({ status: 'published', ...touch(STAFF) }));
    await denied(ref.update({ editedAt: now(), ...touch(STAFF) }));
  });
  it('keeps coordinators inside their grades on update', async () => {
    await ok(as(env, JHS).doc('announcements/p7').update({ title: 'Grade 7 assembly', editedAt: now(), ...touch(JHS) }));
    await denied(as(env, JHS).doc('announcements/pAll').update({ status: 'unpublished', ...touch(JHS) }));
    await denied(as(env, GLC8).doc('announcements/p7').update({ title: 'x', editedAt: now(), ...touch(GLC8) }));
  });
});

describe('staff delete', () => {
  it('deletes only scheduled posts in scope', async () => {
    await denied(as(env, JHS).doc('announcements/pSched').delete());       // school-wide
    await ok(as(env, STAFF).doc('announcements/pSched').delete());
    await denied(as(env, STAFF).doc('announcements/pAll').delete());
    await denied(as(env, GUARDIAN_A).doc('announcements/p7').delete());
  });
});
```

- [ ] **Step 2: Run the rules tests to verify they fail**

Run: `npm run test:rules`
Expected: FAIL in `tests/rules/announcements.test.js` only — the `ok(...)` assertions fail with `PERMISSION_DENIED` (no `announcements` match yet; guardians can't write the new fields). Every other rules file still passes.

- [ ] **Step 3: Extend the guardian self-update allow-list**

In `firestore.rules`, inside `match /guardians/{uid}`, replace:

```
      allow update: if own(uid) && affectedOnly(['notificationsEnabled', 'displayName', 'lastOpenedAt']);
```

with:

```
      allow update: if own(uid) && affectedOnly(['notificationsEnabled', 'displayName', 'lastOpenedAt', 'announcementsSeenAt', 'announcementPushEnabled']);
```

- [ ] **Step 4: Add the announcements rules**

In `firestore.rules`, insert this block immediately before the line `    // ---------- staff-only records written by Functions ----------`:

```
    // ---------- announcements (spec 2026-10-05) ----------
    // Staff write directly; Functions own pushedAt/pushResult and the
    // scheduled→published→expired moves. Guardians read only published posts
    // whose audienceKeys overlap guardians/{uid}.audienceKeys (server-written).
    // Mirrors coversPostKeys() in shared/announcements.js -- keep in step.
    function postKeysInScope(keys) {
      return isAdmin()
        || (isStaff() && role() == 'jhs_coord' && keys.hasOnly(['g7', 'g8', 'g9', 'g10']))
        || (isStaff() && role() == 'shs_coord' && keys.hasOnly(['g11', 'g12']))
        || (isStaff() && role() == 'glc' && keys.hasOnly(['g' + string(profile().gradeLevel)]));
    }
    function validPost(d) {
      return d.keys().hasOnly(['title', 'body', 'audience', 'audienceKeys', 'status', 'publishAt', 'publishedAt', 'expiresAt',
                               'pinned', 'push', 'pushedAt', 'pushResult', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt', 'editedAt'])
        && d.title is string && d.title.size() >= 1 && d.title.size() <= 120
        && d.body is string && d.body.size() >= 1 && d.body.size() <= 5000
        && d.audience is map
        && d.audienceKeys is list && d.audienceKeys.size() > 0
        && d.audienceKeys.hasOnly(['all', 'g7', 'g8', 'g9', 'g10', 'g11', 'g12'])
        && (!d.audienceKeys.hasAny(['all']) || d.audienceKeys.size() == 1)
        && d.publishAt is timestamp
        && (d.get('expiresAt', null) == null || d.expiresAt is timestamp)
        && d.pinned is bool && d.push is bool
        && d.updatedBy.uid == request.auth.uid && d.updatedAt == request.time;
    }
    function postChanged() { return request.resource.data.diff(resource.data).affectedKeys(); }
    function guardianSeesPost() {
      return isGuardian() && resource.data.status == 'published'
        && resource.data.audienceKeys.hasAny(get(/databases/$(database)/documents/guardians/$(request.auth.uid)).data.get('audienceKeys', []));
    }
    match /announcements/{id} {
      allow get: if isStaff() || guardianSeesPost();
      allow list: if isStaff() || (guardianSeesPost() && bounded(50));
      allow create: if isStaff() && validPost(request.resource.data)
        && postKeysInScope(request.resource.data.audienceKeys)
        && request.resource.data.createdBy.uid == request.auth.uid
        && request.resource.data.createdAt == request.time
        && !request.resource.data.keys().hasAny(['pushedAt', 'pushResult', 'editedAt'])
        && ((request.resource.data.status == 'published'
              && request.resource.data.publishAt == request.time
              && request.resource.data.publishedAt == request.time)
          || (request.resource.data.status == 'scheduled'
              && request.resource.data.publishAt > request.time
              && !request.resource.data.keys().hasAny(['publishedAt'])));
      allow update: if isStaff() && validPost(request.resource.data)
        && !postChanged().hasAny(['pushedAt', 'pushResult', 'createdBy', 'createdAt', 'publishedAt'])
        && postKeysInScope(resource.data.audienceKeys) && postKeysInScope(request.resource.data.audienceKeys)
        && (
          // Scheduled: anything staff own, still in the future, never "edited".
          (resource.data.status == 'scheduled' && request.resource.data.status == 'scheduled'
            && request.resource.data.publishAt > request.time
            && !request.resource.data.keys().hasAny(['editedAt']))
          // Live: wording, pin and expiry only; editedAt only ever set to now.
          || (resource.data.status == 'published' && request.resource.data.status == 'published'
            && postChanged().hasOnly(['title', 'body', 'pinned', 'expiresAt', 'editedAt', 'updatedAt', 'updatedBy'])
            && (!postChanged().hasAny(['editedAt']) || request.resource.data.editedAt == request.time))
          // Unpublish: the status flip and the touch, nothing else.
          || (resource.data.status == 'published' && request.resource.data.status == 'unpublished'
            && postChanged().hasOnly(['status', 'updatedAt', 'updatedBy']))
        );
      allow delete: if isStaff() && resource.data.status == 'scheduled' && postKeysInScope(resource.data.audienceKeys);
    }

```

- [ ] **Step 5: Run the rules tests to verify they pass**

Run: `npm run test:rules`
Expected: PASS — all files, including the existing `parent.test.js` and `roles.test.js` (the guardian allow-list change only widens it).

- [ ] **Step 6: Add the indexes**

In `firestore.indexes.json`, append these four entries to the end of the `"indexes"` array (add a comma after the current last entry, the `enrollments` one):

```json
    { "collectionGroup": "announcements", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "audienceKeys", "arrayConfig": "CONTAINS" }, { "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "publishedAt", "order": "DESCENDING" } ] },
    { "collectionGroup": "announcements", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "publishAt", "order": "ASCENDING" } ] },
    { "collectionGroup": "announcements", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "expiresAt", "order": "ASCENDING" } ] },
    { "collectionGroup": "announcements", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "pushResult.status", "order": "ASCENDING" }, { "fieldPath": "pushResult.claimedAt", "order": "ASCENDING" } ] }
```

And append this entry to the end of the `"fieldOverrides"` array (comma after the `events` entry):

```json
    { "collectionGroup": "devices", "fieldPath": "enabled", "indexes": [
      { "order": "ASCENDING", "queryScope": "COLLECTION" }, { "order": "DESCENDING", "queryScope": "COLLECTION" },
      { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" } ] }
```

Verify it is still valid JSON:

Run: `node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 7: Commit**

```bash
git add firestore.rules firestore.indexes.json tests/rules/announcements.test.js
git commit -m "feat(rules): announcements read/write rules, guardian unread fields, indexes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Shared push verdicts and the announcement payload

**Files:**
- Modify: `functions/src/handlers/push.js`
- Modify: `functions/src/handlers/push.test.js`
- Modify: `functions/src/lib/pushPayload.js`
- Modify: `functions/src/lib/pushPayload.test.js`

**Interfaces:**
- Produces:
  - `applyVerdicts(db, devDocs, responses): Promise<{ sent: number, failed: number, pruned: number }>` exported from `functions/src/handlers/push.js`. `devDocs[i]` is the device doc whose token was `tokens[i]`.
  - `ANNOUNCEMENT_PUSH_TITLE = 'BNHS announcement'` and `announcementPayload({ tokens, announcementId, title, portalUrl })` exported from `functions/src/lib/pushPayload.js`.
- `sendToGuardian` keeps its exact signature and return values.

- [ ] **Step 1: Write the failing tests**

Append to `functions/src/handlers/push.test.js` (it already defines `fakeDb`, `devDoc`; change its first import line to `import { sendToGuardian, applyVerdicts, MAX_FAILURES } from './push.js';`):

```js
describe('applyVerdicts', () => {
  it('counts successes, deletes dead tokens and counts other failures', async () => {
    const db = fakeDb();
    const devDocs = [devDoc('d1', { token: 't1' }), devDoc('d2', { token: 't2', failureCount: 1 }), devDoc('d3', { token: 't3' })];
    const responses = [
      { success: true },
      { success: false, error: { code: 'messaging/internal-error' } },
      { success: false, error: { code: 'messaging/registration-token-not-registered' } },
    ];
    expect(await applyVerdicts(db, devDocs, responses)).toEqual({ sent: 1, failed: 2, pruned: 1 });
    expect(db.ops).toEqual([
      { type: 'update', ref: { id: 'd2' }, data: { failureCount: 2 } },
      { type: 'delete', ref: { id: 'd3' } },
    ]);
  });
  it('disables a device on its MAX_FAILURES-th failure', async () => {
    const db = fakeDb();
    await applyVerdicts(db, [devDoc('d1', { token: 't1', failureCount: MAX_FAILURES - 1 })], [{ success: false, error: { code: 'x' } }]);
    expect(db.ops[0].data).toMatchObject({ failureCount: MAX_FAILURES, enabled: false });
  });
});
```

Append to `functions/src/lib/pushPayload.test.js` (change its import to `import { pushPayload, PUSH_TITLE, PUSH_BODY, announcementPayload, ANNOUNCEMENT_PUSH_TITLE } from './pushPayload.js';`):

```js
describe('announcementPayload', () => {
  const p = announcementPayload({ tokens: ['t1'], announcementId: 'a1', title: 'No classes tomorrow', portalUrl: 'https://bnhs-parent.web.app' });
  it('names the announcement and links to it', () => {
    expect(ANNOUNCEMENT_PUSH_TITLE).toBe('BNHS announcement');
    expect(p.tokens).toEqual(['t1']);
    expect(p.notification).toEqual({ title: 'BNHS announcement', body: 'No classes tomorrow' });
    expect(p.data).toEqual({ announcementId: 'a1' });
    expect(p.webpush.notification).toMatchObject({ title: 'BNHS announcement', body: 'No classes tomorrow', tag: 'announcement-a1', icon: '/icons/icon-192.png' });
    expect(p.webpush.fcmOptions.link).toBe('https://bnhs-parent.web.app/announcements/a1');
    expect(p.webpush.headers).toEqual({ TTL: '86400', Urgency: 'normal' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix functions test -- src/handlers/push.test.js src/lib/pushPayload.test.js`
Expected: FAIL — `applyVerdicts is not a function` / `announcementPayload is not a function`.

- [ ] **Step 3: Extract `applyVerdicts` in `functions/src/handlers/push.js`**

Replace everything from the `// Sends the fixed push…` comment to the end of the file with:

```js
// Applies FCM's per-token verdicts to the device docs (spec §6 step 4):
// dead tokens are deleted, other failures counted, and a device is disabled
// after MAX_FAILURES. devDocs[i] must be the device whose token was
// tokens[i] in the multicast that produced responses[i].
export async function applyVerdicts(db, devDocs, responses) {
  const batch = db.batch();
  let sent = 0, failed = 0, pruned = 0;
  responses.forEach((r, i) => {
    const docSnap = devDocs[i];
    if (r.success) { sent++; return; }
    failed++;
    if (DEAD.has(r.error?.code)) { batch.delete(docSnap.ref); pruned++; return; }
    const failureCount = (docSnap.data().failureCount || 0) + 1;
    const update = { failureCount };
    if (failureCount >= MAX_FAILURES) { update.enabled = false; update.disabledAt = Timestamp.now(); }
    batch.update(docSnap.ref, update);
  });
  await batch.commit();
  return { sent, failed, pruned };
}

// Sends the fixed push to every enabled device of one guardian and applies
// FCM's per-token verdicts to the device docs. devDocs is the caller's own
// already-fetched enabled-devices query snapshot docs
// (QueryDocumentSnapshot-shaped: .data()/.ref) -- the caller (scanEvent.js)
// needs that same query for its own device-count gate right before this is
// called, so this no longer re-queries Firestore for it.
export async function sendToGuardian({ db, messaging, portalUrl }, { inboxId, studentId, devDocs, deviceLabel }) {
  if (devDocs.length === 0) return { status: 'skipped_no_device', pruned: 0 };

  const tokens = devDocs.map((d) => d.data().token);
  const res = await messaging.sendEachForMulticast(pushPayload({ tokens, inboxId, studentId, portalUrl, deviceLabel }));
  const { sent, pruned } = await applyVerdicts(db, devDocs, res.responses);
  return { status: sent > 0 ? 'sent' : 'failed', pruned };
}
```

- [ ] **Step 4: Add the payload to `functions/src/lib/pushPayload.js`**

Append:

```js
export const ANNOUNCEMENT_PUSH_TITLE = 'BNHS announcement';

// Announcements carry no learner information, so the post title is the
// body. One tag per post: a re-delivered push replaces, not stacks.
export function announcementPayload({ tokens, announcementId, title, portalUrl }) {
  return {
    tokens,
    notification: { title: ANNOUNCEMENT_PUSH_TITLE, body: title },
    data: { announcementId },
    webpush: {
      headers: { TTL: '86400', Urgency: 'normal' },
      notification: { title: ANNOUNCEMENT_PUSH_TITLE, body: title, tag: `announcement-${announcementId}`, icon: '/icons/icon-192.png' },
      fcmOptions: { link: `${portalUrl}/announcements/${announcementId}` },
    },
  };
}
```

- [ ] **Step 5: Run the functions unit tests**

Run: `npm --prefix functions test`
Expected: PASS — including every pre-existing `sendToGuardian` test (behaviour unchanged).

- [ ] **Step 6: Commit**

```bash
git add functions/src/handlers/push.js functions/src/handlers/push.test.js functions/src/lib/pushPayload.js functions/src/lib/pushPayload.test.js
git commit -m "refactor(functions): shared FCM verdict handling; announcement push payload

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Guardian audience keys

**Files:**
- Create: `functions/src/handlers/guardianAudience.js`
- Modify: `functions/src/handlers/scheduled.js` (`expireLinks`)
- Modify: `functions/index.js`
- Create: `functions/scripts/backfillGuardianAudience.mjs`
- Test: `functions/test/emulator/guardianAudience.test.js`

**Interfaces:**
- Consumes: `audienceKeysFor` from `functions/shared/announcements.js` (synced copy of Task 1; import path from handlers is `../../shared/announcements.js`).
- Produces:
  - `refreshGuardianAudience(db, uid): Promise<string[] | null>` — `null` when `guardians/{uid}` doesn't exist (never creates it).
  - `handleGuardianLinkWrite(db, { before, after }): Promise<string[] | null> | null`
  - Cloud Function export `onGuardianLinkWritten`.

- [ ] **Step 1: Write the failing emulator test**

Create `functions/test/emulator/guardianAudience.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool, fakeMessaging } from './helpers.js';
import { refreshGuardianAudience, handleGuardianLinkWrite } from '../../src/handlers/guardianAudience.js';
import { expireLinks } from '../../src/handlers/scheduled.js';
import { clearCache } from '../../src/cache.js';

const NOW = new Date('2026-10-05T02:00:00+08:00');
const keysOf = async (uid) => (await db().doc(`guardians/${uid}`).get()).data()?.audienceKeys;

// seedSchool: gA and gB actively linked to S1 (enrollment has no gradeLevel;
// its section SEC1 is grade 7); gC's link is revoked and gC has no profile.
beforeEach(async () => { await clearAll(); clearCache(); await seedSchool(); });

describe('refreshGuardianAudience', () => {
  it('uses the section grade when the enrollment has none', async () => {
    expect(await refreshGuardianAudience(db(), 'gA')).toEqual(['all', 'g7']);
    expect(await keysOf('gA')).toEqual(['all', 'g7']);
  });
  it('prefers the enrollment grade and merges several learners', async () => {
    await db().doc('enrollments/S1_2026-2027').set({ gradeLevel: 8 }, { merge: true });
    await db().doc('enrollments/S2_2026-2027').set({ studentId: 'S2', sectionId: 'SEC1', schoolYear: '2026-2027', status: 'enrolled', gradeLevel: 11 });
    await db().doc('guardian_links/gA_S2').set({ guardianUid: 'gA', studentId: 'S2', status: 'active', schoolYear: '2026-2027' });
    expect(await refreshGuardianAudience(db(), 'gA')).toEqual(['all', 'g8', 'g11']);
  });
  it('empties the keys when no link is active', async () => {
    await db().doc('guardian_links/gA_S1').update({ status: 'revoked' });
    expect(await refreshGuardianAudience(db(), 'gA')).toEqual([]);
    expect(await keysOf('gA')).toEqual([]);
  });
  it('never creates a guardian profile', async () => {
    expect(await refreshGuardianAudience(db(), 'gC')).toBeNull();
    expect((await db().doc('guardians/gC').get()).exists).toBe(false);
  });
});

describe('handleGuardianLinkWrite', () => {
  it('refreshes on activation, revocation and deletion', async () => {
    const link = { guardianUid: 'gA', studentId: 'S1', status: 'active', schoolYear: '2026-2027' };
    expect(await handleGuardianLinkWrite(db(), { before: null, after: link })).toEqual(['all', 'g7']);
    await db().doc('guardian_links/gA_S1').update({ status: 'revoked' });
    expect(await handleGuardianLinkWrite(db(), { before: link, after: { ...link, status: 'revoked' } })).toEqual([]);
    expect(await handleGuardianLinkWrite(db(), { before: { ...link, status: 'revoked' }, after: null })).toEqual([]);
  });
  it('skips writes that change nothing about the audience', () => {
    const link = { guardianUid: 'gA', studentId: 'S1', status: 'active', schoolYear: '2026-2027' };
    expect(handleGuardianLinkWrite(db(), { before: link, after: { ...link, learnerName: 'Ana' } })).toBeNull();
  });
});

describe('expireLinks', () => {
  it('rebuilds the keys of every guardian it visits', async () => {
    await db().doc('guardians/gA').set({ audienceKeys: ['all', 'g12'] }, { merge: true });
    const deps = { db: db(), auth: { async deleteUser() {} }, messaging: fakeMessaging(), portalUrl: 'https://p.test', now: () => NOW };
    const r = await expireLinks(deps);
    expect(await keysOf('gA')).toEqual(['all', 'g7']);
    expect(r.audience).toBe(2);   // gA and gB
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:functions`
Expected: FAIL — `Failed to resolve import "../../src/handlers/guardianAudience.js"`.

- [ ] **Step 3: Write the handler**

Create `functions/src/handlers/guardianAudience.js`:

```js
import { audienceKeysFor } from '../../shared/announcements.js';

// Rebuilds guardians/{uid}.audienceKeys from the grades of the guardian's
// active links (announcements spec, "Guardian audience keys"). Never
// creates the guardian doc: the portal treats its existence as "activated".
export async function refreshGuardianAudience(db, uid) {
  const ref = db.doc(`guardians/${uid}`);
  const [guardian, links] = await Promise.all([
    ref.get(),
    db.collection('guardian_links').where('guardianUid', '==', uid).where('status', '==', 'active').get(),
  ]);
  if (!guardian.exists) return null;
  const grades = [];
  for (const l of links.docs) {
    const { studentId, schoolYear } = l.data();
    const enrollment = (await db.doc(`enrollments/${studentId}_${schoolYear}`).get()).data();
    let grade = enrollment?.gradeLevel;
    if (grade == null && enrollment?.sectionId) grade = (await db.doc(`sections/${enrollment.sectionId}`).get()).data()?.gradeLevel;
    if (grade != null) grades.push(Number(grade));
  }
  const keys = audienceKeysFor(grades);
  const current = guardian.data().audienceKeys;
  if (!Array.isArray(current) || current.join(',') !== keys.join(',')) await ref.update({ audienceKeys: keys });
  return keys;
}

// guardian_links/{id} trigger: only a change to who/which learner/status/
// school year can change the audience.
export function handleGuardianLinkWrite(db, { before, after }) {
  const uid = after?.guardianUid || before?.guardianUid;
  if (!uid) return null;
  const same = before && after && before.status === after.status
    && before.studentId === after.studentId && before.schoolYear === after.schoolYear;
  if (same) return null;
  return refreshGuardianAudience(db, uid);
}
```

- [ ] **Step 4: Refresh keys in the nightly `expireLinks`**

In `functions/src/handlers/scheduled.js`:

1. Add the import after the existing imports:

```js
import { refreshGuardianAudience } from './guardianAudience.js';
```

2. Right after `const checkedLearners = new Set();` add:

```js
  const audienceUids = new Set();
```

3. As the first statement inside `for (const l of active.docs) {`, after the destructuring line `const { studentId, guardianUid, schoolYear } = l.data();`, add:

```js
    audienceUids.add(guardianUid);
```

4. Immediately before `const oldRevoked = await deleteMatching(` add:

```js
  // Learners change grade between school years and sections mid-year;
  // rebuild every visited guardian's announcement audience nightly.
  let audience = 0;
  for (const uid of audienceUids) { if (await refreshGuardianAudience(db, uid)) audience++; }
```

5. Change the final counts line to:

```js
  const counts = { expired, seeded, oldRevoked, oldExpired, oldCodes, oldAudit, dormant, audience };
```

(Leave the early-return zero object unchanged — `scheduled.test.js` asserts it exactly.)

- [ ] **Step 5: Export the trigger**

In `functions/index.js`, add the import next to the other handler imports:

```js
import { handleGuardianLinkWrite } from './src/handlers/guardianAudience.js';
```

And after the `onParentPortalSettingsChanged` export add:

```js
// Keeps guardians/{uid}.audienceKeys (which announcements a guardian may
// read) in step with every activation, approval, revocation and expiry.
export const onGuardianLinkWritten = onDocumentWritten({ document: 'guardian_links/{linkId}', retry: true }, (event) =>
  handleGuardianLinkWrite(db, { before: event.data?.before?.data() || null, after: event.data?.after?.data() || null }));
```

- [ ] **Step 6: Write the backfill script**

Create `functions/scripts/backfillGuardianAudience.mjs`:

```js
// One-off for the announcements release: give every existing guardian their
// audienceKeys. Safe to re-run (it only writes keys that differ). Dry run
// unless --apply. Needs Application Default Credentials for the project
// (e.g. `gcloud auth application-default login`). Run from the repo root
// AFTER deploying functions, so new activations are already handled:
//   node scripts/syncShared.mjs
//   node functions/scripts/backfillGuardianAudience.mjs <projectId>
//   node functions/scripts/backfillGuardianAudience.mjs <projectId> --apply
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { refreshGuardianAudience } from '../src/handlers/guardianAudience.js';

const [projectId, flag] = process.argv.slice(2);
if (!projectId) { console.error('Usage: node functions/scripts/backfillGuardianAudience.mjs <projectId> [--apply]'); process.exit(1); }
initializeApp({ projectId });
const db = getFirestore();

const guardians = await db.collection('guardians').get();
if (flag !== '--apply') {
  const withLinks = new Set((await db.collection('guardian_links').where('status', '==', 'active').get()).docs.map((d) => d.data().guardianUid));
  const missing = guardians.docs.filter((g) => !Array.isArray(g.data().audienceKeys)).length;
  console.log(`Dry run: ${guardians.size} guardian(s), ${withLinks.size} with an active link, ${missing} without audienceKeys. Re-run with --apply to write.`);
} else {
  let n = 0;
  for (const g of guardians.docs) { await refreshGuardianAudience(db, g.id); n++; }
  console.log(`Refreshed audienceKeys for ${n} guardian(s).`);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:functions`
Expected: PASS — new file plus the existing `scheduled.test.js` (its zeroed-result case still matches).

- [ ] **Step 8: Commit**

```bash
git add functions/src/handlers/guardianAudience.js functions/src/handlers/scheduled.js functions/index.js functions/scripts/backfillGuardianAudience.mjs functions/test/emulator/guardianAudience.test.js
git commit -m "feat(functions): server-maintained guardian announcement audience keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Announcement trigger — audit and at-most-once push

**Files:**
- Create: `functions/src/handlers/announcements.js`
- Create: `functions/src/handlers/announcements.test.js` (pure unit tests)
- Modify: `functions/index.js`
- Test: `functions/test/emulator/announcements.test.js`

**Interfaces:**
- Consumes: `applyVerdicts` (Task 3), `announcementPayload` (Task 3), `audit` from `functions/src/audit.js`, `logEvent` from `functions/src/log.js`.
- Produces (named exports of `functions/src/handlers/announcements.js`):
  - `PUSH_CHUNK = 500`, `CLAIM_STALE_MS = 600000`
  - `chunk(arr, n): any[][]`
  - `auditActionFor(before, after): string | null` — one of `announcement.published`, `announcement.scheduled`, `announcement.edited`, `announcement.went_out`, `announcement.unpublished`, `announcement.expired`, `announcement.deleted`, or `null`.
  - `sendAnnouncementPush({ db, messaging, portalUrl, now }, id): Promise<object>`
  - `handleAnnouncementWrite(deps, { id, before, after, authId, authType }): Promise<void>`
  - Cloud Function export `onAnnouncementWritten`.

- [ ] **Step 1: Write the failing unit test**

Create `functions/src/handlers/announcements.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { chunk, auditActionFor } from './announcements.js';

const ts = (ms) => ({ toMillis: () => ms });
const post = (over = {}) => ({ title: 'T', body: 'B', status: 'published', pinned: false, expiresAt: null, publishAt: ts(1), audienceKeys: ['all'], push: false, updatedAt: ts(1), ...over });

describe('chunk', () => {
  it('splits into slices of at most n', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 500)).toEqual([]);
  });
});

describe('auditActionFor', () => {
  it('names creation by its status', () => {
    expect(auditActionFor(null, post())).toBe('announcement.published');
    expect(auditActionFor(null, post({ status: 'scheduled' }))).toBe('announcement.scheduled');
  });
  it('names status moves and deletion', () => {
    expect(auditActionFor(post({ status: 'scheduled' }), post())).toBe('announcement.went_out');
    expect(auditActionFor(post(), post({ status: 'unpublished', updatedAt: ts(2) }))).toBe('announcement.unpublished');
    expect(auditActionFor(post(), post({ status: 'expired' }))).toBe('announcement.expired');
    expect(auditActionFor(post({ status: 'scheduled' }), null)).toBe('announcement.deleted');
  });
  it('names a staff edit (updatedAt moved and a staff field changed)', () => {
    expect(auditActionFor(post(), post({ title: 'T2', updatedAt: ts(2) }))).toBe('announcement.edited');
    expect(auditActionFor(post(), post({ expiresAt: ts(9), updatedAt: ts(2) }))).toBe('announcement.edited');
  });
  it('ignores Functions bookkeeping (push claim/result) and no-op touches', () => {
    expect(auditActionFor(post(), post({ pushResult: { status: 'sending' } }))).toBeNull();
    expect(auditActionFor(post(), post({ updatedAt: ts(2) }))).toBeNull();
    expect(auditActionFor(null, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing emulator test**

Create `functions/test/emulator/announcements.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool, fakeMessaging, ts } from './helpers.js';
import { handleAnnouncementWrite, sendAnnouncementPush } from '../../src/handlers/announcements.js';

const NOW = new Date('2026-10-05T08:00:00+08:00');
const deps = (messaging = fakeMessaging()) => ({ db: db(), messaging, portalUrl: 'https://p.test', now: () => NOW });
const at = ts(NOW.getTime());
const post = (over = {}) => ({
  title: 'Class suspension', body: 'No classes.', audience: { all: true }, audienceKeys: ['all'],
  status: 'published', publishAt: at, publishedAt: at, expiresAt: null, pinned: false, push: true,
  createdBy: { uid: 'staff1', name: 'R' }, updatedBy: { uid: 'staff1', name: 'R' }, createdAt: at, updatedAt: at, ...over,
});
const write = async (id, data) => { await db().doc(`announcements/${id}`).set(data); return data; };
const read = async (id) => (await db().doc(`announcements/${id}`).get()).data();
const auditRows = async () => (await db().collection('audit_log').get()).docs.map((d) => d.data());

// seedSchool: gA (on, devices tokA1+tokA2), gB (notifications off, tokB1).
// Added here: gD opted out of announcement pushes; gE is a grade 12 parent.
beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('guardians/gA').set({ audienceKeys: ['all', 'g7'] }, { merge: true });
  await db().doc('guardians/gB').set({ audienceKeys: ['all', 'g7'] }, { merge: true });
  await db().doc('guardians/gD').set({ email: 'd@x', notificationsEnabled: true, announcementPushEnabled: false, audienceKeys: ['all', 'g7'] });
  await db().doc('guardians/gD/devices/tD1').set({ token: 'tokD1', enabled: true, failureCount: 0 });
  await db().doc('guardians/gE').set({ email: 'e@x', notificationsEnabled: true, audienceKeys: ['all', 'g12'] });
  await db().doc('guardians/gE/devices/tE1').set({ token: 'tokE1', enabled: true, failureCount: 0 });
});

describe('sendAnnouncementPush', () => {
  it('pushes a school-wide post to every opted-in guardian device and records the result', async () => {
    const m = fakeMessaging();
    await write('a1', post());
    const r = await sendAnnouncementPush(deps(m), 'a1');
    expect(m.sent).toHaveLength(1);
    expect([...m.sent[0].tokens].sort()).toEqual(['tokA1', 'tokA2', 'tokE1']);
    expect(m.sent[0].webpush.fcmOptions.link).toBe('https://p.test/announcements/a1');
    expect(m.sent[0].notification.body).toBe('Class suspension');
    expect(r).toEqual({ status: 'sent', guardians: 2, devices: 3, sent: 3, failed: 0, pruned: 0 });
    const saved = await read('a1');
    expect(saved.pushResult).toEqual(r);
    expect(saved.pushedAt).toBeTruthy();
  });
  it('pushes a grade post only to that grade', async () => {
    const m = fakeMessaging();
    await write('a12', post({ audience: { grades: [12] }, audienceKeys: ['g12'] }));
    await sendAnnouncementPush(deps(m), 'a12');
    expect(m.sent[0].tokens).toEqual(['tokE1']);
  });
  it('prunes dead tokens and counts failures', async () => {
    const m = fakeMessaging({ tokA1: 'messaging/registration-token-not-registered' });
    await write('a1', post());
    const r = await sendAnnouncementPush(deps(m), 'a1');
    expect(r).toMatchObject({ status: 'sent', sent: 2, failed: 1, pruned: 1 });
    expect((await db().doc('guardians/gA/devices/tA1').get()).exists).toBe(false);
  });
  it('sends in chunks of 500', async () => {
    const b = db().batch();
    for (let i = 0; i < 501; i++) b.set(db().doc(`guardians/gE/devices/x${i}`), { token: `x${i}`, enabled: true, failureCount: 0 });
    await b.commit();
    const m = fakeMessaging();
    await write('a12', post({ audience: { grades: [12] }, audienceKeys: ['g12'] }));
    const r = await sendAnnouncementPush(deps(m), 'a12');
    expect(m.sent.map((s) => s.tokens.length)).toEqual([500, 2]);
    expect(r.devices).toBe(502);
  });
  it('records skipped_paused while notifications are paused', async () => {
    await db().doc('settings/parent_portal').set({ notificationsPaused: true }, { merge: true });
    const m = fakeMessaging();
    await write('a1', post());
    expect(await sendAnnouncementPush(deps(m), 'a1')).toEqual({ status: 'skipped_paused' });
    expect(m.sent).toHaveLength(0);
    expect((await read('a1')).pushResult).toEqual({ status: 'skipped_paused' });
  });
  it('sends nothing when another run already claimed the push', async () => {
    const m = fakeMessaging();
    await write('a1', post({ pushResult: { status: 'sending', claimedAt: at } }));
    expect(await sendAnnouncementPush(deps(m), 'a1')).toEqual({ status: 'skipped_claimed' });
    expect(m.sent).toHaveLength(0);
  });
});

describe('handleAnnouncementWrite', () => {
  it('pushes exactly once, even when the trigger is delivered again', async () => {
    const m = fakeMessaging();
    const after = await write('a1', post());
    await handleAnnouncementWrite(deps(m), { id: 'a1', before: null, after, authId: 'staff1', authType: 'unknown' });
    await handleAnnouncementWrite(deps(m), { id: 'a1', before: null, after, authId: 'staff1', authType: 'unknown' });
    expect(m.sent).toHaveLength(1);
  });
  it('never pushes posts without push, scheduled posts, or edits after publishing', async () => {
    const m = fakeMessaging();
    const quiet = await write('q', post({ push: false }));
    await handleAnnouncementWrite(deps(m), { id: 'q', before: null, after: quiet, authId: 'staff1', authType: 'unknown' });
    const later = await write('s', post({ status: 'scheduled' }));
    await handleAnnouncementWrite(deps(m), { id: 's', before: null, after: later, authId: 'staff1', authType: 'unknown' });
    const sentBefore = post({ pushedAt: at, pushResult: { status: 'sent' } });
    const edited = await write('e', { ...sentBefore, title: 'Fixed typo', updatedAt: ts(NOW.getTime() + 1) });
    await handleAnnouncementWrite(deps(m), { id: 'e', before: sentBefore, after: edited, authId: 'staff1', authType: 'unknown' });
    expect(m.sent).toHaveLength(0);
  });
  it('audits staff actions with the writer uid and job moves as system', async () => {
    const created = await write('a1', post({ push: false, status: 'scheduled' }));
    await handleAnnouncementWrite(deps(), { id: 'a1', before: null, after: created, authId: 'jhs1', authType: 'unknown' });
    const live = { ...created, status: 'published', publishedAt: at };
    await handleAnnouncementWrite(deps(), { id: 'a1', before: created, after: live, authId: 'svc', authType: 'service_account' });
    const rows = await auditRows();
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'announcement.scheduled', actorType: 'staff', actorUid: 'jhs1', targetType: 'announcement', targetId: 'a1' }),
      expect.objectContaining({ action: 'announcement.went_out', actorType: 'system', actorUid: null, targetId: 'a1' }),
    ]));
    expect(rows[0].details).toEqual(expect.objectContaining({ title: 'Class suspension', audienceKeys: ['all'] }));
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm --prefix functions test -- src/handlers/announcements.test.js`
Expected: FAIL — cannot resolve `./announcements.js`.

- [ ] **Step 4: Write the handler (trigger part)**

Create `functions/src/handlers/announcements.js`:

```js
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { audit } from '../audit.js';
import { logEvent } from '../log.js';
import { applyVerdicts } from './push.js';
import { announcementPayload } from '../lib/pushPayload.js';

// Announcements spec: docs/superpowers/specs/2026-10-05-announcements-design.md
export const PUSH_CHUNK = 500;                 // FCM sendEachForMulticast limit
export const CLAIM_STALE_MS = 10 * 60 * 1000;  // a 'sending' claim older than this is 'interrupted'

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const norm = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v ?? null);
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const STAFF_FIELDS = ['title', 'body', 'pinned', 'expiresAt', 'publishAt', 'audienceKeys', 'push'];

// What a write means for the audit log; null for Functions' own bookkeeping
// (push claims/results). Staff writes always move updatedAt; the publish job
// and push code never do.
export function auditActionFor(before, after) {
  if (!before && !after) return null;
  if (!before) return after.status === 'scheduled' ? 'announcement.scheduled' : 'announcement.published';
  if (!after) return 'announcement.deleted';
  if (before.status !== after.status) {
    if (after.status === 'published') return 'announcement.went_out';
    if (after.status === 'unpublished') return 'announcement.unpublished';
    if (after.status === 'expired') return 'announcement.expired';
  }
  if (same(before.updatedAt, after.updatedAt)) return null;
  return STAFF_FIELDS.some((k) => !same(before[k], after[k])) ? 'announcement.edited' : null;
}

// At most once: a transaction claims the push ('sending') before anything
// is sent. A run that finds a claim sends nothing; the publish job turns a
// claim older than CLAIM_STALE_MS into 'interrupted' (never resent).
export async function sendAnnouncementPush({ db, messaging, portalUrl, now }, id) {
  const ref = db.doc(`announcements/${id}`);
  const post = await db.runTransaction(async (tx) => {
    const p = (await tx.get(ref)).data();
    if (!p || p.status !== 'published' || p.push !== true || p.pushedAt || p.pushResult) return null;
    tx.update(ref, { pushResult: { status: 'sending', claimedAt: Timestamp.fromDate(now()) } });
    return p;
  });
  if (!post) return { status: 'skipped_claimed' };

  const paused = (await db.doc('settings/parent_portal').get()).data()?.notificationsPaused === true;
  if (paused) {
    await ref.update({ pushedAt: FieldValue.serverTimestamp(), pushResult: { status: 'skipped_paused' } });
    logEvent('announcement_push', { id, status: 'skipped_paused' });
    return { status: 'skipped_paused' };
  }

  const guardians = await db.collection('guardians').where('audienceKeys', 'array-contains-any', post.audienceKeys).get();
  const wanted = new Set(guardians.docs
    .filter((g) => g.data().notificationsEnabled !== false && g.data().announcementPushEnabled !== false)
    .map((g) => g.id));
  // One collection-group read instead of one devices query per guardian.
  const devices = (await db.collectionGroup('devices').where('enabled', '==', true).get()).docs
    .filter((d) => d.ref.parent.parent?.parent?.id === 'guardians' && wanted.has(d.ref.parent.parent.id));

  let sent = 0, failed = 0, pruned = 0;
  for (const part of chunk(devices, PUSH_CHUNK)) {
    const res = await messaging.sendEachForMulticast(announcementPayload({
      tokens: part.map((d) => d.data().token), announcementId: id, title: post.title, portalUrl,
    }));
    const v = await applyVerdicts(db, part, res.responses);
    sent += v.sent; failed += v.failed; pruned += v.pruned;
  }
  const result = { status: sent > 0 || devices.length === 0 ? 'sent' : 'failed', guardians: wanted.size, devices: devices.length, sent, failed, pruned };
  await ref.update({ pushedAt: FieldValue.serverTimestamp(), pushResult: result });
  logEvent('announcement_push', { id, ...result });
  return result;
}

// announcements/{id} trigger: audit the change, then push if it is a
// published post that asked for one and has not been claimed yet.
export async function handleAnnouncementWrite(deps, { id, before, after, authId, authType }) {
  const action = auditActionFor(before, after);
  if (action) {
    const system = authType === 'service_account' || !authId;
    const post = after || before;
    await audit(deps.db, {
      action, actorType: system ? 'system' : 'staff', actorUid: system ? null : authId,
      targetType: 'announcement', targetId: id, details: { title: post.title, audienceKeys: post.audienceKeys },
    });
  }
  if (after?.status === 'published' && after.push === true && !after.pushedAt && !after.pushResult) {
    await sendAnnouncementPush(deps, id);
  }
}
```

- [ ] **Step 5: Export the trigger**

In `functions/index.js`, add to the imports:

```js
import { handleAnnouncementWrite } from './src/handlers/announcements.js';
```

And after the `onGuardianLinkWritten` export (Task 4) add:

```js
// Audits every announcement change and sends its push at most once. With
// auth context so the audit names the staff member (authId) who wrote it.
export const onAnnouncementWritten = onDocumentWrittenWithAuthContext(
  { document: 'announcements/{id}', retry: true, timeoutSeconds: 300, memory: '512MiB' },
  (event) => handleAnnouncementWrite(deps(), {
    id: event.params.id, authId: event.authId, authType: event.authType,
    before: event.data?.before?.data() || null, after: event.data?.after?.data() || null,
  }));
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm --prefix functions test && npm run test:functions`
Expected: PASS — unit `announcements.test.js` and emulator `announcements.test.js`, plus everything existing.

- [ ] **Step 7: Commit**

```bash
git add functions/src/handlers/announcements.js functions/src/handlers/announcements.test.js functions/index.js functions/test/emulator/announcements.test.js
git commit -m "feat(functions): announcement audit and at-most-once push fan-out

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Publish job and audience-count callable

**Files:**
- Modify: `functions/src/handlers/announcements.js`
- Modify: `functions/index.js`
- Modify: `functions/test/emulator/announcements.test.js`

**Interfaces:**
- Consumes: `CLAIM_STALE_MS` (Task 5), `coversPostKeys`, `POST_KEYS` from `../../shared/announcements.js`, `CallableError` from `../errors.js`.
- Produces:
  - `publishDueAnnouncements({ db, now }): Promise<{ published: number, expired: number, interrupted: number }>`
  - `announcementAudienceCount({ db, profile }, { audienceKeys }): Promise<{ count: number }>`
  - Cloud Function exports `publishAnnouncementsJob` and `announcementAudienceCountFn` (the SIMS calls the latter by that name).

- [ ] **Step 1: Write the failing emulator tests**

In `functions/test/emulator/announcements.test.js`, change the handler import to:

```js
import { handleAnnouncementWrite, sendAnnouncementPush, publishDueAnnouncements, announcementAudienceCount, CLAIM_STALE_MS } from '../../src/handlers/announcements.js';
```

and append:

```js
describe('publishDueAnnouncements', () => {
  it('publishes due scheduled posts and leaves future ones', async () => {
    await write('due', post({ status: 'scheduled', publishAt: ts(NOW.getTime() - 60_000), publishedAt: null }));
    await write('future', post({ status: 'scheduled', publishAt: ts(NOW.getTime() + 60_000), publishedAt: null }));
    const r = await publishDueAnnouncements({ db: db(), now: () => NOW });
    expect(r).toMatchObject({ published: 1 });
    expect(await read('due')).toMatchObject({ status: 'published', publishedAt: at });
    expect((await read('future')).status).toBe('scheduled');
  });
  it('expires posts past their expiry and leaves open-ended ones', async () => {
    await write('old', post({ expiresAt: ts(NOW.getTime() - 1) }));
    await write('open', post({ expiresAt: null }));
    const r = await publishDueAnnouncements({ db: db(), now: () => NOW });
    expect(r).toMatchObject({ expired: 1 });
    expect((await read('old')).status).toBe('expired');
    expect((await read('open')).status).toBe('published');
  });
  it('marks stale push claims interrupted, never resent, and leaves fresh ones', async () => {
    await write('stuck', post({ expiresAt: ts(NOW.getTime() - 1), pushResult: { status: 'sending', claimedAt: ts(NOW.getTime() - CLAIM_STALE_MS - 1) } }));
    await write('busy', post({ pushResult: { status: 'sending', claimedAt: ts(NOW.getTime() - 1_000) } }));
    const r = await publishDueAnnouncements({ db: db(), now: () => NOW });
    expect(r).toEqual({ published: 0, expired: 1, interrupted: 1 });
    expect(await read('stuck')).toMatchObject({ status: 'expired', pushResult: { status: 'interrupted' }, pushedAt: at });
    expect((await read('busy')).pushResult.status).toBe('sending');
  });
});

describe('announcementAudienceCount', () => {
  const admin = { role: 'admin' }, jhs = { role: 'jhs_coord' }, glc8 = { role: 'glc', gradeLevel: 8 };
  it('counts guardians whose keys overlap', async () => {
    expect(await announcementAudienceCount({ db: db(), profile: admin }, { audienceKeys: ['all'] })).toEqual({ count: 4 });
    expect(await announcementAudienceCount({ db: db(), profile: jhs }, { audienceKeys: ['g7'] })).toEqual({ count: 3 });
  });
  it('refuses audiences outside the caller\'s scope and malformed keys', async () => {
    await expect(announcementAudienceCount({ db: db(), profile: jhs }, { audienceKeys: ['all'] })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(announcementAudienceCount({ db: db(), profile: glc8 }, { audienceKeys: ['g7'] })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(announcementAudienceCount({ db: db(), profile: admin }, { audienceKeys: ['x'] })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(announcementAudienceCount({ db: db(), profile: admin }, {})).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:functions`
Expected: FAIL — `publishDueAnnouncements is not a function`.

- [ ] **Step 3: Implement the job and the callable**

In `functions/src/handlers/announcements.js`, add to the imports:

```js
import { CallableError } from '../errors.js';
import { coversPostKeys, POST_KEYS } from '../../shared/announcements.js';
```

and append:

```js
// Every 5 minutes: scheduled → published (the trigger then pushes),
// published past expiresAt → expired, stale 'sending' claims → interrupted.
// Updates are merged per document so one post can't be written twice in a batch.
export async function publishDueAnnouncements({ db, now }) {
  const at = Timestamp.fromDate(now());
  const staleBefore = Timestamp.fromMillis(now().getTime() - CLAIM_STALE_MS);
  const col = db.collection('announcements');
  const [due, ended, stuck] = await Promise.all([
    col.where('status', '==', 'scheduled').where('publishAt', '<=', at).limit(200).get(),
    col.where('status', '==', 'published').where('expiresAt', '<=', at).limit(200).get(),
    col.where('pushResult.status', '==', 'sending').where('pushResult.claimedAt', '<=', staleBefore).limit(200).get(),
  ]);
  const updates = new Map();
  const add = (d, patch) => updates.set(d.ref.path, { ref: d.ref, patch: { ...(updates.get(d.ref.path)?.patch || {}), ...patch } });
  due.docs.forEach((d) => add(d, { status: 'published', publishedAt: at }));
  ended.docs.forEach((d) => add(d, { status: 'expired' }));
  stuck.docs.forEach((d) => add(d, { pushedAt: at, pushResult: { ...d.data().pushResult, status: 'interrupted' } }));
  if (updates.size) {
    const b = db.batch();
    for (const { ref, patch } of updates.values()) b.update(ref, patch);
    await b.commit();
  }
  const counts = { published: due.size, expired: ended.size, interrupted: stuck.size };
  if (updates.size) logEvent('announcements_job', counts);
  return counts;
}

// Staff callable behind the SIMS confirm dialog ("visible to about N
// guardians"). Coordinators can't read guardians/*, so the count is here.
export async function announcementAudienceCount({ db, profile }, { audienceKeys } = {}) {
  const keys = Array.isArray(audienceKeys) ? audienceKeys : [];
  if (!keys.length || keys.length > POST_KEYS.length || !keys.every((k) => POST_KEYS.includes(k))) {
    throw new CallableError('invalid-argument', 'Choose who the announcement is for.');
  }
  if (!coversPostKeys(profile, keys)) throw new CallableError('permission-denied', 'You can only post to your own grades.');
  const snap = await db.collection('guardians').where('audienceKeys', 'array-contains-any', keys).count().get();
  return { count: snap.data().count };
}
```

- [ ] **Step 4: Export the job and the callable**

In `functions/index.js`, change the Task 5 import to:

```js
import { handleAnnouncementWrite, publishDueAnnouncements, announcementAudienceCount } from './src/handlers/announcements.js';
```

After the `changeOwnPasswordFn` export add:

```js
// Any active staff member; the handler checks the audience is in their scope.
export const announcementAudienceCountFn = staffCall(announcementAudienceCount);
```

After the `reconcileEventsJob` export add:

```js
export const publishAnnouncementsJob = onSchedule({ schedule: '*/5 * * * *', ...SCHED }, () => publishDueAnnouncements(jobDeps()));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --prefix functions test && npm run test:functions`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/handlers/announcements.js functions/index.js functions/test/emulator/announcements.test.js
git commit -m "feat(functions): 5-minute announcements job and audience-count callable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: SIMS announcement helpers and data module

**Files:**
- Create: `src/lib/announcements.js`
- Create: `src/lib/announcements.test.js`
- Create: `src/data/announcements.js`

**Interfaces:**
- Consumes: Task 1 exports; `manilaDate`, `manilaTime` from `shared/dates.js`.
- Produces (`src/lib/announcements.js`):
  - `TABS: [['live','Live'],['scheduled','Scheduled'],['ended','Ended']]`
  - `tabOf(post): 'live'|'scheduled'|'ended'`, `postsForTab(posts, tab): post[]`
  - `audienceLabel(keys): string`, `pushStatusText(post): string`
  - `pinnedCount(posts, exceptId?): number`
  - `audienceOf(form): {all: true} | {grades: number[]}`
  - `emptyForm(me): Form`, `formFromPost(post): Form`
  - `validateForm(form, { me, nowMs, pinnedCount, editing }): string | null`
  - `Form` = `{ title, body, all: bool, grades: number[], when: 'now'|'schedule', date: 'YYYY-MM-DD', time: 'HH:MM', expires: 'YYYY-MM-DD'|'', pinned: bool, push: bool }`
- Produces (`src/data/announcements.js`): `announcements.create(form, me)`, `announcements.update(post, form, me)`, `announcements.unpublish(post, me)`, `announcements.remove(post)`, `announcements.audienceCount(keys): Promise<number>`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/announcements.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { tabOf, postsForTab, audienceLabel, pushStatusText, pinnedCount, audienceOf, emptyForm, formFromPost, validateForm } from './announcements.js';

const ms = (n) => ({ toMillis: () => n, toDate: () => new Date(n) });
const admin = { role: 'admin' }, jhs = { role: 'jhs_coord' }, glc8 = { role: 'glc', gradeLevel: 8 };
const NOW = Date.parse('2026-10-05T08:00:00+08:00');
const form = (over = {}) => ({ title: 'Brigada', body: 'Bring brooms.', all: true, grades: [], when: 'now', date: '', time: '', expires: '', pinned: false, push: false, ...over });

describe('tabs', () => {
  const posts = [
    { id: 'a', status: 'published', pinned: false, publishedAt: ms(3) },
    { id: 'b', status: 'published', pinned: true, publishedAt: ms(1) },
    { id: 'c', status: 'published', pinned: false, publishedAt: ms(5) },
    { id: 'd', status: 'scheduled', publishAt: ms(9) },
    { id: 'e', status: 'scheduled', publishAt: ms(7) },
    { id: 'f', status: 'unpublished', updatedAt: ms(2) },
    { id: 'g', status: 'expired', updatedAt: ms(4) },
  ];
  it('puts each status in its tab', () => {
    expect(tabOf(posts[0])).toBe('live');
    expect(tabOf(posts[3])).toBe('scheduled');
    expect(tabOf(posts[5])).toBe('ended');
  });
  it('sorts live pinned-first then newest, scheduled soonest, ended newest', () => {
    expect(postsForTab(posts, 'live').map((p) => p.id)).toEqual(['b', 'c', 'a']);
    expect(postsForTab(posts, 'scheduled').map((p) => p.id)).toEqual(['e', 'd']);
    expect(postsForTab(posts, 'ended').map((p) => p.id)).toEqual(['g', 'f']);
  });
  it('counts pinned published and scheduled posts, except the one being edited', () => {
    const pins = [{ id: 'x', status: 'published', pinned: true }, { id: 'y', status: 'scheduled', pinned: true }, { id: 'z', status: 'expired', pinned: true }];
    expect(pinnedCount(pins)).toBe(2);
    expect(pinnedCount(pins, 'x')).toBe(1);
  });
});

describe('labels', () => {
  it('describes the audience', () => {
    expect(audienceLabel(['all'])).toBe('All parents');
    expect(audienceLabel(['g7', 'g8'])).toBe('Grade 7 · Grade 8');
  });
  it('describes the push state', () => {
    expect(pushStatusText({ push: false })).toBe('No push');
    expect(pushStatusText({ push: true })).toBe('Push pending');
    expect(pushStatusText({ push: true, pushResult: { status: 'sending' } })).toBe('Push pending');
    expect(pushStatusText({ push: true, pushResult: { status: 'sent', devices: 6812 } })).toBe('Push sent to 6,812 devices');
    expect(pushStatusText({ push: true, pushResult: { status: 'sent', devices: 1 } })).toBe('Push sent to 1 device');
    expect(pushStatusText({ push: true, pushResult: { status: 'skipped_paused' } })).toBe('Push skipped: notifications paused');
    expect(pushStatusText({ push: true, pushResult: { status: 'interrupted' } })).toBe('Push may not have reached everyone');
    expect(pushStatusText({ push: true, pushResult: { status: 'failed' } })).toBe('Push may not have reached everyone');
  });
});

describe('form', () => {
  it('starts empty; a single-grade coordinator gets their grade', () => {
    expect(emptyForm(admin)).toMatchObject({ all: false, grades: [], when: 'now', push: false });
    expect(emptyForm(glc8).grades).toEqual([8]);
  });
  it('maps the form audience', () => {
    expect(audienceOf(form())).toEqual({ all: true });
    expect(audienceOf(form({ all: false, grades: [9, 7] }))).toEqual({ grades: [7, 9] });
  });
  it('reads a post back into the form in Philippine time', () => {
    const f = formFromPost({ title: 'T', body: 'B', audience: { grades: [7] }, status: 'scheduled', publishAt: ms(Date.parse('2026-10-06T07:30:00+08:00')), expiresAt: ms(Date.parse('2026-10-09T23:59:59.999+08:00')), pinned: true, push: true });
    expect(f).toEqual({ title: 'T', body: 'B', all: false, grades: [7], when: 'schedule', date: '2026-10-06', time: '07:30', expires: '2026-10-09', pinned: true, push: true });
  });
  it('validates content, scope, schedule, expiry and pins', () => {
    const v = (f, o = {}) => validateForm(f, { me: admin, nowMs: NOW, pinnedCount: 0, editing: null, ...o });
    expect(v(form())).toBeNull();
    expect(v(form({ title: '  ' }))).toBe('Enter a title.');
    expect(v(form({ title: 'x'.repeat(121) }))).toBe('The title can be at most 120 characters.');
    expect(v(form({ body: '' }))).toBe('Enter a message.');
    expect(v(form({ body: 'x'.repeat(5001) }))).toBe('The message can be at most 5,000 characters.');
    expect(v(form({ all: false, grades: [] }))).toBe('Choose who the announcement is for.');
    expect(v(form(), { me: jhs })).toBe('Only administrators can post to all parents.');
    expect(v(form({ all: false, grades: [11] }), { me: jhs })).toBe('You can only post to your own grades.');
    expect(v(form({ when: 'schedule', date: '', time: '' }))).toBe('Choose a date and time to publish.');
    expect(v(form({ when: 'schedule', date: '2026-10-05', time: '07:00' }))).toBe('Choose a publish time in the future.');
    expect(v(form({ when: 'schedule', date: '2026-10-05', time: '09:00' }))).toBeNull();
    expect(v(form({ expires: '2026-10-04' }))).toBe('The expiry date must be after the publish time.');
    expect(v(form({ pinned: true }), { pinnedCount: 3 })).toBe('Only 3 announcements can be pinned at once. Unpin one first.');
    expect(v(form({ pinned: true }), { pinnedCount: 3, editing: { pinned: true } })).toBeNull();
  });
  it('does not re-check the schedule of a live post being edited', () => {
    const live = { status: 'published', pinned: false };
    expect(validateForm(form({ when: 'schedule', date: '2026-01-01', time: '07:00' }), { me: admin, nowMs: NOW, pinnedCount: 0, editing: live })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/announcements.test.js`
Expected: FAIL — cannot resolve `./announcements.js`.

- [ ] **Step 3: Implement `src/lib/announcements.js`**

```js
import { TITLE_MAX, BODY_MAX, MAX_PINNED, canPostToAll, postableGrades, coversPostKeys, postAudienceKeys, toMillis, manilaDateTime, endOfManilaDay } from '../../shared/announcements.js';
import { manilaDate, manilaTime } from '../../shared/dates.js';

// Pure helpers behind the Announcements page (spec 2026-10-05).
export const TABS = [['live', 'Live'], ['scheduled', 'Scheduled'], ['ended', 'Ended']];
export const tabOf = (p) => (p.status === 'published' ? 'live' : p.status === 'scheduled' ? 'scheduled' : 'ended');

const by = (field, dir) => (a, b) => dir * ((toMillis(a[field]) ?? 0) - (toMillis(b[field]) ?? 0));
export function postsForTab(posts, tab) {
  const rows = posts.filter((p) => tabOf(p) === tab);
  if (tab === 'scheduled') return rows.sort(by('publishAt', 1));
  if (tab === 'live') return rows.sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true) || by('publishedAt', -1)(a, b));
  return rows.sort(by('updatedAt', -1));
}

export function audienceLabel(keys = []) {
  if (keys.includes('all')) return 'All parents';
  return keys.map((k) => `Grade ${k.slice(1)}`).join(' · ');
}

export function pushStatusText(p) {
  if (!p.push) return 'No push';
  const r = p.pushResult;
  if (!r || r.status === 'sending') return 'Push pending';
  if (r.status === 'sent') return `Push sent to ${r.devices.toLocaleString('en-US')} device${r.devices === 1 ? '' : 's'}`;
  if (r.status === 'skipped_paused') return 'Push skipped: notifications paused';
  return 'Push may not have reached everyone';
}

// Pinned posts that are live or will go live, so a scheduled pin can't make a fourth.
export const pinnedCount = (posts, exceptId) =>
  posts.filter((p) => (p.status === 'published' || p.status === 'scheduled') && p.pinned && p.id !== exceptId).length;

export const audienceOf = (f) => (f.all ? { all: true } : { grades: [...f.grades].map(Number).sort((a, b) => a - b) });

export function emptyForm(me) {
  const grades = postableGrades(me);
  return { title: '', body: '', all: false, grades: grades.length === 1 ? [...grades] : [], when: 'now', date: '', time: '', expires: '', pinned: false, push: false };
}

export function formFromPost(p) {
  const publish = toMillis(p.publishAt), expires = toMillis(p.expiresAt);
  return {
    title: p.title, body: p.body, all: !!p.audience?.all, grades: p.audience?.grades ? [...p.audience.grades] : [],
    when: p.status === 'scheduled' ? 'schedule' : 'now',
    date: publish == null ? '' : manilaDate(new Date(publish)), time: publish == null ? '' : manilaTime(new Date(publish)),
    expires: expires == null ? '' : manilaDate(new Date(expires)),
    pinned: !!p.pinned, push: !!p.push,
  };
}

// editing: the post being edited, or null for a new one. A live post's
// audience and timing are locked, so only its wording, pin and expiry are checked.
export function validateForm(f, { me, nowMs, pinnedCount: pins, editing }) {
  const title = f.title.trim(), body = f.body.trim();
  if (!title) return 'Enter a title.';
  if (title.length > TITLE_MAX) return `The title can be at most ${TITLE_MAX} characters.`;
  if (!body) return 'Enter a message.';
  if (body.length > BODY_MAX) return `The message can be at most ${BODY_MAX.toLocaleString('en-US')} characters.`;
  const live = editing?.status === 'published';
  let publishMs = nowMs;
  if (!live) {
    if (f.all && !canPostToAll(me)) return 'Only administrators can post to all parents.';
    const keys = postAudienceKeys(audienceOf(f));
    if (!keys.length) return 'Choose who the announcement is for.';
    if (!coversPostKeys(me, keys)) return 'You can only post to your own grades.';
    if (f.when === 'schedule') {
      if (!f.date || !f.time) return 'Choose a date and time to publish.';
      publishMs = manilaDateTime(f.date, f.time).getTime();
      if (publishMs <= nowMs) return 'Choose a publish time in the future.';
    }
  }
  if (f.expires && endOfManilaDay(f.expires).getTime() <= publishMs) return 'The expiry date must be after the publish time.';
  if (f.pinned && !editing?.pinned && pins >= MAX_PINNED) return `Only ${MAX_PINNED} announcements can be pinned at once. Unpin one first.`;
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/announcements.test.js`
Expected: PASS.

- [ ] **Step 5: Write the data module**

Create `src/data/announcements.js`:

```js
import { addDoc, collection, deleteDoc, doc, serverTimestamp, Timestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase.js';
import { postAudienceKeys, manilaDateTime, endOfManilaDay } from '../../shared/announcements.js';
import { audienceOf } from '../lib/announcements.js';

// Staff write announcements directly; firestore.rules enforces scope, shape
// and the allowed status moves. Functions own pushedAt/pushResult.
const author = (me) => ({ uid: auth.currentUser.uid, name: me.name || me.email });
const touch = (me) => ({ updatedBy: author(me), updatedAt: serverTimestamp() });
const expiresAtOf = (f) => (f.expires ? Timestamp.fromDate(endOfManilaDay(f.expires)) : null);
const ref = (post) => doc(db, 'announcements', post.id);

export const announcements = {
  create(f, me) {
    const audience = audienceOf(f);
    const timing = f.when === 'now'
      ? { status: 'published', publishAt: serverTimestamp(), publishedAt: serverTimestamp() }
      : { status: 'scheduled', publishAt: Timestamp.fromDate(manilaDateTime(f.date, f.time)) };
    return addDoc(collection(db, 'announcements'), {
      title: f.title.trim(), body: f.body.trim(), audience, audienceKeys: postAudienceKeys(audience),
      expiresAt: expiresAtOf(f), pinned: f.pinned, push: f.push,
      createdBy: author(me), createdAt: serverTimestamp(), ...touch(me), ...timing,
    });
  },
  // Scheduled: every field. Live: wording, pin and expiry only; "Edited"
  // (editedAt) only when the wording changed.
  update(post, f, me) {
    const title = f.title.trim(), body = f.body.trim();
    const common = { title, body, pinned: f.pinned, expiresAt: expiresAtOf(f), ...touch(me) };
    if (post.status === 'published') {
      const reworded = title !== post.title || body !== post.body;
      return updateDoc(ref(post), { ...common, ...(reworded ? { editedAt: serverTimestamp() } : {}) });
    }
    const audience = audienceOf(f);
    return updateDoc(ref(post), {
      ...common, audience, audienceKeys: postAudienceKeys(audience), push: f.push,
      publishAt: Timestamp.fromDate(manilaDateTime(f.date, f.time)),
    });
  },
  unpublish: (post, me) => updateDoc(ref(post), { status: 'unpublished', ...touch(me) }),
  remove: (post) => deleteDoc(ref(post)),
  audienceCount: async (audienceKeys) => (await httpsCallable(functions, 'announcementAudienceCountFn')({ audienceKeys })).data.count,
};
```

(Editing a scheduled post always goes through the form, whose `when` is `schedule` with a date and time — `formFromPost` fills them — so `manilaDateTime(f.date, f.time)` is always defined here.)

- [ ] **Step 6: Run the SIMS suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/announcements.js src/lib/announcements.test.js src/data/announcements.js
git commit -m "feat(sims): announcement form, tab and label helpers; data module

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: SIMS Announcements page

**Files:**
- Create: `src/pages/AnnouncementsPage.jsx`
- Create: `src/pages/announcements/AnnouncementForm.jsx`
- Modify: `src/lib/navigation.js`, `src/lib/access.js`, `src/lib/access.test.js`, `src/components/NavIcon.jsx`, `src/App.jsx`

**Interfaces:**
- Consumes: Task 7 (`src/lib/announcements.js`, `src/data/announcements.js`), Task 1 (`coversPostKeys`, `canPostToAll`, `postableGrades`, `toMillis`, `postAudienceKeys`), UI kit `Btn, Inp, Field, Card, Modal, Confirm, EmptyState, ResourceState, EditorResources` from `src/components/ui.jsx`, `T, S` from `src/styles.js`, `useCollectionResource` from `src/hooks/useCollection.js`.
- Produces: page key `announcements`; `AnnouncementsPage({ me })`; `AnnouncementForm({ me, editing, posts, onClose })`.

- [ ] **Step 1: Update the failing access test**

In `src/lib/access.test.js`, replace the `'coordinators open only the five shared pages'` test body's first assertion with:

```js
    expect(allowedPages(jhs)).toEqual(['dashboard', 'students', 'sections', 'schedules', 'attendance', 'announcements']);
```

and rename the test to `'coordinators open the shared pages, including Announcements'`. Add to the admin test's `arrayContaining` list: `'announcements'`.

Run: `npx vitest run src/lib/access.test.js`
Expected: FAIL — coordinator pages lack `announcements`.

- [ ] **Step 2: Nav item, access and icon**

`src/lib/navigation.js` — insert after the `guardians` item:

```js
  { key: 'announcements', label: 'Announcements', icon: 'announcements' },
```

`src/lib/access.js` — change the coordinator list to:

```js
const COORDINATOR_PAGES = ['dashboard', 'students', 'sections', 'schedules', 'attendance', 'announcements'];
```

`src/components/NavIcon.jsx` — add to `paths` after `guardians`:

```js
  announcements: 'M3 10v4h4l6 5V5l-6 5H3z M16 9a4 4 0 0 1 0 6 M19 6a8 8 0 0 1 0 12',
```

Run: `npx vitest run src/lib/access.test.js`
Expected: PASS.

- [ ] **Step 3: Write the form**

Create `src/pages/announcements/AnnouncementForm.jsx`:

```jsx
import { useState } from 'react';
import { announcements } from '../../data/announcements.js';
import { emptyForm, formFromPost, validateForm, pinnedCount, audienceOf, audienceLabel } from '../../lib/announcements.js';
import { TITLE_MAX, BODY_MAX, canPostToAll, postableGrades, postAudienceKeys } from '../../../shared/announcements.js';
import { T } from '../../styles.js';
import { Btn, Inp, Field, Modal, Confirm } from '../../components/ui.jsx';

const hint = { fontFamily: T.body, fontSize: 12, color: T.inkMuted, margin: '-8px 0 14px' };
const row = { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, fontFamily: T.body, fontSize: 13 };
const check = { display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' };

// Create (editing = null) or edit an announcement. A live post's audience,
// push and timing are shown but locked (spec: change them by unpublishing
// and posting again). New posts confirm with a guardian count first.
export default function AnnouncementForm({ me, editing, posts, onClose }) {
  const [f, setF] = useState(() => (editing ? formFromPost(editing) : emptyForm(me)));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { message } once counted
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const live = editing?.status === 'published';
  const grades = postableGrades(me);
  const lockedGrade = grades.length === 1;
  const toggleGrade = (g) => set('grades', f.grades.includes(g) ? f.grades.filter((x) => x !== g) : [...f.grades, g]);

  const problem = () => validateForm(f, { me, nowMs: Date.now(), pinnedCount: pinnedCount(posts, editing?.id), editing });
  const save = async () => {
    setBusy(true); setErr('');
    try { await (editing ? announcements.update(editing, f, me) : announcements.create(f, me)); onClose(); }
    catch (e) { setErr(e?.code === 'permission-denied' ? 'You can\'t save this announcement. Check its audience and timing.' : 'The announcement could not be saved. Please try again.'); setBusy(false); }
  };
  const submit = async () => {
    const p = problem(); if (p) { setErr(p); return; }
    if (editing) { await save(); return; }
    setBusy(true); setErr('');
    const keys = postAudienceKeys(audienceOf(f));
    let count = null;
    try { count = await announcements.audienceCount(keys); } catch { /* the count is a courtesy; still allow publishing */ }
    setBusy(false);
    const who = count == null ? 'the guardians' : `about ${count.toLocaleString('en-US')} guardian${count === 1 ? '' : 's'}`;
    const verb = f.when === 'now' ? 'This will be visible to' : 'When it goes out, this will be visible to';
    setConfirm({ message: `${verb} ${who} (${audienceLabel(keys)})${f.push ? ' and send them a notification' : ''}.` });
  };

  if (confirm) return (
    <Confirm title={f.when === 'now' ? 'Publish announcement' : 'Schedule announcement'} message={confirm.message}
      label={f.when === 'now' ? 'Publish' : 'Schedule'} danger={false}
      onYes={async () => { await (editing ? announcements.update(editing, f, me) : announcements.create(f, me)); onClose(); }}
      onNo={() => setConfirm(null)} />
  );

  return (
    <Modal title={editing ? 'Edit announcement' : 'New announcement'} onClose={onClose} dismissible={!busy} width={600}>
      {err && <p role="alert" className="sims-feedback">{err}</p>}
      <Field label="Title"><Inp value={f.title} maxLength={TITLE_MAX} onChange={(e) => set('title', e.target.value)} /></Field>
      <Field label="Message">
        <textarea className="sims-input" value={f.body} maxLength={BODY_MAX} rows={8} onChange={(e) => set('body', e.target.value)}
          style={{ fontFamily: T.body, fontSize: 13, width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${T.border}`, resize: 'vertical' }} />
      </Field>
      <p style={hint}>{f.body.length.toLocaleString('en-US')} / {BODY_MAX.toLocaleString('en-US')} · Links are made clickable automatically.</p>

      <fieldset disabled={live} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontFamily: T.body, fontSize: 12, fontWeight: 600, color: T.inkMuted, marginBottom: 6 }}>Audience</legend>
        <div style={row}>
          {canPostToAll(me) && <label style={check}><input type="checkbox" checked={f.all} onChange={(e) => set('all', e.target.checked)} /> All parents</label>}
          {!f.all && grades.map((g) => (
            <label key={g} style={check}><input type="checkbox" checked={f.grades.includes(g)} disabled={lockedGrade} onChange={() => toggleGrade(g)} /> Grade {g}</label>
          ))}
        </div>
        <legend style={{ fontFamily: T.body, fontSize: 12, fontWeight: 600, color: T.inkMuted, marginBottom: 6 }}>When</legend>
        <div style={row}>
          <label style={check}><input type="radio" name="when" checked={f.when === 'now'} onChange={() => set('when', 'now')} disabled={!!editing} /> Publish now</label>
          <label style={check}><input type="radio" name="when" checked={f.when === 'schedule'} onChange={() => set('when', 'schedule')} disabled={!!editing} /> Schedule</label>
          {f.when === 'schedule' && <>
            <Inp type="date" aria-label="Publish date" value={f.date} onChange={(e) => set('date', e.target.value)} style={{ width: 160 }} />
            <Inp type="time" aria-label="Publish time" value={f.time} onChange={(e) => set('time', e.target.value)} style={{ width: 120 }} />
          </>}
        </div>
        {f.when === 'schedule' && !live && <p style={hint}>Philippine time. Scheduled posts go out within 5 minutes of the set time.</p>}
        <div style={row}>
          <label style={check}><input type="checkbox" checked={f.push} onChange={(e) => set('push', e.target.checked)} /> Send push notification</label>
        </div>
        <p style={hint}>Use for urgent or time-sensitive notices.</p>
      </fieldset>
      {live && <p style={hint}>The audience, timing and push of a published announcement can't change. Unpublish it and post a new one instead.</p>}

      <div style={row}>
        <label style={check}>Expires on <Inp type="date" value={f.expires} onChange={(e) => set('expires', e.target.value)} style={{ width: 160 }} /></label>
        {f.expires && <Btn variant="ghost" onClick={() => set('expires', '')}>Clear</Btn>}
        <label style={check}><input type="checkbox" checked={f.pinned} onChange={(e) => set('pinned', e.target.checked)} /> Pin to top</label>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <Btn variant="ghost" disabled={busy} onClick={onClose}>Cancel</Btn>
        <Btn disabled={busy} onClick={submit}>{busy ? 'Working…' : editing ? 'Save changes' : f.when === 'now' ? 'Publish…' : 'Schedule…'}</Btn>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Write the page**

Create `src/pages/AnnouncementsPage.jsx`:

```jsx
import { useMemo, useState } from 'react';
import { useCollectionResource } from '../hooks/useCollection.js';
import { announcements } from '../data/announcements.js';
import { TABS, tabOf, postsForTab, audienceLabel, pushStatusText } from '../lib/announcements.js';
import { coversPostKeys, toMillis } from '../../shared/announcements.js';
import { T, S } from '../styles.js';
import { Btn, Card, Confirm, EmptyState, ResourceState, EditorResources } from '../components/ui.jsx';
import AnnouncementForm from './announcements/AnnouncementForm.jsx';

const when = (t) => {
  const ms = toMillis(t);
  return ms == null ? '—' : new Date(ms).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const EMPTY = {
  live: ['No published announcements', 'Post one with the New announcement button.'],
  scheduled: ['Nothing scheduled', 'Scheduled announcements wait here until they go out.'],
  ended: ['Nothing has ended yet', 'Unpublished and expired announcements are kept here.'],
};

export default function AnnouncementsPage({ me }) {
  const resource = useCollectionResource('announcements');
  const posts = resource.data;
  const [tab, setTab] = useState('live');
  const [form, setForm] = useState(null);       // {} = new, post = edit
  const [pending, setPending] = useState(null); // { kind: 'unpublish'|'delete', post }
  const rows = useMemo(() => postsForTab(posts, tab), [posts, tab]);
  const counts = useMemo(() => Object.fromEntries(TABS.map(([k]) => [k, posts.filter((p) => tabOf(p) === k).length])), [posts]);
  const mine = (p) => coversPostKeys(me, p.audienceKeys);
  const resources = [resource];

  return (
    <EditorResources resources={resources}><div>
      <ResourceState resources={resources} label="announcements">
        <div className="sims-heading" style={S.plate}>
          <h1 style={S.h1}>Announcements</h1>
          <Btn onClick={() => setForm({})}>New announcement</Btn>
        </div>
        <div role="tablist" aria-label="Announcement status" style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {TABS.map(([key, label]) => {
            const active = tab === key;
            return (
              <button key={key} role="tab" aria-selected={active} onClick={() => setTab(key)} style={{
                fontFamily: T.body, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                cursor: 'pointer', padding: '9px 18px', borderRadius: T.pill, border: 'none',
                background: active ? T.primary : 'transparent', color: active ? '#fff' : T.inkMuted,
              }}>{label} ({counts[key]})</button>
            );
          })}
        </div>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {rows.length === 0 ? <EmptyState title={EMPTY[tab][0]} hint={EMPTY[tab][1]} /> : (
            <div className="sims-table-scroll" role="region" aria-label="Announcements" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={S.thead}>{['Title', 'Audience', tab === 'scheduled' ? 'Goes out' : 'Published', 'Expires', 'Author', 'Push', ''].map((h) => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((p) => (
                <tr key={p.id}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{p.pinned && <span style={{ color: T.primary, fontWeight: 700 }}>Pinned · </span>}{p.title}{p.editedAt && <span style={{ color: T.inkMuted, fontWeight: 400 }}> (edited)</span>}</td>
                  <td style={S.td}>{audienceLabel(p.audienceKeys)}</td>
                  <td style={S.td}>{when(tab === 'scheduled' ? p.publishAt : p.publishedAt)}</td>
                  <td style={S.td}>{p.expiresAt ? when(p.expiresAt) : '—'}</td>
                  <td style={S.td}>{p.createdBy?.name || '—'}</td>
                  <td style={{ ...S.td, color: p.pushResult && ['interrupted', 'failed'].includes(p.pushResult.status) ? T.absent : T.ink }}>{pushStatusText(p)}</td>
                  <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {mine(p) && tab !== 'ended' && <Btn variant="ghost" onClick={() => setForm(p)} style={{ marginRight: 6 }}>Edit</Btn>}
                    {mine(p) && tab === 'live' && <Btn variant="ghost" onClick={() => setPending({ kind: 'unpublish', post: p })} style={{ color: T.absent, borderColor: T.absent }}>Unpublish</Btn>}
                    {mine(p) && tab === 'scheduled' && <Btn variant="ghost" onClick={() => setPending({ kind: 'delete', post: p })} style={{ color: T.absent, borderColor: T.absent }}>Delete</Btn>}
                    {!mine(p) && <span style={{ color: T.inkMuted }}>View only</span>}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </ResourceState>
      {form && <AnnouncementForm me={me} editing={form.id ? form : null} posts={posts} onClose={() => setForm(null)} />}
      {pending && (
        <Confirm
          title={pending.kind === 'unpublish' ? 'Unpublish announcement' : 'Delete announcement'}
          label={pending.kind === 'unpublish' ? 'Unpublish' : 'Delete'}
          message={pending.kind === 'unpublish'
            ? `Unpublish "${pending.post.title}"? It disappears from every parent's Notices tab right away. This can't be undone.`
            : `Delete the scheduled announcement "${pending.post.title}"? It will not go out.`}
          onYes={async () => { await (pending.kind === 'unpublish' ? announcements.unpublish(pending.post, me) : announcements.remove(pending.post)); setPending(null); }}
          onNo={() => setPending(null)} />
      )}
    </div></EditorResources>
  );
}
```

- [ ] **Step 5: Route it in `src/App.jsx`**

After the `AccountsPage` lazy import add:

```js
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage.jsx'));
```

After the `guardians` route line add:

```jsx
          {shown==='announcements' && <AnnouncementsPage me={me} />}
```

- [ ] **Step 6: Build and test**

Run: `npm test && npm run build`
Expected: tests PASS; Vite build succeeds with an `AnnouncementsPage-*.js` chunk.

- [ ] **Step 7: Commit**

```bash
git add src/pages/AnnouncementsPage.jsx src/pages/announcements/AnnouncementForm.jsx src/lib/navigation.js src/lib/access.js src/lib/access.test.js src/components/NavIcon.jsx src/App.jsx
git commit -m "feat(sims): Announcements page with tabs, form, confirm and unpublish

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Portal announcement helpers and strings

**Files:**
- Create: `parent/src/lib/announcements.js`
- Create: `parent/src/lib/announcements.test.js`
- Modify: `parent/src/strings.js`

**Interfaces:**
- Consumes: Task 1 (`toMillis`, `isVisibleToParents`), `manilaDate`, `manilaTime`, `formatScanTime` from `shared/dates.js` (portal imports shared as `../../../shared/...` from `parent/src/lib/`).
- Produces (`parent/src/lib/announcements.js`):
  - `linkify(text): Array<{type:'text', value} | {type:'link', href, value}>`
  - `audienceText(keys): string`
  - `splitForList(rows, nowMs): { pinned: post[], rest: post[] }`
  - `isNewSince(post, seenAt): boolean`
  - `hasUnread(newest, seenAt, nowMs): boolean`
  - `postDateLabel(at, now?: Date): string`
- New string keys: `navNotices`, `announcementsTitle`, `announcementsEmpty`, `announcementsError`, `announcementsPinned`, `announcementsNew`, `announcementsUnread`, `announcementEdited`, `announcementGone`, `audienceAll`, `audienceGrade`, `audienceGrades`, `announcementsAnd`, `announcementsToday`, `settingsAnnouncementToggle`.

- [ ] **Step 1: Write the failing test**

Create `parent/src/lib/announcements.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { linkify, audienceText, splitForList, isNewSince, hasUnread, postDateLabel } from './announcements.js';
import S from '../strings.js';

const ms = (n) => ({ toMillis: () => n });

describe('linkify', () => {
  it('links http and https URLs and keeps the rest as text', () => {
    expect(linkify('See https://deped.gov.ph/memo and http://x.ph now')).toEqual([
      { type: 'text', value: 'See ' },
      { type: 'link', href: 'https://deped.gov.ph/memo', value: 'https://deped.gov.ph/memo' },
      { type: 'text', value: ' and ' },
      { type: 'link', href: 'http://x.ph', value: 'http://x.ph' },
      { type: 'text', value: ' now' },
    ]);
  });
  it('leaves trailing punctuation out of the link', () => {
    expect(linkify('Form: https://forms.gle/abc.')).toEqual([
      { type: 'text', value: 'Form: ' },
      { type: 'link', href: 'https://forms.gle/abc', value: 'https://forms.gle/abc' },
      { type: 'text', value: '.' },
    ]);
  });
  it('never links other schemes', () => {
    for (const t of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://x.ph', 'xhttps://x.ph']) {
      expect(linkify(t).every((p) => p.type === 'text')).toBe(true);
    }
    expect(linkify('')).toEqual([]);
  });
});

describe('audienceText', () => {
  it('says who a post is for', () => {
    expect(audienceText(['all'])).toBe('For all parents');
    expect(audienceText(['g7'])).toBe('For parents in Grade 7');
    expect(audienceText(['g7', 'g8'])).toBe('For parents in Grades 7 and 8');
    expect(audienceText(['g7', 'g8', 'g11'])).toBe('For parents in Grades 7, 8 and 11');
  });
});

describe('list', () => {
  it('drops expired posts and puts pinned ones in their own group, keeping order', () => {
    const rows = [
      { id: 'a', status: 'published', pinned: false },
      { id: 'b', status: 'published', pinned: true },
      { id: 'c', status: 'published', pinned: false, expiresAt: ms(5) },
    ];
    const { pinned, rest } = splitForList(rows, 10);
    expect(pinned.map((p) => p.id)).toEqual(['b']);
    expect(rest.map((p) => p.id)).toEqual(['a']);
  });
  it('marks posts newer than the last visit', () => {
    expect(isNewSince({ publishedAt: ms(5) }, ms(4))).toBe(true);
    expect(isNewSince({ publishedAt: ms(5) }, ms(5))).toBe(false);
    expect(isNewSince({ publishedAt: ms(5) }, null)).toBe(true);
    expect(isNewSince({ publishedAt: ms(5) }, undefined)).toBe(true);
  });
  it('shows the dot only for a visible post newer than the last visit', () => {
    const newest = { status: 'published', publishedAt: ms(5), expiresAt: null };
    expect(hasUnread(newest, ms(4), 10)).toBe(true);
    expect(hasUnread(newest, ms(6), 10)).toBe(false);
    expect(hasUnread({ ...newest, expiresAt: ms(8) }, ms(4), 10)).toBe(false);
    expect(hasUnread(undefined, null, 10)).toBe(false);
  });
});

describe('postDateLabel', () => {
  const now = new Date('2026-10-05T15:00:00+08:00');
  it('says Today with the time for today', () => {
    expect(postDateLabel(new Date('2026-10-05T07:30:00+08:00'), now)).toBe(`${S.announcementsToday}, 07:30 AM`);
  });
  it('says the month and day for earlier days, adding the year when it differs', () => {
    expect(postDateLabel(ms(Date.parse('2026-10-03T09:00:00+08:00')), now)).toBe('Oct 3');
    expect(postDateLabel(new Date('2025-12-24T09:00:00+08:00'), now)).toBe('Dec 24, 2025');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix parent test -- src/lib/announcements.test.js`
Expected: FAIL — cannot resolve `./announcements.js`.

- [ ] **Step 3: Add the strings**

In `parent/src/strings.js`, add before `navHome: 'Home',`:

```js
  announcementsTitle: 'Announcements',
  announcementsEmpty: "No announcements yet. School notices for your learner's grade will appear here.",
  announcementsError: 'Could not load announcements right now. Please try again in a moment.',
  announcementsPinned: 'Pinned',
  announcementsNew: 'New',
  announcementsUnread: 'New announcements',
  announcementEdited: 'Edited',
  announcementGone: 'This announcement is no longer available.',
  audienceAll: 'For all parents',
  audienceGrade: 'For parents in Grade',
  audienceGrades: 'For parents in Grades',
  announcementsAnd: 'and',
  announcementsToday: 'Today',
  settingsAnnouncementToggle: 'Send me a notification for school announcements',
```

and after `navInbox: 'Inbox',` add:

```js
  navNotices: 'Notices',
```

- [ ] **Step 4: Implement `parent/src/lib/announcements.js`**

```js
import S from '../strings.js';
import { toMillis, isVisibleToParents } from '../../../shared/announcements.js';
import { manilaDate, manilaTime, formatScanTime } from '../../../shared/dates.js';

// Only http(s) URLs ever become links; everything else stays plain text
// (no HTML is stored or rendered). Trailing sentence punctuation is left
// out of the link: "see https://x.ph." links https://x.ph.
const URL_RE = /\bhttps?:\/\/[^\s<>"]+/gi;
const TRAIL = /[.,;:!?)\]}'"]+$/;
export function linkify(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(TRAIL, '');
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'link', href: url, value: url });
    last = m.index + url.length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

export function audienceText(keys = []) {
  if (keys.includes('all')) return S.audienceAll;
  const grades = keys.map((k) => k.slice(1));
  if (grades.length === 1) return `${S.audienceGrade} ${grades[0]}`;
  return `${S.audienceGrades} ${grades.slice(0, -1).join(', ')} ${S.announcementsAnd} ${grades[grades.length - 1]}`;
}

// rows arrive newest first from the query; keep that order in both groups.
export function splitForList(rows, nowMs) {
  const visible = rows.filter((p) => isVisibleToParents(p, nowMs));
  return { pinned: visible.filter((p) => p.pinned), rest: visible.filter((p) => !p.pinned) };
}

export function isNewSince(post, seenAt) {
  const seen = toMillis(seenAt);
  return seen == null || (toMillis(post.publishedAt) ?? 0) > seen;
}

export const hasUnread = (newest, seenAt, nowMs) => !!newest && isVisibleToParents(newest, nowMs) && isNewSince(newest, seenAt);

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function postDateLabel(at, now = new Date()) {
  const d = at instanceof Date ? at : new Date(toMillis(at));
  const day = manilaDate(d);
  if (day === manilaDate(now)) return `${S.announcementsToday}, ${formatScanTime(manilaTime(d))}`;
  const [y, m, dd] = day.split('-').map(Number);
  const label = `${MON[m - 1]} ${dd}`;
  return String(y) === manilaDate(now).slice(0, 4) ? label : `${label}, ${y}`;
}
```

- [ ] **Step 5: Run the portal tests**

Run: `npm --prefix parent test`
Expected: PASS — including `strings.test.js` (no empty values, no forbidden words).

- [ ] **Step 6: Commit**

```bash
git add parent/src/lib/announcements.js parent/src/lib/announcements.test.js parent/src/strings.js
git commit -m "feat(parent): announcement link, audience, unread and date helpers; strings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Portal Notices tab — navigation, routes, query hook and unread dot

**Files:**
- Create: `parent/src/hooks/useAnnouncements.js`
- Modify: `parent/src/lib/nav.js`, `parent/src/lib/nav.test.js`, `parent/src/lib/router.js`, `parent/src/lib/router.test.js`
- Modify: `parent/src/components/Icon.jsx`, `parent/src/components/Shell.jsx`, `parent/src/glass.css`

**Interfaces:**
- Consumes: `hasUnread` (Task 9), `useQuery` from `parent/src/hooks/useDoc.js`.
- Produces:
  - `useAnnouncements(profile, max): { rows: post[] | undefined, error: string | null }`
  - Routes `announcements` (`/announcements`) and `announcement` (`/announcements/:id`, param `id`).
  - `NAV_TABS` entry `{ key: 'notices', path: '/announcements' }`.
  - `Shell` accepts an optional `profile` prop.

- [ ] **Step 1: Update the failing nav and router tests**

In `parent/src/lib/nav.test.js`:
- Replace the `NAV_TABS` expectation with:

```js
    expect(NAV_TABS).toEqual([
      { key: 'home', path: '/' },
      { key: 'notices', path: '/announcements' },
      { key: 'inbox', path: '/inbox' },
      { key: 'settings', path: '/settings' },
    ]);
```

  and rename that test to `'lists Home, Notices, Inbox, Settings in order with their paths'`.
- Add inside `describe('activeTab', …)`:

```js
  it('lights Notices for the list and a single announcement', () => {
    expect(activeTab('announcements')).toBe('notices');
    expect(activeTab('announcement')).toBe('notices');
  });
```

- In the `showsAppTitle` "hides" test, change the array to `['home', 'learner', 'inbox', 'settings', 'announcements', 'announcement']`.

In `parent/src/lib/router.test.js`, add inside `describe('matchRoute', …)`:

```js
  it('matches the announcement routes', () => {
    expect(matchRoute('/announcements', '')).toEqual({ name: 'announcements', params: {}, query: {} });
    expect(matchRoute('/announcements/a1', '')).toEqual({ name: 'announcement', params: { id: 'a1' }, query: {} });
  });
```

Run: `npm --prefix parent test`
Expected: FAIL on the new/changed expectations.

- [ ] **Step 2: Routes and nav**

`parent/src/lib/router.js` — add after the `inbox` route:

```js
  ['announcements', /^\/announcements$/],
  ['announcement', /^\/announcements\/([^/]+)$/, ['id']],
```

`parent/src/lib/nav.js` — replace the file body with:

```js
// Bottom-nav tabs and which one a route lights up. Pulled out of Shell so
// the mapping is testable without rendering.
export const NAV_TABS = [
  { key: 'home', path: '/' },
  { key: 'notices', path: '/announcements' },
  { key: 'inbox', path: '/inbox' },
  { key: 'settings', path: '/settings' },
];

const ROUTE_TAB = {
  home: 'home', learner: 'home',
  announcements: 'notices', announcement: 'notices',
  inbox: 'inbox', report: 'inbox', // a report is opened from an inbox item or its push
  settings: 'settings',
};

export const activeTab = (routeName) => ROUTE_TAB[routeName] ?? null;

// Screens that draw their own PageHeader drop the app-name line above it.
const OWN_HEADER = new Set(['home', 'learner', 'inbox', 'settings', 'announcements', 'announcement']);
export const showsAppTitle = (routeName) => !OWN_HEADER.has(routeName);
```

Run: `npm --prefix parent test`
Expected: PASS.

- [ ] **Step 3: The query hook**

Create `parent/src/hooks/useAnnouncements.js`:

```js
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useQuery } from './useDoc.js';

// Published posts for this guardian's audience keys, newest first. The
// rules accept exactly this shape: the guardian's own keys, status ==
// 'published', and a limit ≤ 50. No keys (no active link) → no posts.
export function useAnnouncements(profile, max) {
  const keys = profile?.audienceKeys || [];
  const signature = keys.join(',');
  const { rows, error } = useQuery(() => (keys.length
    ? query(collection(db, 'announcements'), where('audienceKeys', 'array-contains-any', keys), where('status', '==', 'published'), orderBy('publishedAt', 'desc'), limit(max))
    : null), [signature, max]);
  if (!keys.length) return { rows: profile ? [] : undefined, error: null };
  return { rows, error };
}
```

- [ ] **Step 4: Megaphone icon**

In `parent/src/components/Icon.jsx`, add constants after `TRAY_LIP`:

```js
const MEGAPHONE = 'M3 10v4a1 1 0 0 0 1 1h3l6 4.5V4.5L7 9H4a1 1 0 0 0-1 1z';
const WAVES = 'M16.5 9a4 4 0 0 1 0 6 M19.5 6.5a8 8 0 0 1 0 11';
```

and inside the `<svg>` after the `inbox` line:

```jsx
      {name === 'notices' && <><path d={MEGAPHONE} fill={fill} /><path d={WAVES} /></>}
```

- [ ] **Step 5: Unread dot in the Shell**

In `parent/src/components/Shell.jsx`:

1. Add imports:

```js
import { useAnnouncements } from '../hooks/useAnnouncements.js';
import { hasUnread } from '../lib/announcements.js';
```

2. Change `const LABEL = …` to:

```js
const LABEL = { home: S.navHome, notices: S.navNotices, inbox: S.navInbox, settings: S.navSettings };
```

3. Change `function GlassNav({ route, navigate }) {` to `function GlassNav({ route, navigate, unread }) {` and replace the icon line inside the button:

```jsx
            <span className="gnav-icon"><Icon name={key} filled={on} size={22} />{key === 'notices' && unread && <span className="gnav-dot" />}</span>
            <span className="gnav-label">{LABEL[key]}{key === 'notices' && unread && <span className="sr-only">, {S.announcementsUnread}</span>}</span>
```

4. Change the `Shell` signature and body start to:

```jsx
export default function Shell({ route, navigate, profile, children }) {
  const portal = useDoc('settings/parent_portal').data;
  // One read per app open: just the newest post this guardian can see.
  const { rows: newest } = useAnnouncements(profile, 1);
  const unread = hasUnread(newest?.[0], profile?.announcementsSeenAt, Date.now());
```

5. Change `<GlassNav route={route} navigate={navigate} />` to `<GlassNav route={route} navigate={navigate} unread={unread} />`.

- [ ] **Step 6: Dot styles**

Append to `parent/src/glass.css`:

```css
/* ---- Notices unread dot ---- */
.gnav-icon { position: relative; display: inline-flex; }
.gnav-dot {
  position: absolute; top: -1px; right: -2px;
  width: 9px; height: 9px; border-radius: 50%;
  background: #DC2626; /* T.danger */
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.95);
}
.sr-only {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); margin: -1px; padding: 0; white-space: nowrap;
}
```

(`.sr-only` does not exist yet in the portal styles; this adds it.)

- [ ] **Step 7: Build and test**

Run: `npm --prefix parent test && npm --prefix parent run build`
Expected: PASS; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add parent/src/hooks/useAnnouncements.js parent/src/lib/nav.js parent/src/lib/nav.test.js parent/src/lib/router.js parent/src/lib/router.test.js parent/src/components/Icon.jsx parent/src/components/Shell.jsx parent/src/glass.css
git commit -m "feat(parent): Notices tab, announcement routes, query hook and unread dot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Portal screens, Settings switch and app wiring

**Files:**
- Create: `parent/src/screens/Announcements.jsx`
- Create: `parent/src/screens/AnnouncementDetail.jsx`
- Modify: `parent/src/screens/Settings.jsx`
- Modify: `parent/src/App.jsx`

**Interfaces:**
- Consumes: `useAnnouncements` (Task 10), Task 9 helpers, `useDoc` from `parent/src/hooks/useDoc.js`, `PageHeader`, `Card`, `Spinner`, `EmptyState`.
- Produces: `Announcements({ user, profile, navigate })`, `AnnouncementDetail({ navigate, id })`.

- [ ] **Step 1: The list screen**

Create `parent/src/screens/Announcements.jsx`:

```jsx
import { useEffect, useRef } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Card, Spinner, EmptyState } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useAnnouncements } from '../hooks/useAnnouncements.js';
import { splitForList, isNewSince, audienceText, postDateLabel } from '../lib/announcements.js';

function PostCard({ post, isNew, onOpen }) {
  return (
    <Card style={{ padding: 0 }}>
      <button type="button" onClick={onOpen} style={{ all: 'unset', display: 'block', width: '100%', boxSizing: 'border-box', padding: 16, cursor: 'pointer', fontFamily: T.font }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
          <strong style={{ fontSize: 16, color: T.ink }}>{post.title}</strong>
          {isNew && <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, color: '#fff', background: T.primary, borderRadius: T.pill, padding: '2px 8px' }}>{S.announcementsNew}</span>}
        </div>
        <div style={{ fontSize: 14, color: T.ink, marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{post.body}</div>
        <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 8 }}>{postDateLabel(post.publishedAt)} · {audienceText(post.audienceKeys)}</div>
      </button>
    </Card>
  );
}

export default function Announcements({ user, profile, navigate }) {
  const { rows, error } = useAnnouncements(profile, 50);
  // "New" compares against the last visit as it was when this screen
  // opened; the seen-at write below must not clear the markers mid-visit.
  const seenAtOpen = useRef(undefined);
  if (seenAtOpen.current === undefined && profile) seenAtOpen.current = profile.announcementsSeenAt ?? null;
  const marked = useRef(false);
  useEffect(() => {
    if (!rows || error || marked.current) return;
    marked.current = true;
    updateDoc(doc(db, 'guardians', user.uid), { announcementsSeenAt: serverTimestamp() }).catch(() => {});
  }, [rows, error, user.uid]);

  const header = <PageHeader title={S.announcementsTitle} />;
  if (rows === undefined) return <>{header}<Spinner label={S.loading} /></>;
  if (error) return <>{header}<EmptyState hint={S.announcementsError} /></>;
  const { pinned, rest } = splitForList(rows, Date.now());
  if (!pinned.length && !rest.length) return <>{header}<EmptyState hint={S.announcementsEmpty} /></>;
  const card = (p) => <PostCard key={p.id} post={p} isNew={isNewSince(p, seenAtOpen.current)} onOpen={() => navigate(`/announcements/${p.id}`)} />;
  return (
    <>
      {header}
      {pinned.length > 0 && <h2 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: T.inkMuted, margin: '4px 0 8px' }}>{S.announcementsPinned}</h2>}
      {pinned.map(card)}
      {pinned.length > 0 && rest.length > 0 && <div style={{ height: 8 }} />}
      {rest.map(card)}
    </>
  );
}
```

- [ ] **Step 2: The detail screen**

Create `parent/src/screens/AnnouncementDetail.jsx`:

```jsx
import S from '../strings.js';
import { T } from '../styles.js';
import { Card, Spinner, EmptyState } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useDoc } from '../hooks/useDoc.js';
import { isVisibleToParents } from '../../../shared/announcements.js';
import { linkify, audienceText, postDateLabel } from '../lib/announcements.js';

export default function AnnouncementDetail({ navigate, id }) {
  const { data: post, error } = useDoc(`announcements/${id}`);
  const back = () => navigate('/announcements');
  if (post === undefined && !error) return <><PageHeader title={S.announcementsTitle} onBack={back} /><Spinner label={S.loading} /></>;
  // Denied (not theirs / unpublished) and missing look the same to a parent.
  if (!post || error || !isVisibleToParents(post, Date.now())) return <><PageHeader title={S.announcementsTitle} onBack={back} /><EmptyState hint={S.announcementGone} /></>;
  return (
    <>
      <PageHeader title={post.title} onBack={back} />
      <Card>
        <div style={{ fontSize: 12, color: T.inkMuted, marginBottom: 12 }}>
          {postDateLabel(post.publishedAt)} · {audienceText(post.audienceKeys)}{post.editedAt ? ` · ${S.announcementEdited}` : ''}
        </div>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.ink, margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {linkify(post.body).map((part, i) => (part.type === 'link'
            ? <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" style={{ color: T.primary }}>{part.value}</a>
            : <span key={i}>{part.value}</span>))}
        </p>
      </Card>
    </>
  );
}
```

- [ ] **Step 3: The Settings switch**

In `parent/src/screens/Settings.jsx`:

1. After `const accountEnabled = profile?.notificationsEnabled !== false;` add:

```js
  const announcementPush = profile?.announcementPushEnabled !== false;
```

2. After the `toggleAccount` line add:

```js
  const toggleAnnouncements = () => updateDoc(doc(db, 'guardians', user.uid), { announcementPushEnabled: !announcementPush }).catch(() => setErr(S.reportFailed));
```

3. Right after the existing account-toggle `</label>` in the notifications card, add:

```jsx
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, opacity: accountEnabled ? 1 : 0.55 }}>
          <input type="checkbox" checked={accountEnabled && announcementPush} disabled={!accountEnabled} onChange={toggleAnnouncements} style={{ width: 22, height: 22 }} />{S.settingsAnnouncementToggle}
        </label>
```

- [ ] **Step 4: Wire the app**

In `parent/src/App.jsx`:

1. After the `Settings` lazy import add:

```js
const Announcements = lazy(() => import('./screens/Announcements.jsx'));
const AnnouncementDetail = lazy(() => import('./screens/AnnouncementDetail.jsx'));
```

2. Replace the foreground-message line with:

```js
    onForegroundMessage((payload) => {
      const id = payload?.data?.announcementId;
      navigate(id ? `/announcements/${encodeURIComponent(id)}` : '/inbox');
    }).then((unsub) => { off = unsub; });
```

3. Change the no-profile gate list to include the new routes:

```js
  else if (!profile && ['home', 'learner', 'inbox', 'settings', 'report', 'announcements', 'announcement'].includes(route.name)) screen = <Activate {...props} />;
```

4. Add cases to the `switch` after `case 'inbox':`:

```js
    case 'announcements': screen = <Announcements {...props} />; break;
    case 'announcement': screen = <AnnouncementDetail {...props} id={route.params.id} />; break;
```

5. Pass the profile to the final Shell (the last `return` only):

```jsx
  return <Shell route={route} navigate={navigate} profile={profile}><Suspense fallback={<Spinner label={S.loading} />}>{screen}</Suspense></Shell>;
```

- [ ] **Step 5: Build, size check and tests**

Run: `npm --prefix parent test && npm --prefix parent run build && npm --prefix parent run size`
Expected: PASS; build succeeds; size check passes (the new screens are lazy chunks; the eager bundle grows only by the hook, helpers and icon).

- [ ] **Step 6: Commit**

```bash
git add parent/src/screens/Announcements.jsx parent/src/screens/AnnouncementDetail.jsx parent/src/screens/Settings.jsx parent/src/App.jsx
git commit -m "feat(parent): Announcements list and detail screens; announcement push switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Docs, full verification and browser check

**Files:**
- Modify: `docs/parent-portal-runbook.md`
- Modify: `docs/guardian-account-guide.md`

- [ ] **Step 1: Runbook section**

Append to `docs/parent-portal-runbook.md`:

```markdown
## Announcements

Staff post from **SIMS → Announcements**. Admins can post to all parents or any grade;
JHS/SHS coordinators to their grades; grade-level coordinators to their own grade.

- **Publish now** shows the post at once. **Schedule** sends it within 5 minutes of the set
  Philippine time (`publishAnnouncementsJob`, every 5 minutes).
- **Push** is off by default. Use it only for urgent notices. It goes to guardians who keep
  both "notifications for new gate scans" and "notifications for school announcements" on.
  The **Pause notifications** switch in Portal Settings also stops announcement pushes
  (the post shows "Push skipped: notifications paused").
- **Push results** appear in the Push column. "Push may not have reached everyone" means the
  send was interrupted or failed; pushes are never re-sent automatically. Post a short
  follow-up with push on if it must reach everyone.
- A published post's audience and push can't change. Unpublish it and post a new one.
- Who sees what is `guardians/{uid}.audienceKeys`, kept by `onGuardianLinkWritten` and the
  nightly `expireLinksJob`. After the first deploy, run
  `node functions/scripts/backfillGuardianAudience.mjs <projectId> --apply` once.
- Every publish, edit, unpublish, delete, go-out and expiry is in `audit_log`
  (`targetType: 'announcement'`).
```

- [ ] **Step 2: Guardian guide line**

In `docs/guardian-account-guide.md`, insert this section immediately before `## Troubleshooting`:

```markdown
## School announcements

The **Notices** tab shows school announcements for your learner's grade. A red dot means
there is something new. In **Settings** you can turn announcement notifications off and
still get gate-scan notifications.
```

- [ ] **Step 3: Run every suite**

Run: `npm run test:all`
Expected: PASS for SIMS unit, functions unit, portal unit, rules and functions emulator suites. Paste the summary lines into the task report; if anything fails, fix it before continuing.

- [ ] **Step 4: Browser check (SIMS)**

Start the emulators with seeded data and the SIMS dev server (per `tests/browser/README.md` / the project's run skill). Stop only the processes you started (by PID or task id) — never kill `node` by name. Then:
1. As an admin, open Announcements and create a school-wide post with push off. Check the confirm dialog names the guardian count. Check the post appears under Live.
2. Create a scheduled grade-7 post. Check it appears under Scheduled, edit it, then delete it.
3. Sign in as a JHS coordinator. Check "All parents" isn't offered, grades 8–12 beyond their scope aren't offered, and the admin's school-wide post shows "View only".
4. Pin 3 posts and try a fourth. Check the form refuses it.

- [ ] **Step 5: Browser check (portal) at 375px**

With the portal dev server (`npm --prefix parent run dev`, port 5174) at the mobile viewport, signed in as a seeded guardian whose `audienceKeys` include `g7`:
1. Check the Notices tab shows a red dot, and the list shows Pinned first and the New badges.
2. Open a post. Check links are clickable and open in a new tab, "Edited" shows after a SIMS edit, and Back returns to the list.
3. Leave and reopen the tab. Check the dot is gone and the New badges have cleared.
4. Unpublish the post in SIMS. Check the detail page now says "This announcement is no longer available."
5. Settings: check the announcement switch is disabled when the main switch is off.

Reset the viewport to desktop afterwards.

- [ ] **Step 6: Commit**

```bash
git add docs/parent-portal-runbook.md docs/guardian-account-guide.md
git commit -m "docs(announcements): runbook and guardian guide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Rollout (after merge — not part of task execution)

1. `firebase deploy --only firestore:indexes` and wait for the indexes to build (Firebase console → Firestore → Indexes).
2. `firebase deploy --only firestore:rules,functions` (IPv4-first + longer discovery timeout on this machine).
3. `node scripts/syncShared.mjs && node functions/scripts/backfillGuardianAudience.mjs <projectId>` (dry run), then with `--apply`. Spot-check a few `guardians/*` docs.
4. `npm --prefix parent run build && firebase deploy --only hosting:parent`.
5. `npm run deploy` (SIMS hosting).
6. Smoke test: an admin publishes a harmless school-wide post with push off, confirms it on a guardian test account, then unpublishes it.
