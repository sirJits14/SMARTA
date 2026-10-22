import { describe, expect, it, vi } from 'vitest';
import { XLSX_TYPE, base64ToFile, isCoarsePointer, saveFile, sf2MonthOptions } from './sf2.js';

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

describe('isCoarsePointer', () => {
  it('is true when the primary pointer is a finger', () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    expect(isCoarsePointer({ matchMedia })).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(pointer: coarse)');
  });
  it('is false for a mouse or trackpad', () => {
    expect(isCoarsePointer({ matchMedia: () => ({ matches: false }) })).toBe(false);
  });
  it('is false when the window cannot answer', () => {
    expect(isCoarsePointer({})).toBe(false);
    expect(isCoarsePointer({ matchMedia: () => undefined })).toBe(false);
    expect(isCoarsePointer(undefined)).toBe(false);
  });
});

describe('saveFile', () => {
  const file = new File(['x'], 'SF2.xlsx', { type: XLSX_TYPE });
  const refused = (name) => Object.assign(new Error(name), { name });
  const fakeDoc = () => {
    const link = { click: vi.fn() };
    return { link, doc: { createElement: vi.fn(() => link) } };
  };
  it('uses the share sheet on a touch-first device that can share files', async () => {
    const nav = { canShare: vi.fn(() => true), share: vi.fn(async () => {}) };
    expect(await saveFile(file, nav, undefined, true)).toBe('shared');
    expect(nav.share).toHaveBeenCalledWith({ files: [file], title: 'SF2.xlsx' });
    expect(nav.canShare).toHaveBeenCalledWith({ files: [file] });
  });
  it('stays quiet when the person closes the share sheet', async () => {
    const nav = { canShare: () => true, share: async () => { throw refused('AbortError'); } };
    expect(await saveFile(file, nav, undefined, true)).toBe('cancelled');
  });
  it('reports "blocked" and does not download when the browser wants a fresh tap', async () => {
    const { doc } = fakeDoc();
    const nav = { canShare: () => true, share: vi.fn(async () => { throw refused('NotAllowedError'); }) };
    expect(await saveFile(file, nav, doc, true)).toBe('blocked');
    expect(nav.share).toHaveBeenCalledTimes(1);
    expect(doc.createElement).not.toHaveBeenCalled();
  });
  it('downloads through a link when sharing is unavailable', async () => {
    const { link, doc } = fakeDoc();
    expect(await saveFile(file, {}, doc, true)).toBe('downloaded');
    expect(doc.createElement).toHaveBeenCalledWith('a');
    expect(link.download).toBe('SF2.xlsx');
    expect(link.href).toMatch(/^blob:/);
    expect(link.click).toHaveBeenCalledTimes(1);
  });
  it('downloads instead of sharing when the device is not touch-first', async () => {
    const { link, doc } = fakeDoc();
    const nav = { canShare: vi.fn(() => true), share: vi.fn(async () => {}) };
    expect(await saveFile(file, nav, doc, false)).toBe('downloaded');
    expect(nav.share).not.toHaveBeenCalled();
    expect(link.click).toHaveBeenCalledTimes(1);
  });
  it('falls through to the download when the share fails for another reason', async () => {
    const { link, doc } = fakeDoc();
    const nav = { canShare: () => true, share: async () => { throw new Error('share failed'); } };
    expect(await saveFile(file, nav, doc, true)).toBe('downloaded');
    expect(link.click).toHaveBeenCalledTimes(1);
  });
});
