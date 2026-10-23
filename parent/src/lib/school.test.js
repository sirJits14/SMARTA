import { describe, expect, it } from 'vitest';
import { callableMessage, schoolError, attendanceSections, correctionError, inboxDestination, sessionAction, correctionTime, REQUESTABLE_ROLES, ROLE_LABELS, REQUEST_STATUS, sectionsByGrade, manilaDay, openedToday, rememberOpened, scopeLabel, learnerPath } from './school.js';
import { portalView, notificationDestination } from './nav.js';
import { matchRoute } from './router.js';
describe('school access presentation', () => {
  const sections = [{ id: 'a', gradeLevel: 7 }, { id: 'b', gradeLevel: 8 }];
  it('routes School separately and preserves explicit school notices', () => {
    expect(matchRoute('/school').name).toBe('school');
    expect(portalView(matchRoute('/announcements', '?view=school'))).toBe('school');
    expect(portalView(matchRoute('/learner/a', '?view=school'))).toBe('family');
  });
  it('a leftover Subject Teacher row has no learner roster; advisers and curriculum advisers have scoped rosters', () => {
    expect(attendanceSections({ sections, assignments: [{ role: 'subject_teacher', sectionId: 'a' }] })).toEqual([]);
    expect(attendanceSections({ sections, assignments: [{ role: 'adviser', sectionId: 'a' }] })).toEqual([sections[0]]);
    expect(attendanceSections({ sections, assignments: [{ role: 'curriculum_adviser', gradeLevel: 8 }] })).toEqual([sections[1]]);
    expect(attendanceSections({ sections, isAdmin: true })).toEqual(sections);
  });
  it('requires a supported role, known section and reason for session corrections', () => {
    expect(correctionError({ session: 'am', reason: '  ' })).toBeTruthy();
    expect(correctionError({ session: 'pm', reason: 'Learner left before the session.' })).toBe('');
  });
  it('routes correction inbox entries to authenticated day/session details', () => {
    expect(inboxDestination({ type: 'attendance_correction', studentId: 'a b', date: '2026-10-17', session: 'pm' })).toBe('/learner/a%20b?date=2026-10-17&session=pm');
  });
  it('sends a school access note to Settings, and a rejection to the request page', () => {
    expect(inboxDestination({ type: 'school_access' })).toBe('/settings');
    expect(inboxDestination({ type: 'school_access', rejected: true })).toBe('/settings/school-access');
  });
  it('sends a learner request note to the Class tab', () => {
    expect(inboxDestination({ type: 'learner_request' })).toBe('/school');
    expect(inboxDestination({ type: 'learner_request', rejected: true })).toBe('/school');
  });
  it('offers requestable roles and sections grouped by grade', () => {
    expect(REQUESTABLE_ROLES).toEqual(['adviser']);
    expect(ROLE_LABELS).toEqual({ adviser: 'Adviser', curriculum_adviser: 'Curriculum Adviser' });
    expect(REQUEST_STATUS.rejected).toBe('Not approved');
    expect(sectionsByGrade([{ id: 'b', gradeLevel: 8 }, { id: 'a', gradeLevel: 7 }, { id: 'c', gradeLevel: 8 }]))
      .toEqual([{ grade: 7, sections: [{ id: 'a', gradeLevel: 7 }] }, { grade: 8, sections: [{ id: 'b', gradeLevel: 8 }, { id: 'c', gradeLevel: 8 }] }]);
  });
  it('reports School opened at most once a Manila day per account', () => {
    const store = new Map();
    const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    expect(manilaDay(new Date('2026-10-18T17:30:00Z'))).toBe('2026-10-19');
    expect(openedToday('u1', '2026-10-19', storage)).toBe(false);
    rememberOpened('u1', '2026-10-19', storage);
    expect(openedToday('u1', '2026-10-19', storage)).toBe(true);
    expect(openedToday('u2', '2026-10-19', storage)).toBe(false);
    expect(openedToday('u1', '2026-10-20', storage)).toBe(false);
    expect(openedToday('u3', '2026-10-20', { getItem: () => { throw new Error('blocked'); } })).toBe(false);
    expect(() => rememberOpened('u3', '2026-10-20', { setItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });
  it('only restores an active override and keeps base absences unchanged', () => {
    expect(sessionAction({ absent: true, overrideActive: false })).toBeNull();
    expect(sessionAction({ absent: true, overrideActive: true })).toBe('restore');
    expect(sessionAction({ absent: false, overrideActive: false })).toBe('absent');
  });
  it('accepts callable timestamp representations and labels Manila time', () => {
    expect(correctionTime({ seconds: 1792198800 })).toMatch(/Manila$/);
    expect(correctionTime({ _seconds: 1792198800 })).toBe(correctionTime({ seconds: 1792198800 }));
    expect(correctionTime(null)).toBe('');
  });
  it('preserves School view in foreground announcement pushes', () => {
    expect(notificationDestination({ announcementId: 'staff notice', view: 'school' })).toBe('/announcements/staff%20notice?view=school');
    expect(notificationDestination({ announcementId: 'family' })).toBe('/announcements/family');
    expect(notificationDestination({})).toBe('/inbox');
  });
});

describe('scopeLabel', () => {
  it('names a section, or the grade for grade-level roles', () => {
    const sections = [{ id: 'a', gradeLevel: 7, name: 'Rizal' }];
    expect(scopeLabel({ sectionId: 'a', gradeLevel: 7 }, sections)).toBe('Grade 7 · Rizal');
    expect(scopeLabel({ sectionId: '', gradeLevel: 8 }, sections)).toBe('Grade 8');
    expect(REQUEST_STATUS.fulfilled).toBeTruthy();
    expect(REQUEST_STATUS.superseded).toBeTruthy();
  });
});

describe('schoolError', () => {
  const GENERIC = 'Could not complete this action. Check your connection and try again.';
  it('shows the server’s own message for the codes it chooses to send', () => {
    expect(schoolError({ code: 'functions/resource-exhausted', message: 'Too many exports. Try again in a few minutes. [429]' })).toBe('Too many exports. Try again in a few minutes.');
    expect(schoolError({ code: 'functions/resource-exhausted', message: 'Too many exports.' }, 'Custom fallback')).toBe('Too many exports.');
  });
  it('uses the generic text for anything else', () => {
    expect(schoolError(new Error('boom'))).toBe(GENERIC);
    expect(schoolError({ code: 'functions/internal', message: 'internal' })).toBe(GENERIC);
    expect(schoolError(undefined)).toBe(GENERIC);
  });
  it('uses the caller’s fallback instead of the generic text when given', () => {
    expect(schoolError(new Error('boom'), 'Could not prepare the SF2. Try again.')).toBe('Could not prepare the SF2. Try again.');
    expect(schoolError({ code: 'functions/internal', message: 'internal' }, 'Could not prepare the SF2. Try again.')).toBe('Could not prepare the SF2. Try again.');
    expect(schoolError({ code: 'functions/permission-denied' }, 'Custom fallback')).toBe('Custom fallback');
  });
});

describe('callableMessage', () => {
  it('strips the status the SDK appends to callable errors', () => {
    expect(callableMessage({ message: 'That advisory slip could not be used. [404]' })).toBe('That advisory slip could not be used.');
    expect(schoolError({ code: 'functions/not-found', message: 'Not allowed. [403]' })).toBe('Not allowed.');
  });
  it('leaves other messages alone and handles a missing message', () => {
    expect(callableMessage({ message: 'Plain message.' })).toBe('Plain message.');
    expect(callableMessage({ message: 'Grade [7] only' })).toBe('Grade [7] only');
    expect(callableMessage({})).toBe('');
    expect(callableMessage(undefined)).toBe('');
  });
  it('builds the adviser learner history path with encoded ids', () => {
    expect(learnerPath('SEC1', 'S1')).toBe('/school/learner/SEC1/S1');
    expect(learnerPath('a b', 'c/d')).toBe('/school/learner/a%20b/c%2Fd');
  });
});
