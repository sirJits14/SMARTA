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
    ];
    for (const sample of samples) expect(fullName(sample)).toBe(roster.fullName(sample));
    expect(capsName('teacher tina')).toBe(roster.capsName('teacher tina'));
  });
});
