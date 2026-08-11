# BNHS SIMS ID Cards — 80 Cards per A4 Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print a fixed maximum of 80 learner QR cards on each portrait A4 sheet while preserving learner name, LRN, roster order, and the existing screen layout.

**Architecture:** Move the fixed print geometry, print-only CSS, and roster pagination into a focused module beside the ID Cards page. Unit tests lock the 8×10 capacity and pagination boundaries; `IDCardsPage.jsx` consumes the tested module and retains responsibility for data loading and rendering.

**Tech Stack:** React 19, Vite 8, Vitest 4, the existing `qrcode` package, and print CSS embedded through React's `<style>` element.

## Global Constraints

- Portrait A4 remains `@page { size: A4; margin: 8mm; }`, yielding a 194 mm × 281 mm printable area.
- Every physical sheet uses exactly 8 columns × 10 rows, for a fixed capacity of 80 cards.
- Use 1 mm grid gaps, approximately 23.4 mm × 27.2 mm cells, and a 16 mm square QR code.
- Printed cards retain learner name and 12-digit LRN; the section line remains hidden.
- Long learner names occupy at most two compact lines and cannot expand a row.
- The final partial sheet begins at the top-left and leaves unused positions blank without rendering placeholder cards.
- Preserve DepEd roster order, QR payloads, section selection, empty states, and `window.print()` behavior.
- Preserve the existing flexible on-screen card grid; density changes apply only under `@media print`.
- Add no dependency and change no Firebase schema, data-layer behavior, or unrelated page.

---

### Task 1: Create and test the fixed print-layout module

**Files:**
- Create: `src/pages/idCardPrintLayout.test.js`
- Create: `src/pages/idCardPrintLayout.js`

**Interfaces:**
- Produces: `ID_CARD_PRINT_LAYOUT`, a frozen object with numeric `columns`, `rows`, and `cardsPerSheet` properties.
- Produces: `chunkIdCardsIntoSheets(items)`, returning a new array of arrays containing at most 80 original items each.
- Produces: `ID_CARD_PRINT_STYLES`, the complete screen-wrapper and print-only CSS string consumed by `IDCardsPage.jsx`.

- [ ] **Step 1: Write the failing layout and pagination tests**

Create `src/pages/idCardPrintLayout.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  ID_CARD_PRINT_LAYOUT,
  ID_CARD_PRINT_STYLES,
  chunkIdCardsIntoSheets,
} from './idCardPrintLayout.js';

describe('ID card print layout', () => {
  it('defines an 8 by 10 grid with a capacity of 80 cards', () => {
    expect(ID_CARD_PRINT_LAYOUT).toEqual({
      columns: 8,
      rows: 10,
      cardsPerSheet: 80,
    });
    expect(ID_CARD_PRINT_LAYOUT.cardsPerSheet).toBe(
      ID_CARD_PRINT_LAYOUT.columns * ID_CARD_PRINT_LAYOUT.rows,
    );
  });

  it.each([
    { count: 0, sheetSizes: [] },
    { count: 79, sheetSizes: [79] },
    { count: 80, sheetSizes: [80] },
    { count: 81, sheetSizes: [80, 1] },
    { count: 160, sheetSizes: [80, 80] },
  ])('chunks $count learners into $sheetSizes', ({ count, sheetSizes }) => {
    const learners = Array.from({ length: count }, (_, id) => ({ id }));
    const sheets = chunkIdCardsIntoSheets(learners);

    expect(sheets.map((sheet) => sheet.length)).toEqual(sheetSizes);
    expect(sheets.flat()).toEqual(learners);
  });

  it('generates the fixed A4 grid and compact card sizing', () => {
    expect(ID_CARD_PRINT_STYLES).toContain('grid-template-columns: repeat(8, 1fr);');
    expect(ID_CARD_PRINT_STYLES).toContain('grid-template-rows: repeat(10, 1fr);');
    expect(ID_CARD_PRINT_STYLES).toContain('width: 194mm;');
    expect(ID_CARD_PRINT_STYLES).toContain('height: 281mm;');
    expect(ID_CARD_PRINT_STYLES).toContain('gap: 1mm;');
    expect(ID_CARD_PRINT_STYLES).toContain('width: 16mm !important;');
    expect(ID_CARD_PRINT_STYLES).toContain('-webkit-line-clamp: 2;');
    expect(ID_CARD_PRINT_STYLES).toContain('.id-card-section { display: none !important; }');
  });
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```bash
npm test -- src/pages/idCardPrintLayout.test.js
```

Expected: FAIL because `./idCardPrintLayout.js` does not exist.

- [ ] **Step 3: Implement the minimal tested print-layout module**

Create `src/pages/idCardPrintLayout.js`:

```js
const columns = 8;
const rows = 10;

export const ID_CARD_PRINT_LAYOUT = Object.freeze({
  columns,
  rows,
  cardsPerSheet: columns * rows,
});

export function chunkIdCardsIntoSheets(items) {
  const sheets = [];
  for (let index = 0; index < items.length; index += ID_CARD_PRINT_LAYOUT.cardsPerSheet) {
    sheets.push(items.slice(index, index + ID_CARD_PRINT_LAYOUT.cardsPerSheet));
  }
  return sheets;
}

export const ID_CARD_PRINT_STYLES = `
  .id-cards-sheet { display: contents; }
  @media print {
    .app-sidebar, .app-topbar, .id-cards-controls, .id-cards-heading { display: none !important; }
    .app-shell { grid-template-columns: 1fr !important; height: auto !important; overflow: visible !important; }
    main { padding: 0 !important; overflow: visible !important; }
    @page { size: A4; margin: 8mm; }
    .id-cards-grid { display: block !important; }
    .id-cards-sheet {
      display: grid !important;
      grid-template-columns: repeat(${ID_CARD_PRINT_LAYOUT.columns}, 1fr);
      grid-template-rows: repeat(${ID_CARD_PRINT_LAYOUT.rows}, 1fr);
      width: 194mm;
      height: 281mm;
      gap: 1mm;
      overflow: hidden;
    }
    .id-cards-sheet:not(:last-child) { break-after: page; }
    .id-card {
      box-sizing: border-box !important;
      min-width: 0 !important;
      min-height: 0 !important;
      overflow: hidden !important;
      padding: 1mm !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      align-items: center !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
    .id-card-qr {
      width: 16mm !important;
      height: 16mm !important;
      flex: 0 0 16mm !important;
      margin: 0 auto 0.5mm !important;
    }
    .id-card-qr span { font-size: 4pt !important; }
    .id-card-name {
      width: 100%;
      min-height: 0;
      overflow: hidden !important;
      display: -webkit-box !important;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      font-size: 5pt !important;
      line-height: 1.05 !important;
    }
    .id-card-lrn {
      font-size: 4.5pt !important;
      line-height: 1 !important;
      margin-top: 0.4mm !important;
    }
    .id-card-section { display: none !important; }
  }
`;
```

- [ ] **Step 4: Run the focused test and verify the green state**

Run:

```bash
npm test -- src/pages/idCardPrintLayout.test.js
```

Expected: PASS with all seven cases green.

- [ ] **Step 5: Commit the tested module**

```bash
git add src/pages/idCardPrintLayout.js src/pages/idCardPrintLayout.test.js
git commit -m "test: define 80-card ID print layout"
```

---

### Task 2: Connect the ID Cards page to the tested layout

**Files:**
- Modify: `src/pages/IDCardsPage.jsx:1-16`
- Modify: `src/pages/IDCardsPage.jsx:68-106`

**Interfaces:**
- Consumes: `ID_CARD_PRINT_STYLES` and `chunkIdCardsIntoSheets(items)` from `./idCardPrintLayout.js`.
- Preserves: the default `IDCardsPage({ schoolYear })` export and all existing screen/UI behavior.

- [ ] **Step 1: Replace the page-local capacity and chunk helper with imports**

After the existing component imports, add:

```js
import {
  ID_CARD_PRINT_STYLES,
  chunkIdCardsIntoSheets,
} from './idCardPrintLayout.js';
```

Delete the local declarations:

```js
const SHEET_SIZE = 20;

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
```

- [ ] **Step 2: Use the tested 80-card paginator**

Replace:

```js
const sheets = useMemo(() => chunk(roster, SHEET_SIZE), [roster]);
```

with:

```js
const sheets = useMemo(() => chunkIdCardsIntoSheets(roster), [roster]);
```

- [ ] **Step 3: Replace the inline print CSS with the tested style string**

Replace the complete existing `<style>{`...`}</style>` block with:

```jsx
<style>{ID_CARD_PRINT_STYLES}</style>
```

Do not change the `IDCard` markup, roster calculation, screen grid, controls,
or empty states.

- [ ] **Step 4: Run the focused test and production build**

Run:

```bash
npm test -- src/pages/idCardPrintLayout.test.js
npm run build
```

Expected: the focused test passes and Vite builds without import, JSX, or CSS errors.

- [ ] **Step 5: Commit the page integration**

```bash
git add src/pages/IDCardsPage.jsx
git commit -m "feat: print 80 QR cards per A4 sheet"
```

---

### Task 3: Verify regressions, layout constraints, and print readiness

**Files:**
- Verify: `src/pages/idCardPrintLayout.js`
- Verify: `src/pages/idCardPrintLayout.test.js`
- Verify: `src/pages/IDCardsPage.jsx`

**Interfaces:**
- Consumes the completed implementation from Tasks 1 and 2.
- Produces verification evidence only; no source change is expected.

- [ ] **Step 1: Run the complete automated test suite**

Run:

```bash
npm test
```

Expected: all Vitest files and cases pass with no unhandled error.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: Vite completes successfully and emits the production bundle.

- [ ] **Step 3: Run the required UI-layout detector once**

Run:

```bash
node C:/Users/jitsb/.agents/skills/impeccable/scripts/detect.mjs --json --scope layout src/pages/IDCardsPage.jsx src/pages/idCardPrintLayout.js
```

Expected: no unexplained layout finding. Investigate and resolve any finding tied to the changed print rules before completion.

- [ ] **Step 4: Inspect the final diff for scope and print invariants**

Run:

```bash
git diff HEAD~2 -- src/pages/IDCardsPage.jsx src/pages/idCardPrintLayout.js src/pages/idCardPrintLayout.test.js
```

Confirm from the diff:

- the only functional change is the fixed 80-card print layout;
- the screen grid remains `repeat(auto-fill, minmax(180px, 1fr))` with a 16 px gap;
- print pagination and CSS share the same tested 8×10 constants;
- page size remains portrait A4 with 8 mm margins;
- the section line remains hidden in print;
- no unrelated user work is included.

- [ ] **Step 5: Check browser print preview when authenticated data is available**

On the ID Cards page, select populated sections and open print preview. Verify:

1. A class of 1–79 learners produces one sheet with unused space after the final card.
2. 80 learners produce one complete 8×10 sheet.
3. 81 learners produce two sheets, with one card at the top-left of sheet two.
4. Names occupy no more than two lines, LRNs remain readable, QR codes are not clipped, and cards do not cross page boundaries.
5. A printed QR code scans to the exact 12-digit LRN at the intended printer scale.

If authenticated data is unavailable, report that print-preview and physical scan verification remain for the registrar; do not fabricate a passing result.
