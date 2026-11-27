import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const fake = fileURLToPath(new URL('./class-preview-firebase.js', import.meta.url));
// Swap the app's firebase.js for the in-memory fake; nothing reaches Firebase.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), { name: 'class-preview-firebase', enforce: 'pre', resolveId(source, importer) {
    return source.endsWith('/firebase.js') && importer && !importer.includes('class-preview') ? fake : null;
  } }],
  server: { port: 5188, strictPort: true, fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
});
