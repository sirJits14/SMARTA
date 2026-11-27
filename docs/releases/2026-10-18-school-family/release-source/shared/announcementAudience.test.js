import { describe, it, expect } from 'vitest';
import { matchesAnnouncementAudience } from './announcementAudience.js';

const year = '2026-2027';
const sections = [{ id: 's7', gradeLevel: 7 }, { id: 's8', gradeLevel: 8 }];
const person = { schoolYear: year, sections, family: [{ gradeLevel: 7, sectionId: 's7' }], assignments: [{ role: 'adviser', schoolYear: year, gradeLevel: 7, sectionId: 's7' }] };
describe('announcement recipient matching', () => {
  it('keeps legacy posts in Family only', () => {
    expect(matchesAnnouncementAudience({ grades: [7] }, person, 'family')).toBe(true);
    expect(matchesAnnouncementAudience({ all: true }, person, 'school')).toBe(false);
  });
  it('requires role and grade and section on the same entitlement', () => {
    const audience = { roles: ['adviser'], grades: [7], sectionIds: ['s7'] };
    expect(matchesAnnouncementAudience(audience, person, 'school')).toBe(true);
    expect(matchesAnnouncementAudience(audience, person, 'family')).toBe(false);
    expect(matchesAnnouncementAudience({ ...audience, sectionIds: ['s8'] }, person, 'school')).toBe(false);
    expect(matchesAnnouncementAudience(audience, { ...person, assignments: [] }, 'school')).toBe(false);
    expect(matchesAnnouncementAudience(audience, { ...person, assignments: [{ ...person.assignments[0], schoolYear: 'old' }] }, 'school')).toBe(false);
  });
  it('matches curriculum grade responsibility to selected sections without granting another grade', () => {
    const curriculum = { ...person, assignments: [{ role: 'curriculum_adviser', schoolYear: year, gradeLevel: 7 }] };
    expect(matchesAnnouncementAudience({ roles: ['curriculum_adviser'], all: true, sectionIds: ['s7'] }, curriculum, 'school')).toBe(true);
    expect(matchesAnnouncementAudience({ roles: ['curriculum_adviser'], all: true, sectionIds: ['s8'] }, curriculum, 'school')).toBe(false);
  });
  it('does not turn school roles into family rights', () => {
    expect(matchesAnnouncementAudience({ roles: ['family'], all: true }, { ...person, family: [] }, 'family')).toBe(false);
  });
});
