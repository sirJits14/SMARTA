import { describe, it, expect } from 'vitest';
import { canReviewSection, canCorrectSession, canApproveRoleRequest, isFamilyLink, isDepedEmail, assignmentKey } from './schoolAccess.js';

const year = '2026-2027';
const section = { id: 'S7', schoolYear: year, gradeLevel: 7 };
const actor = (role, extra = {}) => ({ uid: 'actor', schoolYear: year, assignments: [{ role, schoolYear: year, sectionId: 'S7', gradeLevel: 7 }], ...extra });
describe('school access boundaries', () => {
  it('subject teaching permits no tracking, while advisory and curriculum scopes are enforced', () => {
    expect(canReviewSection(actor('subject_teacher'), section)).toBe(false);
    expect(canReviewSection(actor('adviser'), section)).toBe(true);
    expect(canReviewSection(actor('adviser'), { ...section, id: 'S8' })).toBe(false);
    expect(canReviewSection(actor('curriculum_adviser'), { ...section, id: 'S8' })).toBe(true);
    expect(canReviewSection(actor('curriculum_adviser'), { ...section, gradeLevel: 8 })).toBe(false);
    expect(canReviewSection(actor('adviser', { schoolYear: '2027-2028' }), section)).toBe(false);
  });
  it('limits adviser corrections to today; grade reviewers can correct earlier dates, never future dates', () => {
    expect(canCorrectSession(actor('adviser'), section, '2026-10-16', '2026-10-17')).toBe(false);
    expect(canCorrectSession(actor('adviser'), section, '2026-10-17', '2026-10-17')).toBe(true);
    expect(canCorrectSession(actor('curriculum_adviser'), section, '2026-10-16', '2026-10-17')).toBe(true);
    expect(canCorrectSession(actor('curriculum_adviser'), section, '2026-10-18', '2026-10-17')).toBe(false);
  });
  it('allows only scoped curriculum approval of verified DepEd adviser requests, never self approval', () => {
    const request = { uid: 'teacher', email: 'teacher@deped.gov.ph', emailVerified: true, role: 'adviser', gradeLevel: 7, schoolYear: year, status: 'pending' };
    const reviewer = actor('curriculum_adviser');
    expect(canApproveRoleRequest(reviewer, request)).toBe(true);
    for (const patch of [{ uid: 'actor' }, { email: 'teacher@gmail.com' }, { email: 'a@deped.gov.ph.attacker.test' }, { emailVerified: false }, { gradeLevel: 8 }, { role: 'subject_teacher' }, { schoolYear: '2025-2026' }, { status: 'approved' }]) {
      expect(canApproveRoleRequest(reviewer, { ...request, ...patch })).toBe(false);
    }
    expect(canApproveRoleRequest({ ...reviewer, isAdmin: true }, { ...request, email: 'teacher@gmail.com' })).toBe(true);
  });
  it('keeps legacy adviser links outside family authorization', () => {
    expect(isFamilyLink({ status: 'active', relationship: 'Mother' })).toBe(true);
    expect(isFamilyLink({ status: 'active', relationship: 'Adviser' })).toBe(false);
    expect(isFamilyLink({ status: 'active', slot: 'adviser' })).toBe(false);
    expect(isFamilyLink({ status: 'revoked', relationship: 'Father' })).toBe(false);
  });
  it('normalizes verified domains only and has collision-free scope keys', () => {
    expect(isDepedEmail('A@DEPED.GOV.PH')).toBe(true);
    expect(isDepedEmail('deped.gov.ph@elsewhere.test')).toBe(false);
    expect(assignmentKey({ role: 'adviser', schoolYear: year, sectionId: 'S7' })).not.toBe(assignmentKey({ role: 'subject_teacher', schoolYear: year, sectionId: 'S7' }));
  });
});
