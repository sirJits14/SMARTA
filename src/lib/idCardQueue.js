import { byLastThenFirstName } from './roster.js';
import { ID_CARD_PRINT_LAYOUT } from '../pages/idCardPrintLayout.js';
import { isOfficialCardPrinted } from '../../shared/tempPass.js';

// A card is current only if it was printed for the learner's present LRN:
// the QR encodes the LRN, so a corrected LRN makes the old card wrong.
export const isIdCardPrinted = isOfficialCardPrinted;

export const sectionShortLabel = (section) =>
  section ? [section.gradeLevel, section.name, section.strand].filter(Boolean).join(' · ') : '';

const SEX_RANK = { M: 0, F: 1 };
const sexRank = (student) => SEX_RANK[student.sex] ?? 2;

// Grade, then section, then DepEd order (males, then females, each by last
// then first name) -- the order a single-section print already uses.
export function sortIdCardBatch(entries) {
  return [...entries].sort((a, b) =>
    Number(a.section.gradeLevel) - Number(b.section.gradeLevel) ||
    a.section.name.localeCompare(b.section.name) ||
    a.section.id.localeCompare(b.section.id) ||
    sexRank(a.student) - sexRank(b.student) ||
    byLastThenFirstName(a.student, b.student));
}

// Everyone who can get a card this school year: enrolled, with a section
// and an LRN (the QR encodes the LRN). In print order.
export function enrolledEntries({ students, enrollments, sections, schoolYear }) {
  const studentById = new Map(students.map((s) => [s.id, s]));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const entries = [];
  const added = new Set();
  for (const enrollment of enrollments) {
    if (enrollment.schoolYear !== schoolYear || enrollment.status !== 'enrolled') continue;
    const student = studentById.get(enrollment.studentId);
    const section = sectionById.get(enrollment.sectionId);
    if (!student || !section || !String(student.lrn ?? '').trim() || added.has(student.id)) continue;
    added.add(student.id);
    entries.push({ student, section });
  }
  return sortIdCardBatch(entries);
}

// Splits the saved batch into what will print now and what can't yet. Only
// ids are saved, so a card always shows the learner's current details.
export function buildBatchView({ batchDocs, enrolled, students }) {
  const entryById = new Map(enrolled.map((e) => [e.student.id, e]));
  const studentById = new Map(students.map((s) => [s.id, s]));
  const printable = [];
  const notPrintable = [];
  for (const { id } of batchDocs) {
    const entry = entryById.get(id);
    if (entry) printable.push(entry);
    else notPrintable.push({ id, student: studentById.get(id) || null });
  }
  notPrintable.sort((a, b) =>
    (!a.student) - (!b.student) ||
    (a.student && b.student ? byLastThenFirstName(a.student, b.student) || a.id.localeCompare(b.id) : a.id.localeCompare(b.id)));
  return { printable: sortIdCardBatch(printable), notPrintable };
}

const sheetsLabel = (k) => `${k} full sheet${k === 1 ? '' : 's'}`;

export function sheetFillLabel(n) {
  const perSheet = ID_CARD_PRINT_LAYOUT.cardsPerSheet;
  const full = Math.floor(n / perSheet);
  const rest = n % perSheet;
  if (n === 0) return '';
  if (rest === 0) return sheetsLabel(full);
  if (full === 0) return `${n} of ${perSheet} — ${perSheet - n} more fills a sheet`;
  return `${sheetsLabel(full)} + ${rest} — ${perSheet - rest} more fills the next sheet`;
}

// Expects entries in print order (see sortIdCardBatch).
export function groupBySection(entries) {
  const groups = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last?.section.id === entry.section.id) last.entries.push(entry);
    else groups.push({ section: entry.section, entries: [entry] });
  }
  return groups;
}

export const cardsLabel = (n) => `${n} card${n === 1 ? '' : 's'}`;

// Translucent print colors for telling sections apart on a mixed batch sheet.
// Ordered so each hue sits far from the one before it: sections are printed
// packed one after another, so neighbours always get consecutive colors.
export const SECTION_PRINT_COLORS = Object.freeze([
  'rgba(0, 150, 160, 0.6)', // teal
  'rgba(240, 120, 0, 0.6)', // orange
  'rgba(130, 60, 200, 0.6)', // purple
  'rgba(40, 160, 60, 0.6)', // green
  'rgba(220, 40, 120, 0.6)', // magenta
  'rgba(140, 85, 40, 0.6)', // brown
  'rgba(30, 100, 220, 0.6)', // blue
  'rgba(200, 160, 0, 0.65)', // gold
  'rgba(90, 100, 115, 0.6)', // slate
  'rgba(210, 40, 40, 0.6)', // red
]);

// Section id -> print color, in order of first appearance. Expects entries
// in print order (see sortIdCardBatch).
export function sectionColorMap(entries) {
  const colors = new Map();
  for (const { section } of entries) {
    if (!colors.has(section.id)) colors.set(section.id, SECTION_PRINT_COLORS[colors.size % SECTION_PRINT_COLORS.length]);
  }
  return colors;
}

// Card frames print fainter than the key: the same hue at 30% opacity.
export const SECTION_BORDER_OPACITY = 0.3;
export const sectionBorderColor = (color) => color.replace(/, [\d.]+\)$/, `, ${SECTION_BORDER_OPACITY})`);

export const sectionLegendLabel = (section) =>
  [`G${section.gradeLevel}`, section.name, section.strand].filter(Boolean).join(' ');
