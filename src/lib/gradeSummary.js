import { isSHS } from './constants.js';
import { capsName } from './roster.js';

// Enrolled learners per section for one school year, split by sex. Only 'enrolled' rows count, so
// withdrawn learners never reach the Sections table or the exported image. `total` counts every
// enrolled row; a learner whose record is missing or has no sex adds to Total only.
export function sectionCounts(enrollments, students, schoolYear) {
  const sexById = new Map(students.map((student) => [student.id, student.sex]));
  const counts = new Map();
  enrollments.forEach((enrollment) => {
    if (enrollment.schoolYear !== schoolYear || enrollment.status !== 'enrolled') return;
    const count = counts.get(enrollment.sectionId) || { male: 0, female: 0, total: 0 };
    count.total += 1;
    const sex = sexById.get(enrollment.studentId);
    if (sex === 'M') count.male += 1;
    else if (sex === 'F') count.female += 1;
    counts.set(enrollment.sectionId, count);
  });
  return counts;
}

const NO_ONE = { male: 0, female: 0, total: 0 };

// The rows behind the grade image: one grade's sections for one school year, in the order given
// (the Sections table order), with the same numbers the table's Enrolled column shows.
// `counts` is the sectionCounts Map and `schedules` maps a schedule id to its record.
export function gradeSummary({ grade, sections, counts, schedules, schoolYear }) {
  const rows = sections
    .filter((section) => Number(section.gradeLevel) === Number(grade) && section.schoolYear === schoolYear)
    .map((section) => {
      const { male, female, total } = counts.get(section.id) || NO_ONE;
      return {
        id: section.id,
        name: section.name,
        strand: section.strand || '',
        adviser: capsName(section.adviserName),
        schedule: schedules.get(section.scheduleId)?.name || '',
        male, female, total,
      };
    });
  const totals = rows.reduce((sum, row) => ({
    sections: sum.sections + 1, male: sum.male + row.male, female: sum.female + row.female, total: sum.total + row.total,
  }), { sections: 0, male: 0, female: 0, total: 0 });
  return { grade: Number(grade), schoolYear, hasStrand: isSHS(grade), rows, totals, unknownSex: totals.total - totals.male - totals.female };
}

export const gradeImageFilename = (grade, schoolYear) =>
  `BNHS-Grade-${Number(grade)}-Sections-SY${String(schoolYear).replace(/[^\w-]/g, '')}.png`;
