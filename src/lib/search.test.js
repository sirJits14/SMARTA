import { describe, expect, it } from 'vitest';
import { learnerMatches, matchesWords, normalize, sectionMatches, words } from './search.js';

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
