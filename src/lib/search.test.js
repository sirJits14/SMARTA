import { describe, expect, it } from 'vitest';
import { buildLearnerIndex, learnerMatches, matchesWords, normalize, searchLearners, sectionMatches, words } from './search.js';

describe('normalize and words', () => {
  it('normalizes nullable and numeric values without throwing', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(1234)).toBe('1234');
  });

  it('folds case and accents and splits punctuation-delimited words', () => {
    expect(words('  NUÑEZ, José-Rizal. ')).toEqual(['nunez', 'jose', 'rizal']);
  });
});

describe('matchesWords', () => {
  it('matches empty and whitespace-only queries', () => {
    expect(matchesWords('', 'Jose Rizal')).toBe(true);
    expect(matchesWords('   ', undefined)).toBe(true);
  });

  it('matches without case or accent sensitivity', () => {
    expect(matchesWords('nunez', 'Nuñez')).toBe(true);
    expect(matchesWords('NUÑ', 'Nuñez')).toBe(true);
  });

  it('matches prefixes of words but not interior substrings', () => {
    expect(matchesWords('riz', 'Jose Rizal')).toBe(true);
    expect(matchesWords('iza', 'Jose Rizal')).toBe(false);
  });

  it('requires every query token to match a field word prefix', () => {
    expect(matchesWords('jose riz', 'Jose Rizal')).toBe(true);
    expect(matchesWords('jose cruz', 'Jose Rizal')).toBe(false);
    expect(matchesWords('cruz juan', 'Juan', 'Dela Cruz')).toBe(true);
  });

  it('ignores null, undefined, and non-string fields', () => {
    expect(matchesWords('jo', null, undefined, 1234, 'Jose')).toBe(true);
    expect(matchesWords('123', 1234)).toBe(false);
  });
});

describe('learnerMatches', () => {
  const learner = { firstName: 'Juan', lastName: 'Dela Cruz', lrn: '123456789012' };

  it('matches first and last names in any query-token order', () => {
    expect(learnerMatches('juan cr', learner)).toBe(true);
    expect(learnerMatches('cruz juan', learner)).toBe(true);
  });

  it('matches an LRN prefix only when includeLrn is enabled', () => {
    expect(learnerMatches('1234', learner)).toBe(false);
    expect(learnerMatches('1234', learner, { includeLrn: true })).toBe(true);
    expect(learnerMatches('1234 56', learner, { includeLrn: true })).toBe(true);
  });

  it('handles a missing learner and missing fields', () => {
    expect(learnerMatches('jo', null)).toBe(false);
    expect(learnerMatches('', {})).toBe(true);
  });
});

describe('sectionMatches', () => {
  it('matches only section-name word prefixes', () => {
    expect(sectionMatches('jose riz', { name: 'Jose Rizal', adviserName: 'Ana Cruz' })).toBe(true);
    expect(sectionMatches('cruz', { name: 'Jose Rizal', adviserName: 'Ana Cruz' })).toBe(false);
  });
});

describe('buildLearnerIndex and searchLearners', () => {
  const ana = { id: 'a', firstName: 'Ana', lastName: 'Santos', lrn: '100000000001' };
  const jose = { id: 'j', firstName: 'José', lastName: 'Nuñez', lrn: '100000000002' };
  const juan = { id: 'u', firstName: 'Juan', lastName: 'Dela Cruz', lrn: '200000000003' };
  const santana = { id: 's', firstName: 'Liza', lastName: 'Santana', lrn: '300000000004' };
  const index = buildLearnerIndex([ana, jose, juan, santana]);

  it('keeps the order it was given', () => {
    expect(index.map((entry) => entry.item.id)).toEqual(['a', 'j', 'u', 's']);
    expect(searchLearners(index, '')).toEqual([ana, jose, juan, santana]);
  });

  it('matches word starts in any order, not mid-word', () => {
    expect(searchLearners(index, 'cruz juan')).toEqual([juan]);
    expect(searchLearners(index, 'san')).toEqual([ana, santana]);
    expect(searchLearners(index, 'ana')).toEqual([ana]);
  });

  it('ignores case and accents', () => {
    expect(searchLearners(index, 'NUNEZ jose')).toEqual([jose]);
  });

  it('matches an LRN prefix only with includeLrn', () => {
    expect(searchLearners(index, '1000')).toEqual([]);
    expect(searchLearners(index, '1000 0000', { includeLrn: true })).toEqual([ana, jose]);
  });

  it('applies accept and stops at limit without visiting the rest', () => {
    const seen = [];
    const accept = (learner) => { seen.push(learner.id); return learner.id !== 'a'; };
    expect(searchLearners(index, '', { accept, limit: 1 })).toEqual([jose]);
    expect(seen).toEqual(['a', 'j']);
  });

  it('indexes wrapped items through toLearner', () => {
    const entries = [{ student: juan, section: 'x' }, { student: ana, section: 'y' }];
    const wrapped = buildLearnerIndex(entries, (entry) => entry.student);
    expect(searchLearners(wrapped, 'ana')).toEqual([entries[1]]);
  });

  it('agrees with learnerMatches on every learner', () => {
    for (const q of ['', 'a', 'san', 'cruz ju', 'nuñ', '2000', 'zzz']) {
      for (const includeLrn of [false, true]) {
        const expected = [ana, jose, juan, santana].filter((l) => learnerMatches(q, l, { includeLrn }));
        expect(searchLearners(index, q, { includeLrn })).toEqual(expected);
      }
    }
  });

  it('survives missing fields', () => {
    const blank = buildLearnerIndex([{}, null]);
    expect(searchLearners(blank, '')).toHaveLength(2);
    expect(searchLearners(blank, 'a', { includeLrn: true })).toEqual([]);
  });
});
