import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { setup, seed, seedBaseline, as, anon, ok, denied, STAFF, ADMIN_NEW, JHS, SHS, GLC8, KIOSK, KIOSK_INACTIVE, GUARDIAN_A, ANON } from './helpers.js';

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
  const writers = [['admin', STAFF], ['role admin', ADMIN_NEW], ['coordinator', JHS], ['kiosk', KIOSK], ['guardian', GUARDIAN_A]];
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
  it('JHS coordinator lists and gets grades 7 to 10 only', async () => {
    expect(await ids(inGrades(JHS, [7, 8, 9, 10]))).toEqual(['G10', 'G8', 'G9', 'LASTYEAR', 'REVOKED', 'S1', 'S2']);
    await ok(passes(JHS).doc('S1').get());
    await ok(passes(JHS).doc('G10').get());
    await refused(passes(JHS).get());
    await refused(passes(JHS).doc('G11').get());
    await refused(inGrades(JHS, [10, 11]).get());
    await refused(activeThisYear(JHS).get());
  });
  it('SHS coordinator lists and gets grades 11 and 12 only', async () => {
    expect(await ids(inGrades(SHS, [11, 12]))).toEqual(['G11', 'G12', 'SUPERSEDED']);
    await ok(passes(SHS).doc('G11').get());
    await ok(passes(SHS).doc('G12').get());
    await refused(passes(SHS).get());
    await refused(passes(SHS).doc('G10').get());
    await refused(inGrades(SHS, [10, 11]).get());
    await refused(activeThisYear(SHS).get());
  });
  it('a grade level coordinator is refused, even for their own grade', async () => {
    await refused(passes(GLC8).doc('G8').get());
    await refused(passes(GLC8).where('gradeLevel', '==', 8).get());
    await refused(passes(GLC8).get());
  });
  it('a disabled coordinator is refused', async () => {
    await seed(env, (db) => db.doc('users/jhs@bnhs.edu').update({ disabled: true }));
    await refused(passes(JHS).doc('S1').get());
    await refused(inGrades(JHS, [7, 8, 9, 10]).get());
  });
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
    for (const who of [JHS, SHS, GLC8, KIOSK, GUARDIAN_A]) await refused(as(env, who).doc('students/S1').update({ photo }));
    await ok(as(env, STAFF).doc('students/S1').update({ photo }));
  });

  it('no client writes learners/{id}', async () => {
    for (const who of [STAFF, ADMIN_NEW, JHS, KIOSK, GUARDIAN_A]) {
      await refused(as(env, who).doc('learners/S1').update({ photoUpdatedAt: new Date() }));
      await refused(as(env, who).doc('learners/NEW').set({ photoUpdatedAt: new Date() }));
      await refused(as(env, who).doc('learners/S1').delete());
    }
    await ok(as(env, GUARDIAN_A).doc('learners/S1').get());
  });
});
