# Parent QR Scan, Adviser Slot & School-Year Slips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parents can scan the activation slip's QR inside the parent app; each slip allows 2 guardians + 1 DepEd-account adviser; slips stay valid until staff press "End school year".

**Architecture:** Slot accounting moves into a pure helper (`functions/src/lib/codeSlots.js`) used by `activateCode`. Time-based and rollover-based expiry is removed from `activateCode` and the nightly `expireLinks`; a new staff callable `endSchoolYear` (own handler file) revokes a year's codes and expires its links in batches. The parent app gets a pure `qrScan.js` (code extraction + detector selection, native `BarcodeDetector` or lazy `jsqr`) and a lazy `ScanSheet` camera overlay used by `Activate.jsx`. SIMS gets an `EndSchoolYearCard` on the Activation slips tab.

**Tech Stack:** Firebase Functions v2 (Node 20, firebase-admin), Firestore, React 19 + Vite 8, Vitest 4, `jsqr` (new, parent app only).

**Spec:** `docs/superpowers/specs/2026-09-30-parent-qr-scan-adviser-slot-design.md`

## Global Constraints

- Parent app initial-load bundle stays ≤ 260 KB gz (`npm --prefix parent run build && npm --prefix parent run size`). Scanner code and `jsqr` load only via dynamic `import()`.
- Parent strings (`parent/src/strings.js`) must never contain `location`, `tracking`, or `live` as substrings (enforced by `parent/src/lib/strings.test.js`) — note "delivered" contains "live"; don't use it.
- Guardian slots: 2. Adviser slots: 1. Adviser relationship value: exactly `'Adviser'`. Adviser email domain: `@deped.gov.ph` (case-insensitive).
- All activation failures except the adviser-domain check return the one generic message `That code could not be used. Ask the registrar to reissue your slip.` (`failed-precondition`). The adviser-domain check returns `permission-denied` with `Sign in with your @deped.gov.ph account to link as adviser.` and runs before any code lookup.
- Advisers cannot be added through `requestAccess` / `resolveAccessRequest`.
- Raw activation codes are never stored.
- Region/options for new callables: use the existing `staffCall` wrapper in `functions/index.js`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Test commands

- Functions unit: `npm --prefix functions test`
- Functions emulator (needs Java + firebase-tools): `npm run test:functions`
- Rules (emulator): `npm run test:rules`
- Parent unit: `npm --prefix parent test`
- SIMS unit: `npm test`

If the emulator can't start on the machine, run the unit suites and state plainly in the task report that emulator tests were not run.

## File map

| File | Change | Responsibility |
|---|---|---|
| `functions/src/lib/codeSlots.js` | create | Pure slot math: read legacy/new counters, claim a slot, DepEd email check |
| `functions/src/lib/codeSlots.test.js` | create | Unit tests for the above |
| `functions/src/handlers/codes.js` | modify | Issue without expiry + new counters; `activateCode` adviser slot, no expiry, slip SY |
| `functions/test/emulator/codes.test.js` | modify | Emulator coverage for slots, adviser, no expiry |
| `functions/src/handlers/scheduled.js` | modify | `expireLinks` uses link SY; code retention by `revokedAt`/`lastRedeemedAt` |
| `functions/test/emulator/scheduled.test.js` | modify | Rollover no longer expires; new retention |
| `functions/src/handlers/schoolYear.js` | create | `endSchoolYear` callable handler |
| `functions/test/emulator/schoolYear.test.js` | create | Emulator tests for `endSchoolYear` |
| `functions/index.js` | modify | Export `endSchoolYearFn` |
| `firestore.indexes.json` | modify | 4 new composite indexes |
| `tests/rules/parent.test.js` | modify | Adviser-slot link reads learner |
| `parent/src/lib/qrScan.js` | create | `extractCode`, `normalizeCode`, `createDetector` |
| `parent/src/lib/qrScan.test.js` | create | Unit tests |
| `parent/src/components/ScanSheet.jsx` | create | Camera overlay + photo fallback |
| `parent/src/screens/Activate.jsx` | modify | Scan button, Adviser option, adviser error |
| `parent/src/strings.js` | modify | New strings |
| `parent/package.json` | modify | `jsqr` dependency |
| `src/lib/dates.js` / `src/lib/dates.test.js` | modify | `previousSchoolYear` |
| `src/data/guardians.js` | modify | `call.endSchoolYear` |
| `src/pages/guardians/EndSchoolYearCard.jsx` | create | Counts, warning banner, typed-confirm dialog |
| `src/pages/guardians/CodesTab.jsx` | modify | Render the card |
| `src/components/ActivationSlipsPrintable.jsx` | modify | New slip wording |
| `docs/parent-portal-*.md` | modify | Adviser guide, runbook, privacy notice |

---

### Task 1: Slot helper (pure)

**Files:**
- Create: `functions/src/lib/codeSlots.js`
- Test: `functions/src/lib/codeSlots.test.js`

**Interfaces:**
- Produces:
  - `MAX_GUARDIANS = 2`, `MAX_ADVISERS = 1`, `ADVISER = 'Adviser'`
  - `isDepedEmail(email: string|undefined) → boolean`
  - `slotFor(relationship: string) → 'guardian' | 'adviser'`
  - `readSlots(codeDoc) → { guardian: { used, max }, adviser: { used, max } }`
  - `claimSlot(codeDoc, slot) → null | { guardianRedemptions, maxGuardians, adviserRedemptions, maxAdvisers, status: 'issued'|'exhausted' }`
  - `newCodeSlots() → { guardianRedemptions: 0, maxGuardians: 2, adviserRedemptions: 0, maxAdvisers: 1 }`

- [ ] **Step 1: Write the failing test**

`functions/src/lib/codeSlots.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { isDepedEmail, slotFor, readSlots, claimSlot, newCodeSlots, ADVISER } from './codeSlots.js';

describe('isDepedEmail', () => {
  it('accepts @deped.gov.ph in any case, rejects others', () => {
    expect(isDepedEmail('juan.cruz@deped.gov.ph')).toBe(true);
    expect(isDepedEmail('Juan.Cruz@DepEd.Gov.PH')).toBe(true);
    expect(isDepedEmail('juan@gmail.com')).toBe(false);
    expect(isDepedEmail('juan@deped.gov.ph.evil.com')).toBe(false);
    expect(isDepedEmail('juan@notdeped.gov.ph')).toBe(false);
    expect(isDepedEmail(undefined)).toBe(false);
  });
});

describe('slotFor', () => {
  it('maps Adviser to the adviser slot and everything else to guardian', () => {
    expect(slotFor(ADVISER)).toBe('adviser');
    expect(slotFor('Mother')).toBe('guardian');
    expect(slotFor('Other')).toBe('guardian');
  });
});

describe('readSlots', () => {
  it('reads new-format counters', () => {
    expect(readSlots({ guardianRedemptions: 1, maxGuardians: 2, adviserRedemptions: 1, maxAdvisers: 1 }))
      .toEqual({ guardian: { used: 1, max: 2 }, adviser: { used: 1, max: 1 } });
  });
  it('reads a legacy code as guardian uses with a free adviser slot', () => {
    expect(readSlots({ redemptions: 2, maxRedemptions: 2 }))
      .toEqual({ guardian: { used: 2, max: 2 }, adviser: { used: 0, max: 1 } });
    expect(readSlots({})).toEqual({ guardian: { used: 0, max: 2 }, adviser: { used: 0, max: 1 } });
  });
});

describe('claimSlot', () => {
  it('increments the requested slot and stays issued while any slot is open', () => {
    expect(claimSlot(newCodeSlots(), 'guardian')).toEqual({ guardianRedemptions: 1, maxGuardians: 2, adviserRedemptions: 0, maxAdvisers: 1, status: 'issued' });
    expect(claimSlot(newCodeSlots(), 'adviser')).toEqual({ guardianRedemptions: 0, maxGuardians: 2, adviserRedemptions: 1, maxAdvisers: 1, status: 'issued' });
  });
  it('returns null when the requested slot is full, even if the other is open', () => {
    expect(claimSlot({ ...newCodeSlots(), guardianRedemptions: 2 }, 'guardian')).toBeNull();
    expect(claimSlot({ ...newCodeSlots(), adviserRedemptions: 1 }, 'adviser')).toBeNull();
  });
  it('marks exhausted only when both slots are full', () => {
    expect(claimSlot({ ...newCodeSlots(), guardianRedemptions: 2 }, 'adviser').status).toBe('exhausted');
    expect(claimSlot({ ...newCodeSlots(), guardianRedemptions: 1, adviserRedemptions: 1 }, 'guardian').status).toBe('exhausted');
  });
  it('lets a legacy exhausted code take an adviser', () => {
    expect(claimSlot({ redemptions: 2, maxRedemptions: 2, status: 'exhausted' }, 'adviser'))
      .toEqual({ guardianRedemptions: 2, maxGuardians: 2, adviserRedemptions: 1, maxAdvisers: 1, status: 'exhausted' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix functions test -- codeSlots`
Expected: FAIL — `Failed to resolve import "./codeSlots.js"`.

- [ ] **Step 3: Write minimal implementation**

`functions/src/lib/codeSlots.js`:

```js
// Slot accounting for activation codes (spec 2026-09-30 §2): two guardian
// slots and one class-adviser slot per slip. Codes issued before the adviser
// slot existed only have redemptions/maxRedemptions; those count as guardian
// uses and get a free adviser slot.
export const MAX_GUARDIANS = 2;
export const MAX_ADVISERS = 1;
export const ADVISER = 'Adviser';
const DEPED_DOMAIN = '@deped.gov.ph';

export const isDepedEmail = (email) => typeof email === 'string' && email.trim().toLowerCase().endsWith(DEPED_DOMAIN);
export const slotFor = (relationship) => (relationship === ADVISER ? 'adviser' : 'guardian');
export const newCodeSlots = () => ({ guardianRedemptions: 0, maxGuardians: MAX_GUARDIANS, adviserRedemptions: 0, maxAdvisers: MAX_ADVISERS });

export function readSlots(cd) {
  return {
    guardian: { used: cd.guardianRedemptions ?? cd.redemptions ?? 0, max: cd.maxGuardians ?? MAX_GUARDIANS },
    adviser: { used: cd.adviserRedemptions ?? 0, max: cd.maxAdvisers ?? MAX_ADVISERS },
  };
}

const full = (s) => s.used >= s.max;

// The fields to write when one more person takes `slot`, or null if it is full.
export function claimSlot(cd, slot) {
  const s = readSlots(cd);
  if (full(s[slot])) return null;
  const next = { ...s, [slot]: { ...s[slot], used: s[slot].used + 1 } };
  return {
    guardianRedemptions: next.guardian.used, maxGuardians: next.guardian.max,
    adviserRedemptions: next.adviser.used, maxAdvisers: next.adviser.max,
    status: full(next.guardian) && full(next.adviser) ? 'exhausted' : 'issued',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix functions test -- codeSlots`
Expected: PASS (all `codeSlots` tests).

- [ ] **Step 5: Commit**

```bash
git add functions/src/lib/codeSlots.js functions/src/lib/codeSlots.test.js
git commit -m "feat(functions): slot accounting for 2 guardians + 1 adviser

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Issue and activate with the adviser slot, no expiry

**Files:**
- Modify: `functions/src/handlers/codes.js` (constants at lines 11-13, `issueActivationCodes` lines 28-56, `activateCode` lines 70-133)
- Modify: `functions/test/emulator/codes.test.js`
- Modify: `tests/rules/parent.test.js`

**Interfaces:**
- Consumes: `ADVISER`, `isDepedEmail`, `slotFor`, `claimSlot`, `newCodeSlots` from Task 1.
- Produces:
  - `issueActivationCodes` slips now include `schoolYear: string` (used by Task 7's slip text).
  - `activation_codes` docs: `guardianRedemptions`, `maxGuardians`, `adviserRedemptions`, `maxAdvisers`, `status`, **no** `expiresAt`/`redemptions`/`maxRedemptions` on new docs.
  - `guardian_links` docs gain `slot: 'guardian' | 'adviser'`.
  - `activateCode` throws `CallableError('permission-denied', 'Sign in with your @deped.gov.ph account to link as adviser.')` for non-DepEd advisers (Task 6 matches on `permission-denied`).
  - `RELATIONSHIPS` export unchanged (guardian relationships only; `links.js` keeps using it).

- [ ] **Step 1: Update and add emulator tests (failing)**

In `functions/test/emulator/codes.test.js`:

1. Change the `guardian` helper so tests can pass an email:

```js
const guardian = (uid = 'gNew', email = `${uid}@gmail.com`) => ({ db: db(), now: () => NOW, uid, email, displayName: 'Maria' });
const adviser = (uid = 'tAdv') => guardian(uid, `${uid}@deped.gov.ph`);
const DAY = 86400_000;
```

2. In `'issues one code per enrolled learner, stores only hashes, skips restricted'`, replace the `codes.docs[0].data()` assertion and add slip SY:

```js
    expect(r.slips[0].schoolYear).toBe('2026-2027');
    const stored = codes.docs[0].data();
    expect(stored).toMatchObject({ studentId: 'S1', schoolYear: '2026-2027', status: 'issued', guardianRedemptions: 0, maxGuardians: 2, adviserRedemptions: 0, maxAdvisers: 1, issuedBy: 'registrar@bnhs.edu' });
    expect(stored.expiresAt).toBeUndefined();
    expect(stored.redemptions).toBeUndefined();
```

3. In `'links the guardian, creates the profile with consent, counts the redemption, audits'`, change
`.data().redemptions).toBe(1)` → `.data().guardianRedemptions).toBe(1)` and add to the link assertion `slot: 'guardian'`.

4. Replace the test `'second guardian redeems; third is exhausted'` with:

```js
  it('two guardians fill the guardian slots; a third guardian is refused but the adviser still links', async () => {
    const code = await issue();
    await activateCode(guardian('g1'), { code, relationship: 'Mother', consentVersion: 1 });
    await activateCode(guardian('g2'), { code, relationship: 'Father', consentVersion: 1 });
    expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data().status).toBe('issued');
    await expect(activateCode(guardian('g3'), { code, relationship: 'Guardian', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await activateCode(adviser(), { code, relationship: 'Adviser', consentVersion: 1 });
    expect((await db().doc('guardian_links/tAdv_S1').get()).data()).toMatchObject({ relationship: 'Adviser', slot: 'adviser', status: 'active' });
    const c = (await db().doc(`activation_codes/${hashCode(code)}`).get()).data();
    expect(c).toMatchObject({ guardianRedemptions: 2, adviserRedemptions: 1, status: 'exhausted' });
  });
  it('only one adviser per slip', async () => {
    const code = await issue();
    await activateCode(adviser('t1'), { code, relationship: 'Adviser', consentVersion: 1 });
    await expect(activateCode(adviser('t2'), { code, relationship: 'Adviser', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await activateCode(guardian('g1'), { code, relationship: 'Mother', consentVersion: 1 });
  });
  it('refuses a non-DepEd account as adviser before looking at the code', async () => {
    const code = await issue();
    await expect(activateCode(guardian('g1'), { code, relationship: 'Adviser', consentVersion: 1 }))
      .rejects.toMatchObject({ code: 'permission-denied', message: 'Sign in with your @deped.gov.ph account to link as adviser.' });
    await expect(activateCode(guardian('g2'), { code: 'AAAAAAAA', relationship: 'Adviser', consentVersion: 1 }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data().adviserRedemptions).toBe(0);
  });
  it('re-redeeming by an already-linked account uses no slot; switching guardian→adviser is refused', async () => {
    const code = await issue();
    await activateCode(guardian('g1', 'g1@deped.gov.ph'), { code, relationship: 'Mother', consentVersion: 1 });
    await activateCode(guardian('g1', 'g1@deped.gov.ph'), { code, relationship: 'Mother', consentVersion: 1 });
    expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data().guardianRedemptions).toBe(1);
    await expect(activateCode(guardian('g1', 'g1@deped.gov.ph'), { code, relationship: 'Adviser', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('a legacy exhausted code with a past expiry still accepts an adviser', async () => {
    const code = await issue();
    await db().doc(`activation_codes/${hashCode(code)}`).set({
      studentId: 'S1', schoolYear: '2026-2027', status: 'exhausted', redemptions: 2, maxRedemptions: 2, expiresAt: ts(NOW.getTime() - DAY),
    });
    await activateCode(adviser(), { code, relationship: 'Adviser', consentVersion: 1 });
    const c = (await db().doc(`activation_codes/${hashCode(code)}`).get()).data();
    expect(c).toMatchObject({ guardianRedemptions: 2, adviserRedemptions: 1, status: 'exhausted' });
    expect(c.redemptions).toBeUndefined();
  });
  it('a slip still works 120 days after issue', async () => {
    const code = await issue();
    const later = { ...guardian(), now: () => new Date(NOW.getTime() + 120 * DAY) };
    await expect(activateCode(later, { code, relationship: 'Mother', consentVersion: 1 })).resolves.toMatchObject({ studentId: 'S1' });
  });
  it('a slip keeps working after the current school year changes, linking for the slip\'s own SY', async () => {
    const code = await issue();
    await db().doc('settings/app').set({ currentSchoolYear: '2027-2028' });
    await activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 1 });
    expect((await db().doc('guardian_links/gNew_S1').get()).data()).toMatchObject({ status: 'active', schoolYear: '2026-2027' });
  });
```

5. In `'rejects wrong consent version, unknown code, expired, revoked, restricted learner'`, rename to `'rejects wrong consent version, unknown code, revoked, restricted learner'` and delete these two lines (expiry no longer rejects):

```js
    await db().doc(`activation_codes/${hashCode(code)}`).set({ expiresAt: new Date(NOW.getTime() - 1) }, { merge: true });
    await expect(activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
```

In `tests/rules/parent.test.js`, add inside `describe('learners', …)`:

```js
  it('an adviser-slot link reads the learner like a guardian link', async () => {
    const ADVISER = { uid: 'tAdv', token: { email: 't@deped.gov.ph', email_verified: true, firebase: { sign_in_provider: 'google.com' } } };
    await seed(env, (db) => db.doc('guardian_links/tAdv_S1').set({ guardianUid: 'tAdv', studentId: 'S1', status: 'active', schoolYear: '2026-2027', relationship: 'Adviser', slot: 'adviser' }));
    await ok(as(env, ADVISER).doc('learners/S1').get());
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:functions`
Expected: FAIL — new/changed `activateCode` and `issueActivationCodes` cases (e.g. `expected undefined to be 'adviser'`, `guardianRedemptions` undefined, adviser relationship `invalid-argument`). The rules test passes already (rules are unchanged) — that's expected; it guards against a future rules change.

- [ ] **Step 3: Implement in `functions/src/handlers/codes.js`**

Replace the imports/constants block (lines 1-14) with:

```js
import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { audit } from '../audit.js';
import { logEvent, logWarn } from '../log.js';
import { str, oneOf, int } from '../lib/validators.js';
import { generateCode, normalizeCode, isValidCode, hashCode } from '../lib/activationCode.js';
import { sectionLabel, learnerIdentity } from '../lib/format.js';
import { ADVISER, isDepedEmail, slotFor, claimSlot, newCodeSlots } from '../lib/codeSlots.js';

// Guardian relationships. The class adviser (ADVISER) can only link through a
// slip, never through requestAccess, so it is not in this list.
export const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
const GENERIC = 'That code could not be used. Ask the registrar to reissue your slip.';
const ADVISER_DEPED = 'Sign in with your @deped.gov.ph account to link as adviser.';
```

In `issueActivationCodes`, replace the `db.doc(...).set({...})` call and the `slips.push` with (no `expiresAt`; slips valid until revoked, spec §3):

```js
    await db.doc(`activation_codes/${hashCode(code)}`).set({
      studentId, schoolYear, issuedAt: FieldValue.serverTimestamp(), issuedBy: email, ...newCodeSlots(), status: 'issued',
    });
    slips.push({ studentId, name: formalName(student), lrn: student.lrn, sectionLabel: sectionLabel(section), schoolYear, code });
```

Also change the destructuring on its first line from `const { db, now, email } = ctx;` to `const { db, email } = ctx;` only if `now` becomes unused — it is still used by `enforceRateLimit(..., now().getTime())`, so **keep** `now`.

Replace `activateCode` from its first line down to (and including) the end of the `db.runTransaction(...)` call with:

```js
export async function activateCode(ctx, data) {
  const { db, now, uid, email } = ctx;
  const nowMs = now().getTime();
  await enforceRateLimit(db, uid, 'activate', LIMITS.activate, nowMs);
  const relationship = oneOf(data.relationship, [...RELATIONSHIPS, ADVISER], 'relationship');
  const consentVersion = int(data.consentVersion, { name: 'consentVersion', min: 0, max: 1000 });
  const code = normalizeCode(data.code);
  // The guardian's own name, typed (or prefilled from their Google account)
  // on the Activate screen. Optional for older clients, which fall back to
  // the name on the sign-in token.
  const guardianName = str(data.guardianName ?? '', { name: 'Your name', max: 120 }) || ctx.displayName || '';
  const slot = slotFor(relationship);
  // Checked before the code is read, so this specific message reveals
  // nothing about whether the code is valid.
  if (slot === 'adviser' && !isDepedEmail(email)) throw new CallableError('permission-denied', ADVISER_DEPED);

  const fail = (reason) => { logWarn('activation_failed', { uid, reason, codeHash: isValidCode(code) ? hashCode(code) : null }); return new CallableError('failed-precondition', GENERIC); };
  if (!isValidCode(code)) throw fail('format');

  const portal = (await db.doc('settings/parent_portal').get()).data() || {};
  if ((portal.consentVersion ?? 1) !== consentVersion) throw fail('consent');

  const codeRef = db.doc(`activation_codes/${hashCode(code)}`);
  const codeDoc = (await codeRef.get()).data();
  if (!codeDoc) throw fail('unknown');
  // 'exhausted' can still have a free slot of the other kind (and legacy
  // codes were marked exhausted after two guardians); claimSlot decides.
  if (codeDoc.status !== 'issued' && codeDoc.status !== 'exhausted') throw fail(codeDoc.status);

  // Slips are valid for their own school year until staff revoke them
  // (endSchoolYear / reissue); changing currentSchoolYear does not end them.
  const { studentId, schoolYear } = codeDoc;
  const [studentSnap, enrollSnap] = await Promise.all([db.doc(`students/${studentId}`).get(), db.doc(`enrollments/${studentId}_${schoolYear}`).get()]);
  const student = studentSnap.data(); const enrollment = enrollSnap.data();
  if (!student || student.activationRestricted === true) throw fail('restricted');
  if (!enrollment || enrollment.status !== 'enrolled') throw fail('not-enrolled');
  const section = (await db.doc(`sections/${enrollment.sectionId}`).get()).data();

  const linkRef = db.doc(`guardian_links/${uid}_${studentId}`);
  const profileRef = db.doc(`guardians/${uid}`);
  const learnerRef = db.doc(`learners/${studentId}`);
  const learner = learnerIdentity(student, section, schoolYear);
  await db.runTransaction(async (tx) => {
    const [c, link, profile] = await Promise.all([tx.get(codeRef), tx.get(linkRef), tx.get(profileRef)]);
    const cd = c.data();
    if (cd.status !== 'issued' && cd.status !== 'exhausted') throw fail(cd.status);
    const alreadyActive = link.exists && link.data().status === 'active';
    if (alreadyActive) {
      if ((link.data().slot ?? 'guardian') !== slot) throw fail('slot-mismatch');
      tx.update(codeRef, { lastRedeemedAt: FieldValue.serverTimestamp() });
    } else {
      const claim = claimSlot(cd, slot);
      if (!claim) throw fail('exhausted');
      tx.update(codeRef, { ...claim, redemptions: FieldValue.delete(), maxRedemptions: FieldValue.delete(), lastRedeemedAt: FieldValue.serverTimestamp() });
    }
    tx.set(linkRef, {
      guardianUid: uid, guardianName, guardianEmail: email || '', learnerName: learner.displayName,
      studentId, schoolYear, relationship, slot, status: 'active', activatedAt: FieldValue.serverTimestamp(), activatedVia: 'code',
      revokedAt: FieldValue.delete(), revokedBy: FieldValue.delete(), revokedReason: FieldValue.delete(),
      expiredAt: FieldValue.delete(), expiredReason: FieldValue.delete(),
    }, { merge: true });
```

Keep the rest of the transaction body (profile create/patch, `tx.set(learnerRef, …)`) and everything after it unchanged. Update the audit call's `details` to `{ via: 'code', relationship, slot, codeHash: hashCode(code) }`.

Remove `Timestamp` from the `firebase-admin/firestore` import (done above) and delete `CODE_TTL_MS` / `MAX_REDEMPTIONS` (done above). Confirm nothing else imports them:

Run: `grep -rn "CODE_TTL_MS\|MAX_REDEMPTIONS" functions/src functions/index.js functions/test`
Expected: no output.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix functions test && npm run test:functions && npm run test:rules`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/codes.js functions/test/emulator/codes.test.js tests/rules/parent.test.js
git commit -m "feat(functions): adviser slot on slips, no time expiry, slip school year

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Nightly job keeps links across rollover; code retention by revoke date

**Files:**
- Modify: `functions/src/handlers/scheduled.js` (`expireLinks`, lines 22-80)
- Modify: `functions/test/emulator/scheduled.test.js`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Consumes: `activation_codes` fields `status`, `revokedAt`, `lastRedeemedAt` (Task 2 / existing revoke paths).
- Produces: `expireLinks` return shape unchanged: `{ expired, seeded, oldRevoked, oldExpired, oldCodes, oldAudit, dormant }`.

- [ ] **Step 1: Update tests (failing)**

In `functions/test/emulator/scheduled.test.js`, inside `describe('expireLinks', …)`:

1. Add:

```js
  it('leaves links alone when the current school year moves on', async () => {
    await db().doc('settings/app').set({ currentSchoolYear: '2027-2028' });
    const r = await expireLinks(deps());
    expect(r.expired).toBe(0);
    expect((await db().doc('guardian_links/gA_S1').get()).data().status).toBe('active');
    expect((await db().collection('guardians/gA/inbox').get()).size).toBe(0);
  });
  it('tells the account why a dropped learner\'s link ended', async () => {
    await db().doc('enrollments/S1_2026-2027').set({ status: 'withdrawn' }, { merge: true });
    await expireLinks(deps());
    const inbox = await db().collection('guardians/gA/inbox').get();
    expect(inbox.docs[0].data().body).toBe('Your link to a learner has ended because the learner is no longer enrolled. Contact the registrar if this is a mistake.');
  });
  it('deletes codes revoked or last used over a year ago, never issued ones', async () => {
    await db().doc('activation_codes/rOld').set({ studentId: 'S1', schoolYear: '2024-2025', status: 'revoked', revokedAt: ts(NOW.getTime() - 400 * DAY) });
    await db().doc('activation_codes/rNew').set({ studentId: 'S1', schoolYear: '2026-2027', status: 'revoked', revokedAt: ts(NOW.getTime() - 10 * DAY) });
    await db().doc('activation_codes/xOld').set({ studentId: 'S1', schoolYear: '2024-2025', status: 'exhausted', lastRedeemedAt: ts(NOW.getTime() - 400 * DAY) });
    await db().doc('activation_codes/iOld').set({ studentId: 'S1', schoolYear: '2024-2025', status: 'issued', issuedAt: ts(NOW.getTime() - 400 * DAY) });
    const r = await expireLinks(deps());
    expect(r.oldCodes).toBe(2);
    expect((await db().doc('activation_codes/rOld').get()).exists).toBe(false);
    expect((await db().doc('activation_codes/xOld').get()).exists).toBe(false);
    expect((await db().doc('activation_codes/rNew').get()).exists).toBe(true);
    expect((await db().doc('activation_codes/iOld').get()).exists).toBe(true);
  });
```

2. In `'deletes old revoked links, old codes, old audit rows, dormant guardians'`, change the `activation_codes/h1` fixture's `expiresAt: ts(NOW.getTime() - 400 * DAY)` to `revokedAt: ts(NOW.getTime() - 400 * DAY)`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:functions`
Expected: FAIL — `leaves links alone…` (expired 2), inbox body mismatch, `oldCodes` counts.

- [ ] **Step 3: Implement**

In `functions/src/handlers/scheduled.js`, update the comment above `expireLinks` and the link loop:

```js
// Nightly. (1) expire links whose learner is no longer enrolled in the
// link's own school year (drop/transfer) — a school-year change alone never
// ends links; staff do that with endSchoolYear; (2) delete old
// revoked/expired links, old codes, old audit rows; (3) delete dormant
// guardian accounts.
```

Inside the `for (const l of active.docs)` loop, replace the enrollment read and condition:

```js
    const { studentId, guardianUid, schoolYear } = l.data();
    const e = (await db.doc(`enrollments/${studentId}_${schoolYear}`).get()).data();
    if (e && e.status === 'enrolled') {
```

and inside that branch change `learnerIdentity(student.data(), section.data(), sy)` to `learnerIdentity(student.data(), section.data(), schoolYear)`.

Replace the expiry write + inbox lines after that branch:

```js
    await l.ref.set({ status: 'expired', expiredAt: FieldValue.serverTimestamp(), expiredReason: 'not-enrolled' }, { merge: true });
    await systemInbox(db, guardianUid, { title: 'Access ended', body: 'Your link to a learner has ended because the learner is no longer enrolled. Contact the registrar if this is a mistake.', studentId });
    expired++;
```

Replace the `oldCodes` line:

```js
  // Codes never expire by time any more; delete them a year after they were
  // revoked or last used. Codes still 'issued' are never deleted here.
  const oldCodes = (await deleteMatching(db, db.collection('activation_codes').where('status', '==', 'revoked').where('revokedAt', '<', ms(cut.codesBeforeMs))))
    + (await deleteMatching(db, db.collection('activation_codes').where('status', '==', 'exhausted').where('lastRedeemedAt', '<', ms(cut.codesBeforeMs))));
```

In `firestore.indexes.json`, add to `"indexes"` (after the existing `activation_codes (studentId, schoolYear)` entry):

```json
    { "collectionGroup": "activation_codes", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "revokedAt", "order": "ASCENDING" } ] },
    { "collectionGroup": "activation_codes", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "lastRedeemedAt", "order": "ASCENDING" } ] },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:functions`
Expected: PASS, including the pre-existing `'expires links whose learner is no longer enrolled this SY and notifies'` (expired 2, one system inbox item for gA).

Run: `node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8'))"`
Expected: no output (valid JSON).

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/scheduled.js functions/test/emulator/scheduled.test.js firestore.indexes.json
git commit -m "feat(functions): keep links across SY change; retain codes by revoke date

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `endSchoolYear` callable

**Files:**
- Create: `functions/src/handlers/schoolYear.js`
- Create: `functions/test/emulator/schoolYear.test.js`
- Modify: `functions/index.js`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Produces:
  - `endSchoolYear(ctx: { db, email }, data: { schoolYear: string, confirmText: string }) → Promise<{ codesRevoked: number, linksExpired: number, accountsNotified: number }>`
  - Callable name `endSchoolYearFn` (Task 7 calls it).
  - Inbox doc id `sy-ended-{schoolYear}` per account (idempotent).

- [ ] **Step 1: Write the failing test**

`functions/test/emulator/schoolYear.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { endSchoolYear } from '../../src/handlers/schoolYear.js';

const staff = () => ({ db: db(), now: () => new Date('2027-04-10T08:00:00+08:00'), uid: 'staff1', email: 'registrar@bnhs.edu' });
const SY = '2026-2027';

beforeEach(async () => {
  await clearAll(); await seedSchool();
  const b = db().batch();
  b.set(db().doc('activation_codes/c1'), { studentId: 'S1', schoolYear: SY, status: 'issued' });
  b.set(db().doc('activation_codes/c2'), { studentId: 'S2', schoolYear: SY, status: 'exhausted' });
  b.set(db().doc('activation_codes/c3'), { studentId: 'S2', schoolYear: SY, status: 'revoked', revokedReason: 'reissued' });
  b.set(db().doc('activation_codes/cNext'), { studentId: 'S1', schoolYear: '2027-2028', status: 'issued' });
  // gA is linked to two learners: still one inbox message.
  b.set(db().doc('guardian_links/gA_S2'), { guardianUid: 'gA', studentId: 'S2', status: 'active', schoolYear: SY, relationship: 'Mother' });
  b.set(db().doc('guardian_links/gA_S9'), { guardianUid: 'gA', studentId: 'S9', status: 'active', schoolYear: '2027-2028', relationship: 'Mother' });
  await b.commit();
});

describe('endSchoolYear', () => {
  it('revokes the year\'s slips, expires its links, notifies each account once, audits', async () => {
    const r = await endSchoolYear(staff(), { schoolYear: SY, confirmText: ` ${SY} ` });
    expect(r).toEqual({ codesRevoked: 2, linksExpired: 3, accountsNotified: 2 });
    for (const id of ['c1', 'c2']) expect((await db().doc(`activation_codes/${id}`).get()).data()).toMatchObject({ status: 'revoked', revokedReason: 'school-year-ended', revokedBy: 'registrar@bnhs.edu' });
    expect((await db().doc('activation_codes/c3').get()).data().revokedReason).toBe('reissued');
    expect((await db().doc('activation_codes/cNext').get()).data().status).toBe('issued');
    for (const id of ['gA_S1', 'gB_S1', 'gA_S2']) expect((await db().doc(`guardian_links/${id}`).get()).data()).toMatchObject({ status: 'expired', expiredReason: 'school-year-ended' });
    expect((await db().doc('guardian_links/gA_S9').get()).data().status).toBe('active');
    expect((await db().doc('guardian_links/gC_S1').get()).data().status).toBe('revoked');
    const inboxA = await db().collection('guardians/gA/inbox').get();
    expect(inboxA.size).toBe(1);
    expect(inboxA.docs[0].id).toBe(`sy-ended-${SY}`);
    expect(inboxA.docs[0].data()).toMatchObject({ type: 'system', title: `SY ${SY} has ended`, pushStatus: 'skipped_suppressed' });
    expect((await db().collection('guardians/gB/inbox').get()).size).toBe(1);
    const audit = await db().collection('audit_log').where('action', '==', 'schoolyear.ended').get();
    expect(audit.docs[0].data()).toMatchObject({ targetId: SY, details: { codesRevoked: 2, linksExpired: 3, accountsNotified: 2 } });
  });
  it('is safe to run twice', async () => {
    await endSchoolYear(staff(), { schoolYear: SY, confirmText: SY });
    const r = await endSchoolYear(staff(), { schoolYear: SY, confirmText: SY });
    expect(r).toEqual({ codesRevoked: 0, linksExpired: 0, accountsNotified: 0 });
    expect((await db().collection('guardians/gA/inbox').get()).size).toBe(1);
  });
  it('rejects a confirmation that does not match and a malformed school year', async () => {
    await expect(endSchoolYear(staff(), { schoolYear: SY, confirmText: '2026-2028' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(endSchoolYear(staff(), { schoolYear: '2026/2027', confirmText: '2026/2027' })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await db().doc('activation_codes/c1').get()).data().status).toBe('issued');
  });
});
```

(Non-staff callers are rejected by the shared `staffCall` wrapper → `staffIdentity` in `functions/src/callable.js`, the same as every other staff callable; the handler itself is not re-tested for that.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:functions`
Expected: FAIL — `Failed to resolve import "../../src/handlers/schoolYear.js"`.

- [ ] **Step 3: Implement**

`functions/src/handlers/schoolYear.js`:

```js
import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { audit } from '../audit.js';
import { logEvent } from '../log.js';
import { str } from '../lib/validators.js';

// A links page can write one inbox doc per link as well, so 200 keeps every
// batch at or under 400 writes (Firestore's batch limit is 500).
const PAGE = 200;

// Runs `apply(docs, batch)` over every doc matching `query`, one page at a
// time. Each page's writes move its docs out of the query, so re-querying
// from the top always yields the next page — and a re-run after a partial
// failure picks up exactly what is left.
async function drain(db, query, apply) {
  let n = 0;
  for (;;) {
    const snap = await query.limit(PAGE).get();
    if (snap.empty) return n;
    const b = db.batch();
    await apply(snap.docs, b);
    await b.commit();
    n += snap.size;
    if (snap.size < PAGE) return n;
  }
}

// Staff. The only thing that ends a school year's slips and links (spec
// 2026-09-30 §3). The typed confirmation guards against a mis-click.
export async function endSchoolYear(ctx, data) {
  const { db, email } = ctx;
  const schoolYear = str(data.schoolYear, { name: 'schoolYear', min: 9, max: 9 });
  if (!/^\d{4}-\d{4}$/.test(schoolYear)) throw new CallableError('invalid-argument', 'schoolYear must look like 2026-2027');
  const confirmText = str(data.confirmText, { name: 'confirmText', max: 20 });
  if (confirmText !== schoolYear) throw new CallableError('invalid-argument', 'Type the school year exactly to confirm.');

  const codesRevoked = await drain(db,
    db.collection('activation_codes').where('schoolYear', '==', schoolYear).where('status', 'in', ['issued', 'exhausted']),
    (docs, b) => docs.forEach((d) => b.update(d.ref, { status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: email, revokedReason: 'school-year-ended' })));

  const notified = new Set();
  const linksExpired = await drain(db,
    db.collection('guardian_links').where('schoolYear', '==', schoolYear).where('status', '==', 'active'),
    (docs, b) => docs.forEach((d) => {
      const { guardianUid } = d.data();
      // Fixed id: one message per account per year, even across re-runs.
      // Written in the same batch as the link change, so it can't be lost.
      if (!notified.has(guardianUid)) {
        notified.add(guardianUid);
        b.set(db.doc(`guardians/${guardianUid}/inbox/sy-ended-${schoolYear}`), {
          type: 'system', title: `SY ${schoolYear} has ended`,
          body: `SY ${schoolYear} has ended. Use the new activation slip from the school to link again for the next school year.`,
          studentId: null, createdAt: FieldValue.serverTimestamp(), pushStatus: 'skipped_suppressed',
        });
      }
      b.update(d.ref, { status: 'expired', expiredAt: FieldValue.serverTimestamp(), expiredReason: 'school-year-ended' });
    }));

  const result = { codesRevoked, linksExpired, accountsNotified: notified.size };
  await audit(db, { action: 'schoolyear.ended', actorType: 'staff', actorUid: email, targetType: 'school_year', targetId: schoolYear, details: result });
  logEvent('school_year_ended', { schoolYear, ...result });
  return result;
}
```

Note: `notified` is per run. On a re-run, accounts whose links were already expired aren't touched; the fixed inbox id means an account seen again (links split across a failed page) is overwritten, not duplicated.

In `functions/index.js`, add the import next to the codes import:

```js
import { endSchoolYear } from './src/handlers/schoolYear.js';
```

and the export after `export const acceptConsentFn = guardianCall(acceptConsent);`:

```js
export const endSchoolYearFn = staffCall(endSchoolYear);
```

In `firestore.indexes.json` add:

```json
    { "collectionGroup": "activation_codes", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "schoolYear", "order": "ASCENDING" }, { "fieldPath": "status", "order": "ASCENDING" } ] },
    { "collectionGroup": "guardian_links", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "schoolYear", "order": "ASCENDING" }, { "fieldPath": "status", "order": "ASCENDING" } ] },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:functions`
Expected: PASS (all emulator suites).

Run: `node --check functions/index.js && node --check functions/src/handlers/schoolYear.js`
Expected: no output (both parse).

- [ ] **Step 5: Commit**

```bash
git add functions/src/handlers/schoolYear.js functions/test/emulator/schoolYear.test.js functions/index.js firestore.indexes.json
git commit -m "feat(functions): endSchoolYear callable revokes slips and ends links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Parent QR decoding library

**Files:**
- Create: `parent/src/lib/qrScan.js`
- Create: `parent/src/lib/qrScan.test.js`
- Modify: `parent/package.json`, `parent/package-lock.json` (via npm)

**Interfaces:**
- Produces:
  - `normalizeCode(input: string) → string` (same rules as `functions/src/lib/activationCode.js`)
  - `extractCode(text: string|null) → string|null` — 8-char code or null
  - `createDetector(opts?: { win?, loadJsQR? }) → Promise<{ kind: 'native'|'jsqr', detect(source) → Promise<string|null> }>`; `source` is an `HTMLVideoElement` or `ImageBitmap`.

- [ ] **Step 1: Install jsqr**

Run: `npm --prefix parent install jsqr@^1.4.0`
Expected: `parent/package.json` dependencies now include `"jsqr": "^1.4.0"`.

- [ ] **Step 2: Write the failing test**

`parent/src/lib/qrScan.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { extractCode, normalizeCode, createDetector } from './qrScan.js';

describe('extractCode', () => {
  it('reads the code from the printed slip URL on any host', () => {
    expect(extractCode('https://bnhs-parent.web.app/activate?c=ABCD2345')).toBe('ABCD2345');
    expect(extractCode('http://localhost:5174/activate/?c=abcd2345')).toBe('ABCD2345');
  });
  it('accepts a bare code with dash, spaces, lowercase and look-alike letters', () => {
    expect(extractCode('ABCD-2345')).toBe('ABCD2345');
    expect(extractCode(' abcd 2345 ')).toBe('ABCD2345');
    expect(extractCode('ABCD-O1IL')).toBe('ABCD0111');
  });
  it('rejects foreign URLs, wrong length, U, junk and empty input', () => {
    expect(extractCode('https://example.com/pay?c=ABCD2345')).toBeNull();
    expect(extractCode('https://bnhs-parent.web.app/activate')).toBeNull();
    expect(extractCode('ABCD234')).toBeNull();
    expect(extractCode('ABCDU234')).toBeNull();
    expect(extractCode('WIFI:S:school;T:WPA;P:secret;;')).toBeNull();
    expect(extractCode('')).toBeNull();
    expect(extractCode(null)).toBeNull();
  });
  it('normalizes like the server', () => {
    expect(normalizeCode('abc-o1l')).toBe('ABC011');
  });
});

describe('createDetector', () => {
  it('uses the native BarcodeDetector when it supports qr_code', async () => {
    class BarcodeDetector {
      static async getSupportedFormats() { return ['qr_code', 'ean_13']; }
      constructor(opts) { this.opts = opts; }
      async detect() { return [{ rawValue: 'https://x/activate?c=ABCD2345' }]; }
    }
    const loadJsQR = vi.fn();
    const d = await createDetector({ win: { BarcodeDetector }, loadJsQR });
    expect(d.kind).toBe('native');
    expect(await d.detect({})).toBe('https://x/activate?c=ABCD2345');
    expect(loadJsQR).not.toHaveBeenCalled();
  });
  it('returns null from native detect when nothing is found', async () => {
    class BarcodeDetector { static async getSupportedFormats() { return ['qr_code']; } async detect() { return []; } }
    const d = await createDetector({ win: { BarcodeDetector }, loadJsQR: vi.fn() });
    expect(await d.detect({})).toBeNull();
  });
  it('falls back to jsQR when BarcodeDetector is missing or lacks qr_code', async () => {
    const jsQR = vi.fn(() => ({ data: 'ABCD-2345' }));
    const ctx = { drawImage: vi.fn(), getImageData: vi.fn((x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })) };
    const canvas = { getContext: vi.fn(() => ctx) };
    const win = { document: { createElement: vi.fn(() => canvas) } };
    const d = await createDetector({ win, loadJsQR: async () => jsQR });
    expect(d.kind).toBe('jsqr');
    expect(await d.detect({ videoWidth: 1280, videoHeight: 720 })).toBe('ABCD-2345');
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(jsQR).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), 640, 360, { inversionAttempts: 'dontInvert' });

    class NoQr { static async getSupportedFormats() { return ['ean_13']; } }
    expect((await createDetector({ win: { ...win, BarcodeDetector: NoQr }, loadJsQR: async () => jsQR })).kind).toBe('jsqr');
  });
  it('jsQR detect returns null for a source with no size yet or no QR', async () => {
    const jsQR = vi.fn(() => null);
    const ctx = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })) };
    const win = { document: { createElement: () => ({ getContext: () => ctx }) } };
    const d = await createDetector({ win, loadJsQR: async () => jsQR });
    expect(await d.detect({ videoWidth: 0, videoHeight: 0 })).toBeNull();
    expect(await d.detect({ width: 100, height: 100 })).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --prefix parent test -- qrScan`
Expected: FAIL — `Failed to resolve import "./qrScan.js"`.

- [ ] **Step 4: Write minimal implementation**

`parent/src/lib/qrScan.js`:

```js
// Reads an activation code out of whatever a QR holds: the printed slip's
// link (<portal>/activate?c=CODE) or a bare code. Same normalisation as
// functions/src/lib/activationCode.js so a scanned code matches the server.
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;
const MAX_BARE = 16;
const MAX_FRAME = 640;

export const normalizeCode = (input) =>
  String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

export function extractCode(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  let candidate = raw;
  if (/^https?:\/\//i.test(raw)) {
    let url;
    try { url = new URL(raw); } catch { return null; }
    if (!/\/activate\/?$/.test(url.pathname)) return null;
    candidate = url.searchParams.get('c') || '';
  } else if (raw.length > MAX_BARE) {
    return null;
  }
  const code = normalizeCode(candidate);
  return CODE_RE.test(code) ? code : null;
}

// The phone's own QR reader where it exists (Android Chrome); otherwise jsQR,
// loaded only now so it never weighs on the app's first load.
export async function createDetector({ win = globalThis, loadJsQR = () => import('jsqr').then((m) => m.default) } = {}) {
  if (win.BarcodeDetector) {
    try {
      const formats = await win.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const native = new win.BarcodeDetector({ formats: ['qr_code'] });
        return { kind: 'native', async detect(source) { return (await native.detect(source))[0]?.rawValue ?? null; } };
      }
    } catch { /* fall back to jsQR */ }
  }
  const jsQR = await loadJsQR();
  let canvas = null, ctx = null;
  return {
    kind: 'jsqr',
    async detect(source) {
      const w = source.videoWidth || source.width || 0;
      const h = source.videoHeight || source.height || 0;
      if (!w || !h) return null;
      const scale = Math.min(1, MAX_FRAME / Math.max(w, h));
      const cw = Math.round(w * scale), ch = Math.round(h * scale);
      if (!canvas) { canvas = win.document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true }); }
      canvas.width = cw; canvas.height = ch;
      ctx.drawImage(source, 0, 0, cw, ch);
      const { data } = ctx.getImageData(0, 0, cw, ch);
      return jsQR(data, cw, ch, { inversionAttempts: 'dontInvert' })?.data ?? null;
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix parent test -- qrScan`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add parent/src/lib/qrScan.js parent/src/lib/qrScan.test.js parent/package.json parent/package-lock.json
git commit -m "feat(parent): QR code extraction with native or jsQR detector

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Scan sheet and Activate screen (scan button, Adviser option)

**Files:**
- Create: `parent/src/components/ScanSheet.jsx`
- Modify: `parent/src/screens/Activate.jsx`
- Modify: `parent/src/strings.js` (activate block, ~lines 51-59)
- Modify: `parent/src/lib/strings.test.js`

**Interfaces:**
- Consumes: `createDetector`, `extractCode` (Task 5); `permission-denied` from `activateCodeFn` (Task 2).
- Produces: `<ScanSheet onCode={(code: string) => void} onClose={() => void} />` (default export).

- [ ] **Step 1: Write the failing strings test**

Append to `parent/src/lib/strings.test.js` inside `describe('strings', …)`:

```js
  it('has the scan and adviser strings', () => {
    for (const k of ['scanButton', 'scanTitle', 'scanHelp', 'scanCancel', 'scanDenied', 'scanPhoto', 'scanNotSlip', 'scanPhotoFailed', 'activateAdviserOption', 'activateAdviserHint', 'activateAdviserDeped'])
      expect(typeof S[k], k).toBe('string');
    expect(S.activateAdviserDeped).toContain('@deped.gov.ph');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix parent test -- strings`
Expected: FAIL — `scanButton: expected 'undefined' to be 'string'`.

- [ ] **Step 3: Add strings**

In `parent/src/strings.js`, change `activateBody` and add the new keys right after `activateAnother`:

```js
  activateBody: 'Scan the QR code or enter the activation code printed on the slip from the school.',
```

```js
  activateAdviserOption: 'Adviser (class adviser)',
  activateAdviserHint: 'For the class adviser — sign in with your DepEd (@deped.gov.ph) account.',
  activateAdviserDeped: 'Sign in with your @deped.gov.ph account to link as adviser.',
  scanButton: 'Scan the QR code on the slip',
  scanTitle: 'Scan activation slip',
  scanHelp: 'Point your camera at the QR code on the slip.',
  scanCancel: 'Cancel',
  scanDenied: 'The camera could not be opened. Allow camera access for this site, take a photo of the slip, or type the code.',
  scanPhoto: 'Take a photo of the slip instead',
  scanNotSlip: 'This QR is not an activation slip. Scan the QR on the slip from the school.',
  scanPhotoFailed: 'Could not read a QR in that photo. Try again closer, or type the code.',
```

Run: `npm --prefix parent test -- strings`
Expected: PASS (includes the forbidden-word check).

- [ ] **Step 4: Create `parent/src/components/ScanSheet.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import S from '../strings.js';
import { Btn } from './ui.jsx';
import { createDetector, extractCode } from '../lib/qrScan.js';

const FRAME_MS = 125; // ~8 decodes a second is plenty and spares the battery

// Full-screen camera view that fills in the activation code from the slip's
// QR. It never activates anything itself; Activate still needs the parent's
// name, relationship and a tap on "Link learner".
export default function ScanSheet({ onCode, onClose }) {
  const video = useRef(null);
  const detector = useRef(null);
  const onCodeRef = useRef(onCode); onCodeRef.current = onCode;
  const [status, setStatus] = useState('starting'); // starting | scanning | denied
  const [notSlip, setNotSlip] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    let stream = null, raf = 0, stopped = false, last = 0;
    const stop = () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
    const found = (text) => {
      const code = extractCode(text);
      if (!code) { setNotSlip(true); return false; }
      navigator.vibrate?.(60);
      stop();
      onCodeRef.current(code);
      return true;
    };
    const tick = async (t) => {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2 && t - last >= FRAME_MS) {
        last = t;
        const text = await detector.current.detect(v).catch(() => null);
        if (stopped || (text && found(text))) return;
      }
      raf = requestAnimationFrame(tick);
    };
    (async () => {
      try {
        detector.current = await createDetector();
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.current.srcObject = stream;
        await video.current.play();
        setStatus('scanning');
        raf = requestAnimationFrame(tick);
      } catch {
        if (!stopped) setStatus('denied');
      }
    })();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { stop(); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoFailed(false);
    try {
      if (!detector.current) detector.current = await createDetector();
      const bitmap = await createImageBitmap(file);
      const code = extractCode(await detector.current.detect(bitmap));
      bitmap.close?.();
      if (code) { onCodeRef.current(code); return; }
    } catch { /* reported below */ }
    setPhotoFailed(true);
  };

  // Portalled to <body>: Activate renders inside a .glass-card whose
  // backdrop-filter would otherwise trap this position:fixed overlay inside
  // the card instead of covering the screen.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={S.scanTitle}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#0B0A14', color: '#fff', display: 'grid', gridTemplateRows: 'auto 1fr auto', fontFamily: 'inherit' }}>
      <div style={{ padding: '16px 16px 8px' }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>{S.scanTitle}</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, opacity: 0.85 }}>{status === 'denied' ? S.scanDenied : S.scanHelp}</p>
      </div>
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: status === 'denied' ? 'none' : 'block' }} />
        {status !== 'denied' && (
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <div style={{ width: 'min(64vw, 280px)', aspectRatio: '1', border: '3px solid rgba(255,255,255,0.9)', borderRadius: 18, boxShadow: '0 0 0 100vmax rgba(0,0,0,0.45)' }} />
          </div>
        )}
      </div>
      <div style={{ padding: 16, display: 'grid', gap: 10 }}>
        {notSlip && <p role="status" style={{ margin: 0, fontSize: 14, color: '#FDE68A' }}>{S.scanNotSlip}</p>}
        {photoFailed && <p role="alert" style={{ margin: 0, fontSize: 14, color: '#FCA5A5' }}>{S.scanPhotoFailed}</p>}
        <label style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', minHeight: 44, display: 'grid', placeItems: 'center' }}>
          {S.scanPhoto}
          <input type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
        </label>
        <Btn variant="ghost" onClick={onClose} style={{ color: '#fff', borderColor: '#fff' }}>{S.scanCancel}</Btn>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 5: Wire it into `parent/src/screens/Activate.jsx`**

Replace the file with:

```jsx
import { useCallback, useState, lazy, Suspense } from 'react';
import { updateProfile } from 'firebase/auth';
import { callable } from '../firebase.js';
import S from '../strings.js';
import { Btn, Card, Field, Inp, Sel, Banner } from '../components/ui.jsx';
import { useDoc } from '../hooks/useDoc.js';

// Camera code and the jsQR fallback load only when the parent taps Scan.
const ScanSheet = lazy(() => import('../components/ScanSheet.jsx'));

const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
const ADVISER = 'Adviser';
const normalize = (v) => v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
const pretty = (v) => (v.length > 4 ? `${v.slice(0, 4)}-${v.slice(4)}` : v);

export default function Activate({ user, profile, route, navigate }) {
  const portal = useDoc('settings/parent_portal').data;
  const [code, setCode] = useState(normalize(route.query.c || ''));
  // Prefilled from the guardian profile, else the Google account name or the
  // name typed when the email account was created.
  const [guardianName, setGuardianName] = useState(profile?.displayName || user?.displayName || '');
  const [relationship, setRelationship] = useState('Mother');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [done, setDone] = useState(null);

  const closeScan = useCallback(() => setScanning(false), []);
  const scanned = useCallback((c) => { setCode(c); setErr(null); setScanning(false); }, []);

  const submit = async () => {
    setBusy(true); setErr(null);
    let consentVersion = portal?.consentVersion ?? 1;
    try { const stored = localStorage.getItem('bnhs-parent-consent'); if (stored) consentVersion = Number(stored); } catch {}
    const name = guardianName.trim();
    try {
      const r = await callable('activateCodeFn')({ code, relationship, consentVersion, guardianName: name });
      if (user && user.displayName !== name) updateProfile(user, { displayName: name }).catch(() => {});
      setDone(r.data);
    }
    catch (e) { setErr(String(e?.code || '').endsWith('permission-denied') ? S.activateAdviserDeped : S.activateFailed); }
    setBusy(false);
  };

  if (done) return (
    <Card>
      <h1 style={{ fontSize: 20 }}>{S.activateSuccess} {done.displayName}</h1>
      <p>{done.sectionLabel}</p>
      <div style={{ display: 'grid', gap: 10 }}>
        <Btn onClick={() => navigate('/')}>{S.continue}</Btn>
        <Btn variant="ghost" onClick={() => { setDone(null); setCode(''); }}>{S.activateAnother}</Btn>
      </div>
    </Card>
  );
  return (
    <Card>
      <h1 style={{ fontSize: 20 }}>{S.activateTitle}</h1>
      <p>{S.activateBody}</p>
      {err && <Banner tone="danger">{err}</Banner>}
      <Btn variant="ghost" onClick={() => setScanning(true)} style={{ width: '100%', marginBottom: 14 }}>{S.scanButton}</Btn>
      <Field label={S.activateCodeLabel}><Inp inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" value={pretty(code)} onChange={(e) => setCode(normalize(e.target.value))} style={{ letterSpacing: '0.12em', fontSize: 20, textAlign: 'center' }} /></Field>
      <Field label={S.yourName} hint={S.yourNameHint}><Inp autoComplete="name" autoCapitalize="words" maxLength={120} value={guardianName} onChange={(e) => setGuardianName(e.target.value)} /></Field>
      <Field label={S.activateRelationship} hint={relationship === ADVISER ? S.activateAdviserHint : undefined}>
        <Sel value={relationship} onChange={(e) => setRelationship(e.target.value)}>
          {RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
          <option value={ADVISER}>{S.activateAdviserOption}</option>
        </Sel>
      </Field>
      <Btn onClick={submit} disabled={busy || code.length !== 8 || guardianName.trim().length < 2} style={{ width: '100%' }}>{S.activateButton}</Btn>
      <p style={{ textAlign: 'center' }}><a href="/request-access" onClick={(e) => { e.preventDefault(); navigate('/request-access'); }}>{S.activateNoSlip}</a></p>
      {scanning && <Suspense fallback={null}><ScanSheet onCode={scanned} onClose={closeScan} /></Suspense>}
    </Card>
  );
}
```

(`RequestAccess.jsx` keeps its own list without Adviser — no change.)

- [ ] **Step 6: Build, size-check, and test**

Run: `npm --prefix parent test && npm --prefix parent run build && npm --prefix parent run size`
Expected: tests PASS; build succeeds; size prints `initial-load total: … (limit 260 KB)` with no "budget exceeded". Confirm jsQR is in its own chunk:

Run: `grep -l "inversionAttempts" parent/dist/assets/*.js`
Expected: one file that is **not** referenced by `parent/dist/index.html` (check with `grep -c <that-filename> parent/dist/index.html` → `0`).

- [ ] **Step 7: Manual check in the browser**

Run the parent dev server (`npm --prefix parent run dev`, port 5174), sign in, open `/activate`:
- Tap "Scan the QR code on the slip" → camera sheet appears; Cancel/Escape closes it and the camera light turns off.
- Deny camera permission → the denied message and "Take a photo of the slip instead" show.
- Hold up a printed slip (or a QR of `https://bnhs-parent.web.app/activate?c=ABCD2345` on another screen) → the sheet closes and the code box shows `ABCD-2345`.
- Choose "Adviser (class adviser)" → the DepEd hint shows under the dropdown.

- [ ] **Step 8: Commit**

```bash
git add parent/src/components/ScanSheet.jsx parent/src/screens/Activate.jsx parent/src/strings.js parent/src/lib/strings.test.js
git commit -m "feat(parent): scan slip QR in the app; adviser relationship on Activate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: SIMS — End school year card and new slip wording

**Files:**
- Modify: `src/lib/dates.js`, `src/lib/dates.test.js`
- Modify: `src/data/guardians.js`
- Create: `src/pages/guardians/EndSchoolYearCard.jsx`
- Modify: `src/pages/guardians/CodesTab.jsx`
- Modify: `src/components/ActivationSlipsPrintable.jsx`

**Interfaces:**
- Consumes: `endSchoolYearFn` (Task 4); slips' `schoolYear` field (Task 2).
- Produces: `previousSchoolYear(sy: string) → string` in `src/lib/dates.js`; `call.endSchoolYear({ schoolYear, confirmText })`.

- [ ] **Step 1: Write the failing test**

In `src/lib/dates.test.js`, change the second import line to
`import { pad2, localDate, localMonth, schoolDaysInMonth, monthLabel, previousSchoolYear } from './dates.js';`
and append:

```js
describe('previousSchoolYear', () => {
  it('steps back one school year', () => {
    expect(previousSchoolYear('2026-2027')).toBe('2025-2026');
    expect(previousSchoolYear('2000-2001')).toBe('1999-2000');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/dates`
Expected: FAIL — `previousSchoolYear is not a function` (or import error).

- [ ] **Step 3: Implement the helper and the data call**

Append to `src/lib/dates.js`:

```js
export function previousSchoolYear(sy) {
  const [start] = sy.split('-').map(Number);
  return `${start - 1}-${start}`;
}
```

In `src/data/guardians.js`, add to the `call` object after `revokeCode`:

```js
  endSchoolYear: fn('endSchoolYearFn'),
```

Run: `npm test -- src/lib/dates`
Expected: PASS.

- [ ] **Step 4: Create `src/pages/guardians/EndSchoolYearCard.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { call } from '../../data/guardians.js';
import { previousSchoolYear } from '../../lib/dates.js';
import { T, S } from '../../styles.js';
import { Btn, Card, Field, Inp, Sel, Modal } from '../../components/ui.jsx';

async function countOpen(sy) {
  const [slips, links] = await Promise.all([
    getCountFromServer(query(collection(db, 'activation_codes'), where('schoolYear', '==', sy), where('status', 'in', ['issued', 'exhausted']))),
    getCountFromServer(query(collection(db, 'guardian_links'), where('schoolYear', '==', sy), where('status', '==', 'active'))),
  ]);
  return { slips: slips.data().count, links: links.data().count };
}

// Slips and links no longer end on their own (spec 2026-09-30 §3); this is
// the only way a school year's parent-portal access ends.
export default function EndSchoolYearCard({ schoolYear }) {
  const previous = previousSchoolYear(schoolYear);
  const [sy, setSy] = useState(schoolYear);
  const [counts, setCounts] = useState({});
  const [loadErr, setLoadErr] = useState(false);
  const [reload, setReload] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState(null);

  useEffect(() => {
    let on = true; setLoadErr(false);
    Promise.all([countOpen(schoolYear), countOpen(previous)])
      .then(([cur, prev]) => { if (on) setCounts({ [schoolYear]: cur, [previous]: prev }); })
      .catch(() => { if (on) setLoadErr(true); });
    return () => { on = false; };
  }, [schoolYear, previous, reload]);

  const end = async () => {
    setBusy(true); setErr('');
    try {
      setDone(await call.endSchoolYear({ schoolYear: sy, confirmText: typed.trim() }));
      setConfirming(false); setReload((n) => n + 1);
    } catch (e) { setErr(e.message || 'Could not end the school year.'); }
    setBusy(false);
  };

  const open = counts[sy];
  const prevOpen = counts[previous];
  return (
    <Card className="codes-tab-controls" style={{ padding: 20, marginBottom: 16 }}>
      {prevOpen && prevOpen.slips + prevOpen.links > 0 && (
        <div role="status" style={{ fontFamily: T.body, fontSize: 13, color: T.late, background: 'rgba(180,83,9,0.08)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
          SY {previous} is still open in the parent portal ({prevOpen.slips} slips, {prevOpen.links} linked accounts) — end it when you are ready.
        </div>
      )}
      <h2 style={S.h2}>End school year</h2>
      <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>
        Revokes every activation slip for the school year and ends every guardian and adviser link. Each linked account gets an inbox message asking them to use the new slip. Do this at the end of the school year, before issuing next year's slips. It cannot be undone.
      </p>
      <Field label="School year">
        <Sel value={sy} disabled={busy} onChange={(e) => { setSy(e.target.value); setDone(null); }}>
          {[schoolYear, previous].map((y) => <option key={y} value={y}>{y}</option>)}
        </Sel>
      </Field>
      <p style={{ fontFamily: T.body, fontSize: 13, color: T.ink, margin: '12px 0' }}>
        {loadErr ? 'Could not load the counts.' : open ? `${open.slips} active slips · ${open.links} active links` : 'Counting…'}
      </p>
      {done && <p role="status" style={{ fontFamily: T.body, fontSize: 13, color: T.present }}>Done: {done.codesRevoked} slips revoked, {done.linksExpired} links ended, {done.accountsNotified} accounts notified.</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Btn onClick={() => { setTyped(''); setErr(''); setDone(null); setConfirming(true); }} style={{ background: T.absent }}>End SY {sy}</Btn>
      </div>
      {confirming && (
        <Modal title={`End SY ${sy}?`} onClose={() => { if (!busy) setConfirming(false); }} dismissible={!busy}>
          <p style={{ fontFamily: T.body, fontSize: 14, color: T.ink, lineHeight: 1.6 }}>
            {open ? `${open.slips} slips will stop working and ${open.links} links will end. ` : ''}Type <strong>{sy}</strong> to confirm.
          </p>
          <Field label="School year"><Inp value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus placeholder={sy} /></Field>
          {err && <p role="alert" className="sims-feedback">{err}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Btn>
            <Btn disabled={busy || typed.trim() !== sy} onClick={end} style={{ background: T.absent }}>{busy ? 'Ending…' : `End SY ${sy}`}</Btn>
          </div>
        </Modal>
      )}
    </Card>
  );
}
```

- [ ] **Step 5: Render the card and update slip wording**

In `src/pages/guardians/CodesTab.jsx`, add the import:

```js
import EndSchoolYearCard from './EndSchoolYearCard.jsx';
```

and render it right after the closing `</Card>` of the "Issue activation slips" card (before the slips/EmptyState line):

```jsx
      <EndSchoolYearCard schoolYear={schoolYear} />
```

In the same file, update the "Issue activation slips" description `<p>` text to:

```
One slip per enrolled learner. Print them right away — codes are shown only once. Slips work for the whole school year until you end it below. Hand them to parents in person (adviser/homeroom). Learners flagged "restricted" are skipped.
```

In `src/components/ActivationSlipsPrintable.jsx`, replace the last `slip-small` div's text with:

```jsx
        <div className="slip-small">Parent/guardian: scan the QR in the BNHS Parent app or with your phone camera, or go to {portalUrl.replace(/^https?:\/\//, '')} and enter this code. Valid for SY {slip.schoolYear} until the school revokes it. Up to 2 parents/guardians + the class adviser. Keep it private. By activating you agree to the school's privacy notice for gate-scan updates.</div>
```

- [ ] **Step 6: Build and test**

Run: `npm test && npm run build`
Expected: tests PASS; build succeeds.

- [ ] **Step 7: Manual check**

Run the SIMS dev server against the emulators (`npm run emulators` in one terminal, `npm run dev` in another), sign in as staff, open Guardians → Activation slips:
- The End school year card shows counts for the current SY.
- End SY button → dialog; the confirm button stays disabled until the SY is typed exactly.
- Issue slips for a section → print preview shows the new wording with the SY; the End school year card is hidden in print preview.

- [ ] **Step 8: Commit**

```bash
git add src/lib/dates.js src/lib/dates.test.js src/data/guardians.js src/pages/guardians/EndSchoolYearCard.jsx src/pages/guardians/CodesTab.jsx src/components/ActivationSlipsPrintable.jsx
git commit -m "feat(sims): End school year card and school-year slip wording

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs

**Files:**
- Modify: `docs/parent-portal-adviser-guide.md`
- Modify: `docs/parent-portal-runbook.md` (section "School-year rollover", lines 44-49)
- Modify: `docs/parent-portal-privacy-notice.md` ("Who can see it", line 26)

- [ ] **Step 1: Adviser guide** — replace item 3 with:

```markdown
3. Tell the parent: open the portal on the slip (or tap **Scan the QR code
   on the slip** inside the app), sign in with Google or an email, agree to
   the notice; done. Up to two parents/guardians can use one slip. The slip
   works for the whole school year until the school ends it.
```

and add after item 5:

```markdown
6. **You can link too.** Each slip has one extra place reserved for the
   class adviser. Sign in to the parent portal with your **@deped.gov.ph**
   Google account, scan or type the slip's code, and choose **Adviser (class
   adviser)** as the relationship. You then see that learner's gate IN/OUT
   like a parent. With a whole section linked you can turn notifications
   off in Settings and check the Inbox instead.
```

- [ ] **Step 2: Runbook** — replace the "School-year rollover" section body with:

```markdown
## School-year rollover (end of SY, then before the first school day of the new SY)
1. At the end of the school year: Guardians → Activation slips → **End school
   year** → choose the ending SY → type it to confirm. This revokes all of that
   year's slips and ends every guardian and adviser link; each account gets an
   inbox message. Nothing ends on its own any more.
2. Settings → set the new current school year (as today).
3. Enroll learners into the new sections (as today).
4. Print ID cards **and** activation slips per section; hand out together.
   Old events remain visible for the previous school year only.
If step 1 is forgotten, the Activation slips tab shows a banner while the
previous SY still has active slips or links.
```

- [ ] **Step 3: Privacy notice** — replace the "Who can see it." sentence with:

```markdown
**Who can see it.** You; any other parent or guardian linked to the same
learner; the learner's class adviser, if they link with the school's slip
using their DepEd account; the school registrar (who manages links and
reviews reports); and the service providers that host the system (Google
Firebase, data stored in Singapore).
```

- [ ] **Step 4: Commit**

```bash
git add docs/parent-portal-adviser-guide.md docs/parent-portal-runbook.md docs/parent-portal-privacy-notice.md
git commit -m "docs: adviser slot, in-app scan, manual end of school year

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Full verification

- [ ] **Step 1: Run every suite**

Run: `npm run test:all`
Expected: all suites PASS. If the emulator can't start, run `npm test && npm --prefix functions test && npm --prefix parent test` and report the emulator suites as not run.

- [ ] **Step 2: Size budget**

Run: `npm --prefix parent run build && npm --prefix parent run size`
Expected: under 260 KB gz initial load.

- [ ] **Step 3: Stale-reference sweep**

Run: `grep -rn "90 days\|Valid 90\|up to 2 guardians\|CODE_TTL_MS\|MAX_REDEMPTIONS" src parent/src functions/src functions/index.js docs/parent-portal-*.md`
Expected: no output.

- [ ] **Step 4: Deploy note for the PR description**

Include in the PR: deploy order is `firestore:indexes` first (the four new composite indexes must finish building), then `functions`, then hosting for SIMS and the parent app. Existing printed slips keep working and gain the adviser slot.
