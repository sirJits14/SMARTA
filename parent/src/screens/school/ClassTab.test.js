import { describe, expect, it, vi } from 'vitest';

// Smoke test: ClassTab pulls in Firebase, so stub it and check the module still loads and exports a screen.
vi.mock('../../firebase.js', () => ({
  app: {},
  db: {},
  auth: { currentUser: null },
  callable: () => async () => ({ data: {} }),
}));

describe('ClassTab', () => {
  it('loads and exports a component', async () => {
    const mod = await import('./ClassTab.jsx');
    expect(typeof mod.default).toBe('function');
  });
});
