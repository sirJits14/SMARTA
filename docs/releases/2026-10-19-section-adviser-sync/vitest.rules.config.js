import baseline from '../2026-10-18-school-family/vitest.rules.config.js';
export default { ...baseline, test: { ...baseline.test,
  hookTimeout: 30000, // Allow emulator startup and fixture seeding on slower hosts.
  include: [...baseline.test.include, 'tests/rules/sectionAdviser.test.js'],
} };
