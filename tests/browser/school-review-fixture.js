// Synthetic backend for the SIMS School access and Session review previews.
// Everything lives in memory; nothing here reaches production services.
import { manilaDate } from '../../shared/dates.js';

const YEAR = '2026-2027';
const sections = [
  { id: 'g7-rizal', name: 'Rizal', gradeLevel: 7, schoolYear: YEAR },
  { id: 'g7-mabini', name: 'Mabini', gradeLevel: 7, schoolYear: YEAR },
  { id: 'g8-luna', name: 'Luna', gradeLevel: 8, schoolYear: YEAR },
  { id: 'g8-bonifacio', name: 'Bonifacio', gradeLevel: 8, schoolYear: YEAR },
];
const SCHEDULE = { timeIn: '07:30', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:30' };
const WHOLE_DAY = { timeIn: '07:30', timeOut: '16:00', pmTimeIn: null, pmTimeOut: null };
const scheduleFor = (sectionId) => (sectionId === 'g8-bonifacio' ? { ...WHOLE_DAY } : { ...SCHEDULE });
const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (code, message) => Object.assign(new Error(message), { code: `functions/${code}` });

export function useStaffCollectionResource(path) {
  return { data: path === 'sections' ? sections : [], loading: false, error: null, retry() {} };
}

// ---- Session review -------------------------------------------------------
const SURNAMES = ['Dela Cruz', 'Santos', 'Reyes', 'Garcia', 'Bautista', 'Ramos', 'Aquino', 'Mendoza', 'Villanueva', 'Navarro',
  'Castillo', 'Domingo', 'Pascual', 'Soriano', 'Salazar', 'Mercado', 'Tolentino', 'Manalo', 'Aguilar', 'Lacson'];
const GIVEN = ['Juan Miguel', 'Maria Clara', 'Jose Andres', 'Angelica', 'Mark Anthony', 'Katrina Joy', 'Paolo', 'Ana Beatriz', 'Carlo', 'Princess Mae',
  'John Rey', 'Sofia Nicole', 'Ramon', 'Bianca', 'Lance', 'Trisha Anne', 'Christian', 'Jasmine', 'Enzo', 'Nathalie'];
// Per learner: [gate in, lunch out, afternoon in]. null = no gate entry that session.
const GATES = [
  ['07:12', '12:02', '12:48'], ['07:28', '12:05', '12:55'], ['07:41', '12:01', '13:06'], ['07:05', null, null], [null, null, null],
  ['07:52', '12:10', '13:12'], ['07:19', '12:03', '12:50'], [null, null, null], ['07:33', null, null], ['07:00', '12:00', '12:58'],
];
const mark = (time, limit) => (!time ? 'A' : time > limit ? 'L' : 'P');

const rosters = new Map();
function buildRoster(sectionId) {
  const index = Math.max(0, sections.findIndex((section) => section.id === sectionId));
  return GATES.map(([timeIn, timeOut, pmTimeIn], j) => {
    const n = index * 10 + j;
    const pmEntry = pmTimeIn || (timeIn && !timeOut ? timeIn : null);
    const row = {
      studentId: `${sectionId}-s${j + 1}`,
      displayName: `${SURNAMES[n % 20]}, ${GIVEN[(index * 7 + j * 3) % 20]}`,
      revision: 1 + (j % 3),
      gate: { timeIn, timeOut, pmTimeIn, pmTimeOut: null },
      am: { status: mark(timeIn, SCHEDULE.timeIn), absent: !timeIn, overrideActive: false, reason: '', actorName: '' },
      pm: { status: mark(pmEntry, SCHEDULE.pmTimeIn), absent: !pmEntry, overrideActive: false, reason: '', actorName: '' },
    };
    if (index === 0 && j === 3) {
      row.am = { status: 'A', absent: true, overrideActive: true, reason: 'Not in class', actorName: 'Ms. Reyes' };
    }
    return row;
  });
}
const rosterFor = (sectionId, date) => {
  const key = `${sectionId}|${date}`;
  if (!rosters.has(key)) rosters.set(key, buildRoster(sectionId));
  return rosters.get(key);
};
const baseStatus = (row, session) => {
  const { gate } = row;
  if (session === 'am') return mark(gate.timeIn, SCHEDULE.timeIn);
  return mark(gate.pmTimeIn || (gate.timeIn && !gate.timeOut ? gate.timeIn : null), SCHEDULE.pmTimeIn);
};

function getSchoolRoster({ sectionId, date }) {
  const section = sections.find((item) => item.id === sectionId);
  if (!section) throw fail('not-found', 'That section was not found.');
  return {
    section, date, schedule: scheduleFor(sectionId), canCorrect: date <= manilaDate(),
    rows: structuredClone(rosterFor(sectionId, date)),
  };
}

function setSessionAbsence({ sectionId, studentId, date, session, absent, reason, expectedRevision }) {
  const row = rosterFor(sectionId, date).find((item) => item.studentId === studentId);
  if (!row) throw fail('not-found', 'That learner was not found.');
  if (row.revision !== expectedRevision) throw fail('aborted', 'This learner was changed by someone else. Review the latest and try again.');
  row.revision += 1;
  row[session] = absent
    ? { status: 'A', absent: true, overrideActive: true, reason, actorName: 'You' }
    : { status: baseStatus(row, session), absent: false, overrideActive: false, reason, actorName: 'You' };
  return { ok: true, revision: row.revision };
}

// ---- School access ----------------------------------------------------------
let managedAssignments = [
  { uid: 'uid-reyes', email: 'maria.reyes@deped.example', displayName: 'Maria Reyes', role: 'adviser', sectionId: 'g8-luna' },
  { uid: 'uid-tan', email: 'ramon.tan@deped.example', displayName: 'Ramon Tan', role: 'subject_teacher', sectionId: 'g7-rizal' },
];
const legacyAdvisers = [
  { guardianUid: 'uid-reyes', name: 'Maria Reyes', email: 'maria.reyes@deped.example', learnerCount: 38, suggestedSectionId: 'g8-luna' },
  { guardianUid: 'uid-cruz', name: 'Elena Cruz', email: 'elena.cruz@deped.example', learnerCount: 41, suggestedSectionId: 'g7-mabini' },
  { guardianUid: 'uid-lim', name: 'Dennis Lim', email: 'dennis.lim@deped.example', learnerCount: 12, suggestedSectionId: 'g8-bonifacio' },
  { guardianUid: 'uid-ocampo', name: 'Gloria Ocampo', email: 'gloria.ocampo@deped.example', learnerCount: 3, suggestedSectionId: null },
];

const getSchoolContext = () => structuredClone({
  schoolYear: YEAR, ended: false, isAdmin: true, assignments: [], sections, managedAssignments, legacyAdvisers,
});

function assignSchoolRole({ email, role, sectionId, gradeLevel }) {
  if (!email) throw fail('invalid-argument', 'Enter the account email.');
  const same = (item) => item.email === email && item.role === role && item.sectionId === sectionId && item.gradeLevel === gradeLevel;
  if (managedAssignments.some(same)) throw fail('already-exists', 'This teacher already has that assignment.');
  const name = email.split('@')[0].split('.').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
  managedAssignments = [...managedAssignments, {
    uid: legacyAdvisers.find((item) => item.email === email)?.guardianUid || `uid-${email.split('@')[0]}`,
    email, displayName: name, role, ...(sectionId ? { sectionId } : { gradeLevel }),
  }];
  return { ok: true };
}

function revokeSchoolRole({ uid, role, sectionId, gradeLevel }) {
  managedAssignments = managedAssignments.filter((item) => !(item.uid === uid && item.role === role
    && (sectionId ? item.sectionId === sectionId : item.gradeLevel === gradeLevel)));
  return { ok: true };
}

const handlers = {
  getSchoolRosterFn: getSchoolRoster,
  setSessionAbsenceFn: setSessionAbsence,
  getSchoolContextFn: getSchoolContext,
  assignSchoolRoleFn: assignSchoolRole,
  revokeSchoolRoleFn: revokeSchoolRole,
};

export async function transport(name, data = {}) {
  await delay();
  const handler = handlers[name];
  if (!handler) throw new Error(`Unexpected callable ${name}`);
  return { data: handler(data) };
}
