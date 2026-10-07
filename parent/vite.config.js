import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Shown in Settings > About: the build day (school time zone) and the commit.
function buildInfo() {
  let commit = 'dev';
  try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'; } catch {}
  return { date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), commit };
}

export default defineConfig({
  plugins: [react()],
  define: { __APP_BUILD__: JSON.stringify(buildInfo()) },
  server: { port: 5174 },
  build: { target: 'es2020', sourcemap: false },
  test: { environment: 'node', include: ['src/**/*.test.js'] },
});
