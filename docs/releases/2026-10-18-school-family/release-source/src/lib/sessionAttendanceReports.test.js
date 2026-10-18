import { expect, it } from 'vitest';
import { markFor, summarizeMonth } from './attendance.js';
import { rowsFor, dailyPresentCount } from './sf2Template.js';

it('reports and SF2 retain each corrected half-day rather than rounding to a full absence', () => {
  const docsByDate = { '2026-09-21': { marks: { s: 'L' }, sessionOverrides: { s: { am: { absent: true } } } } };
  expect(markFor(docsByDate, '2026-09-21', 's')).toBe('H');
  expect(summarizeMonth({ roster: ['s'], schoolDays: ['2026-09-21'], docsByDate }).s).toEqual({ present: .5, absent: .5, late: 1, excused: 0 });
  expect(rowsFor([{ id: 's' }], ['2026-09-21'], docsByDate)[0]).toMatchObject({ marks: ['AM:X PM:L'], absentTotal: .5, tardyTotal: 1 });
  expect(dailyPresentCount([{ id: 's' }], '2026-09-21', docsByDate)).toBe(.5);
});
