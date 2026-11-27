import { describe, it, expect } from 'vitest';
import { filterResults, countByKind, stepIndex } from './importPreview.js';

const results = [
  { rowNumber: 2, kind: 'new' },
  { rowNumber: 3, kind: 'error', errors: { lrn: 'bad' } },
  { rowNumber: 4, kind: 'update' },
  { rowNumber: 5, kind: 'error', errors: { section: 'bad' } },
];

describe('countByKind', () => {
  it('counts every kind plus the total', () => {
    expect(countByKind(results)).toEqual({ all: 4, new: 1, update: 1, error: 2 });
  });
  it('handles an empty list', () => {
    expect(countByKind([])).toEqual({ all: 0, new: 0, update: 0, error: 0 });
  });
});

describe('filterResults', () => {
  it('returns everything for "all"', () => {
    expect(filterResults(results, 'all')).toHaveLength(4);
  });
  it('keeps only the chosen kind, preserving order', () => {
    expect(filterResults(results, 'error').map((r) => r.rowNumber)).toEqual([3, 5]);
    expect(filterResults(results, 'new').map((r) => r.rowNumber)).toEqual([2]);
  });
});

describe('stepIndex', () => {
  it('starts at the first / last when nothing is current', () => {
    expect(stepIndex(-1, 3, 1)).toBe(0);
    expect(stepIndex(-1, 3, -1)).toBe(2);
  });
  it('wraps around both ways', () => {
    expect(stepIndex(2, 3, 1)).toBe(0);
    expect(stepIndex(0, 3, -1)).toBe(2);
  });
  it('moves by one otherwise', () => {
    expect(stepIndex(0, 3, 1)).toBe(1);
    expect(stepIndex(2, 3, -1)).toBe(1);
  });
  it('returns -1 when there is nothing to step through', () => {
    expect(stepIndex(-1, 0, 1)).toBe(-1);
  });
});
