import ExcelJS from 'exceljs';
import { depedSort, fullName } from './roster.js';
import { markFor, summarizeMonth } from './attendance.js';

export function buildSF2Workbook({ section, roster, schoolDays, docsByDate, monthLabelText }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('SF2');
  ws.getCell('A1').value = 'DAILY ATTENDANCE REPORT OF LEARNERS (SF2)';
  ws.getCell('A2').value = `Grade ${section.gradeLevel} — ${section.name}`;
  ws.getCell('A3').value = `${monthLabelText}   SY ${section.schoolYear}`;

  const headerRow = 5;
  ws.getRow(headerRow).getCell(1).value = '#';
  ws.getRow(headerRow).getCell(2).value = 'Name';
  schoolDays.forEach((d, i) => { ws.getRow(headerRow).getCell(3 + i).value = Number(d.slice(-2)); });
  const totalsCol = 3 + schoolDays.length;
  ws.getRow(headerRow).getCell(totalsCol).value = 'Present';
  ws.getRow(headerRow).getCell(totalsCol + 1).value = 'Absent';

  const sorted = depedSort(roster);
  const totals = summarizeMonth({ roster: sorted.map((s) => s.id), schoolDays, docsByDate });
  sorted.forEach((s, idx) => {
    const r = ws.getRow(headerRow + 1 + idx);
    r.getCell(1).value = idx + 1;
    r.getCell(2).value = fullName(s);
    schoolDays.forEach((d, i) => {
      const m = markFor(docsByDate, d, s.id);
      r.getCell(3 + i).value = m === 'P' ? '' : m;
    });
    r.getCell(totalsCol).value = totals[s.id].present;
    r.getCell(totalsCol + 1).value = totals[s.id].absent;
  });
  return wb;
}
