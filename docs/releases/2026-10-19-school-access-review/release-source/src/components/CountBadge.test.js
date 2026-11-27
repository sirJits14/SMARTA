import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CountBadge } from './ui.jsx';

describe('CountBadge', () => {
  it('shows the number and reads it out with its meaning', () => {
    const html = renderToStaticMarkup(React.createElement(CountBadge, { count: 3, label: 'pending school access requests' }));
    expect(html).toContain('<span aria-hidden="true">3</span>');
    expect(html).toContain('<span class="sims-sr-only">3 pending school access requests</span>');
  });
});
