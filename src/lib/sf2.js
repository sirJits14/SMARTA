import ExcelJS from 'exceljs';
import sf2TemplateUrl from '../assets/sf2-template.xlsx?url';
import { fullName } from './roster.js';
import { splitByGender, rowsFor, dailyTallies, summaryFigures, mondayAlignmentOffset } from './sf2Template.js';

const DAY_LETTER = ['S', 'M', 'T', 'W', 'TH', 'F', 'S']; // Date#getDay() index 0=Sun..6=Sat

// Original template coordinates. Insert before each group's final row so
// its bottom border stays next to the total, moving the summary/signatures too.
const MALE_START = 14;
const MALE_TOTAL = 35;
const FEMALE_START = 36;
const FEMALE_TOTAL = 61;

function expandRosterRows(ws, maleCount, femaleCount) {
  const maleExtra = Math.max(0, maleCount - (MALE_TOTAL - MALE_START));
  const femaleExtra = Math.max(0, femaleCount - (FEMALE_TOTAL - FEMALE_START));
  const rowNumber = (row) => row
    + (row >= MALE_TOTAL - 1 ? maleExtra : 0)
    + (row >= FEMALE_TOTAL - 1 ? femaleExtra : 0);
  if (!maleExtra && !femaleExtra) return rowNumber;

  // ExcelJS row splicing does not reliably move merged ranges. Rebuild the
  // template's row models and merges together, retaining individual cell
  // styles (especially the outer borders of merged names/remarks).
  const model = structuredClone(ws.model);
  const shiftAddress = (address, shift) => address.replace(/\d+$/, (row) => Number(row) + shift);
  const moveRow = (source, number) => ({
    ...source,
    number,
    cells: source.cells.map((cell) => {
      const moved = { ...cell, address: shiftAddress(cell.address, number - source.number) };
      if (moved.type === ExcelJS.ValueType.Merge) {
        // Restore as styled blank cells; the ranges below recreate the merges.
        moved.type = ExcelJS.ValueType.Null;
        delete moved.master;
      }
      return moved;
    }),
  });
  const rows = model.rows.map((row) => moveRow(row, rowNumber(row.number)));
  const merges = model.merges.map((range) => range.replace(/\d+/g, (row) => rowNumber(Number(row))));

  for (const [totalRow, extra] of [[MALE_TOTAL, maleExtra], [FEMALE_TOTAL, femaleExtra]]) {
    // Copy an interior blank student row, avoiding the group's top/bottom edges.
    const source = model.rows.find((row) => row.number === totalRow - 2);
    const sourceMerges = model.merges.filter((range) =>
      range.split(':').every((address) => Number(address.match(/\d+$/)[0]) === source.number));
    const firstNewRow = totalRow - 1 + (totalRow === FEMALE_TOTAL ? maleExtra : 0);
    for (let i = 0; i < extra; i++) {
      const number = firstNewRow + i;
      rows.push(moveRow(source, number));
      merges.push(...sourceMerges.map((range) =>
        range.split(':').map((address) => shiftAddress(address, number - source.number)).join(':')));
    }
  }
  model.merges.forEach((range) => ws.unMergeCells(range));
  ws.model = { ...model, rows: rows.sort((a, b) => a.number - b.number), mergeCells: merges };
  // Keep the form one page wide, allowing a longer roster to print over
  // multiple pages without shrinking every student name to fit one page.
  ws.pageSetup = { ...ws.pageSetup, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return rowNumber;
}

function writeRoster(ws, students, schoolDays, docsByDate, startRow, colOffset) {
  const rows = rowsFor(students, schoolDays, docsByDate);
  rows.forEach((row, i) => {
    const r = ws.getRow(startRow + i);
    r.getCell(1).value = i + 1; // A: running count within each gender
    r.getCell(2).value = fullName(row.student); // B (anchor of the B:C merge)
    row.marks.forEach((mark, dayIdx) => { r.getCell(4 + colOffset + dayIdx).value = mark; }); // D..AB, shifted by the Monday-alignment offset
    r.getCell(29).value = row.absentTotal; // AC
    r.getCell(30).value = row.tardyTotal; // AD
  });
}

function writeDailyTotals(ws, students, schoolDays, docsByDate, row, colOffset) {
  const tallies = dailyTallies(students, schoolDays, docsByDate);
  tallies.forEach((count, dayIdx) => { ws.getRow(row).getCell(4 + colOffset + dayIdx).value = count; });
  return tallies;
}

function fillSheet(ws, { section, male, female, schoolDays, docsByDate, monthLabelText, schoolId, schoolName, enrolledAsOfCutoff, summary, rowNumber }) {
  const cell = (address) => ws.getCell(address.replace(/\d+$/, (row) => rowNumber(Number(row))));
  ws.getCell('C6').value = schoolId;
  ws.getCell('K6').value = section.schoolYear;
  ws.getCell('X6').value = monthLabelText;
  ws.getCell('C8').value = schoolName;
  ws.getCell('X8').value = section.gradeLevel;
  ws.getCell('AC8').value = section.name;

  const colOffset = mondayAlignmentOffset(schoolDays);

  schoolDays.forEach((date, i) => {
    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    ws.getRow(11).getCell(4 + colOffset + i).value = d;
    ws.getRow(12).getCell(4 + colOffset + i).value = DAY_LETTER[dow];
  });

  writeRoster(ws, male, schoolDays, docsByDate, rowNumber(MALE_START), colOffset);
  writeRoster(ws, female, schoolDays, docsByDate, rowNumber(FEMALE_START), colOffset);
  const maleTallies = writeDailyTotals(ws, male, schoolDays, docsByDate, rowNumber(MALE_TOTAL), colOffset);
  const femaleTallies = writeDailyTotals(ws, female, schoolDays, docsByDate, rowNumber(FEMALE_TOTAL), colOffset);
  schoolDays.forEach((_, i) => {
    ws.getRow(rowNumber(62)).getCell(4 + colOffset + i).value = maleTallies[i] + femaleTallies[i];
  });

  // No real historical-enrollment-date tracking exists yet (dateEnrolled is
  // set to the day a registrar keys the record in, not the student's actual
  // enrollment date), so a cutoff count of exactly 0 almost always means "no
  // data available" rather than a real zero -- leave both figures blank for
  // the registrar to fill in by hand instead of printing a misleading 0/0%.
  if (enrolledAsOfCutoff > 0) {
    cell('AJ66').value = enrolledAsOfCutoff;
    cell('AJ72').value = summary.percentEnrolment;
  }
  cell('AH70').value = summary.maleTotal;
  cell('AI70').value = summary.femaleTotal;
  cell('AJ70').value = summary.registeredEndOfMonth;
  cell('AH74').value = summary.maleAvgDailyAttendance;
  cell('AI74').value = summary.femaleAvgDailyAttendance;
  cell('AJ74').value = summary.avgDailyAttendance;
  // AH75 alone (unlike its row-mates AI75/AJ75) carries a pre-existing '0%'
  // number format in the real template -- Excel would multiply our already-
  // in-percentage-points value by 100 again for display (e.g. 98.4 -> a
  // garbled "9840%"). Override it so all three cells in the row render the
  // same plain-number way.
  cell('AH75').numFmt = 'General';
  cell('AH75').value = summary.malePercentAttendance;
  cell('AI75').value = summary.femalePercentAttendance;
  cell('AJ75').value = summary.percentAttendance;
  cell('AC64').value = monthLabelText;
  cell('AG64').value = schoolDays.length;

  cell('AD88').value = section.adviserName || '';
}

export async function buildSF2Workbook({ section, roster, schoolDays, docsByDate, monthLabelText, schoolId, schoolName, enrolledAsOfCutoff }) {
  const res = await fetch(sf2TemplateUrl);
  const buffer = await res.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const templateSheet = wb.worksheets[0];

  const { male, female } = splitByGender(roster);
  const rowNumber = expandRosterRows(templateSheet, male.length, female.length);

  const registeredEndOfMonth = male.length + female.length;
  const maleTallies = dailyTallies(male, schoolDays, docsByDate);
  const femaleTallies = dailyTallies(female, schoolDays, docsByDate);
  const dailyTalliesCombined = schoolDays.map((_, i) => maleTallies[i] + femaleTallies[i]);
  const { percentEnrolment, avgDailyAttendance, percentAttendance } =
    summaryFigures({ enrolledAsOfCutoff, registeredEndOfMonth, dailyTalliesCombined, schoolDays });
  const maleFigures = summaryFigures({ enrolledAsOfCutoff: 0, registeredEndOfMonth: male.length, dailyTalliesCombined: maleTallies, schoolDays });
  const femaleFigures = summaryFigures({ enrolledAsOfCutoff: 0, registeredEndOfMonth: female.length, dailyTalliesCombined: femaleTallies, schoolDays });
  const summary = {
    maleTotal: male.length,
    femaleTotal: female.length,
    registeredEndOfMonth,
    percentEnrolment,
    avgDailyAttendance,
    percentAttendance,
    maleAvgDailyAttendance: maleFigures.avgDailyAttendance,
    malePercentAttendance: maleFigures.percentAttendance,
    femaleAvgDailyAttendance: femaleFigures.avgDailyAttendance,
    femalePercentAttendance: femaleFigures.percentAttendance,
  };

  fillSheet(templateSheet, {
    section, male, female, schoolDays, docsByDate, monthLabelText,
    schoolId, schoolName, enrolledAsOfCutoff, summary, rowNumber,
  });
  return wb;
}
