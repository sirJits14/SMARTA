// The SF2 (Daily Attendance Report of Learners) for one section and month, as the same Excel file SIMS
// exports (spec 2026-10-22). Advisers have no direct read on attendance, so the server gathers the
// roster and attendance, builds the workbook with the shared builder, and returns it as base64.
import { readFileSync } from 'node:fs';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { loadSchoolActor } from './schoolAccess.js';
import { canReviewSection } from '../../shared/schoolAccess.js';
import { manilaDate } from '../../shared/dates.js';
import { buildSf2Workbook } from '../../shared/sf2/buildSf2Workbook.js';
import { firstFridayOfJune, monthLabel, schoolDaysInMonth } from '../../shared/sf2/calendar.js';
import { isSf2Month } from '../../shared/sf2/months.js';

const fail = (code, message) => { throw new CallableError(code, message); };
const identifier = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const MONTH_MESSAGE = 'Choose a month of this school year, up to the current month.';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let template;
// scripts/syncShared.mjs copies shared/ (template included) next to this code on every deploy and test run.
const templateBuffer = () => (template ??= readFileSync(new URL('../../shared/sf2/sf2-template.xlsx', import.meta.url)));

// SF2_<Section>_<YYYY-MM>.xlsx, as SIMS names it, minus characters a file name cannot hold.
export const sf2Filename = (sectionName, month) =>
  `SF2_${String(sectionName ?? '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'Section'}_${month}.xlsx`;

export async function exportSchoolSf2(deps, input) {
  if (!identifier(input?.sectionId)) fail('invalid-argument', 'Choose a valid section.');
  if (typeof input.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) fail('invalid-argument', MONTH_MESSAGE);
  const now = (deps.now || (() => new Date()))();
  const actor = await loadSchoolActor(deps);
  const sectionSnap = await deps.db.doc(`sections/${input.sectionId}`).get();
  if (!sectionSnap.exists) fail('not-found', 'Section not found.');
  const section = { ...sectionSnap.data(), id: sectionSnap.id };
  if (!canReviewSection(actor, section)) fail('permission-denied', 'This section is outside your attendance access.');
  if (!isSf2Month(section.schoolYear, input.month, manilaDate(now))) fail('invalid-argument', MONTH_MESSAGE);
  await enforceRateLimit(deps.db, deps.uid, 'sf2Export', LIMITS.sf2Export, now.getTime(), () => 'Too many exports. Try again in a few minutes.');

  const [enrollmentSnap, settingsSnap] = await Promise.all([
    deps.db.collection('enrollments').where('sectionId', '==', section.id).where('schoolYear', '==', section.schoolYear).get(),
    deps.db.doc('settings/app').get(),
  ]);
  const enrollments = enrollmentSnap.docs.map((d) => d.data());
  const enrolledIds = enrollments.filter((e) => e.status === 'enrolled').map((e) => e.studentId);
  if (!enrolledIds.length) fail('failed-precondition', 'There are no learners in this class yet.');
  const [year, month] = input.month.split('-').map(Number);
  const schoolDays = schoolDaysInMonth(year, month);
  const [students, attendance] = await Promise.all([
    deps.db.getAll(...enrolledIds.map((id) => deps.db.doc(`students/${id}`))),
    deps.db.getAll(...schoolDays.map((date) => deps.db.doc(`student_attendance/${section.id}_${date}`))),
  ]);
  // SIMS lists only learners recorded as M or F, so the form does too.
  const roster = students.filter((s) => s.exists).map((s) => ({ id: s.id, ...s.data() }))
    .filter((s) => s.sex === 'M' || s.sex === 'F');
  if (!roster.length) fail('failed-precondition', 'There are no learners in this class yet.');
  // SIMS counts every enrollment of the section dated on or before the first Friday of June.
  const cutoff = firstFridayOfJune(section.schoolYear);
  const enrolledAsOfCutoff = enrollments.filter((e) => e.dateEnrolled <= cutoff).length;
  // A day document counts only when it belongs to this section, the same filter SIMS applies. Like the
  // roster, each day keeps the grade it was saved under: a caller whose scope does not cover that grade
  // may not read the day, even if the section has since moved. A day with no recorded grade (older
  // records) is used as it is, so one old day cannot block the month; the roster's "requires
  // administrator repair" check is not applied.
  const docsByDate = {};
  attendance.forEach((snap, i) => {
    const data = snap.exists ? snap.data() : null;
    if (data?.sectionId !== section.id) return;
    if (Number.isInteger(data.gradeLevel) && !canReviewSection(actor, { ...section, gradeLevel: data.gradeLevel })) {
      fail('permission-denied', 'The saved attendance grade is outside your scope.');
    }
    docsByDate[schoolDays[i]] = data;
  });
  const settings = settingsSnap.data() || {};
  const workbook = await buildSf2Workbook({
    templateBuffer: templateBuffer(), section, roster, schoolDays, docsByDate, monthLabelText: monthLabel(input.month),
    schoolId: settings.schoolId || '', schoolName: settings.schoolName || '', enrolledAsOfCutoff,
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return { filename: sf2Filename(section.name, input.month), contentType: XLSX, contentBase64: Buffer.from(buffer).toString('base64') };
}
