import { describe, expect, it } from 'vitest';
import { advisoryUrl, advisoryInstructions, advisoryPrintStyles } from './advisorySlipLayout.js';

describe('advisory slip layout', () => {
  it('points the QR at the adviser link', () => {
    expect(advisoryUrl('https://bnhs-parent.web.app/', 'ABCD2345')).toBe('https://bnhs-parent.web.app/activate?a=ABCD2345');
  });
  it('says who may use it and for how long', () => {
    expect(advisoryInstructions('2026-2027')).toBe('For the class adviser only. Sign in with your DepEd email. Single use. Valid SY 2026-2027. Keep private.');
  });
  it('hides the Sections page chrome when printing and keeps the band colour', () => {
    const css = advisoryPrintStyles('folio');
    expect(css).toContain('.sections-page-chrome');
    expect(css).toContain('.advisory-controls');
    expect(css).toContain('print-color-adjust: exact');
    expect(css).toContain('@page { size: 8.5in 13in');
  });
});
