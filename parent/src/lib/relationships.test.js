import { describe, it, expect } from 'vitest';
import { RELATIONSHIPS, ADVISER, isDepedEmail, relationshipOptions, changeErrorMessage } from './relationships.js';
import S from '../strings.js';

describe('relationships', () => {
  it('lists the guardian relationships the server accepts', () => {
    expect(RELATIONSHIPS).toEqual(['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other']);
    expect(ADVISER).toBe('Adviser');
  });
  it('recognises DepEd emails only', () => {
    expect(isDepedEmail('juan.cruz@deped.gov.ph')).toBe(true);
    expect(isDepedEmail('  Juan.Cruz@DepEd.Gov.PH ')).toBe(true);
    expect(isDepedEmail('juan@gmail.com')).toBe(false);
    expect(isDepedEmail('juan@deped.gov.ph.example.com')).toBe(false);
    expect(isDepedEmail('juan@notdeped.gov.ph')).toBe(false);
    expect(isDepedEmail(undefined)).toBe(false);
  });
  it('offers the other family relationships, never Adviser', () => {
    expect(relationshipOptions({ relationship: 'Guardian', slot: 'guardian' })).toEqual(['Mother', 'Father', 'Grandparent', 'Sibling', 'Other']);
    expect(relationshipOptions({ relationship: 'Mother' })).not.toContain('Mother'); // links made before slots existed
    expect(relationshipOptions({ relationship: ADVISER, slot: 'adviser' })).toEqual(RELATIONSHIPS);
    for (const r of RELATIONSHIPS) expect(relationshipOptions({ relationship: r })).not.toContain(ADVISER);
  });
  it('shows the server message for refusals a parent can act on, else the generic one', () => {
    expect(changeErrorMessage({ code: 'functions/failed-precondition', message: 'This learner already has an adviser linked.' })).toBe('This learner already has an adviser linked.');
    expect(changeErrorMessage({ code: 'functions/permission-denied', message: 'Only DepEd' })).toBe('Only DepEd');
    expect(changeErrorMessage({ code: 'functions/invalid-argument', message: 'Choose Adviser' })).toBe('Choose Adviser');
    expect(changeErrorMessage({ code: 'functions/resource-exhausted', message: 'Too many attempts. Try again later.' })).toBe('Too many attempts. Try again later.');
    expect(changeErrorMessage({ code: 'functions/internal', message: 'Something went wrong.' })).toBe(S.relChangeFailed);
    expect(changeErrorMessage(new Error('offline'))).toBe(S.relChangeFailed);
  });
});
