# Reissue One Learner's Activation Slip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff can replace one learner's lost activation slip from the Links tab without revoking the rest of the section's slips, and no reissue (single or section-wide) can raise a learner above 2 linked guardians + 1 adviser.

**Architecture:** A pure `slotsFromLinks` helper turns a learner's active links into pre-filled slot counters for a new code. One internal `issueCodeFor` helper in `functions/src/handlers/codes.js` does revoke-and-issue for one learner and is used by both the existing section-wide `issueActivationCodes` and a new `reissueActivationCode` callable. In SIMS, the paper toggle and Print button move into a shared `SlipPrintControls` component, used by the Codes tab and by a new Reissue slip panel on the Links tab.

**Tech Stack:** Firebase Cloud Functions v2 (Node 22, ESM), Firestore (admin SDK), Vitest (unit tests under `functions/src`, emulator tests under `functions/test/emulator`), React 19 + Vite SIMS app (Vitest node environment, `src/**/*.test.js` only, no component tests).

**Spec:** `docs/superpowers/specs/2026-10-13-reissue-single-activation-slip-design.md`

## Global Constraints

- Slots per slip: `MAX_GUARDIANS = 2`, `MAX_ADVISERS = 1` (existing constants in `functions/src/lib/codeSlots.js`).
- Counted links: `status === 'active'` and `schoolYear` equal to the code's school year. A link with no `slot` counts as `guardian`.
- Learners with every slot linked are skipped by section-wide issuing (reason `fully-linked`) and their current code is left untouched.
- New callable name: `reissueActivationCode`, exported as `reissueActivationCodeFn = adminCall(reissueActivationCode)`.
- New rate limit: `reissueCode: { windowMs: 24 * 60 * 60 * 1000, max: 60 }`.
- Audit action `code.reissued`, `targetType: 'student'`, details `{ schoolYear, reason, guardianSlotsFree, adviserSlotsFree }`.
- Error messages (exact): `Learner not found` · `This learner is restricted. Lift the restriction first.` · `This learner is not enrolled for {schoolYear}.` · `All guardian and adviser slots are linked. Revoke a link first.`
- Raw codes are never stored or logged; they live only in the callable's return value and React component state.
- Skip-reason wording (exact): `restricted` → `restricted`, `missing` → `learner record missing`, `fully-linked` → `all slots already linked`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never kill `node` processes by name; stop only processes you started.

## Commands

- Functions unit tests: `npm --prefix functions test` (runs `vitest run src`; a `pretest` step syncs `shared/`).
- Functions emulator tests (needs Java + Firebase CLI; ~1–3 min): `npm run test:functions`. Run it in the background if your tool times out at 2 minutes.
- SIMS unit tests: `npm test`
- SIMS build: `npm run build`

## File Structure

- Modify `functions/src/lib/codeSlots.js`: add `slotsFromLinks`.
- Modify `functions/src/lib/codeSlots.test.js`: unit tests for `slotsFromLinks`.
- Modify `functions/src/handlers/codes.js`: add `issueCodeFor`, use it in `issueActivationCodes`, add `reissueActivationCode`.
- Modify `functions/src/callable.js`: add the `reissueCode` limit.
- Modify `functions/index.js`: export `reissueActivationCodeFn`.
- Modify `functions/test/emulator/codes.test.js`: unlink the seeded guardians in `beforeEach`, add section-wide and reissue tests.
- Create `src/lib/slipIssue.js` + `src/lib/slipIssue.test.js`: plain-words result text.
- Modify `src/lib/slipLayout.js` + `src/lib/slipLayout.test.js`: hide `.slips-print-hide` when printing.
- Create `src/components/SlipPrintControls.jsx`: `useSlipPaper`, `PORTAL_URL`, paper toggle + Print + hint.
- Modify `src/pages/guardians/CodesTab.jsx`: use `SlipPrintControls`, `issuedSummary`.
- Modify `src/data/guardians.js`: add `call.reissueActivationCode`.
- Modify `src/pages/guardians/LinksTab.jsx`: Reissue slip button, panel and printable slip.

---

### Task 1: `slotsFromLinks`

**Files:**
- Modify: `functions/src/lib/codeSlots.js` (add after `newCodeSlots`, line 15)
- Test: `functions/src/lib/codeSlots.test.js`

**Interfaces:**
- Consumes: `MAX_GUARDIANS`, `MAX_ADVISERS`, `claimSlot` (existing, same file).
- Produces: `slotsFromLinks(links: Array<{ status, schoolYear, slot? }>, schoolYear: string) → { guardianRedemptions: number, maxGuardians: 2, adviserRedemptions: number, maxAdvisers: 1, status: 'issued' | 'exhausted' }`. The object can be spread straight into an `activation_codes` doc.

- [ ] **Step 1: Write the failing tests**

In `functions/src/lib/codeSlots.test.js`, change the import line to:

```js
import { isDepedEmail, isOpenStatus, slotFor, readSlots, claimSlot, newCodeSlots, slotsFromLinks, ADVISER } from './codeSlots.js';
```

and append at the end of the file:

```js
describe('slotsFromLinks', () => {
  const SY = '2026-2027';
  const link = (over = {}) => ({ status: 'active', schoolYear: SY, slot: 'guardian', ...over });
  const slots = (g, a, status = 'issued') => ({ guardianRedemptions: g, maxGuardians: 2, adviserRedemptions: a, maxAdvisers: 1, status });

  it('gives a learner with no links every slot', () => {
    expect(slotsFromLinks([], SY)).toEqual(slots(0, 0));
  });
  it('counts active guardian and adviser links for the school year', () => {
    expect(slotsFromLinks([link()], SY)).toEqual(slots(1, 0));
    expect(slotsFromLinks([link({ slot: 'adviser' })], SY)).toEqual(slots(0, 1));
    expect(slotsFromLinks([link(), link()], SY)).toEqual(slots(2, 0));
    expect(slotsFromLinks([link(), link(), link({ slot: 'adviser' })], SY)).toEqual(slots(2, 1, 'exhausted'));
  });
  it('ignores revoked, expired and other-school-year links', () => {
    expect(slotsFromLinks([link({ status: 'revoked' }), link({ status: 'expired' }), link({ schoolYear: '2025-2026' })], SY)).toEqual(slots(0, 0));
  });
  it('counts a link with no slot as a guardian', () => {
    expect(slotsFromLinks([{ status: 'active', schoolYear: SY }], SY)).toEqual(slots(1, 0));
  });
  it('caps used counts at the max', () => {
    expect(slotsFromLinks([link(), link(), link()], SY)).toEqual(slots(2, 0));
  });
  it('makes claimSlot refuse a guardian once linked guardians fill the slots', () => {
    expect(claimSlot(slotsFromLinks([link(), link()], SY), 'guardian')).toBeNull();
    expect(claimSlot(slotsFromLinks([link()], SY), 'guardian')).toMatchObject({ guardianRedemptions: 2 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix functions test`
Expected: FAIL in `codeSlots.test.js` with `slotsFromLinks is not a function` (or "does not provide an export named 'slotsFromLinks'").

- [ ] **Step 3: Implement**

In `functions/src/lib/codeSlots.js`, insert directly after the `newCodeSlots` line:

```js
// Slots for a new code, counting the learner's links already active for
// this school year, so reissuing a slip never raises the 2-guardian limit
// (spec 2026-10-13 §1). Links made before the adviser slot existed have no
// `slot` and count as guardians.
export function slotsFromLinks(links, schoolYear) {
  const used = { guardian: 0, adviser: 0 };
  for (const l of links) if (l.status === 'active' && l.schoolYear === schoolYear) used[l.slot === 'adviser' ? 'adviser' : 'guardian'] += 1;
  const guardianRedemptions = Math.min(used.guardian, MAX_GUARDIANS);
  const adviserRedemptions = Math.min(used.adviser, MAX_ADVISERS);
  return {
    guardianRedemptions, maxGuardians: MAX_GUARDIANS, adviserRedemptions, maxAdvisers: MAX_ADVISERS,
    status: guardianRedemptions >= MAX_GUARDIANS && adviserRedemptions >= MAX_ADVISERS ? 'exhausted' : 'issued',
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix functions test`
Expected: PASS, all files.

- [ ] **Step 5: Commit**

```bash
git add functions/src/lib/codeSlots.js functions/src/lib/codeSlots.test.js
git commit -m "Add slotsFromLinks for pre-filling activation code slots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Section-wide issuing counts existing links

**Files:**
- Modify: `functions/src/handlers/codes.js` (import line 10; `issueActivationCodes`, lines 27–56)
- Test: `functions/test/emulator/codes.test.js`

**Interfaces:**
- Consumes: `slotsFromLinks(links, schoolYear)` from Task 1.
- Produces (module-internal, used by Task 3): `issueCodeFor(db, { studentId, student, section, schoolYear, by, reason }) → Promise<{ slip: { studentId, name, lrn, sectionLabel, schoolYear, code }, slotsFree: { guardian: number, adviser: number } } | { skipped: 'fully-linked' }>`.
- Test helpers added to `codes.test.js` (used by Task 3): `SEC`, `seedLink(uid, studentId, slot)`, `linkAll(studentId)`.

**Why the `beforeEach` change:** `seedSchool()` (in `functions/test/emulator/helpers.js`) creates two active guardian links for S1 (`gA_S1`, `gB_S1`). With this task, every new S1 code would start with both guardian slots used and the existing activation tests (which link new guardians to S1) would fail. Those links aren't needed by any test in `codes.test.js` (the `acceptConsent` tests use the `guardians/gA` profile, not the links), so delete them there. Don't change `helpers.js`; other test files rely on those links.

- [ ] **Step 1: Write the failing tests**

In `functions/test/emulator/codes.test.js`, replace the existing `beforeEach` block (lines 12–16) with:

```js
const SEC = { sectionId: 'SEC1', schoolYear: '2026-2027' };
const seedLink = (uid, studentId, slot) => db().doc(`guardian_links/${uid}_${studentId}`).set({
  guardianUid: uid, studentId, status: 'active', schoolYear: '2026-2027', relationship: slot === 'adviser' ? 'Adviser' : 'Mother', slot,
});
const linkAll = async (studentId) => { await seedLink('gA', studentId, 'guardian'); await seedLink('gB', studentId, 'guardian'); await seedLink('tAdv', studentId, 'adviser'); };

beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('users/registrar@bnhs.edu').set({ role: 'registrar' });
  await db().doc('enrollments/S2_2026-2027').set({ studentId: 'S2', sectionId: 'SEC1', schoolYear: '2026-2027', status: 'enrolled' });
  // seedSchool() links two guardians to S1; new S1 codes would start with
  // both guardian slots used. These tests link guardians themselves.
  await db().doc('guardian_links/gA_S1').delete();
  await db().doc('guardian_links/gB_S1').delete();
});
```

Then add these two tests inside `describe('issueActivationCodes', ...)`, after the `'enforces the staff daily limit'` test:

```js
  it('pre-fills slots from the learner\'s active links', async () => {
    await seedLink('gA', 'S1', 'guardian');
    const r = await issueActivationCodes(staff(), SEC);
    const code = r.slips.find((s) => s.studentId === 'S1').code;
    expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data()).toMatchObject({ guardianRedemptions: 1, maxGuardians: 2, adviserRedemptions: 0, maxAdvisers: 1, status: 'issued' });
    await activateCode(guardian('g1'), { code, relationship: 'Father', consentVersion: 1 });
    await expect(activateCode(guardian('g2'), { code, relationship: 'Guardian', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('skips a learner whose every slot is linked and leaves their code alone', async () => {
    const first = await issueActivationCodes(staff(), SEC);
    const old = first.slips.find((s) => s.studentId === 'S1').code;
    await linkAll('S1');
    const r = await issueActivationCodes(staff(), SEC);
    expect(r.skipped).toEqual([{ studentId: 'S1', reason: 'fully-linked' }]);
    expect(r.slips.map((s) => s.studentId)).toEqual(['S2']);
    expect((await db().doc(`activation_codes/${hashCode(old)}`).get()).data().status).toBe('issued');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:functions`
Expected: the two new tests FAIL (the first stores `guardianRedemptions: 0`; the second gets `skipped: []`). All other tests PASS. If any existing test fails, it's a sign the `beforeEach` change is wrong; fix that before continuing.

- [ ] **Step 3: Implement**

In `functions/src/handlers/codes.js`, change the `codeSlots.js` import (line 10) to:

```js
import { ADVISER, isDepedEmail, slotFor, claimSlot, slotsFromLinks, isOpenStatus } from '../lib/codeSlots.js';
```

Replace the comment and body of `issueActivationCodes` (lines 27–56, from `// Staff. One code per enrolled learner` through the closing `}` of the function) with:

```js
// Issues one learner's code with slots pre-filled from their active links
// (spec 2026-10-13 §2). A learner whose every slot is linked is skipped and
// keeps their current code: a new one could not link anybody.
async function issueCodeFor(db, { studentId, student, section, schoolYear, by, reason }) {
  const links = await db.collection('guardian_links').where('studentId', '==', studentId).where('status', '==', 'active').get();
  const slots = slotsFromLinks(links.docs.map((d) => d.data()), schoolYear);
  if (slots.status === 'exhausted') return { skipped: 'fully-linked' };
  await revokeOpenCodes(db, studentId, schoolYear, by, reason);
  const code = generateCode(randomBytes(8));
  await db.doc(`activation_codes/${hashCode(code)}`).set({ studentId, schoolYear, issuedAt: FieldValue.serverTimestamp(), issuedBy: by, ...slots });
  return {
    slip: { studentId, name: formalName(student), lrn: student.lrn, sectionLabel: sectionLabel(section), schoolYear, code },
    slotsFree: { guardian: slots.maxGuardians - slots.guardianRedemptions, adviser: slots.maxAdvisers - slots.adviserRedemptions },
  };
}

// Staff. One code per enrolled learner of the section; previous issued codes
// for the same learner+SY are revoked. Learners whose slots are all linked
// are skipped. Raw codes are returned once for the print job and never
// stored (spec §3).
export async function issueActivationCodes(ctx, data) {
  const { db, now, email } = ctx;
  const sectionId = str(data.sectionId, { name: 'sectionId', min: 1, max: 64 });
  const schoolYear = str(data.schoolYear, { name: 'schoolYear', min: 9, max: 9 });
  await enforceRateLimit(db, ctx.uid, 'issueCodes', LIMITS.issueCodes, now().getTime());

  const section = (await db.doc(`sections/${sectionId}`).get()).data();
  if (!section) throw new CallableError('not-found', 'Section not found');
  const enrolled = await db.collection('enrollments').where('sectionId', '==', sectionId).where('schoolYear', '==', schoolYear).where('status', '==', 'enrolled').get();

  const slips = [], skipped = [];
  for (const e of enrolled.docs) {
    const studentId = e.data().studentId;
    const student = (await db.doc(`students/${studentId}`).get()).data();
    if (!student) { skipped.push({ studentId, reason: 'missing' }); continue; }
    if (student.activationRestricted === true) { skipped.push({ studentId, reason: 'restricted' }); continue; }
    const r = await issueCodeFor(db, { studentId, student, section, schoolYear, by: email, reason: 'reissued' });
    if (r.skipped) { skipped.push({ studentId, reason: r.skipped }); continue; }
    slips.push(r.slip);
  }
  await audit(db, { action: 'code.issued', actorType: 'staff', actorUid: email, targetType: 'section', targetId: sectionId, details: { schoolYear, count: slips.length, skipped: skipped.length } });
  logEvent('codes_issued', { sectionId, count: slips.length });
  return { slips, skipped };
}
```

`newCodeSlots` is no longer imported by `codes.js`. Leave it exported in `codeSlots.js`; `codeSlots.test.js` uses it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:functions` and `npm --prefix functions test`
Expected: PASS, all files.

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/codes.js functions/test/emulator/codes.test.js
git commit -m "Count linked guardians when issuing section activation slips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `reissueActivationCode` callable

**Files:**
- Modify: `functions/src/handlers/codes.js` (add after `issueActivationCodes`)
- Modify: `functions/src/callable.js:6-11` (`LIMITS`)
- Modify: `functions/index.js:9` (import) and `:50-51` (exports)
- Test: `functions/test/emulator/codes.test.js`

**Interfaces:**
- Consumes: `issueCodeFor` (Task 2), `SEC`, `seedLink`, `linkAll` test helpers (Task 2).
- Produces: callable `reissueActivationCodeFn` with input `{ studentId: string, schoolYear: string, reason: string }` and output `{ slip: { studentId, name, lrn, sectionLabel, schoolYear, code }, slotsFree: { guardian: number, adviser: number } }`. Task 6 calls it from SIMS.

- [ ] **Step 1: Write the failing tests**

In `functions/test/emulator/codes.test.js`, change line 3 to:

```js
import { issueActivationCodes, reissueActivationCode, revokeCode, activateCode, acceptConsent } from '../../src/handlers/codes.js';
```

Add this `describe` block after the closing `});` of `describe('issueActivationCodes', ...)`:

```js
describe('reissueActivationCode', () => {
  const reissue = (data = {}) => reissueActivationCode(staff(), { studentId: 'S1', schoolYear: '2026-2027', reason: 'lost slip', ...data });
  const slipCode = (r, id) => r.slips.find((s) => s.studentId === id).code;
  const codeDoc = async (code) => (await db().doc(`activation_codes/${hashCode(code)}`).get()).data();

  it('replaces only that learner\'s slip and returns it with the free slots', async () => {
    const first = await issueActivationCodes(staff(), SEC);
    const r = await reissue();
    expect(r.slip).toMatchObject({ studentId: 'S1', name: 'Cruz, Ana B.', lrn: '100000000001', sectionLabel: 'Grade 7 – Rizal', schoolYear: '2026-2027' });
    expect(r.slip.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(r.slotsFree).toEqual({ guardian: 2, adviser: 1 });
    expect(await codeDoc(slipCode(first, 'S1'))).toMatchObject({ status: 'revoked', revokedReason: 'lost slip' });
    expect((await codeDoc(r.slip.code)).status).toBe('issued');
    expect((await codeDoc(slipCode(first, 'S2'))).status).toBe('issued');
    await expect(activateCode(guardian('g1'), { code: slipCode(first, 'S2'), relationship: 'Mother', consentVersion: 1 })).resolves.toMatchObject({ studentId: 'S2' });
  });
  it('counts linked guardians: one more can link, a third is refused', async () => {
    const first = await issueActivationCodes(staff(), SEC);
    await activateCode(guardian('g1'), { code: slipCode(first, 'S1'), relationship: 'Mother', consentVersion: 1 });
    const r = await reissue();
    expect(r.slotsFree).toEqual({ guardian: 1, adviser: 1 });
    // The already-linked guardian can enter the new code without using a slot.
    await activateCode(guardian('g1'), { code: r.slip.code, relationship: 'Mother', consentVersion: 1 });
    expect((await codeDoc(r.slip.code)).guardianRedemptions).toBe(1);
    await activateCode(guardian('g2'), { code: r.slip.code, relationship: 'Father', consentVersion: 1 });
    await expect(activateCode(guardian('g3'), { code: r.slip.code, relationship: 'Guardian', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('refuses when every slot is linked and leaves the current code alone', async () => {
    const first = await issueActivationCodes(staff(), SEC);
    await linkAll('S1');
    await expect(reissue()).rejects.toMatchObject({ code: 'failed-precondition', message: 'All guardian and adviser slots are linked. Revoke a link first.' });
    expect((await codeDoc(slipCode(first, 'S1'))).status).toBe('issued');
  });
  it('refuses an empty reason and unknown, not-enrolled or restricted learners', async () => {
    await expect(reissue({ reason: '   ' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(reissue({ studentId: 'NOPE' })).rejects.toMatchObject({ code: 'not-found', message: 'Learner not found' });
    await expect(reissue({ schoolYear: '2027-2028' })).rejects.toMatchObject({ code: 'failed-precondition', message: 'This learner is not enrolled for 2027-2028.' });
    await db().doc('students/S1').set({ activationRestricted: true }, { merge: true });
    await expect(reissue()).rejects.toMatchObject({ code: 'failed-precondition', message: 'This learner is restricted. Lift the restriction first.' });
    expect((await db().collection('activation_codes').get()).size).toBe(0);
    expect((await db().collection('audit_log').where('action', '==', 'code.reissued').get()).size).toBe(0);
  });
  it('writes a code.reissued audit entry without the raw code', async () => {
    const r = await reissue();
    const rows = await db().collection('audit_log').where('action', '==', 'code.reissued').get();
    expect(rows.size).toBe(1);
    expect(rows.docs[0].data()).toMatchObject({
      actorType: 'staff', actorUid: 'registrar@bnhs.edu', targetType: 'student', targetId: 'S1',
      details: { schoolYear: '2026-2027', reason: 'lost slip', guardianSlotsFree: 2, adviserSlotsFree: 1 },
    });
    expect(JSON.stringify(rows.docs[0].data())).not.toContain(r.slip.code);
  });
  it('has its own daily limit, separate from section-wide issuing', async () => {
    await db().doc('rate_limits/staff1').set({ issueCodes: { count: 20, windowStartMs: NOW.getTime() - 1000 } });
    await expect(reissue()).resolves.toMatchObject({ slip: { studentId: 'S1' } });
    await db().doc('rate_limits/staff1').set({ reissueCode: { count: 60, windowStartMs: NOW.getTime() - 1000 } }, { merge: true });
    await expect(reissue()).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:functions`
Expected: FAIL in `codes.test.js` with `reissueActivationCode is not a function` (the import resolves to `undefined`).

- [ ] **Step 3: Add the rate limit**

In `functions/src/callable.js`, change `LIMITS` to:

```js
export const LIMITS = {
  activate: { windowMs: 60 * 60 * 1000, max: 5 },
  activateAdviser: { windowMs: 60 * 60 * 1000, max: 60 },
  report: { windowMs: 24 * 60 * 60 * 1000, max: 5 },
  issueCodes: { windowMs: 24 * 60 * 60 * 1000, max: 20 },
  // Replacing single lost slips has its own budget so it doesn't use up the
  // section-wide one.
  reissueCode: { windowMs: 24 * 60 * 60 * 1000, max: 60 },
};
```

- [ ] **Step 4: Implement the handler**

In `functions/src/handlers/codes.js`, insert directly after the closing `}` of `issueActivationCodes`:

```js
// Staff. Replaces one learner's lost or damaged slip without touching the
// rest of the section (spec 2026-10-13 §4).
export async function reissueActivationCode(ctx, data) {
  const { db, now, email } = ctx;
  const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
  const schoolYear = str(data.schoolYear, { name: 'schoolYear', min: 9, max: 9 });
  const reason = str(data.reason, { name: 'Reason', min: 1, max: 200 });
  await enforceRateLimit(db, ctx.uid, 'reissueCode', LIMITS.reissueCode, now().getTime());

  const student = (await db.doc(`students/${studentId}`).get()).data();
  if (!student) throw new CallableError('not-found', 'Learner not found');
  if (student.activationRestricted === true) throw new CallableError('failed-precondition', 'This learner is restricted. Lift the restriction first.');
  const enrollment = (await db.doc(`enrollments/${studentId}_${schoolYear}`).get()).data();
  if (enrollment?.status !== 'enrolled') throw new CallableError('failed-precondition', `This learner is not enrolled for ${schoolYear}.`);
  const section = (await db.doc(`sections/${enrollment.sectionId}`).get()).data();

  const r = await issueCodeFor(db, { studentId, student, section, schoolYear, by: email, reason });
  if (r.skipped) throw new CallableError('failed-precondition', 'All guardian and adviser slots are linked. Revoke a link first.');
  await audit(db, { action: 'code.reissued', actorType: 'staff', actorUid: email, targetType: 'student', targetId: studentId, details: { schoolYear, reason, guardianSlotsFree: r.slotsFree.guardian, adviserSlotsFree: r.slotsFree.adviser } });
  logEvent('code_reissued', { studentId });
  return r;
}
```

- [ ] **Step 5: Export the callable**

In `functions/index.js`, change line 9 to:

```js
import { issueActivationCodes, reissueActivationCode, revokeCode, activateCode, acceptConsent } from './src/handlers/codes.js';
```

and add after `export const issueActivationCodesFn = adminCall(issueActivationCodes);`:

```js
export const reissueActivationCodeFn = adminCall(reissueActivationCode);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:functions` and `npm --prefix functions test`
Expected: PASS, all files.

Also check that `functions/index.js` still loads: `node --input-type=module -e "await import('./functions/index.js'); console.log('ok')"`
Expected: `ok`. If it fails only because Firebase isn't configured (no credentials/project), that's fine, but no `SyntaxError` and no missing-export error.

- [ ] **Step 7: Commit**

```bash
git add functions/src/handlers/codes.js functions/src/callable.js functions/index.js functions/test/emulator/codes.test.js
git commit -m "Add reissueActivationCode callable for one learner's slip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: SIMS slip text and print hiding

**Files:**
- Create: `src/lib/slipIssue.js`
- Create: `src/lib/slipIssue.test.js`
- Modify: `src/lib/slipLayout.js:57` (the `@media print` hide rule)
- Modify: `src/lib/slipLayout.test.js` (add one test)

**Interfaces:**
- Produces: `issuedSummary({ slips: Array, skipped: Array<{ reason: string }> }) → string`; `slotsFreeText({ guardian: number, adviser: number }) → string`; CSS class `slips-print-hide` hidden on print by `slipPrintStyles(paper)`. Tasks 5 and 6 use all three.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/slipIssue.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { issuedSummary, slotsFreeText } from './slipIssue.js';

describe('issuedSummary', () => {
  it('counts issued slips', () => {
    expect(issuedSummary({ slips: [{}, {}], skipped: [] })).toBe('2 slips issued.');
    expect(issuedSummary({ slips: [{}], skipped: [] })).toBe('1 slip issued.');
  });
  it('names each skip reason once, in plain words', () => {
    const skipped = [{ reason: 'fully-linked' }, { reason: 'fully-linked' }, { reason: 'restricted' }, { reason: 'missing' }];
    expect(issuedSummary({ slips: [{}], skipped })).toBe('1 slip issued, 4 skipped (all slots already linked, restricted, learner record missing).');
  });
  it('shows an unknown reason as it is', () => {
    expect(issuedSummary({ slips: [], skipped: [{ reason: 'other' }] })).toBe('0 slips issued, 1 skipped (other).');
  });
});

describe('slotsFreeText', () => {
  it('says how many people can still link and that the code shows once', () => {
    expect(slotsFreeText({ guardian: 1, adviser: 1 })).toBe('New slip ready: 1 guardian / 1 adviser slots free. Print it now — the code is shown only once.');
    expect(slotsFreeText({ guardian: 0, adviser: 1 })).toBe('New slip ready: 0 guardian / 1 adviser slot free. Print it now — the code is shown only once.');
  });
});
```

In `src/lib/slipLayout.test.js`, add inside `describe('slipLayout', ...)`, after the `'requests the right page size and row height in the print CSS'` test:

```js
  it('hides .slips-print-hide content when printing', () => {
    expect(slipPrintStyles('folio')).toMatch(/\.slips-print-hide\s*\{\s*display: none !important;/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL: `slipIssue.test.js` can't resolve `./slipIssue.js`, and the new slipLayout test fails its regex.

- [ ] **Step 3: Implement**

Create `src/lib/slipIssue.js`:

```js
// Plain-words text for the activation-slip screens (spec 2026-10-13 §5–6).
const SKIP_REASONS = { restricted: 'restricted', missing: 'learner record missing', 'fully-linked': 'all slots already linked' };

// "28 slips issued, 2 skipped (all slots already linked)."
export function issuedSummary({ slips, skipped }) {
  const issued = `${slips.length} ${slips.length === 1 ? 'slip' : 'slips'} issued`;
  if (!skipped.length) return `${issued}.`;
  const reasons = [...new Set(skipped.map((s) => SKIP_REASONS[s.reason] || s.reason))].join(', ');
  return `${issued}, ${skipped.length} skipped (${reasons}).`;
}

export function slotsFreeText({ guardian, adviser }) {
  return `New slip ready: ${guardian} guardian / ${adviser} adviser ${guardian + adviser === 1 ? 'slot' : 'slots'} free. Print it now — the code is shown only once.`;
}
```

In `src/lib/slipLayout.js`, change the hide rule inside `@media print` to:

```css
    .app-sidebar, .app-topbar, .guardians-heading, .guardians-tabs, .codes-tab-controls, .slips-print-hide { display: none !important; }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/slipIssue.js src/lib/slipIssue.test.js src/lib/slipLayout.js src/lib/slipLayout.test.js
git commit -m "Add plain-words slip result text and a print-hide class

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Shared `SlipPrintControls`, used by the Codes tab

**Files:**
- Create: `src/components/SlipPrintControls.jsx`
- Modify: `src/pages/guardians/CodesTab.jsx` (whole file below)

**Interfaces:**
- Consumes: `issuedSummary` (Task 4); `PAPER_SIZES`, `PAPER_STORAGE_KEY`, `readStoredPaper` from `src/lib/slipLayout.js`; `Btn` from `src/components/ui.jsx`; `T` from `src/styles.js`.
- Produces (Task 6 uses these): default export `SlipPrintControls({ paper: 'folio' | 'a4', onPaperChange: (key) => void, printReady: boolean, children? })`; named `useSlipPaper() → [paper, setPaper]`; named `PORTAL_URL: string`.

No component tests exist in this repo (Vitest runs in node), so this task is verified by the build and by the Codes tab behaving exactly as before.

- [ ] **Step 1: Create the component**

Create `src/components/SlipPrintControls.jsx`:

```jsx
import { useState } from 'react';
import { T } from '../styles.js';
import { Btn } from './ui.jsx';
import { PAPER_SIZES, PAPER_STORAGE_KEY, readStoredPaper } from '../lib/slipLayout.js';

export const PORTAL_URL = import.meta.env.VITE_PARENT_PORTAL_URL || 'https://bnhs-parent.web.app';

// The paper choice is remembered per browser.
export function useSlipPaper() {
  const [paper, setPaperState] = useState(() => readStoredPaper());
  const setPaper = (next) => {
    setPaperState(next);
    try { localStorage.setItem(PAPER_STORAGE_KEY, next); } catch { /* the paper still switches without storage */ }
  };
  return [paper, setPaper];
}

// Paper toggle, Print button and print-dialog hint, shared by the Codes tab
// (a section's slips) and the Links tab (one reissued slip). `children`
// sit just before Print, e.g. the Issue slips button.
export default function SlipPrintControls({ paper, onPaperChange, printReady, children }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '16px 0 6px' }}>
        <div role="group" aria-label="Paper" style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 'auto' }}>
          <span style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>Paper</span>
          {Object.values(PAPER_SIZES).map((p) => (
            <Btn key={p.key} variant={paper === p.key ? 'solid' : 'ghost'} aria-pressed={paper === p.key} onClick={() => onPaperChange(p.key)} style={{ padding: '6px 14px' }}>
              {p.label} · {p.cols * p.rows}/sheet
            </Btn>
          ))}
        </div>
        {children}
        <Btn variant="ghost" onClick={() => window.print()} disabled={!printReady}>Print</Btn>
      </div>
      <p style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted, margin: '0 0 14px' }}>
        In the print dialog, set Paper size to {paper === 'a4' ? 'A4' : 'Folio / 8.5×13'} and Scale to 100%.
      </p>
    </>
  );
}
```

- [ ] **Step 2: Switch the Codes tab to it**

Replace the whole of `src/pages/guardians/CodesTab.jsx` with:

```jsx
import { usePrintReadiness } from '../../hooks/usePrintReadiness.js';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { ActionFeedback } from '../../components/ui.jsx';
import { ResourceState } from '../../components/ui.jsx';
import { useMemo, useRef, useState } from 'react';
import { useCollectionResource } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { T, S } from '../../styles.js';
import { Btn, Card, EmptyState } from '../../components/ui.jsx';
import ActivationSlipsPrintable from '../../components/ActivationSlipsPrintable.jsx';
import SlipPrintControls, { useSlipPaper, PORTAL_URL } from '../../components/SlipPrintControls.jsx';
import { issuedSummary } from '../../lib/slipIssue.js';
import SectionPicker from '../../components/SectionPicker.jsx';
import EndSchoolYearCard from './EndSchoolYearCard.jsx';

// Raw codes exist only in this component's state after issuing. Closing the
// page loses them; the registrar reissues (which revokes the old codes).
export default function CodesTab({ schoolYear }) {
  const action = useAsyncAction();
  const sectionsResource = useCollectionResource('sections');
  const sections = sectionsResource.data;
  const sectionsSY = useMemo(() => sections.filter((s) => s.schoolYear === schoolYear).sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)), [sections, schoolYear]);
  const [sectionId, setSectionId] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [paper, setPaper] = useSlipPaper();
  const printRoot = useRef(null);
  const printReady = usePrintReadiness(printRoot, result, result?.slips?.length || 0);

  const issue = async () => {
    if (!window.confirm('Issue new activation slips for this section? Any previously printed slips for these learners stop working.')) return;
    setBusy(true); setErr('');
    try { setResult(await call.issueActivationCodes({ sectionId, schoolYear })); }
    catch (e) { setErr(e.message || 'Could not issue codes.'); }
    setBusy(false);
  };

  if ([sectionsResource].some(r => r.loading || r.error)) return <ResourceState resources={[sectionsResource]}/>;

  return (
    <>
      <ActionFeedback action={action}/>
      <Card className="codes-tab-controls" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={S.h2}>Issue activation slips</h2>
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>One slip per enrolled learner. Print them right away — codes are shown only once. Slips work for the whole school year until you end it below. Hand them to parents in person (adviser/homeroom). Learners flagged "restricted", and learners whose guardian and adviser slots are all linked, are skipped. To replace one lost slip, use Reissue slip on the Links tab.</p>
        {err && <div style={{ color: T.absent, fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <SectionPicker sections={sectionsSY} value={sectionId} disabled={busy || action.busy} label="Section" onChange={(id) => { setSectionId(id); setResult(null); }} />
        <SlipPrintControls paper={paper} onPaperChange={setPaper} printReady={printReady}>
          <Btn onClick={() => action.run('issue', issue)} disabled={action.busy || busy || !sectionId}>{busy ? 'Issuing…' : 'Issue slips'}</Btn>
        </SlipPrintControls>
        {result && <div style={{ fontFamily: T.body, fontSize: 13 }}>{issuedSummary(result)}</div>}
      </Card>
      <EndSchoolYearCard schoolYear={schoolYear} />
      {result?.slips?.length ? <div ref={printRoot}><ActivationSlipsPrintable slips={result.slips} portalUrl={PORTAL_URL} paper={paper} /></div> : <EmptyState title="No slips issued yet" hint="Choose a section and issue slips to print them." />}
    </>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm test` then `npm run build`
Expected: tests PASS; build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/SlipPrintControls.jsx src/pages/guardians/CodesTab.jsx
git commit -m "Share slip paper and print controls; plain-words skip reasons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Reissue slip on the Links tab

**Files:**
- Modify: `src/data/guardians.js:10-11` (add `reissueActivationCode` to `call`)
- Modify: `src/pages/guardians/LinksTab.jsx` (whole file below)

**Interfaces:**
- Consumes: callable `reissueActivationCodeFn` (Task 3) returning `{ slip, slotsFree }`; `slotsFreeText` and the `slips-print-hide` class (Task 4); `SlipPrintControls`, `useSlipPaper`, `PORTAL_URL` (Task 5); existing `ActivationSlipsPrintable({ slips, portalUrl, paper })` and `usePrintReadiness(ref, key, count)`.

- [ ] **Step 1: Add the client call**

In `src/data/guardians.js`, add after `issueActivationCodes: fn('issueActivationCodesFn'),`:

```js
  reissueActivationCode: fn('reissueActivationCodeFn'),
```

- [ ] **Step 2: Add the button, panel and printable slip**

Replace the whole of `src/pages/guardians/LinksTab.jsx` with the file below. Compared with the current file, the changes are: new imports (`useRef`, `usePrintReadiness`, `ActivationSlipsPrintable`, `SlipPrintControls`, `slotsFreeText`); `paper`/`reissued`/`reissueErr`/`printRoot`/`printReady` state; a `pickLearner` that clears the reissued slip; the `reissue` function; the **Reissue slip** button; **Revoke slip** and **Restrict** now also clear a shown reissued slip (it stops working); the reissue panel and printable slip; and `slips-print-hide` on every other card/message so only the slip prints.

```jsx
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { usePrintReadiness } from '../../hooks/usePrintReadiness.js';
import { ActionFeedback } from '../../components/ui.jsx';
import { ResourceState } from '../../components/ui.jsx';
import { useMemo, useRef, useState } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useCollectionResource, useQueryResource, useDoc } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { depedSort, fullName } from '../../lib/roster.js';
import { localDate } from '../../lib/dates.js';
import { learnerMatches } from '../../lib/search.js';
import { currentEnrollmentByStudent } from '../../lib/enrollmentChange.js';
import { slotsFreeText } from '../../lib/slipIssue.js';
import { GRADES, UNASSIGNED } from '../../lib/constants.js';
import { T, S } from '../../styles.js';
import { Btn, Inp, Sel, Field, Card, EmptyState } from '../../components/ui.jsx';
import GradePills from '../../components/GradePills.jsx';
import ActivationSlipsPrintable from '../../components/ActivationSlipsPrintable.jsx';
import SlipPrintControls, { useSlipPaper, PORTAL_URL } from '../../components/SlipPrintControls.jsx';
import { Table, when } from './RequestsTab.jsx';

// The guardian's own profile wins (they can rename themselves in the portal);
// the name/email copied onto the link at activation covers deleted profiles.
function GuardianCell({ link }) {
  const profile = useDoc(`guardians/${link.guardianUid}`);
  const name = profile?.displayName || link.guardianName;
  const email = profile?.email || link.guardianEmail;
  return (
    <td style={S.td}>
      {name ? <strong>{name}</strong> : <span style={{ color: T.inkMuted }}>Name not given</span>}
      {email && <><br /><span style={{ color: T.inkMuted }}>{email}</span></>}
      <br /><span style={{ ...T.num, fontSize: 11, color: T.inkMuted }}>{link.guardianUid}</span>
    </td>
  );
}

export default function LinksTab({ schoolYear }) {
  const action = useAsyncAction();
  const studentsResource = useCollectionResource('students');
  const students = studentsResource.data;
  const enrollmentsResource = useCollectionResource('enrollments');
  const enrollments = enrollmentsResource.data;
  const sectionsResource = useCollectionResource('sections');
  const sections = sectionsResource.data;
  const [q, setQ] = useState(''); const [studentId, setStudentId] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const enrollmentByStudent = useMemo(() => currentEnrollmentByStudent(enrollments, schoolYear), [enrollments, schoolYear]);
  const sectionById = useMemo(() => new Map(sections.map((section) => [section.id, section])), [sections]);
  const enrolledGrades = useMemo(() => new Set([...enrollmentByStudent.values()].map((enrollment) => Number(enrollment.gradeLevel))), [enrollmentByStudent]);
  const gradeOptions = useMemo(() => [
    { value: '', label: 'All' },
    ...GRADES.filter((grade) => enrolledGrades.has(grade)).map((grade) => ({ value: grade, label: `Grade ${grade}` })),
    { value: UNASSIGNED, label: 'Unassigned' },
  ], [enrolledGrades]);
  const allMatches = useMemo(() => q.trim() ? depedSort(students.filter((candidate) => {
    const enrollment = enrollmentByStudent.get(candidate.id);
    const gradeHit = gradeFilter === '' ||
      (gradeFilter === UNASSIGNED ? !enrollment : Number(enrollment?.gradeLevel) === Number(gradeFilter));
    return gradeHit && learnerMatches(q, candidate, { includeLrn: true });
  })) : [], [enrollmentByStudent, gradeFilter, q, students]);
  const matches = allMatches.slice(0, 20);
  const student = students.find((s) => s.id === studentId);
  const linksResource = useQueryResource(() => studentId && query(collection(db, 'guardian_links'), where('studentId', '==', studentId), limit(20)), [studentId]);
  const links = linksResource.data;
  const [reason, setReason] = useState('');
  const [manual, setManual] = useState({ kind: 'in', date: localDate(), time: '', reason: '' });
  // A reissued slip's raw code lives only here, for the learner it was
  // issued for; picking another learner drops it.
  const [reissued, setReissued] = useState(null);
  const [reissueErr, setReissueErr] = useState('');
  const [paper, setPaper] = useSlipPaper();
  const printRoot = useRef(null);
  const printReady = usePrintReadiness(printRoot, reissued, reissued ? 1 : 0);

  const pickLearner = (id) => { setStudentId(id); setQ(''); setReissued(null); setReissueErr(''); };
  // Errors are caught here (not by action.run) so the server's own message,
  // e.g. "All guardian and adviser slots are linked", reaches staff.
  const reissue = async () => {
    if (!window.confirm(`Issue a new slip for ${fullName(student)}? Their current slip stops working. Guardians already linked keep access.`)) return;
    setReissued(null); setReissueErr('');
    try { setReissued(await call.reissueActivationCode({ studentId: student.id, schoolYear, reason })); }
    catch (e) { setReissueErr(e.message || 'Could not reissue the slip.'); }
  };

  const resources = [studentsResource, enrollmentsResource, sectionsResource];
  if (resources.some(r => r.loading || r.error)) return <ResourceState resources={resources}/>;

  return (
    <>
      <div className="slips-print-hide"><ActionFeedback action={action}/></div>
      <Card className="slips-print-hide" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ marginBottom: 14 }}><GradePills options={gradeOptions} value={gradeFilter} onChange={setGradeFilter} label="Learner grade" /></div>
        <Field label="Find a learner (name or LRN)"><Inp type="search" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        {matches.map((s) => {
          const enrollment = enrollmentByStudent.get(s.id);
          const section = enrollment ? sectionById.get(enrollment.sectionId) : null;
          const placement = enrollment ? `Grade ${enrollment.gradeLevel} ${section?.name || 'Section unavailable'}` : 'Unassigned';
          return <Btn key={s.id} variant="ghost" onClick={() => pickLearner(s.id)} style={{ marginRight: 6, marginBottom: 6, maxWidth: '100%', whiteSpace: 'normal', textAlign: 'left' }}>{fullName(s)} · {s.lrn} · {placement}</Btn>;
        })}
        {allMatches.length > 20 && <div aria-live="polite" style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted }}>Showing 20 of {allMatches.length} — keep typing to narrow down.</div>}
      </Card>
      {!student && <div className="slips-print-hide"><EmptyState title="Choose a learner" hint="See who can view their gate scans, reissue or revoke their slip, restrict self-service activation, or add a manual scan." /></div>}
      {student && (
        <>
          <Card className="slips-print-hide" style={{ padding: 20, marginBottom: 16 }}>
            <h2 style={S.h2}>{fullName(student)} · {student.lrn} {student.activationRestricted && <span style={{ color: T.absent }}>· RESTRICTED</span>}</h2>
            <Field label="Reason (recorded in the audit log)"><Inp value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn variant="ghost" disabled={action.busy || !reason.trim() || student.activationRestricted} onClick={() => action.run('reissue', reissue)}>Reissue slip</Btn>
              <Btn variant="ghost" disabled={action.busy || !reason.trim()} onClick={() => action.run('action', async () => { await call.revokeCode({ studentId: student.id, schoolYear, reason }); setReissued(null); })}>Revoke slip</Btn>
              <Btn variant="ghost" disabled={action.busy || !reason.trim()} style={{ color: T.absent, borderColor: T.absent }} onClick={() => action.run('action', async () => { await call.setActivationRestricted({ studentId: student.id, restricted: !student.activationRestricted, reason }); setReissued(null); })}>{student.activationRestricted ? 'Lift restriction' : 'Restrict (custody) — revokes all access'}</Btn>
            </div>
            {reissueErr && <p role="alert" className="sims-feedback" style={{ marginTop: 10 }}>{reissueErr}</p>}
          </Card>
          {reissued && (
            <>
              <Card className="slips-print-hide" style={{ padding: 20, marginBottom: 16 }}>
                <h2 style={S.h2}>Reissued slip</h2>
                <p role="status" style={{ fontFamily: T.body, fontSize: 13, margin: 0 }}>{slotsFreeText(reissued.slotsFree)}</p>
                <SlipPrintControls paper={paper} onPaperChange={setPaper} printReady={printReady} />
              </Card>
              <div ref={printRoot} style={{ marginBottom: 16 }}><ActivationSlipsPrintable slips={[reissued.slip]} portalUrl={PORTAL_URL} paper={paper} /></div>
            </>
          )}
          <ResourceState resources={[linksResource]}><Card className="slips-print-hide" style={{ marginBottom: 16 }}>
            {links.length === 0 ? <EmptyState title="No guardians linked" /> : (
              <Table head={['Guardian', 'Relationship', 'Status', 'Activated', 'Via', 'Revoked', '']} rows={links.map((l) => (
                <tr key={l.id}>
                  <GuardianCell link={l} /><td style={S.td}>{l.relationship}</td><td style={S.td}>{l.status}</td>
                  <td style={S.td}>{when(l.activatedAt)}</td><td style={S.td}>{l.activatedVia}</td>
                  <td style={S.td}>{l.status === 'revoked' ? `${when(l.revokedAt)} — ${l.revokedReason || ''}` : '—'}</td>
                  <td style={S.td}>{l.status === 'active' && <Btn variant="ghost" disabled={action.busy || !reason.trim()} onClick={() => action.run('action', () => call.revokeLink({ linkId: l.id, reason }))}>Revoke</Btn>}</td>
                </tr>
              ))} />
            )}
          </Card></ResourceState>
          <Card className="slips-print-hide" style={{ padding: 20 }}>
            <h2 style={S.h2}>Add a manual gate scan (e.g. kiosk was down)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'var(--sims-form-columns, auto auto auto 1fr auto)', gap: 12, alignItems: 'end' }}>
              <Field label="Kind"><Sel value={manual.kind} onChange={(e) => setManual({ ...manual, kind: e.target.value })}><option value="in">Entered</option><option value="out">Left</option></Sel></Field>
              <Field label="Date"><Inp type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></Field>
              <Field label="Time"><Inp type="time" value={manual.time} onChange={(e) => setManual({ ...manual, time: e.target.value })} /></Field>
              <Field label="Reason (shown to the parent)"><Inp value={manual.reason} onChange={(e) => setManual({ ...manual, reason: e.target.value })} /></Field>
              <Btn style={{ marginBottom: 14 }} disabled={action.busy || !manual.time || !manual.reason.trim()} onClick={() => action.run('action', () => call.addManualEvent({ studentId: student.id, ...manual }))}>Add</Btn>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
```

Note: if a `ResourceState` error or loading block for `linksResource` renders instead of the card, it's not hidden on print. That's acceptable: staff print after the panel shows, by which time the links have loaded.

- [ ] **Step 3: Verify**

Run: `npm test` then `npm run build`
Expected: tests PASS; build completes with no errors.

- [ ] **Step 4: Manual check (controller or human)**

With the emulators and SIMS dev server running (see `docs/parent-portal-runbook.md`), signed in as an administrator, open Guardians → Links:
1. Pick an enrolled learner, type a reason, click **Reissue slip**, confirm. Expect the "Reissued slip" panel with `New slip ready: 2 guardian / 1 adviser slots free…` and one slip below it.
2. Click **Print**. The print preview shows only the slip (no search card, links table or manual-scan card), on Folio by default; switch to A4 and preview again.
3. Pick another learner: the panel and slip disappear. Reissue again, then click **Revoke slip**: the panel and slip disappear.
4. With 2 guardians + 1 adviser linked to a learner, **Reissue slip** shows `All guardian and adviser slots are linked. Revoke a link first.` under the buttons.
5. Codes tab: **Issue slips** for a section still works and prints as before; the result line uses the new wording.

- [ ] **Step 5: Commit**

```bash
git add src/data/guardians.js src/pages/guardians/LinksTab.jsx
git commit -m "Reissue one learner's activation slip from the Links tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
