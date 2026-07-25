import ExcelJS from 'exceljs';
import { validateStudent } from './validation.js';
import { GRADES, ENROLL_TYPE } from './constants.js';
import { localDate } from './dates.js';

export const TEMPLATE_HEADERS = [
  'LRN', 'Last Name', 'First Name', 'Middle Name', 'Ext (Jr/III)', 'Sex',
  'Birthdate (YYYY-MM-DD)', 'Address', 'Guardian Name', 'Guardian Relationship',
  'Guardian Contact', 'Contact Number', 'Grade Level', 'Section',
  'Enrollment Type (new/returning/transferee)',
];

const EXAMPLE_ROW = [
  '123456789012', 'Dela Cruz', 'Juan', 'Santos', 'Jr', 'M',
  '2012-05-01', '123 Rizal St., Malaybalay City', 'Maria Dela Cruz', 'Mother',
  '09171234567', '09181234567', '7', 'Rizal', 'new',
];

// LRN, Guardian Contact, Contact Number: format as text so Excel doesn't
// coerce long all-digit strings to numbers and drop leading zeros.
const TEXT_FORMAT_COLUMNS = [1, 11, 12];

export function buildImportTemplateWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Students');
  ws.addRow(TEMPLATE_HEADERS);
  TEXT_FORMAT_COLUMNS.forEach((i) => { ws.getColumn(i).numFmt = '@'; });
  ws.addRow(EXAMPLE_ROW);
  return wb;
}

function cellText(row, i) {
  return String(row.getCell(i).value ?? '').trim();
}

function cellDate(row, i) {
  const v = row.getCell(i).value;
  return v instanceof Date ? localDate(v) : String(v ?? '').trim();
}

function rowIsBlank(row) {
  for (let i = 1; i <= TEMPLATE_HEADERS.length; i++) {
    if (String(row.getCell(i).value ?? '').trim() !== '') return false;
  }
  return true;
}

export function parseWorksheetRows(worksheet) {
  const headerRow = worksheet.getRow(1);
  const headersMatch = TEMPLATE_HEADERS.every((h, i) => cellText(headerRow, i + 1) === h);
  if (!headersMatch) {
    return {
      headerError: "This file's columns don't match the template. Download a fresh template and re-enter the data.",
      rows: [],
    };
  }
  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || rowIsBlank(row)) return;
    rows.push({
      rowNumber,
      lrn: cellText(row, 1),
      lastName: cellText(row, 2),
      firstName: cellText(row, 3),
      middleName: cellText(row, 4),
      extName: cellText(row, 5),
      sex: cellText(row, 6).toUpperCase(),
      birthdate: cellDate(row, 7),
      address: cellText(row, 8),
      guardianName: cellText(row, 9),
      guardianRelationship: cellText(row, 10),
      guardianContact: cellText(row, 11),
      contactNumber: cellText(row, 12),
      gradeLevel: cellText(row, 13),
      section: cellText(row, 14),
      enrollType: cellText(row, 15).toLowerCase() || 'new',
    });
  });
  return { headerError: null, rows };
}

export function sectionKey(gradeLevel, name) {
  return `${gradeLevel}::${name.trim().toLowerCase()}`;
}

export function classifyImportRows({ rows, students, sections, schoolYear }) {
  const studentByLrn = new Map(students.map((s) => [s.lrn, s]));
  const existingSectionKeys = new Set(
    sections.filter((s) => s.schoolYear === schoolYear).map((s) => sectionKey(s.gradeLevel, s.name))
  );
  const newSections = new Map(); // key -> {key, gradeLevel, name}
  const seenLrns = new Map();    // lrn -> first rowNumber seen in this file

  const results = rows.map((row) => {
    const errors = { ...validateStudent(row).errors };
    const gradeLevel = Number(row.gradeLevel);
    if (!GRADES.includes(gradeLevel)) errors.gradeLevel = 'Grade level must be 7-12.';
    if (!row.section) errors.section = 'Section is required.';
    if (!ENROLL_TYPE.includes(row.enrollType)) errors.enrollType = 'Enrollment type must be new, returning, or transferee.';

    if (!errors.lrn) {
      if (seenLrns.has(row.lrn)) {
        errors.lrn = `Duplicate LRN — already used by row ${seenLrns.get(row.lrn)} in this file.`;
      } else {
        seenLrns.set(row.lrn, row.rowNumber);
      }
    }

    if (Object.keys(errors).length > 0) {
      return {
        rowNumber: row.rowNumber, kind: 'error', errors, student: null,
        existingStudentId: null, gradeLevel: null, sectionName: null, sectionKey: null, enrollType: null,
      };
    }

    const existing = studentByLrn.get(row.lrn);
    const key = sectionKey(gradeLevel, row.section);
    if (!existingSectionKeys.has(key) && !newSections.has(key)) {
      newSections.set(key, { key, gradeLevel, name: row.section.trim() });
    }

    return {
      rowNumber: row.rowNumber,
      kind: existing ? 'update' : 'new',
      errors: null,
      existingStudentId: existing ? existing.id : null,
      student: {
        lrn: row.lrn, lastName: row.lastName, firstName: row.firstName,
        middleName: row.middleName, extName: row.extName, sex: row.sex,
        birthdate: row.birthdate, address: row.address,
        guardianName: row.guardianName, guardianRelationship: row.guardianRelationship,
        guardianContact: row.guardianContact, contactNumber: row.contactNumber,
      },
      gradeLevel, sectionName: row.section.trim(), sectionKey: key, enrollType: row.enrollType,
    };
  });

  return {
    results,
    newSections: [...newSections.values()],
    summary: {
      newCount: results.filter((r) => r.kind === 'new').length,
      updateCount: results.filter((r) => r.kind === 'update').length,
      errorCount: results.filter((r) => r.kind === 'error').length,
      newSectionsCount: newSections.size,
    },
  };
}
