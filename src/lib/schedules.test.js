import { describe, it, expect } from 'vitest';
import { validateSchedule } from './schedules.js';

const single = { name: 'Morning Shift', timeIn: '07:30', timeOut: '17:00', pm: false };
const split = { name: 'Grade 12 Split', timeIn: '08:00', timeOut: '12:00', pm: true, pmTimeIn: '13:00', pmTimeOut: '16:00' };

describe('validateSchedule', () => {
  it('accepts a single-session and a split-day schedule', () => {
    expect(validateSchedule(single)).toBe('');
    expect(validateSchedule(split)).toBe('');
  });
  it('requires a name', () => {
    expect(validateSchedule({ ...single, name: '  ' })).toBe('Schedule name is required.');
  });
  it('keeps the original single-session messages', () => {
    expect(validateSchedule({ ...single, timeOut: '' })).toBe('Time in and time out are required.');
    expect(validateSchedule({ ...single, timeOut: '07:30' })).toBe('Time out must be later than time in.');
  });
  it('uses AM wording when the afternoon session is on', () => {
    expect(validateSchedule({ ...split, timeIn: '' })).toBe('AM arrival and AM departure are required.');
    expect(validateSchedule({ ...split, timeOut: '07:00' })).toBe('AM departure must be later than AM arrival.');
  });
  it('requires both PM times when the afternoon session is on', () => {
    expect(validateSchedule({ ...split, pmTimeOut: '' })).toBe('PM arrival and PM departure are required.');
    expect(validateSchedule({ ...split, pmTimeIn: undefined })).toBe('PM arrival and PM departure are required.');
  });
  it('keeps the times in order', () => {
    expect(validateSchedule({ ...split, pmTimeIn: '11:30' })).toBe('PM arrival cannot be earlier than AM departure.');
    expect(validateSchedule({ ...split, pmTimeIn: '12:00' })).toBe('');
    expect(validateSchedule({ ...split, pmTimeOut: '13:00' })).toBe('PM departure must be later than PM arrival.');
  });
  it('ignores leftover PM values when the afternoon session is off', () => {
    expect(validateSchedule({ ...single, pmTimeIn: '01:00', pmTimeOut: '' })).toBe('');
  });
});
