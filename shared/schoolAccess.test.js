import { describe, it, expect } from 'vitest';
import { canReviewSection, canCorrectSession, canApproveRoleRequest, isFamilyLink, assignmentKey } from './schoolAccess.js';

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
  it('allows only administrators to approve role requests, never self approval', () => {
    const request = { uid: 'teacher', email: 'teacher@deped.gov.ph', emailVerified: true, role: 'adviser', gradeLevel: 7, schoolYear: year, status: 'pending' };
    const admin = { uid: 'actor', schoolYear: year, isAdmin: true, assignments: [] };
    expect(canApproveRoleRequest(admin, request)).toBe(true);
    expect(canApproveRoleRequest(admin, { ...request, email: 'teacher@gmail.com' })).toBe(true);
    for (const patch of [{ uid: 'actor' }, { schoolYear: '2025-2026' }, { status: 'approved' }]) {
      expect(canApproveRoleRequest(admin, { ...request, ...patch })).toBe(false);
    }
    // A DepEd requester inside the Curriculum Adviser's grade still needs an administrator.
    for (const role of ['curriculum_adviser', 'adviser', 'subject_teacher']) {
      expect(canApproveRoleRequest(actor(role), request)).toBe(false);
    }
  });
  it('keeps legacy adviser links outside family authorization', () => {
    expect(isFamilyLink({ status: 'active', relationship: 'Mother' })).toBe(true);
    expect(isFamilyLink({ status: 'active', relationship: 'Adviser' })).toBe(false);
    expect(isFamilyLink({ status: 'active', slot: 'adviser' })).toBe(false);
    expect(isFamilyLink({ status: 'revoked', relationship: 'Father' })).toBe(false);
  });
  it('has collision-free scope keys', () => {
    expect(assignmentKey({ role: 'adviser', schoolYear: year, sectionId: 'S7' })).not.toBe(assignmentKey({ role: 'subject_teacher', schoolYear: year, sectionId: 'S7' }));
  });
});

describe('SIMS coordinator grades', () => {
  const coordinator = { uid: 'c1', schoolYear: '2026-2027', isAdmin: false, assignments: [], simsGrades: [7, 8] };
  const g7 = { id: 'S7', gradeLevel: 7, schoolYear: '2026-2027' };
  const g9 = { id: 'S9', gradeLevel: 9, schoolYear: '2026-2027' };
  it('reviews and corrects earlier days within coordinator grades only', () => {
    expect(canReviewSection(coordinator, g7)).toBe(true);
    expect(canCorrectSession(coordinator, g7, '2026-09-20', '2026-09-21')).toBe(true);
    expect(canReviewSection(coordinator, g9)).toBe(false);
    expect(canCorrectSession(coordinator, g7, '2026-09-22', '2026-09-21')).toBe(false);
  });
  it('ignores coordinator grades from another school year', () => {
    expect(canReviewSection(coordinator, { ...g7, schoolYear: '2025-2026' })).toBe(false);
  });
});
