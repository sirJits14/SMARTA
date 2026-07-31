import ExcelJS from 'exceljs';
import sf2TemplateUrl from '../assets/sf2-template.xlsx?url';
import { fullName } from './roster.js';
import { splitByGender, rowsFor, dailyTallies, summaryFigures } from './sf2Template.js';

const DAY_LETTER = ['S', 'M', 'T', 'W', 'TH', 'F', 'S']; // Date#getDay() index 0=Sun..6=Sat

function writeRoster(ws, students, schoolDays, docsByDate, startRow) {
  const rows = rowsFor(students, schoolDays, docsByDate);
  rows.forEach((row, i) => {
    const r = ws.getRow(startRow + i);
    r.getCell(1).value = i + 1; // A: running count
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

function fillSheet(ws, { section, male, female, schoolDays, docsByDate, monthLabelText, schoolId, schoolName, enrolledAsOfCutoff }) {
  ws.getCell('B6').value = schoolId;
  ws.getCell('H6').value = section.schoolYear;
  ws.getCell('Q6').value = monthLabelText;
  ws.getCell('B8').value = schoolName;
  ws.getCell('T8').value = section.gradeLevel;
  ws.getCell('Z8').value = section.name;

  schoolDays.forEach((date, i) => {
    const [, , d] = date.split('-');
    const dow = new Date(date).getDay();
    ws.getRow(11).getCell(4 + i).value = Number(d);
    ws.getRow(12).getCell(4 + i).value = DAY_LETTER[dow];
  });

  writeRoster(ws, male, schoolDays, docsByDate, 14);
  writeRoster(ws, female, schoolDays, docsByDate, 36);
  const maleTallies = writeDailyTotals(ws, male, schoolDays, docsByDate, 35);
  const femaleTallies = writeDailyTotals(ws, female, schoolDays, docsByDate, 61);
  schoolDays.forEach((_, i) => {
    ws.getRow(62).getCell(4 + i).value = maleTallies[i] + femaleTallies[i];
  });

  const registeredEndOfMonth = male.length + female.length;
  const dailyTalliesCombined = schoolDays.map((_, i) => maleTallies[i] + femaleTallies[i]);
  const { percentEnrolment, avgDailyAttendance, percentAttendance } =
    summaryFigures({ enrolledAsOfCutoff, registeredEndOfMonth, dailyTalliesCombined, schoolDays });

  ws.getCell('AH66').value = enrolledAsOfCutoff; // reuses the combined cutoff figure for M/F/Total pending per-gender history tracking
  ws.getCell('AJ66').value = enrolledAsOfCutoff;
  ws.getCell('AH70').value = male.length;
  ws.getCell('AI70').value = female.length;
  ws.getCell('AJ70').value = registeredEndOfMonth;
  ws.getCell('AJ72').value = percentEnrolment;
  ws.getCell('AJ74').value = avgDailyAttendance;
  ws.getCell('AJ75').value = percentAttendance;
  ws.getCell('AC64').value = monthLabelText;
  ws.getCell('AG64').value = schoolDays.length;

  ws.getCell('AD88').value = section.adviserName || '';
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

  if (male.length <= MALE_CAP && female.length <= FEMALE_CAP) {
    fillSheet(templateSheet, { section, male, female, schoolDays, docsByDate, monthLabelText, schoolId, schoolName, enrolledAsOfCutoff });
    return wb;
  }

  // Overflow: one section's roster exceeds this page's fixed row capacity.
  // Continue onto additional cloned copies of the same template sheet,
  // matching the official form's own "Page __ of __" convention.
  const maleChunks = chunk(male, MALE_CAP);
  const femaleChunks = chunk(female, FEMALE_CAP);
  const pageCount = Math.max(maleChunks.length, femaleChunks.length, 1);
  for (let i = 0; i < pageCount; i++) {
    const ws = i === 0 ? templateSheet : wb.addWorksheet(`SF2 (${i + 1})`, { properties: templateSheet.properties });
    if (i > 0) cloneSheetLayout(templateSheet, ws);
    fillSheet(ws, {
      section,
      male: maleChunks[i] || [],
      female: femaleChunks[i] || [],
      schoolDays, docsByDate, monthLabelText, schoolId, schoolName, enrolledAsOfCutoff,
    });
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
}
