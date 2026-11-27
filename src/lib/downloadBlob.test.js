import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from './downloadBlob.js';

describe('downloadBlob', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('clicks a temporary link carrying the file name, then releases the object URL', () => {
    vi.useFakeTimers();
    const anchor = { click: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor) });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const blob = new Blob(['x'], { type: 'image/png' });

    downloadBlob(blob, 'grade.png');

    expect(create).toHaveBeenCalledWith(blob);
    expect(anchor).toMatchObject({ href: 'blob:test', download: 'grade.png' });
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
});
