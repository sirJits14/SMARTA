import { describe, it, expect } from 'vitest';
import { fullName, depedSort } from './roster.js';

describe('fullName', () => {
  it('formats "Last, First M."', () => {
    expect(fullName({ lastName:'Cruz', firstName:'Ana', middleName:'Bautista' })).toBe('Cruz, Ana B.');
  });
  it('handles missing middle name and ext', () => {
    expect(fullName({ lastName:'Lim', firstName:'Carlos', middleName:'', extName:'Jr' })).toBe('Lim, Carlos Jr');
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
