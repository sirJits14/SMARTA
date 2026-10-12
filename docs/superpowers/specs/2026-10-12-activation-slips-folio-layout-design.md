# Activation slips: Folio print layout — design

Date: 2026-10-12
Builds on: `2026-09-21-parent-guardian-portal-design.md` (activation slips),
`2026-09-30-parent-qr-scan-adviser-slot-design.md` (2 guardians + 1 adviser per slip)

## Goal

Print activation slips on **Folio paper (8.5 × 13 in)**, **2 columns × 8 rows
= 16 slips per sheet**, portrait. A4 stays available as an option.

Today (`src/lib/slipLayout.js`): A4 portrait, 2 columns × 5 rows = 10 per
sheet, 8 mm gaps, each slip with its own dashed border, a 96 px QR and a
5-sentence instruction paragraph at 9 px.

Out of scope: issuing, the QR deep link, code format, the code slots, the
backend, the parent app.

## 1. Paper sizes

`src/lib/slipLayout.js` exports a frozen `PAPER_SIZES` table and
`DEFAULT_PAPER = 'folio'`:

| key     | label                  | `@page size`    | margin | cols × rows | per sheet |
|---------|------------------------|-----------------|--------|-------------|-----------|
| `folio` | Folio (8.5 × 13 in)    | `8.5in 13in`    | 8 mm   | 2 × 8       | 16        |
| `a4`    | A4                     | `A4 portrait`   | 8 mm   | 2 × 7       | 14        |

Both papers use the **same slip size**: a **39 mm** row height, full width
of the printable area split into 2 columns (Folio ≈ 100 mm, A4 = 97 mm per
slip). A4 gets 7 rows (not 6) because 7 × 39 mm fits; slips are identical on
either paper and only the count per sheet changes.

**Page-fit buffer.** Rows are deliberately shy of an exact fit, the same
technique as `src/pages/idCardPrintLayout.js` (an exact fit leaves print
engines no rounding tolerance and produces a blank trailing page):

- Folio: 330.2 − 16 = 314.2 mm printable; 8 × 39 = 312 mm → 2.2 mm buffer.
- A4: 297 − 16 = 281 mm printable; 7 × 39 = 273 mm → 8 mm buffer.

Rows use `grid-auto-rows: 39mm`, so a partial last sheet only takes the rows
it needs.

## 2. Cut lines

Slips touch edge to edge (no gap). Cut guides are **single shared dashed
lines**: every slip draws a dashed right and bottom border, the sheet draws a
dashed top and left border, so each internal line is drawn once and the
outer edge is a trim guide. 0.3 mm `#999` dashed. No border radius. A Folio
sheet is cut with 1 vertical + 7 horizontal straight cuts.

## 3. Slip contents

QR on the left (**26 mm** square), text on the right, inner padding 3 mm,
vertically centred:

1. Learner name — bold, ~11 px; clamped to 2 lines.
2. `<section> · LRN <lrn>` — ~8 px.
3. Code `XXXX-XXXX` — monospace, ~18 px, bold, letter-spaced.
4. Instructions — ~7.5–8 px, `line-height` 1.2:

> Scan the QR or enter this code at `<portal host>`. Valid SY `<schoolYear>` ·
> up to 2 parents/guardians. Keep this private. Activating means you agree
> to the school's privacy notice.

`<portal host>` is the portal URL with the scheme stripped (as today).

**The adviser is not mentioned on the slip.** Each code still has a separate
class-adviser slot (`functions/src/lib/codeSlots.js`: `MAX_GUARDIANS = 2`,
`MAX_ADVISERS = 1`; adviser must sign in with `@deped.gov.ph`). Parents are
told about the adviser in the consent notice they accept in the parent app
(`parent/src/strings.js` `consentBody1`). No backend or parent-app change.

The text block is wrapped so nothing spills past the slip
(`overflow: hidden` on the slip); the 2-line name clamp is the only content
that can be cut, and only for extremely long names.

## 4. Codes tab

`src/pages/guardians/CodesTab.jsx`, inside the `codes-tab-controls` card
(hidden when printing):

- A **Paper** toggle — two buttons, `Folio` and `A4`, with `aria-pressed`;
  default Folio. The choice is remembered per browser in `localStorage`
  (key `bnhs.slips.paper`, wrapped in try/catch, falling back to Folio) since
  an office prints on the same paper every time.
- A one-line hint under the buttons: *"In the print dialog, set Paper size to
  Folio / 8.5×13 (or A4) and Scale to 100%."* The hint names the selected
  paper.
- `ActivationSlipsPrintable` receives `paper` and re-chunks when it changes.
  Switching paper does not reissue codes.

## 5. Code structure

- `src/lib/slipLayout.js`
  - `PAPER_SIZES`, `DEFAULT_PAPER`, `SLIP_ROW_MM = 39`.
  - `paperOf(key)` → the entry, falling back to Folio for unknown keys.
  - `chunkSlips(slips, paperKey = DEFAULT_PAPER)` → sheets of
    `cols × rows`.
  - `slipPrintStyles(paperKey)` → CSS string (replaces the fixed
    `SLIP_PRINT_STYLES`): screen preview grid, slip styles, and the
    `@media print` block with the paper's `@page` size/margin and
    `break-after: page` between sheets. Chrome hiding is unchanged.
  - `slipInstructions(portalUrl, schoolYear)` → the instruction sentence
    (pure, testable).
  - `SLIPS_PER_SHEET` is removed (its only consumer is the test).
- `src/components/ActivationSlipsPrintable.jsx` — takes `paper`; QR
  rendered at a higher pixel width (e.g. 200) and sized to 26 mm in CSS so
  it prints sharp; uses `slipInstructions`.
- `src/pages/guardians/CodesTab.jsx` — paper state, toggle, hint.

## 6. Testing

`src/lib/slipLayout.test.js`:

- 16 per Folio sheet (`[16, 16, 3]` for 35 slips), 14 per A4 sheet; default
  is Folio; unknown key falls back to Folio; empty → `[]`.
- `slipPrintStyles('folio')` contains `size: 8.5in 13in`;
  `slipPrintStyles('a4')` contains `size: A4`.
- For every paper: `rows × SLIP_ROW_MM` ≤ printable height − 2 mm.
- `slipInstructions` includes the host without scheme, the school year,
  "2 parents/guardians", "Keep this private", "privacy notice", and does not
  mention "adviser".
- Existing `activationUrl` test unchanged.

Manual check: issue slips for a section, print preview in Chrome on Folio
and A4 — 16 / 14 per page, no blank trailing page, QR scans from paper.
