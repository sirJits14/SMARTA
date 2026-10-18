import { describe, expect, it } from 'vitest';
import { legacyAdviserRows, assignmentFromLegacy } from './schoolAssignments.js';

const adviser = { guardianUid: 't1', email: 't1@deped.gov.ph', name: 'Ana Cruz', learnerCount: 38, suggestedSectionId: 'MABINI' };

describe('legacy adviser rows', () => {
  it('marks teachers who already hold an adviser assignment', () => {
    expect(legacyAdviserRows([adviser, { ...adviser, guardianUid: 't2' }], [{ uid: 't1', role: 'adviser' }, { uid: 't2', role: 'subject_teacher' }]))
      .toEqual([{ ...adviser, assigned: true }, { ...adviser, guardianUid: 't2', assigned: false }]);
  });
  it('tolerates a missing list', () => {
    expect(legacyAdviserRows(undefined, undefined)).toEqual([]);
  });
  it('prefills the assignment form with the suggested section', () => {
    expect(assignmentFromLegacy(adviser)).toEqual({ email: 't1@deped.gov.ph', role: 'adviser', sectionId: 'MABINI', gradeLevel: '' });
    expect(assignmentFromLegacy({ ...adviser, suggestedSectionId: null }).sectionId).toBe('');
  });
});
