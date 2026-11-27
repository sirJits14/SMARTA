import { describe, expect, it } from 'vitest';
import {
  approveEffect, badgeCountText, classText, decidableCount, decisionNotice, detailRows, existingFlag, keepsDetailsText, kindLabel, orderWaiting, outcomeText, personText, placeText, removalText,
  waitingCutNote, waitingTabLabel, whenText,
} from './learnerRequests.js';

const add = {
  id: 'a', kind: 'add', status: 'pending', gradeLevel: 7, sectionName: 'Rizal', displayName: 'Juan Santos Dela Cruz Jr', enrollType: 'transferee', decidable: true, existing: null,
  student: { lrn: '123456789012', lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos', extName: 'Jr', sex: 'M', birthdate: '2012-05-01', address: '123 Rizal St.', guardianName: 'Maria', guardianRelationship: 'Mother', guardianContact: '', contactNumber: '' },
};
const remove = (reasonCode) => ({ id: 'r', kind: 'remove', status: 'pending', gradeLevel: 7, sectionName: 'Rizal', displayName: 'Ana B. Cruz', reasonCode, note: 'Stopped attending', decidable: true });

describe('request wording', () => {
  it('labels the kind and the class', () => {
    expect(kindLabel(add)).toBe('Add');
    expect(kindLabel(remove('dropped_out'))).toBe('Remove');
    expect(classText(add)).toBe('Grade 7 · Rizal');
  });
  it('says what approving a new learner does', () => {
    expect(approveEffect(add)).toBe('Adds JUAN SANTOS DELA CRUZ JR to Grade 7 · Rizal as Transferee.');
  });
  it('says what approving each removal does', () => {
    expect(approveEffect(remove('transferred_out'))).toBe('Marks ANA B. CRUZ as transferred and ends the enrollment.');
    expect(approveEffect(remove('dropped_out'))).toBe('Marks ANA B. CRUZ as dropped and ends the enrollment.');
    expect(approveEffect(remove('moved_section'))).toBe('Ends the enrollment of ANA B. CRUZ. They stay Active and show as Unassigned.');
    expect(removalText(remove('dropped_out'))).toBe('Dropped out · Stopped attending');
  });
  it('lists only the details the adviser filled in', () => {
    expect(detailRows(add)).toEqual([
      ['Name', 'DELA CRUZ, JUAN S. JR'], ['LRN', '123456789012'], ['Sex', 'Male'], ['Birthdate', '2012-05-01'], ['Enrollment type', 'Transferee'],
      ['Address', '123 Rizal St.'], ['Guardian', 'Maria'], ['Relationship', 'Mother'],
    ]);
  });
});

describe('an LRN that is already in SIMS', () => {
  const existing = (over) => ({ ...add, existing: { exists: true, needsAdmin: false, displayName: 'Ben Dy', learnerStatus: 'active', currentGrade: 7, currentSection: 'Mabini', ...over } });
  it('has no flag for a new LRN', () => {
    expect(existingFlag(add)).toBe('');
  });
  it('names a learner in another section and says approving moves them', () => {
    expect(existingFlag(existing({}))).toBe('Already in SIMS: BEN DY, currently Grade 7 · Mabini. Approving moves them here.');
    expect(approveEffect(existing({}))).toBe('');
  });
  it('says where an Unassigned, Dropped or Transferred learner stands, and that approving enrolls them', () => {
    expect(existingFlag(existing({ currentGrade: null, currentSection: '' }))).toBe('Already in SIMS: BEN DY, currently Unassigned. Approving enrolls them here.');
    expect(placeText({ currentGrade: null, learnerStatus: 'dropped' })).toBe('Dropped');
    expect(placeText({ currentGrade: null, learnerStatus: 'transferred' })).toBe('Transferred');
  });
  it('hides the learner from approvers who may not see them', () => {
    expect(existingFlag({ ...add, existing: { exists: true, needsAdmin: true } })).toBe('Needs an administrator');
    expect(existingFlag({ ...add, existing: { exists: true, ambiguous: true, needsAdmin: false } })).toBe('This LRN matches more than one learner. Fix the records first.');
  });
  it('says approving will not work when the learner is already in this class', () => {
    expect(existingFlag(existing({ enrolledHere: true, currentSection: 'Rizal' }))).toBe('Already in SIMS: BEN DY, already in this class. Approving will not work; reject this request.');
  });
  it('lets needing an administrator or a duplicate LRN win over already being in this class', () => {
    expect(existingFlag(existing({ enrolledHere: true, needsAdmin: true }))).toBe('Needs an administrator');
    expect(existingFlag(existing({ enrolledHere: true, ambiguous: true }))).toBe('This LRN matches more than one learner. Fix the records first.');
  });
  it('says SIMS keeps its own details only when approving can go ahead for a learner already in SIMS', () => {
    const kept = 'SIMS keeps the details it already has for this learner.';
    expect(keepsDetailsText(existing({}))).toBe(kept);
    expect(keepsDetailsText(existing({ currentGrade: null, currentSection: '' }))).toBe(kept);
    expect(keepsDetailsText(add)).toBe('');
    expect(keepsDetailsText(existing({ needsAdmin: true }))).toBe('');
    expect(keepsDetailsText(existing({ ambiguous: true }))).toBe('');
    expect(keepsDetailsText(existing({ enrolledHere: true }))).toBe('');
    expect(keepsDetailsText(remove('dropped_out'))).toBe('');
  });
});

describe('people in capitals, emails as written', () => {
  it('capitalises a name', () => {
    expect(personText('Tina Teacher')).toBe('TINA TEACHER');
  });
  it('leaves an email address as written', () => {
    expect(personText('teacher@deped.gov.ph')).toBe('teacher@deped.gov.ph');
    expect(personText('Teacher.One@DepEd.gov.ph')).toBe('Teacher.One@DepEd.gov.ph');
  });
  it('gives nothing for a missing name', () => {
    expect(personText('')).toBe('');
    expect(personText(null)).toBe('');
    expect(personText(undefined)).toBe('');
  });
});

describe('lists', () => {
  it('puts requests the person can decide before the ones that need an administrator', () => {
    const rows = [{ id: 'x', decidable: false }, { id: 'y', decidable: true }, { id: 'z', decidable: false }, { id: 'w', decidable: true }];
    expect(orderWaiting(rows).map((r) => r.id)).toEqual(['y', 'w', 'x', 'z']);
    expect(decidableCount(rows)).toBe(2);
  });
  it('words a decision and its time in Manila', () => {
    expect(outcomeText({ status: 'approved', decidedByName: 'Ada Admin' })).toBe('Approved by ADA ADMIN');
    expect(outcomeText({ status: 'approved', decidedByName: 'ada@deped.gov.ph' })).toBe('Approved by ada@deped.gov.ph');
    expect(outcomeText({ status: 'rejected', decidedByName: '' })).toBe('Not approved by staff');
    // 20:00 UTC on Oct 21 is 04:00 on Oct 22 in Manila, so a dropped timeZone would show Oct 21.
    expect(whenText(Date.UTC(2026, 9, 21, 20, 0))).toContain('Oct 22, 2026');
    expect(whenText(null)).toBe('');
  });
});

describe('the notice after a decision', () => {
  const tail = ' The adviser gets an inbox note.';
  it('words each approval from what the server did', () => {
    expect(decisionNotice(add, { ok: true, mode: 'new' })).toBe(`Added JUAN SANTOS DELA CRUZ JR to Grade 7 · Rizal.${tail}`);
    expect(decisionNotice(add, { ok: true, mode: 'moved' })).toBe(`Moved JUAN SANTOS DELA CRUZ JR to Grade 7 · Rizal.${tail}`);
    expect(decisionNotice(add, { ok: true, mode: 'enrolled' })).toBe(`Enrolled JUAN SANTOS DELA CRUZ JR in Grade 7 · Rizal.${tail}`);
    expect(decisionNotice(remove('dropped_out'), { ok: true, mode: 'removed' })).toBe(`Removed ANA B. CRUZ from Grade 7 · Rizal.${tail}`);
  });
  it('follows the server, not the card: an Add that moved a learner says Moved', () => {
    expect(decisionNotice(add, { ok: true, mode: 'moved' })).toMatch(/^Moved /);
  });
  it('words a rejection without a name', () => {
    expect(decisionNotice(add, { ok: true, mode: 'rejected' })).toBe('Rejected. The adviser sees your reason.');
    expect(decisionNotice(remove('moved_section'), { ok: true, mode: 'rejected' })).toBe('Rejected. The adviser sees your reason.');
  });
  it('falls back to a plain approval for an unknown or missing mode', () => {
    const plain = `Approved JUAN SANTOS DELA CRUZ JR.${tail}`;
    expect(decisionNotice(add, { ok: true, mode: 'something-new' })).toBe(plain);
    expect(decisionNotice(add, { ok: true })).toBe(plain);
    expect(decisionNotice(add, {})).toBe(plain);
    expect(decisionNotice(add, undefined)).toBe(plain);
    expect(decisionNotice(add, null)).toBe(plain);
  });
});

describe('the sidebar badge text', () => {
  it('shows the number up to 99 and 99+ beyond, so it fits the narrow rail', () => {
    expect(badgeCountText(0, false)).toBe('0');
    expect(badgeCountText(1, false)).toBe('1');
    expect(badgeCountText(99, false)).toBe('99');
    expect(badgeCountText(100, false)).toBe('99+');
    expect(badgeCountText(206, false)).toBe('99+');
  });
  it('reads 99+ whenever the server cut its count, even for a small number', () => {
    expect(badgeCountText(200, true)).toBe('99+');
    expect(badgeCountText(5, true)).toBe('99+');
    expect(badgeCountText(1, undefined)).toBe('1');
  });
});

describe('the Waiting tab label', () => {
  it('shows the count the person can decide, and nothing when there is none', () => {
    expect(waitingTabLabel(9, false)).toBe('Waiting (9)');
    expect(waitingTabLabel(200, false)).toBe('Waiting (200)');
    expect(waitingTabLabel(0, false)).toBe('Waiting');
    expect(waitingTabLabel(0, undefined)).toBe('Waiting');
  });
  it('adds a plus when the list was cut at its limit', () => {
    expect(waitingTabLabel(200, true)).toBe('Waiting (200+)');
    expect(waitingTabLabel(150, true)).toBe('Waiting (150+)');
    expect(waitingTabLabel(0, true)).toBe('Waiting');
  });
});

describe('the note under a cut Waiting list', () => {
  it('shows only when the server says more than 200 were pending', () => {
    expect(waitingCutNote({ requests: [], truncated: true })).toBe('Showing the 200 oldest requests. Decide some to see the rest.');
    expect(waitingCutNote({ requests: [], truncated: false })).toBe('');
    expect(waitingCutNote({ requests: [] })).toBe('');
    expect(waitingCutNote(null)).toBe('');
  });
});
