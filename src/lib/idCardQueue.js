import { byLastThenFirstName } from './roster.js';

// A card is current only if it was printed for the learner's present LRN:
// the QR encodes the LRN, so a corrected LRN makes the old card wrong.
export function isIdCardPrinted(student) {
  return !!student?.idCard?.printedAt && student.idCard.lrn === student.lrn;
}

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

export function buildIdCardQueue({ students, enrollments, sections, schoolYear }) {
  const studentById = new Map(students.map((s) => [s.id, s]));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const eligible = [];
  let missingLrnCount = 0;
  for (const enrollment of enrollments) {
    if (enrollment.schoolYear !== schoolYear || enrollment.status !== 'enrolled') continue;
    const student = studentById.get(enrollment.studentId);
    const section = sectionById.get(enrollment.sectionId);
    // An enrollment whose learner or section was deleted has no card to print.
    if (!student || !section) continue;
    if (!String(student.lrn ?? '').trim()) { missingLrnCount += 1; continue; }
    eligible.push({ student, section });
  }
  const sorted = sortIdCardBatch(eligible);
  return { eligible: sorted, queue: sorted.filter((e) => !isIdCardPrinted(e.student)), missingLrnCount };
}

// What the Print queue tab lists: everyone still unprinted plus anyone
// added by hand. `eligible` is already in print order, so filtering keeps it.
export const listQueueEntries = (eligible, addedIds) =>
  eligible.filter((e) => !isIdCardPrinted(e.student) || addedIds.has(e.student.id));

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
