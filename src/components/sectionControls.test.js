import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import GradePills from './GradePills.jsx';
import SectionPicker from './SectionPicker.jsx';

const h = React.createElement;

describe('GradePills', () => {
  it('renders a labelled group of pressed-state buttons with optional counts', () => {
    const html = renderToStaticMarkup(h(GradePills, {
      label: 'Grade level',
      value: 8,
      onChange: vi.fn(),
      options: [{ value: 7, label: 'Grade 7', count: 4 }, { value: 8, label: 'Grade 8' }],
    }));

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Grade level"');
    expect(html).toContain('Grade 7 (4)');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('type="button"');
  });
});

describe('SectionPicker', () => {
  const sections = [
    { id: 'g7-rizal', gradeLevel: 7, name: 'Jose Rizal', adviserName: 'Ana Cruz' },
    { id: 'g8-luna', gradeLevel: 8, name: 'Juan Luna', strand: 'STE' },
  ];

  it('opens on the selected section grade and describes the selection', () => {
    const html = renderToStaticMarkup(h(SectionPicker, {
      sections, value: 'g8-luna', onChange: vi.fn(), label: 'Section',
    }));

    expect(html).toContain('Search Grade 8 sections by name');
    expect(html).toContain('Selected:');
    expect(html).toContain('Juan Luna · Grade 8 · STE');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain('Jose Rizal</button>');
  });

  it('shows no selected summary when the controlled value is unavailable', () => {
    const html = renderToStaticMarkup(h(SectionPicker, {
      sections, value: 'removed', onChange: vi.fn(), label: 'Section', disabled: true,
    }));

    expect(html).not.toContain('Selected:');
    expect(html).toContain('disabled=""');
  });
});
