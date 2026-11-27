import { describe, expect, it } from 'vitest';
import { FLAG_REASONS, RESTORE_REASONS, UNDO_REASON, hasTwoSessions, sessionNow, enteredFor, groupRoster, rosterSummary, reasonText, correctionInput, runLimited, flagAction } from './classSession.js';

const split = { timeIn: '07:30', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:30' };
const row = (studentId, gate = {}, am = { status: 'P' }, pm = { status: 'P' }) => ({ studentId, displayName: studentId, revision: 0, gate, am, pm });

describe('class session', () => {
  it('uses the agreed neutral reasons', () => {
    expect(FLAG_REASONS).toEqual(['Not in class', 'Left during class']);
    expect(RESTORE_REASONS).toEqual(['Was in class', 'Flagged by mistake']);
    expect(UNDO_REASON).toBe('Undone right after flagging');
  });
  it('picks AM or PM from the middle of the lunch break', () => {
    expect(hasTwoSessions(split)).toBe(true);
    expect(hasTwoSessions({ timeIn: '07:30', timeOut: '16:00' })).toBe(false);
    expect(hasTwoSessions(null)).toBe(false);
    expect(sessionNow(split, '12:29')).toBe('am');
    expect(sessionNow(split, '12:30')).toBe('pm');
    expect(sessionNow(null, '15:00')).toBe('am');
  });
  it('counts a morning arrival without a lunch tap-out as in school for PM', () => {
    expect(enteredFor(row('a', { timeIn: '07:10' }), 'pm')).toBe('07:10');
    expect(enteredFor(row('a', { timeIn: '07:10', timeOut: '12:01' }), 'pm')).toBeNull();
    expect(enteredFor(row('a', { timeIn: '07:10', timeOut: '12:01', pmTimeIn: '12:50' }), 'pm')).toBe('12:50');
    expect(enteredFor(row('a', { pmTimeIn: '12:50' }), 'am')).toBeNull();
  });
  it('groups flagged first by flag, then gate entry, then everyone else', () => {
    const rows = [
      row('in', { timeIn: '07:10' }),
      row('flag', { timeIn: '07:12' }, { status: 'A', overrideActive: true }),
      row('none'),
      row('baseAbsent', { timeIn: '07:20' }, { status: 'A' }),
    ];
    const groups = groupRoster(rows, 'am');
    expect(groups.inSchool.map(r => r.studentId)).toEqual(['in']);
    expect(groups.flagged.map(r => r.studentId)).toEqual(['flag']);
    expect(groups.noEntry.map(r => r.studentId)).toEqual(['none', 'baseAbsent']);
    expect(rosterSummary(groups)).toBe('2 entered · 1 flagged');
  });
  it('joins an optional note and keeps the reason within 500 characters', () => {
    expect(reasonText('Not in class', '')).toBe('Not in class');
    expect(reasonText(' Not in class ', ' Went to clinic ')).toBe('Not in class: Went to clinic');
    expect(reasonText('x'.repeat(600), '').length).toBe(500);
  });
  it('builds a correction from the row revision', () => {
    expect(correctionInput({ sectionId: 'S', date: '2026-10-19', session: 'pm', row: { studentId: 'a', revision: 3 }, absent: true, reason: 'Not in class', operationId: 'op' }))
      .toEqual({ sectionId: 'S', studentId: 'a', date: '2026-10-19', session: 'pm', absent: true, reason: 'Not in class', expectedRevision: 3, operationId: 'op' });
  });
  it('runs a few calls at a time and keeps each outcome', async () => {
    let active = 0; let peak = 0;
    const results = await runLimited([1, 2, 3, 4, 5], 2, async n => {
      active++; peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 5));
      active--;
      if (n === 4) throw new Error('nope');
      return n * 10;
    });
    expect(peak).toBe(2);
    expect(results.map(r => r.ok)).toEqual([true, true, true, false, true]);
    expect(results[0].value).toBe(10);
    expect(results[3].error.message).toBe('nope');
  });
});

describe('flagAction', () => {
  const data = (over = {}) => ({ canCorrect: true, am: { status: 'P' }, pm: { status: 'A', overrideActive: true }, ...over });
  it('offers Flag for a normal session and Restore for an active flag', () => {
    expect(flagAction(data(), 'am')).toBe('flag');
    expect(flagAction(data(), 'pm')).toBe('restore');
  });
  it('offers nothing when the day cannot be corrected', () => {
    expect(flagAction(data({ canCorrect: false }), 'am')).toBeNull();
    expect(flagAction(null, 'am')).toBeNull();
  });
});
