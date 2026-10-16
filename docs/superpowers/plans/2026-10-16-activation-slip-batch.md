# Activation Slip Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff collect learners from any section in a saved, shared slip batch, issue all their activation slips in one press, and print them on full sheets.

**Architecture:** A new Firestore collection `slip_batch/{studentId}` (admin read/write, like `id_card_batch`) stores who is waiting and why, never codes. A new admin callable `issueSlipBatch` reads the batch server-side, issues up to 64 slips through the existing `issueCodeFor`, removes the issued learners and returns the raw codes once. The SIMS Issue slips tab gets "By section" / "Saved batch" sub-tabs, and the Learner access tab gets an "Add to slip batch" button.

**Tech Stack:** React 19 + Vite (SIMS), Firebase Functions v2 (Node 22, Admin SDK), Firestore security rules, Vitest (unit, emulator, rules).

**Spec:** `docs/superpowers/specs/2026-10-16-activation-slip-batch-design.md`

## Global Constraints

- Raw codes are never stored: not in `slip_batch`, not in the audit log. They exist only in the callable's response and the issuing screen's state.
- `slip_batch` documents hold exactly `addedAt`, `addedBy`, `reason`; `reason` is a string of 1–200 characters.
- One press issues at most `MAX_BATCH_ISSUE = 64` learners, oldest `addedAt` first.
- Rate limit `issueSlipBatch`: `{ windowMs: 24 * 60 * 60 * 1000, max: 100 }` per staff uid, message: "Slip batches were issued 100 times in the last 24 hours, the daily limit. You can issue more after {Manila date and time}."
- Audit: one `code.reissued` entry per issued learner, `details: { schoolYear, reason, via: 'batch', guardianSlotsFree, adviserSlotsFree }`.
- Skip reasons: `missing`, `restricted`, `not-enrolled`, `fully-linked`. Skipped learners stay in the batch.
- Reasons offered: `Lost slip`, `Damaged slip`, `New enrollee / transferee`, `Section changed`, `Other` (stored as `Other: {note}`).
- Every new SIMS control on the slip screens carries the `slips-print-hide` class (or sits inside an element that has it, or inside `.codes-tab-controls`) so only slip sheets print.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- On this Windows machine, prefix every `npx firebase …` command with `NODE_OPTIONS=--dns-result-order=ipv4first` (IPv6 to googleapis is flaky).
- Do not deploy anything as part of this plan. Production rules are the password-only release rules; adding `slip_batch` there is a release step (see Task 7).

## File Map

| File | Responsibility |
|---|---|
| `firestore.rules` (modify) | `slip_batch` match |
| `tests/rules/slipBatch.test.js` (create) | rules tests |
| `functions/src/lib/slipBatch.js` (create) | `MAX_BATCH_ISSUE`, `takeBatch`, `compareSlipEntries` |
| `functions/src/lib/slipBatch.test.js` (create) | unit tests for the above |
| `functions/src/callable.js` (modify) | `LIMITS.issueSlipBatch` |
| `functions/src/handlers/codes.js` (modify) | `issueSlipBatch` handler (reuses private `issueCodeFor`, `assertYearOpen`) |
| `functions/index.js` (modify) | `issueSlipBatchFn` export |
| `functions/test/emulator/slipBatch.test.js` (create) | emulator tests |
| `src/lib/slipLayout.js` (modify) | `slipSheetFillLabel` |
| `src/lib/slipIssue.js` (modify) | `not-enrolled` reason, `remaining`, `skipReasonText` |
| `src/lib/slipBatch.js` (create) | reasons list, `batchReason`, `issueButtonLabel`, `splitSlipBatch` |
| `src/lib/slipBatch.test.js` (create) | unit tests |
| `src/data/slipBatch.js` (create) | Firestore writes for the batch |
| `src/data/guardians.js` (modify) | `call.issueSlipBatch` |
| `src/pages/guardians/SectionSlipsTab.jsx` (rename from `CodesTab.jsx`) | today's By section screen, unchanged |
| `src/pages/guardians/CodesTab.jsx` (create, new content) | sub-tab switcher |
| `src/pages/guardians/SlipBatchTab.jsx` (create) | Saved batch screen |
| `src/pages/guardians/LinksTab.jsx` (modify) | Add to slip batch button |
| `src/pages/GuardiansPage.jsx` (modify) | pass `me` to CodesTab and LinksTab |

---

### Task 1: `slip_batch` security rules

**Files:**
- Modify: `firestore.rules:154` (after the `id_card_batch` match)
- Test: `tests/rules/slipBatch.test.js`

**Interfaces:**
- Produces: collection `slip_batch/{studentId}` writable by admins with fields `{ addedAt, addedBy, reason }`.

- [ ] **Step 1: Write the failing rules test**

Create `tests/rules/slipBatch.test.js`:

```js
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { setup, seed, seedBaseline, as, anon, ok, denied, STAFF, JHS, KIOSK, GUARDIAN_A, ANON } from './helpers.js';

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await seedBaseline(env);
  await seed(env, async (db) => {
    await db.doc('users/jhs@bnhs.edu').set({ name: 'JHS', role: 'jhs_coord', gradeLevel: null, disabled: false });
    await db.doc('slip_batch/S1').set({ addedAt: new Date(), addedBy: 'registrar@bnhs.edu', reason: 'Lost slip' });
  });
});

const entry = (over = {}) => ({ addedAt: new Date(), addedBy: 'someone@bnhs.edu', reason: 'Lost slip', ...over });

describe('slip_batch', () => {
  it('admins read, add, update and remove batch learners', async () => {
    const db = as(env, STAFF);
    await ok(db.collection('slip_batch').get());
    await ok(db.doc('slip_batch/S2').set(entry()));
    await ok(db.doc('slip_batch/S2').set(entry({ reason: 'Other: torn in half' })));
    await ok(db.doc('slip_batch/S1').delete());
  });

  it('admins cannot store anything but addedAt, addedBy and reason', async () => {
    const db = as(env, STAFF);
    await denied(db.doc('slip_batch/S2').set(entry({ code: 'ABCD2345' })));
    await denied(db.doc('slip_batch/S2').set({ addedAt: new Date(), addedBy: 'someone@bnhs.edu' }));
  });

  it('the reason must be 1 to 200 characters of text', async () => {
    const db = as(env, STAFF);
    await denied(db.doc('slip_batch/S2').set(entry({ reason: '' })));
    await denied(db.doc('slip_batch/S2').set(entry({ reason: 'x'.repeat(201) })));
    await denied(db.doc('slip_batch/S2').set(entry({ reason: 42 })));
    await ok(db.doc('slip_batch/S2').set(entry({ reason: 'x'.repeat(200) })));
  });

  for (const [label, who] of [['coordinator', JHS], ['kiosk', KIOSK], ['guardian', GUARDIAN_A], ['anonymous sign-in', ANON]]) {
    it(`${label} can neither read nor write`, async () => {
      const db = as(env, who);
      await denied(db.doc('slip_batch/S1').get());
      await denied(db.collection('slip_batch').get());
      await denied(db.doc('slip_batch/S2').set(entry()));
      await denied(db.doc('slip_batch/S1').delete());
    });
  }

  it('signed-out users can neither read nor write', async () => {
    await denied(anon(env).doc('slip_batch/S1').get());
    await denied(anon(env).doc('slip_batch/S2').set(entry()));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
NODE_OPTIONS=--dns-result-order=ipv4first npx firebase emulators:exec --only firestore --project bnhs-sims-ci "npx vitest run -c vitest.rules.config.js tests/rules/slipBatch.test.js"
```
Expected: FAIL. The admin tests fail (no rule matches, so everything is denied); the deny tests pass.

- [ ] **Step 3: Add the rule**

In `firestore.rules`, directly after the line `match /id_card_batch/{studentId} { allow read, write: if isAdmin(); }`, add:

```
    // Slip batch (spec 2026-10-16): who is waiting for an activation slip and
    // why. Never a code: codes exist only in issueSlipBatchFn's response.
    match /slip_batch/{studentId} {
      allow read, delete: if isAdmin();
      allow create, update: if isAdmin()
        && request.resource.data.keys().hasOnly(['addedAt', 'addedBy', 'reason'])
        && request.resource.data.keys().hasAll(['addedAt', 'addedBy', 'reason'])
        && request.resource.data.reason is string
        && request.resource.data.reason.size() >= 1
        && request.resource.data.reason.size() <= 200;
    }
```

- [ ] **Step 4: Run the rules tests to verify they pass**

Run the same command as Step 2. Expected: all `slip_batch` tests PASS.
Then run the whole rules suite to check nothing else broke:
```bash
NODE_OPTIONS=--dns-result-order=ipv4first npx firebase emulators:exec --only firestore --project bnhs-sims-ci "npx vitest run -c vitest.rules.config.js"
```
Expected: all PASS (the password-release compatibility tests may report skips as usual).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules/slipBatch.test.js
git commit -m "Rules: admins keep a slip batch of learners and reasons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Server batch helpers

**Files:**
- Create: `functions/src/lib/slipBatch.js`
- Test: `functions/src/lib/slipBatch.test.js`

**Interfaces:**
- Produces:
  - `MAX_BATCH_ISSUE: number` (64)
  - `takeBatch(entries: {id, reason, addedAtMs}[], max = MAX_BATCH_ISSUE) → { take: entries[], remaining: number }`, oldest first, ties by id
  - `compareSlipEntries(a, b) → number`, where each is `{ student, section, sectionId }`: grade, section name, section id, males then females (others last), last then first name

- [ ] **Step 1: Write the failing unit test**

Create `functions/src/lib/slipBatch.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { MAX_BATCH_ISSUE, takeBatch, compareSlipEntries } from './slipBatch.js';

const e = (id, addedAtMs) => ({ id, reason: 'Lost slip', addedAtMs });

describe('takeBatch', () => {
  it('takes the oldest entries first, ties by id', () => {
    const { take, remaining } = takeBatch([e('C', 3), e('B', 1), e('A', 1)]);
    expect(take.map((x) => x.id)).toEqual(['A', 'B', 'C']);
    expect(remaining).toBe(0);
  });
  it('caps a press at MAX_BATCH_ISSUE and reports the rest', () => {
    expect(MAX_BATCH_ISSUE).toBe(64);
    const entries = Array.from({ length: 70 }, (_, i) => e(`S${String(i).padStart(3, '0')}`, i));
    const { take, remaining } = takeBatch(entries);
    expect(take).toHaveLength(64);
    expect(take[63].id).toBe('S063');
    expect(remaining).toBe(6);
  });
  it('handles an empty batch', () => {
    expect(takeBatch([])).toEqual({ take: [], remaining: 0 });
  });
});

describe('compareSlipEntries', () => {
  const sec = (id, gradeLevel, name) => ({ sectionId: id, section: { gradeLevel, name } });
  const st = (lastName, firstName, sex) => ({ lastName, firstName, sex });
  it('sorts by grade, section, males first, then last and first name', () => {
    const rows = [
      { ...sec('B', 8, 'Bonifacio'), student: st('Abad', 'Carla', 'F'), key: 'g8' },
      { ...sec('A', 7, 'Rizal'), student: st('Cruz', 'Ana', 'F'), key: 'g7F' },
      { ...sec('A', 7, 'Rizal'), student: st('Dy', 'Ben', 'M'), key: 'g7M' },
      { ...sec('A', 7, 'Rizal'), student: st('Cruz', 'Abby', 'F'), key: 'g7F2' },
      { ...sec('C', 7, 'Aguinaldo'), student: st('Zamora', 'Zed', 'M'), key: 'g7Agui' },
    ];
    expect(rows.sort(compareSlipEntries).map((r) => r.key)).toEqual(['g7Agui', 'g7M', 'g7F2', 'g7F', 'g8']);
  });
  it('puts learners with no recorded sex after females and tolerates a missing section', () => {
    const rows = [
      { sectionId: 'A', section: { gradeLevel: 7, name: 'Rizal' }, student: st('A', 'A', ''), key: 'none' },
      { sectionId: 'A', section: { gradeLevel: 7, name: 'Rizal' }, student: st('Z', 'Z', 'F'), key: 'F' },
      { sectionId: 'X', section: undefined, student: st('B', 'B', 'M'), key: 'nosection' },
    ];
    expect(rows.sort(compareSlipEntries).map((r) => r.key)).toEqual(['nosection', 'F', 'none']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd functions && npx vitest run src/lib/slipBatch.test.js; cd ..`
Expected: FAIL. The module `./slipBatch.js` is not found.

- [ ] **Step 3: Implement the helpers**

Create `functions/src/lib/slipBatch.js`:

```js
// Slip batch issuing (spec 2026-10-16). One press issues at most this many
// learners: 4 Folio sheets, and well inside the 60 s callable timeout (a
// ~40-learner section takes about 14 s).
export const MAX_BATCH_ISSUE = 64;

// Oldest first, so learners who have waited longest are issued first.
// `entries` are { id, reason, addedAtMs }.
export function takeBatch(entries, max = MAX_BATCH_ISSUE) {
  const sorted = [...entries].sort((a, b) => a.addedAtMs - b.addedAtMs || a.id.localeCompare(b.id));
  return { take: sorted.slice(0, max), remaining: Math.max(0, sorted.length - max) };
}

const SEX_RANK = { M: 0, F: 1 };
const sexRank = (student) => SEX_RANK[student.sex] ?? 2;
const byName = (a, b) =>
  (a.lastName || '').localeCompare(b.lastName || '', 'en', { sensitivity: 'base' }) ||
  (a.firstName || '').localeCompare(b.firstName || '', 'en', { sensitivity: 'base' });

// Print order for issued slips: grade, section, then DepEd order (males, then
// females, each by last then first name) -- the same order as the ID Cards
// batch (src/lib/idCardQueue.js sortIdCardBatch). Entries are
// { student, section, sectionId }.
export function compareSlipEntries(a, b) {
  return Number(a.section?.gradeLevel ?? 0) - Number(b.section?.gradeLevel ?? 0) ||
    (a.section?.name || '').localeCompare(b.section?.name || '') ||
    (a.sectionId || '').localeCompare(b.sectionId || '') ||
    sexRank(a.student) - sexRank(b.student) ||
    byName(a.student, b.student);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd functions && npx vitest run src/lib/slipBatch.test.js; cd ..`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/src/lib/slipBatch.js functions/src/lib/slipBatch.test.js
git commit -m "Functions: order and cap a slip batch press

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `issueSlipBatch` callable

**Files:**
- Modify: `functions/src/callable.js` (`LIMITS`)
- Modify: `functions/src/handlers/codes.js` (imports, new export after `reissueActivationCode`)
- Modify: `functions/index.js` (import and export)
- Test: `functions/test/emulator/slipBatch.test.js`

**Interfaces:**
- Consumes: `takeBatch`, `compareSlipEntries` (Task 2); private `issueCodeFor(db, { studentId, student, section, schoolYear, by, reason })` → `{ slip, slotsFree } | { skipped: 'fully-linked' }` and `assertYearOpen(db, schoolYear)` already in `codes.js`; `manilaDateTime(ms)` from `functions/src/lib/format.js`.
- Produces: `issueSlipBatch(ctx, { schoolYear }) → { slips: Slip[], skipped: { studentId, reason }[], remaining: number }`. `Slip` = `{ studentId, name, lrn, sectionLabel, schoolYear, code }`. Exported callable name: `issueSlipBatchFn`.

- [ ] **Step 1: Write the failing emulator tests**

Create `functions/test/emulator/slipBatch.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, clearAll, seedSchool, ts } from './helpers.js';
import { issueSlipBatch } from '../../src/handlers/codes.js';
import { endSchoolYear } from '../../src/handlers/schoolYear.js';
import { hashCode } from '../../src/lib/activationCode.js';
import { LIMITS } from '../../src/callable.js';

vi.mock('../../src/log.js', () => ({ logEvent: vi.fn(), logWarn: vi.fn() }));

const NOW = new Date('2026-09-21T08:00:00+08:00');
const SY = '2026-2027';
const staff = () => ({ db: db(), now: () => NOW, uid: 'staff1', email: 'registrar@bnhs.edu' });
const issue = () => issueSlipBatch(staff(), { schoolYear: SY });
let order = 0;
const batch = (studentId, reason = 'Lost slip') => db().doc(`slip_batch/${studentId}`)
  .set({ addedAt: ts(NOW.getTime() + (order++) * 1000), addedBy: 'registrar@bnhs.edu', reason });
const enroll = (studentId, sectionId, status = 'enrolled') => db().doc(`enrollments/${studentId}_${SY}`)
  .set({ studentId, sectionId, schoolYear: SY, status });
const batchIds = async () => (await db().collection('slip_batch').get()).docs.map((d) => d.id).sort();
const codeFor = async (code) => (await db().doc(`activation_codes/${hashCode(code)}`).get()).data();
const seedLink = (uid, studentId, slot) => db().doc(`guardian_links/${uid}_${studentId}`).set({
  guardianUid: uid, studentId, status: 'active', schoolYear: SY, relationship: slot === 'adviser' ? 'Adviser' : 'Mother', slot,
});

beforeEach(async () => {
  order = 0;
  await clearAll(); await seedSchool();
  await db().doc('users/registrar@bnhs.edu').set({ role: 'registrar' });
  // seedSchool() links two guardians to S1; these tests link guardians themselves.
  await db().doc('guardian_links/gA_S1').delete();
  await db().doc('guardian_links/gB_S1').delete();
  await enroll('S2', 'SEC1');
  await db().doc('sections/SEC2').set({ name: 'Bonifacio', gradeLevel: 8, schoolYear: SY });
  await db().doc('students/S3').set({ lrn: '100000000003', firstName: 'Carla', lastName: 'Abad', sex: 'F' });
  await enroll('S3', 'SEC2');
});

describe('issueSlipBatch', () => {
  it('issues a slip per batched learner across sections, in print order, and empties the batch', async () => {
    await batch('S3'); await batch('S1'); await batch('S2');
    const r = await issue();
    // Grade 7 Rizal: Dy (M) before Cruz (F); then Grade 8.
    expect(r.slips.map((s) => s.studentId)).toEqual(['S2', 'S1', 'S3']);
    expect(r.slips[2]).toMatchObject({ name: 'Abad, Carla', lrn: '100000000003', sectionLabel: 'Grade 8 – Bonifacio', schoolYear: SY });
    expect(r).toMatchObject({ skipped: [], remaining: 0 });
    expect(await batchIds()).toEqual([]);
    for (const s of r.slips) expect(await codeFor(s.code)).toMatchObject({ studentId: s.studentId, schoolYear: SY, status: 'issued', issuedBy: 'registrar@bnhs.edu' });
  });

  it('revokes a batched learner\'s previous open code with the batch reason', async () => {
    await db().doc('activation_codes/old').set({ studentId: 'S1', schoolYear: SY, status: 'issued', guardianRedemptions: 0, maxGuardians: 2, adviserRedemptions: 0, maxAdvisers: 1 });
    await batch('S1', 'Damaged slip');
    await issue();
    expect((await db().doc('activation_codes/old').get()).data()).toMatchObject({ status: 'revoked', revokedReason: 'Damaged slip', revokedBy: 'registrar@bnhs.edu' });
  });

  it('pre-fills slots from active links, and skips a fully linked learner who stays in the batch', async () => {
    await seedLink('gA', 'S1', 'guardian');
    await seedLink('gA', 'S2', 'guardian'); await seedLink('gB', 'S2', 'guardian'); await seedLink('tAdv', 'S2', 'adviser');
    await db().doc('activation_codes/s2old').set({ studentId: 'S2', schoolYear: SY, status: 'exhausted', guardianRedemptions: 2, maxGuardians: 2, adviserRedemptions: 1, maxAdvisers: 1 });
    await batch('S1'); await batch('S2');
    const r = await issue();
    expect(r.skipped).toEqual([{ studentId: 'S2', reason: 'fully-linked' }]);
    expect(await codeFor(r.slips[0].code)).toMatchObject({ guardianRedemptions: 1, adviserRedemptions: 0 });
    expect((await db().doc('activation_codes/s2old').get()).data().status).toBe('exhausted');
    expect(await batchIds()).toEqual(['S2']);
  });

  it('skips restricted, not-enrolled and missing learners, who stay in the batch', async () => {
    await db().doc('students/S2').set({ activationRestricted: true }, { merge: true });
    await enroll('S3', 'SEC2', 'transferred_out');
    await batch('S2'); await batch('S3'); await batch('S9');
    const r = await issue();
    expect(r.slips).toEqual([]);
    expect(r.skipped).toEqual([
      { studentId: 'S2', reason: 'restricted' },
      { studentId: 'S3', reason: 'not-enrolled' },
      { studentId: 'S9', reason: 'missing' },
    ]);
    expect(await batchIds()).toEqual(['S2', 'S3', 'S9']);
  });

  it('issues at most 64 per press, oldest first, and leaves the rest', async () => {
    const ids = Array.from({ length: 70 }, (_, i) => `L${String(i).padStart(3, '0')}`);
    const w = db().batch();
    ids.forEach((id, i) => {
      w.set(db().doc(`students/${id}`), { lrn: `2000000${String(i).padStart(5, '0')}`, firstName: 'F', lastName: id, sex: 'M' });
      w.set(db().doc(`enrollments/${id}_${SY}`), { studentId: id, sectionId: 'SEC1', schoolYear: SY, status: 'enrolled' });
      w.set(db().doc(`slip_batch/${id}`), { addedAt: ts(NOW.getTime() + i * 1000), addedBy: 'registrar@bnhs.edu', reason: 'Lost slip' });
    });
    await w.commit();
    const r = await issue();
    expect(r.slips).toHaveLength(64);
    expect(r.remaining).toBe(6);
    expect(await batchIds()).toEqual(ids.slice(64));
  }, 120_000);

  it('refuses a school year that has ended and keeps the batch', async () => {
    await endSchoolYear(staff(), { schoolYear: SY, confirmText: SY });
    await batch('S1');
    await expect(issue()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(await batchIds()).toEqual(['S1']);
  });

  it('has its own daily limit, separate from section-wide issuing and single reissues', async () => {
    await db().doc('rate_limits/staff1').set({
      issueCodes: { count: LIMITS.issueCodes.max, windowStartMs: NOW.getTime() - 3600_000 },
      reissueCode: { count: LIMITS.reissueCode.max, windowStartMs: NOW.getTime() - 3600_000 },
    });
    await batch('S1');
    await expect(issue()).resolves.toMatchObject({ remaining: 0 });
    await db().doc('rate_limits/staff1').set({ issueSlipBatch: { count: LIMITS.issueSlipBatch.max, windowStartMs: NOW.getTime() - 3600_000 } }, { merge: true });
    await expect(issue()).rejects.toMatchObject({
      code: 'resource-exhausted',
      message: 'Slip batches were issued 100 times in the last 24 hours, the daily limit. You can issue more after Sep 22, 7:00 AM.',
    });
  });

  it('writes one code.reissued audit entry per issued learner, without the code', async () => {
    await batch('S1', 'New enrollee / transferee'); await batch('S2', 'Lost slip');
    const r = await issue();
    const rows = (await db().collection('audit_log').where('action', '==', 'code.reissued').get()).docs.map((d) => d.data());
    expect(rows).toHaveLength(2);
    expect(rows.find((x) => x.targetId === 'S1')).toMatchObject({
      actorType: 'staff', actorUid: 'registrar@bnhs.edu', targetType: 'student',
      details: { schoolYear: SY, reason: 'New enrollee / transferee', via: 'batch', guardianSlotsFree: 2, adviserSlotsFree: 1 },
    });
    for (const s of r.slips) expect(JSON.stringify(rows)).not.toContain(s.code);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run:
```bash
NODE_OPTIONS=--dns-result-order=ipv4first npx firebase emulators:exec --only firestore,auth --project bnhs-sims-ci "node scripts/syncShared.mjs && cd functions && npx vitest run test/emulator/slipBatch.test.js"
```
Expected: FAIL. `issueSlipBatch` is not exported (`issueSlipBatch is not a function`).

- [ ] **Step 3: Add the rate limit**

In `functions/src/callable.js`, inside `LIMITS`, after the `reissueCode` entry:

```js
  // A slip-batch press issues up to 64 learners (spec 2026-10-16); its own
  // budget so it never uses up section-wide issuing or single reissues.
  issueSlipBatch: { windowMs: 24 * 60 * 60 * 1000, max: 100 },
```

- [ ] **Step 4: Add the handler**

In `functions/src/handlers/codes.js`, add this import below the `codeSlots.js` import:

```js
import { takeBatch, compareSlipEntries } from '../lib/slipBatch.js';
```

Then add this function directly after `reissueActivationCode` (before `revokeCode`):

```js
// Staff. Issues slips for the saved slip batch (spec 2026-10-16): up to
// MAX_BATCH_ISSUE learners per press, oldest first. Learners who get a slip
// leave the batch only after every slip of the press is written, so a press
// that fails partway loses nobody. Skipped learners stay so staff see why.
export async function issueSlipBatch(ctx, data) {
  const { db, now, email } = ctx;
  const schoolYear = str(data.schoolYear, { name: 'schoolYear', min: 9, max: 9 });
  await enforceRateLimit(db, ctx.uid, 'issueSlipBatch', LIMITS.issueSlipBatch, now().getTime(), (resetMs) =>
    `Slip batches were issued ${LIMITS.issueSlipBatch.max} times in the last 24 hours, the daily limit. You can issue more after ${manilaDateTime(resetMs)}.`);
  await assertYearOpen(db, schoolYear);

  const batchSnap = await db.collection('slip_batch').get();
  const { take, remaining } = takeBatch(batchSnap.docs.map((d) => ({
    id: d.id, reason: d.data().reason || 'Slip batch', addedAtMs: d.data().addedAt?.toMillis?.() ?? 0,
  })));

  const issued = [], skipped = [];
  for (const { id: studentId, reason } of take) {
    const student = (await db.doc(`students/${studentId}`).get()).data();
    if (!student) { skipped.push({ studentId, reason: 'missing' }); continue; }
    if (student.activationRestricted === true) { skipped.push({ studentId, reason: 'restricted' }); continue; }
    const enrollment = (await db.doc(`enrollments/${studentId}_${schoolYear}`).get()).data();
    if (enrollment?.status !== 'enrolled') { skipped.push({ studentId, reason: 'not-enrolled' }); continue; }
    const section = (await db.doc(`sections/${enrollment.sectionId}`).get()).data();
    const r = await issueCodeFor(db, { studentId, student, section, schoolYear, by: email, reason });
    if (r.skipped) { skipped.push({ studentId, reason: r.skipped }); continue; }
    issued.push({ studentId, student, section, sectionId: enrollment.sectionId, reason, slip: r.slip, slotsFree: r.slotsFree });
  }

  if (issued.length) {
    const done = db.batch();
    issued.forEach(({ studentId }) => done.delete(db.doc(`slip_batch/${studentId}`)));
    await done.commit();
  }
  await Promise.all(issued.map(({ studentId, reason, slotsFree }) => audit(db, {
    action: 'code.reissued', actorType: 'staff', actorUid: email, targetType: 'student', targetId: studentId,
    details: { schoolYear, reason, via: 'batch', guardianSlotsFree: slotsFree.guardian, adviserSlotsFree: slotsFree.adviser },
  })));
  logEvent('slip_batch_issued', { count: issued.length, skipped: skipped.length });
  return { slips: issued.sort(compareSlipEntries).map((e) => e.slip), skipped, remaining };
}
```

- [ ] **Step 5: Export the callable**

In `functions/index.js`, change the codes import line to include `issueSlipBatch`:

```js
import { issueActivationCodes, reissueActivationCode, issueSlipBatch, revokeCode, activateCode, acceptConsent } from './src/handlers/codes.js';
```

and add this line directly after `export const reissueActivationCodeFn = adminCall(reissueActivationCode);`:

```js
export const issueSlipBatchFn = adminCall(issueSlipBatch);
```

- [ ] **Step 6: Run the new tests to verify they pass**

Run the command from Step 2. Expected: all 8 `issueSlipBatch` tests PASS.

- [ ] **Step 7: Run the whole functions suite**

Run:
```bash
npm --prefix functions test
NODE_OPTIONS=--dns-result-order=ipv4first npx firebase emulators:exec --only firestore,auth --project bnhs-sims-ci "npm --prefix functions run test:emulator"
```
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add functions/src/callable.js functions/src/handlers/codes.js functions/index.js functions/test/emulator/slipBatch.test.js
git commit -m "Functions: issue activation slips for the saved slip batch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: SIMS batch helpers and data layer

**Files:**
- Modify: `src/lib/slipLayout.js` (add `slipSheetFillLabel`)
- Modify: `src/lib/slipLayout.test.js`
- Modify: `src/lib/slipIssue.js`
- Modify: `src/lib/slipIssue.test.js`
- Create: `src/lib/slipBatch.js`
- Create: `src/lib/slipBatch.test.js`
- Create: `src/data/slipBatch.js`
- Modify: `src/data/guardians.js`

**Interfaces:**
- Consumes: `buildBatchView({ batchDocs, enrolled, students }) → { printable: {student, section}[], notPrintable: {id, student|null}[] }` from `src/lib/idCardQueue.js`; `paperOf`, `DEFAULT_PAPER` from `src/lib/slipLayout.js`.
- Produces:
  - `slipSheetFillLabel(n: number, paperKey?: 'folio'|'a4') → string`
  - `issuedSummary({ slips, skipped, remaining = 0 }) → string`, `skipReasonText(reason: string) → string`
  - `MAX_BATCH_ISSUE` (64), `OTHER_REASON` ('Other'), `SLIP_BATCH_REASONS: string[]`, `batchReason(choice, note) → string` ('' when Other has no note), `issueButtonLabel(n) → string`
  - `splitSlipBatch({ batchDocs, enrolled, students, lastSkipped: Map<studentId, reason> }) → { canIssue: {student, section, reason}[], cantIssue: {id, student|null, reason, why}[] }`
  - `addToSlipBatch(studentId, reason, me)`, `removeFromSlipBatch(studentId)`, `clearSlipBatch(studentIds)`, all returning Promises
  - `call.issueSlipBatch({ schoolYear })`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/slipLayout.test.js` (and add `slipSheetFillLabel` to its import list from `./slipLayout.js`):

```js
describe('slipSheetFillLabel', () => {
  it('describes how full the last Folio sheet is', () => {
    expect(slipSheetFillLabel(0)).toBe('');
    expect(slipSheetFillLabel(12)).toBe('12 of 16 — 4 more fills a sheet');
    expect(slipSheetFillLabel(16, 'folio')).toBe('1 full sheet');
    expect(slipSheetFillLabel(19, 'folio')).toBe('1 full sheet + 3 — 13 more fills the next sheet');
    expect(slipSheetFillLabel(32, 'folio')).toBe('2 full sheets');
  });
  it('uses 14 per sheet on A4', () => {
    expect(slipSheetFillLabel(12, 'a4')).toBe('12 of 14 — 2 more fills a sheet');
    expect(slipSheetFillLabel(14, 'a4')).toBe('1 full sheet');
    expect(slipSheetFillLabel(15, 'a4')).toBe('1 full sheet + 1 — 13 more fills the next sheet');
  });
});
```

Append to `src/lib/slipIssue.test.js` (and import `skipReasonText` too):

```js
describe('batch results', () => {
  it('names not-enrolled learners in plain words', () => {
    expect(skipReasonText('not-enrolled')).toBe('not enrolled this school year');
    expect(skipReasonText('fully-linked')).toBe('all slots already linked');
    expect(skipReasonText('other')).toBe('other');
  });
  it('says how many learners are still in the batch', () => {
    expect(issuedSummary({ slips: [{}, {}], skipped: [{ reason: 'fully-linked' }], remaining: 3 }))
      .toBe('2 slips issued, 1 skipped (all slots already linked) · 3 still in the batch.');
    expect(issuedSummary({ slips: [{}], skipped: [], remaining: 1 })).toBe('1 slip issued · 1 still in the batch.');
    expect(issuedSummary({ slips: [{}], skipped: [], remaining: 0 })).toBe('1 slip issued.');
  });
});
```

Create `src/lib/slipBatch.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { MAX_BATCH_ISSUE, OTHER_REASON, SLIP_BATCH_REASONS, batchReason, issueButtonLabel, splitSlipBatch } from './slipBatch.js';

describe('reasons', () => {
  it('offers the fixed list with Other last', () => {
    expect(SLIP_BATCH_REASONS).toEqual(['Lost slip', 'Damaged slip', 'New enrollee / transferee', 'Section changed', 'Other']);
    expect(OTHER_REASON).toBe('Other');
  });
  it('stores a listed reason as is and Other with its note', () => {
    expect(batchReason('Lost slip')).toBe('Lost slip');
    expect(batchReason('Other', '  torn in half ')).toBe('Other: torn in half');
    expect(batchReason('Other', '   ')).toBe('');
    expect(batchReason('Other', 'x'.repeat(300))).toHaveLength(200);
  });
});

describe('issueButtonLabel', () => {
  it('names the count, and the cap above 64', () => {
    expect(MAX_BATCH_ISSUE).toBe(64);
    expect(issueButtonLabel(1)).toBe('Issue 1 slip');
    expect(issueButtonLabel(64)).toBe('Issue 64 slips');
    expect(issueButtonLabel(65)).toBe('Issue first 64 slips');
  });
});

describe('splitSlipBatch', () => {
  const section = { id: 'SEC1', gradeLevel: 7, name: 'Rizal' };
  const ana = { id: 'S1', lrn: '1', firstName: 'Ana', lastName: 'Cruz', sex: 'F' };
  const ben = { id: 'S2', lrn: '2', firstName: 'Ben', lastName: 'Dy', sex: 'M' };
  const gone = { id: 'S3', lrn: '3', firstName: 'Cy', lastName: 'Ely', sex: 'M' };
  const enrolled = [{ student: ben, section }, { student: ana, section }];
  const students = [ana, ben, gone];
  const batchDocs = [{ id: 'S1', reason: 'Lost slip' }, { id: 'S2', reason: 'Damaged slip' }, { id: 'S3', reason: 'Section changed' }, { id: 'S9', reason: 'Lost slip' }];

  it('keeps enrolled learners issuable in print order with their reasons', () => {
    const { canIssue } = splitSlipBatch({ batchDocs, enrolled, students });
    expect(canIssue.map((e) => [e.student.id, e.reason])).toEqual([['S2', 'Damaged slip'], ['S1', 'Lost slip']]);
  });
  it('lists learners who cannot be issued, with why', () => {
    const { cantIssue } = splitSlipBatch({ batchDocs, enrolled, students });
    expect(cantIssue.map((e) => [e.id, e.why])).toEqual([['S3', 'not enrolled this school year'], ['S9', 'learner record missing']]);
  });
  it('moves learners the server skipped last press to cannot issue', () => {
    const { canIssue, cantIssue } = splitSlipBatch({ batchDocs, enrolled, students, lastSkipped: new Map([['S2', 'fully-linked']]) });
    expect(canIssue.map((e) => e.student.id)).toEqual(['S1']);
    expect(cantIssue[0]).toMatchObject({ id: 'S2', reason: 'Damaged slip', why: 'all slots already linked' });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/slipLayout.test.js src/lib/slipIssue.test.js src/lib/slipBatch.test.js`
Expected: FAIL. `slipSheetFillLabel` and `skipReasonText` are not exported, `./slipBatch.js` is not found, and the `remaining` summary text is wrong.

- [ ] **Step 3: Add `slipSheetFillLabel`**

Append to `src/lib/slipLayout.js`:

```js
// How full the last sheet is for the chosen paper, so staff can top a batch
// up instead of wasting paper. Same wording as the ID Cards batch.
export function slipSheetFillLabel(n, paperKey = DEFAULT_PAPER) {
  const { cols, rows } = paperOf(paperKey);
  const perSheet = cols * rows;
  const full = Math.floor(n / perSheet);
  const rest = n % perSheet;
  const sheets = (k) => `${k} full sheet${k === 1 ? '' : 's'}`;
  if (n === 0) return '';
  if (rest === 0) return sheets(full);
  if (full === 0) return `${n} of ${perSheet} — ${perSheet - n} more fills a sheet`;
  return `${sheets(full)} + ${rest} — ${perSheet - rest} more fills the next sheet`;
}
```

- [ ] **Step 4: Extend `slipIssue.js`**

Replace the top of `src/lib/slipIssue.js` (the `SKIP_REASONS` line and `issuedSummary`) with:

```js
// Plain-words text for the activation-slip screens (spec 2026-10-13 §5–6,
// spec 2026-10-16 for the slip batch).
const SKIP_REASONS = {
  restricted: 'restricted', missing: 'learner record missing', 'fully-linked': 'all slots already linked',
  'not-enrolled': 'not enrolled this school year',
};

export const skipReasonText = (reason) => SKIP_REASONS[reason] || reason;

// "28 slips issued, 2 skipped (all slots already linked)."
// A slip batch press adds " · 3 still in the batch" when it hit its cap.
export function issuedSummary({ slips, skipped, remaining = 0 }) {
  const issued = `${slips.length} ${slips.length === 1 ? 'slip' : 'slips'} issued`;
  const reasons = [...new Set(skipped.map((s) => skipReasonText(s.reason)))].join(', ');
  const summary = skipped.length ? `${issued}, ${skipped.length} skipped (${reasons})` : issued;
  return remaining ? `${summary} · ${remaining} still in the batch.` : `${summary}.`;
}
```

Leave `slotsFreeText` as it is.

- [ ] **Step 5: Create `src/lib/slipBatch.js`**

```js
import { buildBatchView } from './idCardQueue.js';
import { skipReasonText } from './slipIssue.js';

// Must match functions/src/lib/slipBatch.js: one press issues at most this many.
export const MAX_BATCH_ISSUE = 64;

export const OTHER_REASON = 'Other';
export const SLIP_BATCH_REASONS = ['Lost slip', 'Damaged slip', 'New enrollee / transferee', 'Section changed', OTHER_REASON];

// The reason saved on a batch entry (1–200 chars, see firestore.rules), or ''
// while Other has no note yet.
export function batchReason(choice, note = '') {
  if (choice !== OTHER_REASON) return choice;
  const text = note.trim();
  return text ? `Other: ${text}`.slice(0, 200) : '';
}

export const issueButtonLabel = (n) =>
  (n > MAX_BATCH_ISSUE ? `Issue first ${MAX_BATCH_ISSUE} slips` : `Issue ${n} ${n === 1 ? 'slip' : 'slips'}`);

// Splits the saved batch into learners the next press can issue (in print
// order) and learners it can't: no longer enrolled or missing (known here),
// or skipped by the server on the last press (`lastSkipped`: id → reason).
export function splitSlipBatch({ batchDocs, enrolled, students, lastSkipped = new Map() }) {
  const { printable, notPrintable } = buildBatchView({ batchDocs, enrolled, students });
  const reasonById = new Map(batchDocs.map((d) => [d.id, d.reason]));
  const canIssue = [];
  const cantIssue = [];
  for (const entry of printable) {
    const id = entry.student.id;
    const skipped = lastSkipped.get(id);
    if (skipped) cantIssue.push({ id, student: entry.student, reason: reasonById.get(id), why: skipReasonText(skipped) });
    else canIssue.push({ ...entry, reason: reasonById.get(id) });
  }
  for (const { id, student } of notPrintable) {
    cantIssue.push({ id, student, reason: reasonById.get(id), why: student ? 'not enrolled this school year' : 'learner record missing' });
  }
  return { canIssue, cantIssue };
}
```

- [ ] **Step 6: Create the data layer and the callable binding**

Create `src/data/slipBatch.js`:

```js
import { doc, writeBatch, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

const BATCH = 'slip_batch';
const OPS_PER_BATCH = 500; // Firestore's hard limit per writeBatch

// Only who is waiting and why; codes are created by issueSlipBatchFn and
// never stored (spec 2026-10-16 §1).
export const addToSlipBatch = (studentId, reason, me) =>
  setDoc(doc(db, BATCH, studentId), { addedAt: serverTimestamp(), addedBy: me.email, reason });

export const removeFromSlipBatch = (studentId) => deleteDoc(doc(db, BATCH, studentId));

export async function clearSlipBatch(studentIds) {
  for (let i = 0; i < studentIds.length; i += OPS_PER_BATCH) {
    const batch = writeBatch(db);
    studentIds.slice(i, i + OPS_PER_BATCH).forEach((id) => batch.delete(doc(db, BATCH, id)));
    await batch.commit();
  }
}
```

In `src/data/guardians.js`, add after `reissueActivationCode: fn('reissueActivationCodeFn'),`:

```js
  issueSlipBatch: fn('issueSlipBatchFn'),
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/lib/slipLayout.test.js src/lib/slipIssue.test.js src/lib/slipBatch.test.js`
Expected: PASS. Then run `npm test` and expect every SIMS test to pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/slipLayout.js src/lib/slipLayout.test.js src/lib/slipIssue.js src/lib/slipIssue.test.js src/lib/slipBatch.js src/lib/slipBatch.test.js src/data/slipBatch.js src/data/guardians.js
git commit -m "SIMS: slip batch helpers, page-fill label and data layer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Issue slips sub-tabs and the Saved batch screen

**Files:**
- Rename: `src/pages/guardians/CodesTab.jsx` → `src/pages/guardians/SectionSlipsTab.jsx` (rename the default export to `SectionSlipsTab`; no other change)
- Create: `src/pages/guardians/CodesTab.jsx` (new sub-tab switcher)
- Create: `src/pages/guardians/SlipBatchTab.jsx`
- Modify: `src/pages/GuardiansPage.jsx:51`

**Interfaces:**
- Consumes: everything Task 4 produces; `enrolledEntries`, `groupBySection` from `src/lib/idCardQueue.js`; `useCollectionResource`, `useSchoolYearEnrollments`; `SlipPrintControls`, `useSlipPaper`, `PORTAL_URL`; `ActivationSlipsPrintable`; `usePrintReadiness(ref, key, count)`.
- Produces: `CodesTab({ me, schoolYear })`, `SlipBatchTab({ me, schoolYear })`.

- [ ] **Step 1: Move today's screen to `SectionSlipsTab.jsx`**

```bash
git mv src/pages/guardians/CodesTab.jsx src/pages/guardians/SectionSlipsTab.jsx
```

In `src/pages/guardians/SectionSlipsTab.jsx`, change only the export line:

```js
export default function SectionSlipsTab({ schoolYear }) {
```

- [ ] **Step 2: Create the sub-tab switcher `src/pages/guardians/CodesTab.jsx`**

```jsx
import { useState } from 'react';
import SectionSlipsTab from './SectionSlipsTab.jsx';
import SlipBatchTab from './SlipBatchTab.jsx';

// Same pattern as the ID Cards page: issue a whole section, or a saved
// batch of chosen learners (spec 2026-10-16 §3).
const TABS = [['section', 'By section'], ['batch', 'Saved batch']];
const STORAGE = 'sims.slips.tab';
const readTab = () => {
  try { const v = localStorage.getItem(STORAGE); return TABS.some(([k]) => k === v) ? v : 'section'; }
  catch { return 'section'; }
};

export default function CodesTab({ me, schoolYear }) {
  const [tab, setTabState] = useState(readTab);
  const setTab = (next) => {
    setTabState(next);
    try { localStorage.setItem(STORAGE, next); } catch { /* the tab still switches without storage */ }
  };
  return (
    <>
      <div className="codes-tab-controls sims-tabs" role="tablist" aria-label="Issue slips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {TABS.map(([k, label]) => {
          const active = tab === k;
          return <button key={k} role="tab" className="sims-tab" id={`slips-tab-${k}`}
            aria-selected={active} aria-controls={`slips-panel-${k}`} tabIndex={active ? 0 : -1}
            onClick={() => setTab(k)} onKeyDown={(event) => {
              const index = TABS.findIndex(([key]) => key === k);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 :
                event.key === 'ArrowRight' ? (index + 1) % TABS.length :
                event.key === 'ArrowLeft' ? (index - 1 + TABS.length) % TABS.length : null;
              if (next === null) return;
              event.preventDefault(); setTab(TABS[next][0]);
              document.getElementById(`slips-tab-${TABS[next][0]}`)?.focus();
            }}>{label}</button>;
        })}
      </div>
      <div key={tab} role="tabpanel" id={`slips-panel-${tab}`} aria-labelledby={`slips-tab-${tab}`}>
        {tab === 'section' ? <SectionSlipsTab schoolYear={schoolYear} /> : <SlipBatchTab me={me} schoolYear={schoolYear} />}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Create `src/pages/guardians/SlipBatchTab.jsx`**

```jsx
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { useCollectionResource, useSchoolYearEnrollments } from '../../hooks/useCollection.js';
import { usePrintReadiness } from '../../hooks/usePrintReadiness.js';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ActionFeedback, ResourceState, Btn, Inp, Sel, Field, Card, EmptyState, Confirm } from '../../components/ui.jsx';
import ActivationSlipsPrintable from '../../components/ActivationSlipsPrintable.jsx';
import SlipPrintControls, { useSlipPaper, PORTAL_URL } from '../../components/SlipPrintControls.jsx';
import { call } from '../../data/guardians.js';
import { addToSlipBatch, removeFromSlipBatch, clearSlipBatch } from '../../data/slipBatch.js';
import { enrolledEntries, groupBySection } from '../../lib/idCardQueue.js';
import { MAX_BATCH_ISSUE, OTHER_REASON, SLIP_BATCH_REASONS, batchReason, issueButtonLabel, splitSlipBatch } from '../../lib/slipBatch.js';
import { slipSheetFillLabel } from '../../lib/slipLayout.js';
import { issuedSummary } from '../../lib/slipIssue.js';
import { buildLearnerIndex, searchLearners } from '../../lib/search.js';
import { fullName } from '../../lib/roster.js';
import { T } from '../../styles.js';

const sectionLabel = (s) => `Grade ${s.gradeLevel} - ${s.name}${s.strand ? ` · ${s.strand}` : ''}`;
const SEARCH_LIMIT = 8;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const row = { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, flexWrap: 'wrap' };
const reasonTag = { fontSize: 11, fontWeight: 600, color: T.inkMuted, border: `1px solid ${T.border}`, borderRadius: T.pill, padding: '1px 8px' };

export default function SlipBatchTab({ me, schoolYear }) {
  const studentsResource = useCollectionResource('students');
  const enrollmentsResource = useSchoolYearEnrollments(schoolYear);
  const sectionsResource = useCollectionResource('sections');
  const batchResource = useCollectionResource('slip_batch');
  const resources = [studentsResource, enrollmentsResource, sectionsResource, batchResource];
  if (resources.some((r) => r.loading || r.error)) return <ResourceState resources={resources} />;
  return <SlipBatch me={me} schoolYear={schoolYear} students={studentsResource.data}
    enrollments={enrollmentsResource.data} sections={sectionsResource.data} batchDocs={batchResource.data} />;
}

// Raw codes exist only in `result` after a press. Leaving the page loses
// them; staff add the learners again and reissue (which revokes those codes).
function SlipBatch({ me, schoolYear, students, enrollments, sections, batchDocs }) {
  const action = useAsyncAction();
  const enrolled = useMemo(() => enrolledEntries({ students, enrollments, sections, schoolYear }),
    [students, enrollments, sections, schoolYear]);
  const [lastSkipped, setLastSkipped] = useState(() => new Map());
  const { canIssue, cantIssue } = useMemo(() => splitSlipBatch({ batchDocs, enrolled, students, lastSkipped }),
    [batchDocs, enrolled, students, lastSkipped]);
  const groups = useMemo(() => groupBySection(canIssue), [canIssue]);
  const batchIds = useMemo(() => new Set(batchDocs.map((d) => d.id)), [batchDocs]);

  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState(SLIP_BATCH_REASONS[0]);
  const [note, setNote] = useState('');
  const reason = batchReason(choice, note);
  const searchIndex = useMemo(() => buildLearnerIndex(enrolled, (e) => e.student), [enrolled]);
  const searchQuery = useDeferredValue(query);
  const results = useMemo(() => (searchQuery.trim()
    ? searchLearners(searchIndex, searchQuery, { includeLrn: true, limit: SEARCH_LIMIT, accept: (e) => !batchIds.has(e.student.id) })
    : []), [searchIndex, batchIds, searchQuery]);

  const [paper, setPaper] = useSlipPaper();
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const printRoot = useRef(null);
  const printReady = usePrintReadiness(printRoot, result, result?.slips?.length || 0);

  const add = (id) => { setQuery(''); action.run('add', () => addToSlipBatch(id, reason, me)); };
  const remove = (id) => action.run('remove', () => removeFromSlipBatch(id));
  // Errors are caught here (not by action.run) so the server's own message,
  // e.g. the daily limit and when it resets, reaches staff.
  const issue = async () => {
    const n = Math.min(batchDocs.length, MAX_BATCH_ISSUE);
    if (!window.confirm(`Issue new slips for ${plural(n, 'learner', 'learners')}? Their current slips stop working. Guardians already linked keep access.`)) return;
    setErr('');
    try {
      const r = await call.issueSlipBatch({ schoolYear });
      setResult(r);
      setLastSkipped(new Map(r.skipped.map((s) => [s.studentId, s.reason])));
    } catch (e) { setErr(e.message || 'Could not issue the slips.'); }
  };

  return (
    <>
      <div className="slips-print-hide" style={{ fontFamily: T.body, color: T.ink }}>
        <ActionFeedback action={action} />
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'var(--sims-form-columns, 1fr auto)', gap: 12, alignItems: 'end' }}>
            <Field label="Add a learner">
              <Inp type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or LRN" />
            </Field>
            <Field label="Reason">
              <Sel value={choice} onChange={(e) => setChoice(e.target.value)}>
                {SLIP_BATCH_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </Sel>
            </Field>
          </div>
          {choice === OTHER_REASON && (
            <Field label="Reason note"><Inp value={note} maxLength={190} onChange={(e) => setNote(e.target.value)} /></Field>
          )}
          {results.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {results.map(({ student, section }) => (
                <li key={student.id} style={row}>
                  <span style={{ flex: 1 }}>
                    <strong>{fullName(student)}</strong>{' '}
                    <span style={{ ...T.num, color: T.inkMuted }}>{student.lrn}</span>{' '}
                    <span style={{ color: T.inkMuted }}>· {sectionLabel(section)}</span>
                  </span>
                  <Btn variant="ghost" disabled={action.busy || !reason} onClick={() => add(student.id)} aria-label={`Add ${fullName(student)}`}>Add</Btn>
                </li>
              ))}
            </ul>
          )}
          {searchQuery.trim() && results.length === 0 && (
            <p style={{ margin: 0, color: T.inkMuted, fontSize: 13 }}>No other enrolled learner matches “{searchQuery.trim()}”.</p>
          )}
        </Card>

        {(batchDocs.length > 0 || result) && (
          <Card style={{ position: 'sticky', top: 0, zIndex: 1, padding: '12px 20px', marginBottom: 12 }}>
            <span style={{ fontWeight: 600 }}>{slipSheetFillLabel(canIssue.length, paper) || 'Nothing in the batch can be issued yet'}</span>
            <SlipPrintControls paper={paper} onPaperChange={setPaper} printReady={printReady}>
              <Btn variant="ghost" disabled={action.busy || batchDocs.length === 0} onClick={() => setConfirmClear(true)}>Clear batch</Btn>
              <Btn disabled={action.busy || canIssue.length === 0} onClick={() => action.run('issue', issue)}>{issueButtonLabel(batchDocs.length)}</Btn>
            </SlipPrintControls>
            {err && <p role="alert" className="sims-feedback" style={{ margin: 0 }}>{err}</p>}
            {result && <p role="status" style={{ margin: 0, fontSize: 13 }}>{issuedSummary(result)}</p>}
          </Card>
        )}

        {batchDocs.length === 0 && !result && (
          <Card style={{ padding: 20 }}>
            <EmptyState title="The slip batch is empty" hint="Search above to add learners who need a new or first activation slip." />
          </Card>
        )}

        {groups.map(({ section, entries }) => (
          <Card key={section.id} style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{sectionLabel(section)} · {entries.length}</div>
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {entries.map(({ student, reason: why }) => (
                <li key={student.id} style={row}>
                  <span style={{ flex: 1 }}>{fullName(student)}{' '}
                    <span style={{ ...T.num, color: T.inkMuted, fontSize: 12 }}>{student.lrn}</span></span>
                  {why && <span style={reasonTag}>{why}</span>}
                  <Btn variant="ghost" disabled={action.busy} onClick={() => remove(student.id)} aria-label={`Remove ${fullName(student)}`}>Remove</Btn>
                </li>
              ))}
            </ul>
          </Card>
        ))}

        {cantIssue.length > 0 && (
          <Card style={{ padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Can't issue · {cantIssue.length}</div>
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {cantIssue.map(({ id, student, why }) => {
                const name = student ? fullName(student) : 'Learner record not found';
                return (
                  <li key={id} style={row}>
                    <span style={{ flex: 1, color: T.inkMuted }}>{name}{' '}
                      <span style={{ ...T.num, fontSize: 12 }}>{student?.lrn || id}</span> · {why}</span>
                    <Btn variant="ghost" disabled={action.busy} onClick={() => remove(id)} aria-label={`Remove ${name}`}>Remove</Btn>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      {result?.slips?.length > 0 && <div ref={printRoot}><ActivationSlipsPrintable slips={result.slips} portalUrl={PORTAL_URL} paper={paper} /></div>}
      {confirmClear && (
        <Confirm
          title="Clear the slip batch?"
          label="Clear batch"
          message={`Remove all ${plural(batchDocs.length, 'learner', 'learners')} from the slip batch? No slips are issued or revoked.`}
          onYes={async () => { await clearSlipBatch(batchDocs.map((d) => d.id)); setConfirmClear(false); }}
          onNo={() => setConfirmClear(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Pass `me` to CodesTab**

In `src/pages/GuardiansPage.jsx`, change:

```jsx
        {tab === 'codes' && <CodesTab schoolYear={schoolYear} />}
```

to:

```jsx
        {tab === 'codes' && <CodesTab me={me} schoolYear={schoolYear} />}
```

- [ ] **Step 5: Run the SIMS tests and build**

Run: `npm test`
Expected: all PASS.

Then build. The build refuses to run without the `VITE_FIREBASE_*` variables, which live only in the main checkout's `.env`. Load them for this one command (Bash) instead of copying the file:
```bash
set -a; . "C:/Users/jitsb/OneDrive - Department of Education/Desktop/APPS/bnhs-sims/.env"; set +a; npm run build
```
Expected: the build succeeds. The usual large-chunk warning is fine.

- [ ] **Step 6: Manual check against the emulators**

Start the emulator suite (`npm run emulators`) and SIMS (`npm run dev`) with the emulator configuration the README describes. Sign in as an admin, then:
1. Guardians → Issue slips shows **By section** and **Saved batch**; By section works as before.
2. Saved batch: add two learners from different sections with different reasons. The page-fill line reads "2 of 16 — 14 more fills a sheet" on Folio and "2 of 14 — 12 more fills a sheet" on A4.
3. Press **Issue 2 slips** and confirm. The summary reads "2 slips issued.", the batch empties, two slips render, and **Print** enables once the QR codes load.
4. In print preview, only the slip sheet shows (no tabs, search or bar), on Folio and on A4.
5. Reload. The sub-tab is still **Saved batch**.

- [ ] **Step 7: Commit**

```bash
git add src/pages/guardians/CodesTab.jsx src/pages/guardians/SectionSlipsTab.jsx src/pages/guardians/SlipBatchTab.jsx src/pages/GuardiansPage.jsx
git commit -m "SIMS: Saved batch sub-tab for issuing chosen learners' slips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Add to slip batch from Learner access

**Files:**
- Modify: `src/pages/guardians/LinksTab.jsx`
- Modify: `src/pages/GuardiansPage.jsx` (pass `me` to LinksTab)

**Interfaces:**
- Consumes: `addToSlipBatch(studentId, reason, me)` (Task 4); `useCollectionResource('slip_batch')`.

- [ ] **Step 1: Pass `me` to LinksTab**

In `src/pages/GuardiansPage.jsx`, change `{tab === 'links' && <LinksTab schoolYear={schoolYear} />}` to:

```jsx
        {tab === 'links' && <LinksTab me={me} schoolYear={schoolYear} />}
```

- [ ] **Step 2: Add the import, the batch listener and the button**

In `src/pages/guardians/LinksTab.jsx`:

Add the import below `import { call } from '../../data/guardians.js';`:

```js
import { addToSlipBatch } from '../../data/slipBatch.js';
```

Change the signature to `export default function LinksTab({ me, schoolYear }) {`.

Directly after `const sections = sectionsResource.data;`, add:

```js
  // Shared listener (same key as the Saved batch screen), so the button
  // knows whether the learner is already waiting for a slip.
  const slipBatch = useCollectionResource('slip_batch').data;
```

Directly after `const student = students.find((s) => s.id === studentId);`, add:

```js
  const inSlipBatch = !!student && slipBatch.some((d) => d.id === student.id);
```

In the buttons row, directly after the **Reissue slip** `<Btn …>Reissue slip</Btn>`, add:

```jsx
              <Btn variant="ghost" disabled={action.busy || !reason.trim() || student.activationRestricted || inSlipBatch} onClick={() => action.run('batch', () => addToSlipBatch(student.id, reason.trim().slice(0, 200), me))}>{inSlipBatch ? 'In slip batch' : 'Add to slip batch'}</Btn>
```

- [ ] **Step 3: Run the SIMS tests and build**

Run `npm test`, then the build command from Task 5 Step 5. Expected: tests PASS and the build succeeds.

- [ ] **Step 4: Manual check against the emulators**

In Guardians → Learner access, pick a learner, type a reason and press **Add to slip batch**. The button changes to **In slip batch**, and the learner appears on Issue slips → Saved batch with that reason. A restricted learner's button stays disabled.

- [ ] **Step 5: Commit**

```bash
git add src/pages/guardians/LinksTab.jsx src/pages/GuardiansPage.jsx
git commit -m "SIMS: add a learner to the slip batch from Learner access

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification and release notes

**Files:**
- Modify: `docs/parent-portal-adviser-guide.md` only if it describes reissuing slips (check with `grep -n -i "reissue" docs/*.md`); add one paragraph on the Saved batch.

- [ ] **Step 1: Run every suite**

```bash
npm test
npm --prefix functions test
NODE_OPTIONS=--dns-result-order=ipv4first npx firebase emulators:exec --only firestore --project bnhs-sims-ci "npx vitest run -c vitest.rules.config.js"
NODE_OPTIONS=--dns-result-order=ipv4first npx firebase emulators:exec --only firestore,auth --project bnhs-sims-ci "npm --prefix functions run test:emulator"
```
Expected: all PASS. Record the counts for the PR description.

- [ ] **Step 2: Update the staff guide if it covers slips**

If `grep -n -i "reissue\|issue slips" docs/*.md` finds staff instructions for slips, add after them:

```markdown
**Saved batch.** To print slips for learners from different sections (lost or damaged slips, late enrollees, transferees), add them on Issue slips → Saved batch, or with **Add to slip batch** on Learner access. The bar shows how full the last sheet is. **Issue slips** issues up to 64 at a time; their old slips stop working, and guardians already linked keep access. Print right away: codes are shown only once.
```

- [ ] **Step 3: Commit and open the PR**

```bash
git add -A docs
git commit -m "Docs: slip batch in the staff guide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin HEAD
```

Open a PR against `master`. In its description, list these release steps, which this plan does **not** perform:
1. **Rules:** add the `slip_batch` match from Task 1 to the production password-only ruleset (`docs/releases/2026-10-11-temporary-password`), and verify it against the live rules before publishing.
2. **Functions:** deploy `functions:issueSlipBatchFn` by name from the main checkout. Its code path (`codes.js`, `callable.js`, `lib/slipBatch.js`, `lib/format.js`, `lib/codeSlots.js`, `lib/schoolYears.js`) has no held coordinator code.
3. **SIMS hosting:** release through the release tree, as the other SIMS releases; apply this branch's `src/` diff on top of the overlays listed in the release memory.

Release order: rules → functions → SIMS. The Saved batch screen reads `slip_batch` on load, so the rules must be live before the screen is.
