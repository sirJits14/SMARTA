import { describe, expect, it } from 'vitest';
import { attendanceSections, roleRequestError, correctionError, inboxDestination, sessionAction, correctionTime } from './school.js';
import { portalView, notificationDestination } from './nav.js';
import { matchRoute } from './router.js';
describe('school access presentation', () => {
  const sections = [{ id: 'a', gradeLevel: 7 }, { id: 'b', gradeLevel: 8 }];
  it('routes School separately and preserves explicit school notices', () => {
    expect(matchRoute('/school').name).toBe('school');
    expect(portalView(matchRoute('/announcements', '?view=school'))).toBe('school');
    expect(portalView(matchRoute('/learner/a', '?view=school'))).toBe('family');
  });
  it('subject teachers have no learner roster; advisers and curriculum advisers have scoped rosters', () => {
    expect(attendanceSections({ sections, assignments: [{ role: 'subject_teacher', sectionId: 'a' }] })).toEqual([]);
    expect(attendanceSections({ sections, assignments: [{ role: 'adviser', sectionId: 'a' }] })).toEqual([sections[0]]);
    expect(attendanceSections({ sections, assignments: [{ role: 'curriculum_adviser', gradeLevel: 8 }] })).toEqual([sections[1]]);
    expect(attendanceSections({ sections, isAdmin: true })).toEqual(sections);
  });
  it('requires a supported role, known section and reason for session corrections', () => {
    expect(roleRequestError({ role: 'curriculum_adviser', sectionId: 'a' }, sections)).toBeTruthy();
    expect(roleRequestError({ role: 'adviser', sectionId: 'missing' }, sections)).toBeTruthy();
    expect(roleRequestError({ role: 'adviser', sectionId: 'a' }, sections)).toBe('');
    expect(correctionError({ session: 'am', reason: '  ' })).toBeTruthy();
    expect(correctionError({ session: 'pm', reason: 'Learner left before the session.' })).toBe('');
  });
  it('routes correction inbox entries to authenticated day/session details', () => {
    expect(inboxDestination({ type: 'attendance_correction', studentId: 'a b', date: '2026-10-17', session: 'pm' })).toBe('/learner/a%20b?date=2026-10-17&session=pm');
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
