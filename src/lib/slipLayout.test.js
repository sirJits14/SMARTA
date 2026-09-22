import { describe, it, expect } from 'vitest';
import { chunkSlips, activationUrl, SLIPS_PER_SHEET } from './slipLayout.js';
describe('slipLayout', () => {
  it('chunks 10 per A4 sheet, last sheet partial', () => {
    const slips = Array.from({ length: 23 }, (_, i) => ({ studentId: `S${i}` }));
    const sheets = chunkSlips(slips);
    expect(SLIPS_PER_SHEET).toBe(10);
    expect(sheets.map((s) => s.length)).toEqual([10, 10, 3]);
    expect(chunkSlips([])).toEqual([]);
  });
  it('builds the QR deep link without a trailing slash problem', () => {
    expect(activationUrl('https://bnhs-parent.web.app', 'K7M4P2XQ')).toBe('https://bnhs-parent.web.app/activate?c=K7M4P2XQ');
    expect(activationUrl('https://bnhs-parent.web.app/', 'K7M4P2XQ')).toBe('https://bnhs-parent.web.app/activate?c=K7M4P2XQ');
  });
});
