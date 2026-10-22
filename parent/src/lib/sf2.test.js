import { describe, expect, it, vi } from 'vitest';
import { XLSX_TYPE, base64ToFile, saveFile, sf2MonthOptions } from './sf2.js';

describe('sf2MonthOptions', () => {
  it('labels the school year’s months up to today, newest first', () => {
    expect(sf2MonthOptions('2026-2027', '2026-10-22')).toEqual([
      { value: '2026-10', label: 'October 2026' }, { value: '2026-09', label: 'September 2026' }, { value: '2026-08', label: 'August 2026' },
      { value: '2026-07', label: 'July 2026' }, { value: '2026-06', label: 'June 2026' },
    ]);
  });
  it('is empty before the school year starts', () => {
    expect(sf2MonthOptions('2026-2027', '2026-05-30')).toEqual([]);
  });
});

describe('base64ToFile', () => {
  it('turns the server’s base64 back into a named spreadsheet file', async () => {
    const file = base64ToFile(Buffer.from('PK-fake-xlsx').toString('base64'), 'SF2_Rizal_2026-09.xlsx');
    expect(file.name).toBe('SF2_Rizal_2026-09.xlsx');
    expect(file.type).toBe(XLSX_TYPE);
    expect(Buffer.from(await file.arrayBuffer()).toString()).toBe('PK-fake-xlsx');
  });
});

describe('saveFile', () => {
  const file = new File(['x'], 'SF2.xlsx', { type: XLSX_TYPE });
  it('uses the share sheet where the browser can share files', async () => {
    const nav = { canShare: vi.fn(() => true), share: vi.fn(async () => {}) };
    expect(await saveFile(file, nav, undefined)).toBe('shared');
    expect(nav.share).toHaveBeenCalledWith({ files: [file], title: 'SF2.xlsx' });
  });
  it('stays quiet when the person closes the share sheet', async () => {
    const nav = { canShare: () => true, share: async () => { throw Object.assign(new Error('closed'), { name: 'AbortError' }); } };
    expect(await saveFile(file, nav, undefined)).toBe('cancelled');
  });
  it('downloads through a link when sharing is unavailable or fails', async () => {
    const click = vi.fn();
    const link = { click };
    const doc = { createElement: vi.fn(() => link) };
    expect(await saveFile(file, {}, doc)).toBe('downloaded');
    expect(doc.createElement).toHaveBeenCalledWith('a');
    expect(link.download).toBe('SF2.xlsx');
    expect(link.href).toMatch(/^blob:/);
    expect(click).toHaveBeenCalledTimes(1);
    const broken = { canShare: () => true, share: async () => { throw new Error('share failed'); } };
    expect(await saveFile(file, broken, doc)).toBe('downloaded');
  });
});
