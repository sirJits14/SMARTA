export const SCHOOL_YEAR = '2026-2027';

const schedules = [{ id: 'AM', name: 'Morning Shift' }, { id: 'PM', name: 'Afternoon Shift' }];
const sections = [
  { id: 'g8-mabini', gradeLevel: 8, name: 'Mabini', adviserName: 'Ana Cruz', scheduleId: 'AM', schoolYear: SCHOOL_YEAR },
  { id: 'g8-rizal', gradeLevel: 8, name: 'Rizal', adviserName: 'Maria Cristina Dela Cruz-Santos', scheduleId: 'PM', schoolYear: SCHOOL_YEAR },
  { id: 'g8-bonifacio', gradeLevel: 8, name: 'Bonifacio', schoolYear: SCHOOL_YEAR },
  { id: 'g11-newton', gradeLevel: 11, name: 'Newton', adviserName: 'Cora Tan', scheduleId: 'AM', track: 'Academic', strand: 'STEM', schoolYear: SCHOOL_YEAR },
  { id: 'g11-bakery', gradeLevel: 11, name: 'Bakery', adviserName: 'Eva Santos', scheduleId: 'PM', track: 'TVL', strand: 'Home Economics', schoolYear: SCHOOL_YEAR },
  { id: 'g8-next', gradeLevel: 8, name: 'Aquino', adviserName: 'Ben Dy', scheduleId: 'AM', schoolYear: '2027-2028' },
];

const students = [];
const enrollments = [];
// One enrolled learner per head, so a section's counts are exactly the numbers given. A '' key makes
// learners with no sex on record.
const enroll = (sectionId, gradeLevel, counts) => {
  Object.entries(counts).forEach(([sex, count]) => {
    for (let i = 0; i < count; i += 1) {
      const id = `${sectionId}-${sex || 'none'}-${i}`;
      students.push({ id, sex });
      enrollments.push({ studentId: id, sectionId, gradeLevel, schoolYear: SCHOOL_YEAR, status: 'enrolled' });
    }
  });
};
enroll('g8-mabini', 8, { M: 21, F: 19 });
enroll('g8-rizal', 8, { M: 20, F: 20 });
enroll('g11-newton', 11, { M: 18, F: 22 });
enroll('g11-bakery', 11, { M: 3, F: 30, '': 1 });
// A transferred learner must not be counted.
enrollments.push({ studentId: 'gone', sectionId: 'g8-mabini', gradeLevel: 8, schoolYear: SCHOOL_YEAR, status: 'transferred' });

const collections = { sections, enrollments, students, schedules };

export function useStaffCollectionResource(path) {
  return { data: collections[path] ?? [], loading: false, error: null, retry: () => {} };
}
