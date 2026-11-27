import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../firebase.js', () => ({ db: {}, functions: {} }));
vi.mock('../data/settings.js', () => ({ updateSettings: vi.fn(), PICKUP_PLACE_MAX: 120 }));
vi.mock('../components/InstallAppCard.jsx', () => ({ default: () => null }));
vi.mock('../hooks/useCollection.js', () => ({ useDocResource: () => ({ data: {}, loading: false, error: null }) }));

import SettingsPage from './SettingsPage.jsx';

describe('settings page', () => {
  it('asks for the principal printed on temporary passes', () => {
    const html = renderToStaticMarkup(React.createElement(SettingsPage));
    expect(html).toContain('>Principal&#x27;s name<');
    expect(html).toContain('placeholder="PAUL O. ORONG"');
    expect(html).toContain('>Principal&#x27;s title<');
    expect(html).toContain('placeholder="Secondary Principal IV"');
    expect(html).toContain('Printed on temporary ID passes.');
  });
  it('asks where advisers pick up their requested passes', () => {
    const html = renderToStaticMarkup(React.createElement(SettingsPage));
    expect(html).toContain('>Pass pick-up place<');
    const input = html.match(/<input[^>]*placeholder="Logistics Office, Admin Building"[^>]*>/)?.[0] ?? '';
    expect(input).toContain('maxLength="120"');
    expect(input).toContain('aria-describedby="settings-pickup-hint"');
    expect(html).toMatch(/<p id="settings-pickup-hint"[^>]*>Shown to advisers when their requested passes are ready\.<\/p>/);
  });
});
