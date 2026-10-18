import { describe, expect, it } from 'vitest';
import { groupLegacyAdvisers, sampleStudentIds } from './legacyAdvisers.js';

const link = (guardianUid, studentId, extra = {}) => ({ guardianUid, studentId, guardianEmail: `${guardianUid}@x.ph`, guardianName: guardianUid.toUpperCase(), ...extra });

describe('legacy adviser grouping', () => {
  it('groups links per teacher and suggests the most common section', () => {
    const links = [link('t1', 'a'), link('t1', 'b'), link('t1', 'c'), link('t2', 'd')];
    expect(groupLegacyAdvisers(links, { a: 'MABINI', b: 'MABINI', c: 'RIZAL', d: 'LUNA' })).toEqual([
      { guardianUid: 't1', email: 't1@x.ph', name: 'T1', learnerCount: 3, suggestedSectionId: 'MABINI' },
      { guardianUid: 't2', email: 't2@x.ph', name: 'T2', learnerCount: 1, suggestedSectionId: 'LUNA' },
    ]);
  });
  it('samples at most five learners per teacher and tolerates unknown sections', () => {
    const links = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => link('t1', id));
    expect(sampleStudentIds(links)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(groupLegacyAdvisers(links, {})[0]).toMatchObject({ learnerCount: 7, suggestedSectionId: null });
  });
  it('skips links without an account', () => {
    expect(groupLegacyAdvisers([{ studentId: 'a' }], {})).toEqual([]);
  });
});
