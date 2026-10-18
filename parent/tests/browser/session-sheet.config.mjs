import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renders SessionSheet + SessionRows and the History header pill with synthetic
// attendance. None of them import Firebase, so nothing needs stubbing.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5193, strictPort: true },
  // Scan only the preview page. Scanning index.html too needs jsqr, which a
  // worktree may lack, and a failed scan leaves on-demand dependency chunks mismatched.
  optimizeDeps: { entries: ['tests/browser/session-sheet-preview.html'] },
  cacheDir: 'node_modules/.vite-session-sheet-preview',
});
