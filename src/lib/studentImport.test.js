import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  TEMPLATE_HEADERS, buildImportTemplateWorkbook, parseWorksheetRows,
  classifyImportRows, sectionKey,
} from './studentImport.js';

function worksheetFrom(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Students');
  rows.forEach((r) => ws.addRow(r));
  return ws;
}

const GOOD_ROW = ['123456789012','Dela Cruz','Juan','Santos','Jr','M','2012-05-01','','','','','','7','Rizal','new'];

describe('buildImportTemplateWorkbook', () => {
  it('writes the header row and one example row', () => {
    const wb = buildImportTemplateWorkbook();
    const ws = wb.worksheets[0];
    TEMPLATE_HEADERS.forEach((h, i) => expect(ws.getRow(1).getCell(i + 1).value).toBe(h));
    expect(ws.getRow(2).getCell(1).value).toBeTruthy();
  });
});

describe('parseWorksheetRows', () => {
  it('parses data rows and skips a fully blank row', () => {
    const ws = worksheetFrom([
      TEMPLATE_HEADERS,
      GOOD_ROW,
      Array(15).fill(''),
      ['223456789012','Reyes','Ana','','','F','2011-03-02','','','','','','8','Bonifacio',''],
    ]);
    const { headerError, rows } = parseWorksheetRows(ws);
    expect(headerError).toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ lrn:'123456789012', lastName:'Dela Cruz', gradeLevel:'7', section:'Rizal', enrollType:'new' });
    expect(rows[1].enrollType).toBe('new'); // blank enrollType defaults to 'new'
  });

  it('normalizes a real Excel date cell to YYYY-MM-DD', () => {
    const ws = worksheetFrom([TEMPLATE_HEADERS, GOOD_ROW]);
    ws.getRow(2).getCell(7).value = new Date(2012, 4, 1); // May 1 2012
    const { rows } = parseWorksheetRows(ws);
    expect(rows[0].birthdate).toBe('2012-05-01');
  });

  it('flags a header mismatch instead of parsing rows', () => {
    const ws = worksheetFrom([['Wrong', 'Headers'], GOOD_ROW]);
    const { headerError, rows } = parseWorksheetRows(ws);
    expect(headerError).toMatch(/template/i);
    expect(rows).toHaveLength(0);
  });
});

describe('classifyImportRows', () => {
  const schoolYear = '2026-2027';
  const students = [{ id:'s1', lrn:'111111111111' }];
  const sections = [{ id:'sec1', schoolYear, gradeLevel:7, name:'Rizal', track:null, strand:null }];

  const row = (over = {}) => ({
    rowNumber: 2, lrn:'222222222222', lastName:'Reyes', firstName:'Ana', middleName:'', extName:'',
    sex:'F', birthdate:'2011-03-02', address:'', guardianName:'', guardianRelationship:'',
    guardianContact:'', contactNumber:'', gradeLevel:'7', section:'Rizal', enrollType:'new', ...over,
  });

  it('classifies a brand-new LRN as new, matching an existing section', () => {
    const { results, newSections, summary } = classifyImportRows({ rows:[row()], students, sections, schoolYear });
    expect(results[0].kind).toBe('new');
    expect(results[0].sectionKey).toBe(sectionKey(7, 'Rizal'));
    expect(newSections).toHaveLength(0);
    expect(summary).toEqual({ newCount:1, updateCount:0, errorCount:0, newSectionsCount:0 });
  });

  it('classifies a matching LRN as update, carrying the existing student id', () => {
    const { results } = classifyImportRows({ rows:[row({ lrn:'111111111111' })], students, sections, schoolYear });
    expect(results[0].kind).toBe('update');
    expect(results[0].existingStudentId).toBe('s1');
  });

  it('flags missing/invalid fields as errors', () => {
    const { results, summary } = classifyImportRows({ rows:[row({ lrn:'bad', lastName:'', sex:'X', gradeLevel:'99' })], students, sections, schoolYear });
    expect(results[0].kind).toBe('error');
    expect(Object.keys(results[0].errors).sort()).toEqual(['gradeLevel','lastName','lrn','sex']);
    expect(summary.errorCount).toBe(1);
  });

  it('queues a new section, case-insensitively deduped against an existing one', () => {
    const rows = [
      row({ lrn:'222222222222', section:'Rizal' }),
      row({ lrn:'333333333333', gradeLevel:'8', section:'Bonifacio' }),
      row({ lrn:'444444444444', gradeLevel:'8', section:'bonifacio' }),
    ];
    const { newSections, summary } = classifyImportRows({ rows, students, sections, schoolYear });
    expect(newSections).toEqual([{ key: sectionKey(8, 'Bonifacio'), gradeLevel:8, name:'Bonifacio' }]);
    expect(summary.newSectionsCount).toBe(1);
  });

  it('flags a second row reusing a new LRN already claimed earlier in the same file', () => {
    const rows = [row({ lrn:'222222222222' }), row({ rowNumber:3, lrn:'222222222222' })];
    const { results, summary } = classifyImportRows({ rows, students, sections, schoolYear });
    expect(results[0].kind).toBe('new');
    expect(results[1].kind).toBe('error');
    expect(results[1].errors.lrn).toMatch(/duplicate/i);
    expect(summary).toEqual({ newCount:1, updateCount:0, errorCount:1, newSectionsCount:0 });
  });
});
