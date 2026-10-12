# Activation Slips Folio Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print activation slips on Folio (8.5 × 13 in) at 2 columns × 8 rows = 16 per sheet, with A4 (2 × 7 = 14) as a selectable option.

**Architecture:** All layout facts (paper sizes, rows/columns, row height, print CSS, slip wording) live in the pure module `src/lib/slipLayout.js`, which is unit-tested. `ActivationSlipsPrintable.jsx` renders slips from those helpers for a given `paper` key. `CodesTab.jsx` owns the paper choice (Folio default, remembered in `localStorage`) and shows a print-dialog hint.

**Tech Stack:** React 18 + Vite, Vitest (node environment, `src/**/*.test.js` only — no DOM/component tests), `qrcode` package.

**Spec:** `docs/superpowers/specs/2026-10-12-activation-slips-folio-layout-design.md`

## Global Constraints

- Folio: `@page { size: 8.5in 13in; margin: 8mm; }`, 2 columns × 8 rows = 16 per sheet, portrait.
- A4: `@page { size: A4 portrait; margin: 8mm; }`, 2 columns × 7 rows = 14 per sheet.
- Row height `39mm` on both papers (`grid-auto-rows`), rows must stay ≥ 2 mm shy of the printable height (Folio 314.2 mm, A4 281 mm).
- Default paper is Folio; unknown paper keys fall back to Folio.
- Cut lines: slips edge to edge, single shared `0.3mm dashed #999` lines; sheet draws top + left, each slip draws right + bottom. No border radius, no gaps.
- QR printed at `26mm` square.
- Slip instruction wording (exact): `Scan the QR or enter this code at <host>. Valid SY <schoolYear> · up to 2 parents/guardians. Keep this private. Activating means you agree to the school's privacy notice.` — `<host>` is the portal URL without `http(s)://` and without trailing slashes. The slip never mentions the adviser.
- `localStorage` key `sims.slips.paper`; every read/write in try/catch.
- No backend, parent-app, issuing, QR-link or code-format changes.
- Print is always light: keep the `paper` class on the printable root.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

- Modify `src/lib/slipLayout.js` — paper table, chunking, wording, print CSS, stored-paper read.
- Modify `src/lib/slipLayout.test.js` — tests for all of the above.
- Modify `src/components/ActivationSlipsPrintable.jsx` — `paper` prop, compact slip markup.
- Modify `src/pages/guardians/CodesTab.jsx` — paper toggle, hint, pass `paper`.

---

### Task 1: Paper-aware slip layout and compact slip rendering

**Files:**
- Modify: `src/lib/slipLayout.js` (whole file)
- Modify: `src/components/ActivationSlipsPrintable.jsx` (whole file) — it imports the removed `SLIP_PRINT_STYLES`, so it changes in the same commit to keep the build green
- Test: `src/lib/slipLayout.test.js` (whole file)

**Interfaces:**
- Consumes: nothing new.
- Produces (all named exports of `src/lib/slipLayout.js`):
  - `PAPER_SIZES: { folio: Paper, a4: Paper }` where `Paper = { key: string, label: string, pageSize: string, marginMm: number, heightMm: number, cols: number, rows: number }` (frozen)
  - `DEFAULT_PAPER: 'folio'`
  - `SLIP_ROW_MM: 39`
  - `PAPER_STORAGE_KEY: 'sims.slips.paper'`
  - `paperOf(key: string) => Paper` (unknown → Folio)
  - `chunkSlips(slips: any[], paperKey?: string) => any[][]`
  - `activationUrl(base, code)` and `formatCodeForPrint(code)` — unchanged
  - `slipInstructions(portalUrl: string, schoolYear: string) => string`
  - `slipPrintStyles(paperKey: string) => string` (CSS)
  - `readStoredPaper(storage?: Storage | null) => string` (a valid paper key; omitted → `localStorage`)
  - `SLIPS_PER_SHEET` and `SLIP_PRINT_STYLES` are **removed**.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `src/lib/slipLayout.test.js` with:

```js
import { describe, it, expect } from 'vitest';
import {
  PAPER_SIZES, DEFAULT_PAPER, SLIP_ROW_MM, PAPER_STORAGE_KEY,
  paperOf, chunkSlips, activationUrl, slipInstructions, slipPrintStyles, readStoredPaper,
} from './slipLayout.js';

const slips = (n) => Array.from({ length: n }, (_, i) => ({ studentId: `S${i}` }));

describe('slipLayout', () => {
  it('defines Folio 2x8 and A4 2x7', () => {
    expect(DEFAULT_PAPER).toBe('folio');
    expect(PAPER_SIZES.folio).toMatchObject({ pageSize: '8.5in 13in', cols: 2, rows: 8, marginMm: 8 });
    expect(PAPER_SIZES.a4).toMatchObject({ pageSize: 'A4 portrait', cols: 2, rows: 7, marginMm: 8 });
  });

  it('falls back to Folio for unknown paper keys', () => {
    expect(paperOf('letter')).toBe(PAPER_SIZES.folio);
    expect(paperOf(undefined)).toBe(PAPER_SIZES.folio);
    expect(paperOf('a4')).toBe(PAPER_SIZES.a4);
  });

  it('chunks 16 per Folio sheet by default, last sheet partial', () => {
    expect(chunkSlips(slips(35)).map((s) => s.length)).toEqual([16, 16, 3]);
    expect(chunkSlips(slips(35), 'folio').map((s) => s.length)).toEqual([16, 16, 3]);
    expect(chunkSlips([])).toEqual([]);
  });

  it('chunks 14 per A4 sheet', () => {
    expect(chunkSlips(slips(30), 'a4').map((s) => s.length)).toEqual([14, 14, 2]);
  });

  it('leaves at least a 2mm buffer below the rows on every paper', () => {
    for (const paper of Object.values(PAPER_SIZES)) {
      const printable = paper.heightMm - 2 * paper.marginMm;
      expect(paper.rows * SLIP_ROW_MM).toBeLessThanOrEqual(printable - 2);
    }
  });

  it('requests the right page size and row height in the print CSS', () => {
    const folio = slipPrintStyles('folio');
    expect(folio).toContain('size: 8.5in 13in');
    expect(folio).toContain('margin: 8mm');
    expect(folio).toContain(`grid-auto-rows: ${SLIP_ROW_MM}mm`);
    expect(slipPrintStyles('a4')).toContain('size: A4 portrait');
  });

  it('writes the compact instructions without mentioning the adviser', () => {
    const text = slipInstructions('https://bnhs-parent.web.app/', '2026-2027');
    expect(text).toBe("Scan the QR or enter this code at bnhs-parent.web.app. Valid SY 2026-2027 · up to 2 parents/guardians. Keep this private. Activating means you agree to the school's privacy notice.");
    expect(text.toLowerCase()).not.toContain('adviser');
  });

  it('reads a stored paper choice, defaulting to Folio', () => {
    const store = (v) => ({ getItem: (k) => (k === PAPER_STORAGE_KEY ? v : null) });
    expect(readStoredPaper(store('a4'))).toBe('a4');
    expect(readStoredPaper(store('folio'))).toBe('folio');
    expect(readStoredPaper(store('letter'))).toBe('folio');
    expect(readStoredPaper(store(null))).toBe('folio');
    expect(readStoredPaper({ getItem: () => { throw new Error('blocked'); } })).toBe('folio');
    expect(readStoredPaper(null)).toBe('folio');
  });

  it('builds the QR deep link without a trailing slash problem', () => {
    expect(activationUrl('https://bnhs-parent.web.app', 'K7M4P2XQ')).toBe('https://bnhs-parent.web.app/activate?c=K7M4P2XQ');
    expect(activationUrl('https://bnhs-parent.web.app/', 'K7M4P2XQ')).toBe('https://bnhs-parent.web.app/activate?c=K7M4P2XQ');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/slipLayout.test.js`
Expected: FAIL — `PAPER_SIZES` / `paperOf` / `slipInstructions` / `slipPrintStyles` / `readStoredPaper` are not exported (undefined), chunk sizes are 10.

- [ ] **Step 3: Implement**

Replace the whole of `src/lib/slipLayout.js` with:

```js
// Slips are the same size on every paper (2 columns × SLIP_ROW_MM rows);
// only the number of rows per sheet changes. Rows stay a little shy of the
// printable height for the same reason as src/pages/idCardPrintLayout.js:
// an exact fit gives print engines no rounding tolerance and produces a
// blank trailing page. Folio: 8 × 39 = 312mm of 314.2mm. A4: 7 × 39 = 273mm of 281mm.
export const SLIP_ROW_MM = 39;
export const DEFAULT_PAPER = 'folio';
export const PAPER_STORAGE_KEY = 'sims.slips.paper';

export const PAPER_SIZES = Object.freeze({
  folio: Object.freeze({ key: 'folio', label: 'Folio', pageSize: '8.5in 13in', marginMm: 8, heightMm: 330.2, cols: 2, rows: 8 }),
  a4: Object.freeze({ key: 'a4', label: 'A4', pageSize: 'A4 portrait', marginMm: 8, heightMm: 297, cols: 2, rows: 7 }),
});

export const paperOf = (key) => (Object.hasOwn(PAPER_SIZES, key ?? '') ? PAPER_SIZES[key] : PAPER_SIZES[DEFAULT_PAPER]);

// Reading localStorage can itself throw (blocked site data), so the default
// is resolved inside the try.
export function readStoredPaper(storage) {
  try { return paperOf((storage === undefined ? globalThis.localStorage : storage)?.getItem(PAPER_STORAGE_KEY)).key; }
  catch { return DEFAULT_PAPER; }
}

export function chunkSlips(slips, paperKey = DEFAULT_PAPER) {
  const { cols, rows } = paperOf(paperKey);
  const perSheet = cols * rows;
  const out = [];
  for (let i = 0; i < slips.length; i += perSheet) out.push(slips.slice(i, i + perSheet));
  return out;
}
export const activationUrl = (base, code) => `${base.replace(/\/+$/, '')}/activate?c=${code}`;
export const formatCodeForPrint = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

// The adviser's separate slot is deliberately not mentioned here; parents
// are told about it in the parent app's consent notice.
export const slipInstructions = (portalUrl, schoolYear) =>
  `Scan the QR or enter this code at ${portalUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')}. Valid SY ${schoolYear} · up to 2 parents/guardians. Keep this private. Activating means you agree to the school's privacy notice.`;

// Same print technique as src/pages/idCardPrintLayout.js: hide known chrome
// classes explicitly and collapse the app shell to a single column so print
// flows naturally, then break the page after every sheet but the last.
// Cut lines are shared: the sheet draws the top/left edge, each slip its
// right/bottom edge, so every line is printed once.
export function slipPrintStyles(paperKey) {
  const paper = paperOf(paperKey);
  return `
  .slips-sheet { display: grid; grid-template-columns: repeat(${paper.cols}, 1fr); grid-auto-rows: ${SLIP_ROW_MM}mm; border-top: 0.3mm dashed #999; border-left: 0.3mm dashed #999; }
  .slips-sheet + .slips-sheet { margin-top: 8mm; }
  .slip { box-sizing: border-box; min-width: 0; overflow: hidden; break-inside: avoid; border-right: 0.3mm dashed #999; border-bottom: 0.3mm dashed #999; padding: 3mm; display: grid; grid-template-columns: 26mm 1fr; gap: 3mm; align-items: center; font-family: Inter, system-ui, sans-serif; color: #12313A; }
  .slip-qr { width: 26mm; height: 26mm; display: block; }
  .slip-text { min-width: 0; }
  .slip-name { font-weight: 700; font-size: 11px; line-height: 1.15; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .slip-meta { font-size: 8px; color: #444; line-height: 1.2; margin-top: 0.5mm; }
  .slip-code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 18px; letter-spacing: 0.12em; font-weight: 700; line-height: 1.2; margin: 0.8mm 0; }
  .slip-note { font-size: 7.5px; color: #444; line-height: 1.2; }
  @media print {
    .app-sidebar, .app-topbar, .guardians-heading, .guardians-tabs, .codes-tab-controls { display: none !important; }
    .app-shell { grid-template-columns: 1fr !important; height: auto !important; overflow: visible !important; }
    main { padding: 0 !important; overflow: visible !important; }
    @page { size: ${paper.pageSize}; margin: ${paper.marginMm}mm; }
    .slips-sheet + .slips-sheet { margin-top: 0; }
    .slips-sheet:not(:last-child) { break-after: page; }
  }
`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/slipLayout.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Update the printable component**

There are no component tests in this repo (Vitest runs in the node environment on `*.test.js` only); the layout logic is covered by the tests above, and the component is verified by the build and the manual print check in Task 2.

The component now produces `<ActivationSlipsPrintable slips={Slip[]} portalUrl={string} paper={'folio'|'a4'} />` (default export), where `Slip = { studentId, name, sectionLabel, lrn, code, schoolYear }` (unchanged shape from `issueActivationCodes`).

Replace the whole of `src/components/ActivationSlipsPrintable.jsx` with:

```jsx
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { chunkSlips, activationUrl, formatCodeForPrint, slipInstructions, slipPrintStyles } from '../lib/slipLayout.js';

// The QR is generated at 200px and shown at 26mm so it stays sharp on paper.
function Slip({ slip, portalUrl }) {
  const [qr, setQr] = useState(null);
  const url = activationUrl(portalUrl, slip.code);
  useEffect(() => { let on = true; QRCode.toDataURL(url, { margin: 0, width: 200 }).then((u) => on && setQr(u)).catch(() => {}); return () => { on = false; }; }, [url]);
  return (
    <div className="slip">
      {qr ? <img className="slip-qr" src={qr} alt="" /> : <div className="slip-qr" />}
      <div className="slip-text">
        <div className="slip-name">{slip.name}</div>
        <div className="slip-meta">{slip.sectionLabel} · LRN {slip.lrn}</div>
        <div className="slip-code">{formatCodeForPrint(slip.code)}</div>
        <div className="slip-note">{slipInstructions(portalUrl, slip.schoolYear)}</div>
      </div>
    </div>
  );
}

export default function ActivationSlipsPrintable({ slips, portalUrl, paper }) {
  const sheets = useMemo(() => chunkSlips(slips, paper), [slips, paper]);
  return (
    <div className="slips-print-root paper">
      <style>{slipPrintStyles(paper)}</style>
      {sheets.map((sheet, i) => <div className="slips-sheet" key={i}>{sheet.map((s) => <Slip key={s.studentId} slip={s} portalUrl={portalUrl} />)}</div>)}
    </div>
  );
}
```

- [ ] **Step 6: Verify nothing else imports the removed exports**

Run: `git grep -n "SLIP_PRINT_STYLES\|SLIPS_PER_SHEET" -- src`
Expected: no output.

- [ ] **Step 7: Run tests and build**

Run: `npx vitest run src/lib/slipLayout.test.js && npm run build`
Expected: tests PASS; build completes without errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/slipLayout.js src/lib/slipLayout.test.js src/components/ActivationSlipsPrintable.jsx
git commit -m "Lay out activation slips for Folio (16/sheet) and A4 (14/sheet)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Paper toggle and print hint on the Codes tab

**Files:**
- Modify: `src/pages/guardians/CodesTab.jsx` (imports at top; state near line 23; button row at lines 45-48; printable at line 53)

**Interfaces:**
- Consumes from Task 1: `PAPER_SIZES`, `PAPER_STORAGE_KEY`, `readStoredPaper()`, and the `ActivationSlipsPrintable` `paper` prop.
- Produces: UI only.

- [ ] **Step 1: Add the import**

After the line `import ActivationSlipsPrintable from '../../components/ActivationSlipsPrintable.jsx';` add:

```jsx
import { PAPER_SIZES, PAPER_STORAGE_KEY, readStoredPaper } from '../../lib/slipLayout.js';
```

- [ ] **Step 2: Add paper state**

After the line `const [result, setResult] = useState(null);` add:

```jsx
  const [paper, setPaperState] = useState(() => readStoredPaper());
  const setPaper = (next) => {
    setPaperState(next);
    try { localStorage.setItem(PAPER_STORAGE_KEY, next); } catch { /* the paper still switches without storage */ }
  };
```

- [ ] **Step 3: Add the toggle and hint to the button row**

Replace this block:

```jsx
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', margin: '16px 0 14px' }}>
          <Btn onClick={() => action.run('issue', issue)} disabled={action.busy || busy || !sectionId}>{busy ? 'Issuing…' : 'Issue slips'}</Btn>
          <Btn variant="ghost" onClick={() => window.print()} disabled={!printReady}>Print</Btn>
        </div>
```

with:

```jsx
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '16px 0 6px' }}>
          <div role="group" aria-label="Paper" style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 'auto' }}>
            <span style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>Paper</span>
            {Object.values(PAPER_SIZES).map((p) => (
              <Btn key={p.key} variant={paper === p.key ? 'solid' : 'ghost'} aria-pressed={paper === p.key} onClick={() => setPaper(p.key)} style={{ padding: '6px 14px' }}>
                {p.label} · {p.cols * p.rows}/sheet
              </Btn>
            ))}
          </div>
          <Btn onClick={() => action.run('issue', issue)} disabled={action.busy || busy || !sectionId}>{busy ? 'Issuing…' : 'Issue slips'}</Btn>
          <Btn variant="ghost" onClick={() => window.print()} disabled={!printReady}>Print</Btn>
        </div>
        <p style={{ fontFamily: T.body, fontSize: 12, color: T.inkMuted, margin: '0 0 14px' }}>
          In the print dialog, set Paper size to {paper === 'a4' ? 'A4' : 'Folio / 8.5×13'} and Scale to 100%.
        </p>
```

- [ ] **Step 4: Pass the paper to the printable**

In the line that renders `<ActivationSlipsPrintable slips={result.slips} portalUrl={PORTAL_URL} />`, change it to:

```jsx
<ActivationSlipsPrintable slips={result.slips} portalUrl={PORTAL_URL} paper={paper} />
```

- [ ] **Step 5: Run the full unit suite and build**

Run: `npm test && npm run build`
Expected: all tests PASS; build completes without errors.

- [ ] **Step 6: Manual print check**

Start the dev server (`npm run dev`, or the project's emulator setup if issuing needs functions) and sign in as a registrar/admin. On Guardians → Codes, issue slips for a section with more than 16 learners, then open the Chrome print preview (Print button):

- Folio selected: page size 8.5 × 13 in, 16 slips per page in 2 columns × 8 rows, a single dashed line between neighbours, no blank trailing page, Codes tab controls and app chrome not printed.
- Switch to A4 (codes are **not** reissued): 14 per page in 2 × 7, same slip size.
- Reload the page: the paper toggle remembers the last choice.
- Each slip shows QR, name, section · LRN, `XXXX-XXXX` code and the 4-sentence note; nothing is clipped for normal-length names.
- Print one Folio page and scan a QR with a phone camera — it opens `<portal>/activate?c=<CODE>`.

When stopping the dev server, stop only the process you started (by its own PID/task), never all `node` processes.

- [ ] **Step 7: Commit**

```bash
git add src/pages/guardians/CodesTab.jsx
git commit -m "Add Folio/A4 paper choice to activation slip printing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
