import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildSf2Workbook } from './buildSf2Workbook.js';
import { monthLabel, schoolDaysInMonth } from './calendar.js';

const templateBuffer = readFileSync(new URL('./sf2-template.xlsx', import.meta.url));
const section = { id: 'SEC1', name: 'Rizal', gradeLevel: 7, schoolYear: '2026-2027', adviserName: 'Teacher Tina' };
const roster = [
  { id: 'S1', firstName: 'Ana', lastName: 'Cruz', middleName: 'B', sex: 'F' },
  { id: 'S2', firstName: 'Ben', lastName: 'Dy', sex: 'M' },
];
const docsByDate = {
  '2026-09-21': { sectionId: 'SEC1', marks: { S1: 'L', S2: 'A' } },
  '2026-09-23': { sectionId: 'SEC1', marks: {}, sessionOverrides: { S2: { am: { absent: true } } } },
};

// Builds September 2026, saves and reloads it, and returns the sheet, as a downloaded file would be read.
async function build(over = {}) {
  const workbook = await buildSf2Workbook({
    templateBuffer, section, roster, schoolDays: schoolDaysInMonth(2026, 9), docsByDate, monthLabelText: monthLabel('2026-09'),
    schoolId: '300000', schoolName: 'Bukidnon NHS', enrolledAsOfCutoff: 2, ...over,
  });
  const saved = new ExcelJS.Workbook();
  await saved.xlsx.load(await workbook.xlsx.writeBuffer());
  return saved.worksheets[0];
}

describe('buildSf2Workbook (shared builder)', () => {
  it('fills the header from the section and the school', async () => {
    const ws = await build();
    expect(['C6', 'K6', 'X6', 'C8', 'X8', 'AC8', 'AD88'].map((address) => ws.getCell(address).value))
      .toEqual(['300000', '2026-2027', 'September 2026', 'Bukidnon NHS', 7, 'Rizal', 'TEACHER TINA']);
  });
  it('writes males first and females after, with marks in the Monday-aligned day columns', async () => {
    const ws = await build();
    expect(ws.getCell('B14').value).toBe('DY, BEN');
    expect(ws.getCell('B36').value).toBe('CRUZ, ANA B.');
    expect(ws.getCell('S14').value).toBe('X'); // Monday 21 Sep, absent
    expect(ws.getCell('S36').value).toBe('L'); // Monday 21 Sep, late
    expect(ws.getCell('U14').value).toBe('½A'); // Wednesday 23 Sep, morning absence
    expect(ws.getCell('U14').note).toContain('AM:X PM:P');
    expect(['AC14', 'AD14', 'AC36', 'AD36'].map((address) => ws.getCell(address).value)).toEqual([1.5, 0, 0, 1]);
  });
  it('totals the month', async () => {
    const ws = await build();
    expect(ws.getCell('AG64').value).toBe(22);
    expect(['AH70', 'AI70', 'AJ70', 'AJ66', 'AJ72'].map((address) => ws.getCell(address).value)).toEqual([1, 1, 2, 2, 100]);
  });
  it('accepts an ArrayBuffer template, which is what a browser fetch returns', async () => {
    const arrayBuffer = templateBuffer.buffer.slice(templateBuffer.byteOffset, templateBuffer.byteOffset + templateBuffer.byteLength);
    const ws = await build({ templateBuffer: arrayBuffer });
    expect(ws.getCell('B14').value).toBe('DY, BEN');
  });
});
