import { describe, it, expect } from 'vitest';
import { orderLearners, listName } from './learnerOrder.js';

const entry = (studentId, data, learnerName = '') => ({ link: { studentId, learnerName }, data });
const ids = (entries) => orderLearners(entries).map((e) => e.link.studentId);

describe('orderLearners', () => {
  it('lists males first, then females, each by last name then first name', () => {
    expect(ids([
      entry('f-santos', { sex: 'F', lastName: 'Santos', firstName: 'Lia' }),
      entry('m-reyes', { sex: 'M', lastName: 'Reyes', firstName: 'Paolo' }),
      entry('f-dela-cruz', { sex: 'F', lastName: 'Dela Cruz', firstName: 'Ana' }),
      entry('m-abad-b', { sex: 'M', lastName: 'Abad', firstName: 'Ben' }),
      entry('m-abad-a', { sex: 'M', lastName: 'abad', firstName: 'Al' }),
    ])).toEqual(['m-abad-a', 'm-abad-b', 'm-reyes', 'f-dela-cruz', 'f-santos']);
  });
  it('sorts multi-word surnames by the whole surname', () => {
    expect(ids([
      entry('cruz', { sex: 'F', lastName: 'Cruz', firstName: 'Mia' }),
      entry('dela-cruz', { sex: 'F', lastName: 'Dela Cruz', firstName: 'Ana' }),
    ])).toEqual(['cruz', 'dela-cruz']);
  });
  it('puts learners without the sort fields last, guessing the surname from the name', () => {
    expect(ids([
      entry('old-b', { displayName: 'Mark Villanueva Jr.' }),
      entry('old-a', null, 'Joy Bautista'),
      entry('f', { sex: 'F', lastName: 'Zamora', firstName: 'Iza' }),
    ])).toEqual(['f', 'old-a', 'old-b']);
  });
  it('does not change the input array', () => {
    const input = [entry('b', { sex: 'F', lastName: 'B' }), entry('a', { sex: 'M', lastName: 'A' })];
    orderLearners(input);
    expect(input.map((e) => e.link.studentId)).toEqual(['b', 'a']);
  });
});

describe('listName', () => {
  it('prefers the last-name-first form, then the display name, then the link name', () => {
    expect(listName({ formalName: 'Dela Cruz, Ana B.', displayName: 'Ana B. Dela Cruz' })).toBe('Dela Cruz, Ana B.');
    expect(listName({ displayName: 'Ana Cruz' })).toBe('Ana Cruz');
    expect(listName(null, 'Ana Cruz')).toBe('Ana Cruz');
    expect(listName(null)).toBe('—');
  });
});
