import { describe, it, expect } from 'vitest';
import {
  MAX_PINNED, POST_KEYS, gradeKey, postAudienceKeys, audienceKeysFor, canPostToAll, postableGrades,
  coversPostKeys, toMillis, isVisibleToParents, manilaDateTime, endOfManilaDay,
} from './announcements.js';

const admin = { role: 'admin' }, legacy = { role: 'registrar' }, jhs = { role: 'jhs_coord' }, shs = { role: 'shs_coord' }, glc8 = { role: 'glc', gradeLevel: 8 };

describe('audience keys', () => {
  it('stores all parents as the single key all', () => {
    expect(postAudienceKeys({ all: true })).toEqual(['all']);
    expect(postAudienceKeys({ all: true, grades: [7] })).toEqual(['all']);
  });
  it('stores grades as sorted, unique g-keys and drops unknown grades', () => {
    expect(postAudienceKeys({ grades: [11, 7, 7, '8', 13] })).toEqual(['g7', 'g8', 'g11']);
    expect(postAudienceKeys({ grades: [] })).toEqual([]);
    expect(postAudienceKeys(undefined)).toEqual([]);
    expect(gradeKey(12)).toBe('g12');
    expect(POST_KEYS).toEqual(['all', 'g7', 'g8', 'g9', 'g10', 'g11', 'g12']);
  });
  it('gives a guardian all plus their grades, or nothing without a grade', () => {
    expect(audienceKeysFor([11, 7])).toEqual(['all', 'g7', 'g11']);
    expect(audienceKeysFor([])).toEqual([]);
  });
});

describe('scope', () => {
  it('lets only administrators post to everyone', () => {
    expect(canPostToAll(admin)).toBe(true);
    expect(canPostToAll(legacy)).toBe(true);
    expect(canPostToAll(jhs)).toBe(false);
  });
  it('lists the grades each role may address', () => {
    expect(postableGrades(admin)).toEqual([7, 8, 9, 10, 11, 12]);
    expect(postableGrades(jhs)).toEqual([7, 8, 9, 10]);
    expect(postableGrades(shs)).toEqual([11, 12]);
    expect(postableGrades(glc8)).toEqual([8]);
  });
  it('checks keys against the role, mirroring postKeysInScope() in the rules', () => {
    expect(coversPostKeys(admin, ['all'])).toBe(true);
    expect(coversPostKeys(admin, ['g12'])).toBe(true);
    expect(coversPostKeys(jhs, ['g7', 'g10'])).toBe(true);
    expect(coversPostKeys(jhs, ['g11'])).toBe(false);
    expect(coversPostKeys(jhs, ['all'])).toBe(false);
    expect(coversPostKeys(shs, ['g12'])).toBe(true);
    expect(coversPostKeys(glc8, ['g8'])).toBe(true);
    expect(coversPostKeys(glc8, ['g8', 'g9'])).toBe(false);
    expect(coversPostKeys(admin, [])).toBe(false);
    expect(coversPostKeys({ role: 'teacher' }, ['g7'])).toBe(false);
  });
});

describe('time and visibility', () => {
  it('reads Timestamps, Dates, numbers and nulls as milliseconds', () => {
    expect(toMillis({ toMillis: () => 42 })).toBe(42);
    expect(toMillis(new Date(5))).toBe(5);
    expect(toMillis(7)).toBe(7);
    expect(toMillis(null)).toBeNull();
    expect(toMillis(undefined)).toBeNull();
  });
  it('shows only published posts that have not expired', () => {
    const now = 1_000;
    expect(isVisibleToParents({ status: 'published', expiresAt: null }, now)).toBe(true);
    expect(isVisibleToParents({ status: 'published', expiresAt: new Date(2_000) }, now)).toBe(true);
    expect(isVisibleToParents({ status: 'published', expiresAt: new Date(1_000) }, now)).toBe(false);
    expect(isVisibleToParents({ status: 'scheduled', expiresAt: null }, now)).toBe(false);
    expect(isVisibleToParents({ status: 'unpublished' }, now)).toBe(false);
  });
  it('builds Philippine times', () => {
    expect(manilaDateTime('2026-10-05', '07:30').toISOString()).toBe('2026-10-04T23:30:00.000Z');
    expect(endOfManilaDay('2026-10-05').toISOString()).toBe('2026-10-05T15:59:59.999Z');
    expect(MAX_PINNED).toBe(3);
  });
});
