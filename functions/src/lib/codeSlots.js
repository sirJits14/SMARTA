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

// Slots for a new code, counting the learner's links already active for
// this school year, so reissuing a slip never raises the 2-guardian limit
// (spec 2026-10-13 §1). Links made before the adviser slot existed have no
// `slot` and count as guardians.
export function slotsFromLinks(links, schoolYear) {
  const used = { guardian: 0, adviser: 0 };
  for (const l of links) if (l.status === 'active' && l.schoolYear === schoolYear) used[l.slot === 'adviser' ? 'adviser' : 'guardian'] += 1;
  const guardianRedemptions = Math.min(used.guardian, MAX_GUARDIANS);
  const adviserRedemptions = Math.min(used.adviser, MAX_ADVISERS);
  return {
    guardianRedemptions, maxGuardians: MAX_GUARDIANS, adviserRedemptions, maxAdvisers: MAX_ADVISERS,
    status: guardianRedemptions >= MAX_GUARDIANS && adviserRedemptions >= MAX_ADVISERS ? 'exhausted' : 'issued',
  };
}

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

// The fields to write when one linked person moves from slot `from` to slot
// `to` (spec 2026-10-17): one count leaves `from` and one joins `to`, never
// below what the learner's active links already use (`inUse`, from
// slotsFromLinks after the move) and never above the max. Revoked links keep
// their counts, as everywhere else.
export function moveSlot(cd, from, to, inUse) {
  const s = readSlots(cd);
  const active = { guardian: inUse.guardianRedemptions, adviser: inUse.adviserRedemptions };
  const next = {
    ...s,
    [from]: { ...s[from], used: Math.max(active[from], s[from].used - 1) },
    [to]: { ...s[to], used: Math.min(s[to].max, Math.max(active[to], s[to].used + 1)) },
  };
  return {
    guardianRedemptions: next.guardian.used, maxGuardians: next.guardian.max,
    adviserRedemptions: next.adviser.used, maxAdvisers: next.adviser.max,
    status: full(next.guardian) && full(next.adviser) ? 'exhausted' : 'issued',
  };
}
