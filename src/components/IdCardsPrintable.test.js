import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import IdCardsPrintable from './IdCardsPrintable.jsx';
import { SECTION_PRINT_COLORS } from '../lib/idCardQueue.js';

const h = React.createElement;
const mabini = { id: 'mabini', name: 'Mabini', gradeLevel: 7 };
const acacia = { id: 'acacia', name: 'Acacia', gradeLevel: 11, strand: 'STEM' };
const entry = (id, section) => ({ section, student: { id, lrn: `LRN${id}`, lastName: 'Cruz', firstName: id } });
const entries = [entry('a', mabini), entry('b', mabini), entry('c', acacia)];
const count = (html, text) => html.split(text).length - 1;
// The markup only, without the shared print stylesheet that names every class.
const render = (props) => renderToStaticMarkup(h(IdCardsPrintable, props)).replace(/<style>[\s\S]*?<\/style>/, '');

describe('IdCardsPrintSheets section coding', () => {
  it('frames each card in its section color and prints a key of the sections on the sheet', () => {
    const html = render({ entries, printOnly: true, sectionCoded: true });
    expect(html).toContain('class="id-cards-sheet section-coded"');
    expect(count(html, `--section-color:${SECTION_PRINT_COLORS[0]}`)).toBe(3); // 2 cards + key
    expect(count(html, `--section-color:${SECTION_PRINT_COLORS[1]}`)).toBe(2); // 1 card + key
    expect(html).toContain('class="id-cards-legend"');
    expect(html).toContain('G7 Mabini (2)');
    expect(html).toContain('G11 Acacia STEM (1)');
  });

  it('leaves single-section prints uncoded by default', () => {
    const html = render({ entries, printOnly: true });
    expect(html).toContain('class="id-cards-sheet"');
    expect(html).not.toContain('section-coded');
    expect(html).not.toContain('--section-color');
    expect(html).not.toContain('id-cards-legend');
  });
});
