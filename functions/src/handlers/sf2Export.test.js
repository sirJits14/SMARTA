import { describe, expect, it } from 'vitest';
import { sf2Filename } from './sf2Export.js';

describe('sf2Filename', () => {
  it('names the file like the SIMS export', () => {
    expect(sf2Filename('Rizal', '2026-09')).toBe('SF2_Rizal_2026-09.xlsx');
  });
  it('replaces characters a file name cannot hold', () => {
    expect(sf2Filename('St. John/Paul: "A"?', '2026-09')).toBe('SF2_St. John-Paul- -A--_2026-09.xlsx');
  });
  it('falls back when the section has no name', () => {
    expect(sf2Filename('  ', '2026-09')).toBe('SF2_Section_2026-09.xlsx');
    expect(sf2Filename(undefined, '2026-09')).toBe('SF2_Section_2026-09.xlsx');
  });
});
