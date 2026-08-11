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
    expect(ID_CARD_PRINT_STYLES).toMatch(
      /\.id-card-qr\s*\{[^}]*box-sizing: border-box !important;/s,
    );
    expect(ID_CARD_PRINT_STYLES).toContain('-webkit-line-clamp: 2;');
    expect(ID_CARD_PRINT_STYLES).toContain('.id-card-section { display: none !important; }');
  });
});
