import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import IdCardsPrintable from './IdCardsPrintable.jsx';
import { SECTION_PRINT_COLORS, sectionBorderColor } from '../lib/idCardQueue.js';

const h = React.createElement;
const mabini = { id: 'mabini', name: 'Mabini', gradeLevel: 7 };
const acacia = { id: 'acacia', name: 'Acacia', gradeLevel: 11, strand: 'STEM' };
const entry = (id, section) => ({ section, student: { id, lrn: `LRN${id}`, lastName: 'Cruz', firstName: id } });
const entries = [entry('a', mabini), entry('b', mabini), entry('c', acacia)];
const count = (html, text) => html.split(text).length - 1;
// The markup only, without the shared print stylesheet that names every class.
const render = (props) => renderToStaticMarkup(h(IdCardsPrintable, props)).replace(/<style>[\s\S]*?<\/style>/, '');

describe('IdCardsPrintSheets section coding', () => {
  it('frames each card in a faint shade of its section color and prints a solid key of the sections on the sheet', () => {
    const html = render({ entries, printOnly: true, sectionCoded: true });
    expect(html).toContain('class="id-cards-sheet section-coded"');
    expect(count(html, `--section-border:${sectionBorderColor(SECTION_PRINT_COLORS[0])}`)).toBe(2); // cards
    expect(count(html, `--section-border:${sectionBorderColor(SECTION_PRINT_COLORS[1])}`)).toBe(1);
    expect(count(html, `--section-color:${SECTION_PRINT_COLORS[0]}`)).toBe(1); // key
    expect(count(html, `--section-color:${SECTION_PRINT_COLORS[1]}`)).toBe(1);
    expect(html).toContain('class="id-cards-legend"');
    expect(html).toContain('G7 Mabini (2)');
    expect(html).toContain('G11 Acacia STEM (1)');
  });

  it('marks only a sheet that reaches the last row as full', () => {
    const many = Array.from({ length: 73 }, (_, i) => entry(`m${i}`, i % 2 ? mabini : acacia));
    expect(render({ entries: many, printOnly: true, sectionCoded: true })).toContain('class="id-cards-sheet section-coded sheet-full"');
    const short = render({ entries: many.slice(0, 72), printOnly: true, sectionCoded: true });
    expect(short).toContain('class="id-cards-sheet section-coded"');
    expect(short).not.toContain('sheet-full');
  });

  it('leaves single-section prints uncoded by default', () => {
    const html = render({ entries, printOnly: true });
    expect(html).toContain('class="id-cards-sheet"');
    expect(html).not.toContain('section-coded');
    expect(html).not.toContain('--section-color');
    expect(html).not.toContain('--section-border');
    expect(html).not.toContain('id-cards-legend');
  });
});
