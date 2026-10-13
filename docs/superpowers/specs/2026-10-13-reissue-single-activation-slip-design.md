# Reissue one learner's activation slip — design

Date: 2026-10-13
Builds on: `2026-09-21-parent-guardian-portal-design.md` (activation slips),
`2026-09-30-parent-qr-scan-adviser-slot-design.md` (2 guardians + 1 adviser per slip)

## Goal

Let staff replace a lost or damaged activation slip for **one learner**
without reissuing the whole section.

Today the only way to get a printable slip is **Issue slips** on the Codes
tab, which issues a new code for every enrolled learner of a section and
revokes each one's previous open code. Every unused slip already handed to
the other parents of that section stops working. The Links tab can **Revoke
slip** for one learner, but cannot issue a replacement.

A second problem this fixes: a new code always starts with 2 free guardian
slots and 1 free adviser slot, regardless of who already linked through the
old slip. Reissuing therefore lets more than 2 guardians link to a learner.

Out of scope: the slip print layout, code format, QR deep link, the parent
app, `activateCode`, access requests.

## 1. Slots from existing links

New pure helper in `functions/src/lib/codeSlots.js`:

```js
// Slots for a new code, counting the learner's links that are already active
// for this school year, so reissuing never raises the 2-guardian limit.
export function slotsFromLinks(links, schoolYear)
// → { guardianRedemptions, maxGuardians, adviserRedemptions, maxAdvisers, status }
```

- Counts links with `status === 'active'` and `schoolYear === schoolYear`.
  Revoked, expired and other-school-year links are ignored.
- A link's slot is `link.slot ?? 'guardian'` (links made before the adviser
  slot existed have no `slot`). Links made through approved access requests
  count too: what matters is who can see the learner, not how they got in.
- Used counts are capped at the max (`Math.min`), so a learner who somehow
  has 3 active guardian links stores `guardianRedemptions: 2`.
- `maxGuardians: MAX_GUARDIANS`, `maxAdvisers: MAX_ADVISERS`.
- `status` is `'exhausted'` when both kinds are full, otherwise `'issued'`
  (the same rule as `claimSlot`).

Pre-filling the used counts means `readSlots`, `claimSlot` and
`activateCode` work unchanged. A guardian who is already linked and enters
the new code takes the existing "already active" path and uses no slot.

`codes.js` stops importing `newCodeSlots()`; it stays exported because
`codeSlots.test.js` builds fixtures with it.

## 2. Shared issuing helper

New internal function in `functions/src/handlers/codes.js`:

```js
// Issues one learner's code. Returns { slip, slotsFree } or { skipped: 'fully-linked' }.
async function issueCodeFor(db, { studentId, student, section, schoolYear, by, reason })
```

1. Read the learner's active links:
   `guardian_links where studentId == studentId where status == 'active'`
   (this query already exists in `links.js` and `scanEvent.js`; no new
   index), then call `slotsFromLinks(docs, schoolYear)`.
2. If the slots come back `exhausted`, return `{ skipped: 'fully-linked' }`.
   The learner's current code is **not** revoked: it has no free slot, so
   it changes nothing for the parents.
3. Otherwise `revokeOpenCodes(db, studentId, schoolYear, by, reason)`, then
   write `activation_codes/{hashCode(code)}` with
   `{ studentId, schoolYear, issuedAt, issuedBy: by, ...slots }` (`status`
   comes from the slots).
4. Return `{ slip: { studentId, name, lrn, sectionLabel, schoolYear, code },
   slotsFree: { guardian: maxGuardians - guardianRedemptions, adviser: maxAdvisers - adviserRedemptions } }`.
   `slip` has the same shape `issueActivationCodes` returns today, and the
   section-wide call ignores `slotsFree`.

The raw code is returned once and never stored, as today.

## 3. Section-wide issuing

`issueActivationCodes` keeps its inputs, rate limit (`issueCodes`, 20/day),
missing/restricted checks and audit entry. For each enrolled learner it calls
`issueCodeFor(..., { by: email, reason: 'reissued' })`. A `{ skipped }` result
goes into `skipped` as `{ studentId, reason: 'fully-linked' }`.

## 4. New callable: `reissueActivationCode`

```js
export async function reissueActivationCode(ctx, { studentId, schoolYear, reason })
// → { slip, slotsFree: { guardian, adviser } }
```

Exported from `functions/index.js` as
`reissueActivationCodeFn = adminCall(reissueActivationCode)`, beside
`issueActivationCodesFn` and `revokeCodeFn`. Added to `call` in
`src/data/guardians.js`.

Checks, in order:

| check | error code | message |
|---|---|---|
| `studentId` 1–64 chars, `schoolYear` 9 chars, `reason` 1–200 chars after trim | `invalid-argument` | from the validators |
| rate limit `reissueCode` | `resource-exhausted` | the existing rate-limit message |
| `students/{studentId}` exists | `not-found` | `Learner not found` |
| `activationRestricted !== true` | `failed-precondition` | `This learner is restricted. Lift the restriction first.` |
| `enrollments/{studentId}_{schoolYear}` has `status: 'enrolled'` | `failed-precondition` | `This learner is not enrolled for {schoolYear}.` |
| `issueCodeFor` did not return `skipped` | `failed-precondition` | `All guardian and adviser slots are linked. Revoke a link first.` |

The section comes from the enrollment's `sectionId`, for the slip's section
label.

New limit in `functions/src/callable.js`:
`reissueCode: { windowMs: 24 * 60 * 60 * 1000, max: 60 }`, per staff uid. It
is separate from `issueCodes` so replacing lost slips doesn't use up the
section-wide budget.

On success, an audit entry:
`{ action: 'code.reissued', actorType: 'staff', actorUid: email, targetType: 'student', targetId: studentId, details: { schoolYear, reason, guardianSlotsFree, adviserSlotsFree } }`,
and `logEvent('code_reissued', { studentId })`. Nothing is audited when the
call fails.

Concurrency: two reissues for the same learner at the same instant could
both write a code. This is the same exposure the section-wide issue has
today, and it's acceptable for a staff-only action; no transaction.

## 5. Staff UI: Links tab

In `src/pages/guardians/LinksTab.jsx`, the selected learner's card gets a
**Reissue slip** button next to **Revoke slip**:

- Disabled while `action.busy`, when the reason field is empty, or when the
  learner is restricted. Same reason field as Revoke slip.
- On click: `window.confirm('Issue a new slip for {fullName}? Their current
  slip stops working. Guardians already linked keep access.')`, then
  `call.reissueActivationCode({ studentId, schoolYear, reason })` through
  `action.run`, so errors show in `ActionFeedback` as they do for the other
  buttons.
- On success, a panel under the card shows:
  "New slip ready: {g} guardian / {a} adviser slot(s) free. Print it now — the
  code is shown only once." The counts are the callable's `slotsFree`. Then
  the paper toggle, the print hint and a **Print**
  button, laid out like the Codes tab.
- The slip is rendered with `ActivationSlipsPrintable` (`slips={[slip]}`), so
  it prints as one slip at the top-left of the sheet. Paper uses the same
  stored preference (`readStoredPaper`, `PAPER_STORAGE_KEY`). Print is gated
  by `usePrintReadiness`.
- The reissued slip lives only in component state. It is cleared when staff
  pick another learner.

The paper toggle and print hint are currently inline in `CodesTab.jsx`.
Move them into a small `SlipPrintControls` component (paper buttons, print
hint, Print button) used by both tabs, so the two don't drift apart.

## 6. Staff UI: Codes tab

The result line names skip reasons in plain words instead of raw keys:
`restricted` → "restricted", `missing` → "learner record missing",
`fully-linked` → "all slots already linked". Example:
"28 slips issued, 2 skipped (all slots already linked)."

## 7. Testing

**Unit (`functions/src/lib/codeSlots.test.js`, `slotsFromLinks`):**
no links → 0/2, 0/1, `issued`; one guardian; two guardians → guardian full,
still `issued`; two guardians + adviser → `exhausted`; revoked, expired and
other-school-year links ignored; a link with no `slot` counts as guardian;
three active guardian links cap at 2.

**Emulator (`functions/test/emulator/codes.test.js`):**
- `reissueActivationCode` revokes only that learner's open code; a sibling's
  slip in the same section stays `issued` and still activates.
- With one active guardian link, the new code stores
  `guardianRedemptions: 1`; one more guardian activates, a third is refused.
- The already-linked guardian can enter the new code without using a slot.
- Refuses when every slot is linked, and the old code stays as it was.
- Refuses a restricted learner, a learner not enrolled for the school year,
  an unknown learner, and an empty reason.
- Writes the `code.reissued` audit entry with reason and free slots.
- Enforces the `reissueCode` limit independently of `issueCodes`.
- `issueActivationCodes` skips a fully linked learner with reason
  `fully-linked`, leaves its code alone, and pre-fills slots for a partly
  linked learner.

**SIMS:** existing build and tests pass. Manual check against the emulator:
reissue from the Links tab, print preview shows one slip on Folio and A4.
