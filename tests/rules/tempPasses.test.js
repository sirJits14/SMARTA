import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { setup, seed, seedBaseline, as, anon, ok, denied, STAFF, ADMIN_NEW, JHS, SHS, GLC8, LOGISTIC, LEGACY, KIOSK, KIOSK_INACTIVE, GUARDIAN_A, ANON } from './helpers.js';

// Temporary ID Passes and learner photos (spec 2026-11-27).
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
const YEAR = '2026-2027';
const CODE = 'BNHS-TP-23456789AB';
const OTHER_CODE = 'BNHS-TP-CDEFGHJKMN';

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });

const pass = (gradeLevel, over = {}) => ({
  code: CODE, status: 'active', lrn: '100000000001', sectionId: 'SEC1', gradeLevel, schoolYear: YEAR,
  issuedBy: 'registrar@bnhs.edu', issuedAt: new Date(), ...over,
});

beforeEach(async () => {
  await env.clearFirestore(); await seedBaseline(env);
  await seed(env, async (db) => {
    await db.doc('users/admin2@bnhs.edu').set({ name: 'Admin Two', role: 'admin', gradeLevel: null, disabled: false });
    await db.doc('users/jhs@bnhs.edu').set({ name: 'JHS', role: 'jhs_coord', gradeLevel: null, disabled: false });
    await db.doc('users/shs@bnhs.edu').set({ name: 'SHS', role: 'shs_coord', gradeLevel: null, disabled: false });
    await db.doc('users/glc8@bnhs.edu').set({ name: 'G8', role: 'glc', gradeLevel: 8, disabled: false });
    await db.doc('users/logistic@bnhs.edu').set({ name: 'Logistics', role: 'logistic', gradeLevel: null, disabled: false, uid: LOGISTIC.uid });
    await db.doc('enrollments/S2_2026-2027').set({ studentId: 'S2', sectionId: 'SEC1', schoolYear: YEAR, status: 'enrolled' });
    await db.doc('temp_passes/S1').set(pass(7));
    await db.doc('temp_passes/S2').set(pass(7, { code: OTHER_CODE, lrn: '100000000002' }));
    for (const g of [8, 9, 10, 11, 12]) await db.doc(`temp_passes/G${g}`).set(pass(g));
    await db.doc('temp_passes/REVOKED').set(pass(8, { status: 'revoked', endedReason: 'revoked' }));
    await db.doc('temp_passes/SUPERSEDED').set(pass(11, { status: 'superseded', endedReason: 'official_id_printed' }));
    await db.doc('temp_passes/LASTYEAR').set(pass(9, { schoolYear: '2025-2026' }));
  });
});

// A refusal must come from the rule's own answer. Hitting the expression or
// document-access limit also denies, and would hide a broken rule. The emulator
// reports the access limit as a "Service call error".
const LIMIT_ERROR = /maximum of \d+ expressions|Service call error|exceeded|too many/i;
const refused = async (request) => {
  const error = await denied(request);
  expect(error.message).not.toMatch(LIMIT_ERROR);
};

const ids = async (query) => (await ok(query.get())).docs.map((doc) => doc.id).sort();
const passes = (who) => as(env, who).collection('temp_passes');
const inGrades = (who, grades) => passes(who).where('gradeLevel', 'in', grades);
const activeThisYear = (who) => passes(who).where('status', '==', 'active').where('schoolYear', '==', YEAR);

// Auth UID to staff profile binding. The lookup adds work to every identity check.
const bind = (who) => seed(env, (db) => db.doc(`staff_profiles/${who.uid}`).set({ email: who.token.email }));
const KIOSK_PATHS = [['kiosk', false], ['kiosk with a staff_profiles binding', true]];

describe('temp_passes writes', () => {
  const writers = [['admin', STAFF], ['role admin', ADMIN_NEW], ['coordinator', JHS], ['grade level coordinator', GLC8],
    ['logistic operator', LOGISTIC], ['kiosk', KIOSK], ['guardian', GUARDIAN_A]];
  for (const [label, who] of writers) {
    it(`${label} cannot create, update or delete a pass`, async () => {
      const db = as(env, who);
      await refused(db.doc('temp_passes/NEW').set(pass(7)));
      await refused(db.doc('temp_passes/S1').update({ status: 'revoked' }));
      await refused(db.doc('temp_passes/REVOKED').update({ status: 'active' }));
      await refused(db.doc('temp_passes/S1').delete());
    });
  }
});

describe('temp_passes reads: staff', () => {
  for (const [label, who] of [['legacy registrar', STAFF], ['role admin', ADMIN_NEW]]) {
    it(`${label} gets and lists every pass`, async () => {
      await ok(passes(who).doc('S1').get());
      await ok(passes(who).doc('G11').get());
      await ok(passes(who).doc('REVOKED').get());
      expect(await ids(passes(who))).toHaveLength(10);
    });
  }
  it('logistic operator gets and lists every pass', async () => {
    await ok(passes(LOGISTIC).doc('S1').get());
    await ok(passes(LOGISTIC).doc('G11').get());
    await ok(passes(LOGISTIC).doc('REVOKED').get());
    expect(await ids(passes(LOGISTIC))).toHaveLength(10);
    expect(await ids(activeThisYear(LOGISTIC))).toEqual(['G10', 'G11', 'G12', 'G8', 'G9', 'S1', 'S2']);
    expect(await ids(inGrades(LOGISTIC, [7, 8]))).toEqual(['G8', 'REVOKED', 'S1', 'S2']);
  });
  for (const [label, who, grades] of [['JHS', JHS, [7, 8, 9, 10]], ['SHS', SHS, [11, 12]]]) {
    it(`${label} academic coordinator is refused, even for their own grades`, async () => {
      await refused(passes(who).doc(`G${grades[1]}`).get());
      await refused(inGrades(who, grades).get());
      await refused(passes(who).where('gradeLevel', '==', grades[1]).get());
      await refused(activeThisYear(who).get());
      await refused(passes(who).get());
    });
  }
  it('grade level coordinator lists and gets their own grade only', async () => {
    expect(await ids(inGrades(GLC8, [8]))).toEqual(['G8', 'REVOKED']);
    expect(await ids(passes(GLC8).where('gradeLevel', '==', 8))).toEqual(['G8', 'REVOKED']);
    await ok(passes(GLC8).doc('G8').get());
    await ok(passes(GLC8).doc('REVOKED').get());
    await refused(passes(GLC8).doc('S1').get());
    await refused(passes(GLC8).doc('G9').get());
    await refused(inGrades(GLC8, [7]).get());
    await refused(inGrades(GLC8, [7, 8]).get());
    await refused(passes(GLC8).where('gradeLevel', '==', 7).get());
    await refused(activeThisYear(GLC8).get());
    await refused(passes(GLC8).get());
  });
  it('a grade level coordinator without a valid grade is refused', async () => {
    for (const gradeLevel of [null, 6, 13]) {
      await seed(env, (db) => db.doc('users/glc8@bnhs.edu').update({ gradeLevel }));
      await refused(passes(GLC8).doc('G8').get());
      await refused(inGrades(GLC8, [8]).get());
    }
  });
  for (const [label, who, email] of [['grade level coordinator', GLC8, 'glc8@bnhs.edu'], ['logistic operator', LOGISTIC, 'logistic@bnhs.edu']]) {
    it(`a disabled ${label} is refused`, async () => {
      await seed(env, (db) => db.doc(`users/${email}`).update({ disabled: true }));
      await refused(passes(who).doc('G8').get());
      await refused(inGrades(who, [8]).get());
      await refused(passes(who).get());
    });
  }
});

describe.each(KIOSK_PATHS)('temp_passes reads: %s', (_label, bound) => {
  beforeEach(async () => { if (bound) await bind(KIOSK); });
  it('lists this year\'s active passes and gets one', async () => {
    expect(await ids(activeThisYear(KIOSK))).toEqual(['G10', 'G11', 'G12', 'G8', 'G9', 'S1', 'S2']);
    await ok(passes(KIOSK).doc('S1').get());
  });
  it('cannot list unfiltered or read an ended pass', async () => {
    await refused(passes(KIOSK).get());
    await refused(passes(KIOSK).where('schoolYear', '==', YEAR).get());
    await refused(passes(KIOSK).where('status', '==', 'revoked').get());
    await refused(passes(KIOSK).doc('REVOKED').get());
    await refused(passes(KIOSK).doc('SUPERSEDED').get());
  });
});

describe('temp_passes reads: everyone else', () => {
  const others = [['inactive kiosk', KIOSK_INACTIVE], ['linked guardian', GUARDIAN_A], ['anonymous sign-in', ANON]];
  for (const [label, who] of others) {
    it(`${label} is refused`, async () => {
      await refused(passes(who).doc('S1').get());
      await refused(activeThisYear(who).get());
      await refused(passes(who).get());
    });
  }
  it('signed-out users are refused', async () => {
    const collection = anon(env).collection('temp_passes');
    await refused(collection.doc('S1').get());
    await refused(collection.where('status', '==', 'active').where('schoolYear', '==', YEAR).get());
  });
});

describe.each(KIOSK_PATHS)('scan_events with a temporary pass: %s', (_label, bound) => {
  beforeEach(async () => { if (bound) await bind(KIOSK); });

  const plain = (over = {}) => ({
    studentId: 'S1', sectionId: 'SEC1', schoolYear: YEAR, kind: 'in', deviceId: 'kiosk1',
    scannedAt: new Date(), scannedDate: '2026-09-21', scannedTime: '07:12', receivedAt: serverTimestamp(), source: 'kiosk', ...over,
  });
  const withPass = (over = {}) => plain({ credential: 'temp_pass', passCode: CODE, ...over });
  const ref = (studentId = 'S1', suffix = '202609210712') => as(env, KIOSK).doc(`scan_events/kiosk1_${studentId}_${suffix}`);

  it('accepts a pass scan matching an active pass, in and out', async () => {
    await ok(ref().set(withPass()));
    await ok(ref('S1', '202609211700').set(withPass({ kind: 'out', scannedTime: '17:00' })));
    await ok(ref('S2').set(withPass({ studentId: 'S2', passCode: OTHER_CODE })));
  });

  it('refuses only one of the two fields', async () => {
    await refused(ref().set(plain({ credential: 'temp_pass' })));
    await refused(ref().set(plain({ passCode: CODE })));
    await refused(ref().set(plain({ credential: null })));
    await refused(ref().set(plain({ passCode: null })));
  });

  it('refuses a wrong credential and a non-string or wrong code', async () => {
    for (const credential of ['official', 'TEMP_PASS', '', null, true]) await refused(ref().set(withPass({ credential })));
    for (const passCode of [12345, null, [CODE], { code: CODE }, '', 'BNHS-TP-ZZZZZZZZZZ', CODE.toLowerCase()]) {
      await refused(ref().set(withPass({ passCode })));
    }
  });

  it('refuses other extra fields beside a valid pass', async () => {
    await refused(ref().set(withPass({ extra: 1 })));
    await refused(ref().set(withPass({ attendanceResult: { status: 'applied', mark: 'P' } })));
  });

  for (const status of ['superseded', 'revoked']) {
    it(`refuses a ${status} pass`, async () => {
      await seed(env, (db) => db.doc('temp_passes/S1').update({ status }));
      await refused(ref().set(withPass()));
    });
  }

  it('refuses a pass of another school year', async () => {
    await seed(env, (db) => db.doc('temp_passes/S1').update({ schoolYear: '2025-2026' }));
    await refused(ref().set(withPass()));
  });

  it('refuses a learner with no pass', async () => {
    await seed(env, (db) => db.doc('temp_passes/S1').delete());
    // get() of a missing document is also a "Service call error", so name the document.
    const error = await denied(ref().set(withPass()));
    expect(error.message).toMatch(/Service call error[\s\S]*"temp_passes"/);
  });

  it('refuses another learner\'s code', async () => {
    await refused(ref().set(withPass({ passCode: OTHER_CODE })));
    await refused(ref('S2').set(withPass({ studentId: 'S2' })));
  });

  it('still requires enrollment for a pass scan', async () => {
    await seed(env, (db) => db.doc('enrollments/S1_2026-2027').update({ status: 'withdrawn' }));
    await refused(ref().set(withPass()));
  });

  it('keeps pass scan events immutable', async () => {
    await ok(ref().set(withPass()));
    await refused(ref().update({ passCode: OTHER_CODE }));
    await refused(ref().delete());
    await ok(ref().get());
  });

  for (const [state, arrange] of [
    ['an active pass', () => Promise.resolve()],
    ['a revoked pass', () => seed(env, (db) => db.doc('temp_passes/S1').update({ status: 'revoked' }))],
    ['a superseded pass', () => seed(env, (db) => db.doc('temp_passes/S1').update({ status: 'superseded' }))],
    ['no pass', () => seed(env, (db) => db.doc('temp_passes/S1').delete())],
  ]) {
    it(`accepts a plain official-card scan when the learner has ${state}`, async () => {
      await arrange();
      await ok(ref().set(plain()));
    });
  }

  it('an inactive kiosk cannot use a valid pass', async () => {
    if (bound) await bind(KIOSK_INACTIVE);
    await refused(as(env, KIOSK_INACTIVE).doc('scan_events/kiosk9_S1_202609210712').set(withPass({ deviceId: 'kiosk9' })));
  });
});

describe('learner photo fields', () => {
  const photo = { path: 'student_photos/S1.jpg', updatedAt: new Date(), updatedBy: 'someone@bnhs.edu' };
  beforeEach(() => seed(env, (db) => db.doc('students/S1').update({ gradeLevel: 7, scopeSchoolYear: YEAR })));

  it('only administrators write students/{id}.photo', async () => {
    await ok(as(env, JHS).doc('students/S1').get());
    for (const who of [JHS, SHS, GLC8, LOGISTIC, KIOSK, GUARDIAN_A]) await refused(as(env, who).doc('students/S1').update({ photo }));
    await ok(as(env, STAFF).doc('students/S1').update({ photo }));
  });

  it('no client writes learners/{id}', async () => {
    for (const who of [STAFF, ADMIN_NEW, JHS, LOGISTIC, KIOSK, GUARDIAN_A]) {
      await refused(as(env, who).doc('learners/S1').update({ photoUpdatedAt: new Date() }));
      await refused(as(env, who).doc('learners/NEW').set({ photoUpdatedAt: new Date() }));
      await refused(as(env, who).doc('learners/S1').delete());
    }
    await ok(as(env, GUARDIAN_A).doc('learners/S1').get());
  });
});

// A Logistic Operator prints passes and uploads photos (spec 2026-11-27 requests). Their reads are
// temp_passes, students, enrollments, sections, settings/app and their own users profile.
const tomorrow = () => new Date(Date.now() + 86_400_000);
const post = (who, over = {}) => ({
  title: 'Notice', body: 'Text.', audience: { grades: [8] }, audienceKeys: ['g8'], status: 'published',
  publishAt: serverTimestamp(), publishedAt: serverTimestamp(), expiresAt: null, pinned: false, push: false,
  createdBy: { uid: who.uid, name: 'Staff' }, updatedBy: { uid: who.uid, name: 'Staff' },
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over,
});
const scheduledPost = (who, over = {}) => {
  const d = post(who, { status: 'scheduled', publishAt: tomorrow(), ...over });
  delete d.publishedAt;
  return d;
};
const touch = (who) => ({ updatedBy: { uid: who.uid, name: 'Staff' }, updatedAt: serverTimestamp() });
const attendance = (date) => ({ sectionId: 'SEC1', gradeLevel: 7, date, schoolYear: YEAR, marks: { S1: 'A' } });

// Every other collection, with one stored document so reads, updates and deletes have a target.
const CLOSED_DOCS = [
  'student_attendance/SEC1_2026-09-21', 'schedules/SCH1', 'announcements/published', 'guardian_links/gA_S1',
  'scan_events/kiosk1_S1_202609210712', 'learners/S1', 'learners/S1/events/e1', 'guardians/gA', 'guardians/gA/devices/h1',
  'guardians/gA/inbox/e1', 'kiosks/kiosk1', 'id_card_batch/S1', 'id_card_approved/S1', 'activation_codes/C1', 'audit_log/A1',
  'school_years/2026-2027', 'rate_limits/R1', 'school_accounts/gA', 'school_role_requests/Q1', 'learner_change_requests/L1',
  'school_adviser_locks/SEC1', 'advisory_slips/V1', 'attendance_corrections/X1', 'attendance_correction_audit/Y1',
  'access_requests/AR1', 'reports/RP1', 'temp_pass_requests/T1', 'temp_pass_request_locks/student_S1', 'unlisted_collection/Z1',
];
// Documents above that seedBaseline or the pass setup does not already store.
const PLAIN_DOCS = [
  'id_card_batch/S1', 'id_card_approved/S1', 'activation_codes/C1', 'audit_log/A1', 'school_years/2026-2027', 'rate_limits/R1',
  'school_accounts/gA', 'school_role_requests/Q1', 'learner_change_requests/L1', 'school_adviser_locks/SEC1', 'advisory_slips/V1',
  'attendance_corrections/X1', 'attendance_correction_audit/Y1', 'temp_pass_requests/T1', 'temp_pass_request_locks/student_S1',
  'unlisted_collection/Z1',
];
const seedElsewhere = () => seed(env, async (db) => {
  await db.doc('student_attendance/SEC1_2026-09-21').set(attendance('2026-09-21'));
  await db.doc('schedules/SCH1').set({ name: 'AM', gradeLevels: [7, 8], timeIn: '07:00', timeOut: '12:00' });
  const published = { ...post(LOGISTIC), publishAt: new Date(), publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date() };
  await db.doc('announcements/published').set(published);
  const scheduled = { ...published, status: 'scheduled', publishAt: tomorrow() };
  delete scheduled.publishedAt;
  await db.doc('announcements/scheduled').set(scheduled);
  await db.doc('scan_events/kiosk1_S1_202609210712').set({ studentId: 'S1', deviceId: 'kiosk1' });
  await db.doc('guardians/gA/devices/h1').set({ token: 't', enabled: true });
  await db.doc('access_requests/AR1').set({ guardianUid: 'gA', status: 'pending' });
  await db.doc('reports/RP1').set({ guardianUid: 'gA', status: 'open' });
  for (const path of PLAIN_DOCS) await db.doc(path).set({ studentId: 'S1', gradeLevel: 8, status: 'pending' });
});

// Everything a Logistic Operator is allowed to read apart from their own profile.
const logisticReads = (db) => [
  db.doc('temp_passes/S1'), db.collection('temp_passes'),
  db.doc('students/S1'), db.collection('students'),
  db.doc('enrollments/S1_2026-2027'), db.collection('enrollments'),
  db.doc('sections/SEC1'), db.collection('sections'),
  db.doc('settings/app'),
];

describe('logistic operator reads', () => {
  for (const [label, arrange] of [
    ['with a staff_profiles binding', () => Promise.resolve()],
    ['with the legacy email lookup', () => seed(env, (db) => db.doc(`staff_profiles/${LOGISTIC.uid}`).delete())],
  ]) {
    it(`reads passes, learners, enrollments, sections, settings/app and own profile ${label}`, async () => {
      await arrange();
      await seedElsewhere();
      const db = as(env, LOGISTIC);
      for (const ref of logisticReads(db)) await ok(ref.get());
      await ok(db.collection('students').where('gradeLevel', 'in', [7, 12]).get());
      await ok(db.collection('enrollments').where('schoolYear', '==', YEAR).get());
      await ok(db.collection('sections').where('schoolYear', '==', YEAR).get());
      await ok(db.doc('users/logistic@bnhs.edu').get());
      await refused(db.doc('student_attendance/SEC1_2026-09-21').get());
      await refused(db.doc('schedules/SCH1').get());
      await refused(db.doc('announcements/published').get());
    });
  }
});

describe('logistic operator: nothing else', () => {
  beforeEach(seedElsewhere);

  for (const path of CLOSED_DOCS) {
    const collection = path.slice(0, path.lastIndexOf('/'));
    it(`cannot read or write ${collection}`, async () => {
      const db = as(env, LOGISTIC);
      await refused(db.doc(path).get());
      await refused(db.collection(collection).get());
      await refused(db.collection(collection).limit(1).get());
      await refused(db.doc(`${collection}/NEW`).set({ studentId: 'S1', gradeLevel: 8 }));
      await refused(db.doc(path).update({ status: 'changed' }));
      await refused(db.doc(path).delete());
    });
  }

  it('cannot run the queries a grade or audience scope would accept', async () => {
    const db = as(env, LOGISTIC);
    const att = db.collection('student_attendance');
    await refused(att.where('gradeLevel', 'in', [7, 8, 9, 10, 11, 12]).get());
    await refused(att.where('sectionId', '==', 'SEC1').get());
    await refused(db.collection('schedules').where('gradeLevels', 'array-contains-any', [7, 8]).get());
    await refused(db.collection('announcements').where('status', '==', 'published').get());
    await refused(db.collection('announcements').where('audienceKeys', 'array-contains-any', ['all', 'g8']).limit(50).get());
    await refused(db.collection('guardian_links').where('guardianUid', '==', 'gA').limit(60).get());
    await refused(db.collection('learners/S1/events').limit(50).get());
    for (const name of ['access_requests', 'reports']) await refused(db.collection(name).where('guardianUid', '==', 'gA').limit(50).get());
    for (const group of ['events', 'devices', 'inbox', 'temp_passes', 'students']) await refused(db.collectionGroup(group).get());
    await refused(db.doc('settings/other').get());
    await refused(db.collection('settings').get());
  });

  it('cannot take or change attendance, even with a stray grade on the profile', async () => {
    // The same write is valid for an administrator, so each refusal below is about the role.
    await ok(as(env, STAFF).doc('student_attendance/SEC1_2026-09-22').set(attendance('2026-09-22')));
    for (const gradeLevel of [null, 7]) {
      await seed(env, (db) => db.doc('users/logistic@bnhs.edu').update({ gradeLevel }));
      const db = as(env, LOGISTIC);
      await refused(db.doc('student_attendance/SEC1_2026-09-23').set(attendance('2026-09-23')));
      await refused(db.doc('student_attendance/SEC1_2026-09-21').set(attendance('2026-09-21'), { merge: true }));
      await refused(db.doc('student_attendance/SEC1_2026-09-21').update({ marks: { S1: 'P' } }));
      await refused(db.doc('student_attendance/SEC1_2026-09-21').delete());
      await refused(db.doc('student_attendance/SEC1_2026-09-21').get());
    }
  });

  it('cannot publish, edit, unpublish or delete announcements, even with a stray grade on the profile', async () => {
    // The same writes are valid for an administrator, so each refusal below is about the role.
    await ok(as(env, STAFF).collection('announcements').add(post(STAFF)));
    await ok(as(env, STAFF).collection('announcements').add(scheduledPost(STAFF)));
    for (const gradeLevel of [null, 8]) {
      await seed(env, (db) => db.doc('users/logistic@bnhs.edu').update({ gradeLevel }));
      const posts = as(env, LOGISTIC).collection('announcements');
      await refused(posts.add(post(LOGISTIC)));
      await refused(posts.add(post(LOGISTIC, { audience: { all: true }, audienceKeys: ['all'] })));
      await refused(posts.add(scheduledPost(LOGISTIC)));
      await refused(posts.doc('published').update({ title: 'x', editedAt: serverTimestamp(), ...touch(LOGISTIC) }));
      await refused(posts.doc('published').update({ status: 'unpublished', ...touch(LOGISTIC) }));
      await refused(posts.doc('scheduled').update({ title: 'x', ...touch(LOGISTIC) }));
      await refused(posts.doc('scheduled').delete());
    }
  });

  it('cannot write the records it reads, any account profile or a gate scan', async () => {
    const db = as(env, LOGISTIC);
    for (const path of ['students/S1', 'enrollments/S1_2026-2027', 'sections/SEC1', 'settings/app']) {
      await refused(db.doc(path).update({ changed: true }));
      await refused(db.doc(path).delete());
    }
    await refused(db.doc('students/NEW').set({ lrn: '100000000009' }));
    await refused(db.doc('enrollments/NEW').set({ studentId: 'S1', sectionId: 'SEC1', schoolYear: YEAR, status: 'enrolled' }));
    await refused(db.doc('sections/NEW').set({ name: 'X', gradeLevel: 8, schoolYear: YEAR }));
    await refused(db.doc('settings/parent_portal').update({ notificationsPaused: true }));
    await refused(db.collection('users').get());
    await refused(db.doc('users/registrar@bnhs.edu').get());
    await refused(db.doc('users/logistic@bnhs.edu').update({ role: 'admin' }));
    await refused(db.doc('users/logistic@bnhs.edu').delete());
    await refused(db.doc('users/new@bnhs.edu').set({ role: 'admin' }));
    await refused(db.doc(`staff_profiles/${LOGISTIC.uid}`).set({ email: 'registrar@bnhs.edu' }));
    await refused(db.doc('scan_events/log1_S1_202609210712').set({
      studentId: 'S1', sectionId: 'SEC1', schoolYear: YEAR, kind: 'in', deviceId: LOGISTIC.uid,
      scannedAt: new Date(), scannedDate: '2026-09-21', scannedTime: '07:12', receivedAt: serverTimestamp(), source: 'kiosk',
    }));
  });

  // Not granted by the staff role: any signed-in, non-anonymous account has these, so a staff
  // member who is also a parent keeps the Parent App. Neither shows another person's records.
  it('keeps only the account-level reads that any signed-in account has', async () => {
    for (const who of [LOGISTIC, GUARDIAN_A]) await ok(as(env, who).doc('settings/parent_portal').get());
    await ok(as(env, LOGISTIC).doc(`guardians/${LOGISTIC.uid}`).get());
    await refused(as(env, LOGISTIC).doc('guardians/gA').get());
  });
});

describe('logistic operator account states', () => {
  for (const [label, change] of [
    ['who is disabled', { disabled: true }],
    ['pending a password change', { mustChangePassword: true }],
    ['on an expired password session', { sessionValidAfter: 4_000_000_000 }],
    ['whose profile is bound to another account', { uid: 'someone-else' }],
  ]) {
    it(`an operator ${label} reads none of it`, async () => {
      await seed(env, (db) => db.doc('users/logistic@bnhs.edu').update(change));
      const db = as(env, LOGISTIC);
      for (const ref of logisticReads(db)) await refused(ref.get());
    });
  }
  it('a binding without a profile reads none of it', async () => {
    await seed(env, (db) => db.doc('users/logistic@bnhs.edu').delete());
    const db = as(env, LOGISTIC);
    for (const ref of logisticReads(db)) await refused(ref.get());
  });
});

describe.each(KIOSK_PATHS)('unchanged gate reads: %s', (_label, bound) => {
  beforeEach(async () => { await seedElsewhere(); if (bound) await bind(KIOSK); });
  it('still reads the roster, schedules, attendance and settings/app, never announcements', async () => {
    const db = as(env, KIOSK);
    for (const name of ['students', 'enrollments', 'sections', 'schedules', 'student_attendance']) await ok(db.collection(name).get());
    await ok(db.doc('schedules/SCH1').get());
    await ok(db.doc('student_attendance/SEC1_2026-09-21').get());
    await ok(db.doc('settings/app').get());
    await refused(db.collection('announcements').get());
  });
});

describe('unchanged staff reads', () => {
  beforeEach(seedElsewhere);

  for (const [label, who, profile] of [
    ['legacy registrar', STAFF], ['role admin', ADMIN_NEW], ['JHS coordinator', JHS], ['SHS coordinator', SHS],
    ['grade level coordinator', GLC8],
    ['profile with a null role', LEGACY, { name: 'Legacy', role: null }],
    ['profile without a role', LEGACY, { name: 'Legacy' }],
    ['profile with a retired role', LEGACY, { name: 'Teacher', role: 'teacher' }],
  ]) {
    it(`${label} still gets and lists announcements`, async () => {
      if (profile) await seed(env, (db) => db.doc(`users/${who.token.email}`).set(profile));
      const posts = as(env, who).collection('announcements');
      await ok(posts.doc('published').get());
      await ok(posts.doc('scheduled').get());
      await ok(posts.get());
      await ok(posts.where('status', '==', 'published').get());
    });
  }

  for (const [label, who, grades] of [['JHS coordinator', JHS, [7, 8, 9, 10]], ['SHS coordinator', SHS, [11, 12]], ['grade level coordinator', GLC8, [8]]]) {
    it(`${label} still reads the roster, schedules and attendance of their grades`, async () => {
      const db = as(env, who);
      await ok(db.collection('students').where('gradeLevel', 'in', grades).where('scopeSchoolYear', '==', YEAR).get());
      for (const name of ['enrollments', 'sections', 'student_attendance']) await ok(db.collection(name).where('gradeLevel', 'in', grades).get());
      await ok(db.collection('schedules').where('gradeLevels', 'array-contains-any', grades).get());
      await ok(db.doc('settings/app').get());
    });
  }
});
