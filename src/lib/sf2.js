import ExcelJS from 'exceljs';
import sf2TemplateUrl from '../assets/sf2-template.xlsx?url';
import { fullName } from './roster.js';
import { splitByGender, rowsFor, dailyTallies, summaryFigures } from './sf2Template.js';

const DAY_LETTER = ['S', 'M', 'T', 'W', 'TH', 'F', 'S']; // Date#getDay() index 0=Sun..6=Sat

function writeRoster(ws, students, schoolDays, docsByDate, startRow, startIndex) {
  const rows = rowsFor(students, schoolDays, docsByDate);
  rows.forEach((row, i) => {
    const r = ws.getRow(startRow + i);
    r.getCell(1).value = startIndex + i + 1; // A: running count, continues across overflow pages
    r.getCell(2).value = fullName(row.student); // B (anchor of the B:C merge)
    row.marks.forEach((mark, dayIdx) => { r.getCell(4 + dayIdx).value = mark; }); // D..AB
    r.getCell(29).value = row.absentTotal; // AC
    r.getCell(30).value = row.tardyTotal; // AD
  });
}

function writeDailyTotals(ws, students, schoolDays, docsByDate, row) {
  const tallies = dailyTallies(students, schoolDays, docsByDate);
  tallies.forEach((count, dayIdx) => { ws.getRow(row).getCell(4 + dayIdx).value = count; });
  return tallies;
}

function fillSheet(ws, { section, male, female, schoolDays, docsByDate, monthLabelText, schoolId, schoolName, enrolledAsOfCutoff, summary, startIndex, pageLabel }) {
  ws.getCell('C6').value = schoolId;
  ws.getCell('K6').value = section.schoolYear;
  ws.getCell('X6').value = monthLabelText;
  ws.getCell('C8').value = schoolName;
  ws.getCell('X8').value = section.gradeLevel;
  ws.getCell('AC8').value = section.name;

  schoolDays.forEach((date, i) => {
    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    ws.getRow(11).getCell(4 + i).value = d;
    ws.getRow(12).getCell(4 + i).value = DAY_LETTER[dow];
  });

  writeRoster(ws, male, schoolDays, docsByDate, 14, startIndex.male);
  writeRoster(ws, female, schoolDays, docsByDate, 36, startIndex.female);
  const maleTallies = writeDailyTotals(ws, male, schoolDays, docsByDate, 35);
  const femaleTallies = writeDailyTotals(ws, female, schoolDays, docsByDate, 61);
  schoolDays.forEach((_, i) => {
    ws.getRow(62).getCell(4 + i).value = maleTallies[i] + femaleTallies[i];
  });

  ws.getCell('AJ66').value = enrolledAsOfCutoff; // no per-gender breakdown available for this historical cutoff figure; only the combined total is written
  ws.getCell('AH70').value = summary.maleTotal;
  ws.getCell('AI70').value = summary.femaleTotal;
  ws.getCell('AJ70').value = summary.registeredEndOfMonth;
  ws.getCell('AJ72').value = summary.percentEnrolment;
  ws.getCell('AJ74').value = summary.avgDailyAttendance;
  ws.getCell('AJ75').value = summary.percentAttendance;
  ws.getCell('AC64').value = monthLabelText;
  ws.getCell('AG64').value = schoolDays.length;

  ws.getCell('AD88').value = section.adviserName || '';
  ws.getCell('A92').value = `School Form 2: Page ${pageLabel}`;
}

export async function buildSF2Workbook({ section, roster, schoolDays, docsByDate, monthLabelText, schoolId, schoolName, enrolledAsOfCutoff }) {
  const res = await fetch(sf2TemplateUrl);
  const buffer = await res.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const templateSheet = wb.worksheets[0];

  const { male, female } = splitByGender(roster);
  const MALE_CAP = 21;
  const FEMALE_CAP = 25;

  const registeredEndOfMonth = male.length + female.length;
  const maleTallies = dailyTallies(male, schoolDays, docsByDate);
  const femaleTallies = dailyTallies(female, schoolDays, docsByDate);
  const dailyTalliesCombined = schoolDays.map((_, i) => maleTallies[i] + femaleTallies[i]);
  const { percentEnrolment, avgDailyAttendance, percentAttendance } =
    summaryFigures({ enrolledAsOfCutoff, registeredEndOfMonth, dailyTalliesCombined, schoolDays });
  const summary = {
    maleTotal: male.length,
    femaleTotal: female.length,
    registeredEndOfMonth,
    percentEnrolment,
    avgDailyAttendance,
    percentAttendance,
  };

  if (male.length <= MALE_CAP && female.length <= FEMALE_CAP) {
    fillSheet(templateSheet, { section, male, female, schoolDays, docsByDate, monthLabelText, schoolId, schoolName, enrolledAsOfCutoff, summary, startIndex: { male: 0, female: 0 }, pageLabel: '1 of 1' });
    return wb;
  }

  // Overflow: one section's roster exceeds this page's fixed row capacity.
  // Continue onto additional cloned copies of the same template sheet,
  // matching the official form's own "Page __ of __" convention.
  const maleChunks = chunk(male, MALE_CAP);
  const femaleChunks = chunk(female, FEMALE_CAP);
  const pageCount = Math.max(maleChunks.length, femaleChunks.length, 1);

  // Clone every extra sheet from templateSheet while it is still pristine --
  // BEFORE any fillSheet call writes data into it. Filling page 1 first and
  // cloning from it afterward would copy page 1's own rows/values onto
  // every overflow page (target.model = {...source.model} copies cell data,
  // not just layout), leaving stale duplicate rows on every page after the
  // first.
  const sheets = [templateSheet];
  for (let i = 1; i < pageCount; i++) {
    const ws = wb.addWorksheet(`SF2 (${i + 1})`, { properties: templateSheet.properties });
    cloneSheetLayout(templateSheet, ws);
    sheets.push(ws);
  }

  let maleSeen = 0;
  let femaleSeen = 0;
  for (let i = 0; i < pageCount; i++) {
    const maleChunk = maleChunks[i] || [];
    const femaleChunk = femaleChunks[i] || [];
    fillSheet(sheets[i], {
      section,
      male: maleChunk,
      female: femaleChunk,
      schoolDays, docsByDate, monthLabelText, schoolId, schoolName, enrolledAsOfCutoff,
      summary, startIndex: { male: maleSeen, female: femaleSeen }, pageLabel: `${i + 1} of ${pageCount}`,
    });
    maleSeen += maleChunk.length;
    femaleSeen += femaleChunk.length;
  }
  return wb;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function cloneSheetLayout(source, target) {
  target.model = { ...source.model, name: target.name, id: target.id };
  source.model.merges.forEach((range) => target.mergeCells(range));
}
