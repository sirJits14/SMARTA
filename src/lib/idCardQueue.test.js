import { describe, expect, it } from 'vitest';
import {
  isIdCardPrinted, sectionShortLabel, sortIdCardBatch, buildIdCardQueue,
  listQueueEntries, groupBySection, cardsLabel,
} from './idCardQueue.js';

const SY = '2026-2027';
const rizal = { id: 'rizal', gradeLevel: 7, name: 'Rizal', schoolYear: SY };
const bonifacio = { id: 'bonifacio', gradeLevel: 7, name: 'Bonifacio', schoolYear: SY };
const acacia = { id: 'acacia', gradeLevel: '11', name: 'Acacia', strand: 'STEM', schoolYear: SY };

const learner = (id, lastName, sex, extra = {}) =>
  ({ id, lastName, firstName: 'Ana', sex, lrn: `LRN-${id}`, ...extra });
const printed = (s, lrn = s.lrn) =>
  ({ ...s, idCard: { printedAt: { seconds: 1 }, printedBy: 'admin@bnhs', lrn } });
const enroll = (student, section, extra = {}) => ({
  id: `${student.id}_${SY}`, studentId: student.id, sectionId: section.id,
  schoolYear: SY, status: 'enrolled', ...extra,
});
const ids = (entries) => entries.map((e) => e.student.id);

describe('isIdCardPrinted', () => {
  it('is false for a learner never printed', () => {
    expect(isIdCardPrinted(learner('a', 'Cruz', 'M'))).toBe(false);
  });
  it('is true when printed for the current LRN', () => {
    expect(isIdCardPrinted(printed(learner('a', 'Cruz', 'M')))).toBe(true);
  });
  it('is false when the LRN changed after printing', () => {
    expect(isIdCardPrinted(printed(learner('a', 'Cruz', 'M'), 'OLD-LRN'))).toBe(false);
  });
  it('is false when idCard has no printedAt', () => {
    expect(isIdCardPrinted({ ...learner('a', 'Cruz', 'M'), idCard: { lrn: 'LRN-a' } })).toBe(false);
  });
});

describe('sectionShortLabel', () => {
  it('joins grade, name and strand', () => {
    expect(sectionShortLabel(rizal)).toBe('7 · Rizal');
    expect(sectionShortLabel(acacia)).toBe('11 · Acacia · STEM');
    expect(sectionShortLabel(null)).toBe('');
  });
});

describe('sortIdCardBatch', () => {
  it('orders by grade, section name, then males before females by name', () => {
    const entries = [
      { student: learner('dela', 'Dela', 'F'), section: acacia },
      { student: learner('ana', 'Abad', 'F'), section: rizal },
      { student: learner('ben', 'Bautista', 'M'), section: rizal },
      { student: learner('cruz', 'Cruz', 'M'), section: bonifacio },
      { student: learner('aba', 'Aba', 'F'), section: bonifacio },
    ];
    expect(ids(sortIdCardBatch(entries))).toEqual(['cruz', 'aba', 'ben', 'ana', 'dela']);
  });
  it('does not mutate its input', () => {
    const entries = [
      { student: learner('b', 'B', 'M'), section: rizal },
      { student: learner('a', 'A', 'M'), section: rizal },
    ];
    sortIdCardBatch(entries);
    expect(ids(entries)).toEqual(['b', 'a']);
  });
});

describe('buildIdCardQueue', () => {
  const ana = learner('ana', 'Abad', 'F');
  const ben = printed(learner('ben', 'Bautista', 'M'));
  const cruz = printed(learner('cruz', 'Cruz', 'M'), 'OLD-LRN');
  const dela = learner('dela', 'Dela', 'F');
  const eli = learner('eli', 'Eli', 'M');
  const fe = learner('fe', 'Fe', 'F');
  const gil = learner('gil', 'Gil', 'M', { lrn: '  ' });
  const hal = learner('hal', 'Hal', 'M');
  const result = buildIdCardQueue({
    students: [ana, ben, cruz, dela, eli, fe, gil, hal],
    sections: [rizal, bonifacio, acacia],
    schoolYear: SY,
    enrollments: [
      enroll(ana, rizal), enroll(ben, rizal), enroll(cruz, bonifacio), enroll(dela, acacia),
      enroll(eli, rizal, { status: 'dropped' }),
      enroll(fe, rizal, { schoolYear: '2025-2026' }),
      enroll(gil, rizal),
      enroll(hal, { id: 'deleted-section' }),
    ],
  });

  it('lists every enrolled learner with an LRN, in print order', () => {
    expect(ids(result.eligible)).toEqual(['cruz', 'ben', 'ana', 'dela']);
  });
  it('queues only learners not printed for their current LRN', () => {
    expect(ids(result.queue)).toEqual(['cruz', 'ana', 'dela']);
  });
  it('counts enrolled learners without an LRN', () => {
    expect(result.missingLrnCount).toBe(1);
  });
  it('pairs each learner with their own section', () => {
    expect(result.queue.map((e) => e.section.id)).toEqual(['bonifacio', 'rizal', 'acacia']);
  });

  it('adds hand-picked printed learners to the listed entries, in print order', () => {
    expect(ids(listQueueEntries(result.eligible, new Set(['ben'])))).toEqual(['cruz', 'ben', 'ana', 'dela']);
    expect(ids(listQueueEntries(result.eligible, new Set()))).toEqual(['cruz', 'ana', 'dela']);
  });
});

describe('groupBySection', () => {
  it('groups consecutive entries of the same section', () => {
    const entries = [
      { student: learner('a', 'A', 'M'), section: bonifacio },
      { student: learner('b', 'B', 'M'), section: rizal },
      { student: learner('c', 'C', 'F'), section: rizal },
    ];
    expect(groupBySection(entries).map((g) => [g.section.id, ids(g.entries)]))
      .toEqual([['bonifacio', ['a']], ['rizal', ['b', 'c']]]);
  });
});

describe('cardsLabel', () => {
  it('pluralises', () => {
    expect(cardsLabel(1)).toBe('1 card');
    expect(cardsLabel(0)).toBe('0 cards');
    expect(cardsLabel(81)).toBe('81 cards');
  });
});
