import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { correctLinkRelationship } from '../../src/handlers/links.js';
import { issueActivationCodes, activateCode } from '../../src/handlers/codes.js';
import { hashCode } from '../../src/lib/activationCode.js';

const NOW = new Date('2026-09-21T08:00:00+08:00');
const SY = '2026-2027';
const admin = () => ({ db: db(), now: () => NOW, uid: 'admin1', email: 'admin@deped.gov.ph' });
const correct = (data) => correctLinkRelationship(admin(), { linkId: 'gA_S1', relationship: 'Guardian', reason: 'Parent asked at the office', ...data });
const link = async (id) => (await db().doc(`guardian_links/${id}`).get()).data();
const audits = async () => (await db().collection('audit_log').where('action', '==', 'link.relationshipCorrected').get()).docs.map((d) => d.data());

beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('users/admin@deped.gov.ph').set({ role: 'admin' });
});

describe('correctLinkRelationship', () => {
  it('corrects a family link in place and records who, why and what it was', async () => {
    await expect(correct({ relationship: 'Grandparent' })).resolves.toEqual({ relationship: 'Grandparent' });
    const l = await link('gA_S1');
    expect(l).toMatchObject({
      status: 'active', relationship: 'Grandparent', previousRelationship: 'Mother', relationshipChangedFor: SY,
      relationshipChangedBy: 'admin@deped.gov.ph', relationshipChangeReason: 'Parent asked at the office',
    });
    expect(l.relationshipChangedAt).toBeTruthy();
    expect(l.slot).toBeUndefined();
    expect(await audits()).toEqual([expect.objectContaining({
      actorType: 'staff', actorUid: 'admin@deped.gov.ph', targetType: 'guardian_link', targetId: 'gA_S1',
      details: { from: 'Mother', to: 'Grandparent', studentId: 'S1', schoolYear: SY, reason: 'Parent asked at the office' },
    })]);
    expect((await db().doc('guardian_links/gB_S1').get()).data().relationship).toBe('Father');
  });

  it('can correct the same link again', async () => {
    await correct({ relationship: 'Grandparent' });
    await correct({ relationship: 'Guardian', reason: 'Wrong one picked' });
    expect(await link('gA_S1')).toMatchObject({ relationship: 'Guardian', previousRelationship: 'Grandparent', relationshipChangeReason: 'Wrong one picked' });
    expect(await audits()).toHaveLength(2);
  });

  it('leaves slip counts alone, since every family relationship holds a guardian slot', async () => {
    await db().doc('guardian_links/gA_S1').delete();
    await db().doc('guardian_links/gB_S1').delete();
    const code = (await issueActivationCodes({ ...admin() }, { sectionId: 'SEC1', schoolYear: SY })).slips.find((s) => s.studentId === 'S1').code;
    await activateCode({ db: db(), now: () => NOW, uid: 'gM', email: 'gM@gmail.com', displayName: 'M' }, { code, relationship: 'Guardian', consentVersion: 1, guardianName: 'M' });
    const before = (await db().doc(`activation_codes/${hashCode(code)}`).get()).data();
    await correctLinkRelationship(admin(), { linkId: 'gM_S1', relationship: 'Mother', reason: 'Is the mother' });
    expect(await link('gM_S1')).toMatchObject({ relationship: 'Mother', slot: 'guardian' });
    const after = (await db().doc(`activation_codes/${hashCode(code)}`).get()).data();
    expect(after).toMatchObject({ guardianRedemptions: before.guardianRedemptions, adviserRedemptions: before.adviserRedemptions, status: before.status });
  });

  it('refuses Adviser and unknown relationships', async () => {
    await expect(correct({ relationship: 'Adviser' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(correct({ relationship: 'Teacher' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(correct({ relationship: 'Mother' })).rejects.toMatchObject({ code: 'invalid-argument', message: 'This link is already Mother.' });
    expect((await link('gA_S1')).previousRelationship).toBeUndefined();
    expect(await audits()).toEqual([]);
  });

  it('requires a reason of 1 to 500 characters', async () => {
    await expect(correct({ reason: '' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(correct({ reason: undefined })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(correct({ reason: 'x'.repeat(501) })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(correct({ reason: 'x'.repeat(500) })).resolves.toEqual({ relationship: 'Guardian' });
  });

  it('refuses missing and ended links', async () => {
    await expect(correct({ linkId: 'nobody_S1' })).rejects.toMatchObject({ code: 'not-found' });
    await expect(correct({ linkId: 'gC_S1' })).rejects.toMatchObject({ code: 'failed-precondition', message: 'This link is no longer active.' });
    await db().doc('guardian_links/gX_S1').set({ guardianUid: 'gX', studentId: 'S1', status: 'expired', schoolYear: SY, relationship: 'Mother', slot: 'guardian' });
    await expect(correct({ linkId: 'gX_S1' })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(await audits()).toEqual([]);
  });

  it('refuses adviser links, which are school roles', async () => {
    await db().doc('guardian_links/tAdv_S1').set({ guardianUid: 'tAdv', studentId: 'S1', status: 'active', schoolYear: SY, relationship: 'Adviser', slot: 'adviser' });
    await db().doc('guardian_links/tOld_S1').set({ guardianUid: 'tOld', studentId: 'S1', status: 'active', schoolYear: SY, relationship: 'Adviser' });
    for (const linkId of ['tAdv_S1', 'tOld_S1']) {
      await expect(correct({ linkId })).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringContaining('School access') });
      expect(await link(linkId)).toMatchObject({ relationship: 'Adviser' });
    }
    expect(await audits()).toEqual([]);
  });

  it('a slip re-activating an ended link clears the correction note', async () => {
    await correct({ relationship: 'Grandparent' });
    await db().doc('guardian_links/gA_S1').update({ status: 'revoked' });
    await db().doc('guardian_links/gB_S1').delete();
    const code = (await issueActivationCodes({ ...admin() }, { sectionId: 'SEC1', schoolYear: SY })).slips.find((s) => s.studentId === 'S1').code;
    await activateCode({ db: db(), now: () => NOW, uid: 'gA', email: 'a@x', displayName: 'A' }, { code, relationship: 'Mother', consentVersion: 1, guardianName: 'A' });
    const l = await link('gA_S1');
    expect(l).toMatchObject({ status: 'active', relationship: 'Mother' });
    for (const f of ['previousRelationship', 'relationshipChangedAt', 'relationshipChangedBy', 'relationshipChangeReason']) expect(l[f]).toBeUndefined();
  });
});
