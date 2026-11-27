import { readFileSync } from 'node:fs';
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

  // Vite splits CSS per route chunk, and LearnerHistory is its own lazy route. Its remove link, chip,
  // inline error and Remove sheet are styled by ClassTab.css, so without its own import a reload, a PWA
  // cold start or a deep link to a learner's history would render them unstyled.
  it('imports the stylesheet its Class tab controls depend on', () => {
    const source = readFileSync(new URL('./LearnerHistory.jsx', import.meta.url), 'utf8');
    expect(source).toMatch(/^import\s+['"]\.\/ClassTab\.css['"];?\s*$/m);
  });
});
