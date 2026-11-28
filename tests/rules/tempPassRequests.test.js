import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setup, seed, seedBaseline, as, anon, ok, denied, STAFF, ADMIN_NEW, JHS, SHS, GLC8, LOGISTIC, LEGACY, KIOSK, KIOSK_INACTIVE, GUARDIAN_A, ANON } from './helpers.js';

// Adviser requests for temporary ID passes (spec 2026-11-27 requests). Only Functions read or write
// the requests and their locks.
const YEAR = '2026-2027';
const EMAIL = GUARDIAN_A.token.email;

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore(); await seedBaseline(env);
  await seed(env, async (db) => {
    await db.doc('users/admin2@bnhs.edu').set({ name: 'Admin Two', role: 'admin', gradeLevel: null, disabled: false });
    await db.doc('users/jhs@bnhs.edu').set({ name: 'JHS', role: 'jhs_coord', gradeLevel: null, disabled: false });
    await db.doc('users/shs@bnhs.edu').set({ name: 'SHS', role: 'shs_coord', gradeLevel: null, disabled: false });
    await db.doc('users/glc8@bnhs.edu').set({ name: 'G8', role: 'glc', gradeLevel: 8, disabled: false });
    await db.doc('users/logistic@bnhs.edu').set({ name: 'Logistics', role: 'logistic', gradeLevel: null, disabled: false, uid: LOGISTIC.uid });
    // The adviser of SEC1 and SEC8, who filed both requests.
    await db.doc('school_accounts/gA').set({ email: EMAIL, status: 'active', sectionIds: ['SEC1', 'SEC8'] });
    await db.doc('guardian_links/gA_S2').set({ guardianUid: 'gA', studentId: 'S2', status: 'active', slot: 'adviser', relationship: 'Adviser' });
    for (const [id, studentId, sectionId, gradeLevel] of [['r7', 'S1', 'SEC1', 7], ['r8', 'S2', 'SEC8', 8]]) {
      await db.doc(`temp_pass_requests/${id}`).set({ studentId, sectionId, gradeLevel, schoolYear: YEAR, reason: 'new', note: '',
        status: 'pending', requestedByUid: 'gA', requestedByEmail: EMAIL });
    }
    for (const id of ['adviser_gA', 'student_S1', 'student_S2']) await db.doc(`temp_pass_request_locks/${id}`).set({ at: new Date() });
  });
});

// A refusal must come from the rule's own answer, not from the expression or document-access limit.
const LIMIT_ERROR = /maximum of \d+ expressions|Service call error|exceeded|too many/i;
const refused = async (request) => {
  const error = await denied(request);
  expect(error.message).not.toMatch(LIMIT_ERROR);
};

const clients = [
  ['legacy registrar', STAFF], ['role admin', ADMIN_NEW], ['profile without a role', LEGACY, { legacy: true }],
  ['logistic operator', LOGISTIC], ['grade level coordinator', GLC8], ['JHS coordinator', JHS], ['SHS coordinator', SHS],
  ['adviser who filed them', GUARDIAN_A], ['kiosk', KIOSK], ['kiosk with a staff_profiles binding', KIOSK, { bound: true }],
  ['inactive kiosk', KIOSK_INACTIVE], ['anonymous sign-in', ANON], ['signed-out user', null],
];

describe.each(clients)('pass requests are closed to the %s', (_label, who, setting = {}) => {
  beforeEach(() => seed(env, async (db) => {
    if (setting.legacy) await db.doc(`users/${who.token.email}`).set({ name: 'Legacy' });
    if (setting.bound) await db.doc(`staff_profiles/${who.uid}`).set({ email: who.token.email });
  }));
  const client = () => (who ? as(env, who) : anon(env));

  it('temp_pass_requests: no get, list, create, update or delete', async () => {
    const db = client();
    const requests = db.collection('temp_pass_requests');
    for (const id of ['r7', 'r8']) {
      await refused(requests.doc(id).get());
      await refused(requests.doc(id).update({ status: 'printed' }));
      await refused(requests.doc(id).delete());
    }
    await refused(requests.doc('missing').get());
    await refused(requests.get());
    await refused(requests.limit(1).get());
    // Bounded, filtered lists a query-shaped allow rule would accept: the adviser's own, one grade, all waiting.
    await refused(requests.where('requestedByUid', '==', 'gA').limit(50).get());
    await refused(requests.where('requestedByEmail', '==', EMAIL).limit(50).get());
    await refused(requests.where('gradeLevel', '==', 8).limit(50).get());
    await refused(requests.where('status', '==', 'pending').where('schoolYear', '==', YEAR).limit(200).get());
    await refused(requests.doc('new').set({ studentId: 'S1', sectionId: 'SEC1', gradeLevel: 7, schoolYear: YEAR, reason: 'new',
      status: 'pending', requestedByUid: 'gA' }));
    await refused(db.collectionGroup('temp_pass_requests').get());
  });

  it('temp_pass_request_locks: no get, list, create, update or delete', async () => {
    const db = client();
    const locks = db.collection('temp_pass_request_locks');
    for (const id of ['adviser_gA', 'student_S1']) {
      await refused(locks.doc(id).get());
      await refused(locks.doc(id).set({ at: new Date() }));
      await refused(locks.doc(id).update({ at: new Date() }));
      await refused(locks.doc(id).delete());
    }
    await refused(locks.doc('student_S9').get());
    await refused(locks.doc('student_S9').set({ at: new Date() }));
    await refused(locks.get());
    await refused(db.collectionGroup('temp_pass_request_locks').get());
  });
});

describe('the pass request matches', () => {
  it('are stated in the rules file, not left to the default deny', () => {
    const rules = readFileSync(process.env.SIMS_RULES_PATH || 'firestore.rules', 'utf8');
    for (const name of ['temp_pass_requests', 'temp_pass_request_locks']) {
      expect(rules).toMatch(new RegExp(`match /${name}/\\{\\w+\\}\\s*\\{ allow read, write: if false; \\}`));
    }
  });
  it('deny only these collections: the same staff still read learners', async () => {
    await ok(as(env, STAFF).doc('students/S1').get());
    await ok(as(env, LOGISTIC).doc('students/S1').get());
  });
});
