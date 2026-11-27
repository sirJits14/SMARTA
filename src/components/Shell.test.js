import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const waiting = vi.hoisted(() => ({ count: 0, truncated: false }));
vi.mock('../firebase.js', () => ({ functions: {} }));
vi.mock('../hooks/useLearnerRequestCount.js', () => ({ useLearnerRequestCount: () => waiting }));
vi.mock('../hooks/useSchoolPendingCount.js', () => ({ useSchoolPendingCount: () => 0 }));
vi.mock('../hooks/useTheme.js', () => ({ useTheme: () => ({ pref: 'auto', theme: 'light', setPref() {} }) }));

import Shell from './Shell.jsx';

const admin = { role: 'registrar', email: 'admin@deped.gov.ph', displayName: 'Ada Admin' };
// The shell reads the window's width for the sidebar and has no storage here, so it opens expanded at 1280 and
// as the narrow rail at 900.
const shell = (width) => {
  globalThis.window = { innerWidth: width };
  return renderToStaticMarkup(React.createElement(Shell, { me: admin, page: 'dashboard', setPage() {}, schoolYear: '2026-2027', onLogout() {} }));
};
const badge = (html) => html.match(/<span class="sims-count-badge">.*?<\/span><\/span>/)?.[0] ?? '';

afterEach(() => { delete globalThis.window; waiting.count = 0; waiting.truncated = false; });

describe('the Learner requests badge in the sidebar', () => {
  it('shows nothing when no request is waiting', () => {
    expect(shell(1280)).not.toContain('sims-count-badge');
  });
  it('shows a small count as it is, in the expanded sidebar and under the narrow rail alike', () => {
    waiting.count = 9;
    expect(badge(shell(1280))).toBe('<span class="sims-count-badge"><span aria-hidden="true">9</span><span class="sims-sr-only">9 learner requests waiting</span></span>');
    const rail = shell(900);
    expect(rail).toContain('is-collapsed');
    expect(rail).toContain('aria-label="Learner requests, 9 learner requests waiting"');
    expect(badge(rail)).toContain('<span aria-hidden="true">9</span>');
  });
  it('reads 99+ over 99 and whenever the server cut the count', () => {
    waiting.count = 100;
    expect(badge(shell(1280))).toContain('<span aria-hidden="true">99+</span>');
    waiting.count = 200; waiting.truncated = true;
    const html = shell(1280);
    expect(badge(html)).toContain('<span aria-hidden="true">99+</span>');
    expect(badge(html)).toContain('99+ learner requests waiting');
    expect(html).not.toContain('>200<');
    expect(shell(900)).toContain('aria-label="Learner requests, 99+ learner requests waiting"');
  });
});
