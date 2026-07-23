import { describe, it, expect } from 'vitest';
import { buildSF2Workbook } from './sf2.js';

const section = { name:'Rizal', gradeLevel:8, schoolYear:'2026-2027' };
const roster = [
  { id:'s1', lastName:'Bautista', firstName:'Andres', sex:'M' },
  { id:'s2', lastName:'Santos', firstName:'Maria', sex:'F' },
];
const schoolDays = ['2026-07-01','2026-07-02'];
const docsByDate = { '2026-07-01': { marks:{ s1:'A' } } }; // s1 absent day1; everyone else present

it('builds a worksheet with learner rows and correct totals', () => {
  const wb = buildSF2Workbook({ section, roster, schoolDays, docsByDate, monthLabelText:'July 2026' });
  const ws = wb.worksheets[0];
  // find the row whose second cell is the first learner's name
  const name1 = 'Bautista, Andres';
  let row1;
  ws.eachRow((row) => { if (row.getCell(2).value === name1) row1 = row; });
  expect(row1).toBeTruthy();
  // day 1 cell shows 'A', day 2 blank; present total 1, absent total 1
  expect(row1.getCell(3).value).toBe('A');
  expect(row1.getCell(4).value === '' || row1.getCell(4).value == null).toBe(true);
  const totalsCol = 3 + schoolDays.length;      // must match sf2.js
  expect(row1.getCell(totalsCol).value).toBe(1);     // Present total
  expect(row1.getCell(totalsCol + 1).value).toBe(1); // Absent total
});
