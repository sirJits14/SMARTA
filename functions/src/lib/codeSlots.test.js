import { describe, it, expect } from 'vitest';
import { isDepedEmail, slotFor, readSlots, claimSlot, newCodeSlots, ADVISER } from './codeSlots.js';

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
