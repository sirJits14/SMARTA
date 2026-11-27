import { describe, expect, it } from 'vitest';
import { PASS_ALPHABET, isTempPassCode, makePassCode, passGrades, canManagePasses, isOfficialCardPrinted, tempPassBlocker } from './tempPass.js';

describe('pass codes', () => {
  it('is prefix plus ten unambiguous characters', () => {
    const code = makePassCode(() => 0);
    expect(code).toBe('BNHS-TP-2222222222');
    expect(isTempPassCode(code)).toBe(true);
    expect(PASS_ALPHABET).not.toMatch(/[01OIL]/);
  });
  it('uses the random source across the alphabet', () => {
    let i = 0;
    expect(makePassCode(max => i++ % max)).toBe(`BNHS-TP-${PASS_ALPHABET.slice(0, 10)}`);
  });
  it('rejects LRNs and malformed codes', () => {
    for (const bad of ['100000000001', 'BNHS-TP-222', 'BNHS-TP-OOOOOOOOOO', 'bnhs-tp-2222222222', '', null]) expect(isTempPassCode(bad)).toBe(false);
  });
});

describe('pass staff', () => {
  it('covers administrators and JHS/SHS coordinators only', () => {
    expect(passGrades({ role: 'admin' })).toBeNull();
    expect(passGrades({ role: 'registrar' })).toBeNull();
    expect(passGrades({ role: 'jhs_coord' })).toEqual([7, 8, 9, 10]);
    expect(passGrades({ role: 'shs_coord' })).toEqual([11, 12]);
    expect(passGrades({ role: 'glc', gradeLevel: 8 })).toEqual([]);
    expect(passGrades(null)).toEqual([]);
    expect(canManagePasses({ role: 'glc', gradeLevel: 8 })).toBe(false);
    expect(canManagePasses({ role: 'shs_coord' })).toBe(true);
  });
});

describe('eligibility', () => {
  const base = () => ({
    schoolYear: '2026-2027',
    student: { lrn: '100000000001', status: 'active', photo: { path: 'p' } },
    enrollment: { status: 'enrolled', schoolYear: '2026-2027', sectionId: 'SEC1' },
    section: { gradeLevel: 7, schoolYear: '2026-2027' },
  });
  const blocker = over => tempPassBlocker({ ...base(), ...over });
  it('allows an enrolled learner with a photo and no printed card', () => { expect(blocker({})).toBeNull(); });
  it('names what blocks a pass', () => {
    expect(blocker({ student: undefined })).toBe('not-found');
    expect(blocker({ enrollment: undefined })).toBe('not-enrolled');
    expect(blocker({ enrollment: { ...base().enrollment, status: 'dropped' } })).toBe('not-enrolled');
    expect(blocker({ section: { gradeLevel: 7, schoolYear: '2025-2026' } })).toBe('not-enrolled');
    expect(blocker({ student: { ...base().student, status: 'transferred' } })).toBe('inactive');
    expect(blocker({ student: { ...base().student, lrn: ' ' } })).toBe('no-lrn');
    expect(blocker({ student: { ...base().student, idCard: { printedAt: 1, lrn: '100000000001' } } })).toBe('official-printed');
    expect(blocker({ student: { ...base().student, photo: undefined } })).toBe('no-photo');
  });
  it('treats a card printed for an old LRN as not printed', () => {
    expect(isOfficialCardPrinted({ lrn: '2', idCard: { printedAt: 1, lrn: '1' } })).toBe(false);
  });
});
