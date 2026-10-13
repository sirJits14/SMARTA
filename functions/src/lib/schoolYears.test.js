import { describe, it, expect } from 'vitest';
import { schoolYearRef, isEnded, schoolYearEnded } from './schoolYears.js';

const fakeDb = (docs = {}) => ({ doc: (path) => ({ path, get: async () => ({ exists: path in docs, data: () => docs[path] }) }) });

describe('schoolYears', () => {
  it('points at school_years/{sy} only for a well-formed year', () => {
    expect(schoolYearRef(fakeDb(), '2026-2027').path).toBe('school_years/2026-2027');
    expect(schoolYearRef(fakeDb(), '2026/2027')).toBeNull();
    expect(schoolYearRef(fakeDb(), undefined)).toBeNull();
  });
  it('a year is ended only once its marker has endedAt', async () => {
    expect(isEnded(null)).toBe(false);
    expect(isEnded({ exists: true, data: () => ({}) })).toBe(false);
    const db = fakeDb({ 'school_years/2025-2026': { endedAt: new Date() } });
    expect(await schoolYearEnded(db, '2025-2026')).toBe(true);
    expect(await schoolYearEnded(db, '2026-2027')).toBe(false);
    expect(await schoolYearEnded(db, '2025/2026')).toBe(false);
  });
});
