import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool, ts } from './helpers.js';
import { issueActivationCodes, revokeCode, activateCode, acceptConsent } from '../../src/handlers/codes.js';
import { hashCode } from '../../src/lib/activationCode.js';

const NOW = new Date('2026-09-21T08:00:00+08:00');
const staff = () => ({ db: db(), now: () => NOW, uid: 'staff1', email: 'registrar@bnhs.edu' });
const guardian = (uid = 'gNew', email = `${uid}@gmail.com`) => ({ db: db(), now: () => NOW, uid, email, displayName: 'Maria' });
const adviser = (uid = 'tAdv') => guardian(uid, `${uid}@deped.gov.ph`);
const DAY = 86400_000;

beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('users/registrar@bnhs.edu').set({ role: 'registrar' });
  await db().doc('enrollments/S2_2026-2027').set({ studentId: 'S2', sectionId: 'SEC1', schoolYear: '2026-2027', status: 'enrolled' });
});

describe('issueActivationCodes', () => {
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
  it('enforces the staff daily limit', async () => {
    await db().doc('rate_limits/staff1').set({ issueCodes: { count: 20, windowStartMs: NOW.getTime() - 1000 } });
    await expect(issueActivationCodes(staff(), { sectionId: 'SEC1', schoolYear: '2026-2027' })).rejects.toMatchObject({ code: 'resource-exhausted' });
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
    expect((await db().doc('learners/S1').get()).data()).toEqual({ displayName: 'Ana B. Cruz', sectionLabel: 'Grade 7 – Rizal', schoolYear: '2026-2027' });
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
