import { describe, it, expect } from 'vitest';
import { sessionRows, sessionFootnote } from './sessionRows.js';

const none = { pmTimeIn: null, pmTimeOut: null };

describe('sessionRows', () => {
  it('shows AM and PM with bell times for a split day', () => {
    expect(sessionRows({ timeIn: '07:30', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:30' })).toEqual([
      { key: 'am', label: 'AM · 07:30 AM–12:00 PM' },
      { key: 'pm', label: 'PM · 01:00 PM–04:30 PM' },
    ]);
  });
  it('calls a single session starting before noon the morning shift', () => {
    expect(sessionRows({ timeIn: '11:59', timeOut: '17:00', ...none })).toEqual([{ key: 'am', label: 'Morning shift · 11:59 AM–05:00 PM' }]);
  });
  it('calls a single session starting at noon or later the afternoon shift', () => {
    expect(sessionRows({ timeIn: '12:00', timeOut: '18:00', ...none })).toEqual([{ key: 'am', label: 'Afternoon shift · 12:00 PM–06:00 PM' }]);
  });
  it('shows one Attendance row without a schedule or a valid time in', () => {
    expect(sessionRows(null)).toEqual([{ key: 'am', label: 'Attendance' }]);
    expect(sessionRows({ timeIn: null, timeOut: '12:00', ...none })).toEqual([{ key: 'am', label: 'Attendance' }]);
  });
  it('shows one Attendance row for an empty schedule object', () => {
    expect(sessionRows({})).toEqual([{ key: 'am', label: 'Attendance' }]);
  });
  it('treats a half-filled PM as a single session, like hasPmSession', () => {
    expect(sessionRows({ timeIn: '07:30', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: null })).toEqual([{ key: 'am', label: 'Morning shift · 07:30 AM–12:00 PM' }]);
  });
  it('drops the times when an end is missing', () => {
    expect(sessionRows({ timeIn: '06:00', timeOut: null, ...none })).toEqual([{ key: 'am', label: 'Morning shift' }]);
  });
  it('falls back to AM and PM when the server sent no schedule', () => {
    expect(sessionRows(undefined)).toEqual([{ key: 'am', label: 'AM' }, { key: 'pm', label: 'PM' }]);
  });
});

describe('sessionFootnote', () => {
  it('explains separate sessions only when there are two rows', () => {
    expect(sessionFootnote(sessionRows(undefined))).toBe('AM and PM attendance are recorded separately. Original gate scans are in the history.');
    expect(sessionFootnote(sessionRows(null))).toBe('Original gate scans are in the history.');
  });
});
