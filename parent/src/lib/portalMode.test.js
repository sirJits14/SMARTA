import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readMode, writeMode, reconcileMode, canUseSchool, hasClass, advisorySections, schoolHome } from './portalMode.js';

const store = new Map();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
});
afterEach(() => { delete globalThis.localStorage; });

const context = { sections: [{ id: 'A' }, { id: 'B' }], assignments: [{ role: 'adviser', sectionId: 'B' }, { role: 'subject_teacher', sectionId: 'A' }] };

describe('portal mode', () => {
  it('defaults to Family and remembers School per account', () => {
    expect(readMode('u1')).toEqual({ view: 'family', hasClass: false });
    writeMode('u1', { view: 'school', hasClass: true });
    expect(readMode('u1')).toEqual({ view: 'school', hasClass: true });
    writeMode('u1', { view: 'family', hasClass: true });
    expect(store.has('bnhs-portal-mode')).toBe(false);
    expect(readMode('u1')).toEqual({ view: 'family', hasClass: false });
  });
  it('reads School mode saved by another account as Family', () => {
    writeMode('u1', { view: 'school', hasClass: true });
    expect(readMode('u2')).toEqual({ view: 'family', hasClass: false });
    expect(readMode(undefined)).toEqual({ view: 'family', hasClass: false });
    store.set('bnhs-portal-mode', JSON.stringify({ view: 'school', hasClass: true }));
    expect(readMode('u1')).toEqual({ view: 'family', hasClass: false });
  });
  it('returns a fresh Family object each time', () => {
    expect(readMode('u1')).not.toBe(readMode('u1'));
  });
  it('falls back to Family when storage is unavailable or corrupt', () => {
    store.set('bnhs-portal-mode', '{bad');
    expect(readMode('u1')).toEqual({ view: 'family', hasClass: false });
    delete globalThis.localStorage;
    expect(readMode('u1')).toEqual({ view: 'family', hasClass: false });
    expect(() => writeMode('u1', { view: 'school', hasClass: false })).not.toThrow();
  });
  it('offers School only to approved staff and the Class tab only to advisers', () => {
    expect(canUseSchool({ assignments: [] })).toBe(false);
    expect(canUseSchool({ isAdmin: true, assignments: [] })).toBe(false);
    expect(canUseSchool(context)).toBe(true);
    expect(hasClass(context)).toBe(true);
    expect(hasClass({ assignments: [{ role: 'subject_teacher', sectionId: 'A' }] })).toBe(false);
    expect(advisorySections(context)).toEqual([{ id: 'B' }]);
    expect(schoolHome({ view: 'school', hasClass: true })).toBe('/school');
    expect(schoolHome({ view: 'school', hasClass: false })).toBe('/announcements?view=school');
  });
});

describe('reconcileMode', () => {
  const school = (hasClass) => ({ view: 'school', hasClass });
  const subject = { assignments: [{ role: 'subject_teacher', sectionId: 'A' }] };
  it('leaves Family and unloaded context alone', () => {
    const family = { view: 'family', hasClass: false };
    expect(reconcileMode(family, context)).toEqual({ mode: family, changed: false });
    expect(reconcileMode(school(true), null)).toEqual({ mode: school(true), changed: false });
    expect(reconcileMode(school(true), undefined).changed).toBe(false);
  });
  it('drops to Family when access is revoked or the year ends', () => {
    expect(reconcileMode(school(true), { assignments: [] })).toEqual({ mode: { view: 'family', hasClass: false }, changed: true });
    expect(reconcileMode(school(false), {})).toEqual({ mode: { view: 'family', hasClass: false }, changed: true });
  });
  it('follows promotion and demotion', () => {
    expect(reconcileMode(school(false), context)).toEqual({ mode: school(true), changed: true });
    expect(reconcileMode(school(true), subject)).toEqual({ mode: school(false), changed: true });
  });
  it('is a no-op when School access still matches', () => {
    expect(reconcileMode(school(true), context)).toEqual({ mode: school(true), changed: false });
    expect(reconcileMode(school(false), subject)).toEqual({ mode: school(false), changed: false });
  });
});
