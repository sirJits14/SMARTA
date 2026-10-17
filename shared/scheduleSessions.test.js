import { describe, it, expect } from 'vitest';
import { hasPmSession, sessionSplit, sessionOf, sessionNotes } from './scheduleSessions.js';

const split = { timeIn: '08:00', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:00' };
const single = { timeIn: '07:30', timeOut: '17:00' };

describe('hasPmSession', () => {
  it('needs AM departure and both PM times as valid HH:MM', () => {
    expect(hasPmSession(split)).toBe(true);
    expect(hasPmSession(single)).toBe(false);
    expect(hasPmSession({ ...split, pmTimeOut: undefined })).toBe(false);
    expect(hasPmSession({ ...split, pmTimeIn: '' })).toBe(false);
    expect(hasPmSession({ ...split, pmTimeIn: '1:00' })).toBe(false);
    expect(hasPmSession(undefined)).toBe(false);
    expect(hasPmSession(null)).toBe(false);
  });
});

describe('sessionSplit', () => {
  it('is the midpoint of the lunch break, rounded down to the minute', () => {
    expect(sessionSplit(split)).toBe('12:30');
    expect(sessionSplit({ ...split, pmTimeIn: '12:45' })).toBe('12:22');
    expect(sessionSplit({ ...split, timeOut: '11:30', pmTimeIn: '13:00' })).toBe('12:15');
  });
  it('is the shared time when there is no break', () => {
    expect(sessionSplit({ ...split, pmTimeIn: '12:00' })).toBe('12:00');
  });
  it('is null without a PM session', () => {
    expect(sessionSplit(single)).toBeNull();
    expect(sessionSplit(undefined)).toBeNull();
  });
});

describe('sessionOf', () => {
  it('puts taps at or after the split in the afternoon', () => {
    expect(sessionOf('07:55', split)).toBe('am');
    expect(sessionOf('12:05', split)).toBe('am');
    expect(sessionOf('12:29', split)).toBe('am');
    expect(sessionOf('12:30', split)).toBe('pm');
    expect(sessionOf('16:02', split)).toBe('pm');
  });
  it('is always am for a single-session or missing schedule', () => {
    expect(sessionOf('15:00', single)).toBe('am');
    expect(sessionOf('15:00', undefined)).toBe('am');
  });
});

describe('sessionNotes', () => {
  it('is empty for an on-time split day', () => {
    expect(sessionNotes({ inTimes: ['07:55', '12:55'], schedule: split })).toEqual([]);
  });
  it('flags a late afternoon return without touching the morning', () => {
    expect(sessionNotes({ inTimes: ['07:55', '13:15'], schedule: split })).toEqual(['latePm']);
  });
  it('flags a learner whose first tap-in is in the afternoon', () => {
    expect(sessionNotes({ inTimes: ['12:50'], schedule: split })).toEqual(['absentAm']);
    expect(sessionNotes({ inTimes: ['13:00'], schedule: split })).toEqual(['absentAm']);
  });
  it('can carry both notes, absentAm first', () => {
    expect(sessionNotes({ inTimes: ['13:20'], schedule: split })).toEqual(['absentAm', 'latePm']);
  });
  it('judges Late PM on the earliest afternoon tap-in, in any input order', () => {
    expect(sessionNotes({ inTimes: ['13:30', '07:50', '12:58'], schedule: split })).toEqual([]);
  });
  it('is empty with no tap-ins or no PM session', () => {
    expect(sessionNotes({ inTimes: [], schedule: split })).toEqual([]);
    expect(sessionNotes({ inTimes: undefined, schedule: split })).toEqual([]);
    expect(sessionNotes({ inTimes: ['13:20'], schedule: single })).toEqual([]);
    expect(sessionNotes({ inTimes: ['13:20'], schedule: undefined })).toEqual([]);
  });
});
