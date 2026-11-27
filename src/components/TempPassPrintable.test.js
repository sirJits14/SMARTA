import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TempPassCard, TempPassSheets } from './TempPassPrintable.jsx';
import { TEMP_PASS_PRINT_STYLES } from '../pages/tempPassPrintLayout.js';

const h = React.createElement;
const props = {
  name: 'CRUZ, JUAN D.', sectionLine: 'GRADE 11 – RIZAL · STEM', lrn: '123456789012',
  photoSrc: 'data:image/jpeg;base64,AAAA', qrSrc: 'data:image/png;base64,BBBB',
  principalName: 'Paul O. Orong', principalTitle: 'Secondary Principal IV',
};
const pass = (i) => ({ ...props, studentId: `s${i}`, code: `C${i}` });

describe('temporary pass card', () => {
  it('prints the learner, the pass details and the note', () => {
    const html = renderToStaticMarkup(h(TempPassCard, props));
    expect(html).toContain('class="temp-pass-card"');
    expect(html).toContain('viewBox="0 0 591 937"');
    expect(html).toContain('aria-label="Temporary ID pass for CRUZ, JUAN D."');
    expect(html).toContain('>CRUZ, JUAN D.<');
    expect(html).toContain('>GRADE 11 – RIZAL · STEM<');
    expect(html).toContain('>LRN: 123456789012<');
    expect(html).toContain('>PAUL O. ORONG<');
    expect(html).toContain('>SECONDARY PRINCIPAL IV<');
    expect(html).toContain('Note: This temporary ID pass is issued');
    expect(html).toContain('>BNHS ID PASS<');
    expect(html).toContain('STUDENT&#x27;S TEMPORARY QR CODE:');
    expect(html).toContain('href="data:image/jpeg;base64,AAAA"');
    expect(html).toContain('href="data:image/png;base64,BBBB"');
  });
  it('pins the length of a very long name so it cannot overflow', () => {
    const name = 'A'.repeat(60);
    const html = renderToStaticMarkup(h(TempPassCard, { ...props, name }));
    expect(html).toMatch(new RegExp(`<text[^>]*textLength="551"[^>]*>${name}</text>`));
  });
  it('counts the letter spacing when fitting the section line', () => {
    const sectionLine = 'GRADE 12 – SAINT LORENZO · TVL-ICT'; // 34 characters: fits only without spacing
    const html = renderToStaticMarkup(h(TempPassCard, { ...props, sectionLine }));
    const text = html.match(new RegExp(`<text[^>]*>${sectionLine}</text>`))[0];
    expect(text).toContain('textLength="540"');
    expect(Number(text.match(/letter-spacing="([\d.]+)"/)[1])).toBeLessThan(5);
  });
  it('does not pin a short name', () => {
    const html = renderToStaticMarkup(h(TempPassCard, props));
    expect(html).not.toMatch(/textLength="551"[^>]*>CRUZ/);
  });
});

describe('temporary pass sheets', () => {
  it('puts nine cards on each sheet and carries the print styles', () => {
    const html = renderToStaticMarkup(h(TempPassSheets, { passes: Array.from({ length: 11 }, (_, i) => pass(i)) }));
    expect(html.match(/class="temp-pass-sheet"/g)).toHaveLength(2);
    expect(html.match(/class="temp-pass-card"/g)).toHaveLength(11);
    expect(html).toContain('@page { size: A4; margin: 8mm }');
  });
});

describe('temporary pass print styles', () => {
  it('prints only the sheets at card size', () => {
    expect(TEMP_PASS_PRINT_STYLES).toContain('.app-sidebar, .app-topbar, .id-cards-controls, .id-cards-heading');
    expect(TEMP_PASS_PRINT_STYLES).toContain('grid-template-columns: repeat(3, 54mm)');
    expect(TEMP_PASS_PRINT_STYLES).toContain('grid-auto-rows: 85.6mm');
    expect(TEMP_PASS_PRINT_STYLES).toMatch(/width: 54mm;\s*height: 85.6mm/);
    expect(TEMP_PASS_PRINT_STYLES).toContain('print-color-adjust: exact');
    expect(TEMP_PASS_PRINT_STYLES).toContain('.temp-pass-sheet:not(:last-child) { break-after: page; }');
  });
});
