import { describe, expect, it } from 'vitest';
import { validateStudent } from '../src/lib/validation.js';
import {
  CONTACT_FIELDS, ENROLL_TYPES, REASON_CODES, REMOVAL_REASONS, addKey, canDecideLearnerRequest, cleanText, coversGrade,
  isSectionAdviser, reasonLabel, removeKey, validateEnrollType, validateLearnerFields, validateRemoval,
} from './learnerRequests.js';

const year = '2026-2027';
const good = {
  lrn: '123456789012', lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos', extName: 'Jr', sex: 'M',
  birthdate: '2012-05-01', address: '123 Rizal St.', guardianName: 'Maria Dela Cruz', guardianRelationship: 'Mother',
  guardianContact: '09171234567', contactNumber: '09181234567',
};

describe('validateLearnerFields', () => {
  it('accepts the import template example and returns cleaned values', () => {
    const result = validateLearnerFields({ ...good, lastName: '  Dela   Cruz ', sex: 'm' }, { today: '2026-10-22' });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.value).toMatchObject({ lastName: 'Dela Cruz', sex: 'M', lrn: '123456789012' });
  });
  it('requires the same fields as the import', () => {
    const result = validateLearnerFields({}, { today: '2026-10-22' });
    expect(Object.keys(result.errors).sort()).toEqual(['birthdate', 'firstName', 'lastName', 'lrn', 'sex']);
    expect(result.errors.lrn).toBe('LRN must be exactly 12 digits.');
    expect(result.errors.sex).toBe('Choose a sex.');
  });
  it('agrees with the import validator on every field the import checks', () => {
    const rows = [good, { ...good, lrn: '12345' }, { ...good, lastName: ' ' }, { ...good, firstName: '' }, { ...good, sex: 'X' }, { ...good, birthdate: '' }, {}];
    for (const row of rows) {
      const ours = Object.keys(validateLearnerFields(row, { today: '2026-10-22' }).errors).sort();
      const theirs = Object.keys(validateStudent(row).errors).sort();
      expect(ours, JSON.stringify(row)).toEqual(theirs);
    }
  });
  it('rejects impossible and future birthdates', () => {
    expect(validateLearnerFields({ ...good, birthdate: '2012-02-30' }, { today: '2026-10-22' }).errors.birthdate).toBe('Enter the birthdate as a real date.');
    expect(validateLearnerFields({ ...good, birthdate: '05/01/2012' }, { today: '2026-10-22' }).errors.birthdate).toBe('Enter the birthdate as a real date.');
    expect(validateLearnerFields({ ...good, birthdate: '2027-01-01' }, { today: '2026-10-22' }).errors.birthdate).toBe('Birthdate cannot be in the future.');
    expect(validateLearnerFields({ ...good, birthdate: '2026-10-22' }, { today: '2026-10-22' }).ok).toBe(true);
  });
  it('limits text length and strips control characters', () => {
    expect(validateLearnerFields({ ...good, address: 'x'.repeat(201) }, {}).errors.address).toBe('Keep Address within 200 characters.');
    expect(validateLearnerFields({ ...good, lastName: 'y'.repeat(61) }, {}).errors.lastName).toBe('Keep Last name within 60 characters.');
    expect(validateLearnerFields({ ...good, firstName: 'Ju\u0000an\n' }, {}).value.firstName).toBe('Ju an');
    expect(cleanText(null)).toBe('');
  });
  it('treats the contact fields as the ones cleared after a decision', () => {
    expect(CONTACT_FIELDS).toEqual(['address', 'guardianContact', 'contactNumber']);
  });
});

describe('validateEnrollType', () => {
  it('defaults to new and accepts the import types', () => {
    expect(validateEnrollType('')).toEqual({ ok: true, value: 'new' });
    expect(validateEnrollType(undefined)).toEqual({ ok: true, value: 'new' });
    expect(validateEnrollType(' Returning ')).toEqual({ ok: true, value: 'returning' });
    expect(ENROLL_TYPES).toEqual(['new', 'returning', 'transferee']);
  });
  it('refuses anything else', () => {
    expect(validateEnrollType('visitor')).toMatchObject({ ok: false, error: 'Enrollment type must be new, returning, or transferee.' });
  });
});

describe('validateRemoval', () => {
  it('needs a known reason and a note of up to 500 characters', () => {
    expect(validateRemoval({ reasonCode: 'dropped_out', note: ' Stopped coming in August ' })).toEqual({
      ok: true, errors: {}, value: { reasonCode: 'dropped_out', note: 'Stopped coming in August' } });
    expect(validateRemoval({ reasonCode: 'left', note: 'x' }).errors).toEqual({ reasonCode: 'Choose a reason.' });
    expect(validateRemoval({ reasonCode: 'dropped_out', note: '  ' }).errors).toEqual({ note: 'Add a short note.' });
    expect(validateRemoval({ reasonCode: 'dropped_out', note: 'n'.repeat(501) }).errors.note).toBe('Keep the note within 500 characters.');
    expect(validateRemoval(null).ok).toBe(false);
  });
  it('maps each reason to the outcome in the spec', () => {
    expect(REASON_CODES).toEqual(['transferred_out', 'dropped_out', 'moved_section']);
    expect(REMOVAL_REASONS.transferred_out).toMatchObject({ enrollment: 'transferred', learner: 'transferred' });
    expect(REMOVAL_REASONS.dropped_out).toMatchObject({ enrollment: 'dropped', learner: 'dropped' });
    expect(REMOVAL_REASONS.moved_section).toMatchObject({ enrollment: 'dropped', learner: null });
    expect(reasonLabel('moved_section')).toBe('Moved to another section');
    expect(reasonLabel('nope')).toBe('');
  });
});

describe('request keys', () => {
  it('are distinct for adds and removals', () => {
    expect(addKey('SEC1', '123456789012')).toBe('add:SEC1:123456789012');
    expect(removeKey('SEC1', 'S1')).toBe('remove:SEC1:S1');
  });
});

describe('who may file and decide', () => {
  const request = { status: 'pending', schoolYear: year, gradeLevel: 7, requestedByUid: 'teacher', sectionId: 'SEC1' };
  const admin = { uid: 'admin', schoolYear: year, isAdmin: true, assignments: [], simsGrades: [] };
  const curriculum = (grade) => ({ uid: 'ca', schoolYear: year, isAdmin: false, simsGrades: [], assignments: [{ role: 'curriculum_adviser', schoolYear: year, gradeLevel: grade }] });
  const coordinator = (grades) => ({ uid: 'coord', schoolYear: year, isAdmin: false, assignments: [], simsGrades: grades });
  const adviser = { uid: 'teacher', schoolYear: year, isAdmin: false, simsGrades: [], assignments: [{ role: 'adviser', schoolYear: year, sectionId: 'SEC1', gradeLevel: 7 }] };

  it('lets only the section adviser file', () => {
    expect(isSectionAdviser(adviser, 'SEC1')).toBe(true);
    expect(isSectionAdviser(adviser, 'SEC2')).toBe(false);
    expect(isSectionAdviser({ ...adviser, schoolYear: '2027-2028' }, 'SEC1')).toBe(false);
    expect(isSectionAdviser(curriculum(7), 'SEC1')).toBe(false);
    expect(isSectionAdviser(admin, 'SEC1')).toBe(false);
  });
  it('lets administrators, in-grade coordinators and in-grade Curriculum Advisers decide', () => {
    for (const actor of [admin, coordinator([7, 8]), curriculum(7), { ...coordinator([9]), assignments: curriculum(7).assignments }]) {
      expect(canDecideLearnerRequest(actor, request)).toBe(true);
    }
  });
  it('refuses other grades, other years, finished requests, the requester and plain advisers', () => {
    expect(canDecideLearnerRequest(coordinator([8]), request)).toBe(false);
    expect(canDecideLearnerRequest(curriculum(8), request)).toBe(false);
    expect(canDecideLearnerRequest(admin, { ...request, schoolYear: '2025-2026' })).toBe(false);
    for (const status of ['approved', 'rejected', 'withdrawn']) expect(canDecideLearnerRequest(admin, { ...request, status })).toBe(false);
    expect(canDecideLearnerRequest(admin, { ...request, requestedByUid: 'admin' })).toBe(false);
    expect(canDecideLearnerRequest(coordinator([7]), { ...request, requestedByUid: 'coord' })).toBe(false);
    expect(canDecideLearnerRequest(adviser, { ...request, requestedByUid: 'someone' })).toBe(false);
    expect(canDecideLearnerRequest(null, request)).toBe(false);
  });
  it('knows which grades an actor covers', () => {
    expect(coversGrade(admin, 12)).toBe(true);
    expect(coversGrade(coordinator([7]), 7)).toBe(true);
    expect(coversGrade(coordinator([7]), 8)).toBe(false);
    expect(coversGrade(curriculum(10), 10)).toBe(true);
    expect(coversGrade(null, 7)).toBe(false);
  });
});
