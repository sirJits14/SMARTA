# DepEd relationship change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `@deped.gov.ph` account can switch its own learner link between a guardian relationship and Adviser, once per link per school year, from the learner's history screen.

**Architecture:** A new guardian callable `changeLinkRelationship` checks everything and writes in one Firestore transaction: it updates the caller's `guardian_links` doc and recounts the learner's open activation slips from the active links. The Parent app shows a "Linked as … · Change" row on `/learner/:id` for DepEd accounts only, and opens a lazy-loaded sheet that calls the function. SIMS shows a "changed from …" note on the Learner access tab.

**Tech Stack:** Firebase Functions v2 (Node, ESM), Firestore, vitest + Firestore emulator, React 19 + Vite (Parent app and SIMS).

**Spec:** `docs/superpowers/specs/2026-10-17-deped-relationship-change-design.md`

## Global Constraints

- DepEd check: email ends with `@deped.gov.ph`, case-insensitive, after trim (the existing `isDepedEmail` in `functions/src/lib/codeSlots.js`).
- Allowed changes are only across the line: guardian (`Mother`, `Father`, `Guardian`, `Grandparent`, `Sibling`, `Other`) → `Adviser`, or `Adviser` → guardian. A link with no `slot` is a guardian link.
- One change per link per school year: stored as `relationshipChangedFor: <link.schoolYear>`.
- Caps: `MAX_GUARDIANS = 2`, `MAX_ADVISERS = 1`. These are counted from the learner's active links for the link's school year, leaving out the caller's own link.
- `guardian_links` stays server-write-only. `firestore.rules` must not change.
- Server messages, verbatim:
  - `Only DepEd (@deped.gov.ph) accounts can change their relationship.`
  - `This link is no longer active.`
  - `You already changed your relationship for SY {SY}. Ask the registrar if it needs fixing again.`
  - `Choose Adviser, or the relationship you have to the learner.`
  - `This learner already has an adviser linked. Ask the registrar to remove that link first.`
  - `This learner already has 2 linked guardians. Ask the registrar to remove one first.`
- Audit action: `link.relationshipChanged`, with details `{ from, to, fromSlot, toSlot, schoolYear }`.
- Parent strings must not contain `location`, `tracking` or `live` (`parent/src/strings.js` `FORBIDDEN`).
- The Parent app's eager bundle stays under the `npm --prefix parent run size` budget, so the sheet is a dynamic import.
- Do not deploy anything as part of this plan. Releases follow the existing flows (functions first, then `hosting:parent`, then SIMS from its release tree).
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Action | Responsibility |
|---|---|---|
| `functions/src/handlers/links.js` | Modify | New `changeLinkRelationship` handler |
| `functions/src/callable.js` | Modify | `LIMITS.relationshipChange` |
| `functions/index.js` | Modify | Export `changeLinkRelationshipFn` |
| `functions/test/emulator/relationshipChange.test.js` | Create | Emulator tests for the handler |
| `tests/rules/parent.test.js` | Modify | Guardian still cannot update their own link |
| `parent/src/lib/relationships.js` | Create | Relationship lists, `isDepedEmail`, `relationshipOptions`, `changeErrorMessage` |
| `parent/src/lib/relationships.test.js` | Create | Unit tests for the above |
| `parent/src/strings.js` / `parent/src/lib/strings.test.js` | Modify | New `rel*` strings |
| `parent/src/screens/Activate.jsx` | Modify | Import the shared lists |
| `parent/src/components/RelationshipRow.jsx` | Create | "Linked as … · Change" row |
| `parent/src/components/RelationshipSheet.jsx` | Create | Lazy change dialog |
| `parent/src/screens/History.jsx` | Modify | Read own link (DepEd only), show row and sheet |
| `parent/tests/browser/relationship.config.mjs`, `relationship-preview.html`, `relationship-preview.jsx` | Create | Synthetic browser preview of the row and sheet |
| `src/pages/guardians/linkRelationship.js` / `.test.js` | Create | `relationshipChangeNote(link)` |
| `src/pages/guardians/LinksTab.jsx` | Modify | Relationship cell shows the note |
| `docs/parent-portal-adviser-guide.md`, `docs/guardian-account-guide.md`, `docs/parent-portal-runbook.md` | Modify | User and staff docs |

---

### Task 1: Server callable `changeLinkRelationship`

**Files:**
- Create: `functions/test/emulator/relationshipChange.test.js`
- Modify: `functions/src/handlers/links.js` (imports at lines 1-10; new handler after `resolveAccessRequest`)
- Modify: `functions/src/callable.js:6-16` (`LIMITS`)
- Modify: `functions/index.js:11` (import) and after `:60` (export)
- Modify: `tests/rules/parent.test.js:73` (one more `denied` line)

**Interfaces:**
- Produces: `changeLinkRelationship(ctx: { db, now, uid, email }, data: { studentId: string, relationship: string }) → Promise<{ relationship: string, slot: 'guardian' | 'adviser' }>`, exported to clients as the callable `changeLinkRelationshipFn`.
- Produces: link fields `relationship`, `slot`, `previousRelationship` (string or null), `relationshipChangedFor` (school year string), `relationshipChangedAt` (server timestamp). Tasks 3 and 4 read these.
- Consumes: `isDepedEmail`, `slotFor`, `slotsFromLinks`, `isOpenStatus`, `ADVISER` (`functions/src/lib/codeSlots.js`); `RELATIONSHIPS` (`functions/src/handlers/codes.js`); `schoolYearRef`, `isEnded` (`functions/src/lib/schoolYears.js`); `enforceRateLimit`, `LIMITS` (`functions/src/callable.js`).

- [ ] **Step 1: Write the failing emulator tests**

Create `functions/test/emulator/relationshipChange.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { changeLinkRelationship } from '../../src/handlers/links.js';
import { issueActivationCodes, activateCode } from '../../src/handlers/codes.js';
import { hashCode } from '../../src/lib/activationCode.js';
import { LIMITS } from '../../src/callable.js';

const NOW = new Date('2026-09-21T08:00:00+08:00');
const SY = '2026-2027';
const staff = () => ({ db: db(), now: () => NOW, uid: 'staff1', email: 'registrar@bnhs.edu' });
const account = (uid, email) => ({ db: db(), now: () => NOW, uid, email, displayName: 'Teacher' });
const deped = (uid = 'tAdv') => account(uid, `${uid}@deped.gov.ph`);
const gmail = (uid) => account(uid, `${uid}@gmail.com`);
const change = (who, relationship, studentId = 'S1') => changeLinkRelationship(who, { studentId, relationship });
const link = async (id) => (await db().doc(`guardian_links/${id}`).get()).data();
const seedLink = (uid, over = {}) => db().doc(`guardian_links/${uid}_S1`).set({
  guardianUid: uid, studentId: 'S1', status: 'active', schoolYear: SY, relationship: 'Mother', slot: 'guardian', ...over,
});
const issueSlip = async () => (await issueActivationCodes(staff(), { sectionId: 'SEC1', schoolYear: SY })).slips.find((s) => s.studentId === 'S1').code;
const redeem = (who, code, relationship) => activateCode(who, { code, relationship, consentVersion: 1, guardianName: 'Name' });
const slip = async (code) => (await db().doc(`activation_codes/${hashCode(code)}`).get()).data();
const audits = async () => (await db().collection('audit_log').where('action', '==', 'link.relationshipChanged').get()).docs.map((d) => d.data());

beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('users/registrar@bnhs.edu').set({ role: 'registrar' });
  // seedSchool() links gA and gB to S1; these tests link people themselves.
  await db().doc('guardian_links/gA_S1').delete();
  await db().doc('guardian_links/gB_S1').delete();
});

describe('changeLinkRelationship', () => {
  it('moves an adviser who picked Mother into the adviser slot and frees the guardian slot on the slip', async () => {
    const code = await issueSlip();
    await redeem(deped(), code, 'Mother');
    expect(await slip(code)).toMatchObject({ guardianRedemptions: 1, adviserRedemptions: 0 });

    await expect(change(deped(), 'Adviser')).resolves.toEqual({ relationship: 'Adviser', slot: 'adviser' });
    const changed = await link('tAdv_S1');
    expect(changed).toMatchObject({ status: 'active', relationship: 'Adviser', slot: 'adviser', previousRelationship: 'Mother', relationshipChangedFor: SY });
    expect(changed.relationshipChangedAt).toBeTruthy();
    expect(await slip(code)).toMatchObject({ guardianRedemptions: 0, adviserRedemptions: 1, status: 'issued' });
    expect(await audits()).toEqual([expect.objectContaining({
      actorType: 'guardian', actorUid: 'tAdv', targetType: 'student', targetId: 'S1',
      details: { from: 'Mother', to: 'Adviser', fromSlot: 'guardian', toSlot: 'adviser', schoolYear: SY },
    })]);

    // Both real parents can now use the slip.
    await redeem(gmail('gA'), code, 'Mother');
    await redeem(gmail('gB'), code, 'Father');
    expect(await slip(code)).toMatchObject({ guardianRedemptions: 2, adviserRedemptions: 1, status: 'exhausted' });
  });

  it('moves a DepEd teacher who picked Adviser into a guardian relationship', async () => {
    const code = await issueSlip();
    await redeem(deped('tMom'), code, 'Adviser');
    await expect(change(deped('tMom'), 'Father')).resolves.toEqual({ relationship: 'Father', slot: 'guardian' });
    expect(await link('tMom_S1')).toMatchObject({ relationship: 'Father', slot: 'guardian', previousRelationship: 'Adviser' });
    expect(await slip(code)).toMatchObject({ guardianRedemptions: 1, adviserRedemptions: 0, status: 'issued' });
  });

  it('refuses accounts that are not DepEd before reading or writing anything', async () => {
    await seedLink('gX');
    await expect(change(gmail('gX'), 'Adviser')).rejects.toMatchObject({ code: 'permission-denied', message: 'Only DepEd (@deped.gov.ph) accounts can change their relationship.' });
    await expect(change(account('gX', 'gX@deped.gov.ph.example.com'), 'Adviser')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await link('gX_S1')).toMatchObject({ relationship: 'Mother', slot: 'guardian' });
    expect((await db().doc('rate_limits/gX').get()).exists).toBe(false);
  });

  it('refuses a same-side, unchanged or unknown relationship', async () => {
    await seedLink('tAdv');
    await expect(change(deped(), 'Father')).rejects.toMatchObject({ code: 'invalid-argument', message: 'Choose Adviser, or the relationship you have to the learner.' });
    await expect(change(deped(), 'Mother')).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(change(deped(), 'Teacher')).rejects.toMatchObject({ code: 'invalid-argument' });
    const l = await link('tAdv_S1');
    expect(l).toMatchObject({ relationship: 'Mother', slot: 'guardian' });
    expect(l.relationshipChangedFor).toBeUndefined();
  });

  it('allows only one change per link per school year', async () => {
    await seedLink('tAdv');
    await change(deped(), 'Adviser');
    await expect(change(deped(), 'Mother')).rejects.toMatchObject({
      code: 'failed-precondition', message: 'You already changed your relationship for SY 2026-2027. Ask the registrar if it needs fixing again.',
    });
    expect(await link('tAdv_S1')).toMatchObject({ relationship: 'Adviser', slot: 'adviser' });
  });

  it('gives a link re-activated with next year\'s slip one more change', async () => {
    // activateCode merges into the old link, so last year's fields stay.
    await seedLink('tAdv', { relationship: 'Adviser', slot: 'adviser', previousRelationship: 'Mother', relationshipChangedFor: '2025-2026' });
    await expect(change(deped(), 'Mother')).resolves.toEqual({ relationship: 'Mother', slot: 'guardian' });
    expect(await link('tAdv_S1')).toMatchObject({ previousRelationship: 'Adviser', relationshipChangedFor: SY });
  });

  it('refuses when the learner already has an adviser', async () => {
    await seedLink('tAdv');
    await seedLink('tReal', { relationship: 'Adviser', slot: 'adviser' });
    await expect(change(deped(), 'Adviser')).rejects.toMatchObject({
      code: 'failed-precondition', message: 'This learner already has an adviser linked. Ask the registrar to remove that link first.',
    });
    expect(await link('tAdv_S1')).toMatchObject({ relationship: 'Mother', slot: 'guardian' });
  });

  it('refuses Adviser → guardian when both guardian slots are taken', async () => {
    await seedLink('tAdv', { relationship: 'Adviser', slot: 'adviser' });
    await seedLink('gA');
    await seedLink('gB', { relationship: 'Father' });
    await expect(change(deped(), 'Mother')).rejects.toMatchObject({
      code: 'failed-precondition', message: 'This learner already has 2 linked guardians. Ask the registrar to remove one first.',
    });
    expect(await link('tAdv_S1')).toMatchObject({ relationship: 'Adviser', slot: 'adviser' });
  });

  it('ignores revoked, expired and other-year links when counting', async () => {
    await seedLink('tAdv', { relationship: 'Adviser', slot: 'adviser' });
    await seedLink('gA');
    await seedLink('gOld', { status: 'revoked' });
    await seedLink('gExp', { status: 'expired' });
    await seedLink('gPrev', { schoolYear: '2025-2026' });
    await expect(change(deped(), 'Mother')).resolves.toEqual({ relationship: 'Mother', slot: 'guardian' });
  });

  it('refuses a missing, revoked or expired link, or one whose school year has ended', async () => {
    const ended = { code: 'failed-precondition', message: 'This link is no longer active.' };
    await expect(change(deped(), 'Adviser')).rejects.toMatchObject(ended);
    await seedLink('tAdv', { status: 'revoked' });
    await expect(change(deped(), 'Adviser')).rejects.toMatchObject(ended);
    await seedLink('tAdv', { status: 'expired' });
    await expect(change(deped(), 'Adviser')).rejects.toMatchObject(ended);
    await seedLink('tAdv');
    await db().doc(`school_years/${SY}`).set({ endedAt: NOW });
    await expect(change(deped(), 'Adviser')).rejects.toMatchObject(ended);
    expect(await link('tAdv_S1')).toMatchObject({ relationship: 'Mother', slot: 'guardian' });
  });

  it('rate-limits repeated calls', async () => {
    for (let i = 0; i < LIMITS.relationshipChange.max; i++) await change(deped(), 'Adviser').catch(() => {});
    await expect(change(deped(), 'Adviser')).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run (repo root, needs the Firebase CLI and Java for the emulator; the script wraps the suite in `firebase emulators:exec`, so it always runs every emulator test file):
```bash
npm run test:functions
```
Expected: FAIL. `changeLinkRelationship` is not exported from `links.js`, so every test errors with "changeLinkRelationship is not a function", and `LIMITS.relationshipChange` is undefined.

- [ ] **Step 3: Add the rate limit**

In `functions/src/callable.js`, add to `LIMITS` after `reissueCode`:

```js
  // A DepEd account fixing its own Adviser/guardian mix-up. The once-per-year
  // lock is the real limit; this only stops scripted calls.
  relationshipChange: { windowMs: 60 * 60 * 1000, max: 10 },
```

- [ ] **Step 4: Implement the handler**

In `functions/src/handlers/links.js`, replace the import lines for `callable.js`, `codeSlots.js` and add `schoolYears.js`:

```js
import { MAX_OPEN_REQUESTS, LIMITS, enforceRateLimit } from '../callable.js';
```
```js
import { ADVISER, isDepedEmail, isOpenStatus, slotFor, slotsFromLinks } from '../lib/codeSlots.js';
import { schoolYearRef, isEnded } from '../lib/schoolYears.js';
```

Then add after `resolveAccessRequest`:

```js
const DEPED_ONLY = 'Only DepEd (@deped.gov.ph) accounts can change their relationship.';
const LINK_ENDED = 'This link is no longer active.';
const OTHER_SIDE = 'Choose Adviser, or the relationship you have to the learner.';

// A DepEd account fixes an Adviser/guardian mix-up on its own link, once per
// link per school year (spec 2026-10-17). The learner's open slips are
// recounted from the active links, so the slot the caller left is free again.
export async function changeLinkRelationship(ctx, data) {
  const { db, now, uid, email } = ctx;
  // Checked before anything is read, like activateCode's adviser check.
  if (!isDepedEmail(email)) throw new CallableError('permission-denied', DEPED_ONLY);
  const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
  const relationship = oneOf(data.relationship, [...RELATIONSHIPS, ADVISER], 'relationship');
  const toSlot = slotFor(relationship);
  await enforceRateLimit(db, uid, 'relationshipChange', LIMITS.relationshipChange, now().getTime());

  const refuse = (reason, code, message) => { logWarn('relationship_change_failed', { uid, studentId, reason }); return new CallableError(code, message); };
  const linkRef = db.doc(`guardian_links/${uid}_${studentId}`);
  const activeLinksQuery = db.collection('guardian_links').where('studentId', '==', studentId).where('status', '==', 'active');
  const { from, fromSlot, schoolYear } = await db.runTransaction(async (tx) => {
    const l = (await tx.get(linkRef)).data();
    if (!l || l.guardianUid !== uid || l.status !== 'active') throw refuse('inactive', 'failed-precondition', LINK_ENDED);
    const yearRef = schoolYearRef(db, l.schoolYear);
    const codesQuery = db.collection('activation_codes').where('studentId', '==', studentId).where('schoolYear', '==', l.schoolYear);
    const [year, activeLinks, codes] = await Promise.all([yearRef && tx.get(yearRef), tx.get(activeLinksQuery), tx.get(codesQuery)]);
    if (isEnded(year)) throw refuse('year-ended', 'failed-precondition', LINK_ENDED);
    if (l.relationshipChangedFor === l.schoolYear) {
      throw refuse('already-changed', 'failed-precondition', `You already changed your relationship for SY ${l.schoolYear}. Ask the registrar if it needs fixing again.`);
    }
    const current = l.slot ?? 'guardian';
    if (toSlot === current) throw refuse('same-side', 'invalid-argument', OTHER_SIDE);
    // Same cap as activateCode and resolveAccessRequest (spec 2026-10-13):
    // the caller's own link is not counted against them.
    const others = activeLinks.docs.filter((d) => d.id !== linkRef.id).map((d) => d.data());
    const used = slotsFromLinks(others, l.schoolYear);
    if (toSlot === 'adviser' && used.adviserRedemptions >= used.maxAdvisers) {
      throw refuse('cap', 'failed-precondition', 'This learner already has an adviser linked. Ask the registrar to remove that link first.');
    }
    if (toSlot === 'guardian' && used.guardianRedemptions >= used.maxGuardians) {
      throw refuse('cap', 'failed-precondition', `This learner already has ${used.maxGuardians} linked guardians. Ask the registrar to remove one first.`);
    }
    tx.update(linkRef, {
      relationship, slot: toSlot, previousRelationship: l.relationship ?? null,
      relationshipChangedFor: l.schoolYear, relationshipChangedAt: FieldValue.serverTimestamp(),
    });
    // The slips' counters follow the links: the caller's link now holds toSlot.
    const after = slotsFromLinks([...others, { status: 'active', schoolYear: l.schoolYear, slot: toSlot }], l.schoolYear);
    for (const c of codes.docs) {
      if (isOpenStatus(c.data().status)) tx.update(c.ref, { ...after, redemptions: FieldValue.delete(), maxRedemptions: FieldValue.delete() });
    }
    return { from: l.relationship ?? null, fromSlot: current, schoolYear: l.schoolYear };
  });
  await audit(db, { action: 'link.relationshipChanged', actorType: 'guardian', actorUid: uid, targetType: 'student', targetId: studentId, details: { from, to: relationship, fromSlot, toSlot, schoolYear } });
  logEvent('relationship_changed', { uid, studentId });
  return { relationship, slot: toSlot };
}
```

- [ ] **Step 5: Export the callable**

In `functions/index.js`, change the `links.js` import to:

```js
import { requestAccess, resolveAccessRequest, revokeLink, setActivationRestricted, changeLinkRelationship } from './src/handlers/links.js';
```

and add after `export const revokeLinkFn = adminCall(revokeLink);`:

```js
export const changeLinkRelationshipFn = guardianCall(changeLinkRelationship);
```

(`guardianCall` already requires App Check, a non-anonymous account and `email_verified`, so the handler does not check verification again.)

- [ ] **Step 6: Run the tests to make sure they pass**

Run: `npm run test:functions`
Expected: all of `relationshipChange.test.js` passes, plus the existing `codes.test.js` / `links.test.js` suites (nothing they cover has changed).

- [ ] **Step 7: Add the rules regression case**

In `tests/rules/parent.test.js`, inside `it('guardian lists own links only; never writes', …)`, after the line `await denied(as(env, GUARDIAN_A).doc('guardian_links/gA_S2').set(…));`, add:

```js
    // Relationship changes go through changeLinkRelationshipFn only (spec 2026-10-17).
    await denied(as(env, GUARDIAN_A).doc('guardian_links/gA_S1').update({ relationship: 'Adviser', slot: 'adviser' }));
```

Run: `npm run test:rules`
Expected: PASS (the rules already deny all client writes).

- [ ] **Step 8: Commit**

```bash
git add functions/src/handlers/links.js functions/src/callable.js functions/index.js functions/test/emulator/relationshipChange.test.js tests/rules/parent.test.js
git commit -m "Let DepEd accounts switch their link between guardian and Adviser

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Parent shared relationship helpers and strings

**Files:**
- Create: `parent/src/lib/relationships.js`
- Create: `parent/src/lib/relationships.test.js`
- Modify: `parent/src/strings.js` (after `activateAdviserDeped`, line 64)
- Modify: `parent/src/lib/strings.test.js` (new `it` block)
- Modify: `parent/src/screens/Activate.jsx:9-10` (use the shared lists)

**Interfaces:**
- Produces (`parent/src/lib/relationships.js`):
  - `RELATIONSHIPS: string[]`, `ADVISER: 'Adviser'`
  - `isDepedEmail(email: unknown) → boolean`
  - `relationshipOptions(slot: 'guardian' | 'adviser' | undefined) → string[]`: the choices on the other side
  - `changeErrorMessage(error: { code?: string, message?: string }) → string`
- Produces strings: `S.relLinkedAs`, `S.relChange`, `S.relChangedFrom`, `S.relSheetTitle`, `S.relOnceNote`, `S.relConfirm`, `S.relChangeFailed`.

- [ ] **Step 1: Write the failing unit tests**

Create `parent/src/lib/relationships.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { RELATIONSHIPS, ADVISER, isDepedEmail, relationshipOptions, changeErrorMessage } from './relationships.js';
import S from '../strings.js';

describe('relationships', () => {
  it('lists the guardian relationships the server accepts', () => {
    expect(RELATIONSHIPS).toEqual(['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other']);
    expect(ADVISER).toBe('Adviser');
  });
  it('recognises DepEd emails only', () => {
    expect(isDepedEmail('juan.cruz@deped.gov.ph')).toBe(true);
    expect(isDepedEmail('  Juan.Cruz@DepEd.Gov.PH ')).toBe(true);
    expect(isDepedEmail('juan@gmail.com')).toBe(false);
    expect(isDepedEmail('juan@deped.gov.ph.example.com')).toBe(false);
    expect(isDepedEmail('juan@notdeped.gov.ph')).toBe(false);
    expect(isDepedEmail(undefined)).toBe(false);
  });
  it('offers only the other side of the guardian/Adviser line', () => {
    expect(relationshipOptions('guardian')).toEqual([ADVISER]);
    expect(relationshipOptions(undefined)).toEqual([ADVISER]); // links made before slots existed
    expect(relationshipOptions('adviser')).toEqual(RELATIONSHIPS);
  });
  it('shows the server message for refusals a parent can act on, else the generic one', () => {
    expect(changeErrorMessage({ code: 'functions/failed-precondition', message: 'This learner already has an adviser linked.' })).toBe('This learner already has an adviser linked.');
    expect(changeErrorMessage({ code: 'functions/permission-denied', message: 'Only DepEd' })).toBe('Only DepEd');
    expect(changeErrorMessage({ code: 'functions/invalid-argument', message: 'Choose Adviser' })).toBe('Choose Adviser');
    expect(changeErrorMessage({ code: 'functions/resource-exhausted', message: 'Too many attempts. Try again later.' })).toBe('Too many attempts. Try again later.');
    expect(changeErrorMessage({ code: 'functions/internal', message: 'Something went wrong.' })).toBe(S.relChangeFailed);
    expect(changeErrorMessage(new Error('offline'))).toBe(S.relChangeFailed);
  });
});
```

Add to `parent/src/lib/strings.test.js`, after the `'has the scan and adviser strings'` block:

```js
  it('has the relationship change strings', () => {
    for (const k of ['relLinkedAs', 'relChange', 'relChangedFrom', 'relSheetTitle', 'relOnceNote', 'relConfirm', 'relChangeFailed'])
      expect(typeof S[k], k).toBe('string');
  });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npm --prefix parent test -- src/lib/relationships.test.js src/lib/strings.test.js`
Expected: FAIL. `./relationships.js` cannot be resolved, and the strings test reports `relLinkedAs` as `undefined`.

- [ ] **Step 3: Add the strings**

In `parent/src/strings.js`, after `activateAdviserDeped: …,` add:

```js
  // Relationship change on the learner screen, DepEd accounts only (spec 2026-10-17).
  relLinkedAs: 'Linked as',
  relChange: 'Change',
  relChangedFrom: 'changed from',
  relSheetTitle: 'Change your relationship',
  relOnceNote: 'You can change this once per school year. After that, ask the registrar.',
  relConfirm: 'Change relationship',
  relChangeFailed: 'Could not change your relationship right now. Please try again in a moment.',
```

- [ ] **Step 4: Create the helper module**

Create `parent/src/lib/relationships.js`:

```js
import S from '../strings.js';

// Relationships offered when linking a learner. Must match RELATIONSHIPS and
// ADVISER in functions/src/handlers/codes.js and functions/src/lib/codeSlots.js.
export const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
export const ADVISER = 'Adviser';

const DEPED_DOMAIN = '@deped.gov.ph';
// Display only: the server checks the verified token itself.
export const isDepedEmail = (email) => typeof email === 'string' && email.trim().toLowerCase().endsWith(DEPED_DOMAIN);

// A DepEd account may only cross the guardian/Adviser line (spec 2026-10-17):
// a guardian link can become Adviser, an Adviser link a guardian one. Links
// without a slot predate the adviser slot and are guardian links.
export const relationshipOptions = (slot) => (slot === 'adviser' ? RELATIONSHIPS : [ADVISER]);

// changeLinkRelationshipFn's refusals are written for the parent; anything
// else (network, internal) gets the generic message.
const SHOWN = ['permission-denied', 'invalid-argument', 'failed-precondition', 'resource-exhausted'];
export function changeErrorMessage(e) {
  const code = String(e?.code || '');
  return SHOWN.some((c) => code.endsWith(c)) && e?.message ? e.message : S.relChangeFailed;
}
```

- [ ] **Step 5: Point Activate at the shared lists**

In `parent/src/screens/Activate.jsx`, delete these two lines:

```js
const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
const ADVISER = 'Adviser';
```

and add to the imports:

```js
import { RELATIONSHIPS, ADVISER } from '../lib/relationships.js';
```

- [ ] **Step 6: Run the tests to make sure they pass**

Run: `npm --prefix parent test`
Expected: PASS, including the existing strings checks (no empty strings, no forbidden words).

- [ ] **Step 7: Commit**

```bash
git add parent/src/lib/relationships.js parent/src/lib/relationships.test.js parent/src/strings.js parent/src/lib/strings.test.js parent/src/screens/Activate.jsx
git commit -m "Share relationship lists in the Parent app and add change strings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Parent app row, sheet and History wiring

**Files:**
- Create: `parent/src/components/RelationshipRow.jsx`
- Create: `parent/src/components/RelationshipSheet.jsx`
- Modify: `parent/src/screens/History.jsx` (imports, component signature line 26, render after `PageHeader`)
- Create: `parent/tests/browser/relationship.config.mjs`, `parent/tests/browser/relationship-preview.html`, `parent/tests/browser/relationship-preview.jsx`

**Interfaces:**
- Consumes: `relationshipOptions`, `changeErrorMessage`, `isDepedEmail`, `ADVISER` (Task 2); `S.rel*`, `S.activateAdviserOption`, `S.cancel`; the link fields from Task 1; the callable `changeLinkRelationshipFn({ studentId, relationship })`.
- Produces: `<RelationshipRow link onChange />` (renders nothing unless `link.status === 'active'`) and default export `<RelationshipSheet link onSave onClose />`, where `onSave(relationship) → Promise` rejects with a Firebase callable error.

This task is UI, so it is checked with the synthetic browser preview rather than vitest (the Parent vitest runs in `node` with `*.test.js` only).

- [ ] **Step 1: Create the row**

Create `parent/src/components/RelationshipRow.jsx`:

```jsx
import S from '../strings.js';
import { T } from '../styles.js';

// Under the learner's header, for DepEd accounts only (spec 2026-10-17 §2).
// Hidden unless the link is active; the screen's own banner covers ended access.
export default function RelationshipRow({ link, onChange }) {
  if (!link || link.status !== 'active') return null;
  const changed = link.relationshipChangedFor === link.schoolYear;
  return (
    <p className="relationship-row" style={{ margin: '0 0 12px', fontSize: 14, color: T.inkMuted, textAlign: 'center' }}>
      {S.relLinkedAs} <strong style={{ color: T.ink }}>{link.relationship}</strong>
      {changed
        ? (link.previousRelationship ? ` · ${S.relChangedFrom} ${link.previousRelationship}` : null)
        : <> · <button type="button" onClick={onChange}
            style={{ background: 'none', border: 0, padding: '12px 6px', margin: '-12px 0', font: 'inherit', fontWeight: 600, color: T.primary, cursor: 'pointer' }}>{S.relChange}</button></>}
    </p>
  );
}
```

- [ ] **Step 2: Create the sheet**

Create `parent/src/components/RelationshipSheet.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn, Banner } from './ui.jsx';
import { ADVISER, relationshipOptions, changeErrorMessage } from '../lib/relationships.js';

// Lazy-loaded from History (keeps the eager bundle small). Portalled to
// <body> so no .glass-card backdrop-filter traps the fixed overlay (see ScanSheet).
export default function RelationshipSheet({ link, onSave, onClose }) {
  const [choice, setChoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const options = relationshipOptions(link.slot);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const save = async () => {
    if (!choice || busy) return;
    setBusy(true); setErr(null);
    try { await onSave(choice); onClose(); } catch (e) { setErr(changeErrorMessage(e)); setBusy(false); }
  };

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', display: 'grid', alignItems: 'end', justifyItems: 'center' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="rel-sheet-title"
        style={{ width: 'min(100%, 480px)', boxSizing: 'border-box', background: T.surface, color: T.ink, fontFamily: T.font, borderRadius: `${T.radius}px ${T.radius}px 0 0`, padding: 16 }}>
        <h2 id="rel-sheet-title" style={{ fontSize: 18, margin: '0 0 12px' }}>{S.relSheetTitle}</h2>
        {err && <Banner tone="danger">{err}</Banner>}
        <div role="radiogroup" aria-labelledby="rel-sheet-title" style={{ display: 'grid', gap: 2 }}>
          {options.map((r) => (
            <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: T.tap, fontSize: 16, cursor: 'pointer' }}>
              <input type="radio" name="relationship" value={r} checked={choice === r} disabled={busy} onChange={() => setChoice(r)} />
              {r === ADVISER ? S.activateAdviserOption : r}
            </label>
          ))}
        </div>
        <p style={{ fontSize: 13, color: T.inkMuted, margin: '12px 0' }}>{S.relOnceNote}</p>
        <div style={{ display: 'grid', gap: 10 }}>
          <Btn onClick={save} disabled={!choice || busy}>{S.relConfirm}</Btn>
          <Btn variant="ghost" onClick={onClose} disabled={busy}>{S.cancel}</Btn>
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 3: Wire it into History**

In `parent/src/screens/History.jsx`:

Change the firebase import to:
```js
import { db, callable } from '../firebase.js';
```
Add imports:
```js
import RelationshipRow from '../components/RelationshipRow.jsx';
import { isDepedEmail } from '../lib/relationships.js';
```
Change the component signature and add state right after the existing `useDoc('learners/…')` line:

```jsx
export default function History({ user, studentId, navigate, route }) {
  const { data: learner, error } = useDoc(`learners/${studentId}`);
  // Only DepEd accounts can change their relationship, so only they read
  // their own link here; everyone else's screen is unchanged (spec 2026-10-17).
  const deped = isDepedEmail(user?.email);
  const { data: link } = useDoc(deped && user ? `guardian_links/${user.uid}_${studentId}` : null);
  const [Sheet, setSheet] = useState(null);
  const [sheetErr, setSheetErr] = useState(null);
  const openSheet = () => {
    setSheetErr(null);
    import('../components/RelationshipSheet.jsx').then((m) => setSheet(() => m.default)).catch(() => setSheetErr(S.relChangeFailed));
  };
  const saveRelationship = (relationship) => callable('changeLinkRelationshipFn')({ studentId, relationship });
```

(Leave the existing `const [rows, setRows] …` line and everything after it unchanged.)

In the returned JSX, directly after the `<PageHeader … />` element, add:

```jsx
      {deped && learner && <RelationshipRow link={link} onChange={openSheet} />}
      {sheetErr && <Banner tone="danger">{sheetErr}</Banner>}
      {Sheet && link && <Sheet link={link} onSave={saveRelationship} onClose={() => setSheet(null)} />}
```

`useDoc` keeps listening, so after a successful save the row re-renders from the updated link with "changed from …" and no button. `App.jsx` already passes `user` in the screen props (`const props = { user, profile, route, navigate }`).

- [ ] **Step 4: Build the browser preview**

Create `parent/tests/browser/relationship.config.mjs`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renders RelationshipRow and RelationshipSheet with synthetic links. Neither
// component imports Firebase, so nothing needs stubbing.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5192, strictPort: true },
  cacheDir: 'node_modules/.vite-relationship-preview',
});
```

Create `parent/tests/browser/relationship-preview.html`:

```html
<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Relationship change preview</title></head><body><div id="root"></div><script type="module" src="/tests/browser/relationship-preview.jsx"></script></body></html>
```

Create `parent/tests/browser/relationship-preview.jsx`:

```jsx
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../shared/theme/theme.css';
import '../../src/glass.css';
import RelationshipRow from '../../src/components/RelationshipRow.jsx';
import RelationshipSheet from '../../src/components/RelationshipSheet.jsx';
import { ADVISER, isDepedEmail } from '../../src/lib/relationships.js';

const SY = '2026-2027';
const guardianLink = { status: 'active', schoolYear: SY, relationship: 'Mother', slot: 'guardian' };
const adviserLink = { status: 'active', schoolYear: SY, relationship: 'Adviser', slot: 'adviser' };
const CASES = [
  { id: 'adviser-picked-mother', title: 'DepEd adviser who picked Mother', email: 'teacher@deped.gov.ph', link: guardianLink },
  { id: 'teacher-picked-adviser', title: 'DepEd teacher who picked Adviser', email: 'parent@deped.gov.ph', link: adviserLink },
  { id: 'already-changed', title: 'Already changed this school year', email: 'teacher@deped.gov.ph', link: { ...adviserLink, previousRelationship: 'Mother', relationshipChangedFor: SY } },
  { id: 'gmail', title: 'Gmail parent: no row', email: 'ana@gmail.com', link: guardianLink },
  { id: 'adviser-full', title: 'Server refuses: adviser slot full', email: 'teacher@deped.gov.ph', link: guardianLink,
    refuse: { code: 'functions/failed-precondition', message: 'This learner already has an adviser linked. Ask the registrar to remove that link first.' } },
];

function Case({ c }) {
  const [link, setLink] = useState(c.link);
  const [open, setOpen] = useState(false);
  const save = async (relationship) => {
    await new Promise((r) => setTimeout(r, 300));
    if (c.refuse) throw c.refuse;
    setLink({ ...link, relationship, slot: relationship === ADVISER ? 'adviser' : 'guardian', previousRelationship: link.relationship, relationshipChangedFor: link.schoolYear });
  };
  return (
    <section data-case={c.id} style={{ padding: 16, borderBottom: '1px solid var(--t-border)' }}>
      <h2 style={{ fontSize: 13, margin: '0 0 8px' }}>{c.title}</h2>
      {isDepedEmail(c.email) && <RelationshipRow link={link} onChange={() => setOpen(true)} />}
      {open && <RelationshipSheet link={link} onSave={save} onClose={() => setOpen(false)} />}
    </section>
  );
}

createRoot(document.getElementById('root')).render(<main style={{ maxWidth: 480, margin: '0 auto' }}>
  <aside style={{ padding: 12, textAlign: 'center', fontSize: 12 }}>Synthetic links · no Firebase access · reload to start over</aside>
  {CASES.map((c) => <Case key={c.id} c={c} />)}
</main>);
```

- [ ] **Step 5: Check the preview in a browser**

Run (from `parent/`), in the background, and stop only this process when done:
```bash
npx vite --config tests/browser/relationship.config.mjs
```
Open `http://127.0.0.1:5192/tests/browser/relationship-preview.html` at phone width (375 px) in light and dark. Check:
- `adviser-picked-mother`: shows "Linked as **Mother** · Change". Change opens the sheet with only "Adviser (class adviser)". The button stays disabled until it's picked. After saving, the row reads "Linked as **Adviser** · changed from Mother" with no button.
- `teacher-picked-adviser`: the sheet lists Mother, Father, Guardian, Grandparent, Sibling, Other, and no Adviser.
- `already-changed`: "Linked as **Adviser** · changed from Mother", with no button.
- `gmail`: the section has no `.relationship-row`.
- `adviser-full`: saving shows the server message in a red banner, the sheet stays open, and Cancel closes it.
- Escape and tapping the dimmed backdrop close the sheet. Nothing scrolls sideways at 375 px.

- [ ] **Step 6: Build and check the bundle budget**

Run:
```bash
npm --prefix parent run build
npm --prefix parent run size
```
Expected: the build succeeds, and `size` reports the eager entry under budget. `RelationshipSheet` must be its own chunk; it is not in the eager chunk because it's a dynamic import. Also run `npm --prefix parent test` (still PASS).

- [ ] **Step 7: Commit**

```bash
git add parent/src/components/RelationshipRow.jsx parent/src/components/RelationshipSheet.jsx parent/src/screens/History.jsx parent/tests/browser/relationship.config.mjs parent/tests/browser/relationship-preview.html parent/tests/browser/relationship-preview.jsx
git commit -m "Show DepEd accounts a Change relationship row on the learner screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: SIMS "changed from" note on the Learner access tab

**Files:**
- Create: `src/pages/guardians/linkRelationship.js`
- Create: `src/pages/guardians/linkRelationship.test.js`
- Modify: `src/pages/guardians/LinksTab.jsx` (import; `GuardianCell` neighbour; Relationship `<td>` at line 142)

**Interfaces:**
- Consumes: the link fields from Task 1; `when` from `./RequestsTab.jsx`.
- Produces: `relationshipChangeNote(link) → string | null`

- [ ] **Step 1: Write the failing test**

Create `src/pages/guardians/linkRelationship.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { relationshipChangeNote } from './linkRelationship.js';

describe('relationshipChangeNote', () => {
  it('names the old relationship for a change made this school year', () => {
    expect(relationshipChangeNote({ schoolYear: '2026-2027', relationship: 'Adviser', previousRelationship: 'Mother', relationshipChangedFor: '2026-2027' })).toBe('changed from Mother');
  });
  it('is empty for links never changed, or changed in an earlier school year', () => {
    expect(relationshipChangeNote({ schoolYear: '2026-2027', relationship: 'Mother' })).toBeNull();
    expect(relationshipChangeNote({ schoolYear: '2026-2027', relationship: 'Adviser', previousRelationship: 'Mother', relationshipChangedFor: '2025-2026' })).toBeNull();
    expect(relationshipChangeNote({ schoolYear: '2026-2027', relationship: 'Adviser', previousRelationship: null, relationshipChangedFor: '2026-2027' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/pages/guardians/linkRelationship.test.js`
Expected: FAIL, because `./linkRelationship.js` cannot be resolved.

- [ ] **Step 3: Implement the helper**

Create `src/pages/guardians/linkRelationship.js`:

```js
// The "changed from Mother" note for a link a DepEd account corrected itself
// (spec 2026-10-17 §3). Only for the link's own school year: a link
// re-activated with next year's slip keeps last year's fields.
export function relationshipChangeNote(link) {
  if (!link?.previousRelationship || link.relationshipChangedFor !== link.schoolYear) return null;
  return `changed from ${link.previousRelationship}`;
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run src/pages/guardians/linkRelationship.test.js`
Expected: PASS

- [ ] **Step 5: Use it in the Links tab**

In `src/pages/guardians/LinksTab.jsx`, add the import:

```js
import { relationshipChangeNote } from './linkRelationship.js';
```

Add below `GuardianCell`:

```jsx
// Shows when a DepEd account switched its own link between guardian and Adviser.
function RelationshipCell({ link }) {
  const note = relationshipChangeNote(link);
  return (
    <td style={S.td}>
      {link.relationship}
      {note && <><br /><span style={{ fontSize: 11, color: T.inkMuted }}>{note} · {when(link.relationshipChangedAt)}</span></>}
    </td>
  );
}
```

and in the links table row, replace `<td style={S.td}>{l.relationship}</td>` with `<RelationshipCell link={l} />`.

- [ ] **Step 6: Run the SIMS tests and build**

Run:
```bash
npm test
npm run build
```
Expected: PASS, and the build succeeds. Do not deploy the SIMS build (SIMS is released from its release tree).

- [ ] **Step 7: Commit**

```bash
git add src/pages/guardians/linkRelationship.js src/pages/guardians/linkRelationship.test.js src/pages/guardians/LinksTab.jsx
git commit -m "Show when a DepEd account changed its relationship on Learner access

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Docs

**Files:**
- Modify: `docs/parent-portal-adviser-guide.md` (append to item 6)
- Modify: `docs/guardian-account-guide.md` (after step 5, "Link your learner")
- Modify: `docs/parent-portal-runbook.md` (the "Parent lost the slip / new guardian / custody change" section, after the DepEd-parent bullet)

- [ ] **Step 1: Adviser guide**

In `docs/parent-portal-adviser-guide.md`, add after item 6:

```markdown
7. **Picked the wrong relationship?** If you chose Mother (or another
   parent relationship) instead of **Adviser**, open the learner in the
   app and tap **Change** next to "Linked as …". Pick **Adviser (class
   adviser)** and confirm. This works only with your **@deped.gov.ph**
   account, and only once per learner per school year. A DepEd teacher who
   is really the learner's parent and chose Adviser can switch the other
   way the same way. If it says the learner already has an adviser, or that
   you already changed it, ask the registrar.
```

- [ ] **Step 2: Guardian guide**

In `docs/guardian-account-guide.md`, add after step 5 ("Link your learner"):

```markdown
   Signed in with a **@deped.gov.ph** account and picked the wrong one
   (for example Mother instead of Adviser)? Open the learner and tap
   **Change** next to "Linked as …". You can do this once per school year.
```

- [ ] **Step 3: Runbook**

In `docs/parent-portal-runbook.md`, after the bullet that starts "A parent who works for DepEd could link with a slip as the adviser.", add:

```markdown
- A DepEd account can switch its own link between a parent relationship and
  Adviser **once per school year** from the learner's screen in the app.
  The Learner access tab then shows "changed from …" under the relationship,
  and the audit log records `link.relationshipChanged`. The learner's open
  slip is recounted, so the slot they left is free again. If they need a
  second change, **Revoke** their link and have them redeem the slip again
  with the right relationship.
```

- [ ] **Step 4: Commit**

```bash
git add docs/parent-portal-adviser-guide.md docs/guardian-account-guide.md docs/parent-portal-runbook.md
git commit -m "Document the DepEd relationship change for advisers and staff

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification

- [ ] **Step 1: Run every suite**

Run: `npm run test:all`
Expected: SIMS unit, functions unit, Parent unit, rules and functions emulator suites all PASS. If the emulator suites can't start on this machine, report that with the output instead of skipping silently.

- [ ] **Step 2: Confirm nothing unintended changed**

Run: `git diff master --stat`
Expected: only the files in the File map above, plus the spec and this plan. In particular, `firestore.rules` and `firestore.indexes.json` are unchanged.
