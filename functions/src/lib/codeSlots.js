// Slot accounting for activation codes (spec 2026-09-30 §2): two guardian
// slots and one class-adviser slot per slip. Codes issued before the adviser
// slot existed only have redemptions/maxRedemptions; those count as guardian
// uses and get a free adviser slot.
export const MAX_GUARDIANS = 2;
export const MAX_ADVISERS = 1;
export const ADVISER = 'Adviser';
const DEPED_DOMAIN = '@deped.gov.ph';

export const isDepedEmail = (email) => typeof email === 'string' && email.trim().toLowerCase().endsWith(DEPED_DOMAIN);
// A slip that staff have not revoked. 'exhausted' still counts: it may have a
// free slot of the other kind (legacy codes were exhausted by two guardians).
export const isOpenStatus = (status) => status === 'issued' || status === 'exhausted';
export const slotFor = (relationship) => (relationship === ADVISER ? 'adviser' : 'guardian');
export const newCodeSlots = () => ({ guardianRedemptions: 0, maxGuardians: MAX_GUARDIANS, adviserRedemptions: 0, maxAdvisers: MAX_ADVISERS });

export function readSlots(cd) {
  return {
    guardian: { used: cd.guardianRedemptions ?? cd.redemptions ?? 0, max: cd.maxGuardians ?? MAX_GUARDIANS },
    adviser: { used: cd.adviserRedemptions ?? 0, max: cd.maxAdvisers ?? MAX_ADVISERS },
  };
}

const full = (s) => s.used >= s.max;

// The fields to write when one more person takes `slot`, or null if it is full.
export function claimSlot(cd, slot) {
  const s = readSlots(cd);
  if (full(s[slot])) return null;
  const next = { ...s, [slot]: { ...s[slot], used: s[slot].used + 1 } };
  return {
    guardianRedemptions: next.guardian.used, maxGuardians: next.guardian.max,
    adviserRedemptions: next.adviser.used, maxAdvisers: next.adviser.max,
    status: full(next.guardian) && full(next.adviser) ? 'exhausted' : 'issued',
  };
}
