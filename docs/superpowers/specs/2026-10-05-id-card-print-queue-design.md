# ID Card Print Queue — Design

Date: 2026-10-05
Status: Approved (brainstorming session)

## Goal

Let an Administrator print QR ID cards for any mix of learners in one batch:
every learner who has not had a card printed yet, from all sections, plus any
specific learners added by hand (for example, a reprint for a lost card).
Cards from different sections share the same 80-per-A4 sheets instead of
each section starting its own partial sheet.

Today the ID Cards page and the section detail modal print one whole section
at a time, and nothing records whether a learner's card has been printed.

## Decisions

| Question | Decision |
|---|---|
| What "no QR code yet" means | Not yet printed, tracked by a mark on the learner |
| When the mark is set | After the print dialog closes, the user confirms the cards printed correctly |
| How a batch is built | A queue of every unprinted enrolled learner (pre-ticked), plus search to add anyone |
| Sheet layout | Grouped by grade → section → DepEd order; each card prints a small section line |
| Existing learners at launch | Bulk "Mark as printed without printing" on the queue |
| Does the mark reset each school year | No, it is kept forever |
| Placement | New "Print queue" tab on the ID Cards page; every admin print asks to mark |

## Data

A new optional field on `students/{id}`:

```js
idCard: {
  printedAt: <serverTimestamp>,
  printedBy: '<staff email>',
  lrn: '<the LRN encoded in the printed QR>',
}
```

- A learner **counts as printed** when `idCard.printedAt` is set **and**
  `idCard.lrn === student.lrn`. If the LRN is corrected later, the printed
  QR is wrong, so the learner goes back into the queue with no extra work.
- Marking a batch overwrites `idCard` on each learner (reprints update it).
- Writes use `writeBatch` with `{ merge: true }`, in chunks of 500
  (Firestore's per-batch limit), like `src/data/studentImport.js`.
- **No rules change.** `students` writes are already admin-only
  (`firestore.rules`), and every existing student write path
  (`updateStudent`, `saveStudentWithEnrollment`, student import) uses merge,
  so editing or re-importing a learner keeps `idCard`.
- No new index. The ID Cards page already subscribes to `students`,
  `enrollments`, and `sections`, so the queue is computed in the client.

## Queue rules

For the school year selected in the app:

1. Start from enrollments with `status === 'enrolled'` for that school year.
   Each one gives a learner and their section.
2. A learner is **in the queue** if they are not printed (see Data).
3. Learners without an LRN are left out of the queue and of any batch (the
   QR encodes the LRN). The queue shows a count: "N learners have no LRN and
   can't be printed."
4. Learners added by search may already be printed. They join the batch and
   show a "Reprint" tag. Search covers enrolled learners of the selected school
   year only, so every card has a section to show.
5. Batch order: grade level ascending → section name → `depedSort` within the
   section (the same order the section print uses today).

## UI

### ID Cards page tabs

`IDCardsPage` gets two tabs, and it remembers the last one used in
`localStorage` (wrapped in try/catch):

- **By section** shows today's view, unchanged except for the confirm step
  after printing.
- **Print queue** is the new view.

The page now receives `me` from `App.jsx`, for `printedBy`.

### Print queue tab

- **Header line:** "**N** learners not yet printed".
- **Search box:** finds enrolled learners by name or LRN (reusing
  `learnerMatches(query, student, { includeLrn: true })` from `src/lib/search.js`), and a result can be added to the batch.
  Learners added by hand appear in their own section group with a "Reprint"
  tag if already printed, and can be removed.
- **Grouped list:** one group per section ("Grade 7 - Rizal · 4 of 5"),
  with a group checkbox (all / none) and a checkbox per learner. Queue
  learners start ticked.
- **Sticky action bar:** "**N** cards · **M** sheets" (M = ceil(N / 80)), with
  two actions:
  - **Print** is disabled until QR images are ready (`usePrintReadiness`), as
    the section print is today.
  - **Mark as printed without printing** asks first ("Mark N learners as
    printed? They will leave the queue."), then marks them. This is the
    one-time cleanup for sections already printed before this feature, and is
    available later too.
- **Empty state:** "Every enrolled learner has a printed card", with a hint to
  use search for reprints.

### Printed sheet

- It uses the same 8 × 10 grid on A4 (`idCardPrintLayout.js`) and fills
  sheets continuously across sections, with no break between sections.
- Each card now prints a compact section line under the LRN, e.g.
  `7 · Rizal` (adding ` · STEM` when the section has a strand). This applies
  to every ID card print (section tab, modal, and queue), so all cards look
  the same. The line is one row, clipped with an ellipsis, at ~4pt. The name
  keeps its two-line clamp, and the QR stays 16 mm.
- The print must still fit the 27 mm row with the existing 2 mm buffer that
  prevents a blank trailing page. If the extra line does not fit, the QR
  shrinks to 15 mm rather than changing the row height.

### Confirm after printing

The new `PrintConfirmDialog` is shared by all three admin print buttons:

1. The Print button calls `window.print()`.
2. When it returns (the print dialog has closed), the dialog opens:
   "Did these **N** cards print correctly?"
   - **Yes, mark as printed** writes `idCard` for every learner in the
     batch, then closes. The queue updates live via the existing
     subscription.
   - **No, don't mark** closes with no change.
3. If the write fails, the dialog stays open with the error message and a
   **Try again** button. Nothing is marked, so the learners stay in the queue.

The section detail modal (`SectionsPage` → `SectionDetailModal`) shows this
dialog only for admins (`isAdmin(me)`). Coordinators can still print from the
modal, but they cannot write `students`, so their prints never mark anyone and
no dialog appears.

## Code layout

| File | Change |
|---|---|
| `src/lib/idCardQueue.js` | **New.** Pure functions: `isIdCardPrinted(student)`, `buildIdCardQueue({ students, enrollments, sections, schoolYear })`, and `sortIdCardBatch(entries)`, where each entry is `{ student, section }`. |
| `src/lib/idCardQueue.test.js` | **New.** Unit tests (see Testing). |
| `src/data/idCards.js` | **New.** `markIdCardsPrinted(students, me)` uses chunked `writeBatch` merges. |
| `src/pages/idCards/PrintQueueTab.jsx` | **New.** The queue tab UI. |
| `src/components/PrintConfirmDialog.jsx` | **New.** The shared confirm dialog, built on the existing `Modal`. |
| `src/components/IdCardsPrintable.jsx` | Takes `entries` (`{ student, section }[]`) so each card shows its own section. The section path passes its roster mapped to entries. |
| `src/pages/idCardPrintLayout.js` | Shows the section line in print and adds compact styles for it. |
| `src/pages/IDCardsPage.jsx` | Adds the tabs, accepts `me`, and runs the confirm step after a section print. |
| `src/pages/SectionsPage.jsx`, `SectionDetailModal.jsx` | Run the confirm step after printing, for admins only. |
| `src/App.jsx` | Passes `me` to `IDCardsPage`. |

## Testing

- **Unit (`idCardQueue.test.js`):**
  - Never printed → in queue.
  - Printed with the same LRN → not in queue.
  - Printed with a different LRN → in queue.
  - Not enrolled, or enrolled in a different school year → not in queue.
  - Dropped or transferred enrollment status → not in queue.
  - No LRN → excluded and counted.
  - Mixed sections sort by grade → section name → DepEd order.
- **Layout (`idCardPrintLayout.test.js`):** the section-line styles exist and
  the row height and 80-per-sheet constants are unchanged.
- **Browser check:**
  - With learners unprinted in two sections, the queue shows both. Printing
    puts them on shared sheets with section lines, and confirming removes them
    from the queue.
  - "No, don't mark" leaves them in the queue.
  - "Mark as printed without printing" empties a section from the queue.
  - A coordinator printing from the section modal sees no confirm dialog.

## Out of scope

- A history or audit log of print batches (only the last print is kept, in
  `idCard`).
- Resetting the mark per school year.
- Changing what the QR encodes or the card's size.
