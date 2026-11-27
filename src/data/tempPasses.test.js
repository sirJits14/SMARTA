import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => []);
vi.mock('../firebase.js', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions, name, options) => async (data) => { sent.push([name, data, options]); return { data: { from: name } }; },
}));

import { issueTempPasses, revokeTempPass } from './tempPasses.js';

beforeEach(() => { sent.length = 0; });

describe('temporary pass calls', () => {
  it('issues passes for the chosen learners', async () => {
    await expect(issueTempPasses(['s1', 's2'])).resolves.toEqual({ from: 'issueTempPassFn' });
    // The server may take its full 120 s on 200 learners; the client default is 70 s.
    expect(sent).toEqual([['issueTempPassFn', { studentIds: ['s1', 's2'] }, { timeout: 125000 }]]);
  });
  it('revokes one learner’s pass', async () => {
    await expect(revokeTempPass('s1')).resolves.toEqual({ from: 'revokeTempPassFn' });
    expect(sent).toEqual([['revokeTempPassFn', { studentId: 's1' }, undefined]]);
  });
});
