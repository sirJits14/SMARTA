import { describe, expect, it } from 'vitest';
import { legacyAdviserRows, assignmentFromLegacy, DAY_MS, openedStatus, requestFlags, relativeAge, shortDate, coverageByGrade, filterAssignments, toCsv, assignmentCsvRows, coverageCsvRows, historyLine } from './schoolAssignments.js';

const adviser = { guardianUid: 't1', email: 't1@deped.gov.ph', name: 'Ana Cruz', learnerCount: 38, suggestedSectionId: 'MABINI' };

describe('legacy adviser rows', () => {
  it('marks teachers who already hold an adviser assignment', () => {
    expect(legacyAdviserRows([adviser, { ...adviser, guardianUid: 't2' }], [{ uid: 't1', role: 'adviser' }, { uid: 't2', role: 'subject_teacher' }]))
      .toEqual([{ ...adviser, assigned: true }, { ...adviser, guardianUid: 't2', assigned: false }]);
  });
  it('tolerates a missing list', () => {
    expect(legacyAdviserRows(undefined, undefined)).toEqual([]);
  });
  it('prefills the assignment form with the suggested section', () => {
    expect(assignmentFromLegacy(adviser)).toEqual({ email: 't1@deped.gov.ph', role: 'adviser', sectionId: 'MABINI', gradeLevel: '' });
    expect(assignmentFromLegacy({ ...adviser, suggestedSectionId: null }).sectionId).toBe('');
  });
});

const now = Date.parse('2026-10-19T08:00:00+08:00');
const sections = [{ id: 'A', name: 'Rizal', gradeLevel: 7 }, { id: 'B', name: 'Bonifacio', gradeLevel: 7 }, { id: 'C', name: 'Mabini', gradeLevel: 8 }];
const ana = { uid: 'u1', displayName: 'Ana Cruz', email: 'ana@deped.gov.ph', role: 'adviser', sectionId: 'A', gradeLevel: 7, assignedAt: now - DAY_MS, assignedBy: 'admin@school.test', source: 'direct', lastSchoolOpenAt: now };
const ben = { uid: 'u2', displayName: 'Ben Dy', email: 'ben@gmail.com', role: 'subject_teacher', sectionId: 'A', gradeLevel: 7, assignedAt: now, lastSchoolOpenAt: now - DAY_MS };
const cara = { uid: 'u3', displayName: 'Cara Uy', email: 'cara@deped.gov.ph', role: 'curriculum_adviser', gradeLevel: 8, assignedAt: null, lastSchoolOpenAt: null };
const dan = { id: 'r1', role: 'adviser', sectionId: 'B', displayName: 'Dan' };

describe('school access tracking', () => {
  it('counts a teacher as opened only after their assignment', () => {
    expect(openedStatus(ana)).toEqual({ opened: true, at: now });
    expect(openedStatus(ben)).toEqual({ opened: false, at: null });
    expect(openedStatus(cara)).toEqual({ opened: false, at: null });
    expect(openedStatus({ assignedAt: null, lastSchoolOpenAt: now })).toEqual({ opened: true, at: now });
  });
  it('flags conflicts, personal emails and stale requests', () => {
    const request = { email: 'x@gmail.com', createdAt: now - 3 * DAY_MS, conflict: { displayName: 'Ana Cruz' } };
    expect(requestFlags(request, now).map(f => f.label)).toEqual(['Section has an adviser (Ana Cruz)', 'Non-DepEd email', 'Waiting 3+ days']);
    expect(requestFlags({ email: 'y@deped.gov.ph', createdAt: now }, now)).toEqual([]);
  });
  it('describes ages briefly', () => {
    expect(relativeAge(now - 20000, now)).toBe('just now');
    expect(relativeAge(now - 5 * 60000, now)).toBe('5m ago');
    expect(relativeAge(now - 2 * 3600000, now)).toBe('2h ago');
    expect(relativeAge(now - 3 * DAY_MS, now)).toBe('3d ago');
    expect(relativeAge(null, now)).toBe('');
  });
  it('groups coverage by grade with gaps, subject teachers and pending adviser requests', () => {
    const [g7, g8] = coverageByGrade(sections, [ana, ben, cara], [dan]);
    expect(g7).toMatchObject({ grade: 7, covered: 1, curriculumAdvisers: [] });
    expect(g7.rows.map(r => [r.section.id, r.adviser?.uid ?? null, r.subjectTeachers, r.pending?.id ?? null])).toEqual([['A', 'u1', 1, null], ['B', null, 0, 'r1']]);
    expect(g8).toMatchObject({ grade: 8, covered: 0, curriculumAdvisers: [cara] });
  });
  it('filters and sorts assignments', () => {
    const all = [cara, ben, ana];
    expect(filterAssignments(all, {}, sections).map(a => a.uid)).toEqual(['u1', 'u2', 'u3']);
    expect(filterAssignments(all, { text: 'rizal' }, sections).map(a => a.uid)).toEqual(['u1', 'u2']);
    expect(filterAssignments(all, { grade: '8' }, sections).map(a => a.uid)).toEqual(['u3']);
    expect(filterAssignments(all, { role: 'subject_teacher' }, sections).map(a => a.uid)).toEqual(['u2']);
    expect(filterAssignments(all, { status: 'not_opened' }, sections).map(a => a.uid)).toEqual(['u2', 'u3']);
  });
  it('writes Excel-safe CSV', () => {
    expect(toCsv([['Name', 'Note'], ['Ana "A" Cruz', '=SUM(A1)']])).toBe('﻿"Name","Note"\r\n"Ana ""A"" Cruz","\'=SUM(A1)"');
  });
  it('exports assignments and coverage rows', () => {
    const rows = assignmentCsvRows([ana], sections);
    expect(rows[0]).toEqual(['Name', 'Email', 'Responsibility', 'Grade', 'Section', 'Assigned on', 'Assigned by', 'Source', 'Status']);
    expect(rows[1]).toEqual(['Ana Cruz', 'ana@deped.gov.ph', 'Adviser', 7, 'Rizal', shortDate(now - DAY_MS), 'admin@school.test', 'direct', 'Opened']);
    const coverage = coverageCsvRows(coverageByGrade(sections, [ana, ben], [dan]));
    expect(coverage[0]).toEqual(['Grade', 'Section', 'Adviser', 'Adviser email', 'Opened', 'Subject teachers', 'Pending request']);
    expect(coverage.slice(1, 3)).toEqual([[7, 'Rizal', 'Ana Cruz', 'ana@deped.gov.ph', 'Yes', 1, ''], [7, 'Bonifacio', '', '', '', 0, 'Dan']]);
  });
  it('turns audit rows into readable history', () => {
    const at = { toDate: () => new Date(now) };
    expect(historyLine({ action: 'school.requestApproved', actorUid: 'admin@school.test', targetId: 'u1', at,
      details: { role: 'adviser', sectionId: 'A', teacherName: 'Ana Cruz', reason: 'Approved' } }, sections))
      .toMatchObject({ text: 'admin@school.test approved Ana Cruz · Adviser · Grade 7 · Rizal', reason: '' });
    expect(historyLine({ action: 'school.revoked', actorUid: 'admin@school.test', targetId: 'u2', at,
      details: { role: 'subject_teacher', sectionId: 'Z', reason: 'Left school' } }, sections))
      .toMatchObject({ text: 'admin@school.test revoked u2 · Subject Teacher · Section Z', reason: 'Left school' });
    expect(historyLine({ action: 'school.requested', actorUid: 'ana@deped.gov.ph', targetId: 'u1', at: null,
      details: { role: 'adviser', sectionId: 'A', teacherName: 'Ana Cruz' } }, sections))
      .toEqual({ when: '—', text: 'Ana Cruz requested Adviser · Grade 7 · Rizal', reason: '' });
    expect(historyLine({ action: 'school.replaced', actorUid: 'admin@school.test', targetId: 'u9', at: null,
      details: { role: 'adviser', sectionId: 'A', teacherName: 'Eve Tan', previousEmail: 'ana@deped.gov.ph', reason: 'Moved' } }, sections).text)
      .toBe('admin@school.test replaced ana@deped.gov.ph with Eve Tan · Adviser · Grade 7 · Rizal');
  });
});
