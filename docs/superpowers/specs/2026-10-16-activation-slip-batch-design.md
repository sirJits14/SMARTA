# Activation slip batch — design

Date: 2026-10-16
Builds on: `2026-10-13-reissue-single-activation-slip-design.md` (one
learner's slip), `2026-10-12-activation-slips-folio-layout-design.md`
(slip sheets), and the ID Cards saved batch (`src/pages/idCards/SavedBatchTab.jsx`).

## Goal

Let staff issue activation slips for **chosen learners from any section**
and print them together on full sheets, the way the ID Cards saved batch
prints LRN QR cards.

Today there are two ways to get a slip:

- **Issue slips** issues one section at a time, for every enrolled learner.
- **Reissue slip** on the Learner access tab issues one learner's slip, which
  prints alone at the top of an otherwise empty sheet.

The batch covers both kinds of learner staff need it for: replacements for
lost or damaged slips, and learners who never got one (late enrollees,
transferees, section changes).

Out of scope: the slip layout itself, the code format, the parent app,
`activateCode`, section-wide issuing, single-learner reissue.

## 1. Saved batch: `slip_batch/{studentId}`

| field | type | notes |
|---|---|---|
| `addedAt` | timestamp | server time |
| `addedBy` | string | staff email |
| `reason` | string | 1–200 chars; why this learner needs a slip |

- The document id is the learner's id, so a learner is in the batch at most
  once.
- Only who was added is saved. **Codes are never stored**: they are created
  when the batch is issued and exist only on the issuing screen, as today.
- The batch is shared: every admin sees and edits the same list, live.

Rules (`firestore.rules`, beside `id_card_batch`):

```
match /slip_batch/{studentId} {
  allow read, delete: if isAdmin();
  allow create, update: if isAdmin()
    && request.resource.data.keys().hasOnly(['addedAt', 'addedBy', 'reason'])
    && request.resource.data.reason is string
    && request.resource.data.reason.size() >= 1 && request.resource.data.reason.size() <= 200;
}
```

Production runs the password-only release rules
(`docs/releases/2026-10-11-temporary-password`), not the root rules. The same
`slip_batch` match must be added to that ruleset when this ships.

Client helpers in a new `src/data/slipBatch.js`, mirroring `src/data/idCards.js`:
`addToSlipBatch(studentId, reason, me)`, `removeFromSlipBatch(studentId)`,
`clearSlipBatch(studentIds)` (chunked deletes).

### Reasons

The Saved batch screen offers a fixed list. The stored value is the label:

- Lost slip
- Damaged slip
- New enrollee / transferee
- Section changed
- Other — requires a short typed note; stored as `Other: {note}`

From the Learner access tab, the reason typed in that tab's reason field is
stored as is.

## 2. New callable: `issueSlipBatch`

```js
export async function issueSlipBatch(ctx, { schoolYear })
// → { slips, skipped: [{ studentId, reason }], remaining }
```

Exported from `functions/index.js` as `issueSlipBatchFn = adminCall(issueSlipBatch)`
and added to `call` in `src/data/guardians.js`.

Steps:

1. Validate `schoolYear` (9 chars). Rate limit `issueSlipBatch`:
   `{ windowMs: 24h, max: 100 }` per staff uid, with a reset-time message like
   `issueCodes` ("Slip batches were issued 100 times in the last 24 hours, the
   daily limit. You can issue more after {Manila date and time}.").
2. `assertYearOpen(db, schoolYear)`.
3. Read `slip_batch` ordered by `addedAt`, and take the first
   `MAX_BATCH_ISSUE = 64` (4 Folio sheets). A section of ~40 learners takes
   about 14 s today, so 64 stays well inside the 60 s callable timeout.
4. For each entry, in order:
   - `students/{id}` missing → skip `missing`
   - `activationRestricted === true` → skip `restricted`
   - `enrollments/{id}_{schoolYear}` not `enrolled` → skip `not-enrolled`
   - otherwise `issueCodeFor(db, { studentId, student, section, schoolYear, by: email, reason: entry.reason })`.
     Its `{ skipped: 'fully-linked' }` → skip `fully-linked`.
   `issueCodeFor` already revokes the learner's open code, if any, and
   pre-fills slots from active links, so the 2-guardian / 1-adviser cap holds.
5. After every entry is processed, delete the batch documents of the learners
   who got a slip, in one write batch. Skipped learners **stay in the batch**.
   If the call fails partway, nobody has left the batch; the next press
   reissues those learners (revoking the codes that were never shown).
6. One audit entry per issued learner, the same as a single reissue:
   `{ action: 'code.reissued', actorType: 'staff', actorUid: email, targetType: 'student', targetId, details: { schoolYear, reason, via: 'batch', guardianSlotsFree, adviserSlotsFree } }`.
   `logEvent('slip_batch_issued', { count, skipped })`.
7. Return the slips in print order (grade, section name, section id, males
   then females, last then first name — the same order as `sortIdCardBatch`),
   `skipped`, and `remaining` = the number of batch entries past the first
   64, which this press did not process.

## 3. Staff UI

### Issue slips tab: two sub-tabs

`src/pages/guardians/CodesTab.jsx` gets two sub-tabs, like the ID Cards page:
**By section** (today's screen, unchanged) and **Saved batch**. The chosen
sub-tab is remembered in `localStorage` (`sims.slips.tab`), guarded with
try/catch like `sims.idCards.tab`. `EndSchoolYearCard` stays under By section.

### Saved batch (`src/pages/guardians/SlipBatchTab.jsx`)

- **Add a learner:** search by name or LRN over learners enrolled this school
  year (`buildLearnerIndex` / `searchLearners`, up to 8 results), excluding
  anyone already in the batch. A reason picker (the list in §1) sits beside the
  search; **Add** on a result saves it with that reason. Other shows a note
  field, and Add is disabled until the note is filled in.
- **Sticky bar:** the slip paper toggle (`SlipPrintControls` / `useSlipPaper`,
  the stored Folio/A4 setting), a page-fill line for the chosen paper, and
  **Clear batch** (confirm) and **Issue N slips**. Above 64 learners the
  button reads **Issue first 64 slips**.
  - Page-fill line, new `slipSheetFillLabel(n, paperKey)` in
    `src/lib/slipLayout.js` (Folio 16, A4 14 per sheet):
    "12 of 16 — 4 more fills a sheet", "1 full sheet + 3 — 13 more fills the
    next sheet", "2 full sheets".
  - Issue confirms first: "Issue new slips for N learners? Their current slips
    stop working. Guardians already linked keep access."
- **The list:** learners grouped by section (grade, then section; DepEd order
  inside), each with LRN, a reason tag and **Remove**. Learners the screen
  already knows can't get a slip (no longer enrolled this year, record
  missing) are shown in a separate **Can't issue** group with the reason.
  After a press, learners the server skipped show its reason there too
  (restricted, all slots already linked).
- **After issuing:** a summary line from `issuedSummary`, extended with
  `not-enrolled` → "not enrolled this school year" and a remaining count, for
  example "14 slips issued, 1 skipped (all slots already linked) · 3 still in
  the batch". The slips render with `ActivationSlipsPrintable` in full sheets,
  and **Print** is gated by `usePrintReadiness`. As on By section, codes live
  only in component state: they are lost if the page is left before printing,
  and the learner can be added and issued again.

### Learner access tab

`src/pages/guardians/LinksTab.jsx`: beside **Reissue slip**, a new **Add to
slip batch** button saves the selected learner with the typed reason.
Disabled while busy, when the reason is empty, for a restricted learner, and
when the learner is already in the batch (then it reads "In slip batch").

### Printing

All new controls carry `slips-print-hide`, so only the slip sheets print. No
change to `slipPrintStyles` is needed.

## 4. Testing

**Functions emulator (`functions/test/emulator/slipBatch.test.js`):**
- Issues a slip per batched learner across two sections, returns them in
  print order, and empties the batch.
- Revokes a batched learner's previous open code; a learner with no code gets
  one.
- Pre-fills slots from active links; a fully linked learner is skipped
  (`fully-linked`) and stays in the batch, with the old code untouched.
- Restricted, not-enrolled and missing learners are skipped and stay in the batch.
- With 70 batched learners, issues 64 and reports `remaining: 6`; the 6 stay.
- Refuses an ended school year.
- Rate limit `issueSlipBatch` refuses with the reset-time message, independent
  of `issueCodes` and `reissueCode`.
- Writes one `code.reissued` audit entry per issued learner, with its reason
  and `via: 'batch'`.

**Rules (`tests/rules/slipBatch.test.js`):** admin can create, read and delete;
non-admin staff, guardians and kiosks are denied; extra fields, an empty
reason and a 201-character reason are denied.

**Unit:** `slipSheetFillLabel` on Folio and A4 (0, partial, exactly full, full
plus partial); `issuedSummary` with `not-enrolled` and `remaining`.

**SIMS:** existing build and tests pass. Manual check against the emulator:
add learners from two sections, issue, print preview fills Folio and A4
sheets in order.

## 5. Release notes

- Functions: `issueSlipBatchFn` only, deployed by name.
- Rules: add the `slip_batch` match to the production password-only ruleset.
- SIMS hosting: through the release tree, as the other SIMS releases.
