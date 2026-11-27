import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from './downloadBlob.js';
import { downloadWorkbook } from './downloadWorkbook.js';

vi.mock('./downloadBlob.js', () => ({ downloadBlob: vi.fn() }));

describe('downloadWorkbook', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves the written workbook as an xlsx Blob under the given file name', async () => {
    const workbook = { xlsx: { writeBuffer: async () => new Uint8Array([1, 2, 3]) } };
    await downloadWorkbook(workbook, 'Roster.xlsx');
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, filename] = downloadBlob.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(blob.size).toBe(3);
    expect(filename).toBe('Roster.xlsx');
  });
});
