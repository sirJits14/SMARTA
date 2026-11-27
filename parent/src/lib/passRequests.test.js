import { describe, expect, it } from 'vitest';
import S from '../strings.js';
import { blockerText, createOneAtATime, passItems, passListFor, prunePicks, sendOutcome, skipText } from './passRequests.js';

const learner = (studentId, extra = {}) => ({ studentId, displayName: `NAME ${studentId}`, hasPhoto: true, hasActivePass: false, blocker: null, ...extra });

describe('blockerText', () => {
  it('names every blocker the server sends', () => {
    expect(blockerText('official-printed')).toBe('Has an official ID');
    expect(blockerText('already-requested')).toBe('Request already waiting');
    expect(blockerText('no-lrn')).toBe('No LRN on record');
    expect(blockerText('inactive')).toBe('Not active');
    expect(blockerText('not-in-class')).toBe('Not in this class');
  });
  it('is empty without a blocker and never empty for one it does not know', () => {
    expect(blockerText(null)).toBe('');
    expect(blockerText(undefined)).toBe('');
    expect(blockerText('something-new')).toBe(S.passBlockedOther);
    expect(blockerText('toString')).toBe(S.passBlockedOther);
  });
});

describe('skipText', () => {
  it('uses the blocker wording, and says when the Lost or Damaged choice no longer fits', () => {
    expect(skipText('already-requested')).toBe(S.passBlockedRequested);
    expect(skipText('reason')).toBe(S.passRequestChoiceChanged);
  });
});

describe('passItems', () => {
  const learners = [learner('A'), learner('B', { hasActivePass: true }), learner('C', { blocker: 'official-printed' }), learner('D')];
  it('sends reason new for a picked learner without a pass', () => {
    expect(passItems(learners, { A: '' })).toEqual([{ studentId: 'A', reason: 'new' }]);
  });
  it('leaves out a learner with a pass until Lost or Damaged is chosen', () => {
    expect(passItems(learners, { B: '' })).toEqual([]);
    expect(passItems(learners, { B: 'new' })).toEqual([]);
    expect(passItems(learners, { B: 'lost' })).toEqual([{ studentId: 'B', reason: 'lost' }]);
    expect(passItems(learners, { B: 'damaged' })).toEqual([{ studentId: 'B', reason: 'damaged' }]);
  });
  it('ignores an old Lost or Damaged choice once there is no pass to replace', () => {
    expect(passItems(learners, { A: 'lost' })).toEqual([{ studentId: 'A', reason: 'new' }]);
  });
  it('never includes a blocked learner or one who is not in the list', () => {
    expect(passItems(learners, { C: '', Z: '' })).toEqual([]);
    expect(passItems(null, { A: '' })).toEqual([]);
  });
  it('follows the class list order and stops at 40', () => {
    const many = Array.from({ length: 45 }, (_, i) => learner(`S${i}`));
    const picks = Object.fromEntries([...many].reverse().map((l) => [l.studentId, '']));
    const items = passItems(many, picks);
    expect(items).toHaveLength(40);
    expect(items[0].studentId).toBe('S0');
  });
});

describe('prunePicks', () => {
  it('drops learners who became blocked or left the list', () => {
    expect(prunePicks({ A: '', B: 'lost', Z: '' }, [learner('A'), learner('B', { hasActivePass: true, blocker: 'already-requested' })])).toEqual({ A: '' });
  });
  it('forgets a Lost or Damaged choice when the pass is gone, so it cannot come back by itself', () => {
    expect(prunePicks({ A: 'lost' }, [learner('A')])).toEqual({ A: '' });
  });
  it('returns the same object when nothing changed', () => {
    const picks = { A: '', B: 'damaged' };
    expect(prunePicks(picks, [learner('A'), learner('B', { hasActivePass: true })])).toBe(picks);
  });
});

describe('sendOutcome', () => {
  const learners = [learner('A'), learner('B')];
  it('reports a clean send', () => {
    expect(sendOutcome({ created: [{ requestId: 'r1', studentId: 'A' }], skipped: [] }, learners)).toEqual({ sent: true, skipped: [] });
  });
  it('names each skipped learner and why', () => {
    expect(sendOutcome({ created: [], skipped: [{ studentId: 'B', reason: 'reason' }, { studentId: 'A', reason: 'no-lrn' }] }, learners)).toEqual({
      sent: false,
      skipped: [{ studentId: 'B', name: 'NAME B', text: S.passRequestChoiceChanged }, { studentId: 'A', name: 'NAME A', text: S.passBlockedNoLrn }],
    });
  });
});

describe('passListFor', () => {
  const state = { sectionId: 'sec-1', learners: [learner('A')], requests: [], loading: false, error: '' };
  it('hands out the list only for the class it was loaded for', () => {
    expect(passListFor(state, 'sec-1', true)).toEqual({ learners: state.learners, requests: [], loading: false, error: '' });
    expect(passListFor(state, 'sec-2', true)).toEqual({ learners: null, requests: null, loading: true, error: '' });
  });
  it('hands out nothing while disabled', () => {
    expect(passListFor(state, 'sec-1', false)).toEqual({ learners: null, requests: null, loading: false, error: '' });
  });
});

describe('createOneAtATime', () => {
  it('ignores a second attempt while one is running, including while the list refreshes', async () => {
    const once = createOneAtATime();
    let finishWork; let finishRefresh; let calls = 0; let refreshing;
    const refreshStarted = new Promise((resolve) => { refreshing = resolve; });
    const first = once(() => { calls += 1; return new Promise((resolve) => { finishWork = resolve; }); },
      () => { refreshing(); return new Promise((resolve) => { finishRefresh = resolve; }); });
    expect(await once(async () => { calls += 1; }, async () => {})).toBeNull();
    finishWork('done');
    await refreshStarted;
    expect(await once(async () => { calls += 1; }, async () => {})).toBeNull();
    finishRefresh();
    expect(await first).toEqual({ value: 'done' });
    expect(calls).toBe(1);
    expect(await once(async () => 'again', async () => {})).toEqual({ value: 'again' });
  });
  it('refreshes after a failure too, and stays usable', async () => {
    const once = createOneAtATime();
    const failure = new Error('full');
    let refreshed = 0;
    expect(await once(async () => { throw failure; }, async () => { refreshed += 1; })).toEqual({ error: failure });
    expect(refreshed).toBe(1);
    expect(await once(async () => 1, async () => { throw new Error('offline'); })).toEqual({ value: 1 });
    expect(await once(async () => 2, async () => {})).toEqual({ value: 2 });
  });
});
