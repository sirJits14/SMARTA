export const GRADES = [7, 8, 9, 10, 11, 12];
export const isSHS = (grade) => Number(grade) >= 11;

export const TRACKS = ['Academic', 'TVL', 'Sports', 'Arts and Design'];
export const STRANDS = {
  Academic: ['STEM', 'ABM', 'HUMSS', 'GAS'],
  TVL: ['Home Economics', 'ICT', 'Industrial Arts', 'Agri-Fishery Arts'],
  Sports: ['Sports'],
  'Arts and Design': ['Arts and Design'],
};

export const STUDENT_STATUS = ['active', 'transferred', 'dropped'];
export const ENROLL_TYPE = ['new', 'returning', 'transferee'];

export const MARKS = ['P', 'L', 'A', 'E'];
export const MARK_LABEL = { P: 'Present', L: 'Late', A: 'Absent', E: 'Excused' };

// DepEd school year runs June→March. June or later ⇒ current year starts the SY.
export function currentSchoolYear(date = new Date()) {
  const y = date.getFullYear();
  const start = date.getMonth() >= 5 ? y : y - 1; // month index 5 = June
  return `${start}-${start + 1}`;
}
