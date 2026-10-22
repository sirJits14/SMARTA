import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../../strings.js';
import { Sf2Form } from './Sf2Sheet.jsx';

const months = [{ value: '2026-10', label: 'October 2026' }, { value: '2026-09', label: 'September 2026' }];
const render = (props) => renderToStaticMarkup(createElement(Sf2Form, { months, busy: false, error: '', onDownload() {}, onClose() {}, ...props }));

describe('Sf2Form', () => {
  it('offers the months newest first and a Download button', () => {
    const html = render();
    expect(html.indexOf('October 2026')).toBeGreaterThan(-1);
    expect(html.indexOf('October 2026')).toBeLessThan(html.indexOf('September 2026'));
    expect(html).toContain(S.sf2Download);
    expect(html).not.toContain('disabled=""');
  });
  it('shows progress and locks the controls while preparing', () => {
    const html = render({ busy: true });
    expect(html).toContain(S.sf2Preparing);
    expect(html).not.toContain(`>${S.sf2Download}<`);
    expect(html.match(/disabled=""/g).length).toBeGreaterThanOrEqual(3);
  });
  it('shows an error banner', () => {
    expect(render({ error: 'Too many exports. Try again in a few minutes.' })).toContain('Too many exports. Try again in a few minutes.');
  });
  it('says so when there is no month to download yet', () => {
    const html = render({ months: [] });
    expect(html).toContain(S.sf2NoMonths);
    expect(html).not.toContain('<select');
  });
});
