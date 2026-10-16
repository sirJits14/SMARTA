import { describe, it, expect } from 'vitest';
import { MAX_BATCH_ISSUE, ISSUE_TIME_BUDGET_MS, takeBatch, compareSlipEntries } from './slipBatch.js';

const e = (id, addedAtMs) => ({ id, reason: 'Lost slip', addedAtMs });

describe('ISSUE_TIME_BUDGET_MS', () => {
  it('ends a press well inside the 60 s callable timeout', () => {
    expect(ISSUE_TIME_BUDGET_MS).toBe(40_000);
  });
});

describe('takeBatch', () => {
  it('takes the oldest entries first, ties by id', () => {
    const { take, remaining } = takeBatch([e('C', 3), e('B', 1), e('A', 1)]);
    expect(take.map((x) => x.id)).toEqual(['A', 'B', 'C']);
    expect(remaining).toBe(0);
  });
  it('caps a press at MAX_BATCH_ISSUE and reports the rest', () => {
    expect(MAX_BATCH_ISSUE).toBe(64);
    const entries = Array.from({ length: 70 }, (_, i) => e(`S${String(i).padStart(3, '0')}`, i));
    const { take, remaining } = takeBatch(entries);
    expect(take).toHaveLength(64);
    expect(take[63].id).toBe('S063');
    expect(remaining).toBe(6);
  });
  it('handles an empty batch', () => {
    expect(takeBatch([])).toEqual({ take: [], remaining: 0 });
  });
});

describe('compareSlipEntries', () => {
  const sec = (id, gradeLevel, name) => ({ sectionId: id, section: { gradeLevel, name } });
  const st = (lastName, firstName, sex) => ({ lastName, firstName, sex });
  it('sorts by grade, section, males first, then last and first name', () => {
    const rows = [
      { ...sec('B', 8, 'Bonifacio'), student: st('Abad', 'Carla', 'F'), key: 'g8' },
      { ...sec('A', 7, 'Rizal'), student: st('Cruz', 'Ana', 'F'), key: 'g7F' },
      { ...sec('A', 7, 'Rizal'), student: st('Dy', 'Ben', 'M'), key: 'g7M' },
      { ...sec('A', 7, 'Rizal'), student: st('Cruz', 'Abby', 'F'), key: 'g7F2' },
      { ...sec('C', 7, 'Aguinaldo'), student: st('Zamora', 'Zed', 'M'), key: 'g7Agui' },
    ];
    expect(rows.sort(compareSlipEntries).map((r) => r.key)).toEqual(['g7Agui', 'g7M', 'g7F2', 'g7F', 'g8']);
  });
  it('puts learners with no recorded sex after females and tolerates a missing section', () => {
    const rows = [
      { sectionId: 'A', section: { gradeLevel: 7, name: 'Rizal' }, student: st('A', 'A', ''), key: 'none' },
      { sectionId: 'A', section: { gradeLevel: 7, name: 'Rizal' }, student: st('Z', 'Z', 'F'), key: 'F' },
      { sectionId: 'X', section: undefined, student: st('B', 'B', 'M'), key: 'nosection' },
    ];
    expect(rows.sort(compareSlipEntries).map((r) => r.key)).toEqual(['nosection', 'F', 'none']);
  });
});
