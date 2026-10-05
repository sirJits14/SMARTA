import { describe, it, expect } from 'vitest';
import { sectionLabel, displayName, fullName } from './format.js';

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
