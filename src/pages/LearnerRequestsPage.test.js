import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../firebase.js', () => ({ functions: {} }));

import LearnerRequestsPage, { revealMessage } from './LearnerRequestsPage.jsx';

const h = React.createElement;

describe('LearnerRequestsPage', () => {
  it('renders its heading and school year before any answer arrives', () => {
    const html = renderToStaticMarkup(h(LearnerRequestsPage, { schoolYear: '2026-2027' }));
    expect(html).toContain('Learner requests');
    expect(html).toContain('SY 2026-2027');
    expect(html).toContain('Refresh');
  });
});

describe('revealMessage', () => {
  it('scrolls the message into view and moves focus to it without a second scroll', () => {
    const seen = [];
    revealMessage({ scrollIntoView: (options) => seen.push(['scroll', options]), focus: (options) => seen.push(['focus', options]) });
    expect(seen).toEqual([['scroll', { block: 'nearest' }], ['focus', { preventScroll: true }]]);
  });
  it('still focuses where scrollIntoView is missing, and does nothing without an element', () => {
    const seen = [];
    revealMessage({ focus: (options) => seen.push(options) });
    expect(seen).toEqual([{ preventScroll: true }]);
    expect(() => revealMessage(null)).not.toThrow();
    expect(() => revealMessage({})).not.toThrow();
  });
});

// The page needs a browser to run its effects and clicks, which this suite has none of, so what ties the page's
// behaviour to the hook is read from its source.
describe('LearnerRequestsPage wiring', () => {
  const source = readFileSync(new URL('./LearnerRequestsPage.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  it('gives the alert and the notice a ref and a focus target, and keeps their roles', () => {
    expect(source).toMatch(/<p ref=\{alertRef\} tabIndex=\{-1\} role="alert" className="sims-feedback">/);
    expect(source).toMatch(/<p ref=\{noticeRef\} tabIndex=\{-1\} role="status" className="sims-feedback is-success">/);
  });
  it('reveals a message only when its text changes', () => {
    expect(source).toContain('if (error) revealMessage(alertRef.current); }, [error]);');
    expect(source).toContain('if (notice) revealMessage(noticeRef.current); }, [notice]);');
  });
  it('drops the notice on Refresh and when the other tab is chosen', () => {
    expect(source).toContain('onClick={() => { lists.clearNotice(); lists.refresh(); }}');
    expect(source).toMatch(/if \(next !== view\) lists\.clearNotice\(\);/);
  });
  it('shows the cut-list note as a plain muted status, not a success message', () => {
    const note = source.match(/\{cutNote && <p [^\n]*<\/p>\}/)[0];
    expect(note).toContain('role="status"');
    expect(note).toContain('color: T.inkMuted');
    expect(note).toContain('fontSize: 13');
    expect(note).not.toContain('sims-feedback');
  });
  it('hands the request being decided to the Waiting list', () => {
    expect(source).toContain('pendingId={pendingId}');
  });
});
