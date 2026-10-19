import { describe, it, expect } from 'vitest';
import { JOIN_ROLES, heldRoles, pendingRoles, roleOptions, toggleRole, joinSteps, initialSelection, initialCode, landingModeFor, codeDraft, prettyCode } from './join.js';

const state = (options, key) => options.find((o) => o.key === key);
describe('join rules', () => {
  it('lists the three roles, family first', () => {
    expect(JOIN_ROLES).toEqual(['family', 'adviser', 'subject_teacher']);
  });
  it('reads held and pending roles from the school context and family links', () => {
    const context = { assignments: [{ role: 'adviser' }, { role: 'curriculum_adviser' }], myRequests: [{ role: 'subject_teacher', status: 'pending' }, { role: 'adviser', status: 'rejected' }] };
    expect(heldRoles(context, [{}])).toEqual(['adviser', 'family']);
    expect(heldRoles(null, [])).toEqual([]);
    expect(pendingRoles(context)).toEqual(['subject_teacher']);
  });
  it('blocks the other teacher role once one is chosen, held or pending', () => {
    let options = roleOptions({ held: [], pending: [], selected: ['adviser'], email: 'a@deped.gov.ph' });
    expect(state(options, 'adviser').state).toBe('selected');
    expect(state(options, 'subject_teacher').state).toBe('blocked');
    expect(state(options, 'family').state).toBe('available');
    options = roleOptions({ held: ['subject_teacher'], pending: [], selected: [], email: 'a@deped.gov.ph' });
    expect(state(options, 'subject_teacher').state).toBe('held');
    expect(state(options, 'adviser').state).toBe('blocked');
    options = roleOptions({ held: [], pending: ['adviser'], selected: [], email: 'a@deped.gov.ph' });
    expect(state(options, 'subject_teacher').state).toBe('blocked');
  });
  it('keeps Family addable for parents who already linked a learner', () => {
    const options = roleOptions({ held: ['family'], pending: [], selected: ['family'], email: 'p@gmail.com' });
    expect(state(options, 'family')).toMatchObject({ state: 'selected', active: true, needsApproval: false });
  });
  it('tags teacher roles as needing approval for personal emails only', () => {
    expect(state(roleOptions({ held: [], pending: [], selected: [], email: 'p@gmail.com' }), 'adviser').needsApproval).toBe(true);
    expect(state(roleOptions({ held: [], pending: [], selected: [], email: 'p@deped.gov.ph' }), 'adviser').needsApproval).toBe(false);
  });
  it('toggles only roles that can change, and steps follow role order', () => {
    const options = roleOptions({ held: [], pending: [], selected: ['subject_teacher'], email: '' });
    expect(toggleRole(['subject_teacher'], 'adviser', options)).toEqual(['subject_teacher']);
    expect(toggleRole(['subject_teacher'], 'family', options)).toEqual(['subject_teacher', 'family']);
    expect(toggleRole(['subject_teacher'], 'subject_teacher', options)).toEqual([]);
    expect(joinSteps(roleOptions({ held: [], pending: [], selected: ['subject_teacher', 'family'], email: '' }))).toEqual(['family', 'subject_teacher']);
    expect(joinSteps(roleOptions({ held: ['adviser'], pending: [], selected: ['adviser'], email: '' }))).toEqual([]);
  });
  it('preselects from a slip link and hands the code to its step', () => {
    expect(initialSelection({ a: 'ABCD2345' })).toEqual(['adviser']);
    expect(initialSelection({ c: 'ABCD2345' })).toEqual(['family']);
    expect(initialSelection({ role: 'family' })).toEqual(['family']);
    expect(initialSelection({})).toEqual([]);
    expect(initialCode({ a: 'abcd2345' }, 'adviser')).toBe('ABCD2345');
    expect(initialCode({ a: 'abcd2345' }, 'family')).toBe('');
  });
  it('lands teacher-only accounts in School and everyone else in Family', () => {
    expect(landingModeFor({ adviser: { outcome: 'active' } }, [])).toEqual({ view: 'school', hasClass: true });
    expect(landingModeFor({ subject_teacher: { outcome: 'active' } }, [])).toEqual({ view: 'school', hasClass: false });
    expect(landingModeFor({ adviser: { outcome: 'active' }, family: { outcome: 'active' } }, [])).toEqual({ view: 'family', hasClass: false });
    expect(landingModeFor({ adviser: { outcome: 'pending' } }, [])).toEqual({ view: 'family', hasClass: false });
    expect(landingModeFor({ subject_teacher: { outcome: 'active' } }, [{}])).toEqual({ view: 'family', hasClass: false });
    expect(landingModeFor({}, [])).toEqual({ view: 'family', hasClass: false });
  });
  it('counts roles the account already holds, so a skip lands in School', () => {
    expect(landingModeFor({}, [], [{ role: 'curriculum_adviser', gradeLevel: 7 }])).toEqual({ view: 'school', hasClass: false });
    expect(landingModeFor({}, [], [{ role: 'adviser', sectionId: 'a' }])).toEqual({ view: 'school', hasClass: true });
    expect(landingModeFor({ subject_teacher: { outcome: 'active' } }, [], [{ role: 'adviser', sectionId: 'a' }])).toEqual({ view: 'school', hasClass: true });
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
