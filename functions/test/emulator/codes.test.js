import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, clearAll, seedSchool, ts } from './helpers.js';
import { endSchoolYear } from '../../src/handlers/schoolYear.js';
import { issueActivationCodes, reissueActivationCode, revokeCode, activateCode, acceptConsent } from '../../src/handlers/codes.js';
import { requestAccess, resolveAccessRequest } from '../../src/handlers/links.js';
import { hashCode } from '../../src/lib/activationCode.js';
import { logWarn } from '../../src/log.js';
import { LIMITS } from '../../src/callable.js';

// logWarn carries activateCode's real failure reason; firebase-functions'
// logger can't be spied on (see scanEvent.test.js), so mock the module.
vi.mock('../../src/log.js', () => ({ logEvent: vi.fn(), logWarn: vi.fn() }));

const NOW = new Date('2026-09-21T08:00:00+08:00');
const staff = () => ({ db: db(), now: () => NOW, uid: 'staff1', email: 'registrar@bnhs.edu' });
const guardian = (uid = 'gNew', email = `${uid}@gmail.com`) => ({ db: db(), now: () => NOW, uid, email, displayName: 'Maria' });
const adviser = (uid = 'tAdv') => guardian(uid, `${uid}@deped.gov.ph`);
const DAY = 86400_000;

const SEC = { sectionId: 'SEC1', schoolYear: '2026-2027' };
const seedLink = (uid, studentId, slot) => db().doc(`guardian_links/${uid}_${studentId}`).set({
  guardianUid: uid, studentId, status: 'active', schoolYear: '2026-2027', relationship: slot === 'adviser' ? 'Adviser' : 'Mother', slot,
});
const endYear = (schoolYear = '2026-2027') => endSchoolYear(staff(), { schoolYear, confirmText: schoolYear });
const linkAll = async (studentId) => { await seedLink('gA', studentId, 'guardian'); await seedLink('gB', studentId, 'guardian'); await seedLink('tAdv', studentId, 'adviser'); };

beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('users/registrar@bnhs.edu').set({ role: 'registrar' });
  await db().doc('enrollments/S2_2026-2027').set({ studentId: 'S2', sectionId: 'SEC1', schoolYear: '2026-2027', status: 'enrolled' });
  // seedSchool() links two guardians to S1; new S1 codes would start with
  // both guardian slots used. These tests link guardians themselves.
  await db().doc('guardian_links/gA_S1').delete();
  await db().doc('guardian_links/gB_S1').delete();
});

describe('issueActivationCodes', () => {
  it('returns slips male first, then female, sorted by last and first name', async () => {
    const students = [
      ['S3', 'Zara', 'Abad', 'F'], ['S4', 'Zed', 'Cruz', 'M'],
      ['S5', 'Aaron', 'Cruz', 'M'], ['S6', 'Bea', 'Abad', 'F'],
    ];
    for (const [id, firstName, lastName, sex] of students) {
      await db().doc(`students/${id}`).set({ firstName, lastName, sex, lrn: id });
      await db().doc(`enrollments/${id}_2026-2027`).set({ studentId: id, sectionId: 'SEC1', schoolYear: '2026-2027', status: 'enrolled' });
    }
    const result = await issueActivationCodes(staff(), SEC);
    expect(result.slips.map((slip) => slip.studentId)).toEqual(['S5', 'S4', 'S2', 'S6', 'S3', 'S1']);
  });
  it('issues one code per enrolled learner, stores only hashes, skips restricted', async () => {
    await db().doc('students/S2').set({ activationRestricted: true }, { merge: true });
    const r = await issueActivationCodes(staff(), { sectionId: 'SEC1', schoolYear: '2026-2027' });
    expect(r.slips).toHaveLength(1);
    expect(r.slips[0]).toMatchObject({ studentId: 'S1', name: 'Cruz, Ana B.', lrn: '100000000001', sectionLabel: 'Grade 7 – Rizal' });
    expect(r.slips[0].code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(r.skipped).toEqual([{ studentId: 'S2', reason: 'restricted' }]);
    const codes = await db().collection('activation_codes').get();
    expect(codes.size).toBe(1);
    expect(codes.docs[0].id).toBe(hashCode(r.slips[0].code));
    expect(r.slips[0].schoolYear).toBe('2026-2027');
    const stored = codes.docs[0].data();
    expect(stored).toMatchObject({ studentId: 'S1', schoolYear: '2026-2027', status: 'issued', guardianRedemptions: 0, maxGuardians: 2, adviserRedemptions: 0, maxAdvisers: 1, issuedBy: 'registrar@bnhs.edu' });
    expect(stored.expiresAt).toBeUndefined();
    expect(stored.redemptions).toBeUndefined();
    expect(JSON.stringify(codes.docs[0].data())).not.toContain(r.slips[0].code);
  });
  it('reissuing revokes the previous code', async () => {
    const a = await issueActivationCodes(staff(), { sectionId: 'SEC1', schoolYear: '2026-2027' });
    await issueActivationCodes(staff(), { sectionId: 'SEC1', schoolYear: '2026-2027' });
    expect((await db().doc(`activation_codes/${hashCode(a.slips.find((s) => s.studentId === 'S1').code)}`).get()).data().status).toBe('revoked');
  });
  it('lets one registrar issue every section of a large school in a day', async () => {
    // 2026-10-16: the old 20/day limit stopped issuing after 20 of 159 sections.
    await db().doc('rate_limits/staff1').set({ issueCodes: { count: 200, windowStartMs: NOW.getTime() - 1000 } });
    await expect(issueActivationCodes(staff(), SEC)).resolves.toMatchObject({ slips: expect.any(Array) });
  });
  it('enforces the staff daily limit and says when it resets', async () => {
    await db().doc('rate_limits/staff1').set({ issueCodes: { count: LIMITS.issueCodes.max, windowStartMs: NOW.getTime() - 3600_000 } });
    await expect(issueActivationCodes(staff(), SEC)).rejects.toMatchObject({
      code: 'resource-exhausted',
      message: `Slips were issued for ${LIMITS.issueCodes.max} sections in the last 24 hours, the daily limit. You can issue more after Sep 22, 7:00 AM.`,
    });
  });
  it('pre-fills slots from the learner\'s active links', async () => {
    await seedLink('gA', 'S1', 'guardian');
    const r = await issueActivationCodes(staff(), SEC);
    const code = r.slips.find((s) => s.studentId === 'S1').code;
    expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data()).toMatchObject({ guardianRedemptions: 1, maxGuardians: 2, adviserRedemptions: 0, maxAdvisers: 1, status: 'issued' });
    await activateCode(guardian('g1'), { code, relationship: 'Father', consentVersion: 1 });
    await expect(activateCode(guardian('g2'), { code, relationship: 'Guardian', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('skips a learner whose every slot is linked and leaves their code alone', async () => {
    const first = await issueActivationCodes(staff(), SEC);
    const old = first.slips.find((s) => s.studentId === 'S1').code;
    await linkAll('S1');
    const r = await issueActivationCodes(staff(), SEC);
    expect(r.skipped).toEqual([{ studentId: 'S1', reason: 'fully-linked' }]);
    expect(r.slips.map((s) => s.studentId)).toEqual(['S2']);
    expect((await db().doc(`activation_codes/${hashCode(old)}`).get()).data().status).toBe('issued');
  });
  it('refuses a school year that has ended', async () => {
    await endYear();
    await expect(issueActivationCodes(staff(), SEC)).rejects.toMatchObject({ code: 'failed-precondition', message: 'The 2026-2027 school year has ended.' });
    expect((await db().collection('activation_codes').get()).size).toBe(0);
  });
  it('still issues for a year that has not ended', async () => {
    await endYear('2025-2026');
    expect((await issueActivationCodes(staff(), SEC)).slips).toHaveLength(2);
  });
});

describe('reissueActivationCode', () => {
  const reissue = (data = {}) => reissueActivationCode(staff(), { studentId: 'S1', schoolYear: '2026-2027', reason: 'lost slip', ...data });
  const slipCode = (r, id) => r.slips.find((s) => s.studentId === id).code;
  const codeDoc = async (code) => (await db().doc(`activation_codes/${hashCode(code)}`).get()).data();

  it('replaces only that learner\'s slip and returns it with the free slots', async () => {
    const first = await issueActivationCodes(staff(), SEC);
    const r = await reissue();
    expect(r.slip).toMatchObject({ studentId: 'S1', name: 'Cruz, Ana B.', lrn: '100000000001', sectionLabel: 'Grade 7 – Rizal', schoolYear: '2026-2027' });
    expect(r.slip.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(r.slotsFree).toEqual({ guardian: 2, adviser: 1 });
    expect(await codeDoc(slipCode(first, 'S1'))).toMatchObject({ status: 'revoked', revokedReason: 'lost slip' });
    expect((await codeDoc(r.slip.code)).status).toBe('issued');
    expect((await codeDoc(slipCode(first, 'S2'))).status).toBe('issued');
    await expect(activateCode(guardian('g1'), { code: slipCode(first, 'S2'), relationship: 'Mother', consentVersion: 1 })).resolves.toMatchObject({ studentId: 'S2' });
  });
  it('counts linked guardians: one more can link, a third is refused', async () => {
    const first = await issueActivationCodes(staff(), SEC);
    await activateCode(guardian('g1'), { code: slipCode(first, 'S1'), relationship: 'Mother', consentVersion: 1 });
    const r = await reissue();
    expect(r.slotsFree).toEqual({ guardian: 1, adviser: 1 });
    // The already-linked guardian can enter the new code without using a slot.
    await activateCode(guardian('g1'), { code: r.slip.code, relationship: 'Mother', consentVersion: 1 });
    expect((await codeDoc(r.slip.code)).guardianRedemptions).toBe(1);
    await activateCode(guardian('g2'), { code: r.slip.code, relationship: 'Father', consentVersion: 1 });
    await expect(activateCode(guardian('g3'), { code: r.slip.code, relationship: 'Guardian', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('refuses when every slot is linked and leaves the current code alone', async () => {
    const first = await issueActivationCodes(staff(), SEC);
    await linkAll('S1');
    await expect(reissue()).rejects.toMatchObject({ code: 'failed-precondition', message: 'All guardian and adviser slots are linked. Revoke a link first.' });
    expect((await codeDoc(slipCode(first, 'S1'))).status).toBe('issued');
  });
  it('refuses an empty reason and unknown, not-enrolled or restricted learners', async () => {
    await expect(reissue({ reason: '   ' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(reissue({ studentId: 'NOPE' })).rejects.toMatchObject({ code: 'not-found', message: 'Learner not found' });
    await expect(reissue({ schoolYear: '2027-2028' })).rejects.toMatchObject({ code: 'failed-precondition', message: 'This learner is not enrolled for 2027-2028.' });
    await db().doc('students/S1').set({ activationRestricted: true }, { merge: true });
    await expect(reissue()).rejects.toMatchObject({ code: 'failed-precondition', message: 'This learner is restricted. Lift the restriction first.' });
    expect((await db().collection('activation_codes').get()).size).toBe(0);
    expect((await db().collection('audit_log').where('action', '==', 'code.reissued').get()).size).toBe(0);
  });
  it('refuses a school year that has ended', async () => {
    await endYear();
    await expect(reissue()).rejects.toMatchObject({ code: 'failed-precondition', message: 'The 2026-2027 school year has ended.' });
    expect((await db().collection('activation_codes').get()).size).toBe(0);
    expect((await db().collection('audit_log').where('action', '==', 'code.reissued').get()).size).toBe(0);
  });
  it('writes a code.reissued audit entry without the raw code', async () => {
    const r = await reissue();
    const rows = await db().collection('audit_log').where('action', '==', 'code.reissued').get();
    expect(rows.size).toBe(1);
    expect(rows.docs[0].data()).toMatchObject({
      actorType: 'staff', actorUid: 'registrar@bnhs.edu', targetType: 'student', targetId: 'S1',
      details: { schoolYear: '2026-2027', reason: 'lost slip', guardianSlotsFree: 2, adviserSlotsFree: 1 },
    });
    expect(JSON.stringify(rows.docs[0].data())).not.toContain(r.slip.code);
  });
  it('has its own daily limit, separate from section-wide issuing', async () => {
    await db().doc('rate_limits/staff1').set({ issueCodes: { count: LIMITS.issueCodes.max, windowStartMs: NOW.getTime() - 1000 } });
    await expect(reissue()).resolves.toMatchObject({ slip: { studentId: 'S1' } });
    await db().doc('rate_limits/staff1').set({ reissueCode: { count: 60, windowStartMs: NOW.getTime() - 1000 } }, { merge: true });
    await expect(reissue()).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});

describe('activateCode', () => {
  const issue = async () => (await issueActivationCodes(staff(), { sectionId: 'SEC1', schoolYear: '2026-2027' })).slips.find((s) => s.studentId === 'S1').code;

  it('links the guardian, creates the profile with consent, counts the redemption, audits', async () => {
    const code = await issue();
    const r = await activateCode(guardian(), { code: code.toLowerCase(), relationship: 'Mother', consentVersion: 1 });
    expect(r).toEqual({ studentId: 'S1', displayName: 'Ana B. Cruz', sectionLabel: 'Grade 7 – Rizal' });
    expect((await db().doc('guardian_links/gNew_S1').get()).data()).toMatchObject({ guardianUid: 'gNew', studentId: 'S1', status: 'active', relationship: 'Mother', slot: 'guardian', activatedVia: 'code', schoolYear: '2026-2027' });
    expect((await db().doc('guardians/gNew').get()).data()).toMatchObject({ email: 'gNew@gmail.com', consentVersion: 1, notificationsEnabled: true });
    expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data().guardianRedemptions).toBe(1);
    const audit = await db().collection('audit_log').where('action', '==', 'link.activated').get();
    expect(audit.size).toBe(1);
  });
  it('seeds the learner projection with the full name before any gate scan', async () => {
    const code = await issue();
    await activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 1 });
    expect((await db().doc('learners/S1').get()).data()).toEqual({ displayName: 'Ana B. Cruz', formalName: 'Cruz, Ana B.', lastName: 'Cruz', firstName: 'Ana', sex: 'F', sectionLabel: 'Grade 7 – Rizal', schoolYear: '2026-2027' });
  });
  it('keeps an existing scan summary when seeding the learner projection', async () => {
    await db().doc('learners/S1').set({ displayName: 'Ana Cruz', today: { date: '2026-09-21', status: 'in' } });
    const code = await issue();
    await activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 1 });
    expect((await db().doc('learners/S1').get()).data()).toMatchObject({ displayName: 'Ana B. Cruz', today: { date: '2026-09-21', status: 'in' } });
  });
  it('records the guardian name typed on Activate, falling back to the sign-in name', async () => {
    const code = await issue();
    await activateCode(guardian('g1'), { code, relationship: 'Mother', consentVersion: 1, guardianName: '  Maria Santos Cruz ' });
    expect((await db().doc('guardians/g1').get()).data().displayName).toBe('Maria Santos Cruz');
    expect((await db().doc('guardian_links/g1_S1').get()).data()).toMatchObject({ guardianName: 'Maria Santos Cruz', guardianEmail: 'g1@gmail.com', learnerName: 'Ana B. Cruz' });
    await activateCode(guardian('g2'), { code, relationship: 'Father', consentVersion: 1 });
    expect((await db().doc('guardian_links/g2_S1').get()).data().guardianName).toBe('Maria');
  });
  it('fills in the name of an existing guardian profile that had none', async () => {
    await db().doc('guardians/gNew').set({ email: 'gNew@gmail.com', displayName: '', consentVersion: 1 });
    const code = await issue();
    await activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 1, guardianName: 'Maria Cruz' });
    expect((await db().doc('guardians/gNew').get()).data().displayName).toBe('Maria Cruz');
  });
  it('two guardians fill the guardian slots; a third guardian is refused but the adviser still links', async () => {
    const code = await issue();
    await activateCode(guardian('g1'), { code, relationship: 'Mother', consentVersion: 1 });
    await activateCode(guardian('g2'), { code, relationship: 'Father', consentVersion: 1 });
    expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data().status).toBe('issued');
    await expect(activateCode(guardian('g3'), { code, relationship: 'Guardian', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await activateCode(adviser(), { code, relationship: 'Adviser', consentVersion: 1 });
    expect((await db().doc('guardian_links/tAdv_S1').get()).data()).toMatchObject({ relationship: 'Adviser', slot: 'adviser', status: 'active' });
    const c = (await db().doc(`activation_codes/${hashCode(code)}`).get()).data();
    expect(c).toMatchObject({ guardianRedemptions: 2, adviserRedemptions: 1, status: 'exhausted' });
  });
  it('only one adviser per slip', async () => {
    const code = await issue();
    await activateCode(adviser('t1'), { code, relationship: 'Adviser', consentVersion: 1 });
    await expect(activateCode(adviser('t2'), { code, relationship: 'Adviser', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await activateCode(guardian('g1'), { code, relationship: 'Mother', consentVersion: 1 });
  });
  it('refuses a non-DepEd account as adviser before looking at the code', async () => {
    const code = await issue();
    await expect(activateCode(guardian('g1'), { code, relationship: 'Adviser', consentVersion: 1 }))
      .rejects.toMatchObject({ code: 'permission-denied', message: 'Sign in with your @deped.gov.ph account to link as adviser.' });
    await expect(activateCode(guardian('g2'), { code: 'AAAAAAAA', relationship: 'Adviser', consentVersion: 1 }))
      .rejects.toMatchObject({ code: 'permission-denied' });
    expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data().adviserRedemptions).toBe(0);
  });
  it('re-redeeming by an already-linked account uses no slot; switching guardian→adviser is refused', async () => {
    const code = await issue();
    await activateCode(guardian('g1', 'g1@deped.gov.ph'), { code, relationship: 'Mother', consentVersion: 1 });
    await activateCode(guardian('g1', 'g1@deped.gov.ph'), { code, relationship: 'Mother', consentVersion: 1 });
    expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data().guardianRedemptions).toBe(1);
    await expect(activateCode(guardian('g1', 'g1@deped.gov.ph'), { code, relationship: 'Adviser', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('a legacy exhausted code with a past expiry still accepts an adviser', async () => {
    const code = await issue();
    await db().doc(`activation_codes/${hashCode(code)}`).set({
      studentId: 'S1', schoolYear: '2026-2027', status: 'exhausted', redemptions: 2, maxRedemptions: 2, expiresAt: ts(NOW.getTime() - DAY),
    });
    await activateCode(adviser(), { code, relationship: 'Adviser', consentVersion: 1 });
    const c = (await db().doc(`activation_codes/${hashCode(code)}`).get()).data();
    expect(c).toMatchObject({ guardianRedemptions: 2, adviserRedemptions: 1, status: 'exhausted' });
    expect(c.redemptions).toBeUndefined();
  });
  const legacyCode = async () => { const code = await issue(); await db().doc(`activation_codes/${hashCode(code)}`).set({ studentId: 'S1', schoolYear: '2026-2027', status: 'exhausted', redemptions: 2, maxRedemptions: 2 }); return code; };
  it('reissuing revokes a legacy exhausted code so it can no longer link an adviser', async () => {
    const old = await legacyCode();
    await issueActivationCodes(staff(), { sectionId: 'SEC1', schoolYear: '2026-2027' });
    expect((await db().doc(`activation_codes/${hashCode(old)}`).get()).data().status).toBe('revoked');
    await expect(activateCode(adviser(), { code: old, relationship: 'Adviser', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('revokeCode revokes a legacy exhausted code', async () => {
    const old = await legacyCode();
    await revokeCode(staff(), { studentId: 'S1', schoolYear: '2026-2027', reason: 'lost' });
    expect((await db().doc(`activation_codes/${hashCode(old)}`).get()).data()).toMatchObject({ status: 'revoked', revokedReason: 'lost' });
    await expect(activateCode(adviser(), { code: old, relationship: 'Adviser', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('a slip still works 120 days after issue', async () => {
    const code = await issue();
    const later = { ...guardian(), now: () => new Date(NOW.getTime() + 120 * DAY) };
    await expect(activateCode(later, { code, relationship: 'Mother', consentVersion: 1 })).resolves.toMatchObject({ studentId: 'S1' });
  });
  it('a slip keeps working after the current school year changes, linking for the slip\'s own SY', async () => {
    const code = await issue();
    await db().doc('settings/app').set({ currentSchoolYear: '2027-2028' });
    await activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 1 });
    expect((await db().doc('guardian_links/gNew_S1').get()).data()).toMatchObject({ status: 'active', schoolYear: '2026-2027' });
  });
  it('rejects wrong consent version, unknown code, revoked, restricted learner', async () => {
    const code = await issue();
    await expect(activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 0 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(activateCode(guardian(), { code: 'AAAAAAAA', relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await revokeCode(staff(), { studentId: 'S1', schoolYear: '2026-2027', reason: 'lost' });
    await expect(activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
    const code2 = await issue();
    await db().doc('students/S1').set({ activationRestricted: true }, { merge: true });
    await expect(activateCode(guardian(), { code: code2, relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('refuses a slip whose school year has ended, even if it was never revoked', async () => {
    const code = await issue();
    // A slip that slipped past endSchoolYear's revocation (e.g. issued
    // while it was running) must still not link anyone.
    await endYear();
    await db().doc(`activation_codes/${hashCode(code)}`).update({ status: 'issued' });
    await expect(activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition', message: 'That code could not be used. Ask the registrar to reissue your slip.' });
    expect(logWarn).toHaveBeenLastCalledWith('activation_failed', expect.objectContaining({ reason: 'year-ended' }));
    expect((await db().doc('guardian_links/gNew_S1').get()).exists).toBe(false);
    expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data().guardianRedemptions).toBe(0);
  });
  it('a slip for a year that has not ended still links after another year ends', async () => {
    const code = await issue();
    await endYear('2025-2026');
    await expect(activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 1 })).resolves.toMatchObject({ studentId: 'S1' });
  });
  it('rate-limits after 5 attempts per hour', async () => {
    for (let i = 0; i < 5; i++) await expect(activateCode(guardian(), { code: 'AAAAAAAA', relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(activateCode(guardian(), { code: 'AAAAAAAA', relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
  it('gives advisers their own, higher limit: 6 attempts are not rate-limited', async () => {
    for (let i = 0; i < 6; i++) await expect(activateCode(adviser(), { code: 'AAAAAAAA', relationship: 'Adviser', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('still rate-limits an adviser once the adviser window is full', async () => {
    await db().doc('rate_limits/tAdv').set({ activateAdviser: { count: 60, windowStartMs: NOW.getTime() - 1000 } });
    await expect(activateCode(adviser(), { code: 'AAAAAAAA', relationship: 'Adviser', consentVersion: 1 })).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
  describe('link cap (counts every active link, however it was made)', () => {
    const accessReq = { studentLrn: '100000000001', learnerNameTyped: 'Ana Cruz', relationship: 'Guardian', contactNumber: '09171234567' };
    const approveAccess = async (uid) => {
      const { id } = await requestAccess(guardian(uid), accessReq);
      await resolveAccessRequest(staff(), { id, approve: true, studentId: 'S1', note: 'ID checked' });
    };
    const failReasons = () => logWarn.mock.calls.filter(([e]) => e === 'activation_failed').map(([, f]) => f.reason);
    beforeEach(() => logWarn.mockClear());

    it('refuses a guardian once access-request approvals fill the guardian slots the code still shows free', async () => {
      const code = await issue();
      await approveAccess('g1');
      await approveAccess('g2');
      await expect(activateCode(guardian('g3'), { code, relationship: 'Guardian', consentVersion: 1 }))
        .rejects.toMatchObject({ code: 'failed-precondition', message: 'That code could not be used. Ask the registrar to reissue your slip.' });
      expect(failReasons()).toEqual(['cap']);
      expect((await db().doc('guardian_links/g3_S1').get()).exists).toBe(false);
      expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data()).toMatchObject({ guardianRedemptions: 0, status: 'issued' });
      // The adviser slot is a separate cap and is still free.
      await activateCode(adviser(), { code, relationship: 'Adviser', consentVersion: 1 });
      expect((await db().doc('guardian_links/tAdv_S1').get()).data()).toMatchObject({ status: 'active', slot: 'adviser' });
    });
    it('an already-linked guardian can still re-enter the code while the slots are full', async () => {
      const code = await issue();
      await approveAccess('g1');
      await approveAccess('g2');
      await expect(activateCode(guardian('g1'), { code, relationship: 'Guardian', consentVersion: 1 })).resolves.toMatchObject({ studentId: 'S1' });
      expect((await db().doc('guardian_links/g1_S1').get()).data()).toMatchObject({ status: 'active', activatedVia: 'code' });
      expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data().guardianRedemptions).toBe(0);
    });
    it('refuses a second adviser when one is already linked outside this code', async () => {
      const code = await issue();
      await seedLink('t1', 'S1', 'adviser');
      await expect(activateCode(adviser('t2'), { code, relationship: 'Adviser', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
      expect(failReasons()).toEqual(['cap']);
      await activateCode(guardian('g1'), { code, relationship: 'Mother', consentVersion: 1 });
    });
    it('a guardian still active from last school year counts as a new link for this one', async () => {
      const code = await issue();
      await db().doc('guardian_links/gOld_S1').set({ guardianUid: 'gOld', studentId: 'S1', status: 'active', schoolYear: '2025-2026', relationship: 'Mother', slot: 'guardian' });
      await seedLink('gA', 'S1', 'guardian');
      await seedLink('gB', 'S1', 'guardian');
      await expect(activateCode(guardian('gOld'), { code, relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
      expect(failReasons()).toEqual(['cap']);
      expect((await db().doc('guardian_links/gOld_S1').get()).data().schoolYear).toBe('2025-2026');
    });
  });
  it('re-activation after revocation flips the same link back to active', async () => {
    const code = await issue();
    await activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 1 });
    await db().doc('guardian_links/gNew_S1').set({ status: 'revoked' }, { merge: true });
    const code2 = await issue();
    await activateCode(guardian(), { code: code2, relationship: 'Mother', consentVersion: 1 });
    expect((await db().doc('guardian_links/gNew_S1').get()).data().status).toBe('active');
  });
});

describe('acceptConsent', () => {
  it('requires the current notice to be accepted before a first-time parent can skip linking', async () => {
    await db().doc('settings/parent_portal').set({ consentVersion: 2 }, { merge: true });
    await expect(acceptConsent(guardian(), { acceptedConsentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect((await db().doc('guardians/gNew').get()).exists).toBe(false);
  });
  it('creates a usable account without linking a learner when onboarding is skipped', async () => {
    await acceptConsent({ ...guardian(), email: 'parent@example.test', displayName: 'Ana Santos' }, { acceptedConsentVersion: 1 });
    const profile = (await db().doc('guardians/gNew').get()).data();
    expect(profile).toMatchObject({
      email: 'parent@example.test', displayName: 'Ana Santos', consentVersion: 1,
      notificationsEnabled: true, audienceKeys: [],
    });
    expect(profile.createdAt.toMillis()).toBeGreaterThan(0);
    expect(profile.lastActiveLinkAt.toMillis()).toBe(profile.createdAt.toMillis());
    expect((await db().collection('guardian_links').where('guardianUid', '==', 'gNew').get()).empty).toBe(true);
  });
  it('preserves an existing account and its audience when consent is accepted again', async () => {
    await db().doc('guardians/gA').set({ displayName: 'Saved Name', notificationsEnabled: false, audienceKeys: ['all', 'g7'], createdAt: ts('2026-01-01T00:00:00Z') }, { merge: true });
    await acceptConsent({ ...guardian('gA'), displayName: 'Auth Name' });
    const profile = (await db().doc('guardians/gA').get()).data();
    expect(profile).toMatchObject({ displayName: 'Saved Name', notificationsEnabled: false, audienceKeys: ['all', 'g7'] });
    expect(profile.createdAt.toMillis()).toBe(Date.parse('2026-01-01T00:00:00Z'));
  });
  it('can link a learner later after skipping onboarding', async () => {
    await acceptConsent({ ...guardian(), displayName: 'Ana Santos' });
    const createdAt = (await db().doc('guardians/gNew').get()).data().createdAt;
    const code = (await issueActivationCodes(staff(), { sectionId: 'SEC1', schoolYear: '2026-2027' })).slips.find((s) => s.studentId === 'S1').code;
    await activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 1, guardianName: 'Ana Santos' });
    expect((await db().doc('guardian_links/gNew_S1').get()).data().status).toBe('active');
    expect((await db().doc('guardians/gNew').get()).data().createdAt.toMillis()).toBe(createdAt.toMillis());
  });
  // seedSchool() links gA to S1 already (an "already-linked" guardian) with
  // no reconsent flow having ever touched their profile.
  it('updates the caller to the CURRENT live consentVersion, ignoring anything the client sent', async () => {
    await db().doc('guardians/gA').set({ consentVersion: 1, consentAcceptedAt: ts('2026-01-01T00:00:00Z') }, { merge: true });
    await db().doc('settings/parent_portal').set({ consentVersion: 3 }, { merge: true });
    const r = await acceptConsent(guardian('gA'), { consentVersion: 999, uid: 'gB' });
    expect(r).toEqual({ consentVersion: 3 });
    const profile = (await db().doc('guardians/gA').get()).data();
    expect(profile.consentVersion).toBe(3);
    expect(profile.consentAcceptedAt.toMillis()).toBeGreaterThan(Date.parse('2026-01-01T00:00:00Z'));
  });
  it('only ever writes the caller\'s own guardians/{uid} doc', async () => {
    await db().doc('settings/parent_portal').set({ consentVersion: 2 }, { merge: true });
    await acceptConsent(guardian('gA'));
    expect((await db().doc('guardians/gB').get()).data().consentVersion).toBeUndefined();
  });
  it('defaults to consentVersion 1 when settings/parent_portal has none set', async () => {
    await db().doc('settings/parent_portal').set({ notificationsPaused: false });
    const r = await acceptConsent(guardian('gA'));
    expect(r).toEqual({ consentVersion: 1 });
  });
});
