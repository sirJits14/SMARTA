import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { changeLinkRelationship, correctLinkRelationship, OLD_ADVISER_LINK } from '../../src/handlers/links.js';
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
  it('fixes a family relationship on the caller\'s own link without touching slip counts', async () => {
    const code = await issueSlip();
    await redeem(deped('tMom'), code, 'Guardian');
    const before = await slip(code);

    await expect(change(deped('tMom'), 'Mother')).resolves.toEqual({ relationship: 'Mother', slot: 'guardian' });
    const changed = await link('tMom_S1');
    expect(changed).toMatchObject({ status: 'active', relationship: 'Mother', slot: 'guardian', previousRelationship: 'Guardian', relationshipChangedFor: SY });
    expect(changed.relationshipChangedAt).toBeTruthy();
    expect(changed.relationshipChangedBy).toBeUndefined();
    expect(await slip(code)).toEqual(before);
    expect(await audits()).toEqual([expect.objectContaining({
      actorType: 'guardian', actorUid: 'tMom', targetType: 'student', targetId: 'S1',
      details: { from: 'Guardian', to: 'Mother', fromSlot: 'guardian', toSlot: 'guardian', schoolYear: SY },
    })]);
  });

  it('fixes a family link made before slots existed', async () => {
    await db().doc('guardian_links/tMom_S1').set({ guardianUid: 'tMom', studentId: 'S1', status: 'active', schoolYear: SY, relationship: 'Guardian' });
    await expect(change(deped('tMom'), 'Father')).resolves.toEqual({ relationship: 'Father', slot: 'guardian' });
    const l = await link('tMom_S1');
    expect(l).toMatchObject({ relationship: 'Father', previousRelationship: 'Guardian' });
    expect(l.slot).toBeUndefined();
  });

  it('refuses an old adviser link, which would otherwise become family access without approval', async () => {
    const code = await issueSlip();
    await redeem(deped('tAdv'), code, 'Adviser');
    const before = await slip(code);
    await db().doc('guardian_links/tOld_S1').set({ guardianUid: 'tOld', studentId: 'S1', status: 'active', schoolYear: SY, relationship: 'Adviser' });
    for (const uid of ['tAdv', 'tOld']) {
      await expect(change(deped(uid), 'Mother')).rejects.toMatchObject({ code: 'failed-precondition', message: OLD_ADVISER_LINK });
      const l = await link(`${uid}_S1`);
      expect(l.relationship).toBe('Adviser');
      expect(l.relationshipChangedFor).toBeUndefined();
    }
    expect(OLD_ADVISER_LINK).toBe('This is an old adviser link, which no longer gives access. An administrator assigns class advisers in SIMS. If you are this learner\'s parent or guardian, link with a family slip.');
    expect(await slip(code)).toEqual(before);
    expect(await audits()).toEqual([]);
  });

  it('administrators cannot convert an old adviser link either', async () => {
    await seedLink('tAdv', { relationship: 'Adviser', slot: 'adviser' });
    await expect(correctLinkRelationship({ db: db(), email: 'admin@deped.gov.ph' }, { linkId: 'tAdv_S1', relationship: 'Mother', reason: 'Is the mother' }))
      .rejects.toMatchObject({ code: 'failed-precondition' });
    expect(await link('tAdv_S1')).toMatchObject({ relationship: 'Adviser', slot: 'adviser' });
  });

  it('moves a family link to Adviser, ending family access, and frees the slip\'s guardian slot', async () => {
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

    // And the account cannot go back to family: that needs a family slip.
    await expect(change(deped(), 'Mother')).rejects.toMatchObject({ code: 'failed-precondition', message: OLD_ADVISER_LINK });
  });

  it('moves a family link made before slots existed to Adviser', async () => {
    await db().doc('guardian_links/tAdv_S1').set({ guardianUid: 'tAdv', studentId: 'S1', status: 'active', schoolYear: SY, relationship: 'Mother' });
    await expect(change(deped(), 'Adviser')).resolves.toEqual({ relationship: 'Adviser', slot: 'adviser' });
    expect(await link('tAdv_S1')).toMatchObject({ relationship: 'Adviser', slot: 'adviser', previousRelationship: 'Mother' });
  });

  it('refuses Adviser when the learner already has an adviser link', async () => {
    await seedLink('tAdv');
    await seedLink('tReal', { relationship: 'Adviser', slot: 'adviser' });
    await expect(change(deped(), 'Adviser')).rejects.toMatchObject({
      code: 'failed-precondition', message: 'This learner already has an adviser linked. Ask the school to remove that link first.',
    });
    const l = await link('tAdv_S1');
    expect(l).toMatchObject({ relationship: 'Mother', slot: 'guardian' });
    expect(l.relationshipChangedFor).toBeUndefined();
    // A revoked or other-year adviser link does not count.
    await seedLink('tReal', { relationship: 'Adviser', slot: 'adviser', status: 'revoked' });
    await seedLink('tPrev', { relationship: 'Adviser', slot: 'adviser', schoolYear: '2025-2026' });
    await expect(change(deped(), 'Adviser')).resolves.toEqual({ relationship: 'Adviser', slot: 'adviser' });
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
  });

  it('leaves a revoked slip, and a slip from another school year, alone', async () => {
    const code = await issueSlip();
    await redeem(deped(), code, 'Mother');
    await db().doc(`activation_codes/${hashCode(code)}`).update({ status: 'revoked' });
    const before = await slip(code);
    const old = { studentId: 'S1', schoolYear: '2025-2026', status: 'issued', guardianRedemptions: 1, maxGuardians: 2, adviserRedemptions: 0, maxAdvisers: 1 };
    await db().doc('activation_codes/oldslip').set(old);
    await change(deped(), 'Adviser');
    expect(await slip(code)).toEqual(before);
    expect((await db().doc('activation_codes/oldslip').get()).data()).toEqual(old);
  });

  it('refuses accounts that are not DepEd before reading or writing anything', async () => {
    await seedLink('gX');
    await expect(change(gmail('gX'), 'Father')).rejects.toMatchObject({ code: 'permission-denied', message: 'Only DepEd (@deped.gov.ph) accounts can change their own relationship. Ask the school to correct it.' });
    await expect(change(account('gX', 'gX@deped.gov.ph.example.com'), 'Father')).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await link('gX_S1')).toMatchObject({ relationship: 'Mother', slot: 'guardian' });
    expect((await db().doc('rate_limits/gX').get()).exists).toBe(false);
  });

  it('refuses an unchanged or unknown relationship', async () => {
    await seedLink('tAdv');
    await expect(change(deped(), 'Mother')).rejects.toMatchObject({ code: 'invalid-argument', message: 'You are already linked as Mother.' });
    await expect(change(deped(), 'Teacher')).rejects.toMatchObject({ code: 'invalid-argument' });
    const l = await link('tAdv_S1');
    expect(l).toMatchObject({ relationship: 'Mother', slot: 'guardian' });
    expect(l.relationshipChangedFor).toBeUndefined();
  });

  it('allows only one change per link per school year, counting a school correction', async () => {
    await seedLink('tAdv', { relationship: 'Guardian' });
    await change(deped(), 'Mother');
    const already = { code: 'failed-precondition', message: 'Your relationship was already changed for SY 2026-2027. Ask the school if it needs fixing again.' };
    await expect(change(deped(), 'Father')).rejects.toMatchObject(already);
    await expect(change(deped(), 'Adviser')).rejects.toMatchObject(already);
    expect(await link('tAdv_S1')).toMatchObject({ relationship: 'Mother', slot: 'guardian' });

    await seedLink('tOther', { relationship: 'Guardian' });
    await correctLinkRelationship({ db: db(), email: 'admin@deped.gov.ph' }, { linkId: 'tOther_S1', relationship: 'Father', reason: 'Checked at the office' });
    await expect(change(deped('tOther'), 'Mother')).rejects.toMatchObject(already);
  });

  it('gives a link re-activated with next year\'s slip one more change', async () => {
    // activateCode merges into the old link, so last year's fields stay.
    await seedLink('tAdv', { relationship: 'Guardian', previousRelationship: 'Mother', relationshipChangedFor: '2025-2026' });
    await expect(change(deped(), 'Mother')).resolves.toEqual({ relationship: 'Mother', slot: 'guardian' });
    expect(await link('tAdv_S1')).toMatchObject({ previousRelationship: 'Guardian', relationshipChangedFor: SY });
  });

  it('clears the change note when staff revoke the link and the account links again', async () => {
    const code = await issueSlip();
    await redeem(deped(), code, 'Guardian');
    await change(deped(), 'Mother');
    // Staff revoke the link and reissue the slip (reissue rebuilds the counters from active links).
    await db().doc('guardian_links/tAdv_S1').update({ status: 'revoked' });
    const { slip: { code: fresh } } = await reissueActivationCode(staff(), { studentId: 'S1', schoolYear: SY, reason: 'fix' });
    await redeem(deped(), fresh, 'Father');

    const l = await link('tAdv_S1');
    expect(l).toMatchObject({ status: 'active', relationship: 'Father', slot: 'guardian', relationshipChangedFor: SY });
    expect(l.previousRelationship).toBeUndefined();
    expect(l.relationshipChangedAt).toBeUndefined();
    await expect(change(deped(), 'Mother')).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('already changed') });
  });

  it('refuses a missing, revoked or expired link, or one whose school year has ended', async () => {
    const ended = { code: 'failed-precondition', message: 'This link is no longer active.' };
    await expect(change(deped(), 'Father')).rejects.toMatchObject(ended);
    await seedLink('tAdv', { status: 'revoked' });
    await expect(change(deped(), 'Father')).rejects.toMatchObject(ended);
    await seedLink('tAdv', { status: 'expired' });
    await expect(change(deped(), 'Father')).rejects.toMatchObject(ended);
    await seedLink('tAdv');
    await db().doc(`school_years/${SY}`).set({ endedAt: NOW });
    await expect(change(deped(), 'Father')).rejects.toMatchObject(ended);
    expect(await link('tAdv_S1')).toMatchObject({ relationship: 'Mother', slot: 'guardian' });
  });

  it('rate-limits repeated calls', async () => {
    for (let i = 0; i < LIMITS.relationshipChange.max; i++) await change(deped(), 'Father').catch(() => {});
    await expect(change(deped(), 'Father')).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});
