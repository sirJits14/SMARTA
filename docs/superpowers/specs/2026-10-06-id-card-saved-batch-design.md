# ID Card Saved Batch — Design

Date: 2026-10-06
Status: Approved (brainstorming session)
Changes: `2026-10-05-id-card-print-queue-design.md` (the live Print queue)

## Goal

Replace the automatic Print queue with a **saved batch** that an
Administrator fills by hand over days and prints when it is worth the paper.

The use case: the remaining sections' QR cards are printed soon. Some
learners won't be enrolled yet, for example while their LRN errors are
being fixed by advisers the school won't wait for. As those learners get
enrolled, the admin searches for them one at a time, adds them to a batch
that persists, and prints the batch once it fills enough of a sheet. Cards
from different sections share one sheet, so no sheet is cut for a handful of
cards and then thrown away.

## Decisions

| Question | Decision |
|---|---|
| What to remove | Only the automatic "not yet printed" list. The printed mark (`students/{id}.idCard`) and the "Did these print correctly?" question stay. |
| Where the batch lives | Firestore, shared by all admins on any device |
| Who can be added | Learners enrolled in the selected school year only |
| Paper saving | A fill meter; Print is always allowed |
| Storage shape | One document per learner in a new `id_card_batch` collection |

## Data

New collection `id_card_batch`, with the document id being the student id:

```js
id_card_batch/{studentId}: {
  addedAt: <serverTimestamp>,
  addedBy: '<staff email>',
}
```

- **Only who was added is stored.** The card's name, LRN and section are read
  live from `students`, `enrollments` and `sections` when the page renders.
  An LRN corrected after the learner was added prints the corrected QR.
- **Add** is `setDoc` on `id_card_batch/{studentId}`. Adding the same learner
  twice is a no-op overwrite, so there are no duplicates.
- **Remove** is `deleteDoc` on that document. **Clear batch** deletes every
  document with chunked `writeBatch` deletes (at most 500 per batch).
- **After a confirmed print**, a single function marks the printed learners
  and removes them from the batch. It writes `students/{id}.idCard` (as today)
  and deletes `id_card_batch/{id}` in the same `writeBatch`, in chunks of at
  most 500 operations, so a learner is never marked without leaving the batch
  or the other way round.
- The existing printed mark is unchanged: `idCard: { printedAt, printedBy, lrn }`,
  which counts as printed when `idCard.lrn === student.lrn`.

### Rules

`firestore.rules` gains:

```
match /id_card_batch/{studentId} { allow read, write: if isAdmin(); }
```

Coordinators, kiosks, guardians and anonymous users can neither read nor
write it. The ID Cards page is already admin-only in the app
(`src/lib/access.js`).

## Batch view rules

The batch tab renders from: the `id_card_batch` documents, `students`,
`enrollments`, `sections`, and the selected school year.

1. Each batch document whose learner has an `enrolled` enrollment in the
   selected school year, with an existing section and a non-blank LRN, is
   **printable**. It is paired with that section, as `{ student, section }`.
2. Every other batch document is **not printable** and is listed separately
   as "Not enrolled — won't print". This covers a learner who was dropped,
   moved, has no LRN, or whose record or section was deleted. Each one can
   still be removed. A batch document whose student record no longer exists
   is shown by its id as "Learner record not found".
3. Printable entries use the existing print order: grade → section name →
   DepEd order (males, then females, each by last then first name).
4. The fill meter is computed from the printable count `n`, with 80 per sheet:
   - `n === 0` → no meter.
   - `n % 80 === 0` → "`n/80` full sheet(s)".
   - `n < 80` → "`n` of 80 — `80 − n` more fills a sheet".
   - Otherwise → "`⌊n/80⌋` full sheet(s) + `n % 80`" — for example
     "1 full sheet + 12 — 68 more fills the next sheet".

## UI

### Tabs

The ID Cards page keeps two tabs, and the second is renamed:

- **By section** is unchanged.
- **Saved batch** replaces "Print queue". The stored tab value stays
  `'queue'` so a remembered tab still opens it.

### Saved batch tab

- **Search.** A field labeled "Add a learner" with placeholder "Search name
  or LRN" finds learners enrolled in the selected school year, using
  `learnerMatches(query, student, { includeLrn: true })`. It shows up to 8
  results not already in the batch. Each result shows the name, LRN, the
  section label, a **Printed** tag if `isIdCardPrinted`, and an **Add**
  button. Adding clears the search box.
- **Fill meter.** One line, as in the batch view rules, shown above the list.
- **Batch list.** Printable entries are grouped by section ("Grade 7 - Rizal ·
  3"). Each row shows the name, LRN, the **Printed** tag if already printed,
  and a **Remove** button. There are no checkboxes: everything printable in
  the batch prints.
- **Not printable.** A separate group titled "Not enrolled — won't print"
  lists those learners with a Remove button each.
- **Action bar.** A sticky bar holds the fill meter text and two buttons:
  - **Clear batch** asks "Remove all N learners from the batch? Nothing is
    marked printed." and then clears it.
  - **Print** is disabled until the QR images are ready, the same as today,
    and when the batch has no printable entries.
- **Empty state.** "The batch is empty", with the hint "Search above to add
  learners whose cards still need printing."
- **Removed from today's tab:** the automatic list, the "N learners not yet
  printed" count, the missing-LRN count, the per-learner and per-section
  checkboxes, and **Mark as printed without printing**.

### After printing

The tab uses the existing confirm hook, with the copy unchanged:

- **Yes, mark as printed** marks the printed learners and removes them from
  the batch, as one write.
- **No, don't mark** keeps them in the batch.
- If the write fails, the dialog stays open with the error, and **Yes**
  retries.

Only the printable entries are printed and marked. Not-printable entries stay
in the batch.

The By section tab and the section detail modal keep their current
behavior. They mark printed only and don't touch the batch. A learner who is
in the batch and gets printed some other way shows the **Printed** tag in the
batch, so the admin can remove them.

## Code layout

| File | Change |
|---|---|
| `firestore.rules` | Adds the `id_card_batch` rule. |
| `tests/rules/idCardBatch.test.js` | **New.** Admin can read and write. Coordinator, kiosk, guardian and anonymous are denied both. |
| `src/lib/idCardQueue.js` | Adds `buildBatchView({ batchDocs, students, enrollments, sections, schoolYear })` → `{ printable, notPrintable }` and `sheetFillLabel(n)`. `buildIdCardQueue` is replaced by `enrolledEntries(...)`, a sorted list of enrolled learners with an LRN, used for search. `listQueueEntries` is removed. |
| `src/lib/idCardQueue.test.js` | Tests for the above. |
| `src/data/idCards.js` | Adds `addToIdCardBatch(studentId, me)`, `removeFromIdCardBatch(studentId)`, `clearIdCardBatch(studentIds)` and `markBatchPrinted(students, me)`. The last one marks the students and deletes their batch docs in the same chunked `writeBatch`. `markIdCardsPrinted` stays for the other two print paths. |
| `src/data/idCards.test.js` | Tests for the new functions. |
| `src/components/IdCardPrintConfirm.jsx` | Takes an optional `mark` function (default `markIdCardsPrinted`), so the batch tab can pass `markBatchPrinted`. |
| `src/pages/idCards/SavedBatchTab.jsx` | **New.** Replaces `PrintQueueTab.jsx`, which is deleted. |
| `src/pages/IDCardsPage.jsx` | Subscribes to `id_card_batch` too, renames the tab label, and renders `SavedBatchTab`. |
| `tests/browser/*` | The fixture gains `id_card_batch` documents. The queue tests are replaced with batch tests. |

## Testing

- **Unit, `buildBatchView`:**
  - An enrolled learner is printable, with their section.
  - Dropped, wrong school year, deleted section, blank LRN and missing
    student record are not printable.
  - A learner whose LRN changed after being added prints the current LRN.
  - Printable entries use the print order.
- **Unit, `sheetFillLabel`:** 0, 1, 79, 80, 81, 160 and 172.
- **Unit, data:**
  - Add writes `{ addedAt, addedBy }` to `id_card_batch/{id}`.
  - Remove deletes the document.
  - Clear chunks at 500.
  - `markBatchPrinted` writes the `idCard` merge and the batch delete for
    each learner in the same batch, and 300 learners make 2 commits
    (600 operations).
- **Rules:** as in the code layout above.
- **Browser (synthetic harness):**
  - The batch shows the fixture's batch learners grouped by section.
  - A not-enrolled batch learner appears under "Not enrolled — won't print".
  - Search shows an Add button for an enrolled learner not in the batch,
    and clicking it clears the search box. The harness stubs data writes,
    so the live list isn't checked there; unit tests cover the write.
  - The fill meter text is correct.
  - Print then "No, don't mark" closes the dialog.
  - Clear batch asks first.
- **Deploy:** this release needs `firestore:rules` and `hosting:sims`.

## Out of scope

- Adding learners who are not enrolled yet.
- Choosing a start row so cards land on a partly used sheet.
- Removing batch learners automatically when they are printed from another
  path.
- A history of batches.
