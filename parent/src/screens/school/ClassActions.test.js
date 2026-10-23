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
    expect(html).not.toContain(S.addLearnerButton);
  });
  it('disables the SF2 button and says why', () => {
    const html = render({ onSf2() {}, sf2Hint: S.sf2NoLearners });
    expect(html).toContain('disabled=""');
    expect(html).toContain(S.sf2NoLearners);
  });
  it('offers Add learner beside SF2', () => {
    const html = render({ onAddLearner() {}, onSf2() {} });
    expect(html.indexOf(S.addLearnerButton)).toBeGreaterThan(-1);
    expect(html.indexOf(S.addLearnerButton)).toBeLessThan(html.indexOf(S.sf2Button));
  });
  it('counts the requests waiting for approval, singular and plural', () => {
    expect(render({ requestTotal: 1, requestWaiting: 1, onOpenRequests() {} })).toContain('1 request waiting for approval');
    expect(render({ requestTotal: 3, requestWaiting: 2, onOpenRequests() {} })).toContain('2 requests waiting for approval');
  });
  it('links to past requests once none are waiting, and hides the link when there are none', () => {
    expect(render({ requestTotal: 2, requestWaiting: 0, onOpenRequests() {} })).toContain(S.requestsPast);
    expect(render({ onAddLearner() {}, requestTotal: 0 })).not.toContain(S.requestsPast);
  });
});
