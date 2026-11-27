import { describe, it, expect } from 'vitest';
import { PANEL_IDS, readPanel, panelHref } from './useDashboardPanel.js';

describe('dashboard panel URL', () => {
  it('reads known panels and the upcoming alias', () => {
    expect(readPanel('?panel=attendance')).toBe('attendance');
    expect(readPanel('?foo=1&panel=upcoming')).toBe('calendar');
    expect(PANEL_IDS.every((id) => readPanel(`?panel=${id}`) === id)).toBe(true);
  });

  it('ignores unknown or missing panels', () => {
    expect(readPanel('?panel=bogus')).toBe(null);
    expect(readPanel('')).toBe(null);
  });

  it('writes and removes the panel while keeping other params and the hash', () => {
    expect(panelHref('https://sims.test/?foo=1#top', 'sex')).toBe('/?foo=1&panel=sex#top');
    expect(panelHref('https://sims.test/?foo=1&panel=sex#top', null)).toBe('/?foo=1#top');
    expect(panelHref('https://sims.test/?panel=sex', null)).toBe('/');
  });
});
