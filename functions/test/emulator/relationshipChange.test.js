import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { changeLinkRelationship } from '../../src/handlers/links.js';
import { issueActivationCodes, reissueActivationCode, activateCode } from '../../src/handlers/codes.js';
import { hashCode } from '../../src/lib/activationCode.js';
import { LIMITS } from '../../src/callable.js';

const NOW = new Date('2026-09-21T08:00:00+08:00');
const SY = '2026-2027';
const staff = () => ({ db: db(), now: () => NOW, uid: 'staff1', email: 'registrar@bnhs.edu' });
const account = (uid, email) => ({ db: db(), now: () => NOW, uid, email, displayName: 'Teacher' });
const deped = (uid = 'tAdv') => account(uid, `${uid}@deped.gov.ph`);
const gmail = (uid) => account(uid, `${uid}@gmail.com`);
const change = (who, relationship, studentId = 'S1') => changeLinkRelationship(who, { studentId, relationship });
const link = async (id) => (await db().doc(`guardian_links/${id}`).get()).data();
const seedLink = (uid, over = {}) => db().doc(`guardian_links/${uid}_S1`).set({
  guardianUid: uid, studentId: 'S1', status: 'active', schoolYear: SY, relationship: 'Mother', slot: 'guardian', ...over,
});
const issueSlip = async () => (await issueActivationCodes(staff(), { sectionId: 'SEC1', schoolYear: SY })).slips.find((s) => s.studentId === 'S1').code;
const redeem = (who, code, relationship) => activateCode(who, { code, relationship, consentVersion: 1, guardianName: 'Name' });
const slip = async (code) => (await db().doc(`activation_codes/${hashCode(code)}`).get()).data();
const audits = async () => (await db().collection('audit_log').where('action', '==', 'link.relationshipChanged').get()).docs.map((d) => d.data());

beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('users/registrar@bnhs.edu').set({ role: 'registrar' });
  // seedSchool() links gA and gB to S1; these tests link people themselves.
  await db().doc('guardian_links/gA_S1').delete();
  await db().doc('guardian_links/gB_S1').delete();
});

describe('changeLinkRelationship', () => {
  it('moves an adviser who picked Mother into the adviser slot and frees the guardian slot on the slip', async () => {
    const code = await issueSlip();
    await redeem(deped(), code, 'Mother');
    expect(await slip(code)).toMatchObject({ guardianRedemptions: 1, adviserRedemptions: 0 });

    await expect(change(deped(), 'Adviser')).resolves.toEqual({ relationship: 'Adviser', slot: 'adviser' });
    const changed = await link('tAdv_S1');
    expect(changed).toMatchObject({ status: 'active', relationship: 'Adviser', slot: 'adviser', previousRelationship: 'Mother', relationshipChangedFor: SY });
    expect(changed.relationshipChangedAt).toBeTruthy();
    expect(await slip(code)).toMatchObject({ guardianRedemptions: 0, adviserRedemptions: 1, status: 'issued' });
    expect(await audits()).toEqual([expect.objectContaining({
      actorType: 'guardian', actorUid: 'tAdv', targetType: 'student', targetId: 'S1',
      details: { from: 'Mother', to: 'Adviser', fromSlot: 'guardian', toSlot: 'adviser', schoolYear: SY },
    })]);

    // Both real parents can now use the slip.
    await redeem(gmail('gA'), code, 'Mother');
    await redeem(gmail('gB'), code, 'Father');
    expect(await slip(code)).toMatchObject({ guardianRedemptions: 2, adviserRedemptions: 1, status: 'exhausted' });
  });

  it('moves a DepEd teacher who picked Adviser into a guardian relationship', async () => {
    const code = await issueSlip();
    await redeem(deped('tMom'), code, 'Adviser');
    await expect(change(deped('tMom'), 'Father')).resolves.toEqual({ relationship: 'Father', slot: 'guardian' });
    expect(await link('tMom_S1')).toMatchObject({ relationship: 'Father', slot: 'guardian', previousRelationship: 'Adviser' });
    expect(await slip(code)).toMatchObject({ guardianRedemptions: 1, adviserRedemptions: 0, status: 'issued' });
  });

  it('refuses accounts that are not DepEd before reading or writing anything', async () => {
    await seedLink('gX');
    await expect(change(gmail('gX'), 'Adviser')).rejects.toMatchObject({ code: 'permission-denied', message: 'Only DepEd (@deped.gov.ph) accounts can change their relationship.' });
    await expect(change(account('gX', 'gX@deped.gov.ph.example.com'), 'Adviser')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await link('gX_S1')).toMatchObject({ relationship: 'Mother', slot: 'guardian' });
    expect((await db().doc('rate_limits/gX').get()).exists).toBe(false);
  });

  it('refuses a same-side, unchanged or unknown relationship', async () => {
    await seedLink('tAdv');
    await expect(change(deped(), 'Father')).rejects.toMatchObject({ code: 'invalid-argument', message: 'Choose Adviser, or the relationship you have to the learner.' });
    await expect(change(deped(), 'Mother')).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(change(deped(), 'Teacher')).rejects.toMatchObject({ code: 'invalid-argument' });
    const l = await link('tAdv_S1');
    expect(l).toMatchObject({ relationship: 'Mother', slot: 'guardian' });
    expect(l.relationshipChangedFor).toBeUndefined();
  });

  it('allows only one change per link per school year', async () => {
    await seedLink('tAdv');
    await change(deped(), 'Adviser');
    await expect(change(deped(), 'Mother')).rejects.toMatchObject({
      code: 'failed-precondition', message: 'You already changed your relationship for SY 2026-2027. Ask the registrar if it needs fixing again.',
    });
    expect(await link('tAdv_S1')).toMatchObject({ relationship: 'Adviser', slot: 'adviser' });
  });

  it('gives a link re-activated with next year\'s slip one more change', async () => {
    // activateCode merges into the old link, so last year's fields stay.
    await seedLink('tAdv', { relationship: 'Adviser', slot: 'adviser', previousRelationship: 'Mother', relationshipChangedFor: '2025-2026' });
    await expect(change(deped(), 'Mother')).resolves.toEqual({ relationship: 'Mother', slot: 'guardian' });
    expect(await link('tAdv_S1')).toMatchObject({ previousRelationship: 'Adviser', relationshipChangedFor: SY });
  });

  it('leaves counts held by revoked links alone, moving one count only', async () => {
    const code = await issueSlip();
    await redeem(gmail('gX'), code, 'Father');
    await redeem(deped(), code, 'Mother');
    expect(await slip(code)).toMatchObject({ guardianRedemptions: 2, adviserRedemptions: 0, status: 'issued' });
    // What revokeLink does to the link; it never lowers the slip's counters.
    await db().doc('guardian_links/gX_S1').update({ status: 'revoked' });

    await change(deped(), 'Adviser');
    expect(await slip(code)).toMatchObject({ guardianRedemptions: 1, adviserRedemptions: 1 });

    const generic = { code: 'failed-precondition', message: 'That code could not be used. Ask the registrar to reissue your slip.' };
    await redeem(gmail('gA'), code, 'Mother');
    await expect(redeem(gmail('gB'), code, 'Father')).rejects.toMatchObject(generic);
    expect(await slip(code)).toMatchObject({ guardianRedemptions: 2, adviserRedemptions: 1 });
  });

  it('leaves a revoked slip alone', async () => {
    const code = await issueSlip();
    await redeem(deped(), code, 'Mother');
    await db().doc(`activation_codes/${hashCode(code)}`).update({ status: 'revoked' });
    const before = await slip(code);
    await change(deped(), 'Adviser');
    expect(await slip(code)).toEqual(before);
  });

  it('leaves a slip from another school year alone', async () => {
    await seedLink('tAdv');
    const old = { studentId: 'S1', schoolYear: '2025-2026', status: 'issued', guardianRedemptions: 1, maxGuardians: 2, adviserRedemptions: 0, maxAdvisers: 1 };
    await db().doc('activation_codes/oldslip').set(old);
    await change(deped(), 'Adviser');
    expect((await db().doc('activation_codes/oldslip').get()).data()).toEqual(old);
  });

  it('changes a legacy link that has no slot to Adviser', async () => {
    await db().doc('guardian_links/tAdv_S1').set({ guardianUid: 'tAdv', studentId: 'S1', status: 'active', schoolYear: SY, relationship: 'Mother' });
    await expect(change(deped(), 'Adviser')).resolves.toEqual({ relationship: 'Adviser', slot: 'adviser' });
    expect(await link('tAdv_S1')).toMatchObject({ relationship: 'Adviser', slot: 'adviser', previousRelationship: 'Mother' });
  });

  it('clears the change note when staff fix the teacher and the teacher links again', async () => {
    const code = await issueSlip();
    await redeem(deped(), code, 'Mother');
    await change(deped(), 'Adviser');
    // Staff revoke the link and reissue the slip (reissue rebuilds the counters from active links).
    await db().doc('guardian_links/tAdv_S1').update({ status: 'revoked' });
    const { slip: { code: fresh } } = await reissueActivationCode(staff(), { studentId: 'S1', schoolYear: SY, reason: 'fix' });
    await redeem(deped(), fresh, 'Mother');

    const l = await link('tAdv_S1');
    expect(l).toMatchObject({ status: 'active', relationship: 'Mother', slot: 'guardian', relationshipChangedFor: SY });
    expect(l.previousRelationship).toBeUndefined();
    expect(l.relationshipChangedAt).toBeUndefined();
    await expect(change(deped(), 'Adviser')).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('You already changed') });

    await expect(redeem(deped('tReal'), fresh, 'Adviser')).resolves.toBeTruthy();
    expect(await slip(fresh)).toMatchObject({ guardianRedemptions: 1, adviserRedemptions: 1 });
  });

  it('refuses when the learner already has an adviser', async () => {
    await seedLink('tAdv');
    await seedLink('tReal', { relationship: 'Adviser', slot: 'adviser' });
    await expect(change(deped(), 'Adviser')).rejects.toMatchObject({
      code: 'failed-precondition', message: 'This learner already has an adviser linked. Ask the registrar to remove that link first.',
    });
    expect(await link('tAdv_S1')).toMatchObject({ relationship: 'Mother', slot: 'guardian' });
  });

  it('refuses Adviser → guardian when both guardian slots are taken', async () => {
    await seedLink('tAdv', { relationship: 'Adviser', slot: 'adviser' });
    await seedLink('gA');
    await seedLink('gB', { relationship: 'Father' });
    await expect(change(deped(), 'Mother')).rejects.toMatchObject({
      code: 'failed-precondition', message: 'This learner already has 2 linked guardians. Ask the registrar to remove one first.',
    });
    expect(await link('tAdv_S1')).toMatchObject({ relationship: 'Adviser', slot: 'adviser' });
  });

  it('ignores revoked, expired and other-year links when counting', async () => {
    await seedLink('tAdv', { relationship: 'Adviser', slot: 'adviser' });
    await seedLink('gA');
    await seedLink('gOld', { status: 'revoked' });
    await seedLink('gExp', { status: 'expired' });
    await seedLink('gPrev', { schoolYear: '2025-2026' });
    await expect(change(deped(), 'Mother')).resolves.toEqual({ relationship: 'Mother', slot: 'guardian' });
  });

  it('refuses a missing, revoked or expired link, or one whose school year has ended', async () => {
    const ended = { code: 'failed-precondition', message: 'This link is no longer active.' };
    await expect(change(deped(), 'Adviser')).rejects.toMatchObject(ended);
    await seedLink('tAdv', { status: 'revoked' });
    await expect(change(deped(), 'Adviser')).rejects.toMatchObject(ended);
    await seedLink('tAdv', { status: 'expired' });
    await expect(change(deped(), 'Adviser')).rejects.toMatchObject(ended);
    await seedLink('tAdv');
    await db().doc(`school_years/${SY}`).set({ endedAt: NOW });
    await expect(change(deped(), 'Adviser')).rejects.toMatchObject(ended);
    expect(await link('tAdv_S1')).toMatchObject({ relationship: 'Mother', slot: 'guardian' });
  });

  it('rate-limits repeated calls', async () => {
    for (let i = 0; i < LIMITS.relationshipChange.max; i++) await change(deped(), 'Adviser').catch(() => {});
    await expect(change(deped(), 'Adviser')).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});
