import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../firebase.js', () => ({ functions: {} }));

import LearnerRequestsPage from './LearnerRequestsPage.jsx';

const h = React.createElement;

describe('LearnerRequestsPage', () => {
  it('renders its heading and school year before any answer arrives', () => {
    const html = renderToStaticMarkup(h(LearnerRequestsPage, { schoolYear: '2026-2027' }));
    expect(html).toContain('Learner requests');
    expect(html).toContain('SY 2026-2027');
    expect(html).toContain('Refresh');
  });
});
