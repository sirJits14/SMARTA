import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import SubTabs, { nextTabIndex } from './SubTabs.jsx';

describe('nextTabIndex', () => {
  it('moves Home to the first tab and End to the last', () => {
    expect(nextTabIndex('Home', 1, 3)).toBe(0);
    expect(nextTabIndex('End', 0, 3)).toBe(2);
  });
  it('wraps ArrowRight and ArrowLeft around the ends', () => {
    expect(nextTabIndex('ArrowRight', 0, 3)).toBe(1);
    expect(nextTabIndex('ArrowRight', 2, 3)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 2, 3)).toBe(1);
    expect(nextTabIndex('ArrowLeft', 0, 3)).toBe(2);
  });
  it('ignores every other key', () => {
    expect(nextTabIndex('Enter', 0, 2)).toBeNull();
    expect(nextTabIndex('a', 1, 2)).toBeNull();
    expect(nextTabIndex('ArrowDown', 0, 2)).toBeNull();
  });
});

describe('SubTabs', () => {
  it('renders a tablist with wired-up tabs and a roving tabindex', () => {
    const html = renderToStaticMarkup(React.createElement(SubTabs, {
      tabs: [['section', 'By section'], ['batch', 'Saved batch']],
      value: 'batch', onChange: vi.fn(), idPrefix: 'slips', label: 'Issue slips', className: 'x sims-tabs',
    }));
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Issue slips"');
    expect(html).toContain('id="slips-tab-batch"');
    expect(html).toContain('aria-controls="slips-panel-section"');
    expect(html).toMatch(/id="slips-tab-section"[^>]*tabindex="-1"/);
    expect(html).toMatch(/id="slips-tab-batch"[^>]*tabindex="0"/);
  });
});
