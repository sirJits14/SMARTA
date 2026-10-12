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
    expect(paperOf('constructor')).toBe(PAPER_SIZES.folio);
  });

  it('chunks 16 per Folio sheet by default, last sheet partial', () => {
    expect(chunkSlips(slips(35)).map((s) => s.length)).toEqual([16, 16, 3]);
    expect(chunkSlips(slips(35), 'folio').map((s) => s.length)).toEqual([16, 16, 3]);
    expect(chunkSlips(slips(35), 'letter').map((s) => s.length)).toEqual([16, 16, 3]);
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
