import { defineConfig } from 'vite';

// Scopes test discovery to this package. Without this, vitest falls back to
// the repo-root vite.config.js, whose include glob only matches src/** and
// shared/** — test/emulator/**/*.test.js would never be discovered.
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.js', 'test/**/*.test.js'] },
});
