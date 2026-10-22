# Import preview: error navigation

## Problem
The Import-from-Excel preview (`src/pages/ImportStudentsWizard.jsx`) lists every
row (hundreds). Rows with errors are skipped on import but are buried in the
list, so the admin cannot find what to fix in the spreadsheet.

## Design
- The "N error(s) skipped" part of the summary line becomes a red button (only
  when `errorCount > 0`). Clicking it sets the filter to **Errors** and focuses
  the first error row.
- A chip row under the summary: **All · New · Updates · Errors**, each with a
  count, `aria-pressed` for the active one, disabled at count 0. Default: All.
- When errors exist, **Previous error / Next error** buttons and an
  "Error i of n" label sit beside the chips. They wrap around, scroll the error
  row into view inside the table's scroll container, move focus to it and mark
  it as the current error.
- Error rows have a red-tinted background; the current error is stronger. The
  Detail cell shows the full message in red, the Row column stays the Excel row
  number.
- Filtering is view-only. The Import button, counts and committed plan are
  unchanged (errors are still skipped).
- Empty filtered list shows a "No rows match" row.

## Structure
- `src/lib/importPreview.js` (pure): `filterResults(results, filter)`,
  `countByKind(results)`, `stepIndex(current, total, dir)`.
- `ImportStudentsWizard.jsx` owns filter + current-error state and refs.
- Tests: `src/lib/importPreview.test.js` (repo has no component-test setup);
  UI verified in the browser.
