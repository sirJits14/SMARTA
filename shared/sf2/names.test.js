import { describe, expect, it } from 'vitest';
import { capsName, fullName } from './names.js';
import * as roster from '../../src/lib/roster.js';

describe('SF2 names', () => {
  it('writes DepEd order in capitals with a middle initial and extension', () => {
    expect(fullName({ lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos', extName: 'Jr' })).toBe('DELA CRUZ, JUAN S. JR');
    expect(fullName({ lastName: 'Dy', firstName: 'Ben' })).toBe('DY, BEN');
    expect(capsName(undefined)).toBe('');
  });
  it('matches the SIMS roster helpers it was copied from', () => {
    const samples = [
      { lastName: 'Cruz', firstName: 'Ana', middleName: 'B' },
      { lastName: 'Reyes', firstName: 'Mark', middleName: ' ', extName: 'III' },
      { lastName: 'Ñato', firstName: 'Zoë', middleName: 'ñandú' },
      { lastName: 'Dy', firstName: 'Ben' },
      { lastName: 'Dy', firstName: 'Ben', middleName: undefined, extName: undefined },
      { lastName: 'Dy', firstName: 'Ben', middleName: null, extName: null },
      { lastName: 'Dy', firstName: 'Ben', middleName: '', extName: '' },
      { lastName: 'Dy', firstName: 'Ben', middleName: '   ', extName: '   ' },
      { lastName: 'dela cruz', firstName: 'juan', middleName: 'santos', extName: 'jr' },
      { lastName: 'McDonald', firstName: 'Ana', middleName: 'De la Paz' },
      { lastName: 'Yılmaz', firstName: 'İlker', middleName: 'istanbul' },
      { lastName: 'Garcia-Lopez', firstName: 'Jose', middleName: 'Reyes', extName: 'Jr.' },
      { lastName: '  Cruz  ', firstName: '  Ana  ', middleName: '  B  ', extName: '  III  ' },
    ];
    for (const sample of samples) expect(fullName(sample)).toBe(roster.fullName(sample));
    for (const input of [undefined, null, '', 'teacher tina', 'Ñandú', 'istanbul', 123]) expect(capsName(input)).toBe(roster.capsName(input));
  });
});
