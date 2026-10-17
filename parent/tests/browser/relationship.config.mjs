import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renders RelationshipRow and RelationshipSheet with synthetic links. Neither
// component imports Firebase, so nothing needs stubbing.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5192, strictPort: true },
  cacheDir: 'node_modules/.vite-relationship-preview',
});
