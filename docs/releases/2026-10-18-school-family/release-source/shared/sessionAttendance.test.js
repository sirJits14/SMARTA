import { describe, it, expect } from 'vitest';
import { sessionAttendance, attendanceUnits } from './sessionAttendance.js';

describe('effective session attendance', () => {
  const base = { marks: { s: 'L' }, timeIn: { s: '08:12' } };
  it('changes only the selected session and restores original lateness on reversal', () => {
    const record = { ...base, sessionOverrides: { s: { revision: 1, am: { absent: true, reason: 'Left class' } } } };
    expect(sessionAttendance(record, 's')).toMatchObject({ revision: 1, am: { status: 'A', absent: true }, pm: { status: 'L', absent: false } });
    record.sessionOverrides.s.am.absent = false;
    expect(sessionAttendance(record, 's').am.status).toBe('L');
    expect(record.marks.s).toBe('L');
  });
  it('counts a single absent session as half a day and preserves legacy marks', () => {
    expect(attendanceUnits(base, 's')).toMatchObject({ present: 1, absent: 0, late: 1 });
    expect(attendanceUnits({ ...base, sessionOverrides: { s: { am: { absent: true } } } }, 's')).toMatchObject({ present: .5, absent: .5 });
    expect(attendanceUnits({ marks: { s: 'E' } }, 's')).toMatchObject({ excused: 1 });
  });
  it('keeps informational PM scan notes separate from base session marks', () => {
    expect(sessionAttendance({ marks: { s: 'P' }, absentAm: { s: true }, latePm: { s: true } }, 's')).toMatchObject({ am: { status: 'P' }, pm: { status: 'P' } });
  });
  it('distinguishes an active override from an underlying absence and supports portal no-record states', () => {
    expect(sessionAttendance({ marks: { s: 'A' } }, 's').am).toMatchObject({ absent: true, overrideActive: false });
    expect(sessionAttendance({ sessionOverrides: { s: { am: { absent: true } } } }, 's').am.overrideActive).toBe(true);
    expect(sessionAttendance(undefined, 's', { unrecordedStatus: 'no_scan' }).am.status).toBe('no_scan');
    expect(sessionAttendance(undefined, 's').am.status).toBe('P');
  });
});
