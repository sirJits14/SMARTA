import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import S from '../../strings.js';
import ClassActions from './ClassActions.jsx';

const render = (props) => renderToStaticMarkup(createElement(ClassActions, props));

describe('ClassActions', () => {
  it('shows nothing when no action is available', () => {
    expect(render({})).toBe('');
  });
  it('offers Download SF2', () => {
    const html = render({ onSf2() {} });
    expect(html).toContain(S.sf2Button);
    expect(html).toContain(`aria-label="${S.classActions}"`);
    expect(html).not.toContain('disabled=""');
  });
  it('disables the button and says why', () => {
    const html = render({ onSf2() {}, sf2Hint: S.sf2NoLearners });
    expect(html).toContain('disabled=""');
    expect(html).toContain(S.sf2NoLearners);
  });
});
