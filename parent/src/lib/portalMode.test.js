import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readMode, writeMode, canUseSchool, hasClass, advisorySections, schoolHome } from './portalMode.js';

const store = new Map();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
});
afterEach(() => { delete globalThis.localStorage; });

const context = { sections: [{ id: 'A' }, { id: 'B' }], assignments: [{ role: 'adviser', sectionId: 'B' }, { role: 'subject_teacher', sectionId: 'A' }] };

describe('portal mode', () => {
  it('defaults to Family and remembers School per device', () => {
    expect(readMode()).toEqual({ view: 'family', hasClass: false });
    writeMode({ view: 'school', hasClass: true });
    expect(readMode()).toEqual({ view: 'school', hasClass: true });
    writeMode({ view: 'family', hasClass: true });
    expect(readMode()).toEqual({ view: 'family', hasClass: false });
  });
  it('falls back to Family when storage is unavailable or corrupt', () => {
    store.set('bnhs-portal-mode', '{bad');
    expect(readMode()).toEqual({ view: 'family', hasClass: false });
    delete globalThis.localStorage;
    expect(readMode()).toEqual({ view: 'family', hasClass: false });
    expect(() => writeMode({ view: 'school', hasClass: false })).not.toThrow();
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
