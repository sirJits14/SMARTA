import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
    const required = [
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_STORAGE_BUCKET',
      'VITE_FIREBASE_MESSAGING_SENDER_ID',
      'VITE_FIREBASE_APP_ID',
    ];
    const missing = required.filter(key => !env[key]?.trim());
    if (missing.length) {
      throw new Error(`Missing Firebase build configuration: ${missing.join(', ')}. Configure .env before building or deploying.`);
    }
  }

  return {
    plugins: [react()],
    test: {
      environment: 'node',
      include: ['src/**/*.test.js', 'shared/**/*.test.js'],
      exclude: ['node_modules/**', 'parent/**', 'functions/**', 'tests/**', '.claude/**', 'dist/**'],
    },
  };
});
