import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSF2Workbook } from './sf2.js';

const options = {
  section: { schoolYear: '2026-2027', gradeLevel: 7, name: 'Test Section', adviserName: 'Test Adviser' },
  schoolDays: ['2026-07-01', '2026-07-02'],
  monthLabelText: 'July 2026', schoolId: '123456', schoolName: 'Test School',
  enrolledAsOfCutoff: 100,
};

function students(sex, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${sex}${i + 1}`, sex, firstName: 'Learner',
    lastName: `${sex}${String(i + 1).padStart(3, '0')}`,
  }));
}

describe('SF2 workbook export', () => {
  let template;
  beforeEach(async () => {
    const buffer = await readFile(new URL('../assets/sf2-template.xlsx', import.meta.url));
    template = new ExcelJS.Workbook();
    await template.xlsx.load(buffer);
    // Only the browser asset fetch is replaced; use the real template and exporter.
    vi.stubGlobal('fetch', async () => ({ arrayBuffer: async () => buffer }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [21, 25, 35, 36, 61, 62, 70, 88],
    [22, 26, 36, 37, 63, 64, 72, 90],
    [30, 35, 44, 45, 80, 81, 89, 107],
    [50, 60, 64, 65, 125, 126, 134, 152],
    [30, 0, 44, 45, 70, 71, 79, 97],
    [0, 35, 35, 36, 71, 72, 80, 98],
  ])('keeps all %i males and %i females on one sheet after saving', async (
    maleCount, femaleCount, maleTotalRow, femaleStartRow, femaleTotalRow, combinedRow, summaryRow, adviserRow,
  ) => {
    const roster = [...students('F', femaleCount), ...students('M', maleCount)].reverse();
    const docsByDate = {
      '2026-07-01': { marks: { [`M${maleCount}`]: 'A', [`F${femaleCount}`]: 'L' } },
      '2026-07-02': { marks: { [`M${maleCount}`]: 'L', [`F${femaleCount}`]: 'A' } },
    };
    const workbook = await buildSF2Workbook({ ...options, roster, docsByDate });
    const saved = new ExcelJS.Workbook();
    await saved.xlsx.load(await workbook.xlsx.writeBuffer());
    expect(saved.worksheets).toHaveLength(1);
    const ws = saved.worksheets[0];

    for (const [sex, count, startRow] of [['M', maleCount, 14], ['F', femaleCount, femaleStartRow]]) {
      for (let i = 0; i < count; i++) {
        const row = startRow + i;
        expect(ws.getCell(`A${row}`).value).toBe(i + 1);
        expect(ws.getCell(`B${row}`).value).toBe(`${sex}${String(i + 1).padStart(3, '0')}, Learner`);
        expect(ws.getCell(`C${row}`).master.address).toBe(`B${row}`);
        expect(ws.getCell(`AJ${row}`).master.address).toBe(`AE${row}`);
        expect(ws.getRow(row).height).toBe(21.95);
      }
      if (count) {
        const last = startRow + count - 1;
        expect(ws.getCell(`F${last}`).value).toBe(sex === 'M' ? 'X' : 'L');
        expect(ws.getCell(`G${last}`).value).toBe(sex === 'M' ? 'L' : 'X');
        expect(ws.getCell(`AC${last}`).value).toBe(1);
        expect(ws.getCell(`AD${last}`).value).toBe(1);
      }
    }
    expect(ws.getCell(`A${maleTotalRow}`).value).toContain('MALE');
    expect(ws.getCell(`A${femaleTotalRow}`).value).toContain('FEMALE');
    expect(ws.getCell(`F${maleTotalRow}`).value).toBe(Math.max(0, maleCount - 1));
    expect(ws.getCell(`G${maleTotalRow}`).value).toBe(maleCount);
    expect(ws.getCell(`F${femaleTotalRow}`).value).toBe(femaleCount);
    expect(ws.getCell(`G${femaleTotalRow}`).value).toBe(Math.max(0, femaleCount - 1));
    expect(ws.getCell(`F${combinedRow}`).value).toBe(Math.max(0, maleCount - 1) + femaleCount);
    expect(ws.getCell(`G${combinedRow}`).value).toBe(maleCount + Math.max(0, femaleCount - 1));
    expect(ws.getCell(`AH${summaryRow}`).value).toBe(maleCount);
    expect(ws.getCell(`AI${summaryRow}`).value).toBe(femaleCount);
    expect(ws.getCell(`AJ${summaryRow}`).value).toBe(maleCount + femaleCount);
    expect(ws.getCell(`AJ${summaryRow + 4}`).value).toBe((maleCount + femaleCount) - 0.5 * Number(maleCount > 0) - 0.5 * Number(femaleCount > 0));
    expect(ws.getCell(`AH${summaryRow + 5}`).numFmt ?? 'General').toBe('General');
    expect(ws.getCell(`AD${adviserRow}`).value).toBe('Test Adviser');
    expect(ws.getCell(`A${summaryRow - 6}`).value).toBe('GUIDELINES:');
    expect(ws.getCell('F11').value).toBe(1);
    expect(ws.getCell('G11').value).toBe(2);
    expect(ws.getCell('C6').value).toBe('123456');
    expect(ws.getCell('AC8').value).toBe('Test Section');
    for (const totalRow of [maleTotalRow, femaleTotalRow]) {
      expect(ws.getCell(`D${totalRow - 1}`).border.bottom?.style).toBe('double');
      expect(ws.getCell(`D${totalRow - 2}`).border.bottom?.style).not.toBe('double');
    }

    // Moving the form must retain every original merge and its border styles.
    const maleExtra = Math.max(0, maleCount - 21);
    const femaleExtra = Math.max(0, femaleCount - 25);
    const shiftAddress = (address) => address.replace(/\d+$/, (r) => Number(r) + (Number(r) >= 34 ? maleExtra : 0) + (Number(r) >= 60 ? femaleExtra : 0));
    const source = template.worksheets[0];
    for (const range of source.model.merges) {
      const [first, last] = range.split(':').map(shiftAddress);
      expect(ws.getCell(last).master.address).toBe(first);
      expect(ws.getCell(last).border).toEqual(source.getCell(range.split(':')[1]).border);
    }
    expect(ws.getImages().map(({ imageId, range }) => ({ imageId, range: range.model })))
      .toEqual(source.getImages().map(({ imageId, range }) => ({ imageId, range: range.model })));
    if (maleExtra || femaleExtra) {
      expect(ws.pageSetup.fitToWidth).toBe(1);
      expect(ws.pageSetup.fitToHeight).toBe(0);
    }
  });
});
