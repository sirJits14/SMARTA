import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool, ts } from './helpers.js';
import { issueActivationCodes, revokeCode, activateCode, acceptConsent } from '../../src/handlers/codes.js';
import { hashCode } from '../../src/lib/activationCode.js';

const NOW = new Date('2026-09-21T08:00:00+08:00');
const staff = () => ({ db: db(), now: () => NOW, uid: 'staff1', email: 'registrar@bnhs.edu' });
const guardian = (uid = 'gNew') => ({ db: db(), now: () => NOW, uid, email: `${uid}@gmail.com`, displayName: 'Maria' });

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
    expect(codes.docs[0].data()).toMatchObject({ studentId: 'S1', schoolYear: '2026-2027', status: 'issued', redemptions: 0, maxRedemptions: 2, issuedBy: 'registrar@bnhs.edu' });
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
    expect(r).toEqual({ studentId: 'S1', displayName: 'Ana Cruz', sectionLabel: 'Grade 7 – Rizal' });
    expect((await db().doc('guardian_links/gNew_S1').get()).data()).toMatchObject({ guardianUid: 'gNew', studentId: 'S1', status: 'active', relationship: 'Mother', activatedVia: 'code', schoolYear: '2026-2027' });
    expect((await db().doc('guardians/gNew').get()).data()).toMatchObject({ email: 'gNew@gmail.com', consentVersion: 1, notificationsEnabled: true });
    expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data().redemptions).toBe(1);
    const audit = await db().collection('audit_log').where('action', '==', 'link.activated').get();
    expect(audit.size).toBe(1);
  });
  it('second guardian redeems; third is exhausted', async () => {
    const code = await issue();
    await activateCode(guardian('g1'), { code, relationship: 'Mother', consentVersion: 1 });
    await activateCode(guardian('g2'), { code, relationship: 'Father', consentVersion: 1 });
    expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data().status).toBe('exhausted');
    await expect(activateCode(guardian('g3'), { code, relationship: 'Guardian', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('rejects wrong consent version, unknown code, expired, revoked, restricted learner', async () => {
    const code = await issue();
    await expect(activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 0 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(activateCode(guardian(), { code: 'AAAAAAAA', relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await db().doc(`activation_codes/${hashCode(code)}`).set({ expiresAt: new Date(NOW.getTime() - 1) }, { merge: true });
    await expect(activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
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
