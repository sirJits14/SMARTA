# BNHS SIMS ID Cards — 80 Cards per A4 Sheet Design

**Date:** 2026-08-11
**Status:** Approved for planning

## Goal

Change the ID-card print layout from its current 20-card capacity to a fixed
capacity of 80 QR-code cards on every portrait A4 sheet. A class with fewer
than 80 learners uses the same 80-position grid and leaves the unused positions
blank. A class with more than 80 learners continues onto additional sheets.

## Scope

The change is limited to the ID Cards page and its page-local print-layout
logic. It preserves the existing section selection, roster filtering, DepEd
learner ordering, QR payload, Print button, and screen layout.

No Firebase schema, enrollment logic, QR encoding, dependency, or other page
changes are required.

## Print layout

Printing remains portrait A4 with the existing 8 mm page margins, producing a
194 mm × 281 mm printable area. Each physical page uses a fixed 8-column by
10-row grid:

- 80 card positions per sheet.
- Approximately 1 mm gaps between positions.
- Each position is approximately 23.4 mm wide by 27.2 mm tall.
- Cards use square print corners and must remain wholly inside their grid cell.
- Page breaks occur only between complete 80-position sheets.
- The last partial sheet starts at the top-left and retains blank unused grid
  positions; no placeholder card elements are printed.

The page stays in portrait orientation because it matches the current printing
workflow and provides slightly more vertical room for the QR code plus learner
labels than a landscape 10-column layout.

## Printed card content

Each printed card retains:

1. The QR code encoding the learner's LRN.
2. The learner's full name.
3. The 12-digit LRN.

The section line remains hidden in print, matching the current behavior. The QR
code is reduced to approximately 16 mm square, with compact print-only padding
and typography. The name may use at most two compact lines so long names cannot
expand a grid row; overflow is clipped within the card. The LRN remains visible
as the reliable human-readable identifier.

Screen cards retain their existing size and styling. All density changes apply
only inside `@media print`.

## Pagination and data flow

The selected section's sorted roster is divided into arrays of at most 80
learners. Each array renders as one `.id-cards-sheet`; each learner renders one
existing `IDCard`.

To make the capacity rule explicit and testable, the print-layout constants and
sheet-chunking helper will live in a small pure module. `IDCardsPage.jsx` will
use the same constants for both roster pagination and CSS grid dimensions. This
prevents the DOM page size and CSS capacity from drifting apart.

## Edge cases

- 0 learners: preserve the existing empty state and print no sheet.
- 1–79 learners: print one 8×10 sheet with only the populated positions shown.
- 80 learners: print exactly one full sheet.
- 81–159 learners: print two sheets, with the second beginning at the top-left.
- Long learner names: constrain to two lines and clip overflow inside the cell;
  never increase row height or spill onto another page.
- QR generation failure: retain the existing unavailable state, scaled to the
  same print footprint as a QR image.

## Testing and verification

Implementation will follow test-first development:

1. Add a failing unit test asserting that the fixed capacity is 80 and equals
   the configured 8 columns × 10 rows.
2. Add failing tests for roster chunking at 79, 80, 81, and 160 learners.
3. Implement the pure print-layout module and connect the page to it.
4. Run the focused tests, the complete test suite, and the production build.
5. Inspect the final source and print CSS for A4 dimensions, page breaks,
   overflow containment, and unchanged screen styling.
6. Run the Impeccable layout detector on the changed UI file.

Browser print preview is the final visual check when an authenticated section
with learner data is available. It should confirm 80 positions per A4 page,
legible names and LRNs, scannable QR codes, and no clipping or unexpected extra
pages.

## Non-goals

- A selectable print-density control.
- Landscape printing.
- QR-only cards.
- Printing empty placeholder cards.
- Changing the QR payload or learner roster order.
- Redesigning the on-screen ID-card interface.
