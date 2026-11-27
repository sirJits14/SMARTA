import { describe, it, expect } from 'vitest';
import { isDepedEmail, isOpenStatus, slotFor, readSlots, claimSlot, moveSlot, newCodeSlots, slotsFromLinks, ADVISER } from './codeSlots.js';

describe('isDepedEmail', () => {
  it('accepts @deped.gov.ph in any case, rejects others', () => {
    expect(isDepedEmail('juan.cruz@deped.gov.ph')).toBe(true);
    expect(isDepedEmail('Juan.Cruz@DepEd.Gov.PH')).toBe(true);
    expect(isDepedEmail('juan@gmail.com')).toBe(false);
    expect(isDepedEmail('juan@deped.gov.ph.evil.com')).toBe(false);
    expect(isDepedEmail('juan@notdeped.gov.ph')).toBe(false);
    expect(isDepedEmail(undefined)).toBe(false);
  });
});

describe('isOpenStatus', () => {
  it('is true for issued and exhausted (a slot may still be free), false otherwise', () => {
    expect(isOpenStatus('issued')).toBe(true);
    expect(isOpenStatus('exhausted')).toBe(true);
    expect(isOpenStatus('revoked')).toBe(false);
    expect(isOpenStatus(undefined)).toBe(false);
  });
});

describe('slotFor', () => {
  it('maps Adviser to the adviser slot and everything else to guardian', () => {
    expect(slotFor(ADVISER)).toBe('adviser');
    expect(slotFor('Mother')).toBe('guardian');
    expect(slotFor('Other')).toBe('guardian');
  });
});

describe('readSlots', () => {
  it('reads new-format counters', () => {
    expect(readSlots({ guardianRedemptions: 1, maxGuardians: 2, adviserRedemptions: 1, maxAdvisers: 1 }))
      .toEqual({ guardian: { used: 1, max: 2 }, adviser: { used: 1, max: 1 } });
  });
  it('reads a legacy code as guardian uses with a free adviser slot', () => {
    expect(readSlots({ redemptions: 2, maxRedemptions: 2 }))
      .toEqual({ guardian: { used: 2, max: 2 }, adviser: { used: 0, max: 1 } });
    expect(readSlots({})).toEqual({ guardian: { used: 0, max: 2 }, adviser: { used: 0, max: 1 } });
  });
});

describe('claimSlot', () => {
  it('increments the requested slot and stays issued while any slot is open', () => {
    expect(claimSlot(newCodeSlots(), 'guardian')).toEqual({ guardianRedemptions: 1, maxGuardians: 2, adviserRedemptions: 0, maxAdvisers: 1, status: 'issued' });
    expect(claimSlot(newCodeSlots(), 'adviser')).toEqual({ guardianRedemptions: 0, maxGuardians: 2, adviserRedemptions: 1, maxAdvisers: 1, status: 'issued' });
  });
  it('returns null when the requested slot is full, even if the other is open', () => {
    expect(claimSlot({ ...newCodeSlots(), guardianRedemptions: 2 }, 'guardian')).toBeNull();
    expect(claimSlot({ ...newCodeSlots(), adviserRedemptions: 1 }, 'adviser')).toBeNull();
  });
  it('marks exhausted only when both slots are full', () => {
    expect(claimSlot({ ...newCodeSlots(), guardianRedemptions: 2 }, 'adviser').status).toBe('exhausted');
    expect(claimSlot({ ...newCodeSlots(), guardianRedemptions: 1, adviserRedemptions: 1 }, 'guardian').status).toBe('exhausted');
  });
  it('lets a legacy exhausted code take an adviser', () => {
    expect(claimSlot({ redemptions: 2, maxRedemptions: 2, status: 'exhausted' }, 'adviser'))
      .toEqual({ guardianRedemptions: 2, maxGuardians: 2, adviserRedemptions: 1, maxAdvisers: 1, status: 'exhausted' });
  });
});

describe('moveSlot', () => {
  const inUse = (g, a) => ({ guardianRedemptions: g, adviserRedemptions: a });
  const fields = (g, a, status = 'issued') => ({ guardianRedemptions: g, maxGuardians: 2, adviserRedemptions: a, maxAdvisers: 1, status });
  it('moves one count from the side left to the side joined', () => {
    expect(moveSlot({ ...newCodeSlots(), guardianRedemptions: 1 }, 'guardian', 'adviser', inUse(0, 1))).toEqual(fields(0, 1));
  });
  it('never lowers the side left below what active links still use', () => {
    // The slip counted 1 guardian, but two active guardian links remain (e.g. approved by staff).
    expect(moveSlot({ ...newCodeSlots(), guardianRedemptions: 1 }, 'guardian', 'adviser', inUse(2, 1)).guardianRedemptions).toBe(2);
    // A revoked guardian is still counted: 2 used, 1 active, one leaves -> 1 active floor, 1 stays counted.
    expect(moveSlot({ ...newCodeSlots(), guardianRedemptions: 2 }, 'guardian', 'adviser', inUse(1, 1)).guardianRedemptions).toBe(1);
    expect(moveSlot({ ...newCodeSlots(), guardianRedemptions: 2, adviserRedemptions: 0 }, 'guardian', 'adviser', inUse(0, 1))).toEqual(fields(1, 1));
  });
  it('keeps the side joined at its max', () => {
    expect(moveSlot({ ...newCodeSlots(), guardianRedemptions: 1, adviserRedemptions: 1 }, 'guardian', 'adviser', inUse(0, 1))).toEqual(fields(0, 1));
    expect(moveSlot({ ...newCodeSlots(), guardianRedemptions: 2, adviserRedemptions: 1 }, 'adviser', 'guardian', inUse(2, 0))).toEqual(fields(2, 0, 'issued'));
  });
  it('reads a legacy code (redemptions, no guardianRedemptions)', () => {
    expect(moveSlot({ redemptions: 2, maxRedemptions: 2, status: 'exhausted' }, 'guardian', 'adviser', inUse(1, 1))).toEqual(fields(1, 1));
  });
  it('is exhausted only when both sides are full', () => {
    expect(moveSlot({ ...newCodeSlots(), guardianRedemptions: 2, adviserRedemptions: 0 }, 'guardian', 'adviser', inUse(2, 1)).status).toBe('exhausted');
    expect(moveSlot({ ...newCodeSlots(), guardianRedemptions: 2, adviserRedemptions: 1 }, 'adviser', 'guardian', inUse(1, 0)).status).toBe('issued');
  });
});

describe('slotsFromLinks', () => {
  const SY = '2026-2027';
  const link = (over = {}) => ({ status: 'active', schoolYear: SY, slot: 'guardian', ...over });
  const slots = (g, a, status = 'issued') => ({ guardianRedemptions: g, maxGuardians: 2, adviserRedemptions: a, maxAdvisers: 1, status });

  it('gives a learner with no links every slot', () => {
    expect(slotsFromLinks([], SY)).toEqual(slots(0, 0));
  });
  it('counts active guardian and adviser links for the school year', () => {
    expect(slotsFromLinks([link()], SY)).toEqual(slots(1, 0));
    expect(slotsFromLinks([link({ slot: 'adviser' })], SY)).toEqual(slots(0, 1));
    expect(slotsFromLinks([link(), link()], SY)).toEqual(slots(2, 0));
    expect(slotsFromLinks([link(), link(), link({ slot: 'adviser' })], SY)).toEqual(slots(2, 1, 'exhausted'));
  });
  it('ignores revoked, expired and other-school-year links', () => {
    expect(slotsFromLinks([link({ status: 'revoked' }), link({ status: 'expired' }), link({ schoolYear: '2025-2026' })], SY)).toEqual(slots(0, 0));
  });
  it('counts a link with no slot as a guardian', () => {
    expect(slotsFromLinks([{ status: 'active', schoolYear: SY }], SY)).toEqual(slots(1, 0));
  });
  it('caps used counts at the max', () => {
    expect(slotsFromLinks([link(), link(), link()], SY)).toEqual(slots(2, 0));
  });
  it('makes claimSlot refuse a guardian once linked guardians fill the slots', () => {
    expect(claimSlot(slotsFromLinks([link(), link()], SY), 'guardian')).toBeNull();
    expect(claimSlot(slotsFromLinks([link()], SY), 'guardian')).toMatchObject({ guardianRedemptions: 2 });
  });
});
