import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import SectionDetailModal from './SectionDetailModal.jsx';

const h = React.createElement;
const section = { id: 's1', gradeLevel: 7, name: 'Rizal' };
const roster = [{ id: 'a', lrn: '123456789012', firstName: 'Ana', lastName: 'Cruz', sex: 'F' }];

describe('SectionDetailModal', () => {
  it('is view-only without print or edit actions (coordinators)', () => {
    const html = renderToStaticMarkup(h(SectionDetailModal, { section, roster, onClose: vi.fn() }));
    expect(html).toContain('Cruz');
    expect(html).not.toContain('Print QR Codes');
    expect(html).not.toContain('>Edit<');
  });
  it('shows Print and Edit when the actions are given (administrator)', () => {
    const html = renderToStaticMarkup(h(SectionDetailModal, { section, roster, onClose: vi.fn(), onPrint: vi.fn(), printReady: true, onEditStudent: vi.fn() }));
    expect(html).toContain('Print QR Codes');
    expect(html).toContain('>Edit<');
  });
});
