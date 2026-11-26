import { describe, expect, it } from 'vitest';
import {
  ID_CARD_PRINT_LAYOUT,
  ID_CARD_PRINT_STYLES,
  chunkIdCardsIntoSheets,
  sheetUsesAllRows,
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
    expect(ID_CARD_PRINT_STYLES).toContain('grid-auto-rows: 27mm;');
    expect(ID_CARD_PRINT_STYLES).toContain('width: 194mm;');
    expect(ID_CARD_PRINT_STYLES).toContain('gap: 0;');
    expect(ID_CARD_PRINT_STYLES).toContain('width: 16mm !important;');
    expect(ID_CARD_PRINT_STYLES).toMatch(
      /\.id-card-qr\s*\{[^}]*box-sizing: border-box !important;/s,
    );
    expect(ID_CARD_PRINT_STYLES).toContain('-webkit-line-clamp: 2;');
    // Printed cards show only the QR, name and LRN; the section line is screen-only.
    expect(ID_CARD_PRINT_STYLES).toContain('.id-card-section { display: none !important; }');
  });

  it('never reserves a fixed full-page height for the sheet, so a partial roster does not overflow onto a spurious blank page', () => {
    const sheetRuleMatch = ID_CARD_PRINT_STYLES.match(/\.id-cards-sheet\s*\{\s*display: grid[^}]*\}/s);
    expect(sheetRuleMatch).not.toBeNull();
    expect(sheetRuleMatch[0]).not.toMatch(/height:\s*281mm/);
    expect(sheetRuleMatch[0]).not.toMatch(/grid-template-rows/);

    // A full 10-row sheet must still fit within the 281mm printable area
    // (297mm A4 minus 8mm top/bottom @page margins), with a safety buffer
    // so print engines don't round a flush-to-the-edge box onto a new page.
    const rowHeightMatch = sheetRuleMatch[0].match(/grid-auto-rows:\s*([\d.]+)mm/);
    expect(rowHeightMatch).not.toBeNull();
    const rowHeightMm = Number(rowHeightMatch[1]);
    const gapMatch = sheetRuleMatch[0].match(/gap:\s*([\d.]+)(?:mm)?;/);
    expect(gapMatch).not.toBeNull();
    const fullSheetHeightMm = rowHeightMm * ID_CARD_PRINT_LAYOUT.rows + Number(gapMatch[1]) * (ID_CARD_PRINT_LAYOUT.rows - 1);
    expect(fullSheetHeightMm).toBeLessThan(281);
  });

  it('reveals the print-only wrapper only under @media print, and hides the section-detail modal overlay when printing', () => {
    expect(ID_CARD_PRINT_STYLES).toMatch(/\.id-cards-print-only\s*\{\s*display:\s*none\s*!important;\s*\}/);
    expect(ID_CARD_PRINT_STYLES).toContain('.id-cards-print-only { display: block !important; }');
    expect(ID_CARD_PRINT_STYLES).toMatch(
      /\.app-sidebar,\s*\.app-topbar,\s*\.id-cards-controls,\s*\.id-cards-heading,\s*\.section-detail-modal-overlay,\s*\.sections-page-chrome\s*\{\s*display:\s*none\s*!important;\s*\}/,
    );
  });
});

describe('section-coded ID card sheets', () => {
  const codedRule = ID_CARD_PRINT_STYLES.match(/\.id-cards-sheet\.section-coded\s*\{[^}]*\}/s)?.[0];

  const fullRule = ID_CARD_PRINT_STYLES.match(/\.id-cards-sheet\.section-coded\.sheet-full\s*\{[^}]*\}/s)?.[0];
  const legendRule = ID_CARD_PRINT_STYLES.match(/\.id-cards-legend\s*\{\s*grid-column[^}]*\}/s)?.[0];

  it('sizes the color key to its content and never clips it', () => {
    expect(codedRule).toMatch(/grid-template-rows:\s*auto;/);
    expect(legendRule).toBeDefined();
    expect(legendRule).not.toMatch(/overflow:\s*hidden/);
    expect(legendRule).not.toMatch(/align-content:\s*center/);
  });

  it('keeps 26.4mm card rows on a sheet that does not reach the last row, so the usual key leaves 270mm', () => {
    const rowMm = Number(codedRule.match(/grid-auto-rows:\s*([\d.]+)mm/)[1]);
    expect(6 + rowMm * ID_CARD_PRINT_LAYOUT.rows).toBeCloseTo(270, 5);
  });

  it('holds a full 10-row sheet at 270mm, under the 281mm printable height, and lets the rows share what the key leaves', () => {
    expect(fullRule).toBeDefined();
    const heightMm = Number(fullRule.match(/height:\s*([\d.]+)mm/)[1]);
    expect(heightMm).toBe(270);
    expect(heightMm).toBeLessThan(281);
    expect(fullRule).toMatch(/grid-auto-rows:\s*minmax\(0, 1fr\);/);
  });

  it.each([[1, false], [72, false], [73, true], [80, true]])('a sheet of %i cards uses all rows: %s', (count, full) => {
    expect(sheetUsesAllRows(count)).toBe(full);
  });

  it('gives every card its own full 0.5mm dashed frame in the faint section shade, printed exactly', () => {
    expect(ID_CARD_PRINT_STYLES).toMatch(
      /\.id-cards-sheet\.section-coded \.id-card\s*\{[^}]*border: 0\.5mm dashed var\(--section-border\) !important;[^}]*print-color-adjust: exact;/s,
    );
  });

  it('keeps the key swatches solid in the stronger section shade', () => {
    expect(ID_CARD_PRINT_STYLES).toMatch(/\.id-cards-legend-swatch \{[^}]*border: [\d.]+mm solid var\(--section-color\);/);
  });

  it('keeps the color key off screen', () => {
    expect(ID_CARD_PRINT_STYLES).toMatch(/^\s*\.id-cards-legend \{ display: none; \}/m);
  });
});
