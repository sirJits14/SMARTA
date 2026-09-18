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
    expect(ID_CARD_PRINT_STYLES).toContain('grid-auto-rows: 27mm;');
    expect(ID_CARD_PRINT_STYLES).toContain('width: 194mm;');
    expect(ID_CARD_PRINT_STYLES).toContain('gap: 1mm;');
    expect(ID_CARD_PRINT_STYLES).toContain('width: 16mm !important;');
    expect(ID_CARD_PRINT_STYLES).toMatch(
      /\.id-card-qr\s*\{[^}]*box-sizing: border-box !important;/s,
    );
    expect(ID_CARD_PRINT_STYLES).toContain('-webkit-line-clamp: 2;');
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
    const fullSheetHeightMm = rowHeightMm * ID_CARD_PRINT_LAYOUT.rows + 1 * (ID_CARD_PRINT_LAYOUT.rows - 1);
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
