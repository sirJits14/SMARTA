import { describe, expect, it } from 'vitest';
import { sortIssuedSlips } from './slipOrder.js';

describe('activation slip order', () => {
  it('sorts male students first, then female, by last and first name without dropping unknown sex', () => {
    const entry = (id, sex, lastName, firstName) => ({ slip: { studentId: id }, student: { sex, lastName, firstName } });
    const entries = [entry('f2', 'F', 'Abad', 'Zoe'), entry('m2', 'M', 'Cruz', 'Zed'),
      entry('unknown', '', 'Abad', 'Amy'), entry('f1', 'F', 'Abad', 'Bea'), entry('m1', 'M', 'Cruz', 'Aaron')];
    expect(sortIssuedSlips(entries).map((slip) => slip.studentId)).toEqual(['m1', 'm2', 'f1', 'f2', 'unknown']);
  });
});
