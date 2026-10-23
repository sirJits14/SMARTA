import { describe, expect, it, vi } from 'vitest';

// Smoke test: LearnerHistory pulls in Firebase, so stub it and check the module still loads and exports a screen.
vi.mock('../../firebase.js', () => ({
  app: {},
  db: {},
  auth: { currentUser: null },
  callable: () => async () => ({ data: {} }),
}));

describe('LearnerHistory', () => {
  it('loads and exports a component', async () => {
    const mod = await import('./LearnerHistory.jsx');
    expect(typeof mod.default).toBe('function');
  });
});
