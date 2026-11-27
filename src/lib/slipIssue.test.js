import { describe, it, expect } from 'vitest';
import { issuedSummary, slotsFreeText } from './slipIssue.js';

describe('issuedSummary', () => {
  it('counts issued slips', () => {
    expect(issuedSummary({ slips: [{}, {}], skipped: [] })).toBe('2 slips issued.');
    expect(issuedSummary({ slips: [{}], skipped: [] })).toBe('1 slip issued.');
  });
  it('names each skip reason once, in plain words', () => {
    const skipped = [{ reason: 'fully-linked' }, { reason: 'fully-linked' }, { reason: 'restricted' }, { reason: 'missing' }];
    expect(issuedSummary({ slips: [{}], skipped })).toBe('1 slip issued, 4 skipped (all slots already linked, restricted, learner record missing).');
  });
  it('shows an unknown reason as it is', () => {
    expect(issuedSummary({ slips: [], skipped: [{ reason: 'other' }] })).toBe('0 slips issued, 1 skipped (other).');
  });
});

describe('slotsFreeText', () => {
  it('says how many people can still link and that the code shows once', () => {
    expect(slotsFreeText({ guardian: 1, adviser: 1 })).toBe('New slip ready: 1 guardian / 1 adviser slots free. Print it now — the code is shown only once.');
    expect(slotsFreeText({ guardian: 0, adviser: 1 })).toBe('New slip ready: 0 guardian / 1 adviser slot free. Print it now — the code is shown only once.');
  });
});
