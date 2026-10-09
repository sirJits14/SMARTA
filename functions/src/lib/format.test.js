import { describe, it, expect } from 'vitest';
import { sectionLabel, displayName, fullName, formalName, learnerIdentity } from './format.js';

describe('format', () => {
  describe('sectionLabel', () => {
    it('formats a section with strand', () => {
      const section = { gradeLevel: 9, name: 'Biology', strand: 'Life Sciences' };
      expect(sectionLabel(section)).toBe('Grade 9 – Biology · Life Sciences');
    });
    it('formats a section without strand', () => {
      const section = { gradeLevel: 10, name: 'English' };
      expect(sectionLabel(section)).toBe('Grade 10 – English');
    });
    it('returns empty string for null section', () => {
      expect(sectionLabel(null)).toBe('');
    });
  });

  describe('displayName', () => {
    it('combines first and last name', () => {
      const student = { firstName: 'Ana', lastName: 'Cruz' };
      expect(displayName(student)).toBe('Ana Cruz');
    });
    it('trims extra whitespace', () => {
      const student = { firstName: '  Juan  ', lastName: '  Diaz  ' };
      expect(displayName(student)).toBe('Juan Diaz');
    });
  });
});

describe('fullName', () => {
  it('includes the middle name and extension', () => {
    expect(fullName({ firstName: 'Juan', middleName: 'Santos', lastName: 'Dela Cruz', extName: 'Jr.' })).toBe('Juan Santos Dela Cruz Jr.');
  });
  it('adds a period to a one-letter middle initial and skips blanks', () => {
    expect(fullName({ firstName: ' Ana ', middleName: 'B', lastName: 'Cruz', extName: ' ' })).toBe('Ana B. Cruz');
    expect(fullName({ firstName: 'Ben', lastName: 'Dy' })).toBe('Ben Dy');
  });
});

describe('formalName', () => {
  it('puts the last name first with a middle initial and extension', () => {
    expect(formalName({ firstName: 'Juan', middleName: 'Santos', lastName: 'Dela Cruz', extName: 'Jr.' })).toBe('Dela Cruz, Juan S. Jr.');
    expect(formalName({ firstName: ' Ben ', lastName: ' Dy ' })).toBe('Dy, Ben');
  });
});

describe('learnerIdentity', () => {
  it('carries the sort fields Home orders learners by', () => {
    const id = learnerIdentity({ firstName: 'Juan', lastName: ' Dela Cruz ', sex: 'M' }, { gradeLevel: 8, name: 'Rizal' }, '2026-2027');
    expect(id).toEqual({ displayName: 'Juan Dela Cruz', formalName: 'Dela Cruz, Juan', lastName: 'Dela Cruz', firstName: 'Juan', sex: 'M', sectionLabel: 'Grade 8 – Rizal', schoolYear: '2026-2027' });
  });
  it('stores an empty sex rather than an unexpected value', () => {
    expect(learnerIdentity({ firstName: 'A', lastName: 'B', sex: 'x' }, null, 'SY').sex).toBe('');
  });
});
