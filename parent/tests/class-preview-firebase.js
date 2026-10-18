// In-memory stand-in for parent/src/firebase.js in the Class tab preview.
const names = ['Abad, Lea M.', 'Bautista, Carlo R.', 'Cruz, Ana B.', 'Dela Peña, Marco S.', 'Españo, Joy T.', 'Flores, Ivan D.',
  'Garcia, Mia L.', 'Hernandez, Paolo C.', 'Ignacio, Rhea V.', 'Jimenez, Kurt A.', 'Lopez, Nina F.', 'Mendoza, Rafael G.'];
const times = ['07:02', '07:11', '07:18', '07:24', '07:29', '07:41', '07:46', '07:55', null, null, null, '07:33'];
const rows = names.map((displayName, i) => ({
  studentId: `S${i + 1}`, displayName, revision: 0,
  gate: { timeIn: times[i], timeOut: null, pmTimeIn: null, pmTimeOut: null },
  am: { status: times[i] ? (times[i] > '07:30' ? 'L' : 'P') : 'A', absent: !times[i], overrideActive: false, reason: '', actorName: '' },
  pm: { status: times[i] ? 'P' : 'A', absent: !times[i], overrideActive: false, reason: '', actorName: '' },
}));
rows[11].am = { ...rows[11].am, status: 'A', absent: true, overrideActive: true, reason: 'Not in class', actorName: 'Ms. Reyes' };
rows[11].revision = 1;
const schedule = { timeIn: '07:30', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:30' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const db = {};
export const auth = {};
export const appCheckReady = Promise.resolve();
export function callable(name) {
  return async (input) => {
    await wait(250);
    if (name === 'getSchoolRosterFn') {
      return { data: { section: { id: input.sectionId }, date: input.date, rows: structuredClone(rows), canCorrect: input.date === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), schedule } };
    }
    if (name === 'setSessionAbsenceFn') {
      const row = rows.find((r) => r.studentId === input.studentId);
      if (row.revision !== input.expectedRevision) throw Object.assign(new Error('Attendance changed. Refresh and review before submitting again.'), { code: 'functions/aborted' });
      row.revision += 1;
      row[input.session] = { ...row[input.session], overrideActive: input.absent, absent: input.absent, status: input.absent ? 'A' : (row.gate.timeIn > '07:30' ? 'L' : 'P'), reason: input.reason, actorName: 'You' };
      return { data: { ok: true, revision: row.revision, operationId: input.operationId } };
    }
    throw new Error(`Preview has no ${name}`);
  };
}
