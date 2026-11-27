import { describe, it, expect } from 'vitest';
import { fullName, depedSort, alphabeticalSort, capsName, personLabel } from './roster.js';

describe('fullName', () => {
  it('formats "Last, First M."', () => {
    expect(fullName({ lastName:'Cruz', firstName:'Ana', middleName:'Bautista' })).toBe('CRUZ, ANA B.');
  });
  it('handles missing middle name and ext', () => {
    expect(fullName({ lastName:'Lim', firstName:'Carlos', middleName:'', extName:'Jr' })).toBe('LIM, CARLOS JR');
  });
});

describe('depedSort', () => {
  it('orders males first, then females, each alphabetical', () => {
    const input = [
      { lastName:'Santos', firstName:'Maria', sex:'F' },
      { lastName:'Bautista', firstName:'Pedro', sex:'M' },
      { lastName:'Aquino', firstName:'Rosa', sex:'F' },
      { lastName:'Bautista', firstName:'Andres', sex:'M' },
    ];
    expect(depedSort(input).map(s => s.firstName)).toEqual(['Andres','Pedro','Rosa','Maria']);
  });
  it('does not mutate input', () => {
    const input = [{ lastName:'B', firstName:'B', sex:'F' }, { lastName:'A', firstName:'A', sex:'M' }];
    const copy = [...input];
    depedSort(input);
    expect(input).toEqual(copy);
  });
});

describe('alphabeticalSort', () => {
  it('orders purely alphabetically by last name then first name, ignoring sex', () => {
    const input = [
      { lastName: 'Santos', firstName: 'Maria', sex: 'F' },
      { lastName: 'Bautista', firstName: 'Pedro', sex: 'M' },
      { lastName: 'Aquino', firstName: 'Rosa', sex: 'F' },
      { lastName: 'Bautista', firstName: 'Andres', sex: 'M' },
    ];
    expect(alphabeticalSort(input).map(s => s.firstName)).toEqual(['Rosa', 'Andres', 'Pedro', 'Maria']);
  });
  it('does not mutate input', () => {
    const input = [{ lastName: 'B', firstName: 'B' }, { lastName: 'A', firstName: 'A' }];
    const copy = [...input];
    alphabeticalSort(input);
    expect(input).toEqual(copy);
  });
});

describe('capsName and personLabel', () => {
  it('upper-cases a name, including letters like ñ, and leaves empty values empty', () => {
    expect(capsName('Dela Peña, Juan')).toBe('DELA PEÑA, JUAN');
    expect(capsName(undefined)).toBe('');
    expect(capsName('')).toBe('');
  });
  it('shows a person by capitalised name, or by their email exactly as written when there is no name', () => {
    expect(personLabel({ displayName: 'Ana Cruz', email: 'ana@deped.gov.ph' })).toBe('ANA CRUZ');
    expect(personLabel({ email: 'Ana@DepEd.gov.ph' })).toBe('Ana@DepEd.gov.ph');
    expect(personLabel(null)).toBe('');
  });
});
