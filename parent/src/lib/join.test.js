import { describe, it, expect } from 'vitest';
import { JOIN_ROLES, heldRoles, roleOptions, toggleRole, joinSteps, initialSelection, initialCode, landingModeFor, codeDraft, prettyCode } from './join.js';

const state = (options, key) => options.find((o) => o.key === key);
describe('join rules', () => {
  it('lists Parent/Guardian then Class Adviser', () => {
    expect(JOIN_ROLES).toEqual(['family', 'adviser']);
  });
  it('reads held roles from the school context and family links', () => {
    const context = { assignments: [{ role: 'adviser' }, { role: 'curriculum_adviser' }, { role: 'subject_teacher' }] };
    expect(heldRoles(context, [{}])).toEqual(['adviser', 'family']);
    expect(heldRoles(null, [])).toEqual([]);
  });
  it('lets both roles be ticked together', () => {
    const options = roleOptions({ held: [], selected: ['adviser', 'family'], email: 'a@deped.gov.ph' });
    expect(options.map((o) => [o.key, o.state])).toEqual([['family', 'selected'], ['adviser', 'selected']]);
    expect(options.some((o) => o.state === 'blocked')).toBe(false);
  });
  it('keeps Parent/Guardian addable for parents who already linked a learner', () => {
    const options = roleOptions({ held: ['family'], selected: ['family'], email: 'p@gmail.com' });
    expect(state(options, 'family')).toMatchObject({ state: 'selected', active: true });
  });
  it('offers Class Adviser to DepEd accounts only, and keeps a held card locked', () => {
    expect(state(roleOptions({ held: [], selected: [], email: 'p@deped.gov.ph' }), 'adviser')).toMatchObject({ state: 'available', active: false });
    expect(roleOptions({ held: [], selected: [], email: 'p@gmail.com' }).map((o) => o.key)).toEqual(['family']);
    expect(roleOptions({ held: [], selected: [], email: '' }).map((o) => o.key)).toEqual(['family']);
    expect(state(roleOptions({ held: ['adviser'], selected: [], email: 'a@deped.gov.ph' }), 'adviser')).toMatchObject({ state: 'held', active: true });
    expect(state(roleOptions({ held: ['adviser'], selected: [], email: 'p@gmail.com' }), 'adviser')).toMatchObject({ state: 'held', active: true });
  });
  it('ignores a slip-link preselection for an account that cannot be an adviser', () => {
    const selected = initialSelection({ a: 'ABCD2345' });
    expect(joinSteps(roleOptions({ held: [], selected, email: 'p@gmail.com' }))).toEqual([]);
    expect(joinSteps(roleOptions({ held: [], selected, email: 'a@deped.gov.ph' }))).toEqual(['adviser']);
  });
  it('toggles only roles that can change, and steps follow role order', () => {
    const email = 'a@deped.gov.ph';
    const options = roleOptions({ held: [], selected: ['adviser'], email });
    expect(toggleRole(['adviser'], 'family', options)).toEqual(['adviser', 'family']);
    expect(toggleRole(['adviser'], 'adviser', options)).toEqual([]);
    expect(toggleRole(['adviser'], 'subject_teacher', options)).toEqual(['adviser']);
    expect(joinSteps(roleOptions({ held: [], selected: ['adviser', 'family'], email }))).toEqual(['family', 'adviser']);
    const held = roleOptions({ held: ['adviser'], selected: ['adviser'], email });
    expect(toggleRole(['adviser'], 'adviser', held)).toEqual(['adviser']);
    expect(joinSteps(held)).toEqual([]);
  });
  it('preselects from a slip link, ignores old Subject Teacher links, and hands the code to its step', () => {
    expect(initialSelection({ a: 'ABCD2345' })).toEqual(['adviser']);
    expect(initialSelection({ c: 'ABCD2345' })).toEqual(['family']);
    expect(initialSelection({ role: 'family' })).toEqual(['family']);
    expect(initialSelection({ role: 'adviser' })).toEqual(['adviser']);
    expect(initialSelection({ role: 'subject_teacher' })).toEqual([]);
    expect(initialSelection({})).toEqual([]);
    expect(initialCode({ a: 'abcd2345' }, 'adviser')).toBe('ABCD2345');
    expect(initialCode({ a: 'abcd2345' }, 'family')).toBe('');
  });
  it('lands adviser-only accounts in School and everyone else in Parent/Guardian', () => {
    expect(landingModeFor({ adviser: { outcome: 'active' } }, [])).toEqual({ view: 'school', hasClass: true });
    expect(landingModeFor({ adviser: { outcome: 'active' }, family: { outcome: 'active' } }, [])).toEqual({ view: 'family', hasClass: false });
    expect(landingModeFor({ adviser: { outcome: 'pending' } }, [])).toEqual({ view: 'family', hasClass: false });
    expect(landingModeFor({ subject_teacher: { outcome: 'active' } }, [])).toEqual({ view: 'family', hasClass: false });
    expect(landingModeFor({}, [])).toEqual({ view: 'family', hasClass: false });
  });
  it('counts roles the account already holds, so a skip lands in School', () => {
    expect(landingModeFor({}, [], [{ role: 'curriculum_adviser', gradeLevel: 7 }])).toEqual({ view: 'school', hasClass: false });
    expect(landingModeFor({}, [], [{ role: 'adviser', sectionId: 'a' }])).toEqual({ view: 'school', hasClass: true });
    expect(landingModeFor({}, [{}], [{ role: 'adviser', sectionId: 'a' }])).toEqual({ view: 'family', hasClass: false });
    expect(landingModeFor({ family: { outcome: 'active' } }, [], [{ role: 'curriculum_adviser' }])).toEqual({ view: 'family', hasClass: false });
    expect(landingModeFor({}, [], [{ role: 'family' }])).toEqual({ view: 'family', hasClass: false });
  });
  it('formats typed codes like the server reads them', () => {
    expect(codeDraft('abcd-o1il-xyz')).toBe('ABCD0111');
    expect(prettyCode('ABCD0111')).toBe('ABCD-0111');
    expect(prettyCode('ABC')).toBe('ABC');
  });
});
